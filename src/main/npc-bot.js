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
    this.defeatCooldownSec = 300; // 5 minutes wait after defeat
    this.buttonDelayMs = 1000;
    this.clickPattern = [3, 2, 1]; // Legacy fallback
    this.smartMode = true; // Always smart mode
    this.healPosition = 3; //1-based position of heal/defensive skill in skills[] array (Skill4 = position 3)
    this.skillPriority = [2, 1]; // Priority: Skill3 (Tuyệt Sát=pos2) > Skill2 (Phá Giáp=pos1)
    this.processedLockIds = new Set(); // Track processed lock message IDs
    // Auto Climb fields
    this.autoClimb = false;
    this.targetMaxNpc = 60;
    this.climbWinsNeeded = 0;  // wins still needed for current NPC before climbing
    this.climbWinsDone = 0;    // wins done in current farming session
    // Group chat: filter by username
    this.username = ''; // Empty = no filter (solo mode)
    // Roll schedule
    this.rollSchedule = null; // ISO datetime string, e.g. "2026-07-28T14:30"
    this.rollCount = 1;
    this.rollDelayMs = 3000;
    this.rollPending = false;
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
    if (config.smartMode !== undefined) this.smartMode = config.smartMode;
    if (config.healPosition !== undefined) this.healPosition = Math.max(1, parseInt(config.healPosition) || 3);
    if (config.skillPriority !== undefined) {
      const arr = config.skillPriority.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
      if (arr.length > 0) this.skillPriority = arr;
    }
    if (config.autoClimb !== undefined) this.autoClimb = config.autoClimb;
    if (config.targetMaxNpc !== undefined) this.targetMaxNpc = config.targetMaxNpc;
    if (config.username !== undefined) this.username = config.username;
    if (config.rollSchedule !== undefined) this.rollSchedule = config.rollSchedule || null;
    if (config.rollCount !== undefined) this.rollCount = Math.max(1, parseInt(config.rollCount) || 1);
    if (config.rollDelayMs !== undefined) this.rollDelayMs = Math.max(500, parseInt(config.rollDelayMs) || 3000);
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
    this.rollPending = false;
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

    // Roll schedule: execute if it's time
    if (this.isRollTime()) {
      await this.executeRoll(runId);
      return;
    }

    // Auto Climb: check lock BEFORE sendNpcCommand updates botMaxMsgId
    if (this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.handleLock(lockInfo);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
    }

    // Step 1: Send !npc command
    await this.sendNpcCommand();
    await this.delay(4000);

    if (!this.isRunning || this.runId !== runId) return;

    // Auto Climb: check lock immediately after sending command
    if (this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.handleLock(lockInfo);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
    }

    // Check cooldown
    const cooldownSec = await this.checkCooldownMessage();
    if (cooldownSec > 0) {
      // Auto Climb: check lock BEFORE waiting cooldown
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

    // Auto Climb: check if NPC is locked
    if (this.autoClimb) {
      const lockInfo = await this.checkLockedMessage();
      if (lockInfo) {
        this.handleLock(lockInfo);
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
      this.handleLock(battleResult);
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
        this.handleLock(lockInfo);
        if (this.isRunning && this.runId === runId) this.mainLoop(runId);
        return;
      }
      // No lock message found but no buttons either → wait and retry same NPC
      this.log(`⚠️ NPC ${this.npcNumber}: không tìm thấy nút chiến đấu. Chờ ${this.defeatCooldownSec}s rồi thử lại...`);
      await this.cooldownWait(this.defeatCooldownSec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
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
      // Cooldown then retry
      const waitSec = isWin ? null : this.defeatCooldownSec;
      await this.cooldownWait(waitSec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }

    // Normal mode
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
    // BUT preserve lock messages (🔒) so checkLockedMessage can still find them
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

  async sendMessage(cmd) {
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

  isRollTime() {
    if (!this.rollSchedule || this.rollPending) return false;
    const now = new Date();
    const target = new Date(this.rollSchedule);
    if (isNaN(target.getTime())) return false;
    return now >= target;
  }

  async executeRoll(runId) {
    this.rollPending = true;
    this.log(`🎲 Bắt đầu quay số: ${this.rollCount} lần !roll`);

    for (let i = 0; i < this.rollCount; i++) {
      if (!this.isRunning || this.runId !== runId) break;
      await this.sendMessage('!roll');
      this.log(`🎲 Roll ${i + 1}/${this.rollCount}`);
      if (i < this.rollCount - 1) {
        await this.delay(this.rollDelayMs);
      }
    }

    this.log(`🎲 Hoàn thành quay số!`);
    this.rollPending = false;
    this.rollSchedule = null;

    if (this.isRunning && this.runId === runId) {
      this.mainLoop(runId);
    }
  }

  async checkBattleEnd() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;

        // If username is set, skip messages that don't contain it
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
        if (text.includes('kết quả trận đấu') || text.includes('battle ended') || text.includes('kết thúc')) {
          msg.setAttribute('data-bot-seen', 'true');
          if (msg.id) {
            const parts = msg.id.split('-');
            window.botMaxMsgId = parts[parts.length - 1];
          }
          // Determine win or loss - check player-specific lines first
          const isWin = /\b\w+\s+thắng npc\b/.test(text) ||
                        text.includes('chiến thắng!') ||
                        rawText.includes('🥇') ||
                        text.includes('✅ thắng');
          const isLoss = /\b\w+\s+thua\b/.test(text) ||
                         text.includes('thất bại') ||
                         text.includes('bị xỏ lá') ||
                         rawText.includes('❌');
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

        // Extract required NPC: "giết NPC X" or "giết npc X"
        let requiredNpc = null;
        const gietNpcIdx = text.toLowerCase().indexOf('giết npc');
        if (gietNpcIdx >= 0) {
          const afterGietNpc = text.substring(gietNpcIdx + 8);
          const numMatch = afterGietNpc.match(/\\s*(\\d+)/);
          if (numMatch) requiredNpc = parseInt(numMatch[1]);
        }

        // Extract progress: find "X lần" then "giết: Y" or "giết:Y"
        let winsLeft = 15;
        const textLower = text.toLowerCase();
        const lanIdx = textLower.indexOf('lần');
        // Find "giết:" (with colon) specifically for done count
        const gietColonIdx = textLower.indexOf('giết:');
        if (lanIdx >= 0) {
          // Total: scan backwards from "lần" to find digits
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
          // Done: scan forward from "giết:" to find digits
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

  // ===== SMART MODE: Read battle state from DOM =====
  async readBattleState() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const msgs = document.querySelectorAll('[role="article"]');
      const username = ${JSON.stringify(username)};
      const recentMsgs = Array.from(msgs).slice(-30).reverse();

      let battleMsg = null;
      for (const msg of recentMsgs) {
        if (username && !msg.textContent.includes(username)) continue;
        const btns = msg.querySelectorAll('button[role="button"]');
        if (btns.length > 0) { battleMsg = msg; break; }
      }
      if (!battleMsg) return null;

      const text = battleMsg.textContent;

      // HP
      const hpMatch = text.match(/(\\d[\\d,.]*)\\s*\\/\\s*(\\d[\\d,.]*)\\s*\\((\\d+)%\\)/);
      let userHpPercent = -1, userHpCurrent = -1, userHpMax = -1;
      if (hpMatch) {
        userHpCurrent = parseInt(hpMatch[1].replace(/[,\\.]/g, ''));
        userHpMax = parseInt(hpMatch[2].replace(/[,\\.]/g, ''));
        userHpPercent = parseInt(hpMatch[3]);
      }

      // Buttons
      const btns = battleMsg.querySelectorAll('button[role="button"]');
      const buttonTexts = [];
      btns.forEach(btn => {
        const t = btn.textContent.trim();
        if (t.length > 0 && btn.offsetParent !== null) buttonTexts.push(t);
      });

      // Skill count = buttons - 1 (skip basic at [0])
      const skillCount = Math.max(0, buttonTexts.length - 1);

      // Collect ONLY ✅/⏳ status icons in order from emoji stream
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
          // ⏳ is img element, text won't contain it. 
          // Find cooldown number: look for digit紧跟在⏳img后面 in DOM
          let cooldownTurns = 1;
          const imgEls = battleMsg.querySelectorAll('img[data-name]');
          for (const img of imgEls) {
            if (/hourglass/.test((img.getAttribute('data-name') || '').toLowerCase())) {
              // Check next sibling text or parent text after this img
              let nextText = '';
              let node = img.nextSibling;
              while (node && nextText.length < 5) {
                if (node.nodeType === 3) nextText += node.textContent;
                else break;
                node = node.nextSibling;
              }
              const numMatch = nextText.match(/(\d+)/);
              if (numMatch) { cooldownTurns = parseInt(numMatch[1]); break; }
            }
          }
          statusList.push({ ready: false, cooldownTurns });
        }
      }

      // Map status to skills: first N status icons = skill readiness
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

  // Choose best skill index based on battle state
  // Returns 0-based index to click, or -1 if no skill available
  chooseSkill(battleState) {
    if (!battleState || !battleState.skills || battleState.skills.length === 0) {
      return -1;
    }

    const { skills, userHpPercent, buttonCount } = battleState;

    // Position-based: healPosition is 1-based index in skills array
    // skills[0] → button 1, skills[1] → button 2, etc.
    // buttonIndex = skills array index + 1 (because button[0] is basic attack)
    const healSkillIdx = this.healPosition - 1; // 0-based index in skills[]

    // Priority 1: Heal skill at healPosition if HP < 60% (or HP unknown = -1)
    if (healSkillIdx >= 0 && healSkillIdx < skills.length) {
      const healSkill = skills[healSkillIdx];
      if (healSkill.ready && (userHpPercent < 0 || userHpPercent < 60)) {
        const btnIndex = this.healPosition;
        this.log(`Smart: Chọn heal (position ${this.healPosition}, button ${btnIndex + 1}) - HP ${userHpPercent}%`);
        return btnIndex;
      }
    }

    // Priority 2+: Other skills by skillPriority order (skip healPosition)
    for (const pos of this.skillPriority) {
      if (pos < 1 || pos > skills.length || pos === this.healPosition) continue;
      const skill = skills[pos - 1];
      if (skill && skill.ready) {
        const btnIndex = pos; // pos1 → button[1], pos2 → button[2]
        this.log(`Smart: Chọn skill position ${pos} (button ${btnIndex + 1}) - Sẵn sàng`);
        return btnIndex;
      }
    }

    // Fallback: basic attack (button 0)
    this.log('Smart: Không có skill nào sẵn sàng → click skill 1 (Kiếm cơ bản)');
    return 0;
  }

  // Scan ALL buttons on screen with full context for debugging
  async scanAllButtons() {
    return await this.exec(`(() => {
      const allBtns = document.querySelectorAll('button[role="button"]');
      const result = [];
      allBtns.forEach((btn, idx) => {
        const text = btn.textContent.trim();
        if (text.length === 0 || btn.offsetParent === null) return;

        // Get context: parent message info
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

  // Find skill buttons that belong to battle messages
  // Strategy: find the LAST message with buttons, those are battle skills
  // If username is set, only look at messages containing the username
  async findBattleButtons() {
    const username = this.username || '';
    return await this.exec(`(() => {
      // Get all messages, find ones with buttons
      const msgs = document.querySelectorAll('[role="article"]');
      const username = ${JSON.stringify(username)};
      let battleMsg = null;
      let battleButtons = [];

      // Check last 30 messages (group chat can have many messages)
      const recentMsgs = Array.from(msgs).slice(-30).reverse();
      for (const msg of recentMsgs) {
        // If username is set, skip messages that don't contain it
        if (username && !msg.textContent.includes(username)) continue;

        const btns = msg.querySelectorAll('button[role="button"]');
        if (btns.length > 0) {
          battleMsg = msg;
          break;
        }
      }

      if (!battleMsg) return { buttons: [], msgId: 'none', msgPreview: '' };

      // Get all visible buttons in this message
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

  // Click a specific skill button (by index) in the last message that has buttons
  // If username is set, only click buttons in messages containing the username
  async clickSkillButton(btnIndex) {
    const username = this.username || '';
    return await this.exec(`(() => {
      // Find the last message with buttons
      const msgs = document.querySelectorAll('[role="article"]');
      const username = ${JSON.stringify(username)};
      const recentMsgs = Array.from(msgs).slice(-30).reverse();
      let targetMsg = null;
      for (const msg of recentMsgs) {
        // If username is set, skip messages that don't contain it
        if (username && !msg.textContent.includes(username)) continue;

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
            return { type: 'locked', requiredNpc: lockInfo.requiredNpc, winsLeft: lockInfo.winsLeft, lockMsgId: lockInfo.lockMsgId };
          }
        }
        this.log(`>>> COOLDOWN detected: ${cooldownSec}s <<<`);
        return { type: 'cooldown', sec: cooldownSec };
      }

      // === NEW: Find battle buttons from message context ===
      const battleInfo = await this.findBattleButtons();

      if (!battleInfo || !battleInfo.buttons || battleInfo.buttons.length === 0) {
        noButtonsCount++;

        // Debug: scan ALL buttons on first failure to help identify issue
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

      // Log buttons found (only when count changes)
      if (battleInfo.buttons.length !== lastLogCount) {
        this.log(`Found ${battleInfo.buttons.length} skills: ${battleInfo.buttons.map(b => b.text).join(' | ')}`);
        lastLogCount = battleInfo.buttons.length;
      }

      let btnIndex = -1;

      if (this.smartMode) {
        // Smart mode: read battle state and choose skill intelligently
        const battleState = await this.readBattleState();
        if (battleState) {
          this.log(`Smart: HP ${battleState.userHpPercent}% (${battleState.userHpCurrent}/${battleState.userHpMax}) | Skills: ${battleState.skills.map(s => `pos${s.position}(${s.ready ? '✅' : '⏳' + s.cooldownTurns})`).join(' | ')}`);
          this.log(`Smart DEBUG emojis: ${battleState.emojiDump}`);
          btnIndex = this.chooseSkill(battleState);
        } else {
          this.log('Smart: Không đọc được battle state, fallback pattern');
        }
      }

      if (btnIndex === -1) {
        // Legacy mode or smart mode fallback: use click pattern
        const pos = this.clickPattern[patternIndex % this.clickPattern.length];
        btnIndex = pos - 1;
        if (!this.smartMode) {
          this.log(`Pattern: chọn vị trí ${pos}`);
        }
      }

      if (btnIndex >= 0 && btnIndex < battleInfo.buttons.length) {
        const btn = battleInfo.buttons[btnIndex];
        this.log(`Click [${btnIndex + 1}]: "${btn.text}"`);

        // Click skill button in the battle message
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
    };
  }
}

module.exports = { NpcBot };
