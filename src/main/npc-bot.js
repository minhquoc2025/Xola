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
    this.tuLuyen = false;
    this.tuLuyenStartCmd = '!tuluyen';
    this.tuLuyenEndCmd = '!ketthuc';
    this.tuLuyenAfterTarget = true;
    this._tuLuyenActive = false;
    this.username = '';
    this.mode = 'npc';
    this.luanhoi = false;
    this.luanhoiTarget = 10;
    this.luanhoiCmd = '!luanhoi';
    this.luanhoiSkillNames = ['Vạn Kiếm Quy Tông', 'Hỗn Nguyên Hộ Thể', 'Kiếm Khí Xung Thiên', 'Thái Cực Dưỡng Sinh'];
    this.luanhoiSkillIdx = 0;
    this.luanhoiCurrentTier = 0;
    this.luanhoiBuffInit = false;
    this.lastLuanhoiTarget = null;
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
    if (config.tuLuyen !== undefined) this.tuLuyen = config.tuLuyen;
    if (config.tuLuyenStartCmd !== undefined) this.tuLuyenStartCmd = config.tuLuyenStartCmd;
    if (config.tuLuyenEndCmd !== undefined) this.tuLuyenEndCmd = config.tuLuyenEndCmd;
    if (config.tuLuyenAfterTarget !== undefined) this.tuLuyenAfterTarget = config.tuLuyenAfterTarget;
    if (config.username !== undefined) this.username = config.username;
    if (config.mode !== undefined) this.mode = config.mode;
    if (config.luanhoi !== undefined) this.luanhoi = config.luanhoi;
    if (config.luanhoiTarget !== undefined) this.luanhoiTarget = config.luanhoiTarget;
    if (config.luanhoiCmd !== undefined) this.luanhoiCmd = config.luanhoiCmd;
    if (config.luanhoiSkillNames !== undefined) this.luanhoiSkillNames = config.luanhoiSkillNames;
  }

  async start() {
    if (this.isRunning) {
      if (!this._tuLuyenActive) return;
      // Đang idle tu luyện sau target → kết thúc tu luyện rồi farm tiếp vòng mới
      this.log('🔄 Yêu cầu Start khi đang tu luyện — kết thúc tu luyện, farm tiếp...');
      await this.endTuLuyen();
    }
    this.isRunning = true;
    this.runId = Date.now();
    this.battleCount = 0;
    this.climbWinsNeeded = 0;
    this.climbWinsDone = 0;
    this.processedLockIds = new Set();
    this.luanhoiSkillIdx = 0;
    this.lastLuanhoiTarget = null;
    this.log('Bot started');
    if (this.mode === 'luanhoi') {
      this.log(`=== LUÂN HỒI MODE: Target tầng ${this.luanhoiTarget} ===`);
      this.luanhoiLoop(this.runId);
      return;
    }
    this.log('=== SMART MODE: Đọc turn real-time ===');
    if (this.username) {
      this.log(`=== GROUP MODE: Lọc tin nhắn theo "${this.username}" ===`);
    }
    if (this.autoClimb) {
      this.log(`=== AUTO CLIMB MODE: NPC ${this.npcNumber} → NPC ${this.targetMaxNpc} ===`);
    }
    this.mainLoop(this.runId);
  }

  async stop() {
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.runId = null;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this._tuLuyenActive) {
      await this.endTuLuyen();
    }
    if (wasRunning) {
      this.log('Bot stopped');
      this.printStats();
    }
  }

  // Gửi lệnh bắt đầu tu luyện (dùng sau khi hoàn thành target)
  async startTuLuyenAfterTarget() {
    if (!this.tuLuyenAfterTarget || this._tuLuyenActive) return;
    try {
      this.log(`🧘 Hoàn thành target! Bắt đầu tu luyện: ${this.tuLuyenStartCmd}`);
      await this.sendChat(this.tuLuyenStartCmd);
      this._tuLuyenActive = true;
    } catch (e) {
      this.log('⚠️ Gửi lệnh tu luyện lỗi:', e.message);
    }
  }

  // Gửi lệnh kết thúc tu luyện
  async endTuLuyen() {
    if (!this._tuLuyenActive) return;
    try {
      await this.sendChat(this.tuLuyenEndCmd);
    } catch (e) { }
    this._tuLuyenActive = false;
    this.log('🧘 Đã kết thúc tu luyện.');
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

    // Summary là dòng TỔNG ở cuối ("💰 +532 🪙 ✨ +235 XP" hoặc "+572 +253 XP").
    // Bỏ qua các dòng breakdown có tên phía trước ("💰 Quất Bất Lực: +350🪙 +159XP") — chứa ':' trước số.
    // Lấy dòng hợp lệ CUỐI CÙNG vì tổng luôn nằm dưới các dòng cộng dồn từng nguồn.
    for (const line of allLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let summaryMatch = trimmed.match(/^\+(\d+)\s+\+(\d+)\s*XP/i);
      if (!summaryMatch) {
        const m = trimmed.match(/^([^:+]*)\+([\d.,]+)\s*🪙[^+]*\+\s*([\d.,]+)\s*XP/i);
        if (m && !m[1].includes(':')) {
          summaryMatch = [trimmed, m[2], m[3]];
        }
      }
      if (summaryMatch) {
        lastCoins = parseInt(String(summaryMatch[1]).replace(/[.,]/g, ''));
        lastExp = parseInt(String(summaryMatch[2]).replace(/[.,]/g, ''));
        foundSummary = true;
      }
    }

    if (foundSummary) {
      this.stats.coins += lastCoins;
      this.stats.exp += lastExp;
      rewards.push(`+${lastCoins}🪙`, `+${lastExp}XP`);
      this.log(`[Rewards] Summary: +${lastCoins}🪙 +${lastExp}XP`);
    }

    // Scan for item drops.
    // Game list cùng vật phẩm ở NHIỀU chỗ trong 1 tin (dòng log trận + mục "🎁 Chiến Lợi Phẩm")
    // → dedupe theo tên TRONG CÙNG trận, mỗi loại chỉ +1.
    const battleDrops = [];
    for (const line of allLines) {
      const trimmed = line.trim();
      const itemMatch = trimmed.match(/Rơi:\s*(.+?)(?:\s*(?:Thắng|Thua|✅|❌|💕|📖|Vợ|$))/i);
      if (itemMatch) {
        let item = itemMatch[1].trim();
        item = item.replace(/^[^\w]+/, '').replace(/[^\w!]+$/, '').trim();
        if (item && item.length > 1 && !battleDrops.includes(item)) {
          battleDrops.push(item);
        }
      }
    }
    for (const item of battleDrops) {
      // Track unique items list
      if (!this.stats.items.includes(item)) {
        this.stats.items.push(item);
      }
      // Track item counts
      this.stats.itemCounts[item] = (this.stats.itemCounts[item] || 0) + 1;
      rewards.push(`Rơi: ${item}`);
      this.log(`[Rewards] Item: Rơi: ${item} (tổng x${this.stats.itemCounts[item]})`);
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
    // "🏆 Quất Bất Lực thắng NPC 🌙 Hằng Nga Tiên Tử!" or "💀 Quất Bất Lực thua NPC 🔮 Bí Ẩn Chi Linh!"
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
      mode: this.mode,
      battleCount: this.battleCount,
      luanhoiTarget: this.luanhoiTarget,
      lastLuanhoiTarget: this.lastLuanhoiTarget,
      totalBattles: this.totalBattles,
      npcNumber: this.npcNumber,
      cooldownMs: this.cooldownMs,
      clickPattern: this.clickPattern,
      smartMode: this.smartMode,
      autoClimb: this.autoClimb,
      targetMaxNpc: this.targetMaxNpc,
      tuLuyen: this.tuLuyen,
      tuLuyenAfterTarget: this.tuLuyenAfterTarget,
      tuLuyenActive: this._tuLuyenActive,
      climbWinsNeeded: this.climbWinsNeeded,
      climbWinsDone: this.climbWinsDone,
      stats: { ...this.stats },
    };
  }

  async mainLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;

    if (!this.autoClimb && this.battleCount >= this.totalBattles) {
      this.log('=== COMPLETED ALL BATTLES ===');
      await this.startTuLuyenAfterTarget();
      if (this._tuLuyenActive) {
        this.printStats();
        this.log(`😴 Bot chuyển sang CHẾ ĐỘ TU LUYỆN. Stop = ${this.tuLuyenEndCmd}, Start = farm tiếp.`);
        return;
      }
      this.stop();
      return;
    }

    if (this.autoClimb && this.npcNumber > this.targetMaxNpc) {
      this.log(`=== AUTO CLIMB COMPLETE! Đã mở khóa đến NPC ${this.targetMaxNpc} ===`);
      await this.startTuLuyenAfterTarget();
      if (this._tuLuyenActive) {
        this.printStats();
        this.log(`😴 Bot chuyển sang CHẾ ĐỘ TU LUYỆN. Stop = ${this.tuLuyenEndCmd}, Start = farm tiếp.`);
        return;
      }
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

    const confirmedEnd = typeof battleResult === 'object' && battleResult.type === 'ended' &&
      (battleResult.result === 'win' || battleResult.result === 'loss');
    if (!confirmedEnd) {
      this.log('⚠️ Không xác nhận được kết thúc trận (unknown). Bỏ qua tu luyện.');
    }

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
      await this.cooldownWait(waitSec, runId, { tuLuyen: confirmedEnd });
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
      await this.cooldownWait(isWin ? null : this.defeatCooldownSec, runId, { tuLuyen: confirmedEnd });
    }
    if (this.isRunning && this.runId === runId) {
      this.mainLoop(runId);
    }
  }

  async cooldownWait(overrideSec = null, runId = null, opts = {}) {
    const useTuLuyen = !!opts.tuLuyen && this.tuLuyen;
    const totalSec = overrideSec !== null ? overrideSec : Math.floor(this.cooldownMs / 1000);

    if (useTuLuyen) {
      this.log('Tu luyen bat dau...');
      await this.sendChat(this.tuLuyenStartCmd);
      await this.delay(this.rand(1000, 1500));
    }

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

    if (useTuLuyen && this.isRunning && this.runId === runId) {
      this.log('Ket thuc tu luyen...');
      await this.sendChat(this.tuLuyenEndCmd);
      await this.delay(this.rand(1000, 1500));
      this.log('Tu luyen xong!');
    }

    if (this.isRunning && this.runId === runId) {
      this.log('Cooldown finished! Starting next battle...\n');
    }
  }

  async sendChat(cmd) {
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

  async sendNpcCommand() {
    return this.sendChat(`!npc ${this.npcNumber}`);
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

  // Phiên bản checkBattleEnd riêng cho Luân Hồi: bỏ qua message đang trận (có nút "Chiến đấu")
  // Kiểm tra trận có kết thúc không. advance/win/loss detection đơn giản bằng match + /i.
  async checkLuanhoiBattleEnd() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const username = ${JSON.stringify(username)};
      const knownTier = window.luanhoiBuffTierClicked || 0;
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (username && !msg.textContent.includes(username)) {
          // Cho phép message Luân Hồi (không chứa username nhưng có từ khóa đặc trưng)
          const rawTextChk = msg.textContent || '';
          if (!/(?:luân hồi|luanhoi|tầng|thap|hạ gục|han guc|đánh bại|boss|tiếp tục|ket thuc)/i.test(rawTextChk)) continue;
        }
        const rawText = msg.textContent || '';
        const text = rawText.toLowerCase();

        const hasWin = /chiến thắng|thắng!/.test(text);
        const hasLoss = /thất bại|bạn đã thua|thua!/.test(text);

        const btns = msg.querySelectorAll('button, [role="button"]');
        const tNames = ['pham', 'linh', 'huyen', 'thien'];
        let hasBuff = false;
        for (const b of btns) {
          const rawTxt = (b.textContent || '').trim();
          if (!rawTxt || /[@|!]/.test(rawTxt)) continue;
          const clean = rawTxt.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (tNames.includes(clean)) { hasBuff = true; break; }
        }

        const isLuanhoi = hasBuff ||
          /luân hồi tháp|luanhoi thap|tháp luân hồi|thap luanhoi|thắng boss|kết thúc luân hồi|ket thuc luan hoi|tiếp tục leo tháp|tiep tuc leo thap|chọn 1 cổng|chon 1 cong|hạ gục boss|han guc boss|đánh bại boss|danh bai boss|chọn độ khó|chon do kho|kết thúc nhận|ket thuc nhan/i.test(rawText);
        if (!isLuanhoi) continue;

        // Advance: message buff tầng mới > tầng đã click
        if (hasBuff && !hasWin && !hasLoss && knownTier > 0) {
          const tm = rawText.match(/(?:tầng|tầng luân hồi|tier)\s*([0-9]{1,3})/i);
          if (tm && parseInt(tm[1]) > knownTier) {
            return { ended: true, result: 'advance', rewardText: rawText };
          }
        }

        // Thắng BOSS mốc: nút "Tiếp tục leo tháp"
        if (!hasWin && !hasLoss) {
          const contKeywords = ['tiếp tục leo tháp', 'tiep tuc leo thap', 'tiếp tục leo', 'tiep tuc leo', 'leo tháp', 'leo thap', 'tiếp tục', 'tiep tuc'];
          for (const b of btns) {
            const rawTxt = (b.textContent || '').trim();
            if (!rawTxt || /[@|!]/.test(rawTxt)) continue;
            const t0 = rawTxt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (contKeywords.some(k => t0.includes(k))) {
              return { ended: true, result: 'win', rewardText: rawText };
            }
          }
        }

         // Thắng BOSS mốc khác: nút "Tiếp Tục"/"Kết Thúc" + "hạ gục boss"
         if (!hasWin && !hasLoss) {
           const bossHit = /hạ gục boss|han guc boss|đánh bại boss|danh bai boss/.test(rawText);
           let hasCont = false, hasStop = false;
           for (const b of btns) {
             const rawTxt = (b.textContent || '').trim();
             if (!rawTxt || /[@|!]/.test(rawTxt)) continue;
             const t0 = rawTxt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/:[a-z_0-9]+:/g, '');
             if (/tiếp|tiep/.test(t0)) hasCont = true;   // "Tiếp Tục" → "tiep tu"
             if (/kết thúc|ket thuc|dừng|dung/.test(t0)) hasStop = true;
           }
           if ((hasCont || hasStop) && bossHit) {
             return { ended: true, result: 'win', rewardText: rawText };
           }
         }

        // Nếu message có nút "Chiến đấu" và KHÔNG có buff → đang trận → chưa kết thúc
        let hasFightBtn = false;
        for (const b of btns) {
          const t = (b.textContent || '').trim().toLowerCase();
          if (t === 'chiến đấu') { hasFightBtn = true; break; }
        }
        if (hasFightBtn) continue;

        if (!hasWin && !hasLoss) continue;

        if (msg.id) {
          const parts = msg.id.split('-');
          window.botMaxMsgId = parts[parts.length - 1];
        }

        let result;
        if (hasWin && !hasLoss) result = 'win';
        else if (hasLoss && !hasWin) result = 'loss';
        else result = 'unknown';

        return { ended: true, result, rewardText: rawText };
      }
      return null;
    })()`);
  }

  // Chuyên scan message buff tầng MỚI (đã qua tầng). Dùng match + /i đơn giản (như readLuanhoiTier).
  async checkLuanhoiAdvance() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const username = ${JSON.stringify(username)};
      const clickedTier = window.luanhoiBuffTierClicked || 0;
      const tierWords = ['pham', 'linh', 'huyen', 'thien'];
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        if (username && !msg.textContent.includes(username)) {
          const rawTextChk = msg.textContent || '';
          if (!/(?:luân hồi|luanhoi|tầng|thap|hạ gục|han guc|đánh bại|boss|tiếp tục|ket thuc)/i.test(rawTextChk)) continue;
        }
        const rawText = msg.textContent || '';
        const tm = rawText.match(/(?:tầng|tầng luân hồi|tier)\s*([0-9]{1,3})/i);
        const newTier = tm ? parseInt(tm[1]) : null;
        const btns = msg.querySelectorAll('button, [role="button"]');
        let hasBuff = false;
        for (const b of btns) {
          const raw = (b.textContent || '').trim();
          if (!raw || /[@|!]/.test(raw)) continue;
          const clean = raw.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (tierWords.includes(clean)) { hasBuff = true; break; }
        }
        if (!hasBuff) continue;
        // clickedTier≥1 (window tăng mỗi lần click buff). Advance khi thấy tầng mới > đã click.
        if (newTier !== null && newTier > clickedTier && clickedTier > 0) {
          return { ended: true, result: 'advance', rewardText: rawText };
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

  // ================= LUÂN HỒI MODE =================

  async luanhoiLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;

    // RESET trạng thái tầng mỗi run mới — không để giá trị cũ (từ run trước) làm sai logic
    // advance/click buff (window.luanhoiBuffTierClicked phải về 0 để tầng 1 được chọn lại).
    this.luanhoiCurrentTier = 0;
    await this.exec('window.luanhoiBuffTierClicked = 0; true;');

    this.log(`\n=== 🌀 LUÂN HỒI: ${this.luanhoiCmd} ===`);
    await this.sendChat(this.luanhoiCmd);
    await this.delay(this.rand(3000, 4000));

    // DEBUG: in text các message gần đây để xác định UI thật của game
    const msgsDebug = await this.exec(`(() => {
      const msgs = document.querySelectorAll('[role="article"]');
      return Array.from(msgs).slice(-6).map((m, i) => {
        const btns = Array.from(m.querySelectorAll('button, [role="button"]')).map((b, bi) => {
          return 'btn' + bi + '={' + (b.textContent || '').trim() + '|cls=' + (b.className || '').toString().substring(0, 40) + '|dis=' + (b.disabled ? 1 : 0) + '}';
        });
        return 'txt=' + (m.textContent || '').replace(/\\s+/g, ' ').substring(0, 400) + ' || BUTTONS:' + btns.join(' ; ');
      });
    })()`);
    if (msgsDebug && msgsDebug.length) {
      this.log('---- [DEBUG UI] 6 message gần nhất ----');
      msgsDebug.forEach((m, i) => this.log(`  [msg${i}] ${m.substring(0, 800)}`));
      this.log('---------------------------------------');
    }

    await this.cooldownWait(this.rand(5, 8), runId);

    if (this.isRunning && this.runId === runId) {
      this.luanhoiFightLoop(runId);
    }
  }

  async luanhoiFightLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;

    this.log('\n=== ⚔️ Chiến đấu luân hồi ===');

    // PRE-BATTLE: game tự di chuyển tới tầng kế và hiện màn chọn cửa (boss 10/20/30) + buff.
    // Đợi tới khi thấy buff (hoặc cửa) xuất hiện rồi chọn. Chỉ click khi nút hiện.
    const preTimeout = Date.now() + 15000; // tối đa 15s chờ chọn buff
    let entered = false;
    while (this.isRunning && this.runId === runId && Date.now() < preTimeout) {
      if (await this.clickDoor('up')) {
        this.log('🚪 Đã chọn cửa hướng lên (boss mốc).');
        await this.delay(this.rand(1200, 2000));
      }
      const b = await this.clickBuffByPriority();
      if (b) {
        this.log(`⚡ Đã chọn buff: "${b}"`);
        entered = true;
        const tierNow = await this.readLuanhoiTier();
        if (tierNow > 0) this.luanhoiCurrentTier = tierNow;
        break;
      }
      // Nếu buff đã chọn từ trước (khi advance giữa trận sang tầng mới) hoặc đã trong trận
      const curTier = await this.readLuanhoiTier();
      const clickedTier = await this.exec('window.luanhoiBuffTierClicked || 0');
      if (clickedTier > 0 && (curTier === 0 || clickedTier >= curTier)) {
        entered = true;
        break;
      }
      const isFighting = await this.checkAlreadyFighting();
      if (isFighting) {
        entered = true;
        break;
      }
      // Fallback: kiểm tra xem có nút skill không (nghĩa là đã trong trận)
      const hasSkill = await this.clickNextLuanhoiSkill();
      if (hasSkill) {
        this.log(`🌀 Phát hiện skill giữa pre-battle: "${hasSkill}" → đã trong trận!`);
        entered = true;
        break;
      }
      await this.delay(this.rand(2000, 3000));
    }

    if (!entered) {
      this.log('⚠️ Luân hồi: quá lâu không thấy màn chọn buff. Thử lại vòng kế...');
      await this.cooldownWait(10, runId);
      if (this.isRunning && this.runId === runId) this.luanhoiFightLoop(runId);
      return;
    }

    await this.delay(this.rand(1500, 2500));

    const isAlreadyFighting = await this.checkAlreadyFighting();
    const battleResult = await this.luanhoiBattle(isAlreadyFighting, runId);

    if (!this.isRunning || this.runId !== runId) return;

    if (typeof battleResult === 'object' && battleResult.ended !== true) {
      this.log('⚠️ Luân hồi: kết thúc ngoài ý muốn, thử lại...');
      await this.cooldownWait(10, runId);
      if (this.isRunning && this.runId === runId) this.luanhoiFightLoop(runId);
      return;
    }

    // 'win' hoặc 'advance' (sang tầng) đều coi là thắng tầng đó
    const isWin = battleResult && battleResult.ended && battleResult.result === 'win';
    const isAdvance = battleResult && battleResult.ended && battleResult.result === 'advance';

    if (isWin) {
      this.stats.wins++;
      this.log('✅ THẮNG BOSS!');
    } else if (isAdvance) {
      this.stats.wins++;
      this.log('⏩ THẮNG TẦNG / SANG TẦNG KẾ!');
    } else {
      this.stats.losses++;
      this.log('❌ THUA BOSS!');
    }

    // Đợi game cập nhật message kết quả
    await this.delay(this.rand(2500, 3500));

    const currentTier = await this.readLuanhoiTier();
    this.lastLuanhoiTarget = currentTier;
    if (currentTier > 0) this.luanhoiCurrentTier = currentTier;

    if (currentTier >= this.luanhoiTarget && isWin) {
      this.log(`✅ Đã đạt tầng mục tiêu ${this.luanhoiTarget} (hiện tại ${currentTier}). Chọn DỪNG nhận thưởng.`);
      const stopResult = await this.clickContinueOrStop('stop');
      this.log(`[DỪNG] clickContinueOrStop('stop') returned: ${stopResult}`);
      this.printStats();
      this.stop();
      return;
    }

    // Boss mốc (tầng 10, 20, 30...) không tự sang tầng: cần bấm "Tiếp tục leo tháp".
    if (currentTier > 0 && currentTier % 10 === 0) {
      this.log(`🔄 Thắng BOSS tầng ${currentTier} — cần bấm "Tiếp tục leo tháp" để đi tiếp.`);
      let cont = null;
      for (let attempt = 1; attempt <= 6; attempt++) {
        if (!this.isRunning || this.runId !== runId) return;
        cont = await this.clickContinueOrStop('continue');
        if (cont) break;
        await this.delay(this.rand(2500, 3500));
      }
      if (cont) this.log(`✅ Đã click nút tiếp tục (${cont}).`);
      else this.log('⚠️ [Debug] Không tìm thấy nút Tiếp tục leo tháp.');
    } else {
      this.log(`🔄 Tầng thường ${currentTier} — game tự sang tầng kế, chờ chọn buff tiếp...`);
    }

    await this.delay(this.rand(2500, 3500));

    if (this.isRunning && this.runId === runId) {
      this.luanhoiFightLoop(runId);
    }
  }

  // Chiến đấu luân hồi: game tự đánh nên chỉ cần chờ trận kết thúc
  async luanhoiBattle(isResuming = false, runId = null) {
    const battleStartTime = Date.now();
    const maxBattleDurationMs = 180000;

    // Trong khi chờ trận xong, cứ vài vòng gọi click skill (nếu game cần click). Không force-advance
    // vội: chỉ thoát khi checkLuanhoiBattleEnd xác nhận trận đã kết thúc (buff tầng mới / win / loss).
    let noSkillSince = null;

    while (this.isRunning && this.runId === runId) {
      if (Date.now() - battleStartTime > maxBattleDurationMs) {
        this.log('⚠️ Luân hồi: battle timeout, force-end.');
        return { ended: true, result: 'unknown' };
      }

      // Nếu màn chọn buff xuất hiện (màn buff giữa trận / sang tầng mới), chọn ngay và advance
      const buffClicked = await this.clickBuffByPriority();
      if (buffClicked) {
        this.log(`⚡ Đã chọn buff giữa trận/sang tầng: "${buffClicked}"`);
        return { ended: true, result: 'advance' };
      }

      const adv = await this.checkLuanhoiAdvance();
      if (adv && adv.ended) {
        this.log('>>> BATTLE END: ✅ advance (buff tầng mới) <<<');
        return { ended: true, result: 'advance', rewardText: adv.rewardText };
      }

      const end = await this.checkLuanhoiBattleEnd();
      if (end && end.ended) {
        this.log(`>>> BATTLE END: ${end.result === 'win' ? '✅ THẮNG' : (end.result === 'loss' ? '❌ THUA' : '?')} <<<`);
        return { ended: true, result: end.result, rewardText: end.rewardText };
      }

      const cooldown = await this.checkCooldownMessage();
      if (cooldown > 0) {
        this.log(`>>> COOLDOWN: ${cooldown}s <<<`);
        return { ended: false, cooldown: cooldown };
      }

      // Click skill mỗi lượt (nếu game cần). Không tìm thấy skill chỉ là trễ giữa các lượt — cứ chờ.
      const clicked = await this.clickNextLuanhoiSkill();
      if (clicked) {
        this.log(`🌀 Click skill luân hồi: "${clicked}"`);
        noSkillSince = null;
      } else if (noSkillSince === null) {
        noSkillSince = Date.now();
      } else if (Date.now() - noSkillSince > 30000) {
        noSkillSince = Date.now();
      }

      await this.delay(this.rand(2000, 3000));
    }

    return { ended: false };
  }

  // Tìm skill luân hồi theo TÊN (bỏ qua nút buff Phàm/Linh/Huyền/Thiên và skill mặc định), click luân phiên
  async clickNextLuanhoiSkill() {
    const username = this.username || '';
    const names = this.luanhoiSkillNames;
    const tierWords = ['pham', 'linh', 'huyen', 'thien'];

    // Lấy tên skill cần click lần này (luân phiên đảo thứ tự)
    const name = names[this.luanhoiSkillIdx % names.length];
    this.luanhoiSkillIdx++;

    const clicked = await this.exec(`(() => {
      const removeVN = s => (s || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd')
        .replace(/\u01A1/g, 'o').replace(/\u01A0/g, 'o')
        .replace(/\u01B0/g, 'u').replace(/\u01AF/g, 'u')
        .toLowerCase();
      const username = ${JSON.stringify(username)};
      const name = ${JSON.stringify(name)};
      const nameNoD = removeVN(name);
      const userFirstWord = removeVN(username).split(' ')[0];
      const tierWords = ${JSON.stringify(tierWords)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        const rawText = msg.textContent || '';
        const norm = removeVN(rawText);
        if (userFirstWord && !norm.includes(userFirstWord) && !norm.includes('luan') && !norm.includes('thap')) continue;
        const btns = msg.querySelectorAll('button, [role="button"]');
        if (btns.length === 0) continue;
        for (const btn of btns) {
          if (btn.disabled) continue;
          const txt = (btn.textContent || '').trim();
          if (!txt || /[@|!]/.test(txt)) continue;
          const noD = removeVN(txt);
          const clean = noD.replace(/[^a-z0-9]/g, '');
          if (tierWords.includes(clean)) continue;
          if (noD.includes(nameNoD)) {
            btn.click();
            return txt;
          }
        }
      }
      return null;
    })()`);

    if (clicked) return clicked;

    // Fallback: click nút skill luân hồi đầu tiên còn sẵn (không phải buff)
    const any = await this.exec(`(() => {
      const removeVN = s => (s || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd')
        .replace(/\u01A1/g, 'o').replace(/\u01A0/g, 'o')
        .replace(/\u01B0/g, 'u').replace(/\u01AF/g, 'u')
        .toLowerCase();
      const username = ${JSON.stringify(username)};
      const userFirstWord = removeVN(username).split(' ')[0];
      const names = ${JSON.stringify(names)};
      const namesNoD = names.map(n => removeVN(n).replace(/[^a-z0-9]/g, ''));
      const tierWords = ${JSON.stringify(tierWords)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        const rawText = msg.textContent || '';
        const norm = removeVN(rawText);
        if (userFirstWord && !norm.includes(userFirstWord) && !norm.includes('luan') && !norm.includes('thap')) continue;
        const btns = msg.querySelectorAll('button, [role="button"]');
        if (btns.length === 0) continue;
        for (const btn of btns) {
          if (btn.disabled) continue;
          const txt = (btn.textContent || '').trim();
          if (!txt || /[@|!]/.test(txt)) continue;
          const noD = removeVN(txt).replace(/[^a-z0-9]/g, '');
          if (tierWords.includes(noD)) continue;
          for (const n of namesNoD) {
            if (noD.includes(n)) {
              btn.click();
              return txt;
            }
          }
        }
      }
      return null;
    })()`);

    if (any) return any;

    // Debug: in toàn bộ button/role=button 1 lần duy nhất (tránh spam log mỗi vòng lặp)
    if (this.luanhoiSkillDebugCount === undefined) this.luanhoiSkillDebugCount = 0;
    this.luanhoiSkillDebugCount++;
    if (this.luanhoiSkillDebugCount <= 1) {
      const dump = await this.exec(`(() => {
        const nd = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').replace(/ơ/g, 'o').replace(/Ơ/g, 'o').replace(/ư/g, 'u').replace(/Ư/g, 'u').toLowerCase();
        const username = ${JSON.stringify(username)};
        const userFirstWord = nd(username).split(' ')[0];
        const results = [];
        const msgs = document.querySelectorAll('[role="article"]');
        const recent = Array.from(msgs).slice(-8).reverse();
        for (const msg of recent) {
          if (userFirstWord && !nd(msg.textContent).includes(userFirstWord)) continue;
          const btns = msg.querySelectorAll('button, [role="button"]');
          if (btns.length === 0) continue;
          const labels = [];
          btns.forEach(b => {
            const t = (b.textContent || '').trim();
            if (t && t.length < 80) labels.push(t + '|dis=' + (b.disabled ? 1 : 0));
          });
          if (labels.length > 0) results.push(labels.join(' ; '));
        }
        return results;
      })()`);
      if (dump && dump.length > 0) {
        this.log('⚠️ [Debug] Các nút lân cận không click được (lần đầu):');
        dump.forEach(d => this.log('   [btn] ' + d));
      }
    }
    return null;
  }

  // Đọc tầng hiện tại từ message (dùng match + /i như checkLuanhoiAdvance/battleEnd)
  async readLuanhoiTier() {
     const username = this.username || '';
     const val = await this.exec(`(() => {
       const username = ${JSON.stringify(username)};
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-40).reverse();
       let bestTier = null;
       for (const msg of recent) {
         if (username && !msg.textContent.includes(username)) {
           const rawTextChk = msg.textContent || '';
           if (!/(?:luân hồi|luanhoi|tầng|thap)/i.test(rawTextChk)) continue;
         }
         const text = msg.textContent;
         const m = text.match(/(?:tầng|tầng luân hồi|tier)\s*([0-9]{1,3})/i);
         if (m && m[1]) {
           const t = parseInt(m[1]);
           if (bestTier === null || t > bestTier) bestTier = t;
         }
       }
       if (bestTier !== null) return bestTier;
       // Fallback: dùng tầng đã click buff gần nhất
       const w = window.luanhoiBuffTierClicked || 0;
       return w > 0 ? w : null;
     })()`);

     if (val === null || val === undefined) {
      this.log('⚠️ [Debug] Không đọc được tầng hiện tại từ message.');
      const preview = await this.exec(`(() => {
        const msgs = document.querySelectorAll('[role="article"]');
        return Array.from(msgs).slice(-6).map(m => (m.textContent || '').substring(0, 120));
      })()`);
      if (preview) {
        preview.forEach(p => this.log('   [tier debug] ' + p));
      }
      return 0;
    }
    this.log(`🗼 Tầng hiện tại: ${val}`);
    return val;
  }

  // Click nút "Tiếp tục" hoặc "Dừng nhận thưởng"
  async clickContinueOrStop(which) {
    const contKeywords = ['tiếp tục leo tháp', 'tiep tuc leo thap', 'tiếp tục leo', 'tiep tuc leo', 'tiếp tục', 'tiep tuc', 'leo tháp', 'leo thap', 'tiếp', 'tiep'];
      const stopKeywords = ['ket thuc', 'kết thúc', 'dừng', 'dung', 'nhận thưởng'];

    return await this.exec(`(() => {
      const which = ${JSON.stringify(which)};
      const contKeywords = ${JSON.stringify(contKeywords)};
      const stopKeywords = ${JSON.stringify(stopKeywords)};
       const nd = s => s.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-30).reverse();
       for (const msg of recent) {
         const btns = msg.querySelectorAll('button, [role="button"]');
         if (btns.length === 0) continue;
         for (const btn of btns) {
           const raw = (btn.textContent || '').trim();
           if (!raw) continue;
           if (/[@|!]/.test(raw)) continue;
           const txt = nd(raw);
           if (!txt) continue;
            if (which === 'stop') {
              if (txt.includes('ket thuc') && txt.includes('thuong')) {
               btn.disabled = false;
               btn.click();
               return 'stop-clicked: ' + raw;
             }
           } else {
             if (contKeywords.some(k => txt.includes(k))) {
               btn.disabled = false;
               btn.click();
               return 'continue-clicked: ' + raw;
             }
           }
         }
       }
        if (which === 'stop') return 'stop-null: ' + Array.from(recent).slice(-5).map(m => m.textContent.substring(0,60)).join(' || ');
        return null;
     })()`);
  }

  // Click nút cửa theo hướng (mặc định up)
  async clickDoor(direction) {
    const username = this.username || '';
    const dirMap = {
      up: ['lên', 'len', 'trên', 'tren', 'lên trên', 'len tren', '↑', '⬆'],
      down: ['xuống', 'xuong', 'dưới', 'duoi', '↓', '⬇'],
      left: ['trái', 'trai', '←', '⬅'],
      right: ['phải', 'phai', '→', '➡'],
    };
    const keys = dirMap[direction] || dirMap.up;

     return await this.exec(`(() => {
       const username = ${JSON.stringify(username)};
       const keys = ${JSON.stringify(keys)};
       const nd = s => s.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-30).reverse();
       for (const msg of recent) {
         if (username && !msg.textContent.includes(username)) {
           const rawTextChk = msg.textContent || '';
           if (!/(?:luân hồi|luanhoi|tầng|thap|hạ gục|han guc|đánh bại|boss|tiếp tục|ket thuc)/i.test(rawTextChk)) continue;
         }
         const btns = msg.querySelectorAll('button, [role="button"]');
        if (btns.length === 0) continue;
        for (const btn of btns) {
          const raw = (btn.textContent || '').trim();
          if (!raw) continue;
          if (/[@|!]/.test(raw)) continue;
          const txt = nd(raw);
          if (!txt) continue;
          if (keys.some(k => txt.includes(nd(k)))) {
            btn.disabled = false;
            btn.click();
            return raw;
          }
        }
      }
      return null;
    })()`);
  }

  // Chọn buff ưu tiên Thiên > Huyền > Linh > Phàm. Dùng window.luanhoiBuffTierClicked làm guard chính.
  async clickBuffByPriority() {
    const username = this.username || '';
    const clicked = await this.exec(`(() => {
      const tierOf = { 'thien': 3, 'huyen': 2, 'linh': 1, 'pham': 0 };
      const tierNames = ['pham', 'linh', 'huyen', 'thien'];
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();

       for (const msg of recent) {
         const rawText = msg.textContent || '';
         if (username && !rawText.includes(username)) {
           if (!/(?:luân hồi|luanhoi|tầng|thap|hạ gục|han guc|đánh bại|boss)/i.test(rawText)) continue;
         }
         const btns = msg.querySelectorAll('button, [role="button"]');
        if (btns.length === 0) continue;
        let maxP = -1, bestBtn = null, bestText = '';
        for (const b of btns) {
          if (b.disabled) continue;
          const raw = (b.textContent || '').trim();
          if (!raw) continue;
          const merged = (b.textContent || '').replace(/\s+/g, ' ').trim();
          if (/[@|!]/.test(raw)) continue;
          const clean = raw.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!tierNames.includes(clean)) continue;
          const p = tierOf[clean];
          if (p > maxP) { maxP = p; bestBtn = b; bestText = merged; }
        }
        if (!bestBtn) continue;

        // Parse tầng từ message (match + /i)
        let msgTier = 0;
        const tm = rawText.match(/(?:tầng|tầng luân hồi|tier)\s*([0-9]{1,3})/i);
        if (tm && tm[1]) msgTier = parseInt(tm[1]);

        // Nếu đã click buff cho tầng này rồi → bỏ qua
        const clickedTier = window.luanhoiBuffTierClicked || 0;
        if (msgTier > 0 && msgTier <= clickedTier) continue;

        bestBtn.disabled = false;
        bestBtn.click();
        window.luanhoiBuffTierClicked = Math.max(window.luanhoiBuffTierClicked || 0, msgTier > 0 ? msgTier : (window.luanhoiBuffTierClicked || 0) + 1);
        return { text: bestText, tier: msgTier };
      }
      return null;
    })()`);

    if (clicked) {
      this.log(`🎯 Chọn buff: "${clicked.text}" (ưu tiên, tầng ${clicked.tier || '?'}).`);
      return clicked.text;
    }
    return false;
  }
}

module.exports = { NpcBot };
