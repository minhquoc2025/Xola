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
    if (config.smartMode !== undefined) this.smartMode = config.smartMode;
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
    this.log('=== SMART MODE: Đọc turn real-time ===');
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

    // Auto Climb: check lock BEFORE sendNpcCommand updates botMaxMsgId
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

  // ===== SMART MODE: Read battle state from DOM =====
  async readBattleState() {
    return await this.exec(`(() => {
      const msgs = document.querySelectorAll('[role="article"]');
      const recentMsgs = Array.from(msgs).slice(-10).reverse();

      let battleMsg = null;
      for (const msg of recentMsgs) {
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

      // Read ALL emoji data-name from embed
      const allEmoji = Array.from(battleMsg.querySelectorAll('img[data-name]'));
      const emojiSeq = allEmoji.map(e => (e.getAttribute('data-name') || '').toLowerCase());

      // Classify
      const isSkillIcon = (name) => /dagger|crossed_swords|sword|skull_and_crossbones|skull|green_heart|heart_green|crystal_ball|gem/.test(name);
      const isReadyIcon = (name) => /white_check_mark|check_mark_button|heavy_check_mark|check_mark/.test(name);
      const isCooldownIcon = (name) => /hourglass/.test(name);

      // Pattern: skill1, status1, skill2, status2, ... (xen kẽ)
      // Find the section with skill+status pairs
      const skills = [];
      const allText = battleMsg.textContent;
      let lastCdSearchPos = 0; // track position for ⏳ number extraction

      for (let i = 0; i < emojiSeq.length; i++) {
        if (!isSkillIcon(emojiSeq[i])) continue;

        let iconType = 'unknown';
        const name = emojiSeq[i];
        if (/dagger|crossed_swords|sword/.test(name)) iconType = 'sword';
        else if (/skull/.test(name)) iconType = 'poison';
        else if (/green_heart|heart_green/.test(name)) iconType = 'heal';
        else if (/crystal_ball|gem/.test(name)) iconType = 'magic';

        // Check NEXT emoji for status
        let isReady = true;
        let cooldownTurns = 0;
        if (i + 1 < emojiSeq.length) {
          const nextName = emojiSeq[i + 1];
          if (isCooldownIcon(nextName)) {
            isReady = false;
            // Find cooldown number: search ⏳ in text starting from last position
            const cdIdx = allText.indexOf('⏳', lastCdSearchPos);
            if (cdIdx >= 0) {
              lastCdSearchPos = cdIdx + 1;
              const after = allText.substring(cdIdx + 1, cdIdx + 4);
              const numMatch = after.match(/(\\d+)/);
              if (numMatch) cooldownTurns = parseInt(numMatch[1]);
            }
          } else if (isReadyIcon(nextName)) {
            isReady = true;
          }
        }

        skills.push({ icon: iconType, ready: isReady, cooldownTurns });
      }

      // Fallback: if no emoji detected, use button text (assume all ready)
      if (skills.length === 0) {
        const btns = battleMsg.querySelectorAll('button[role="button"]');
        btns.forEach(btn => {
          const t = btn.textContent.trim();
          if (t.length > 0 && btn.offsetParent !== null) {
            let iconType = 'unknown';
            if (t.includes('Kịch Độc')) iconType = 'poison';
            else if (t.includes('Phá Giáp')) iconType = 'sword';
            else if (t.includes('Hồi Phục')) iconType = 'heal';
            else if (t.includes('Cơ Bản')) iconType = 'basic';
            skills.push({ icon: iconType, ready: true, cooldownTurns: 0 });
          }
        });
      }

      // Buttons
      const btns = battleMsg.querySelectorAll('button[role="button"]');
      const buttonTexts = [];
      btns.forEach(btn => {
        const t = btn.textContent.trim();
        if (t.length > 0 && btn.offsetParent !== null) buttonTexts.push(t);
      });

      return {
        userHpPercent, userHpCurrent, userHpMax,
        skills, buttonCount: buttonTexts.length, buttonTexts,
        emojiDump: emojiSeq.slice(0, 40).join(' | ')
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

    // skills[] = [sword, poison, heal] (from emoji, no basic)
    // buttons[] = [Kiếm Cơ Bản, 🗡️ Phá Giáp, ☠️ Kịch Độc, 💚 Hồi Phục]
    // skills[0]=sword → buttons[1], skills[1]=poison → buttons[2], skills[2]=heal → buttons[3]
    // So buttonIndex = skillsIndex + 1

    const poisonIdx = skills.findIndex(s => s.icon === 'poison');
    const swordIdx = skills.findIndex(s => s.icon === 'sword');
    const healIdx = skills.findIndex(s => s.icon === 'heal');

    // Priority 1: 💚 (heal) if HP < 60% → heal first!
    if (healIdx >= 0 && skills[healIdx].ready) {
      if (userHpPercent >= 0 && userHpPercent < 60) {
        this.log(`Smart: Chọn 💚 (button ${healIdx + 1 + 1}) - HP thấp ${userHpPercent}%`);
        return healIdx + 1;
      }
    }

    // Priority 2: ☠️ (poison/kill) if ready
    if (poisonIdx >= 0 && skills[poisonIdx].ready) {
      this.log(`Smart: Chọn ☠️ (button ${poisonIdx + 1 + 1}) - Sẵn sàng`);
      return poisonIdx + 1;
    }

    // Priority 3: 🗡️ (sword/attack) if ready
    if (swordIdx >= 0 && skills[swordIdx].ready) {
      this.log(`Smart: Chọn 🗡️ (button ${swordIdx + 1 + 1}) - Sẵn sàng`);
      return swordIdx + 1;
    }

    // Priority 4: No skill ready → fallback click skill 1 (basic attack)
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
  async findBattleButtons() {
    return await this.exec(`(() => {
      // Get all messages, find ones with buttons
      const msgs = document.querySelectorAll('[role="article"]');
      let battleMsg = null;
      let battleButtons = [];

      // Check last 10 messages for one that has buttons
      const recentMsgs = Array.from(msgs).slice(-10).reverse();
      for (const msg of recentMsgs) {
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
  async clickSkillButton(btnIndex) {
    return await this.exec(`(() => {
      // Find the last message with buttons
      const msgs = document.querySelectorAll('[role="article"]');
      const recentMsgs = Array.from(msgs).slice(-10).reverse();
      let targetMsg = null;
      for (const msg of recentMsgs) {
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
            return { type: 'locked', requiredNpc: lockInfo.requiredNpc, winsLeft: lockInfo.winsLeft };
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
          this.log(`Smart: HP ${battleState.userHpPercent}% (${battleState.userHpCurrent}/${battleState.userHpMax}) | Skills: ${battleState.skills.map(s => `${s.icon}(${s.ready ? '✅' : '⏳' + s.cooldownTurns})`).join(' | ')}`);
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
