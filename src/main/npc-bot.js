class NpcBot {
  constructor(wc, idx) {
    this.wc = wc;
    this.idx = idx;
    this.isRunning = false;
    this.timeoutId = null;
    this.battleCount = 0;
    this.totalBattles = 5;
    this.npcNumber = 1;
    this.cooldownMs = 120000;
    this.defeatCooldownSec = 300;
    this.buttonDelayMs = 1000;
    this.clickPattern = [3, 2, 1];
    this.smartMode = true;
    this.healPosition = 3;
    this.skillPriority = [2, 1];
    this.processedLockIds = new Set();
    this.autoClimb = false;
    this.targetMaxNpc = 60;
    this.climbWinsNeeded = 0;
    this.climbWinsDone = 0;
    this.username = '';
    this.stats = {
      wins: 0,
      losses: 0,
      coins: 0,
      exp: 0,
      items: [],
      itemCounts: {},
      targetNpc: null,
      lastBattle: null,
    };
  }

  ts() {
    return new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  log(...args) {
    const msg = `[${this.ts()}] [Bot ${this.idx}] ${args.join(' ')}`;
    console.log(msg);
  }

  async exec(code) {
    try {
      return await this.wc.executeJavaScript(code);
    } catch (e) {
      this.log('Exec error:', e.message);
      return null;
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  handleLock(lockInfo) {
    this.log(`🔒 NPC ${this.npcNumber} bị khóa! → Chuyển NPC ${lockInfo.requiredNpc}, cần thắng ${lockInfo.winsLeft} lần.`);
    this.npcNumber = lockInfo.requiredNpc;
    this.climbWinsNeeded = lockInfo.winsLeft;
    this.climbWinsDone = 0;
    if (lockInfo.lockMsgId) this.processedLockIds.add(lockInfo.lockMsgId);
  }

  updateConfig(config) {
    if (config.npcNumber !== undefined) this.npcNumber = config.npcNumber;
    if (config.totalBattles !== undefined) this.totalBattles = config.totalBattles;
    if (config.cooldownMs !== undefined) this.cooldownMs = config.cooldownMs;
    if (config.buttonDelayMs !== undefined) this.buttonDelayMs = config.buttonDelayMs;
    if (config.clickPattern !== undefined) this.clickPattern = config.clickPattern;
    if (config.autoClimb !== undefined) this.autoClimb = config.autoClimb;
    if (config.targetMaxNpc !== undefined) this.targetMaxNpc = config.targetMaxNpc;
    if (config.username !== undefined) this.username = config.username;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.runId = Date.now();
    this.battleCount = 0;
    this.climbWinsNeeded = 0;
    this.climbWinsDone = 0;
    this.processedLockIds = new Set();
    this.log('Bot started');
    this.log('=== SMART MODE: Đọc turn real-time ===');
    if (this.username) {
      this.log(`=== GROUP MODE: Lọc tin nhắn theo "${this.username}" ===`);
    }
    if (this.autoClimb) {
      this.log(`=== AUTO CLIMB MODE: NPC ${this.npcNumber} → NPC ${this.targetMaxNpc} ===`);
    }
    this.mainLoop(this.runId);
  }

  stop() {
    this.isRunning = false;
    this.runId = null;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.log('Bot stopped');
    this.printStats();
  }

  resetStats() {
    this.stats = { wins: 0, losses: 0, coins: 0, exp: 0, items: [], itemCounts: {}, targetNpc: null, lastBattle: null };
  }

  parseBattleRewards(text) {
    const rewards = [];
    this.log('[Rewards] Parsing: ' + text.substring(0, 200));

    const allLines = text.split('\n');
    let foundSummary = false;
    let lastCoins = 0;
    let lastExp = 0;

    for (const line of allLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Summary line: "+572    +253 XP" — two +N patterns, second ends with XP
      const summaryMatch = trimmed.match(/^\+(\d+)\s+\+(\d+)\s*XP/i);
      if (summaryMatch) {
        lastCoins = parseInt(summaryMatch[1]);
        lastExp = parseInt(summaryMatch[2]);
        this.stats.coins += lastCoins;
        this.stats.exp += lastExp;
        rewards.push(`+${lastCoins}🪙`, `+${lastExp}XP`);
        foundSummary = true;
        this.log(`[Rewards] Summary: +${lastCoins}🪙 +${lastExp}XP`);
        break;
      }
    }

    // Scan for item drops
    for (const line of allLines) {
      const trimmed = line.trim();
      const itemMatch = trimmed.match(/Rơi:\s*(.+?)(?:\s*(?:Thắng|Thua|✅|❌|💕|📖|Vợ|$))/i);
      if (itemMatch) {
        let item = itemMatch[1].trim();
        item = item.replace(/^[^\w]+/, '').replace(/[^\w!]+$/, '').trim();
        if (item && item.length > 1) {
          // Track unique items list
          if (!this.stats.items.includes(item)) {
            this.stats.items.push(item);
          }
          // Track item counts
          this.stats.itemCounts[item] = (this.stats.itemCounts[item] || 0) + 1;
          rewards.push(`Rơi: ${item}`);
        }
      }
    }

    if (!foundSummary) {
      this.log('[Rewards] No summary line found! Full text: ' + text);
    }

    // Store last battle info
    this.stats.lastBattle = {
      coins: lastCoins,
      exp: lastExp,
      items: rewards.filter(r => r.startsWith('Rơi:')).map(r => r.replace('Rơi: ', '')),
    };

    return rewards;
  }

  parseTargetNpc(text) {
    // "🏆 Quất thắng NPC 🌙 Hằng Nga Tiên Tử!" or "💀 Quất thua NPC 🔮 Bí Ẩn Chi Linh!"
    const winMatch = text.match(/thắng NPC\s+(.+?)!/);
    if (winMatch) return winMatch[1].trim();
    const lossMatch = text.match(/thua NPC\s+(.+?)!/);
    if (lossMatch) return lossMatch[1].trim();
    return null;
  }

  printStats() {
    this.log('\n=== 📊 THỐNG KÊ ===');
    this.log(`⚔️ Tổng trận: ${this.stats.wins + this.stats.losses}`);
    this.log(`✅ Thắng: ${this.stats.wins}`);
    this.log(`❌ Thua: ${this.stats.losses}`);
    this.log(`💰 Coins: +${this.stats.coins}🪙`);
    this.log(`✨ EXP: +${this.stats.exp}XP`);
    if (this.stats.items.length > 0) {
      this.log(`💎 Vật phẩm: ${this.stats.items.join(', ')}`);
    }
    if (this.stats.targetNpc) {
      this.log(`🎯 NPC đã đánh: ${this.stats.targetNpc}`);
    }
    this.log('====================\n');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      battleCount: this.battleCount,
      totalBattles: this.totalBattles,
      npcNumber: this.npcNumber,
      cooldownMs: this.cooldownMs,
      clickPattern: this.clickPattern,
      smartMode: this.smartMode,
      autoClimb: this.autoClimb,
      targetMaxNpc: this.targetMaxNpc,
      climbWinsNeeded: this.climbWinsNeeded,
      climbWinsDone: this.climbWinsDone,
      stats: { ...this.stats },
    };
  }

  async mainLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;

    if (!this.autoClimb && this.battleCount >= this.totalBattles) {
      this.log('=== COMPLETED ALL BATTLES ===');
      this.stop();
      return;
    }

    if (this.autoClimb && this.npcNumber > this.targetMaxNpc) {
      this.log(`=== AUTO CLIMB COMPLETE! Đã mở khóa đến NPC ${this.targetMaxNpc} ===`);
      this.stop();
      return;
    }

    const label = this.autoClimb
      ? `NPC ${this.npcNumber} (climb ${this.climbWinsDone}/${this.climbWinsNeeded > 0 ? this.climbWinsNeeded : '?'} wins)`
      : `Battle ${this.battleCount + 1}/${this.totalBattles}`;
    this.log(`\n=== ${label} ===`);

    if (this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.handleLock(lockInfo);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
    }

    await this.sendNpcCommand();
    await this.delay(4000);

    if (!this.isRunning || this.runId !== runId) return;

    if (this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.handleLock(lockInfo);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
    }

    const cooldownSec = await this.checkCooldownMessage();
    if (cooldownSec > 0) {
      if (this.autoClimb) {
        const lockInfo = await this.checkLockedMessage();
        if (lockInfo) {
          this.handleLock(lockInfo);
          if (this.isRunning && this.runId === runId) this.mainLoop(runId);
          return;
        }
      }
      this.log(`Hồi chiêu! Chờ ${cooldownSec}s...`);
      await this.cooldownWait(cooldownSec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }

    if (this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.handleLock(lockInfo);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
    }

    const isAlreadyFighting = await this.checkAlreadyFighting();
    if (isAlreadyFighting) {
      this.log('⚔️ Phát hiện trận đang dở! Đang tìm nút...');
    }

    const battleResult = await this.clickButtonsUntilEnd(isAlreadyFighting, runId);

    if (!this.isRunning || this.runId !== runId) return;

    if (typeof battleResult === 'object' && battleResult.type === 'cooldown') {
      this.log(`Hồi chiêu trong trận! Chờ ${battleResult.sec}s...`);
      await this.cooldownWait(battleResult.sec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }
    if (typeof battleResult === 'object' && battleResult.type === 'locked') {
      this.handleLock(battleResult);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }
    if (!battleResult) {
      this.log('Stopped during battle');
      return;
    }

    const isUnknown = typeof battleResult === 'object' && battleResult.result === 'unknown';
    if (isUnknown && this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.handleLock(lockInfo);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
      this.log(`⚠️ NPC ${this.npcNumber}: không tìm thấy nút chiến đấu. Chờ ${this.defeatCooldownSec}s rồi thử lại...`);
      await this.cooldownWait(this.defeatCooldownSec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }

    const isWin = (typeof battleResult === 'object' && battleResult.type === 'ended')
      ? battleResult.result === 'win'
      : true;

    // Parse rewards from battle result message
    if (battleResult && battleResult.rewardText) {
      this.parseBattleRewards(battleResult.rewardText);
      const npc = this.parseTargetNpc(battleResult.rewardText);
      if (npc) this.stats.targetNpc = npc;

      // Set last battle info
      if (this.stats.lastBattle) {
        this.stats.lastBattle.result = isWin ? 'win' : 'loss';
        this.stats.lastBattle.npc = npc || this.stats.targetNpc || `NPC ${this.npcNumber}`;
      }
    }

    if (isWin) {
      this.stats.wins++;
      this.log('✅ THẮNG!');
    } else {
      this.stats.losses++;
      this.log('❌ THUA!');
    }

    if (this.autoClimb) {
      if (isWin) {
        this.climbWinsDone++;
        if (this.climbWinsNeeded > 0) {
          this.log(`Tiến độ farm: ${this.climbWinsDone}/${this.climbWinsNeeded} wins (NPC ${this.npcNumber})`);
          if (this.climbWinsDone >= this.climbWinsNeeded) {
            this.npcNumber++;
            this.climbWinsNeeded = 0;
            this.climbWinsDone = 0;
            this.log(`🚀 Đủ điều kiện! Leo lên thử NPC ${this.npcNumber}...`);
          }
        } else {
          this.log(`✅ Thắng NPC ${this.npcNumber}! Thử leo lên NPC ${this.npcNumber + 1}...`);
          this.npcNumber++;
          this.climbWinsDone = 0;
        }
      } else {
        this.log(`❌ Thua NPC ${this.npcNumber}. Thử lại...`);
      }
      const waitSec = isWin ? null : this.defeatCooldownSec;
      await this.cooldownWait(waitSec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }

    if (isWin) {
      this.battleCount++;
      this.log(`Battle ${this.battleCount}/${this.totalBattles} completed!`);
    } else {
      this.log(`❌ Thua! Không tính vào target. Thử lại...`);
    }
    if (this.battleCount < this.totalBattles) {
      await this.cooldownWait(isWin ? null : this.defeatCooldownSec, runId);
    }
    if (this.isRunning && this.runId === runId) {
      this.mainLoop(runId);
    }
  }

  async cooldownWait(overrideSec = null, runId = null) {
    const totalSec = overrideSec !== null ? overrideSec : Math.floor(this.cooldownMs / 1000);
    this.log(`\n--- Waiting ${totalSec}s before next battle ---`);
    let remaining = totalSec;
    while (remaining > 0 && this.isRunning && this.runId === runId) {
      const showAt = [120, 90, 60, 30, 10, 5, 4, 3, 2, 1];
      if (showAt.includes(remaining) || remaining === totalSec) {
        this.log(`Cooldown: ${remaining}s remaining...`);
      }
      const sleepMs = remaining <= 10 ? 1000 : Math.min(10000, remaining * 1000);
      await this.delay(sleepMs);
      remaining -= Math.floor(sleepMs / 1000);
    }
    if (this.isRunning && this.runId === runId) {
      this.log('Cooldown finished! Starting next battle...\n');
    }
  }

  async sendNpcCommand() {
    await this.exec(`(() => {
      let maxId = 0n;
      document.querySelectorAll('[role="article"]').forEach(m => {
        const text = m.textContent || '';
        if (!text.includes('bị khóa')) {
          m.setAttribute('data-bot-seen', 'true');
        }
        if (m.id) {
          const parts = m.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id > maxId) maxId = id;
          } catch(e) {}
        }
      });
      window.botMaxMsgId = maxId.toString();
    })()`);

    const cmd = `!npc ${this.npcNumber}`;
    this.log(`Typing: ${cmd}`);

    await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
    await this.delay(this.rand(200, 400));

    const len = await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`);
    for (let i = 0; i < len; i++) {
      await this.exec(`(() => {
        const el = document.querySelector('[role="textbox"]');
        if (!el) return;
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
        el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
        el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
      })()`);
      await this.delay(this.rand(30, 60));
    }

    for (let i = 0; i < cmd.length; i++) {
      const ch = cmd[i];
      await this.exec(`(() => {
        const el = document.querySelector('[role="textbox"]');
        if (!el) return;
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(ch)}, code: 'Key${ch.toUpperCase()}', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: ${JSON.stringify(ch)}, code: 'Key${ch.toUpperCase()}', bubbles: true }));
        el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
        el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(ch)}, code: 'Key${ch.toUpperCase()}', bubbles: true }));
      })()`);
      await this.delay(this.rand(80, 180));
    }

    await this.delay(this.rand(200, 400));

    await this.exec(`(() => {
      const el = document.querySelector('[role="textbox"]');
      if (!el) return;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    })()`);

    this.log(`Sent: ${cmd}`);
    return true;
  }

  async checkBattleEnd() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      let rewardText = '';
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !msg.textContent.includes(username)) continue;

        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        }

        const text = msg.textContent.toLowerCase();
        const rawText = msg.textContent;

        const hasResult = text.includes('kết quả trận đấu') || text.includes('battle ended') || text.includes('kết thúc');
        const hasWin = text.includes('chiến thắng') || text.includes('thắng npc') ||
                       rawText.includes('✅') || text.includes('thắng!') ||
                       rawText.includes('🥇');
        const hasLoss = text.includes('thất bại') || text.includes('thua') ||
                        rawText.includes('❌') || rawText.includes('💀') || rawText.includes('😵');

        if (hasResult || hasWin || hasLoss) {
          msg.setAttribute('data-bot-seen', 'true');
          if (msg.id) {
            const parts = msg.id.split('-');
            window.botMaxMsgId = parts[parts.length - 1];
          }

          let result;
          if (hasResult) {
            result = hasLoss && !hasWin ? 'loss' : 'win';
          } else {
            if (rawText.includes('✅ Thắng') || rawText.includes('🥇')) {
              result = 'win';
            } else if (hasLoss) {
              result = 'loss';
            } else {
              result = hasWin ? 'win' : 'unknown';
            }
          }

          // Collect reward text from nearby messages
          rewardText = rawText;

          return { ended: true, result, rewardText };
        }
      }
      return null;
    })()`);
  }

  async checkLockedMessage() {
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const processedIds = ${JSON.stringify(Array.from(this.processedLockIds))};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
            if (processedIds.includes(idStr)) continue;
          } catch(e) {}
        } else if (msg.getAttribute('data-bot-seen') === 'true') {
          continue;
        }

        const text = msg.textContent;
        if (!text.includes('bị khóa')) continue;

        msg.setAttribute('data-bot-seen', 'true');

        let requiredNpc = null;
        const gietNpcIdx = text.toLowerCase().indexOf('giết npc');
        if (gietNpcIdx >= 0) {
          const afterGietNpc = text.substring(gietNpcIdx + 8);
          const numMatch = afterGietNpc.match(/\\s*(\\d+)/);
          if (numMatch) requiredNpc = parseInt(numMatch[1]);
        }

        let winsLeft = 15;
        const textLower = text.toLowerCase();
        const lanIdx = textLower.indexOf('lần');
        const gietColonIdx = textLower.indexOf('giết:');
        if (lanIdx >= 0) {
          let total = 0;
          for (let j = lanIdx - 1; j >= Math.max(0, lanIdx - 15); j--) {
            if (/[0-9]/.test(text[j])) {
              let numStr = text[j];
              for (let k = j - 1; k >= Math.max(0, lanIdx - 15); k--) {
                if (/[0-9]/.test(text[k])) numStr = text[k] + numStr;
                else break;
              }
              total = parseInt(numStr);
              break;
            }
          }
          let done = 0;
          if (gietColonIdx >= 0) {
            for (let j = gietColonIdx; j < Math.min(text.length, gietColonIdx + 10); j++) {
              if (/[0-9]/.test(text[j])) {
                let numStr = text[j];
                for (let k = j + 1; k < Math.min(text.length, gietColonIdx + 10); k++) {
                  if (/[0-9]/.test(text[k])) numStr += text[k];
                  else break;
                }
                done = parseInt(numStr);
                break;
              }
            }
          }
          if (total > 0) {
            winsLeft = Math.max(1, total - done);
          }
        }

        console.log('[Lock] text="' + text + '" -> requiredNpc=' + requiredNpc + ', winsLeft=' + winsLeft);

        if (requiredNpc && msg.id) {
          const parts = msg.id.split('-');
          return { requiredNpc, winsLeft, lockMsgId: parts[parts.length - 1] };
        }
        if (requiredNpc) {
          return { requiredNpc, winsLeft };
        }
      }
      return null;
    })()`);
  }

  async checkCooldownMessage() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !msg.textContent.includes(username)) continue;

        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        }

        const text = msg.textContent.toLowerCase();
        if (text.includes('hồi chiêu') || text.includes('cooldown')) {
          msg.setAttribute('data-bot-seen', 'true');
          if (msg.id) {
            const parts = msg.id.split('-');
            window.botMaxMsgId = parts[parts.length - 1];
          }
          const match = text.match(/(?:(\\d+)\\s*[pm])?\\s*(\\d+)\\s*s/);
          if (match) {
            let sec = 0;
            if (match[1]) sec += parseInt(match[1]) * 60;
            if (match[2]) sec += parseInt(match[2]);
            return sec;
          }
          return 120;
        }
      }
      return -1;
    })()`);
  }

  async checkAlreadyFighting() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !msg.textContent.includes(username)) continue;

        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        }

        const text = msg.textContent.toLowerCase();
        if (text.includes('đang đánh npc rồi') || text.includes('already fighting')) {
          msg.setAttribute('data-bot-seen', 'true');
          if (msg.id) {
            const parts = msg.id.split('-');
            window.botMaxMsgId = parts[parts.length - 1];
          }
          return true;
        }
      }
      return false;
    })()`);
  }

  async readBattleState() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const msgs = document.querySelectorAll('[role="article"]');
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const recentMsgs = Array.from(msgs).slice(-30).reverse();

      let battleMsg = null;
      for (const msg of recentMsgs) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !msg.textContent.includes(username)) continue;
        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        }
        const btns = msg.querySelectorAll('button[role="button"]');
        if (btns.length > 0) { battleMsg = msg; break; }
      }
      if (!battleMsg) return null;

      const text = battleMsg.textContent;

      const hpMatch = text.match(/(\\d[\\d,.]*)\\s*\\/\\s*(\\d[\\d,.]*)\\s*\\((\\d+)%\\)/);
      let userHpPercent = -1, userHpCurrent = -1, userHpMax = -1;
      if (hpMatch) {
        userHpCurrent = parseInt(hpMatch[1].replace(/[,\\.]/g, ''));
        userHpMax = parseInt(hpMatch[2].replace(/[,\\.]/g, ''));
        userHpPercent = parseInt(hpMatch[3]);
      }

      const btns = battleMsg.querySelectorAll('button[role="button"]');
      const buttonTexts = [];
      btns.forEach(btn => {
        const t = btn.textContent.trim();
        if (t.length > 0 && btn.offsetParent !== null) buttonTexts.push(t);
      });

      const skillCount = Math.max(0, buttonTexts.length - 1);

      const allEmoji = Array.from(battleMsg.querySelectorAll('img[data-name]'));
      const emojiSeq = allEmoji.map(e => (e.getAttribute('data-name') || '').toLowerCase());

      const statusList = [];
      let barFound = false;
      for (let i = 0; i < emojiSeq.length; i++) {
        const name = emojiSeq[i];
        if (!barFound) {
          if (name.includes('bar_chart')) barFound = true;
          continue;
        }
        if (/white_check_mark|check_mark_button|heavy_check_mark/.test(name)) {
          statusList.push({ ready: true, cooldownTurns: 0 });
        } else if (/hourglass/.test(name)) {
          let cooldownTurns = 1;
          const imgEls = battleMsg.querySelectorAll('img[data-name]');
          for (const img of imgEls) {
            if (/hourglass/.test((img.getAttribute('data-name') || '').toLowerCase())) {
              let nextText = '';
              let node = img.nextSibling;
              while (node && nextText.length < 5) {
                if (node.nodeType === 3) nextText += node.textContent;
                else break;
                node = node.nextSibling;
              }
              const numMatch = nextText.match(/(\\d+)/);
              if (numMatch) { cooldownTurns = parseInt(numMatch[1]); break; }
            }
          }
          statusList.push({ ready: false, cooldownTurns });
        }
      }

      const skills = [];
      for (let i = 0; i < skillCount; i++) {
        const s = statusList[i] || { ready: true, cooldownTurns: 0 };
        skills.push({ position: i + 1, ready: s.ready, cooldownTurns: s.cooldownTurns });
      }

      return {
        userHpPercent, userHpCurrent, userHpMax,
        skills, buttonCount: buttonTexts.length, buttonTexts,
        statusDump: statusList.map(s => s.ready ? '✅' : '⏳' + s.cooldownTurns).join(' ')
      };
    })()`);
  }

  chooseSkill(battleState) {
    if (!battleState || !battleState.skills || battleState.skills.length === 0) {
      return -1;
    }

    const { skills, userHpPercent, buttonCount } = battleState;
    const healSkillIdx = this.healPosition - 1;

    if (healSkillIdx >= 0 && healSkillIdx < skills.length && userHpPercent >= 0) {
      const healSkill = skills[healSkillIdx];
      if (healSkill.ready && userHpPercent < 60) {
        const btnIndex = this.healPosition;
        this.log(`Smart: Chọn heal (position ${this.healPosition}, button ${btnIndex + 1}) - HP ${userHpPercent}%`);
        return btnIndex;
      }
    }

    for (const pos of this.skillPriority) {
      if (pos < 1 || pos > skills.length || pos === this.healPosition) continue;
      const skill = skills[pos - 1];
      if (skill && skill.ready) {
        const btnIndex = pos;
        this.log(`Smart: Chọn skill position ${pos} (button ${btnIndex + 1}) - Sẵn sàng`);
        return btnIndex;
      }
    }

    this.log('Smart: Không có skill nào sẵn sàng → click skill 1 (Kiếm cơ bản)');
    return 0;
  }

  async scanAllButtons() {
    return await this.exec(`(() => {
      const allBtns = document.querySelectorAll('button[role="button"]');
      const result = [];
      allBtns.forEach((btn, idx) => {
        const text = btn.textContent.trim();
        if (text.length === 0 || btn.offsetParent === null) return;

        const msg = btn.closest('[role="article"]');
        const msgId = msg ? msg.id : null;
        const msgText = msg ? msg.textContent.substring(0, 80) : '';

        result.push({
          idx,
          text,
          textLen: text.length,
          msgId: msgId || 'none',
          msgPreview: msgText
        });
      });
      return result;
    })()`);
  }

  async findBattleButtons() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const msgs = document.querySelectorAll('[role="article"]');
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      let battleMsg = null;
      let battleButtons = [];

      const recentMsgs = Array.from(msgs).slice(-30).reverse();
      for (const msg of recentMsgs) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !msg.textContent.includes(username)) continue;

        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        }

        const btns = msg.querySelectorAll('button[role="button"]');
        if (btns.length > 0) {
          battleMsg = msg;
          break;
        }
      }

      if (!battleMsg) return { buttons: [], msgId: 'none', msgPreview: '' };

      const btns = battleMsg.querySelectorAll('button[role="button"]');
      btns.forEach((btn, idx) => {
        const text = btn.textContent.trim();
        if (text.length > 0 && btn.offsetParent !== null) {
          battleButtons.push({ idx, text });
        }
      });

      const msgId = battleMsg.id || 'unknown';
      const msgPreview = battleMsg.textContent.substring(0, 100);

      return { buttons: battleButtons, msgId, msgPreview };
    })()`);
  }

  async clickSkillButton(btnIndex) {
    const username = this.username || '';
    return await this.exec(`(() => {
      const msgs = document.querySelectorAll('[role="article"]');
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const recentMsgs = Array.from(msgs).slice(-30).reverse();
      let targetMsg = null;
      for (const msg of recentMsgs) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !msg.textContent.includes(username)) continue;
        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        }

        const btns = msg.querySelectorAll('button[role="button"]');
        if (btns.length > 0) {
          targetMsg = msg;
          break;
        }
      }

      if (!targetMsg) return false;

      const btns = targetMsg.querySelectorAll('button[role="button"]');
      let count = 0;
      for (const btn of btns) {
        const text = btn.textContent.trim();
        if (text.length > 0 && btn.offsetParent !== null) {
          if (count === ${btnIndex}) {
            btn.click();
            return true;
          }
          count++;
        }
      }
      return false;
    })()`);
  }

  async clickButtonsUntilEnd(isResuming = false, runId = null) {
    let patternIndex = 0;
    let noButtonsCount = 0;
    let lastLogCount = 0;
    let debugScanned = false;
    const battleStartTime = Date.now();
    const maxBattleDurationMs = 300000;

    while (this.isRunning && this.runId === runId) {
      if (Date.now() - battleStartTime > maxBattleDurationMs) {
        this.log('⚠️ Battle timeout (5 phút). Force-end...');
        return { type: 'ended', result: 'unknown' };
      }

      const battleEndResult = await this.checkBattleEnd();
      if (battleEndResult && battleEndResult.ended) {
        this.log(`>>> BATTLE ENDED: ${battleEndResult.result === 'win' ? '✅ THẮNG' : '❌ THUA'} <<<`);
        return { type: 'ended', result: battleEndResult.result, rewardText: battleEndResult.rewardText };
      }

      const cooldownSec = await this.checkCooldownMessage();
      if (cooldownSec > 0) {
        if (this.autoClimb) {
          const lockInfo = await this.checkLockedMessage();
          if (lockInfo) {
            this.log(`>>> LOCK detected: NPC ${lockInfo.requiredNpc} need ${lockInfo.winsLeft} more wins <<<`);
            return { type: 'locked', requiredNpc: lockInfo.requiredNpc, winsLeft: lockInfo.winsLeft, lockMsgId: lockInfo.lockMsgId };
          }
        }
        this.log(`>>> COOLDOWN detected: ${cooldownSec}s <<<`);
        return { type: 'cooldown', sec: cooldownSec };
      }

      const battleInfo = await this.findBattleButtons();

      if (!battleInfo || !battleInfo.buttons || battleInfo.buttons.length === 0) {
        noButtonsCount++;

        if (!debugScanned && noButtonsCount === 3) {
          debugScanned = true;
          const allBtns = await this.scanAllButtons();
          if (allBtns && allBtns.length > 0) {
            this.log(`=== DEBUG: All ${allBtns.length} buttons on screen ===`);
            allBtns.forEach(b => {
              this.log(`  [${b.idx}] "${b.text}" (msg: ${b.msgId}, preview: ${b.msgPreview.substring(0, 40)}...)`);
            });
          } else {
            this.log('=== DEBUG: No buttons found anywhere on screen ===');
          }
        }

        if (noButtonsCount > 30) {
          this.log('No buttons found for too long, assuming battle ended...');
          return { type: 'ended', result: 'unknown' };
        }
        if (noButtonsCount % 10 === 0) {
          this.log(`Waiting for buttons... (${noButtonsCount})`);
        }

        if (isResuming && noButtonsCount % 3 === 0) {
          await this.exec(`(() => {
            const scrollers = document.querySelectorAll('div[class*="scroller_"]');
            for (const s of scrollers) {
              if (s.scrollHeight > s.clientHeight) s.scrollBy(0, -600);
            }
          })()`);
        }

        await this.delay(1000);
        continue;
      }

      noButtonsCount = 0;
      debugScanned = false;

      if (battleInfo.buttons.length !== lastLogCount) {
        this.log(`Found ${battleInfo.buttons.length} skills: ${battleInfo.buttons.map(b => b.text).join(' | ')}`);
        lastLogCount = battleInfo.buttons.length;
      }

      let btnIndex = -1;

      if (this.smartMode) {
        const battleState = await this.readBattleState();
        if (battleState) {
          const skillStr = battleState.skills.map(s => 'pos' + s.position + '(' + (s.ready ? '✅' : '⏳' + s.cooldownTurns) + ')').join(' | ');
          this.log('Smart: HP ' + battleState.userHpPercent + '% (' + battleState.userHpCurrent + '/' + battleState.userHpMax + ') | Skills: ' + skillStr);
          this.log('Smart DEBUG status: ' + battleState.statusDump);
          btnIndex = this.chooseSkill(battleState);
        } else {
          this.log('Smart: Không đọc được battle state, fallback pattern');
        }
      }

      if (btnIndex === -1) {
        const pos = this.clickPattern[patternIndex % this.clickPattern.length];
        btnIndex = pos - 1;
        if (!this.smartMode) {
          this.log(`Pattern: chọn vị trí ${pos}`);
        }
      }

      if (btnIndex >= 0 && btnIndex < battleInfo.buttons.length) {
        const btn = battleInfo.buttons[btnIndex];
        this.log(`Click [${btnIndex + 1}]: "${btn.text}"`);

        const clicked = await this.clickSkillButton(btnIndex);
        if (!clicked) {
          this.log(`Failed to click button at position ${btnIndex + 1}`);
        }

        if (!this.smartMode) patternIndex++;
      } else {
        this.log(`Position ${btnIndex + 1} not available (only ${battleInfo.buttons.length} skills)`);
        if (!this.smartMode) patternIndex = 0;
      }

      await this.delay(this.buttonDelayMs);
    }

    return false;
  }
}

module.exports = { NpcBot };
