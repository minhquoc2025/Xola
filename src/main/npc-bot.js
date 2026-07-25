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
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.runId = Date.now();
    this.battleCount = 0;
    this.log('Bot started');
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

    if (this.battleCount >= this.totalBattles) {
      this.log('=== COMPLETED ALL BATTLES ===');
      this.stop();
      return;
    }

    this.log(`\n=== Battle ${this.battleCount + 1}/${this.totalBattles} ===`);

    // Step 1: Send !npc command
    await this.sendNpcCommand();
    await this.delay(4000);

    const cooldownSec = await this.checkCooldownMessage();
    if (cooldownSec > 0) {
      this.log(`Bot is on cooldown. Waiting for ${cooldownSec}s before retrying...`);
      await this.cooldownWait(cooldownSec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }

    const isAlreadyFighting = await this.checkAlreadyFighting();
    if (isAlreadyFighting) {
      this.log('Phát hiện trận đánh đang dở! Đang cuộn lên để tìm nút...');
    }

    // Step 2: Click buttons in pattern until battle ends
    const battleResult = await this.clickButtonsUntilEnd(isAlreadyFighting, runId);
    if (typeof battleResult === 'object' && battleResult.type === 'cooldown') {
      this.log(`Bot is on cooldown. Waiting for ${battleResult.sec}s before retrying...`);
      await this.cooldownWait(battleResult.sec, runId);
      if (this.isRunning && this.runId === runId) this.mainLoop(runId);
      return;
    }
    if (!battleResult) {
      this.log('Stopped during battle');
      return;
    }

    this.battleCount++;
    this.log(`Battle ${this.battleCount}/${this.totalBattles} completed!`);

    // Step 3: Wait 2 minutes then continue
    if (this.battleCount < this.totalBattles) {
      await this.cooldownWait(null, runId);
    }

    // Step 4: Loop again
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
      const recent = Array.from(msgs).slice(-10);
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
        if (text.includes('kết quả trận đấu') || text.includes('battle ended') || text.includes('ket thuc') || text.includes('kết thúc')) {
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
      const ended = await this.checkBattleEnd();
      if (ended) {
        this.log('>>> BATTLE ENDED detected! <<<');
        return true;
      }

      const cooldownSec = await this.checkCooldownMessage();
      if (cooldownSec > 0) {
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
          return true;
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
          return true;
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
    };
  }
}

module.exports = { NpcBot };
