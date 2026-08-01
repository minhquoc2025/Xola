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
    // Sell state
    this.pendingSellItems = new Set(); // items sent sell command, waiting decompose
    this.sellInventory = [];
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

  async typeTrustedChar(ch) {
    await this.wc.sendInputEvent({ type: 'char', keyCode: ch });
  }

  async typeTrustedString(str) {
    for (const ch of str) {
      await this.wc.sendInputEvent({ type: 'char', keyCode: ch });
      await this.delay(this.rand(60, 120));
    }
  }

  async pressTrustedKey(keyCode) {
    await this.wc.sendInputEvent({ type: 'keyDown', keyCode });
    await this.wc.sendInputEvent({ type: 'keyUp', keyCode });
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

  async sendMessage(cmd) {
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

  async sendNpcCommand() {
    return this.sendMessage(`!npc ${this.npcNumber}`);
  }

  async scanSellItems() {
    try {
      // Focus textbox via click
      await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
      await this.delay(500);

      // Clear textbox with Ctrl+A then Backspace (trusted)
      await this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: ['control'] });
      await this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: [] });
      await this.delay(100);
      await this.pressTrustedKey('Backspace');
      await this.delay(200);

      // Type "/sell " using trusted events → triggers slash command autocomplete
      this.log(`Scan: typing '/sell '...`);
      await this.typeTrustedString('/sell ');
      await this.delay(2500);

      // Debug: check textbox content
      const tbText = await this.exec(`document.querySelector('[role="textbox"]')?.textContent || 'EMPTY'`);
      this.log(`Scan: textbox = "${tbText}"`);

    // Read autocomplete items from DOM
    const items = await this.exec(`(() => {
      const items = [];
      const seen = new Set();
      // Discord autocomplete popup - try many selectors
      const popups = document.querySelectorAll('[role="listbox"] [role="option"], [class*="autocomplete"] [role="option"], [class*="command"] [role="option"], [id*="autocomplete"] [role="option"], [data-mode="autocomplete"] [role="option"]');
      for (const opt of popups) {
        const text = opt.textContent || '';
        const m = text.match(/\\((\\d+)\\)\\s*(.*)/);
        if (m) {
          const id = m[1];
          const rest = m[2].trim();
          if (seen.has(id)) continue;
          seen.add(id);
          const colorMatch = rest.match(/^([^\w\\s]+)\\s+(.+)/);
          if (colorMatch) {
            items.push({ id, color: colorMatch[1], name: colorMatch[2].trim(), raw: text.trim() });
          } else {
            items.push({ id, color: 'other', name: rest, raw: text.trim() });
          }
        }
      }
      // Debug: also log all option elements found
      const allOpts = document.querySelectorAll('[role="option"]');
      const debugOpts = Array.from(allOpts).slice(0, 5).map(o => (o.textContent || '').substring(0, 100));
      return { items, debugTotal: allOpts.length, debugOpts };
    })()`);
    this.log(`Sell scan: found ${items.items.length} items, ${items.debugTotal} options, debug: ${JSON.stringify(items.debugOpts || [])}`);

    // Close autocomplete by pressing Escape (trusted)
    await this.pressTrustedKey('Escape');
    await this.delay(200);

    // Clear textbox with Ctrl+A + Backspace (trusted)
    await this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: ['control'] });
    await this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: [] });
    await this.delay(100);
    await this.pressTrustedKey('Backspace');

    this.sellInventory = items.items || [];

    const currentIds = new Set(this.sellInventory.map(i => i.id));
    for (const id of this.pendingSellItems) {
      if (!currentIds.has(id)) {
        this.pendingSellItems.delete(id);
        this.log(`Sell: ID ${id} da het trong kho, xoa khoi danh sach cho`);
      }
    }

    this.sellInventory = this.sellInventory.filter(i => !this.pendingSellItems.has(i.id));

    this.log(`Sell: Tim thay ${this.sellInventory.length} vat pham (${this.pendingSellItems.size} dang cho phan tach)`);
    return this.sellInventory;
    } catch(e) {
      this.log(`Scan error: ${e.message}`);
      return [];
    }
  }

  async sellItem(itemId) {
    if (this.pendingSellItems.has(itemId)) {
      this.log(`Sell: ID ${itemId} đã gửi lệnh bán, đang chờ quy đổi`);
      return { sent: false, reason: 'pending' };
    }

    try {
    // Focus textbox via click (exec is fine for this)
    await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
    await this.delay(300);

    // Clear textbox with Ctrl+A then Backspace (trusted)
    await this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: ['control'] });
    await this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: [] });
    await this.delay(100);
    await this.pressTrustedKey('Backspace');
    await this.delay(200);

    // Type "/sell " using trusted events → triggers slash command autocomplete
    this.log(`Sell: Typing '/sell ' (trusted input)`);
    await this.typeTrustedString('/sell ');
    await this.delay(2000);

    // Check if autocomplete options appeared
    const options = await this.exec(`(() => {
      const opts = document.querySelectorAll('[id^="autocomplete-"] [role="option"], [class*="autoComplete"] [role="option"], [role="listbox"] [role="option"], [data-mode="autocomplete"] [role="option"]');
      const result = [];
      for (const opt of opts) {
        const text = opt.textContent || '';
        if (text.includes('${itemId}') || text.includes('(${itemId})')) {
          result.push(text.trim().substring(0, 80));
        }
      }
      return { total: opts.length, matched: result };
    })()`);
    this.log(`Sell: Autocomplete: ${options.total} options, matched: ${JSON.stringify(options.matched)}`);

    // Type the item ID to filter autocomplete (trusted)
    const idStr = String(itemId);
    this.log(`Sell: Typing ID '${idStr}' to filter`);
    await this.typeTrustedString(idStr);
    await this.delay(1000);

    // Try clicking matching option (exec is fine for DOM click)
    const clicked = await this.exec(`(() => {
      const opts = document.querySelectorAll('[id^="autocomplete-"] [role="option"], [class*="autoComplete"] [role="option"], [role="listbox"] [role="option"], [data-mode="autocomplete"] [role="option"]');
      for (const opt of opts) {
        const text = opt.textContent || '';
        if (text.includes('${itemId}') || text.includes('(${itemId})')) {
          opt.click();
          return 'clicked';
        }
      }
      return 'not_found';
    })()`);
    this.log(`Sell: Click result: ${clicked}`);

    // Press Enter to select (trusted)
    await this.delay(300);
    await this.pressTrustedKey('Return');

    // Press Enter again to send the slash command (trusted)
    await this.delay(500);
    await this.pressTrustedKey('Return');

    this.pendingSellItems.add(itemId);
    this.log(`Sell: Da gui lenh ban ID ${itemId} (click=${clicked})`);
    return { sent: true };
    } catch(e) {
      this.log(`Sell error: ${e.message}`);
      return { sent: false, reason: e.message };
    }
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

      // Get current position in pattern
      const pos = this.clickPattern[patternIndex % this.clickPattern.length];
      const btnIndex = pos - 1;

      if (btnIndex < battleInfo.buttons.length) {
        const btn = battleInfo.buttons[btnIndex];
        this.log(`Click [${pos}]: "${btn.text}"`);

        // Click skill button in the battle message
        const clicked = await this.clickSkillButton(btnIndex);
        if (!clicked) {
          this.log(`Failed to click button at position ${pos}`);
        }

        patternIndex++;
      } else {
        this.log(`Position ${pos} not available (only ${battleInfo.buttons.length} skills)`);
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
