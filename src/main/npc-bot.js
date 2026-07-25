class NpcBot {
  constructor(wc, idx) {
    this.wc = wc;
    this.idx = idx;
    this.isRunning = false;
    this.timeoutId = null;
    this.battleCount = 0;
    this.totalBattles = 5;
    this.npcNumber = 1;
    this.cooldownMs = 120000; // 2 minutes
    this.buttonDelayMs = 1000;
    this.clickPattern = [3, 2, 1]; // Kich Doc -> Pha Giap -> Kiem Co Ban
    // Auto Climb fields
    this.autoClimb = false;
    this.targetMaxNpc = 60;
    this.climbWinsNeeded = 0;  // wins still needed for current NPC before climbing
    this.climbWinsDone = 0;    // wins done in current farming session
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

  updateConfig(config) {
    if (config.npcNumber !== undefined) this.npcNumber = config.npcNumber;
    if (config.totalBattles !== undefined) this.totalBattles = config.totalBattles;
    if (config.cooldownMs !== undefined) this.cooldownMs = config.cooldownMs;
    if (config.buttonDelayMs !== undefined) this.buttonDelayMs = config.buttonDelayMs;
    if (config.clickPattern !== undefined) this.clickPattern = config.clickPattern;
    if (config.autoClimb !== undefined) this.autoClimb = config.autoClimb;
    if (config.targetMaxNpc !== undefined) this.targetMaxNpc = config.targetMaxNpc;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.runId = Date.now();
    this.battleCount = 0;
    this.climbWinsNeeded = 0;
    this.climbWinsDone = 0;
    this.log('Bot started');
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
  }

  async mainLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;

    // Normal mode: stop after totalBattles
    if (!this.autoClimb && this.battleCount >= this.totalBattles) {
      this.log('=== COMPLETED ALL BATTLES ===');
      this.stop();
      return;
    }

    // Auto Climb mode: stop when reached target NPC
    if (this.autoClimb && this.npcNumber > this.targetMaxNpc) {
      this.log(`=== AUTO CLIMB COMPLETE! Đã mở khóa đến NPC ${this.targetMaxNpc} ===`);
      this.stop();
      return;
    }

    const label = this.autoClimb
      ? `NPC ${this.npcNumber} (climb ${this.climbWinsDone}/${this.climbWinsNeeded > 0 ? this.climbWinsNeeded : '?'} wins)`
      : `Battle ${this.battleCount + 1}/${this.totalBattles}`;
    this.log(`\n=== ${label} ===`);

    // Step 1: Send !npc command
    await this.sendNpcCommand();
    await this.delay(4000);

    if (!this.isRunning || this.runId !== runId) return;

    // Check cooldown
    const cooldownSec = await this.checkCooldownMessage();
    if (cooldownSec > 0) {
      // Auto Climb: check lock BEFORE waiting cooldown
      if (this.autoClimb) {
        const lockInfo = await this.checkLockedMessage();
        if (lockInfo) {
          this.log(`🔒 NPC ${this.npcNumber} bị khóa! Cần thắng NPC ${lockInfo.requiredNpc} thêm ${lockInfo.winsLeft} lần.`);
          this.npcNumber = lockInfo.requiredNpc;
          this.climbWinsNeeded = lockInfo.winsLeft;
          this.climbWinsDone = 0;
          if (this.isRunning && this.runId === runId) this.mainLoop(runId);
          return;
        }
      }
      this.log(`Hồi chiêu! Chờ ${cooldownSec}s...`);
      await this.cooldownWait(cooldownSec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }

    // Auto Climb: check if NPC is locked
    if (this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.log(`🔒 NPC ${this.npcNumber} bị khóa! Cần thắng NPC ${lockInfo.requiredNpc} thêm ${lockInfo.winsLeft} lần.`);
        this.npcNumber = lockInfo.requiredNpc;
        this.climbWinsNeeded = lockInfo.winsLeft;
        this.climbWinsDone = 0;
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
    }

    // Check already fighting
    const isAlreadyFighting = await this.checkAlreadyFighting();
    if (isAlreadyFighting) {
      this.log('⚔️ Phát hiện trận đang dở! Đang tìm nút...');
    }

    // Step 2: Click buttons until battle ends
    const battleResult = await this.clickButtonsUntilEnd(isAlreadyFighting, runId);

    if (!this.isRunning || this.runId !== runId) return;

    if (typeof battleResult === 'object' && battleResult.type === 'cooldown') {
      this.log(`Hồi chiêu trong trận! Chờ ${battleResult.sec}s...`);
      await this.cooldownWait(battleResult.sec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }
    if (typeof battleResult === 'object' && battleResult.type === 'locked') {
      this.log(`🔒 NPC ${this.npcNumber} bị khóa! Cần thắng NPC ${battleResult.requiredNpc} thêm ${battleResult.winsLeft} lần.`);
      this.npcNumber = battleResult.requiredNpc;
      this.climbWinsNeeded = battleResult.winsLeft;
      this.climbWinsDone = 0;
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }
    if (!battleResult) {
      this.log('Stopped during battle');
      return;
    }

    // When timeout (no buttons found = unknown result), check if NPC is locked
    const isUnknown = typeof battleResult === 'object' && battleResult.result === 'unknown';
    if (isUnknown && this.autoClimb) {
      // Re-check for lock message (might have appeared but missed earlier)
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.log(`🔒 NPC ${this.npcNumber} bị khóa! Cần thắng NPC ${lockInfo.requiredNpc} thêm ${lockInfo.winsLeft} lần.`);
        this.npcNumber = lockInfo.requiredNpc;
        this.climbWinsNeeded = lockInfo.winsLeft;
        this.climbWinsDone = 0;
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
      // No lock message found but no buttons either → NPC likely locked or inaccessible
      // Step back to previous NPC
      if (this.npcNumber > 1) {
        const prevNpc = this.npcNumber - 1;
        this.log(`⚠️ NPC ${this.npcNumber}: không có nút chiến đấu → có thể bị khóa. Quay lại NPC ${prevNpc} farm thêm...`);
        this.npcNumber = prevNpc;
        this.climbWinsNeeded = 15; // farm mặc định 15 trận, sẽ được cập nhật khi nhận lock msg thật
        this.climbWinsDone = 0;
        await this.cooldownWait(null, runId);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
    }

    // Determine win/loss from { type: 'ended', result: 'win'|'loss'|'unknown' }
    const isWin = (typeof battleResult === 'object' && battleResult.type === 'ended')
      ? battleResult.result === 'win'
      : true; // fallback
    this.log(isWin ? '✅ THẮNG!' : '❌ THUA!');

    if (this.autoClimb) {
      if (isWin) {
        this.climbWinsDone++;

        if (this.climbWinsNeeded > 0) {
          // Farming mode: counting wins toward a specific target
          this.log(`Tiến độ farm: ${this.climbWinsDone}/${this.climbWinsNeeded} wins (NPC ${this.npcNumber})`);
          if (this.climbWinsDone >= this.climbWinsNeeded) {
            // Farmed enough — try climbing back up
            this.npcNumber++;
            this.climbWinsNeeded = 0;
            this.climbWinsDone = 0;
            this.log(`🚀 Đủ điều kiện! Leo lên thử NPC ${this.npcNumber}...`);
          }
        } else {
          // Exploration mode: no lock detected yet, try next NPC after every win
          this.log(`✅ Thắng NPC ${this.npcNumber}! Thử leo lên NPC ${this.npcNumber + 1}...`);
          this.npcNumber++;
          this.climbWinsDone = 0;
        }
      } else {
        // Lost: stay on same NPC and retry (don't advance)
        this.log(`❌ Thua NPC ${this.npcNumber}. Thử lại...`);
      }
      // Always cooldown then retry
      await this.cooldownWait(null, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }

    // Normal mode
    this.battleCount++;
    this.log(`Battle ${this.battleCount}/${this.totalBattles} completed!`);
    if (this.battleCount < this.totalBattles) {
      await this.cooldownWait(null, runId);
    }
    if (this.isRunning && this.runId === runId) {
      this.mainLoop(runId);
    }
  }

  async cooldownWait(overrideSec = null, runId = null) {
    const totalSec = overrideSec !== null ? overrideSec : Math.floor(this.cooldownMs / 1000);
    this.log(`\n--- Waiting ${totalSec}s before next battle ---`);

    // Countdown every 10 seconds
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
    // Record max message ID and tag existing messages so we only process new messages
    await this.exec(`(() => {
      let maxId = 0n;
      document.querySelectorAll('[role="article"]').forEach(m => {
        m.setAttribute('data-bot-seen', 'true');
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

    // Click textbox first
    await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
    await this.delay(this.rand(200, 400));

    // Clear existing text
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

    // Type each character
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

    // Press Enter
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
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-15);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;

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
        if (text.includes('kết quả trận đấu') || text.includes('battle ended') || text.includes('kết thúc')) {
          msg.setAttribute('data-bot-seen', 'true');
          if (msg.id) {
            const parts = msg.id.split('-');
            window.botMaxMsgId = parts[parts.length - 1];
          }
          // Determine win or loss
          const isWin = text.includes('chiến thắng') || text.includes('thắng npc') || 
                        rawText.includes('✅') || text.includes('thắng!') ||
                        rawText.includes('🥇') || rawText.includes('thắng');
          const isLoss = text.includes('thất bại') || text.includes('thua') ||
                         rawText.includes('❌') || rawText.includes('💀');
          const result = isLoss && !isWin ? 'loss' : 'win';
          return { ended: true, result };
        }
      }
      return null;
    })()`);
  }

  async checkLockedMessage() {
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-8);
      for (const msg of recent.reverse()) {
        // Skip already-seen messages using BigInt ID comparison
        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        } else if (msg.getAttribute('data-bot-seen') === 'true') {
          continue;
        }

        const text = msg.textContent;
        const lockMatch = text.match(/bị khóa/i);
        if (!lockMatch) continue;

        msg.setAttribute('data-bot-seen', 'true');

        // Extract required NPC number - "Cần giết NPC X"
        const npcMatch = text.match(/cần giết npc (\d+)/i);
        const requiredNpc = npcMatch ? parseInt(npcMatch[1]) : null;

        // Extract total required and already done - "X lần (đã giết: Y)"
        const progressMatch = text.match(/(\d+) lần.*đã giết:\s*(\d+)/i);
        let winsLeft = 15; // fallback
        if (progressMatch) {
          const total = parseInt(progressMatch[1]);
          const done = parseInt(progressMatch[2]);
          winsLeft = Math.max(1, total - done);
        }

        if (requiredNpc) {
          return { requiredNpc, winsLeft };
        }
      }
      return null;
    })()`);
  }

  async checkCooldownMessage() {
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-5);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;

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
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-5);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;

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

  async clickButtonsUntilEnd(isResuming = false, runId = null) {
    let patternIndex = 0;
    let noButtonsCount = 0;
    let lastLogCount = 0;

    while (this.isRunning && this.runId === runId) {
      // Check if battle ended
      const battleEndResult = await this.checkBattleEnd();
      if (battleEndResult && battleEndResult.ended) {
        this.log(`>>> BATTLE ENDED: ${battleEndResult.result === 'win' ? '✅ THẮNG' : '❌ THUA'} <<<`);
        return { type: 'ended', result: battleEndResult.result };
      }

      const cooldownSec = await this.checkCooldownMessage();
      if (cooldownSec > 0) {
        // Auto Climb: check lock BEFORE returning cooldown
        if (this.autoClimb) {
          const lockInfo = await this.checkLockedMessage();
          if (lockInfo) {
            this.log(`>>> LOCK detected: NPC ${lockInfo.requiredNpc} need ${lockInfo.winsLeft} more wins <<<`);
            return { type: 'locked', requiredNpc: lockInfo.requiredNpc, winsLeft: lockInfo.winsLeft };
          }
        }
        this.log(`>>> COOLDOWN detected: ${cooldownSec}s <<<`);
        return { type: 'cooldown', sec: cooldownSec };
      }

      // Find skill buttons
      const allButtons = await this.exec(`(() => {
        const allBtns = document.querySelectorAll('button[role="button"]');
        const result = [];
        allBtns.forEach((btn, idx) => {
          const text = btn.textContent.trim();
          if (text.length > 0 && text.length < 30 && btn.offsetParent !== null) {
            result.push({ idx, text });
          }
        });
        return result;
      })()`);

      if (!allButtons || allButtons.length === 0) {
        noButtonsCount++;
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

      // Filter skill buttons
      const skillButtons = allButtons.filter(b => {
        const t = b.text.toLowerCase();
        if (t.includes('reaction') || t.includes('reply') || t.includes('edit')) return false;
        if (t.includes('pin') || t.includes('more') || t.includes('attach')) return false;
        if (t.includes('gif') || t.includes('sticker') || t.includes('emoji')) return false;
        if (t === '' || t.length > 20) return false;
        return true;
      });

      if (skillButtons.length === 0) {
        noButtonsCount++;
        if (noButtonsCount > 30) {
          this.log('No skill buttons found for too long, assuming battle ended...');
          return { type: 'ended', result: 'unknown' };
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

      // Log buttons found (only once)
      if (skillButtons.length !== lastLogCount) {
        this.log(`Found ${skillButtons.length} skills: ${skillButtons.map(b => b.text).join(' | ')}`);
        lastLogCount = skillButtons.length;
      }

      // Get current position in pattern
      const pos = this.clickPattern[patternIndex % this.clickPattern.length];
      const btnIndex = pos - 1;

      if (btnIndex < skillButtons.length) {
        const btn = skillButtons[btnIndex];
        this.log(`Click [${pos}]: "${btn.text}"`);

        await this.exec(`(() => {
          const allBtns = document.querySelectorAll('button[role="button"]');
          let skillCount = 0;
          for (const btn of allBtns) {
            const text = btn.textContent.trim();
            if (text.length === 0 || text.length > 30) continue;
            if (btn.offsetParent === null) continue;
            const t = text.toLowerCase();
            if (t.includes('reaction') || t.includes('reply') || t.includes('edit')) continue;
            if (t.includes('pin') || t.includes('more') || t.includes('attach')) continue;
            if (t.includes('gif') || t.includes('sticker') || t.includes('emoji')) continue;
            if (t.length > 20) continue;
            
            if (skillCount === ${btnIndex}) {
              btn.click();
              return true;
            }
            skillCount++;
          }
          return false;
        })()`);

        patternIndex++;
      } else {
        this.log(`Position ${pos} not available (only ${skillButtons.length} skills)`);
        patternIndex = 0;
      }

      await this.delay(this.buttonDelayMs);
    }

    return false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      battleCount: this.battleCount,
      totalBattles: this.totalBattles,
      npcNumber: this.npcNumber,
      cooldownMs: this.cooldownMs,
      clickPattern: this.clickPattern,
      autoClimb: this.autoClimb,
      targetMaxNpc: this.targetMaxNpc,
      climbWinsNeeded: this.climbWinsNeeded,
      climbWinsDone: this.climbWinsDone,
    };
  }
}

module.exports = { NpcBot };
