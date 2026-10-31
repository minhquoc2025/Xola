const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DIANGUC_DATA_FILE = path.resolve(__dirname, '..', '..', 'dianguc_data.xlsx');
const DIANGUC_DIRECTIONS = ['lên', 'xuống', 'trái', 'phải'];
const DIANGUC_PRIORITY_PATTERNS = [
  '+__% ALL STATS',
  '+__% ATK',
  '+__% DEF',
  '+__% HP',
  'Miễn Tử',
  '-__% HP Quái',
  'Huyết Sát Quyết',
  'Diêm Vương Chi Hỏa',
  '+__% Hút Máu',
];

function diangucNormalize(text) {
  return String(text || '').replace(/[^\p{L}\p{N}%+\-.,\s]/gu, '').replace(/\s*%\s*/g, '% ').replace(/\s+/g, ' ').trim();
}

function diangucPatternRegex(pattern) {
  const normalized = diangucNormalize(pattern);
  return new RegExp(`^${normalized.split('__').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\d+(?:[.,]\\d+)?')}$`, 'iu');
}

const DIANGUC_COMPILED_PATTERNS = DIANGUC_PRIORITY_PATTERNS.map(diangucPatternRegex);

// Lệnh dọn túi chạy sau khi spam /roll_x10 hoàn thành target: bán sao 1-3 sao.
const SELLALL_STAR_CMDS = [
  '/sellall star:🔵 1 Sao',
  '/sellall star:🟢 2 Sao',
  '/sellall star:🟡 3 Sao',
];

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
    // Giới hạn mỗi trận NPC: hết giờ thì !ketthuc + !npc để bắt đầu lại,
    // fix case game không phản hồi nhưng vẫn cho click skill (vòng lặp vô tận).
    this.battleTimeoutMs = 5 * 60 * 1000;
    this.buttonDelayMs = 2000;
    // Delay giữa 2 lần click skill — dùng chung cho NPC / Luân Hồi / Bí Cảnh / Địa Ngục
    this.skillClickDelayMs = 1000;
    // Thời gian chờ trước khi thử lại nếu không tìm thấy skill đích trong combo (cooldown/chưa render).
    // Chờ chứ không nhảy cóc để giữ đúng quỹ đạo cooldown của game.
    this.skillRetryWaitMs = 2000;
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
    this.luanhoiSkillNames = ['Kiếm Cơ Bản', 'Liên Hoàn Kích', 'Trọng Kích', 'Phá Giáp', 'Xuyên Tâm', 'Liệt Hỏa Trảm', 'Hấp Huyết', 'Kịch Độc', 'Lôi Kích', 'Tuyệt Sát', 'Thần Uy', 'Băng Phong', 'Phòng Ngự', 'Phản Kích', 'Hồi Phục', 'Hộ Thuẫn', 'Hỏa Giáp', 'Chống Xỏ Lá', 'Thái Cực Dưỡng Sinh', 'Kiếm Khí Xung Thiên', 'Kim Cương Phục Ma', 'Hỗn Nguyên Hộ Thể', 'Vạn Kiếm Quy Tông', 'Phong Ấn Thất Mạch', 'Cửu Chuyển Hồi Xuân', 'Kim Đan Phá Sát', 'Tam Muội Chân Hỏa', 'Bất Diệt Kim Thân', 'Hư Không Đại Na Di', 'Nguyên Anh Xuất Khiếu'];
    this.luanhoiSkillIdx = 0;
    this.luanhoiCurrentTier = 0;
    this.luanhoiBuffInit = false;
    this.lastLuanhoiTarget = null;
    this.bicanh = false;
    this.bicanhCmd = '!bicanh';
    this.bicanhSkillOrder = [];
    this._bicanhSkillIdx = 0;
    this.upgradeCmd = '/upgrade hp';
    this.upgradeType = 'hp';
    this.upgradeDelayMs = 2000;
    this.upgradeCount = 0;
    this.spamCount = 10;
    this.spamType = 'hp';
    this.dianguc = false;
    this.diangucCmd = '!dianguc';
    this.diangucDelayMs = 2000;
    this.diangucChoiceDelayMs = 2000;
    this.diangucBuffWaitMs = 10000;
    this.diangucWinDelayMs = 3500;
    this.diangucFloor = 0;
    this.diangucStep = 0;
    this.diangucPending = null;
    this.diangucSkillIdx = 0;
    this.diangucResolvedBattleIds = new Set();
    this.diangucLastScanSignature = '';
    this.diangucLastBuffKey = '';
    this.diangucLastBuffClickAt = 0;
    this.diangucBuffWaitKey = '';
    this.diangucBuffWaitStartedAt = 0;
    this.diangucData = {};
    this.diangucLastSaved = 0;
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
    this.luanhoiAutoRestart = true;
    this.luanhoiRestartDelaySec = 5;
    this.luanhoiTotalRuns = 0;  // 0 = kh\u00f4ng gi\u1edbi h\u1ea1n
    this.luanhoiRunCount = 0;   // \u0111\u1ebfm s\u1ed1 l\u1ea7n v\u01b0\u1ee3t t\u1ea7ng trong phi\u00ean hi\u1ec7n t\u1ea1i
    // Log debug: bật qua env XOLA_DEBUG=1 hoặc bot.debug = true
    this.debug = process.env.XOLA_DEBUG === '1';
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

  // Chỉ in khi this.debug = true — dùng cho log chẩn đoán/verbose lặp nhiều lần
  // mà không làm nhiễu log chính.
  logDebug(...args) {
    if (!this.debug) return;
    const msg = `[${this.ts()}] [Bot ${this.idx}] [DEBUG] ${args.join(' ')}`;
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

  normalizeMatchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd')
      .replace(/\u01A1/g, 'o')
      .replace(/\u01B0/g, 'u')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  isUserMentionedAsSpeaker(text, username) {
    const rawText = String(text || '');
    const normalizedText = this.normalizeMatchText(rawText);
    const normalizedUsername = this.normalizeMatchText(username);
    if (!normalizedUsername || !normalizedText) return false;

    const usernameIndex = normalizedText.indexOf(normalizedUsername);
    if (usernameIndex < 0) return false;

    const beforeUsername = normalizedText.slice(0, usernameIndex).trim();
    return !/(?:^|[\s(])(?:[a-z0-9]+)\s*:\s*$/.test(beforeUsername);
  }

  isOwnedGameMessage(text, username, keywords = []) {
    if (!username) return true;
    const rawText = String(text || '');
    const normalizedText = this.normalizeMatchText(rawText);
    const normalizedUsername = this.normalizeMatchText(username);
    if (!normalizedUsername || !normalizedText) return true;

    const userTokens = normalizedUsername.split(/\s+/).filter(Boolean);
    const usernameIndex = userTokens
      .map(token => normalizedText.indexOf(token))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0];
    if (usernameIndex === undefined) return false;

    const beforeUsername = normalizedText.slice(0, usernameIndex).trim();
    if (/(?:^|[\s(])(?:[a-z0-9]+)\s*:\s*$/.test(beforeUsername)) return false;

    const gameKeywords = [
      'npc', 'battle', 'đánh', 'thắng', 'thua', 'kết quả', 'cooldown', 'hồi chiêu',
      'bị khóa', 'giết npc', 'luân hồi', 'địa ngục', 'fight', 'result', 'boss',
      ...keywords
    ].map(keyword => this.normalizeMatchText(keyword));

    return gameKeywords.some(keyword => keyword && normalizedText.includes(this.normalizeMatchText(keyword)));
  }

  async luanhoiClickWait(minMs = 1800) {
    // Luân Hồi riêng: cap 1200ms thay vì max với buttonDelayMs (mặc định 2000ms).
    // Mỗi tầng gọi hàm này 2-3 lần nên tiết kiệm ~800ms/lần, ~2s/tầng, mà vẫn đủ
    // cho Discord nhận click; các bước sau đều kiểm tra lại trạng thái game nên
    // click chưa kịp cũng chỉ là chờ thêm 1 vòng poll, không sai logic.
    await this.delay(Math.min(1200, Math.max(800, minMs)));
  }

  // Game gửi tin nhắn ephemeral RIÊNG (DOM node mới, không nằm trong card battle), ví dụ
  // "⏳ Vạn Kiếm Quy Tông đang hồi! Còn 1 turn." + footer "Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn".
  // Vì node này có chứa chữ "⏳ / đang hồi" và có button nên các detector cooldown/battle
  // dễ tưởng nhầm là message game -> gắn nhãn data-bot-ephemeral để các detector khác bỏ qua,
  // rồi click link "Bỏ qua tin nhắn" để không dồn card che mất nút skill.
  async dismissEphemeralMessages() {
    const markerNeedles = ['chi ban moi', 'thay dieu nay'].map(text => this.normalizeMatchText(text));
    const dismissNeedle = this.normalizeMatchText('Bỏ qua tin nhắn');
    const clicked = await this.exec(`(() => {
      const markerNeedles = ${JSON.stringify(markerNeedles)};
      const dismissNeedle = ${JSON.stringify(dismissNeedle)};
      const nd = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd')
        .replace(/\u01A1/g, 'o').replace(/\u01A0/g, 'o')
        .replace(/\u01B0/g, 'u').replace(/\u01AF/g, 'u')
        .toLowerCase().replace(/\s+/g, ' ').trim();

      // Node ephemeral có thể là [role="article"] hoặc thẻ bọc mang class "ephemeral".
      const nodes = Array.from(document.querySelectorAll('[role="article"], [class*="ephemeral"]'));
      const recent = nodes.slice(-40).reverse();
      let clicked = null;
      for (const node of recent) {
        const text = nd(node.textContent);
        if (!markerNeedles.some(needle => text.includes(needle))) continue;
        node.setAttribute('data-bot-ephemeral', 'true');
        if (clicked) continue;
        if (node.getAttribute('data-bot-ephemeral-dismissed') === 'true') continue;
        const links = Array.from(node.querySelectorAll('a, button, [role="button"]'));
        for (const link of links) {
          const raw = (link.textContent || '').trim();
          if (!raw || !nd(raw).includes(dismissNeedle)) continue;
          node.setAttribute('data-bot-ephemeral-dismissed', 'true');
          link.disabled = false;
          link.click();
          clicked = raw;
          break;
        }
      }
      return clicked;
    })()`);

    if (clicked) this.log(`🧹 Đã dismiss tin nhắn ephemeral: "${clicked}"`);
    return clicked;
  }

  handleLock(lockInfo) {
    this.log(`🔒 NPC ${this.npcNumber} bị khóa! → Chuyển NPC ${lockInfo.requiredNpc}, cần thắng ${lockInfo.winsLeft} lần.`);
    this.npcNumber = lockInfo.requiredNpc;
    this.climbWinsNeeded = lockInfo.winsLeft;
    this.climbWinsDone = 0;
    if (lockInfo.lockMsgId) this.processedLockIds.add(lockInfo.lockMsgId);
  }

  normalizeSkillOrder(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    const normalized = raw
      .map(item => Number(String(item).trim()))
      .filter(item => Number.isInteger(item) && item >= 1 && item <= this.luanhoiSkillNames.length);
    return normalized;
  }

  updateConfig(config) {
    if (config.npcNumber !== undefined) this.npcNumber = config.npcNumber;
    if (config.totalBattles !== undefined) this.totalBattles = config.totalBattles;
    if (config.cooldownMs !== undefined) this.cooldownMs = config.cooldownMs;
    if (config.buttonDelayMs !== undefined) this.buttonDelayMs = config.buttonDelayMs;
    if (config.skillClickDelayMs !== undefined) {
      const ms = Number(config.skillClickDelayMs);
      if (Number.isFinite(ms)) this.skillClickDelayMs = Math.min(10000, Math.max(100, Math.round(ms)));
    }
    if (config.skillRetryWaitMs !== undefined) {
      const ms = Number(config.skillRetryWaitMs);
      if (Number.isFinite(ms)) this.skillRetryWaitMs = Math.min(10000, Math.max(100, Math.round(ms)));
    }
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
    if (config.luanhoiTotalRuns !== undefined) this.luanhoiTotalRuns = config.luanhoiTotalRuns;
    if (config.dianguc !== undefined) this.dianguc = config.dianguc;
    if (config.diangucCmd !== undefined) this.diangucCmd = config.diangucCmd;
    if (config.diangucDelayMs !== undefined) this.diangucDelayMs = config.diangucDelayMs;
    if (config.diangucChoiceDelayMs !== undefined) this.diangucChoiceDelayMs = config.diangucChoiceDelayMs;
    if (config.diangucBuffWaitMs !== undefined) {
      const ms = Number(config.diangucBuffWaitMs);
      if (Number.isFinite(ms)) this.diangucBuffWaitMs = Math.min(120000, Math.max(0, Math.round(ms)));
    }
    if (config.diangucWinDelayMs !== undefined) this.diangucWinDelayMs = config.diangucWinDelayMs;
    if (config.bicanhSkillOrder !== undefined) {
      this.bicanhSkillOrder = this.normalizeSkillOrder(config.bicanhSkillOrder);
      this._bicanhSkillIdx = 0;
    }
    if (config.upgradeCmd !== undefined) this.upgradeCmd = String(config.upgradeCmd || '/upgrade hp');
    if (config.upgradeType !== undefined) this.upgradeType = String(config.upgradeType || 'hp');
    if (config.upgradeDelayMs !== undefined) {
      const ms = Number(config.upgradeDelayMs);
      if (Number.isFinite(ms)) this.upgradeDelayMs = Math.min(60000, Math.max(100, Math.round(ms)));
    }
    if (config.spamCount !== undefined) {
      const c = Number(config.spamCount);
      if (Number.isFinite(c)) this.spamCount = Math.min(9999, Math.max(1, Math.round(c)));
    }
    if (config.spamType !== undefined) this.spamType = String(config.spamType || '');
    if (config.battleTimeoutMs !== undefined) {
      const ms = Number(config.battleTimeoutMs);
      if (Number.isFinite(ms)) this.battleTimeoutMs = Math.min(60 * 60 * 1000, Math.max(60000, Math.round(ms)));
    }
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
    this.luanhoiRunCount = 0;
    this.lastLuanhoiTarget = null;
    this.diangucPending = null;
    this.diangucSkillIdx = 0;
    this.diangucResolvedBattleIds = new Set();
    this.diangucLastScanSignature = '';
    this.diangucLastBuffKey = '';
    this.diangucLastBuffClickAt = 0;
    this.log('Bot started');
    if (this.mode === 'luanhoi') {
      this.log(`=== LUÂN HỒI MODE: Target tầng ${this.luanhoiTarget} ===`);
      this.luanhoiLoop(this.runId);
      return;
    }
    if (this.mode === 'bicanh') {
      this.log(`=== BICANH MODE: Spam技能 theo thứ tự ===`);
      this._bicanhSkillIdx = 0;
      this.bicanhLoop(this.runId);
      return;
    }
    if (this.mode === 'upgrade') {
      this.log(`=== SPAM MODE: ${this.upgradeCmd} mỗi ${this.upgradeDelayMs}ms | gửi ${this.spamCount} lần ===`);
      this.upgradeCount = 0;
      this.upgradeLoop(this.runId);
      return;
    }
    if (this.mode === 'dianguc') {
      this.log(`=== ĐỊA NGỤC MODE: ${this.diangucCmd} ===`);
      this.log(`=== ĐỊA NGỤC SKILLS: ${this.luanhoiSkillNames.join(' -> ')} ===`);
      this.diangucLoop(this.runId);
      return;
    }
    this.log('=== NPC MODE: Combo skill theo cấu hình Bicanh ===');
    this.log(`=== COMBO: ${this.bicanhSkillOrder.join(' → ')} ===`);
    this._bicanhSkillIdx = 0;
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
    if (this.mode === 'dianguc') this.saveDiangucData();
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

    // Parse số phần thưởng: hỗ trợ "2,916" (=2916), "14.0K"/"14K" (=14000),
    // "1.2M"/"1,2M" (=1200000), "3B" (=3000000000). Không hậu tố → bỏ dấu ., (ngăn cách nghìn).
    const parseRewardNumber = (raw) => {
      if (raw == null) return 0;
      let s = String(raw).trim().toUpperCase().replace(/\s/g, '');
      if (!s) return 0;
      let mult = 1;
      const suffix = s.slice(-1);
      if (suffix === 'K' || suffix === 'M' || suffix === 'B') {
        mult = suffix === 'K' ? 1000 : suffix === 'M' ? 1000000 : 1000000000;
        s = s.slice(0, -1);
      }
      if (mult > 1) {
        // Có hậu tố K/M/B → phần số là thập phân: "14.0" / "14,0" đều = 14.0
        const num = parseFloat(s.replace(/,/g, '.'));
        return Number.isFinite(num) ? Math.round(num * mult) : 0;
      }
      const num = parseInt(s.replace(/[.,]/g, ''), 10);
      return Number.isFinite(num) ? num : 0;
    };

    // Summary là dòng TỔNG ở cuối ("💰 +532 🪙 ✨ +235 XP", "💰 +2,916 🪙 ✨ +14.0K XP" hoặc "+572 +253 XP").
    // Bỏ qua các dòng breakdown có tên phía trước ("💰 Quất Bất Lực: +350🪙 +159XP") — chứa ':' trước số.
    // Lấy dòng hợp lệ CUỐI CÙNG vì tổng luôn nằm dưới các dòng cộng dồn từng nguồn.
    const NUM = '[\\d.,]+\\s*[KMBkmb]?';
    for (const line of allLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let summaryMatch = trimmed.match(new RegExp(`^\\+(${NUM})\\s+\\+\\s*(${NUM})\\s*XP`, 'i'));
      if (!summaryMatch) {
        const m = trimmed.match(new RegExp(`^([^:+]*)\\+(${NUM})\\s*🪙[^+]*\\+\\s*(${NUM})\\s*XP`, 'i'));
        if (m && !m[1].includes(':')) {
          summaryMatch = [trimmed, m[2], m[3]];
        }
      }
      if (summaryMatch) {
        lastCoins = parseRewardNumber(summaryMatch[1]);
        lastExp = parseRewardNumber(summaryMatch[2]);
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

  async upgradeLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;
    this.log('\n=== 💀 SPAM MODE ===');
    const maxCount = this.spamCount || 10;
    while (this.isRunning && this.runId === runId) {
      if (this.upgradeCount >= maxCount) break;
      try {
        if (this.spamType === 'waifu_roll') {
          await this.sendSlashChat('/waifu roll 10');
        } else {
          await this.sendSlashChat(this.upgradeCmd);
        }
        this.upgradeCount++;
        if (this.upgradeCount % 10 === 0 || this.upgradeCount === maxCount) {
          this.log(`💀 Đã gửi ${this.upgradeCount}x: ${this.spamType === 'waifu_roll' ? 'waifu roll count: 10' : this.upgradeCmd}`);
        }
      } catch (e) {
        this.log('⚠️ Gửi lệnh spam lỗi:', e.message);
      }
      if (this.upgradeCount >= maxCount) break;
      await this.delay(this.upgradeDelayMs);
    }
    const doneTarget = this.upgradeCount >= maxCount;
    this.log(`⏹ SPAM MODE đã dừng sau ${this.upgradeCount} lần gửi.`);
    // Chỉ dọn túi khi người dùng chọn spam /roll_x10 và đã đạt target.
    if (doneTarget && this.isRollX10Spam()) {
      await this.sellAllStars();
    }
    this.isRunning = false;
    this.runId = null;
  }

  // Người dùng có chọn spam /roll_x10 không (theo loại spam hoặc lệnh đã gửi).
  isRollX10Spam() {
    return this.spamType === 'roll_x10' || this.upgradeCmd === '/roll_x10';
  }

  // Dọn túi: bán hết sao 1-3 sao bằng /sellall.
  async sellAllStars() {
    this.log(`🧹 Dọn túi: gửi ${SELLALL_STAR_CMDS.length} lệnh /sellall...`);
    for (const cmd of SELLALL_STAR_CMDS) {
      try {
        await this.sendSlashChat(cmd);
        this.log(`🧹 Đã gửi: ${cmd}`);
      } catch (e) {
        this.log('⚠️ Dọn túi lỗi:', e.message);
      }
      await this.delay(Math.max(500, this.upgradeDelayMs));
    }
    this.log('🧹 Dọn túi xong.');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      upgradeCmd: this.upgradeCmd,
      upgradeType: this.upgradeType,
      upgradeCount: this.upgradeCount,
      spamCount: this.spamCount,
      spamType: this.spamType,
      battleCount: this.battleCount,
      luanhoiTarget: this.luanhoiTarget,
      lastLuanhoiTarget: this.lastLuanhoiTarget,
      luanhoiTotalRuns: this.luanhoiTotalRuns,
      luanhoiRunCount: this.luanhoiRunCount,
      totalBattles: this.totalBattles,
      npcNumber: this.npcNumber,
      cooldownMs: this.cooldownMs,
      autoClimb: this.autoClimb,
      targetMaxNpc: this.targetMaxNpc,
      tuLuyen: this.tuLuyen,
      tuLuyenAfterTarget: this.tuLuyenAfterTarget,
      tuLuyenActive: this._tuLuyenActive,
      diangucFloor: this.diangucFloor,
      diangucStep: this.diangucStep,
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
    if (isUnknown) {
      if (this.autoClimb) {
        const lockInfo = await this.checkLockedMessage();
        if (lockInfo) {
          this.handleLock(lockInfo);
          if (this.isRunning && this.runId === runId) await this.mainLoop(runId);
          return;
        }
      }
      this.log(`⚠️ NPC ${this.npcNumber}: không xác nhận được kết quả trận. Chờ ${this.defeatCooldownSec}s rồi thử lại...`);
      await this.cooldownWait(this.defeatCooldownSec, runId);
      if (this.isRunning && this.runId === runId) await this.mainLoop(runId);
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

  // Enter đáng tin (trusted) qua webContents — Electron chỉ nhận { type, keyCode },
  // thừa field (code/key/textCode) sẽ ném "Invalid event object".
  async pressEnterTrusted() {
    try {
      if (this.wc && typeof this.wc.sendInputEvent === 'function') {
        this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
        await this.delay(60);
        this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
        return true;
      }
    } catch (e) {
      this.logDebug('trusted Enter lỗi, fallback dispatchEvent:', e.message);
    }
    await this.exec(`(() => {
      const el = document.querySelector('[role="textbox"]');
      if (!el) return;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    })()`);
    return false;
  }

  // Click option trong popup autocomplete của Discord.
  async clickSlashAutocomplete(needle = 'upgrade', key = '') {
    return await this.exec(`(() => {
      const needle = ${JSON.stringify(needle)}.toLowerCase();
      const key = ${JSON.stringify(String(key || '')).toLowerCase()};
      const norm = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
      // Popup autocomplete nằm ngoài danh sách tin nhắn [role="article"]
      const popups = Array.from(document.querySelectorAll('[role="listbox"], [class*="autocomplete"]'));
      const inPopup = [];
      for (const popup of popups) {
        if (popup.closest && popup.closest('[role="article"]')) continue;
        for (const opt of popup.querySelectorAll('[role="option"], [role="menuitem"], [class*="commandName"], [class*="autocompleteOption"]')) {
          if (opt.closest && opt.closest('[role="article"]')) continue;
          inPopup.push(opt);
        }
      }
      if (inPopup.length === 0) return null;
      for (const el of inPopup) {
        const t = norm(el.textContent);
        if (!t || !t.includes(needle)) continue;
        if (t.includes('da su dung')) continue;
        if (key) {
          if (!t.includes(key)) continue;
        }
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (rect && (rect.width === 0 || rect.height === 0)) continue;
        try {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.click();
        } catch (e) {}
        return (el.textContent || '').trim().substring(0, 120);
      }
      return null;
    })()`);
  }

  // Gửi slash command: gõ "/upgrade" hoặc command, Enter 1 -> chọn đúng option theo key -> Enter 2-3 để gửi
  async sendSlashChat(cmd) {
    let key = '';
    if (cmd === '/upgrade atk') key = 'atk';
    if (cmd === '/upgrade hp') key = 'hp';
    if (cmd === '/upgrade def') key = 'def';
    if (cmd === '/roll_x10') key = 'roll';
    if (cmd === '/waifu roll 10') key = 'waifu';

    if (cmd && cmd.startsWith('/upgrade')) {
      // Luồng đúng: "/upgrade" -> enter -> nhập atk/hp/def -> enter -> enter
      // Gõ /upgrade KHÔNG Enter
      const cmdPrefix = '/upgrade';
      await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
      await this.delay(this.rand(200, 400));
      const len0 = await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`);
      for (let i = 0; i < len0; i++) {
        await this.exec(`(() => {
          const el = document.querySelector('[role="textbox"]');
          if (!el) return;
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
        })()`);
        await this.delay(this.rand(20, 40));
      }
      for (let i = 0; i < cmdPrefix.length; i++) {
        const ch = cmdPrefix[i];
        await this.exec(`(() => {
          const el = document.querySelector('[role="textbox"]');
          if (!el) return;
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
        })()`);
        await this.delay(this.rand(40, 80));
      }
      await this.delay(300);
      // Enter 1
      await this.pressEnterTrusted();
      await this.delay(600);
      // Nhập key atk/hp/def
      if (key) {
        for (let i = 0; i < key.length; i++) {
          const ch = key[i];
          await this.exec(`(() => {
            const el = document.querySelector('[role="textbox"]');
            if (!el) return;
            el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
            el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
          })()`);
          await this.delay(30);
        }
        await this.delay(250);
        // Enter 2 - chọn option
        await this.pressEnterTrusted();
        await this.delay(400);
      }
      // Enter 3 - gửi
      await this.pressEnterTrusted();
      await this.delay(400);
      const stillThere = Number(await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`)) || 0;
      if (stillThere > 1) {
        await this.pressEnterTrusted();
      }
      return true;
    } else if (cmd === '/roll_x10') {
      const cmdPrefix = '/roll_x10';
      await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
      await this.delay(this.rand(200, 400));
      const len0 = await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`);
      for (let i = 0; i < len0; i++) {
        await this.exec(`(() => {
          const el = document.querySelector('[role="textbox"]');
          if (!el) return;
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
        })()`);
        await this.delay(this.rand(20, 40));
      }
      for (let i = 0; i < cmdPrefix.length; i++) {
        const ch = cmdPrefix[i];
        await this.exec(`(() => {
          const el = document.querySelector('[role="textbox"]');
          if (!el) return;
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
        })()`);
        await this.delay(this.rand(40, 80));
      }
      await this.delay(300);
      await this.pressEnterTrusted();
      await this.delay(500);
      const stillThere = Number(await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`)) || 0;
      if (stillThere > 1) await this.pressEnterTrusted();
      return true;
    } else if (cmd === '/waifu roll 10') {
      const cmdPrefix = '/waifu roll 10';
      await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
      await this.delay(this.rand(200, 400));
      const len0 = await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`);
      for (let i = 0; i < len0; i++) {
        await this.exec(`(() => {
          const el = document.querySelector('[role="textbox"]');
          if (!el) return;
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
        })()`);
        await this.delay(this.rand(20, 40));
      }
      for (let i = 0; i < cmdPrefix.length; i++) {
        const ch = cmdPrefix[i];
        await this.exec(`(() => {
          const el = document.querySelector('[role="textbox"]');
          if (!el) return;
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
        })()`);
        await this.delay(this.rand(40, 80));
      }
      await this.delay(300);
      await this.pressEnterTrusted();
      await this.delay(400);
      const stillThere = Number(await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`)) || 0;
      if (stillThere > 1) await this.pressEnterTrusted();
      return true;
    } else if (cmd.startsWith('/sellall')) {
      await this.typeSlashCommandText(cmd);
      return true;
    }

    await this.sendChat(cmd);
    await this.delay(500);
    await this.pressEnterTrusted();
    return true;
  }

  // Gõ slash command dạng text đầy đủ (vd: /sellall star:🔵 1 Sao) rồi Enter để gửi.
  // Duyệt theo code point để không vỡ emoji (🔵 🟢 🟡 là ký tự 2 surrogate).
  async typeSlashCommandText(cmd) {
    await this.exec(`document.querySelector('[role="textbox"]')?.click()`);
    await this.delay(this.rand(200, 400));
    const len0 = Number(await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`)) || 0;
    for (let i = 0; i < len0; i++) {
      await this.exec(`(() => {
        const el = document.querySelector('[role="textbox"]');
        if (!el) return;
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true }));
        el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
        el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true }));
      })()`);
      await this.delay(this.rand(20, 40));
    }
    const chars = Array.from(cmd);
    for (const ch of chars) {
      await this.exec(`(() => {
        const el = document.querySelector('[role="textbox"]');
        if (!el) return;
        el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
        el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(ch)}, bubbles: true, cancelable: true }));
      })()`);
      await this.delay(this.rand(40, 80));
    }
    await this.delay(300);
    await this.pressEnterTrusted();
    await this.delay(500);
    const stillThere = Number(await this.exec(`document.querySelector('[role="textbox"]')?.textContent?.length || 0`)) || 0;
    // Enter 1 có thể chỉ chọn option autocomplete, Enter 2 mới gửi message.
    if (stillThere > 1) {
      await this.pressEnterTrusted();
      await this.delay(400);
    }
    return true;
  }

  async sendNpcCommand() {
    return this.sendChat(`!npc ${this.npcNumber}`);
  }

  async captureLuanhoiAnchor() {
    const command = this.luanhoiCmd || '!luanhoi';
    const anchorId = await this.exec(`(() => {
      const command = ${JSON.stringify(command)};
      const username = ${JSON.stringify(this.username || '')};
      const getId = value => {
        const match = String(value || '').match(/(\d{10,30})/);
        return match ? match[1] : '';
      };
      let found = '';
      let directFound = false;
      for (const msg of document.querySelectorAll('[role="article"]')) {
        const text = msg.textContent || '';
        const hasCommandReply = Array.from(msg.querySelectorAll('[class*="repliedTextPreview"], [class*="repliedMessageClickable"], [class*="reply"]'))
          .some(reply => (reply.textContent || '').includes(command));
        if (hasCommandReply && (!username || text.includes(username))) directFound = true;
        if (!text.includes(command) || (username && !text.includes(username))) continue;
        msg.setAttribute('data-dianguc-anchor', 'true');
        const values = [msg.id, msg.getAttribute('data-list-item-id'), msg.getAttribute('data-message-id')];
        for (const value of values) {
          const id = getId(value);
          if (id && (!found || BigInt(id) > BigInt(found))) found = id;
        }
      }
      if (found) window.luanhoiAnchorId = found;
      return found || (directFound ? 'direct' : '');
    })()`);
    if (anchorId && anchorId !== 'direct') this.log(`🔗 Đã lưu ID message !luanhoi: ${anchorId}.`);
    else if (anchorId) this.log('🔗 Đã neo vào message game trực tiếp mới nhất có reply !luanhoi của bạn.');
    else this.log('⚠️ Không lấy được ID thật của message !luanhoi; tạm thời không click message nào.');
    return anchorId;
  }

  async captureDiangucAnchor() {
    const command = this.diangucCmd || '!dianguc';
    const anchor = await this.exec(`(() => {
      const command = ${JSON.stringify(command)};
      const username = ${JSON.stringify(this.username || '')};
      const getId = value => {
        const match = String(value || '').match(/(\\d{10,30})/);
        return match ? match[1] : '';
      };
      let found = '';
      let directFound = false;
      for (const msg of document.querySelectorAll('[role="article"]')) {
        const text = msg.textContent || '';
        const hasCommandReply = Array.from(msg.querySelectorAll('[class*="repliedTextPreview"], [class*="repliedMessageClickable"], [class*="reply"]'))
          .some(reply => (reply.textContent || '').includes(command));
        if (hasCommandReply && (!username || text.includes(username))) directFound = true;
        if (!text.includes(command) || (username && !text.includes(username))) continue;
        const values = [msg.id, msg.getAttribute('data-list-item-id'), msg.getAttribute('data-message-id')];
        for (const value of values) {
          const id = getId(value);
          if (id && (!found || BigInt(id) > BigInt(found))) found = id;
        }
      }
      if (found) window.diangucAnchorId = found;
      return found || (directFound ? 'direct' : '');
    })()`);
    if (anchor && anchor !== 'direct') this.log(`🔗 Đã lưu ID message !dianguc: ${anchor}.`);
    else if (anchor) this.log('🔗 Đã neo message game Địa Ngục qua reply preview.');
    else this.log('⚠️ Không neo được message game qua reply preview của !dianguc.');
    return anchor;
  }

  async markDiangucMessages() {
    const ownedCount = await this.exec(`(() => {
      const anchorId = window.diangucAnchorId || '';
      const articles = Array.from(document.querySelectorAll('[role="article"]'));
      const attrNames = ['data-message-id', 'data-reference-id', 'data-message-reference', 'href'];
      const getId = value => {
        const match = String(value || '').match(/(\\d{10,30})/);
        return match ? match[1] : '';
      };

      const command = ${JSON.stringify(this.diangucCmd || '!dianguc')};
      const username = ${JSON.stringify(this.username || '')};
      // Chỉ giữ card thuộc về user của bot này. Trong group chat nhiều người cùng
      // chơi !dianguc, không lọc sẽ đánh nhầm battle của người khác.
      const ownedByUser = msg => !username || (msg.textContent || '').includes(username);
      const ids = new Set(anchorId ? [anchorId] : []);
      let ownedCount = 0;

      // Một số message Discord có reply preview nhưng không expose reference
      // attribute. Khi đó dùng vị trí DOM sau command làm fallback cho card game.
      if (anchorId) {
        const anchorIndex = articles.findIndex(msg => {
          if (msg.getAttribute('data-dianguc-anchor') === 'true') return true;
          const values = [msg.id, msg.getAttribute('data-list-item-id'), msg.getAttribute('data-message-id')];
          return values.some(value => getId(value) === anchorId);
        });
        if (anchorIndex >= 0) {
          for (let index = anchorIndex + 1; index < articles.length; index++) {
            const msg = articles[index];
            const rawText = msg.textContent || '';
            const hasButtons = msg.querySelectorAll('button, [role="button"]').length > 0;
            const looksLikeGame = /tầng địa ngục|địa ngục\s*(?:tầng|bước)|đúng đường|sai đường|chọn 1 buff|hãy chọn hướng|sự kiện bí ẩn|trạng thái|diễn biến|gặp quái/i.test(rawText);
            if (hasButtons && looksLikeGame && ownedByUser(msg) && msg.getAttribute('data-dianguc-owned') !== 'true') {
              msg.setAttribute('data-dianguc-owned', 'true');
              ownedCount++;
            }
          }
        }
      }

      // Discord đôi khi không expose data-reference-id trên DOM, nhưng vẫn
      // render reply preview. Dùng preview làm điểm neo trực tiếp trước.
      for (const msg of articles) {
        const hasOwnedReply = Array.from(msg.querySelectorAll('[class*="repliedTextPreview"], [class*="repliedMessageClickable"], [class*="reply"]'))
          .some(reply => (reply.textContent || '').includes(command));
        if (!hasOwnedReply || !ownedByUser(msg)) continue;
        msg.setAttribute('data-dianguc-owned', 'true');
        ownedCount++;
        const messageId = getId(msg.id) || getId(msg.getAttribute('data-list-item-id')) || getId(msg.getAttribute('data-message-id'));
        if (messageId) ids.add(messageId);
      }

      if (!anchorId && ownedCount === 0) return 0;
      for (let pass = 0; pass < 5; pass++) {
        let changed = false;
        for (const msg of articles) {
          if (msg.getAttribute('data-dianguc-owned') === 'true') {
            const messageId = getId(msg.id) || getId(msg.getAttribute('data-list-item-id')) || getId(msg.getAttribute('data-message-id'));
            if (messageId) ids.add(messageId);
            continue;
          }
          const refs = Array.from(msg.querySelectorAll('[data-message-id], [data-reference-id], [data-message-reference], a[href]'));
          const referencesOwned = refs.some(el => attrNames.some(name => {
            const referenceId = getId(el.getAttribute(name));
            return referenceId && ids.has(referenceId);
          }));
          if (referencesOwned && ownedByUser(msg)) {
            msg.setAttribute('data-dianguc-owned', 'true');
            ownedCount++;
            const messageId = getId(msg.id) || getId(msg.getAttribute('data-list-item-id')) || getId(msg.getAttribute('data-message-id'));
            if (messageId) ids.add(messageId);
            changed = true;
          }
        }
        if (!changed) break;
      }
      return ownedCount;
    })()`);
    return Number.isFinite(ownedCount) ? ownedCount : 0;
  }

  async markLuanhoiMessages() {
    await this.exec(`(() => {
      const anchorId = window.luanhoiAnchorId || '';
      const articles = Array.from(document.querySelectorAll('[role="article"]'));
      const attrNames = ['data-message-id', 'data-reference-id', 'data-message-reference', 'href'];
      const getId = value => {
        const match = String(value || '').match(/(\d{10,30})/);
        return match ? match[1] : '';
      };

      for (const msg of articles) msg.removeAttribute('data-luanhoi-owned');
      if (!anchorId) {
        let direct = null;
        const command = ${JSON.stringify(this.luanhoiCmd || '!luanhoi')};
        const username = ${JSON.stringify(this.username || '')};
        for (const msg of articles) {
          const hasOwnedReply = Array.from(msg.querySelectorAll('[class*="repliedTextPreview"], [class*="repliedMessageClickable"], [class*="reply"]'))
            .some(reply => {
              const replyText = reply.textContent || '';
              return replyText.includes(command);
            });
          if (hasOwnedReply && (!username || (msg.textContent || '').includes(username))) direct = msg;
        }
        if (direct) direct.setAttribute('data-luanhoi-owned', 'true');
        return;
      }
      const ids = new Set([anchorId]);

      for (let pass = 0; pass < 5; pass++) {
        let changed = false;
        for (const msg of articles) {
          if (msg.getAttribute('data-luanhoi-owned') === 'true') {
            const messageId = getId(msg.id) || getId(msg.getAttribute('data-list-item-id')) || getId(msg.getAttribute('data-message-id'));
            if (messageId) ids.add(messageId);
            continue;
          }
          const refs = Array.from(msg.querySelectorAll('[data-message-id], [data-reference-id], [data-message-reference], a[href]'));
          const referencesOwned = refs.some(el => attrNames.some(name => {
            const referenceId = getId(el.getAttribute(name));
            return referenceId && ids.has(referenceId);
          }));
          if (referencesOwned) {
            msg.setAttribute('data-luanhoi-owned', 'true');
            const messageId = getId(msg.id) || getId(msg.getAttribute('data-list-item-id')) || getId(msg.getAttribute('data-message-id'));
            if (messageId) ids.add(messageId);
            changed = true;
          }
        }
        if (!changed) break;
      }
    })()`);
  }

  async checkBattleEnd() {
    const username = this.username || '';
    const res = await this.exec(`(() => {
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      for (const msg of msgs) {
        if (msg.getAttribute('data-bot-ephemeral') === 'true') continue;
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        const rawText = msg.textContent || '';
        const text = rawText.toLowerCase();
        const isResult = text.includes('kết quả trận đấu') || text.includes('battle ended') || text.includes('chiến thắng') || text.includes('thất bại') || text.includes('thắng npc') || text.includes('thua npc') || rawText.includes('✅') || rawText.includes('❌');
        if (!rawText.trim() || !isResult) continue;
        if (username && !rawText.includes(username)) continue;
        msg.setAttribute('data-bot-seen', 'true');
        return { text: rawText.substring(0, 8000), username };
      }
      return null;
    })()`);
    if (!res || !res.text) return null;

    const t = res.text.toLowerCase();
    const ul = String(res.username || '').toLowerCase();
    const iWin = t.lastIndexOf('chiến thắng');
    const iLoss = t.lastIndexOf('thất bại');
    const iUser = t.lastIndexOf(ul);
    let result = 'unknown';
    if (iWin >= 0 && iLoss >= 0 && iUser >= 0) {
      result = Math.abs(iUser - iWin) <= Math.abs(iUser - iLoss) ? 'win' : 'loss';
    } else if (iWin >= 0 && iLoss < 0) {
      result = 'win';
    } else if (iLoss >= 0 && iWin < 0) {
      result = 'loss';
    } else if (res.text.includes('✅') && !res.text.includes('❌')) {
      result = 'win';
    } else if (res.text.includes('❌') && !res.text.includes('✅')) {
      result = 'loss';
    } else if (t.includes('thắng')) {
      result = 'win';
    } else if (t.includes('thua')) {
      result = 'loss';
    }

    return { ended: true, result, rewardText: res.text };
  }

  // Phiên bản checkBattleEnd riêng cho Luân Hồi: bỏ qua message đang trận (có nút "Chiến đấu")
  // Kiểm tra trận có kết thúc không. advance/win/loss detection đơn giản bằng match + /i.
  async checkLuanhoiBattleEnd() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const username = ${JSON.stringify(username)};
      const matchesUserMessage = text => {
        const value = String(text || '');
        if (!username) return true;
        const normalizedText = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        const normalizedUser = username.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        if (!normalizedText.includes(normalizedUser)) return false;
        return ['luân hồi', 'luanhoi', 'tầng', 'thap', 'boss', 'tiếp tục', 'ket thuc', 'hạ gục', 'han guc', 'đánh bại', 'danh bai', 'thắng', 'thua', 'chiến đấu', 'fight'].some(keyword => normalizedText.includes(keyword));
      };
      const knownTier = window.luanhoiBuffTierClicked || 0;
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-ephemeral') === 'true') continue;
        if (username && !matchesUserMessage(msg.textContent)) continue;
        const rawText = msg.textContent || '';
        const text = rawText.toLowerCase();

        const hasWin = /chiến thắng|thắng!/.test(text);
        const hasLoss = /thất bại|bạn đã thua|thua!|ngã xuống luân hồi tháp|nga xuong luan hoi thap|kết thúc luân hồi|ket thuc luan hoi/.test(text);

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
          /luân hồi tháp|luanhoi thap|tháp luân hồi|thap luanhoi|ngã xuống luân hồi tháp|nga xuong luan hoi thap|thắng boss|kết thúc luân hồi|ket thuc luan hoi|tiếp tục leo tháp|tiep tuc leo thap|chọn 1 cổng|chon 1 cong|hạ gục boss|han guc boss|đánh bại boss|danh bai boss|chọn độ khó|chon do kho|kết thúc nhận|ket thuc nhan/i.test(rawText);
        if (!isLuanhoi) continue;

        // Advance: message buff tầng mới > tầng đã click
        if (hasBuff && !hasWin && !hasLoss && knownTier > 0) {
          let tmTier = 0;
          const sauM = rawText.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
          if (sauM && sauM[1]) {
            tmTier = parseInt(sauM[1]) + 1;
          } else {
            const tm = rawText.match(/(?:t[a\\u1ea7]ng(?:\\s+lu[a\\u00e2]n\\s+h[o\\u1ed3]i)?|tier)\\s*[:.\u2013-]?\\s*([0-9]{1,3})/i);
            if (tm && tm[1]) tmTier = parseInt(tm[1]);
          }
          if (tmTier > knownTier) {
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
      const matchesUserMessage = text => {
        const value = String(text || '');
        if (!username) return true;
        const normalizedText = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        const normalizedUser = username.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        if (!normalizedText.includes(normalizedUser)) return false;
        return ['luân hồi', 'luanhoi', 'tầng', 'thap', 'boss', 'tiếp tục', 'ket thuc', 'hạ gục', 'han guc', 'đánh bại', 'danh bai', 'thắng', 'thua', 'fight', 'chiến đấu'].some(keyword => normalizedText.includes(keyword));
      };
      const clickedTier = window.luanhoiBuffTierClicked || 0;
      const tierWords = ['pham', 'linh', 'huyen', 'thien'];
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        if (username && !matchesUserMessage(msg.textContent)) continue;
        const rawText = msg.textContent || '';
        let newTier = null;
        const sauM = rawText.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
        if (sauM && sauM[1]) {
          newTier = parseInt(sauM[1]) + 1;
        } else {
          const tm = rawText.match(/(?:t[a\\u1ea7]ng(?:\\s+lu[a\\u00e2]n\\s+h[o\\u1ed3]i)?|tier)\\s*[:.\u2013-]?\\s*([0-9]{1,3})/i);
          if (tm && tm[1]) newTier = parseInt(tm[1]);
        }
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
  //#region Auto Farm NPC
  async checkLockedMessage() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const matchesUserMessage = text => {
        const value = String(text || '');
        if (!username) return true;
        const normalizedText = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        const normalizedUser = username.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        if (!normalizedText.includes(normalizedUser)) return false;
        return ['bị khóa', 'bi khoa', 'giết npc', 'npc', 'thắng', 'thua', 'battle', 'fight'].some(keyword => normalizedText.includes(keyword));
      };
      const processedIds = ${JSON.stringify(Array.from(this.processedLockIds))};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (username && !matchesUserMessage(msg.textContent)) continue;
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
      const matchesUserMessage = text => {
        const value = String(text || '');
        if (!username) return true;
        const normalizedText = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        const normalizedUser = username.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        if (!normalizedText.includes(normalizedUser)) return false;
        return ['hồi chiêu', 'cooldown', 'đợi lượt', 'đang hồi', 'npc', 'battle', 'fight', 'đánh'].some(keyword => normalizedText.includes(keyword));
      };
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-ephemeral') === 'true') continue;
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !matchesUserMessage(msg.textContent)) continue;

        if (msg.id) {
          const parts = msg.id.split('-');
          const idStr = parts[parts.length - 1];
          try {
            const id = BigInt(idStr);
            if (id <= maxId) continue;
          } catch(e) {}
        }

        const text = msg.textContent.toLowerCase();
        if (text.includes('⏳') || text.includes('hồi chiêu') || text.includes('cooldown') || /đang hồi|đợi lượt/i.test(text)) {
          msg.setAttribute('data-bot-seen', 'true');
          if (msg.id) {
            const parts = msg.id.split('-');
            window.botMaxMsgId = parts[parts.length - 1];
          }
          const match = text.match(/(\d+)\s*(?:turn|s|giây|phút)/i);
          if (match && parseInt(match[1]) > 0) {
            return parseInt(match[1]);
          }
          if (text.includes('⏳')) return 5;
          return 120;
        }
      }
     return -1;
   })()`);
  }

  async checkBicanhCooldown() {
    return await this.exec(`(() => {
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-30).reverse();
       for (const msg of recent) {
         // Tin nhắn ephemeral (Xỏ Lá Ba Que) có chữ "⏳ / đang hồi" nhưng không phải
         // cooldown của game -> bỏ qua.
         if (msg.getAttribute('data-bot-ephemeral') === 'true') continue;
         const text = msg.textContent || '';
         if (text.includes('⏳') || /đang hồi|đợi lượt/i.test(text)) {
           const match = text.match(/(\d+)\s*(?:turn|s|giây|phút)/i);
           if (match && parseInt(match[1]) > 0) return parseInt(match[1]) * 1000;
           return 3000;
         }
       }
       return 0;
     })()`);
  }

  async checkNoResponse() {
    const skillNames = (this.luanhoiSkillNames || []).filter(Boolean);
    return await this.exec(`(() => {
      const skills = ${JSON.stringify(skillNames)};
      const nd = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd')
        .replace(/\u01a1/g, 'o').replace(/\u01a0/g, 'o')
        .replace(/\u01b0/g, 'u').replace(/\u01af/g, 'u')
        .toLowerCase().replace(/\s+/g, ' ').trim();
      const normalizedSkills = skills.map(nd).filter(Boolean);
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        if (msg.getAttribute('data-bot-ephemeral') === 'true') continue;
        const text = nd(msg.textContent);
        // Dòng "Khánh Linh đã không phản hồi kịp thời" nằm ngay dưới nút skill trong tin nhắn battle.
        if (!text.includes('khong phan hoi kip thoi')) continue;
        // Chỉ tính là battle khi tin nhắn có nút skill.
        const buttonText = Array.from(msg.querySelectorAll('button[role="button"], [role="button"]'))
          .map(button => nd(button.textContent)).join(' | ');
        if (normalizedSkills.some(name => buttonText.includes(name))) return msg.id || text;
      }
      return false;
    })()`);
  }

  async checkAlreadyFighting() {
    const username = this.username || '';
    return await this.exec(`(() => {
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const matchesUserMessage = text => {
        const value = String(text || '');
        if (!username) return true;
        const normalizedText = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        const normalizedUser = username.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
        if (!normalizedText.includes(normalizedUser)) return false;
        return ['đang đánh npc', 'already fighting', 'npc', 'battle', 'fight', 'đánh'].some(keyword => normalizedText.includes(keyword));
      };
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-30);
      for (const msg of recent.reverse()) {
        if (msg.getAttribute('data-bot-ephemeral') === 'true') continue;
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !matchesUserMessage(msg.textContent)) continue;

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
      const isOwnedGameMessage = (text, userName, keywords = []) => {
        const rawText = String(text || '');
        const normalizedText = rawText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
        const normalizedUser = String(userName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!normalizedUser || !normalizedText) return true;
        const userTokens = normalizedUser.split(/\s+/).filter(Boolean);
        const usernameIndex = userTokens
          .map(token => normalizedText.indexOf(token))
          .filter(index => index >= 0)
          .sort((a, b) => a - b)[0];
        if (usernameIndex === undefined) return false;
        const beforeUsername = normalizedText.slice(0, usernameIndex).trim();
        if (/(?:^|[\s(])(?:[a-z0-9]+)\s*:\s*$/.test(beforeUsername)) return false;
        const gameKeywords = ['npc', 'battle', 'fight', 'đánh', 'thắng', 'thua', 'boss', ...keywords].map(keyword => String(keyword || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').trim().toLowerCase());
        return gameKeywords.some(keyword => keyword && normalizedText.includes(keyword));
      };
      const msgs = document.querySelectorAll('[role="article"]');
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      let battleMsg = null;
      let battleButtons = [];

      const recentMsgs = Array.from(msgs).slice(-30).reverse();
      for (const msg of recentMsgs) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !isOwnedGameMessage(msg.textContent, username, ['npc', 'battle', 'fight', 'đánh'])) continue;

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
      const isOwnedGameMessage = (text, userName, keywords = []) => {
        const rawText = String(text || '');
        const normalizedText = rawText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
        const normalizedUser = String(userName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!normalizedUser || !normalizedText) return true;
        const userTokens = normalizedUser.split(/\s+/).filter(Boolean);
        const usernameIndex = userTokens
          .map(token => normalizedText.indexOf(token))
          .filter(index => index >= 0)
          .sort((a, b) => a - b)[0];
        if (usernameIndex === undefined) return false;
        const beforeUsername = normalizedText.slice(0, usernameIndex).trim();
        if (/(?:^|[\s(])(?:[a-z0-9]+)\s*:\s*$/.test(beforeUsername)) return false;
        const gameKeywords = ['npc', 'battle', 'fight', 'đánh', 'thắng', 'thua', 'boss', ...keywords].map(keyword => String(keyword || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').trim().toLowerCase());
        return gameKeywords.some(keyword => keyword && normalizedText.includes(keyword));
      };
      const msgs = document.querySelectorAll('[role="article"]');
      const maxIdStr = window.botMaxMsgId || '0';
      const maxId = BigInt(maxIdStr);
      const username = ${JSON.stringify(username)};
      const recentMsgs = Array.from(msgs).slice(-30).reverse();
      let targetMsg = null;
      for (const msg of recentMsgs) {
        if (msg.getAttribute('data-bot-seen') === 'true') continue;
        if (username && !isOwnedGameMessage(msg.textContent, username, ['npc', 'battle', 'fight', 'đánh'])) continue;
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
    if (!this.bicanhSkillOrder || this.bicanhSkillOrder.length === 0) {
      this.log('⚠️ Không có combo skill Bicanh. Bắt đầu click skill 1 (Kiếm cơ bản)...');
    } else {
      this.log(`=== COMBO: ${this.bicanhSkillOrder.join(' → ')} ===`);
    }

    let noSkillCount = 0;
    let noResponseCount = 0;
    let lastNoResponseKey = null;
    let battleStartAt = Date.now();
    const battleTimeoutMin = Math.round(this.battleTimeoutMs / 60000);
    while (this.isRunning && this.runId === runId) {
      const battleEndResult = await this.checkBattleEnd();
      if (battleEndResult && battleEndResult.ended) {
        this.log(`>>> BATTLE ENDED: ${battleEndResult.result === 'win' ? '✅ THẮNG' : '❌ THUA'} <<<`);
        return { type: 'ended', result: battleEndResult.result, rewardText: battleEndResult.rewardText };
      }

      // Hết 15 phút/trận mà game vẫn cho click skill bình thường nhưng không trả kết quả
      // → vòng lặp vô tận. Tự !ketthuc + !npc để bắt đầu lại trận mới.
      if (Date.now() - battleStartAt >= this.battleTimeoutMs) {
        const spentMin = ((Date.now() - battleStartAt) / 60000).toFixed(1);
        this.log(`⏱️ Hết ${battleTimeoutMin} phút/trận (đã đánh ${spentMin}ph) mà chưa có kết quả — reset trận (!ketthuc => !npc)...`);
        noResponseCount = 0;
        noSkillCount = 0;
        lastNoResponseKey = null;
        this._bicanhSkillIdx = 0;
        await this.sendChat(this.tuLuyenEndCmd);
        await this.delay(1000);
        await this.sendNpcCommand();
        await this.delay(4000);
        battleStartAt = Date.now();
        continue;
      }

      const clicked = await this.clickNextNpcSkill();
      if (clicked) {
        this.log(`🌀 Click skill NPC: "${clicked}"`);
        this._bicanhSkillIdx++;
        noSkillCount = 0;
      } else {
        noSkillCount++;
        this.log(`⚠️ Không tìm thấy skill trong combo. Đợi... (${noSkillCount})`);
      }

      const noResponseKey = await this.checkNoResponse();
      if (noResponseKey) {
        if (noResponseKey !== lastNoResponseKey) {
          noResponseCount++;
          lastNoResponseKey = noResponseKey;
          this.log(`⚠️ "Không phản hồi kịp thời" liên tiếp (${noResponseCount}/10)`);
        }
      } else {
        noResponseCount = 0;
        lastNoResponseKey = null;
      }

      const cd = await this.checkBicanhCooldown();
      if (cd > 0) {
        this.log(`⏳ Cooldown — chờ ${cd}ms`);
        await this.delay(cd);
      } else {
        await this.delay(this.skillClickDelayMs);
      }

      if (noSkillCount >= 15) {
        this.log('⚠️ Không tìm thấy skill sau 15 lần — chờ 2p rồi gửi lại !npc để bắt đầu lại battle...');
        noSkillCount = 0;
        this._bicanhSkillIdx = 0;
        await this.delay(120000);
        await this.sendChat(this.tuLuyenEndCmd);
        await this.sendNpcCommand();
        await this.delay(4000);
        battleStartAt = Date.now();
      }

      if (noResponseCount >= 10) {
        this.log('⚠️ "Không phản hồi kịp thời" 10 lần liên tiếp — reset trận (!ketthuc => !npc)...');
        noResponseCount = 0;
        noSkillCount = 0;
        this._bicanhSkillIdx = 0;
        await this.delay(120000);
        await this.sendChat(this.tuLuyenEndCmd);
        await this.sendNpcCommand();
        await this.delay(4000);
        battleStartAt = Date.now();
      }
    }

    return false;
  }

  async clickNextNpcSkill() {
    await this.dismissEphemeralMessages();
    if (!this.bicanhSkillOrder || this.bicanhSkillOrder.length === 0) return null;
    const stt = this.bicanhSkillOrder[this._bicanhSkillIdx % this.bicanhSkillOrder.length];
    const skillName = this.luanhoiSkillNames[stt - 1];
    if (!skillName) return null;

    const normalizeSkill = value => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/gi, 'd').replace(/\u01A1/gi, 'o').replace(/\u01B0/gi, 'u')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
    const nameNoD = normalizeSkill(skillName);
    const username = this.username || '';
    const usernameNorm = String(username || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
    const usernameFirst = username.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').split(' ')[0].toLowerCase();

    return await this.exec(`(() => {
      const usernameNorm = ${JSON.stringify(usernameNorm)};
      const usernameFirst = ${JSON.stringify(usernameFirst)};
      const nameNoD = ${JSON.stringify(nameNoD)};
      const normalizeSkill = value => String(value || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/gi, 'd').replace(/\u01A1/gi, 'o').replace(/\u01B0/gi, 'u')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
      const tierWords = new Set(['pham', 'linh', 'huyen', 'thien']);
      const disallowedNames = new Set(['trangbi', 'chiso', 'thongtin', 'shop', 'cua hang', 'thongbao', 'doimatkhau']);
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        const rawText = msg.textContent || '';
        const norm = rawText.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d').replace(/\u0110/g,'d').toLowerCase();
        // Chỉ tương tác với battle của CHÍNH MÌNH: message phải chứa username
        if (usernameNorm && !norm.includes(usernameNorm) && !(usernameFirst && norm.includes(usernameFirst))) continue;
        const btns = msg.querySelectorAll('button[role="button"]');
        const available = Array.from(btns).map(btn => ({
          btn,
          raw: (btn.textContent || '').trim(),
        })).filter(item => {
          if (item.btn.disabled || item.btn.offsetParent === null || !item.raw || /[@|!]/.test(item.raw)) return false;
          const clean = normalizeSkill(item.raw);
          if (!clean || tierWords.has(clean)) return false;
          if (disallowedNames.has(clean) || clean.includes('trangbi') || clean.includes('chiso')) return false;
          return true;
        }).map(item => ({ ...item, clean: normalizeSkill(item.raw) }));
        if (!available.length) continue;

        // Chỉ click nút skill thực sự, không chạm các nút HUD/setting như Trang Bị/Chỉ Số.
        // Không fallback: nếu skill đích chưa sẵn sàng (cooldown/chưa render) thì trả null và đợi lượt sau.
        const target = available.find(item => item.clean.includes(nameNoD) || item.clean === nameNoD);
        if (target) {
          target.btn.click();
          return target.raw;
        }
      }
      return null;
    })()`);
  }
  //#endregion
  //#region Địa Ngục
  loadDiangucData() {
    this.diangucData = {};
    if (!fs.existsSync(DIANGUC_DATA_FILE)) return;
    try {
      const workbook = XLSX.readFile(DIANGUC_DATA_FILE);
      const sheet = workbook.Sheets.Data || workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const step = Number(row[0]);
        if (!Number.isInteger(step) || step < 1) continue;
        this.diangucData[step] = {};
        DIANGUC_DIRECTIONS.forEach((direction, index) => {
          const value = typeof row[index + 1] === 'string' ? row[index + 1].trim().toLowerCase() : '';
          if (value === 'đúng' || value === 'sai') this.diangucData[step][direction] = value;
        });
      }
      const meta = workbook.Sheets.Meta;
      const metaRows = meta ? XLSX.utils.sheet_to_json(meta, { header: 1, defval: null }) : [];
      const metaFloor = metaRows[0] && Number(metaRows[0][1]);
      if (Number.isInteger(metaFloor) && metaFloor > 0) this.diangucFloor = metaFloor;
    } catch (error) {
      this.log(`⚠️ Không đọc được ${DIANGUC_DATA_FILE}: ${error.message}`);
    }
  }

  saveDiangucData() {
    try {
      const rows = [['', 'lên', 'xuống', 'trái', 'phải']];
      Object.keys(this.diangucData).map(Number).sort((a, b) => a - b).forEach(step => {
        const entry = this.diangucData[step] || {};
        rows.push([step, ...DIANGUC_DIRECTIONS.map(direction => entry[direction] || null)]);
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Data');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['current_floor', this.diangucFloor || 0]]), 'Meta');
      XLSX.writeFile(workbook, DIANGUC_DATA_FILE);
      this.diangucLastSaved = Date.now();
    } catch (error) {
      this.log(`⚠️ Không lưu được ${DIANGUC_DATA_FILE}: ${error.message}`);
    }
  }

  recordDiangucDirection(step, direction, result) {
    if (!Number.isInteger(step) || !DIANGUC_DIRECTIONS.includes(direction)) return;
    if (!this.diangucData[step]) this.diangucData[step] = {};
    this.diangucData[step][direction] = result;
    this.log(`📝 Địa Ngục bước ${step}: ${direction} = ${result}`);
    this.saveDiangucData();
  }

  chooseDiangucDirection(step, buttons) {
    const entry = this.diangucData[step] || {};
    const choices = buttons.map((button, index) => ({
      index,
      direction: DIANGUC_DIRECTIONS.find(direction => diangucNormalize(button.text).toLowerCase().includes(direction)),
    })).filter(choice => choice.direction);
    const knownCorrect = choices.find(choice => entry[choice.direction] === 'đúng');
    if (knownCorrect) return knownCorrect;
    return choices.find(choice => entry[choice.direction] !== 'sai') || null;
  }

  async scanDianguc() {
    const skillNames = this.luanhoiSkillNames;
    return await this.exec(`(() => {
      const getId = msg => msg.id || msg.getAttribute('data-list-item-id') || msg.getAttribute('data-message-id') || '';
      const skills = ${JSON.stringify(skillNames)};
      const articles = Array.from(document.querySelectorAll('[role="article"]')).slice(-50).reverse();
      for (const msg of articles) {
        if (msg.getAttribute('data-dianguc-owned') !== 'true') continue;
        const rawText = msg.textContent || '';
        const lower = rawText.toLowerCase();
        const id = getId(msg);
        const targetKey = id || ('dianguc-' + Date.now() + '-' + articles.indexOf(msg));
        msg.setAttribute('data-dianguc-target', targetKey);
        const buttons = Array.from(msg.querySelectorAll('button[role="button"], [role="button"]'))
          .filter(button => button.offsetParent !== null && (button.textContent || '').trim())
          .map((button, index) => ({ index, text: (button.textContent || '').trim() }));
        if (!buttons.length) continue;
        const buttonText = buttons.map(button => button.text.toLowerCase()).join(' | ');
        const hasSkillButton = skills.some(skill => buttonText.includes(skill.toLowerCase()));
        const ownName = ${JSON.stringify((this.username || '').trim())};
        const normMeta = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase().trim();
        const metadataOnly = buttons.every(button => {
          const text = button.text.trim();
          return /^[@!]/.test(text)
            || /^(?:quất bất lực|xỏ lá ba que)$/iu.test(text)
            || (ownName && normMeta(text) === normMeta(ownName));
        });
        const hasBattleMarker = ['chiến đấu', 'đánh quái', 'quái vật', 'trạng thái', 'diễn biến', 'gặp quái', 'atk:', 'def:']
          .some(marker => lower.includes(marker));
        const phase = lower.includes('sự kiện bí ẩn') ? 'MYSTERY'
          : lower.includes('chọn 1 buff') ? 'BUFF'
          : lower.includes('hãy chọn hướng đi tiếp theo') ? 'DIRECTION'
          : hasSkillButton || hasBattleMarker || skills.some(skill => lower.includes(skill.toLowerCase())) ? 'BATTLE' : 'UNKNOWN';
        const floorMatch = rawText.match(/tầng\\s*:?\\s*(\\d+)/i);
        const stepMatch = rawText.match(/bước\\s*:?\\s*(\\d+)/i);
        const result = /đã chết|bạn đã thua|thất bại|thua!|💀|❌/i.test(rawText) ? 'loss'
          : /chiến thắng|đúng đường|thắng!/i.test(rawText) ? 'win' : null;
        const hasOutcomeMarker = /sai đường|đúng đường|đã chết|thắng!|thua!|thất bại|💀|❌/i.test(rawText);
        const missedResponse = /không phản hồi kịp thời|khong phan hoi kip thoi/i.test(rawText);
        if (phase === 'UNKNOWN' && !hasOutcomeMarker) continue;
        return {
          id,
          targetKey,
          text: rawText,
          buttons,
          buttonText,
          metadataOnly,
          phase,
          floor: floorMatch ? Number(floorMatch[1]) : null,
          step: stepMatch ? Number(stepMatch[1]) : null,
          result,
          missedResponse,
          target: /đánh\s*(?:boss\s*)?(41|51)|boss\s*(41|51)|tầng\s*51/i.test(rawText),
        };
      }
      return null;
    })()`);
  }

  async clickDiangucButton(messageId, index) {
    if (!messageId) return false;
    return await this.exec(`(() => {
      const target = ${JSON.stringify(messageId)};
      const msg = document.getElementById(target)
        || document.querySelector('[data-message-id="' + target + '"]')
        || document.querySelector('[data-dianguc-target="' + target.replace(/"/g, '\\"') + '"]');
      if (!msg) return false;
      const buttons = Array.from(msg.querySelectorAll('button[role="button"], [role="button"]')).filter(button => button.offsetParent !== null && (button.textContent || '').trim());
      const button = buttons[${Number(index)}];
      if (!button) return false;
      button.click();
      return true;
    })()`);
  }

  async clickDiangucBuff(messageId, index) {
    if (!messageId) return false;
    return await this.exec(`(() => {
      const target = ${JSON.stringify(messageId)};
      const msg = document.getElementById(target)
        || document.querySelector('[data-message-id="' + target + '"]')
        || document.querySelector('[data-dianguc-target="' + target.replace(/"/g, '\\"') + '"]');
      if (!msg) return false;
      const buttons = Array.from(msg.querySelectorAll('button[role="button"], [role="button"]'))
        .filter(button => button.offsetParent !== null && (button.textContent || '').trim());
      const button = buttons[${Number(index)}];
      if (!button) return false;
      button.click();
      return true;
    })()`);
  }

  async clickDiangucDirection(messageId, direction) {
    if (!messageId || !direction) return false;
    return await this.exec(`(() => {
      const normalize = value => (value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\u0111/g, 'd').replace(/\\u0110/g, 'd').toLowerCase();
      const target = ${JSON.stringify(messageId)};
      const msg = document.getElementById(target)
        || document.querySelector('[data-message-id="' + target + '"]')
        || document.querySelector('[data-dianguc-target="' + target.replace(/"/g, '\\"') + '"]');
      if (!msg) return false;
      const wanted = normalize(${JSON.stringify(direction)});
      const buttons = Array.from(msg.querySelectorAll('button, [role="button"]'))
        .filter(button => button.offsetParent !== null && !button.disabled && (button.textContent || '').trim());
      const button = buttons.find(item => normalize(item.textContent).includes(wanted));
      if (!button) return false;
      button.click();
      return (button.textContent || '').trim();
    })()`);
  }

  async clickDiangucMystery(messageId, buttons) {
    if (!messageId) return false;
    const choice = buttons.find(button => {
      const text = String(button.text || '').trim();
      return text && !/^[@!]/.test(text) && !/^(?:quất bất lực|xỏ lá ba que)$/iu.test(text);
    });
    if (!choice) return false;
    return await this.clickDiangucButton(messageId, choice.index);
  }

  extractDiangucBuffs(text, buttons) {
    const tierNames = ['Thiên', 'Huyền', 'Linh', 'Phàm'];
    const parsedButtons = buttons.map((button, index) => ({
      button,
      index,
      tier: tierNames.find(tier => diangucNormalize(button.text).toLowerCase().includes(tier.toLowerCase())) || '',
    })).filter(item => item.tier);
    const buttonTiers = parsedButtons.map(item => item.tier);
    const buffMarker = 'chọn 1 buff';
    const markerIndex = text.toLowerCase().indexOf(buffMarker);
    const buffText = markerIndex >= 0 ? text.slice(markerIndex + buffMarker.length) : text;
    const buffLines = buffText.split('\n').map(line => line.trim()).filter(Boolean);
    const selectedDescriptions = [];
    let lineCursor = 0;
    for (const tier of buttonTiers) {
      let description = '';
      for (let lineIndex = lineCursor; lineIndex < buffLines.length; lineIndex++) {
        const cleanLine = diangucNormalize(buffLines[lineIndex]);
        const tierMatch = cleanLine.match(/^(Thiên|Huyền|Linh|Phàm)\b/iu);
        const hasTierList = /^(?:Thiên|Huyền|Linh|Phàm)\s*[,|]\s*(?:Thiên|Huyền|Linh|Phàm)/iu.test(cleanLine);
        if (!tierMatch || tierMatch[1].toLowerCase() !== tier.toLowerCase() || hasTierList) continue;
        description = cleanLine.slice(tierMatch[0].length).trim();
        lineCursor = lineIndex + 1;
        break;
      }
      selectedDescriptions.push(description);
    }
    return parsedButtons.map((item, index) => {
      const description = selectedDescriptions[index] || diangucNormalize(item.button.text);
      return { button: item.button, index: item.index, tier: buttonTiers[index], description };
    });
  }

  chooseDiangucBuff(text, buttons) {
    const candidates = this.extractDiangucBuffs(text, buttons).filter(item => !/hồi/i.test(item.description));
    const usable = candidates.length ? candidates : this.extractDiangucBuffs(text, buttons);
    for (const regex of DIANGUC_COMPILED_PATTERNS) {
      const matched = usable.filter(item => regex.test(item.description));
      if (matched.length) {
        matched.sort((a, b) => {
          const tierDiff = ['Thiên', 'Huyền', 'Linh', 'Phàm'].indexOf(a.tier) - ['Thiên', 'Huyền', 'Linh', 'Phàm'].indexOf(b.tier);
          const aNumber = Number((a.description.match(/[0-9]+(?:[.,][0-9]+)?/) || ['0'])[0].replace(',', '.'));
          const bNumber = Number((b.description.match(/[0-9]+(?:[.,][0-9]+)?/) || ['0'])[0].replace(',', '.'));
          return tierDiff || bNumber - aNumber || b.description.localeCompare(a.description, 'vi');
        });
        return matched[0];
      }
    }
    const tierRank = { Thiên: 0, Huyền: 1, Linh: 2, Phàm: 3 };
    return usable.slice().sort((a, b) => (tierRank[a.tier] ?? 4) - (tierRank[b.tier] ?? 4))[0] || null;
  }

  async diangucLoop(runId) {
    this.loadDiangucData();
    while (this.isRunning && this.runId === runId) {
      this.diangucPending = null;
      // Xoá mark của lần chạy trước để card của người khác không bị dính lại.
      await this.exec(`(() => {
        window.diangucAnchorId = '';
        document.querySelectorAll('[role="article"]').forEach(msg => {
          msg.removeAttribute('data-dianguc-owned');
          msg.removeAttribute('data-dianguc-resolved');
          msg.removeAttribute('data-dianguc-buff-clicked');
          msg.removeAttribute('data-dianguc-target');
          msg.removeAttribute('data-dianguc-anchor');
        });
        return true;
      })()`);
      await this.sendChat(this.diangucCmd);
      await this.delay(2000);
      const anchor = await this.captureDiangucAnchor();
      if (!anchor) {
        this.saveDiangucData();
        this.log('❌ Địa Ngục dừng: không xác định được message game qua reply preview.');
        return;
      }
      const ownedCount = await this.markDiangucMessages();
      if (!ownedCount) {
        this.saveDiangucData();
        this.log('❌ Địa Ngục dừng: anchor có nhưng không tìm thấy message reply preview thuộc game.');
        return;
      }
      this.log(`🔗 Đã đánh dấu ${ownedCount} message Địa Ngục.`);
      let result;
      try {
        result = await this.diangucAttempt(runId);
      } catch (error) {
        this.saveDiangucData();
        this.log(`❌ Lỗi Địa Ngục: ${error.message}`);
        result = 'ERROR';
      }
      this.saveDiangucData();
      if (result === 'TARGET') {
        this.log('✅ Đã gặp message đánh boss 41 hoặc tầng 51. Dừng Địa Ngục.');
        await this.stop();
        return;
      }
      if (result === 'DEATH') {
        this.log('🛑 Đã chết trong Địa Ngục. Dừng bot, không gửi lại !dianguc.');
        await this.stop();
        return;
      }
      if (result === 'STOP') return;
      if (result === 'ERROR') {
        this.log('⏸️ Địa Ngục dừng lượt này (hết thời gian/kẹt/lỗi), đã lưu Excel.');
        await this.stop();
        return;
      }
      if (this.isRunning && this.runId === runId) await this.delay(2000);
    }
  }

  async diangucAttempt(runId) {
    // Không dùng mốc thời gian cứng vì một lượt Địa Ngục hợp lệ có thể chạy rất lâu.
    // Chỉ dừng khi bot "kẹt" (không tiến triển) hoặc vượt chặn trên an toàn.
    const startedAt = Date.now();
    const maxDurationMs = 120 * 60 * 1000;
    const stallTimeoutMs = 10 * 60 * 1000;
    let lastProgressAt = Date.now();
    let lastProgressMarker = `${this.diangucFloor || 0}|${this.diangucStep || 0}`;
    let missing = 0;
    while (this.isRunning && this.runId === runId && Date.now() - startedAt < maxDurationMs) {
      if (Date.now() - lastProgressAt > stallTimeoutMs) {
        this.log(`⚠️ Địa Ngục không tiến triển trong ${Math.round(stallTimeoutMs / 60000)} phút (tầng ${this.diangucFloor}, bước ${this.diangucStep}), dừng lượt này.`);
        this.saveDiangucData();
        return 'ERROR';
      }
      // Message buff/battle mới được bot tạo sau lần scan trước vẫn phải được
      // nối vào chuỗi reply của !dianguc trước khi quét trạng thái tiếp theo.
      await this.markDiangucMessages();
      const state = await this.scanDianguc();
      if (!state) {
        missing++;
        // Khoảng nghỉ giữa các pha của game có thể rất lâu (nhiều người đánh xong
        // game mới chuyển màn), nên chờ tới ~150s thay vì bỏ cuộc sớm gây đứng im.
        // Bộ dò stall (10 phút không tiến triển) vẫn là lưới an toàn cuối cùng.
        if (missing > 300) {
          this.log('⚠️ Mất message Địa Ngục quá lâu (~150s), đã lưu Excel.');
          return 'ERROR';
        }
        if (missing % 60 === 0) {
          this.log(`⏳ Đang chờ message Địa Ngục (${Math.round(missing / 2)}s)...`);
        }
        await this.delay(500);
        continue;
      }
      missing = 0;
      const scanSignature = `${state.phase}|${state.buttonText || ''}`;
      if (scanSignature !== this.diangucLastScanSignature) {
        this.diangucLastScanSignature = scanSignature;
        this.log(`🔎 Địa Ngục scan: ${state.phase} | buttons: ${state.buttonText || '(trống)'}`);
      }
      if (state.target) return 'TARGET';
      if (state.floor) {
        if (this.diangucFloor && this.diangucFloor !== state.floor) this.diangucData = {};
        this.diangucFloor = state.floor;
      }
      if (state.step && !state.missedResponse) this.diangucStep = state.step;
      const progressMarker = `${this.diangucFloor || 0}|${this.diangucStep || 0}`;
      if (progressMarker !== lastProgressMarker) {
        lastProgressMarker = progressMarker;
        lastProgressAt = Date.now();
      }

      const lower = state.text.toLowerCase();
      const isActiveChoice = ['DIRECTION', 'BUFF', 'MYSTERY'].includes(state.phase);
      if (state.phase !== 'BUFF') {
        this.diangucBuffWaitKey = '';
        this.diangucBuffWaitStartedAt = 0;
      }
      const isConfirmedDeath = !state.metadataOnly && (
        /đã chết!?[\s\S]*đã ngã xuống[\s\S]*reset về tầng địa ngục/i.test(lower)
        || /death[\s\S]*reset về tầng địa ngục/i.test(lower)
      );
      if (!isActiveChoice && isConfirmedDeath) {
        this.saveDiangucData();
        this.log(`💀 Địa Ngục chết ở tầng ${this.diangucFloor}, bước ${this.diangucStep}; làm lại từ bước 1 cùng tầng.`);
        return 'DEATH';
      }
      if (state.metadataOnly) {
        await this.delay(this.diangucChoiceDelayMs);
        continue;
      }
      if (this.diangucPending && lower.includes('sai đường')) {
        this.recordDiangucDirection(this.diangucPending.step, this.diangucPending.direction, 'sai');
        this.diangucPending = null;
        lastProgressAt = Date.now();
      } else if (this.diangucPending && lower.includes('đúng đường')) {
        this.recordDiangucDirection(this.diangucPending.step, this.diangucPending.direction, 'đúng');
        this.diangucPending = null;
        lastProgressAt = Date.now();
      } else if (this.diangucPending && state.missedResponse && state.phase === 'DIRECTION') {
        // Game hết giờ phản hồi ("không phản hồi kịp thời") nhưng vẫn hiện lại màn
        // chọn hướng. Huỷ trạng thái chờ để nhánh DIRECTION phía dưới click lại hướng
        // của CÙNG bước này: không ghi gì, không đổi diangucStep (guard đã chặn ở trên).
        const missedStep = this.diangucPending.step;
        this.diangucPending = null;
        this.log(`⏰ Hụt hướng (không phản hồi kịp thời) ở bước ${missedStep}, click lại hướng cho cùng bước (giữ nguyên bước).`);
      } else if (this.diangucPending && state.phase === 'DIRECTION') {
        // Card hướng cũ vẫn còn trong DOM cho tới khi game trả kết quả.
        // Chỉ chặn khi scan vẫn còn ở màn chọn hướng; nếu game đã chuyển sang
        // BUFF/BATTLE (nhưng lỡ không kèm chữ "đúng/sai đường") thì phải tiếp tục
        // xử lý pha mới thay vì chờ vô thời hạn -> gây đứng im.
        // Log 1 lần (rồi mỗi 30s) để không nhìn như bot bị treo.
        const now = Date.now();
        if (!this.diangucPending.waitingLoggedAt || now - this.diangucPending.waitingLoggedAt >= 30000) {
          this.diangucPending.waitingLoggedAt = now;
          this.log(`⏳ Đang chờ game xác nhận hướng bước ${this.diangucPending.step} (${this.diangucPending.direction})...`);
        }
        await this.delay(this.diangucChoiceDelayMs);
        continue;
      }

      if (state.phase === 'MYSTERY') {
        const clicked = await this.clickDiangucMystery(state.targetKey, state.buttons);
        this.log(clicked
          ? `🎲 Đã click sự kiện bí ẩn: ${state.buttons.find(button => !/^[@!]/.test(button.text) && !/^(?:quất bất lực|xỏ lá ba que)$/iu.test(button.text))?.text || 'nút đầu tiên'}`
          : '⚠️ Không tìm thấy nút lựa chọn sự kiện bí ẩn');
        if (clicked) lastProgressAt = Date.now();
        await this.delay(1500);
        continue;
      }
      if (state.phase === 'BUFF') {
        // Game dùng lại/ửa cùng một message cho mỗi màn buff, nên không thể đánh dấu
        // vĩnh viễn. Chỉ bỏ qua trong thời gian ngắn sau lần click gần nhất để tránh
        // click trùng, nhưng vẫn cho phép click ở bước kế tiếp.
        if (state.missedResponse) {
          // Game báo "không phản hồi kịp thời" -> buff bị hụt, phải click lại NGAY
          // và GIỮ NGUYÊN bước để không làm hỏng dữ liệu hướng của bước đó.
          this.diangucLastBuffKey = '';
          this.diangucLastBuffClickAt = 0;
          this.diangucBuffWaitKey = '';
          this.diangucBuffWaitStartedAt = 0;
          this.log(`⏰ Hụt buff (không phản hồi kịp thời), click lại ở bước ${this.diangucStep || '?'} (giữ nguyên bước).`);
        }
        const buffKey = state.id || state.buttonText || '';
        if (!state.missedResponse && this.diangucBuffWaitMs > 0) {
          const waitKey = `${state.targetKey || buffKey}|${state.buttonText || ''}`;
          if (waitKey !== this.diangucBuffWaitKey) {
            this.diangucBuffWaitKey = waitKey;
            this.diangucBuffWaitStartedAt = Date.now();
            this.log(`⏳ Chờ ${Math.ceil(this.diangucBuffWaitMs / 1000)}s để bạn tự chọn buff...`);
          }
          const remainingMs = this.diangucBuffWaitMs - (Date.now() - this.diangucBuffWaitStartedAt);
          if (remainingMs > 0) {
            await this.delay(Math.min(500, remainingMs));
            continue;
          }
        }
        if (!state.missedResponse && buffKey && buffKey === this.diangucLastBuffKey
          && Date.now() - this.diangucLastBuffClickAt < 5000) {
          await this.delay(this.diangucChoiceDelayMs);
          continue;
        }
        const choice = this.chooseDiangucBuff(state.text, state.buttons);
        if (choice) {
          const clicked = await this.clickDiangucBuff(state.targetKey, choice.index);
          if (clicked) {
            this.diangucLastBuffKey = buffKey;
            this.diangucLastBuffClickAt = Date.now();
            // Click lại khi đang hụt không tính là "tiến triển" để nếu game thực sự kẹt
            // thì bộ dò stall vẫn có thể dừng lượt sau 10 phút.
            if (!state.missedResponse) lastProgressAt = Date.now();
          }
          this.log(`${clicked ? '✨ Đã click buff' : '⚠️ Click buff thất bại'}: ${choice.tier} | ${choice.description || choice.button.text}`);
        } else {
          this.log(`⚠️ Không tìm thấy buff hợp lệ: ${state.buttonText || '(trống)'}`);
        }
        await this.delay(this.diangucChoiceDelayMs);
        continue;
      }
      if (state.phase === 'DIRECTION') {
        const currentStep = state.step || this.diangucStep || 1;
        if (!this.diangucStep) this.diangucStep = currentStep;
        const choice = this.chooseDiangucDirection(currentStep, state.buttons);
        if (choice && await this.clickDiangucDirection(state.targetKey, choice.direction)) {
          this.diangucPending = { step: currentStep, direction: choice.direction };
          this.log(`🧭 Tầng ${this.diangucFloor}, bước ${this.diangucStep}: đã click hướng ${choice.direction}`);
        } else if (choice) {
          this.log(`⚠️ Không click được hướng ${choice.direction} trong message ${state.targetKey || '(không có target)'}`);
        } else {
          this.log(`⚠️ Không tìm thấy hướng chưa thử. Buttons: ${state.buttonText || '(trống)'}`);
        }
        await this.delay(this.diangucChoiceDelayMs);
        continue;
      }
      if (state.phase === 'BATTLE') {
        // KHÔNG dùng chữ "thắng!" làm điều kiện bỏ qua trận: trận phạt khi chọn sai
        // hướng cũng nhắc "thắng!" ngay giữa trận. Nếu bỏ qua, bot ngừng click skill,
        // trận không bao giờ kết thúc -> đứng im. Cứ đánh tiếp tới khi message chuyển
        // pha (hết nút skill rồi mới sang màn chọn hướng).
        const clickedSkill = await this.clickNextDiangucSkill();
        if (clickedSkill) this.log(`⚔️ Địa Ngục click skill: ${clickedSkill}`);
        else this.log(`⚠️ Battle không tìm thấy skill trong message Địa Ngục: ${state.buttonText || '(trống)'}`);
        await this.delay(this.skillClickDelayMs);
        continue;
      }
      await this.delay(this.diangucDelayMs);
    }
    this.saveDiangucData();
    return this.isRunning ? 'ERROR' : 'STOP';
  }
  //#endregion
  // ================= LUÂN HỒI MODE =================
  //#region Luân Hồi
  async luanhoiLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;

    // RESET trạng thái tầng mỗi run mới — không để giá trị cũ (từ run trước) làm sai logic
    // advance/click buff (window.luanhoiBuffTierClicked phải về 0 để tầng 1 được chọn lại).
    this.luanhoiCurrentTier = 0;
    // FIX combo Luân Hồi: lượt mới = tầng 1 mới, combo quay về skill đầu tiên.
    // Chỉ reset luanhoiSkillIdx (Luân Hồi); _bicanhSkillIdx của Bicanh không đụng tới.
    this.luanhoiSkillIdx = 0;
    // Target hiệu dụng của lượt này: ban đầu = Target người dùng nhập.
    // Nếu tới Target mà chưa có mảnh, nó sẽ được nâng lên mốc boss kế (+10)
    // ở đoạn kiểm tra Target trong luanhoiFightLoop, và reset lại ở lượt mới.
    this.luanhoiEffectiveTarget = this.luanhoiTarget;
    await this.exec('window.luanhoiBuffTierClicked = 0; window.luanhoiBuffClickedAt = 0; true;');

    this.log(`\n=== 🌀 LUÂN HỒI: ${this.luanhoiCmd} ===`);
    await this.exec('window.luanhoiAnchorBeforeId = window.botMaxMsgId || "0"; window.luanhoiAnchorId = ""; true;');
    await this.sendChat(this.luanhoiCmd);
    await this.delay(this.rand(3000, 4000));
    if (!this.isRunning || this.runId !== runId) return;
    const anchorId = await this.captureLuanhoiAnchor();
    if (!anchorId) {
      this.log('⛔ Luân hồi dừng để tránh thao tác nhầm battle khác.');
      return;
    }
    await this.markLuanhoiMessages();

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

  async luanhoiFightLoop(runId, opts = {}) {
    if (!this.isRunning || this.runId !== runId) return;

    // Chống spam log khi advance kẹt ở cùng 1 tầng: header chỉ in khi đổi tầng
    // hoặc đã quá 3s từ header trước, thay vì in mỗi lần FightLoop đệ quy
    // (log thật đã có 2129 header cho 220 tầng, phần lớn là advance lặp).
    const _hdrTier = this.luanhoiCurrentTier || 0;
    if (_hdrTier !== this._lhLastHeaderTier || Date.now() - (this._lhLastHeaderAt || 0) > 3000) {
      this.log('\n=== ⚔️ Chiến đấu luân hồi ===');
      this._lhLastHeaderTier = _hdrTier;
      this._lhLastHeaderAt = Date.now();
    }

    // opts.autoAdvanced = true khi vừa chọn buff GIỮA TRẬN (tick type='buff') ở tầng
    // THƯỜNG: buff tầng mới đã click xong, không có cửa boss. Lúc đó pre-battle loop
    // (quét cửa + quét buff + delay) làm mất ~1-2s vô ích — luanhoiBattleTick() tự xử lý
    // mọi nhánh (buff / advance / end / cooldown / skill) nên vào thẳng luanhoiBattle.
    let autoAdvanced = opts.autoAdvanced === true;

    // PRE-BATTLE: game tự di chuyển tới tầng kế và hiện màn chọn cửa (boss 10/20/30) + buff.
    // Đợi tới khi thấy buff (hoặc cửa) xuất hiện rồi chọn. Chỉ click khi nút hiện.
    const preTimeout = Date.now() + 15000; // tối đa 15s chờ chọn buff
    let entered = false;
    let enteredFast = false;
    let doorClicked = false;
    while (this.isRunning && this.runId === runId && Date.now() < preTimeout) {
      // Quét nút "Tiếp tục leo tháp" còn sót từ lần trước (bot bị kill/restart giữa chừng).
      // Ở tầng thường game tự sang tầng → không có nút là bình thường → chỉ logDebug.
      const leftoverCont = await this.clickContinueOrStop('continue', true);
      if (leftoverCont) {
        this.log(`↪️ Phát hiện & bấm nút "Tiếp tục leo tháp" còn sót lại: ${leftoverCont}`);
        await this.luanhoiClickWait(1200);
        // Có nút "Tiếp tục leo tháp" sót = vòng trước bot đã đọc sai tầng và bỏ qua
        // bước này. Quét lại message battle để chốt tầng đúng, tránh lệch tích luỹ.
        const fixedTier = await this.readLuanhoiTier();
        if (fixedTier > 0 && fixedTier !== this.lastLuanhoiTarget) {
          this.log(`🔧 [Sửa tầng] Sau khi bấm "Tiếp tục leo tháp": tầng = ${fixedTier} (trước đó ghi nhận ${this.lastLuanhoiTarget ?? 'chưa rõ'}).`);
        }
        this.lastLuanhoiTarget = fixedTier > 0 ? fixedTier : this.lastLuanhoiTarget;
        if (fixedTier > 0) this.luanhoiCurrentTier = fixedTier;
        continue;
      }

      // Fast-path: buff tầng mới đã chọn xong, chỉ cần chờ game vào trận.
      // Nếu nhánh này hỏng (buff chưa kịp hiện) thì rơi về luồng đầy đủ bên dưới.
      if (autoAdvanced) {
        autoAdvanced = false;
        entered = true;
        enteredFast = true;
        break;
      }

      if (await this.clickDoor('up')) {
        this.log('🚪 Đã chọn cửa hướng lên (boss mốc).');
        doorClicked = true;
        await this.luanhoiClickWait(1200);
      }
      await this.delay(700);
      const b = await this.clickBuffByPriority();
      if (b) {
        this.log(`⚡ Đã chọn buff: "${b}"`);
        await this.luanhoiClickWait(1200);
        entered = true;
        const tierNow = await this.readLuanhoiTier();
        if (tierNow > 0) this.luanhoiCurrentTier = tierNow;
        break;
      }
      // Nếu buff đã chọn từ trước (khi advance giữa trận sang tầng mới) hoặc đã trong trận.
      // Tuyệt đối KHÔNG nhảy vào trận nếu vừa bấm cửa hoặc vừa thắng boss mốc — bắt buộc phải chờ chọn buff mới!
      if (!doorClicked && !opts.afterBossWin) {
        const curTier = await this.readLuanhoiTier();
        const clickedTier = await this.exec('window.luanhoiBuffTierClicked || 0');
        if (clickedTier > 0 && curTier > 0 && clickedTier >= curTier) {
          entered = true;
          break;
        }
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
      await this.delay(this.rand(700, 1200));
    }

    if (!entered) {
      this.log('⚠️ Luân hồi: quá lâu không thấy màn chọn buff. Thử lại vòng kế...');
      await this.cooldownWait(10, runId);
      if (this.isRunning && this.runId === runId) this.luanhoiFightLoop(runId);
      return;
    }

    if (!enteredFast) {
      await this.delay(this.rand(1500, 2500));
    } else if (opts.advanceSelectedAt) {
      const remaining = 2000 - (Date.now() - opts.advanceSelectedAt);
      if (remaining > 0) await this.delay(remaining);
    }

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
    const isLoss = battleResult && battleResult.ended && battleResult.result === 'loss';
    // FIX đếm lượt: nếu trận trả về 'unknown' nhưng rewardText đã chứa cụm kết thúc
    // tháp (Ngã Xuống / Kết Thúc Luân Hồi) thì vẫn tính là thua 1 lượt, không để
    // lượt đó trôi qua mà không đếm (đó là lý do trước đây counter kẹt ở 0 / N).
    const isTowerEndLoss = !!(battleResult && battleResult.rewardText &&
      /ngã xuống luân hồi tháp|nga xuong luan hoi thap|kết thúc luân hồi|ket thuc luan hoi/i.test(battleResult.rewardText) &&
      !/chiến thắng|thắng!/i.test(battleResult.rewardText));
    const isLossFinal = isLoss || (battleResult && battleResult.ended && isTowerEndLoss);

    if (isWin) {
      this.stats.wins++;
      this.log('✅ THẮNG BOSS!');
    } else if (isAdvance) {
      this.stats.wins++;
      // Advance lặp cùng tầng (đã thấy ở BattleTick) thì không log lại,
      // tránh 1 tầng in hàng trăm lần "THẮNG TẦNG" trong cùng 1 giây.
      if (!(battleResult.tier > 0 && battleResult.tier === this._lhLastAdvanceTier)) {
        this.log('⏩ THẮNG TẦNG / SANG TẦNG KẾ!');
      }
    } else if (isLossFinal) {
      this.stats.losses++;
      this.log('❌ THUA BOSS!');
    } else {
      this.log('⚠️ Luân hồi: không xác định được kết quả trận.');
    }
    /*
    }







      this.printStats();
      this.stop();
      return;
    }

    */ if (isLossFinal) {
      this.luanhoiRunCount++;
      const _totalRunsLimit = this.luanhoiTotalRuns || 0;
      this.log(`🏁 Kết thúc lượt Luân Hồi (thua trận). Đã đi: ${this.luanhoiRunCount}${_totalRunsLimit > 0 ? ' / ' + _totalRunsLimit : ''} lần`);
      if (_totalRunsLimit > 0 && this.luanhoiRunCount >= _totalRunsLimit) {
        this.log(`🛑 Đã hoàn thành đủ ${_totalRunsLimit} lần đi. Dừng bot.`);
        this.printStats();
        await this.stop();
        return;
      }
      this.log(`🔁 Phát hiện thua — bắt đầu lại Luân Hồi (${this.luanhoiCmd}) sau ${this.luanhoiRestartDelaySec}s...`);
      await this.cooldownWait(this.luanhoiRestartDelaySec, runId);
      if (this.isRunning && this.runId === runId) {
        this.luanhoiSkillIdx = 0;
        this.lastLuanhoiTarget = null;
        this.luanhoiLoop(runId);
      }
      return;
    }

    // Với tầng thường, tính thời gian chờ từ lúc click buff thay vì cộng nhiều delay
    // sau khi game đã báo sang tầng.
    if (!isAdvance) await this.delay(this.rand(2500, 3500));

    let currentTier = await this.readLuanhoiTier();
    if (isAdvance && battleResult.tier > 0) currentTier = battleResult.tier;
    this.lastLuanhoiTarget = currentTier;
    if (currentTier > 0) this.luanhoiCurrentTier = currentTier;
    const quickAdvance = isAdvance && currentTier > 0 && currentTier % 10 !== 0;
    // Lớp chống quay vòng thứ 2 (ngoài dedup trong BattleTick): advance mà
    // tầng không đổi so với lần advance trước thì chờ 1200ms để game kịp
    // đổi card, thay vì đệ quy ngay lập tức và quay lại cùng card đó.
    const _sameTierAdvance = isAdvance && currentTier > 0 && currentTier === this._lhLastAdvanceTier;
    if (_sameTierAdvance) await this.delay(1200);
    if (isAdvance && currentTier > 0) this._lhLastAdvanceTier = currentTier;
    if (isAdvance && !quickAdvance) await this.delay(this.rand(2500, 3500));

    const _effectiveTarget = this.luanhoiEffectiveTarget || this.luanhoiTarget;
    if (currentTier >= _effectiveTarget && isWin) {
      // Quy tắc Mảnh set (2026-10-31): tới Target mà chưa có mảnh thì KHÔNG
      // dừng, KHÔNG đếm lượt, mà đi tiếp tới mốc boss kế (+10 tầng).
      // Ví dụ: Target 200, Mảnh set: 0 loại -> đi tiếp tới 210, vẫn 0 -> 220,
      // đánh xong 220 mà Mảnh set > 0 thì mới dừng / đếm lượt như cũ.
      // "Có mảnh" = Mảnh set >= 1 loại trong panel thưởng sau boss.
      let _manh = this.parseLuanhoiManhSet(battleResult && battleResult.rewardText ? battleResult.rewardText : '');
      if (_manh === null) _manh = await this.readLuanhoiManhSet();
      if (_manh !== null && _manh <= 0) {
        const _nextTarget = (Math.floor(currentTier / 10) + 1) * 10;
        this.luanhoiEffectiveTarget = _nextTarget;
        this.log(`🧩 Tới tầng ${_effectiveTarget} (hiện tại ${currentTier}) nhưng Mảnh set: 0 loại — chưa có mảnh, đi tiếp tới tầng ${_nextTarget}, không dừng, không đếm lượt.`);
        // Không return ở đây: rơi xuống logic boss mốc bên dưới để bấm
        // "Tiếp tục leo tháp" và leo tiếp bình thường.
      } else {
        if (_manh === null) {
          this.log(`⚠️ Không đọc được "Mảnh set" ở tầng ${currentTier} — dừng theo Target cũ (${_effectiveTarget}) để tránh chạy vô hạn.`);
        } else {
          this.log(`🧩 Đã có Mảnh set: ${_manh} loại ở tầng ${currentTier} — đủ điều kiện dừng.`);
        }
        this.log(`✅ Đã đạt tầng mục tiêu ${_effectiveTarget} (hiện tại ${currentTier}). Chọn DỪNG nhận thưởng.`);
        const stopResult = await this.clickContinueOrStop('stop');
        this.log(`[DỪNG] clickContinueOrStop('stop') returned: ${stopResult}`);
        this.luanhoiRunCount++;
        const _totalRunsLimit = this.luanhoiTotalRuns || 0;
        this.log(`🏁 Kết thúc lượt Luân Hồi (đạt Tầng Dừng). Đã đi: ${this.luanhoiRunCount}${_totalRunsLimit > 0 ? ' / ' + _totalRunsLimit : ''} lần`);
        if (_totalRunsLimit > 0 && this.luanhoiRunCount >= _totalRunsLimit) {
          this.log(`🛑 Đã hoàn thành đủ ${_totalRunsLimit} lần đi. Dừng bot.`);
          this.printStats();
          await this.stop();
          return;
        }
        this.printStats();

        // >>> NEW: tự động gửi lại lệnh !luanhoi để chạy vòng mới, giống cơ chế
        // startTuLuyenAfterTarget() của mode NPC — thay vì stop() luôn.
        if (this.luanhoiAutoRestart) {
          this.log(`🔁 Tự động bắt đầu lại Luân Hồi (${this.luanhoiCmd}) sau ${this.luanhoiRestartDelaySec}s...`);
          await this.cooldownWait(this.luanhoiRestartDelaySec, runId);
          if (this.isRunning && this.runId === runId) {
            this.luanhoiSkillIdx = 0;
            this.lastLuanhoiTarget = null;
            this.luanhoiLoop(runId);
          }
          return;
        }

        this.stop();
        return;
      }
    }

    // Boss mốc (tầng 10, 20, 30...) không tự sang tầng: cần bấm "Tiếp tục leo tháp".
    // CHỈ áp dụng khi thật sự vừa hạ gục boss (isWin) — nếu chỉ là "advance" (tự động sang tầng
    // và tầng đó tình cờ là mốc 10) thì nghĩa là mới VỪA CHẠM MẶT boss, chưa đánh nó, phải fight tiếp.
    let justWonBoss = false;
    if (isWin && currentTier > 0 && currentTier % 10 === 0) {
      this.log(`🔄 Thắng BOSS tầng ${currentTier} — cần bấm "Tiếp tục leo tháp" để đi tiếp.`);
      let cont = null;
      const bossTier = currentTier;
      const contDeadline = Date.now() + 30000; // chờ tối đa 30s — bot Xola có lúc trả lời chậm
      let contAttempt = 0;
      while (!cont && Date.now() < contDeadline) {
        if (!this.isRunning || this.runId !== runId) return;
        contAttempt++;

        const alreadyPast = await this.checkAlreadyPastContinue(bossTier);
        if (alreadyPast) {
          this.log(`↪️ Phát hiện màn "Sau Tầng ${alreadyPast}" đã hiện ra — đã qua bước Tiếp tục leo tháp rồi (chỉ là message thắng boss cũ vẫn còn hiển thị), bỏ qua chờ nút.`);
          cont = 'already-advanced';
          break;
        }

        cont = await this.clickContinueOrStop('continue');
        if (cont) break;
        this.log(`   ...chưa thấy nút "Tiếp tục leo tháp" (lần ${contAttempt}), thử lại...`);
        await this.delay(this.rand(2000, 3000));
      }
      if (cont) {
        this.log(`✅ Đã click nút tiếp tục (${cont}).`);
        justWonBoss = true;
        const nextTier = bossTier + 1;
        currentTier = nextTier;
        this.luanhoiCurrentTier = nextTier;
        this.lastLuanhoiTarget = nextTier;
      } else {
        // Không tìm thấy nút "Tiếp tục" → readLuanhoiTier() đã đọc sai tầng (cao hơn thực tế).
        // Thực tế người chơi đang ở tầng trước đó, chưa thắng boss mốc.
        // Cập nhật lại tầng = currentTier - 1 để khớp thực tế.
        const correctedTier = currentTier - 1;
        this.log(`⚠️ [Debug] Không tìm thấy nút Tiếp tục leo tháp.`);
        this.log(`🔧 [Sửa tầng] readLuanhoiTier() trả về ${currentTier} nhưng thực tế chưa qua boss mốc. Cập nhật tầng: ${currentTier} → ${correctedTier}`);
        currentTier = correctedTier;
        this.luanhoiCurrentTier = correctedTier;
        this.lastLuanhoiTarget = correctedTier;
      }
    } else if (currentTier > 0 && currentTier % 10 === 0) {
      this.log(`⚔️ Vừa sang tầng ${currentTier} (mốc BOSS) — chưa đánh boss này, tiếp tục chiến đấu...`);
    } else if (!_sameTierAdvance) {
      this.log(`🔄 Tầng thường ${currentTier} — game tự sang tầng kế, chờ chọn buff tiếp...`);
    }

    // Chỉ chờ dài khi vừa hạ boss / đạt target (game cần thời gian cập nhật message kết quả).
    // Sang tầng thường (advance) thì game tự chuyển tầng kế + tự đánh → chờ ngắn là đủ.
    if (!quickAdvance) {
      await this.delay(isAdvance ? this.rand(500, 1000) : this.rand(2500, 3500));
    }

    if (this.isRunning && this.runId === runId) {
      // FIX combo Luân Hồi: tới đây là sang tầng mới (advance / thắng boss mốc),
      // nên combo quay về skill đầu tiên. Không reset ở các nhánh retry cùng tầng
      // (quá hạn buff, cooldown) ở trên — trong cùng 1 tầng vẫn quay vòng bình thường.
      this.luanhoiSkillIdx = 0;
      if (!_sameTierAdvance) {
        this.log('🔄 Sang tầng mới — combo Luân Hồi reset về skill đầu tiên.');
      }
      // Tầng thường sau advance: buff đã chọn xong, không có cửa boss → fast-path.
      this.luanhoiFightLoop(runId, {
        autoAdvanced: quickAdvance,
        advanceSelectedAt: quickAdvance ? battleResult.selectedAt : null,
        afterBossWin: justWonBoss,
      });
    }
  }

  // Chiến đấu luân hồi: game tự đánh nên chỉ cần chờ trận kết thúc
  // Gộp 5 bước (buff, advance, battle-end, cooldown, click skill) vào 1 lần executeJavaScript/lượt
  // — thay vì 5-6 round-trip riêng biệt như trước, giảm trễ dội mỗi lượt đánh.
  async luanhoiBattleTick() {
    await this.markLuanhoiMessages();
    await this.dismissEphemeralMessages();
    const username = this.username || '';
    const names = this.luanhoiSkillNames;
    const startIdx = this.luanhoiSkillIdx % names.length;
    // KHÔNG tăng idx ở đây — chỉ tăng SAU KHI xác nhận đã thực sự bấm được 1 skill (xem dưới),
    // để tránh lệch thứ tự xoay vòng khi lượt đó chỉ chọn buff/cooldown/không bấm được gì.
    const rotatedNames = names.map((_, i) => names[(startIdx + i) % names.length]);

    const tick = await this.exec(`(() => {
      const removeVN = s => (s || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd')
        .replace(/\u01A1/g, 'o').replace(/\u01A0/g, 'o')
        .replace(/\u01B0/g, 'u').replace(/\u01AF/g, 'u')
        .toLowerCase();

      const username = ${JSON.stringify(username)};
      const tierOf = { 'thien': 3, 'huyen': 2, 'linh': 1, 'pham': 0 };
      const tierNames = ['pham', 'linh', 'huyen', 'thien'];
      const rotatedNames = ${JSON.stringify(rotatedNames)};
      const namesNoD = rotatedNames.map(n => removeVN(n).replace(/[^a-z0-9]/g, ''));

      const msgs = document.querySelectorAll('[role="article"]');
      const recent40 = Array.from(msgs).slice(-40).reverse();
      const recent30 = recent40.slice(0, 30);

      // ---- 0) TOWER-END LOSS (ưu tiên trên BUFF/ADVANCE, chỉ Luân Hồi) ----
      // Lý do: trước đây bước BUFF/ADVANCE chạy trước nên 1 card buff cũ còn sót
      // có thể "nuốt" message Ngã Xuống / Kết Thúc, khiến lượt đó không bao giờ
      // được đếm (counter kẹt 0 / N, điều kiện dừng đủ lượt không bao giờ tới,
      // và do đó stop() cuối lượt cũng không bao giờ chạy).
      // Chỉ nhận cụm kết thúc tháp rõ ràng, vẫn giữ cổng owned như bước 3 cũ
      // để message của lượt cũ không bị đếm lại sau khi restart (re-anchor sẽ
      // gỡ owned của message cũ), và không nhận message có dấu hiệu thắng.
      for (const msg of recent30) {
        const rawText = msg.textContent || '';
        if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
        const text = rawText.toLowerCase();
        const isTowerEnd = /ngã xuống luân hồi tháp|nga xuong luan hoi thap|kết thúc luân hồi tháp|ket thuc luan hoi thap|kết thúc luân hồi|ket thuc luan hoi/.test(text);
        const isWinText = /chiến thắng|thắng!/.test(text);
        if (isTowerEnd && !isWinText) {
          return { type: 'end', result: 'loss', rewardText: rawText };
        }
      }

      // ---- 1) BUFF (ưu tiên cao nhất) ----
      for (const msg of recent40) {
        const rawText = msg.textContent || '';
        if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
        const btns = msg.querySelectorAll('button, [role="button"]');
        if (btns.length === 0) continue;
        let maxP = -1, bestBtn = null, bestText = '';
        for (const b of btns) {
          if (b.disabled) continue;
          const raw = (b.textContent || '').trim();
          if (!raw || /[@|!]/.test(raw)) continue;
          const clean = raw.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!tierNames.includes(clean)) continue;
          const p = tierOf[clean];
          if (p > maxP) { maxP = p; bestBtn = b; bestText = raw; }
        }
        if (!bestBtn) continue;
        let msgTier = 0;
        const sauM = rawText.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
        if (sauM && sauM[1]) {
          msgTier = parseInt(sauM[1]) + 1;
        } else {
          const tm = rawText.match(/(?:t[a\\u1ea7]ng(?:\\s+lu[a\\u00e2]n\\s+h[o\\u1ed3]i)?|tier)\\s*[:.\u2013-]?\\s*([0-9]{1,3})/i);
          if (tm && tm[1]) msgTier = parseInt(tm[1]);
        }
        const clickedTier = window.luanhoiBuffTierClicked || 0;
        const lastClickedTime = window.luanhoiBuffClickedAt || 0;
        const now = Date.now();

        // 1. Bỏ qua tầng cũ hơn tầng đã click
        if (msgTier > 0 && msgTier < clickedTier) continue;

        // 2. Nếu cùng tầng đã click (hoặc không rõ tầng) nhưng chưa đủ 3.5s -> chờ game xử lý, không spam
        if ((msgTier === 0 || msgTier === clickedTier) && lastClickedTime > 0 && (now - lastClickedTime < 3500)) continue;

        bestBtn.click();
        const isRetry = (msgTier > 0 && msgTier === clickedTier) || (msgTier === 0 && lastClickedTime > 0);
        window.luanhoiBuffTierClicked = Math.max(clickedTier, msgTier);
        window.luanhoiBuffClickedAt = now;
        return { type: isRetry ? 'buff-retry' : 'buff', text: bestText, tier: msgTier };
      }

      // ---- 2) ADVANCE (tầng mới xuất hiện qua card buff, chưa được click ở bước 1) ----
      {
        const clickedTier = window.luanhoiBuffTierClicked || 0;
        for (const msg of recent40) {
          const rawText = msg.textContent || '';
          if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
          let newTier = null;
          const sauM = rawText.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
          if (sauM && sauM[1]) {
            newTier = parseInt(sauM[1]) + 1;
          } else {
            const tm = rawText.match(/(?:t[a\\u1ea7]ng(?:\\s+lu[a\\u00e2]n\\s+h[o\\u1ed3]i)?|tier)\\s*[:.\u2013-]?\\s*([0-9]{1,3})/i);
            if (tm && tm[1]) newTier = parseInt(tm[1]);
          }
          const btns = msg.querySelectorAll('button, [role="button"]');
          let hasBuff = false;
          for (const b of btns) {
            const raw = (b.textContent || '').trim();
            if (!raw || /[@|!]/.test(raw)) continue;
            const clean = raw.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (tierNames.includes(clean)) { hasBuff = true; break; }
          }
          if (!hasBuff) continue;
          if (newTier !== null && newTier > clickedTier && clickedTier > 0) {
            // Chống advance quay vòng: cùng 1 tầng đã báo advance trong 5s qua
            // thì bỏ qua, để tick rơi xuống skill/cooldown thay vì FightLoop
            // đệ quy ngay lập tức và log lại cùng tầng hàng trăm lần/giây.
            // Tầng thật sự mới (khác tầng đã thấy) vẫn báo advance bình thường.
            const _advSeenTier = window.luanhoiAdvanceSeenTier || 0;
            const _advSeenAt = window.luanhoiAdvanceSeenAt || 0;
            if (newTier === _advSeenTier && Date.now() - _advSeenAt < 5000) continue;
            window.luanhoiAdvanceSeenTier = newTier;
            window.luanhoiAdvanceSeenAt = Date.now();
            return { type: 'advance', rewardText: rawText, tier: newTier };
          }
        }
      }

      // ---- 3) BATTLE END (win/loss) ----
      {
        const knownTier = window.luanhoiBuffTierClicked || 0;
        for (const msg of recent30) {
          const rawText = msg.textContent || '';
          if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
          const text = rawText.toLowerCase();
          const hasWin = /chiến thắng|thắng!/.test(text);
          const hasLoss = /thất bại|bạn đã thua|thua!|ngã xuống luân hồi tháp|nga xuong luan hoi thap|kết thúc luân hồi|ket thuc luan hoi/.test(text);
          const btns = msg.querySelectorAll('button, [role="button"]');
          let hasBuff = false;
          for (const b of btns) {
            const rawTxt = (b.textContent || '').trim();
            if (!rawTxt || /[@|!]/.test(rawTxt)) continue;
            const clean = rawTxt.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (tierNames.includes(clean)) { hasBuff = true; break; }
          }
          const isLuanhoi = hasBuff ||
            /luân hồi tháp|luanhoi thap|tháp luân hồi|thap luanhoi|ngã xuống luân hồi tháp|nga xuong luan hoi thap|thắng boss|kết thúc luân hồi|ket thuc luan hoi|tiếp tục leo tháp|tiep tuc leo thap|chọn 1 cổng|chon 1 cong|hạ gục boss|han guc boss|đánh bại boss|danh bai boss|chọn độ khó|chon do kho|kết thúc nhận|ket thuc nhan/i.test(rawText);
          if (!isLuanhoi) continue;

          if (hasBuff && !hasWin && !hasLoss && knownTier > 0) {
            let tm2Tier = 0;
            const sauM = rawText.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
            if (sauM && sauM[1]) {
              tm2Tier = parseInt(sauM[1]) + 1;
            } else {
              const tm2 = rawText.match(/(?:t[a\\u1ea7]ng(?:\\s+lu[a\\u00e2]n\\s+h[o\\u1ed3]i)?|tier)\\s*[:.\u2013-]?\\s*([0-9]{1,3})/i);
              if (tm2 && tm2[1]) tm2Tier = parseInt(tm2[1]);
            }
            if (tm2Tier > knownTier) {
              const _advSeenTier2 = window.luanhoiAdvanceSeenTier || 0;
              const _advSeenAt2 = window.luanhoiAdvanceSeenAt || 0;
              if (tm2Tier === _advSeenTier2 && Date.now() - _advSeenAt2 < 5000) continue;
              window.luanhoiAdvanceSeenTier = tm2Tier;
              window.luanhoiAdvanceSeenAt = Date.now();
              return { type: 'advance', rewardText: rawText, tier: tm2Tier };
            }
          }

          if (!hasWin && !hasLoss) {
            const contKeywords = ['tiếp tục leo tháp', 'tiep tuc leo thap', 'tiếp tục leo', 'tiep tuc leo', 'leo tháp', 'leo thap', 'tiếp tục', 'tiep tuc'];
            for (const b of btns) {
              const rawTxt = (b.textContent || '').trim();
              if (!rawTxt || /[@|!]/.test(rawTxt)) continue;
              const t0 = rawTxt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
              if (contKeywords.some(k => t0.includes(k))) {
                return { type: 'end', result: 'win', rewardText: rawText };
              }
            }
          }

          if (!hasWin && !hasLoss) {
            const bossHit = /hạ gục boss|han guc boss|đánh bại boss|danh bai boss/.test(rawText);
            let hasCont = false, hasStop = false;
            for (const b of btns) {
              const rawTxt = (b.textContent || '').trim();
              if (!rawTxt || /[@|!]/.test(rawTxt)) continue;
              const t0 = rawTxt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/:[a-z_0-9]+:/g, '');
              if (/tiếp|tiep/.test(t0)) hasCont = true;
              if (/kết thúc|ket thuc|dừng|dung/.test(t0)) hasStop = true;
            }
            if ((hasCont || hasStop) && bossHit) {
              return { type: 'end', result: 'win', rewardText: rawText };
            }
          }

          let hasFightBtn = false;
          for (const b of btns) {
            const t = (b.textContent || '').trim().toLowerCase();
            if (t === 'chiến đấu') { hasFightBtn = true; break; }
          }
          // FIX: message kết thúc tháp có thể kèm nút "Chiến đấu" (đánh lại) —
          // vẫn phải tính là kết thúc lượt, không được bỏ qua như message đang trận.
          const isTowerEndMsg = /ngã xuống luân hồi tháp|nga xuong luan hoi thap|kết thúc luân hồi|ket thuc luan hoi/.test(text);
          if (hasFightBtn && !isTowerEndMsg) continue;

          if (!hasWin && !hasLoss) continue;

          if (msg.id) {
            const parts = msg.id.split('-');
            window.botMaxMsgId = parts[parts.length - 1];
          }
          let res;
          if (hasWin && !hasLoss) res = 'win';
          else if (hasLoss && !hasWin) res = 'loss';
          else res = 'unknown';
          return { type: 'end', result: res, rewardText: rawText };
        }
      }

      // ---- 4) COOLDOWN ----
      {
        const maxIdStr = window.botMaxMsgId || '0';
        const maxId = BigInt(maxIdStr);
        const matchesUserMessage = text => {
          const value = String(text || '');
          if (!username) return true;
          const normalizedText = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
          const normalizedUser = username.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').toLowerCase();
          if (!normalizedText.includes(normalizedUser)) return false;
          return ['hồi chiêu', 'cooldown', 'đợi lượt', 'đang hồi', 'npc', 'battle', 'fight', 'đánh'].some(keyword => normalizedText.includes(keyword));
        };
        for (const msg of recent30) {
          // Tin nhắn ephemeral (Xỏ Lá Ba Que) cũng chứa "đang hồi" nhưng không phải
          // message cooldown của game -> bỏ qua để không kết luận nhầm là hết lượt.
          if (msg.getAttribute('data-bot-ephemeral') === 'true') continue;
          if (msg.getAttribute('data-bot-seen') === 'true') continue;
          if (username && !matchesUserMessage(msg.textContent)) continue;
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
            const match = text.match(/(?:(\d+)\s*[pm])?\s*(\d+)\s*s/);
            let sec = 120;
            if (match) {
              sec = 0;
              if (match[1]) sec += parseInt(match[1]) * 60;
              if (match[2]) sec += parseInt(match[2]);
            }
            return { type: 'cooldown', seconds: sec };
          }
        }
      }

      // ---- 5) CLICK SKILL (đúng thứ tự xoay vòng, bắt đầu từ idx hiện tại) ----
      {
        const availableBtns = [];
        for (const msg of recent40) {
          const rawText = msg.textContent || '';
          const norm = removeVN(rawText);
          if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
          const btns = msg.querySelectorAll('button, [role="button"]');
          for (const btn of btns) {
            if (btn.disabled) continue;
            const txt = (btn.textContent || '').trim();
            if (!txt || /[@|!]/.test(txt)) continue;
            const noD = removeVN(txt).replace(/[^a-z0-9]/g, '');
            if (tierNames.includes(noD)) continue;
            availableBtns.push({ btn, noD, txt });
          }
          if (availableBtns.length) break;
        }
        for (const n of namesNoD) {
          const hit = availableBtns.find(b => b.noD.includes(n));
          if (hit) {
            hit.btn.click();
            return { type: 'skill', text: hit.txt };
          }
        }
      }

      return { type: 'none' };
    })()`);

    if (tick && tick.type === 'skill') {
      this.luanhoiSkillIdx++; // chỉ tăng khi THỰC SỰ bấm được skill — giữ đúng thứ tự xoay vòng
    }
    return tick;
  }

  async luanhoiBattle(isResuming = false, runId = null) {
    const battleStartTime = Date.now();
    const maxBattleDurationMs = 180000;

    // Trong khi chờ trận xong, cứ vài vòng gọi click skill (nếu game cần click). Không force-advance
    // vội: chỉ thoát khi checkLuanhoiBattleEnd xác nhận trận đã kết thúc (buff tầng mới / win / loss).
    let noSkillSince = null;
    let noSkillLoggedAt = 0;

    while (this.isRunning && this.runId === runId) {
      if (Date.now() - battleStartTime > maxBattleDurationMs) {
        this.log('⚠️ Luân hồi: battle timeout, force-end.');
        return { ended: true, result: 'unknown' };
      }

      const tick = await this.luanhoiBattleTick();

      if (tick && tick.type === 'buff') {
        const selectedAt = Date.now();
        // msgTier là tầng SẮP VÀO (card buff ghi "Tầng N" = tầng N sắp đánh), nên
        // msgTier > 0 → chốt thẳng, KHÔNG cần đoán "+1" và không cần chờ game sửa
        // message (game giữ nguyên "Tầng N" suốt trận, chỉ đổi khi thắng xong).
        if (tick.tier > 0) {
          await this.exec(`window.luanhoiBuffTierClicked = ${tick.tier}; window.luanhoiBuffClickedAt = ${Date.now()}; true;`);
          this.log(`⚡ Đã chọn buff giữa trận/sang tầng: "${tick.text}" (vào tầng ${tick.tier}).`);
        } else {
          // Không đọc được tầng từ card → KHÔNG đoán. Giữ nguyên giá trị, nhánh
          // readLuanhoiTier() ngay sau đó sẽ chốt tầng thật từ message battle.
          await this.exec(`window.luanhoiBuffClickedAt = ${Date.now()}; true;`);
          this.logDebug(`buff không có "Tầng N" trong message — bỏ qua, không đoán (+1).`);
          this.log(`⚡ Đã chọn buff giữa trận/sang tầng: "${tick.text}" (tầng không đọc được).`);
        }
        return { ended: true, result: 'advance', selectedAt, tier: tick.tier };
      }

      if (tick && tick.type === 'buff-retry') {
        this.log(`⚡ Game chưa vào trận sau khi chọn buff tầng ${tick.tier || '?'} (lag tương tác) → Đã click lại: "${tick.text}". Chờ game phản hồi...`);
        noSkillSince = null; // reset bộ đếm timeout
        await this.delay(this.rand(1500, 2000));
        continue;
      }

      if (tick && tick.type === 'advance') {
        this.log('>>> BATTLE END: ✅ advance (buff tầng mới) <<<');
        return { ended: true, result: 'advance', rewardText: tick.rewardText };
      }

      if (tick && tick.type === 'end') {
        this.log(`>>> BATTLE END: ${tick.result === 'win' ? '✅ THẮNG' : (tick.result === 'loss' ? '❌ THUA' : '?')} <<<`);
        return { ended: true, result: tick.result, rewardText: tick.rewardText };
      }

      if (tick && tick.type === 'cooldown') {
        this.log(`>>> COOLDOWN: ${tick.seconds}s <<<`);
        return { ended: false, cooldown: tick.seconds };
      }

      if (tick && tick.type === 'skill') {
        this.log(`🌀 Click skill luân hồi: "${tick.text}"`);
        noSkillSince = null;
      } else if (noSkillSince === null) {
        noSkillSince = Date.now();
      } else {
        // Không tìm thấy gì để bấm — không log gì cả sẽ trông như bot treo.
        // Cứ 10s báo 1 lần kèm số lượt chờ, để thấy ngay bot đang kẹt ở đâu.
        const waited = Date.now() - noSkillSince;
        if (waited - noSkillLoggedAt >= 10000) {
          noSkillLoggedAt = waited;
          this.log(`⏳ Không thấy nút skill/buff nào để bấm — đang chờ game (${Math.round(waited / 1000)}s, tick=${tick ? tick.type : 'null'}).`);
        }
      }

      await this.delay(this.skillClickDelayMs);
    }

    return { ended: false };
  }

  // Tìm skill luân hồi theo TÊN (bỏ qua nút buff Phàm/Linh/Huyền/Thiên và skill mặc định), click luân phiên
  async clickNextLuanhoiSkill() {
    await this.markLuanhoiMessages();
    await this.dismissEphemeralMessages();
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
      const userFullName = removeVN(username);
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        const rawText = msg.textContent || '';
        const norm = removeVN(rawText);
        if (!userFullName || !norm.includes(userFullName)) continue;
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

    // Fallback: skill theo idx không match được (cooldown/tên lệch) → thử các skill còn lại
    // THEO ĐÚNG THỨ TỰ XOAY VÒNG (bắt đầu từ idx hiện tại), không phải "cứ thấy cái nào trước thì bấm cái đó"
    const startIdx = this.luanhoiSkillIdx % names.length;
    const rotatedNames = names.map((_, i) => names[(startIdx + i) % names.length]);
    const any = await this.exec(`(() => {
      const removeVN = s => (s || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd')
        .replace(/\u01A1/g, 'o').replace(/\u01A0/g, 'o')
        .replace(/\u01B0/g, 'u').replace(/\u01AF/g, 'u')
        .toLowerCase();
      const username = ${JSON.stringify(username)};
      const userFullName = removeVN(username);
      const rotatedNames = ${JSON.stringify(rotatedNames)};
      const namesNoD = rotatedNames.map(n => removeVN(n).replace(/[^a-z0-9]/g, ''));
      const tierWords = ${JSON.stringify(tierWords)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();

      // Gom hết nút khả dụng (chưa disable, không phải buff) trong các message hợp lệ trước
      const availableBtns = [];
      for (const msg of recent) {
        const rawText = msg.textContent || '';
        const norm = removeVN(rawText);
        if (!userFullName || !norm.includes(userFullName)) continue;
        const btns = msg.querySelectorAll('button, [role="button"]');
        for (const btn of btns) {
          if (btn.disabled) continue;
          const txt = (btn.textContent || '').trim();
          if (!txt || /[@|!]/.test(txt)) continue;
          const noD = removeVN(txt).replace(/[^a-z0-9]/g, '');
          if (tierWords.includes(noD)) continue;
          availableBtns.push({ btn, noD, txt });
        }
        if (availableBtns.length) break; // chỉ lấy nút của message hợp lệ gần nhất
      }

      // Theo đúng thứ tự xoay vòng: thử namesNoD[0] trước, rồi [1], [2]... chứ không lấy "cái đầu gặp trong DOM"
      for (const n of namesNoD) {
        const hit = availableBtns.find(b => b.noD.includes(n));
        if (hit) {
          hit.btn.click();
          return hit.txt;
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

  async clickNextDiangucSkill() {
    const names = this.luanhoiSkillNames;
    const startIndex = this.diangucSkillIdx % names.length;
    const rotatedNames = names.map((_, index) => names[(startIndex + index) % names.length]);
    await this.dismissEphemeralMessages();
    const clicked = await this.exec(`(() => {
      const removeVN = value => (value || '').normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\u0111/g, 'd').replace(/\\u0110/g, 'd')
        .toLowerCase();
      const names = ${JSON.stringify(rotatedNames)}.map(removeVN);
      const tierWords = ['pham', 'linh', 'huyen', 'thien'];
      const messages = Array.from(document.querySelectorAll('[role="article"][data-dianguc-owned="true"]')).reverse();
      for (const message of messages) {
        const buttons = Array.from(message.querySelectorAll('button, [role="button"]'))
          .filter(button => !button.disabled && button.offsetParent !== null);
        const skills = buttons.map(button => ({
          button,
          text: (button.textContent || '').trim(),
          clean: removeVN(button.textContent || '').replace(/[^a-z0-9]/g, ''),
        })).filter(item => item.text && !tierWords.includes(item.clean) && !/^[@!]/.test(item.text));
        for (const name of names) {
          const hit = skills.find(item => item.clean.includes(name.replace(/[^a-z0-9]/g, '')));
          if (hit) {
            hit.button.click();
            return hit.text;
          }
        }
      }
      return null;
    })()`);
    if (clicked) this.diangucSkillIdx = (this.diangucSkillIdx + 1) % names.length;
    return clicked;
  }

  // Đọc tầng hiện tại từ message (dùng match + /i như checkLuanhoiAdvance/battleEnd)
  // Kiểm tra xem màn "Đánh Cược Độ Khó — Sau Tầng X" (chọn hướng) của đúng tầng boss vừa thắng
  // đã xuất hiện chưa — nếu có, nghĩa là đã qua bước "Tiếp tục leo tháp" rồi, không cần bấm lại nữa.
  async checkAlreadyPastContinue(bossTier) {
    await this.markLuanhoiMessages();
    const username = this.username || '';
    const val = await this.exec(`(() => {
      const bossTier = ${JSON.stringify(bossTier)};
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-20).reverse();
      for (const msg of recent) {
        const text = msg.textContent || '';
        if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
        const m = text.match(/sau\\s*t[aầ]ng\\s*([0-9]{1,3})/i);
        if (m && m[1] && parseInt(m[1]) >= bossTier) return parseInt(m[1]);
      }
      return null;
    })()`);
    return val;
  }

  // Đọc tầng hiện tại. Ưu tiên message BATTLE (đang đánh / vừa kết thúc — có nút skill
  // hoặc nút "Tiếp Tục Leo Tháp") vì đây mới là nguồn tầng đáng tin.
  // BỎ QUA cụm "Sau Tầng N" — đó là thẻ đã qua bước tiếp tục leo tháp, đọc vào
  // sẽ báo tầng kế (51) trong khi người chơi vẫn đang ở tầng boss vừa hạ (50).
  async readLuanhoiTier() {
    await this.markLuanhoiMessages();
    const username = this.username || '';
    const skillKeys = this.luanhoiSkillNames.map(n => this.normalizeMatchText(n).replace(/[^a-z0-9]/g, ''));
    const val = await this.exec(`(() => {
       const username = ${JSON.stringify(username)};
       const skillKeys = ${JSON.stringify(skillKeys)};
       const tierNames = ['pham', 'linh', 'huyen', 'thien'];
       const contKeys = ['tieptucleothap', 'tieptuc'];
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-40).reverse();

       const strip = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
         .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/\u01A1/g, 'o').replace(/\u01A0/g, 'o')
         .replace(/\u01B0/g, 'u').replace(/\u01AF/g, 'u').toLowerCase();
       const alnum = s => strip(s).replace(/[^a-z0-9]/g, '');

       // "Tầng N" đầu tiên KHÔNG nằm sau chữ "Sau" trong message.
       const tierIn = text => {
         const RE = /(?:t[a\u1ea7]ng(?:\\s+lu[a\u00e2]n\\s+h[o\u1ed3]i)?|tier)\\s*[:.\u2013-]?\\s*([0-9]{1,3})/gi;
         let m;
         while ((m = RE.exec(text))) {
           const before = text.slice(Math.max(0, m.index - 6), m.index);
           if (/\\bsau\\s*$/i.test(before)) continue;
           return parseInt(m[1]);
         }
         return 0;
       };

       const isBattleMsg = msg => {
         for (const b of msg.querySelectorAll('button, [role="button"]')) {
           const raw = (b.textContent || '').trim();
           if (!raw || /[@|!]/.test(raw)) continue;
           const clean = alnum(raw.replace(/:[a-z_0-9]+:/g, ''));
           if (!clean) continue;
           if (tierNames.includes(clean)) continue;
           if (skillKeys.some(s => s && clean.includes(s))) return true;
           if (contKeys.some(k => clean.includes(k))) return true;
         }
         return false;
       };

       // Pass 1: message battle mới nhất có nhắc "Tầng N", hoặc màn "Sau Tầng N" (sau khi hạ boss).
       for (const msg of recent) {
         if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
         const text = msg.textContent || '';
         const sm = text.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
         if (sm && sm[1]) {
           return parseInt(sm[1]) + 1;
         }
         if (!isBattleMsg(msg)) continue;
         const t = tierIn(text);
         if (t > 0) return t;
       }
       // Pass 2: không nhận diện được message battle → quét tổng quát
       for (const msg of recent) {
         if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
         const text = msg.textContent || '';
         const sm = text.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
         if (sm && sm[1]) return parseInt(sm[1]) + 1;
         const t = tierIn(text);
         if (t > 0) return t;
       }
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

  // Đọc số loại "Mảnh set" từ 1 đoạn text thưởng sau boss.
  // Ví dụ game hiện: "🧩 Mảnh set: 1 loại" -> 1, "Mảnh set: 0 loại" -> 0.
  // Không thấy dòng đó -> null (không kết luận là có hay không có mảnh).
  parseLuanhoiManhSet(text) {
    if (!text) return null;
    const norm = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
    const m = norm.match(/manh\s*set\s*:\s*([0-9]+)/);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  // Quét message game mới nhất (đã gắn owned) để lấy "Mảnh set" mới nhất.
  // Dùng khi battleResult.rewardText không chứa dòng Mảnh set (panel thưởng
  // có thể nằm ở message riêng sau khi hạ boss).
  async readLuanhoiManhSet() {
    await this.markLuanhoiMessages();
    const val = await this.exec(`(() => {
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();
      for (const msg of recent) {
        if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
        const text = msg.textContent || '';
        const norm = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
        const m = norm.match(/manh\s*set\s*:\s*([0-9]+)/);
        if (m) return parseInt(m[1], 10);
      }
      return null;
    })()`);
    return (val === null || val === undefined) ? null : val;
  }

  // Click nút "Tiếp tục" hoặc "Dừng nhận thưởng"
  // quiet=true → chỉ log ra logDebug (dùng cho lần quét "nút sót" ở mọi tầng,
  // nơi không có nút là chuyện bình thường, không phải lỗi).
  async clickContinueOrStop(which, quiet = false) {
    await this.markLuanhoiMessages();
    const username = this.username || '';
    const contKeywords = ['tiếp tục leo tháp', 'tiep tuc leo thap', 'tiếp tục leo', 'tiep tuc leo', 'tiếp tục', 'tiep tuc', 'leo tháp', 'leo thap', 'tiếp', 'tiep'];
    const stopKeywords = ['ket thuc', 'kết thúc', 'dừng', 'dung', 'nhận thưởng'];

    const result = await this.exec(`(() => {
      const which = ${JSON.stringify(which)};
      const username = ${JSON.stringify(username)};
      const contKeywords = ${JSON.stringify(contKeywords)};
      const stopKeywords = ${JSON.stringify(stopKeywords)};
       const nd = s => s.replace(/:[a-z_0-9]+:/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-30).reverse();

       const scan = () => {
         for (const msg of recent) {
           if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
           const btns = msg.querySelectorAll('button, [role="button"]');
           if (btns.length === 0) continue;
           for (const btn of btns) {
             if (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || (btn.className && String(btn.className).includes('disabled'))) continue;
             const raw = (btn.textContent || '').trim();
             if (!raw) continue;
             if (/[@|!]/.test(raw)) continue;
             const txt = nd(raw);
             if (!txt) continue;
              if (which === 'stop') {
                if (txt.includes('ket thuc') && txt.includes('thuong')) {
                 btn.click();
                 return 'stop-clicked: ' + raw;
               }
             } else {
               if (contKeywords.some(k => txt.includes(k))) {
                 btn.click();
                 return 'continue-clicked: ' + raw;
               }
             }
           }
         }
         return null;
       };

      // Chỉ click message có gắn đúng tên mình; group chat có thể có nhiều battle cùng lúc.
      const strict = scan();
      if (strict) return strict;

        const btnDump = recent.slice(0, 5).map(m => {
          const btns = Array.from(m.querySelectorAll('button, [role="button"]')).map(b => (b.textContent||'').trim()).filter(Boolean);
          return '[' + (m.textContent||'').substring(0,50).replace(/\s+/g,' ') + '] btns=(' + btns.join(' | ') + ')';
        }).join(' >>> ');
        return 'NOTFOUND:' + btnDump;
     })()`);

    if (result && typeof result === 'string' && result.startsWith('NOTFOUND:')) {
      const write = quiet ? this.logDebug.bind(this) : this.log.bind(this);
      write(`⚠️ [Debug] Không tìm thấy nút "${which}". 5 message gần nhất + các nút của nó:`);
      write('   ' + result.slice('NOTFOUND:'.length));
      return null;
    }
    return result;
  }

  // Click nút cửa theo hướng (mặc định up)
  async clickDoor(direction) {
    await this.markLuanhoiMessages();
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
         if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
         const btns = msg.querySelectorAll('button, [role="button"]');
        if (btns.length === 0) continue;
        for (const btn of btns) {
          if (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || (btn.className && String(btn.className).includes('disabled'))) continue;
          const raw = (btn.textContent || '').trim();
          if (!raw) continue;
          if (/[@|!]/.test(raw)) continue;
          const txt = nd(raw);
          if (!txt) continue;
          if (keys.some(k => txt.includes(nd(k)))) {
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
    await this.markLuanhoiMessages();
    const username = this.username || '';
    const clicked = await this.exec(`(() => {
      const tierOf = { 'thien': 3, 'huyen': 2, 'linh': 1, 'pham': 0 };
      const tierNames = ['pham', 'linh', 'huyen', 'thien'];
      const username = ${JSON.stringify(username)};
      const msgs = document.querySelectorAll('[role="article"]');
      const recent = Array.from(msgs).slice(-40).reverse();

       for (const msg of recent) {
         const rawText = msg.textContent || '';
         if (msg.getAttribute('data-luanhoi-owned') !== 'true') continue;
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
        const sauM = rawText.match(/sau\\s*t[a\\u1ea7\\u00e2ầ]ng\\s*([0-9]{1,3})/i);
        if (sauM && sauM[1]) {
          msgTier = parseInt(sauM[1]) + 1;
        } else {
          const tm = rawText.match(/(?:t[a\\u1ea7]ng(?:\\s+lu[a\\u00e2]n\\s+h[o\\u1ed3]i)?|tier)\\s*[:.\u2013-]?\\s*([0-9]{1,3})/i);
          if (tm && tm[1]) msgTier = parseInt(tm[1]);
        }

        // Nếu đã click buff cho tầng này rồi → kiểm tra thời gian để click lại nếu game lag
        const clickedTier = window.luanhoiBuffTierClicked || 0;
        const lastClickedTime = window.luanhoiBuffClickedAt || 0;
        const now = Date.now();

        // 1. Bỏ qua tầng cũ hơn tầng đã click
        if (msgTier > 0 && msgTier < clickedTier) continue;

        // 2. Nếu cùng tầng đã click (hoặc không rõ tầng) nhưng chưa đủ 3.5s -> chờ game xử lý, không spam
        if ((msgTier === 0 || msgTier === clickedTier) && lastClickedTime > 0 && (now - lastClickedTime < 3500)) continue;

        bestBtn.click();
        const isRetry = (msgTier > 0 && msgTier === clickedTier) || (msgTier === 0 && lastClickedTime > 0);
        window.luanhoiBuffTierClicked = Math.max(clickedTier, msgTier);
        window.luanhoiBuffClickedAt = now;
        return { text: bestText, tier: msgTier, isRetry };
      }
      return null;
    })()`);

    if (clicked) {
      // msgTier là tầng SẮP VÀO → msgTier > 0 là giá trị CHÍNH XÁC, chốt thẳng.
      // msgTier = 0 (card không ghi "Tầng N") → KHÔNG đoán "+1", để readLuanhoiTier()
      // chốt tầng thật từ message battle ở bước kế.
      const actionName = clicked.isRetry ? 'Chọn lại buff' : 'Chọn buff';
      if (clicked.tier > 0) {
        await this.exec(`window.luanhoiBuffTierClicked = ${clicked.tier}; window.luanhoiBuffClickedAt = ${Date.now()}; true;`);
        this.log(`🎯 ${actionName}: "${clicked.text}" (ưu tiên, vào tầng ${clicked.tier}).`);
      } else {
        await this.exec(`window.luanhoiBuffClickedAt = ${Date.now()}; true;`);
        this.logDebug(`buff không có "Tầng N" trong message — bỏ qua, không đoán (+1).`);
        this.log(`🎯 ${actionName}: "${clicked.text}" (ưu tiên, card không ghi số tầng).`);
      }
      return clicked.text;
    }
    return false;
  }
  //#endregion
  // === BICANH MODE ===
  //#region Bí cảnh
  // Gửi !bicanh, click nút "Leo Tầng N", rồi spam skill theo danh sách cho đến khi stop
  async bicanhLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;

    this.log('\n=== ⚔️ BICANH MODE ===');
    this._bicanhMsgBaseline = await this.exec("(() => document.querySelectorAll('[role=\"article\"]').length)()");
    this.log('Gửi lệnh !bicanh...');
    await this.sendChat(this.bicanhCmd);
    await this.delay(this.rand(2000, 3000));

    // Click nút "Leo Tầng N" — game có thể trả lời chậm nên poll chờ tối đa 20s
    const floorClicked = await this.waitForBicanhButton(runId);
    if (floorClicked === 'battle') {
      this.log('✅ Đã vào trận tầng 1 (không có nút Leo Tầng) — bắt đầu spam skill...');
    } else if (!floorClicked) {
      this.log('⚠️ Không thấy nút Leo Tầng/Tiếp tục sau khi chờ. Thử lại...');
      await this.cooldownWait(8, runId);
      if (this.isRunning && this.runId === runId) this.bicanhLoop(runId);
      return;
    } else {
      this.log(`✅ Đã click "${floorClicked}" — bắt đầu spam skill...`);
    }

    // Spam skill theo danh sách, lặp lại cho đến khi user bấm stop
    this._bicanhSkillIdx = 0;
    while (this.isRunning && this.runId === runId) {
      let skillName;
      if (this.bicanhSkillOrder.length > 0) {
        const stt = this.bicanhSkillOrder[this._bicanhSkillIdx % this.bicanhSkillOrder.length];
        skillName = this.luanhoiSkillNames[stt - 1];
      } else {
        skillName = this.luanhoiSkillNames[this._bicanhSkillIdx % this.luanhoiSkillNames.length];
      }
      if (!skillName) { this._bicanhSkillIdx++; continue; }
      const clicked = await this.clickNextBicanhSkill(skillName);
      if (clicked) {
        this.log(`🌀 Click skill bicanh: "${clicked}"`);
        // Chỉ tăng index khi click đúng skill đích để giữ đúng quỹ đạo cooldown.
        this._bicanhSkillIdx++;
        const cd = await this.checkBicanhCooldown();
        if (cd > 0) {
          this.log(`⏳ Cooldown — chờ ${cd}ms`);
          await this.delay(cd);
        } else {
          await this.delay(this.skillClickDelayMs);
        }
      } else {
        // Không tìm thấy skill đích (đang hồi/chưa render) → KHÔNG nhảy cóc, chờ rồi thử lại
        // cùng skill để không phá vỡ nhịp cooldown đã tính (vd 3:3:3).
        this.log(`⚠️ Không tìm thấy skill "${skillName}" — đợi ${this.skillRetryWaitMs}ms rồi thử lại (giữ nguyên combo)...`);
        await this.delay(this.skillRetryWaitMs);
      }
    }

    this.log('⏹ BICANH MODE đã dừng.');
  }

  // Poll tìm nút "Leo Tầng N" / "Tiếp tục" — game trả lời chậm nên phải chờ và thử lại nhiều lần
  async waitForBicanhButton(runId) {
    const deadline = Date.now() + 20000; // tối đa 20s
    let attempt = 1;
    while (this.isRunning && this.runId === runId && Date.now() < deadline) {
      const clicked = await this.clickBicanhFloor();
      if (clicked) {
        if (attempt > 1) this.log(`👉 Tìm thấy nút sau ${attempt} lần thử.`);
        return clicked;
      }
      // Tầng 1 đầu tuần: game không hiện nút "Leo Tầng" mà vào thẳng battle.
      const battleReady = await this.isBicanhBattleReady();
      if (battleReady) {
        if (attempt > 1) this.log(`👉 Phát hiện battle tầng 1 sau ${attempt} lần thử.`);
        return 'battle';
      }
      // Chờ game vẽ lại UI giữa các lần thử.
      await this.delay(this.rand(1500, 2500));
      attempt++;
    }
    return null;
  }

  // Tìm và click nút "Leo Tầng N" trong message gần nhất
  async clickBicanhFloor() {
    return await this.exec(`(() => {
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-20).reverse();
       for (const msg of recent) {
         const btns = msg.querySelectorAll('button, [role="button"]');
         if (btns.length === 0) continue;
         for (const btn of btns) {
           if (btn.disabled) continue;
           const raw = (btn.textContent || '').trim();
           if (!raw || raw.length < 3) continue;
           if (/[@|!]/.test(raw)) continue;
           const txt = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g,'d').replace(/\u0110/g,'d');
           if (txt.includes('leotang') || txt.includes('leo') || txt.includes('tieptuc') || txt.includes('tiep tuc')) {
             btn.disabled = false;
             btn.click();
             return raw;
           }
         }
       }
        return null;
      })()`);
   }

   // Kiểm tra đã vào thẳng battle (tầng 1 đầu tuần) chưa có nút Leo Tầng
   async isBicanhBattleReady() {
     const skillNames = (this.luanhoiSkillNames || []).filter(Boolean);
     const normalized = skillNames.map(name => String(name || '').normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '').replace(/\u0111/gi, 'd').replace(/\u01A1/gi, 'o').replace(/\u01B0/gi, 'u')
       .toLowerCase().replace(/\s+/g, ' ').trim());
     return await this.exec(`(() => {
         const skillNames = ${JSON.stringify(normalized)};
         const baseline = ${JSON.stringify(this._bicanhMsgBaseline || 0)};
         const norm = value => String(value || '').normalize('NFD')
           .replace(/[\\u0300-\\u036f]/g, '').replace(/\\u0111/gi, 'd').replace(/\\u01A1/gi, 'o').replace(/\\u01B0/gi, 'u')
           .toLowerCase().replace(/\\s+/g, ' ').trim();
         const msgs = document.querySelectorAll('[role="article"]');
         const recent = Array.from(msgs).slice(baseline).reverse();
        for (const msg of recent) {
          if (msg.getAttribute && msg.getAttribute('data-bot-ephemeral') === 'true') continue;
          const btns = msg.querySelectorAll('button, [role="button"]');
          if (btns.length === 0) continue;
          for (const btn of btns) {
            if (btn.disabled) continue;
            const clean = norm(btn.textContent);
            if (!clean) continue;
            if (skillNames.some(name => name && (clean === name || clean.includes(name)))) return true;
          }
        }
        return false;
      })()`);
   }

   // Click skill bicanh theo tên
  async clickNextBicanhSkill(skillName) {
    await this.dismissEphemeralMessages();
    const username = this.username || '';
    const nameNoD = skillName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd').replace(/\u0110/g, 'd')
      .replace(/\u01A1/g, 'o').replace(/\u01A0/g, 'o')
      .replace(/\u01B0/g, 'u').replace(/\u01AF/g, 'u')
      .toLowerCase();

    return await this.exec(`(() => {
       const isOwnedGameMessage = (text, userName, keywords = []) => {
         const rawText = String(text || '');
         const normalizedText = rawText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
         const normalizedUser = String(userName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
         if (!normalizedUser || !normalizedText) return true;
         const userTokens = normalizedUser.split(/\s+/).filter(Boolean);
         const usernameIndex = userTokens
           .map(token => normalizedText.indexOf(token))
           .filter(index => index >= 0)
           .sort((a, b) => a - b)[0];
         if (usernameIndex === undefined) return false;
         const beforeUsername = normalizedText.slice(0, usernameIndex).trim();
         if (/(?:^|[\s(])(?:[a-z0-9]+)\s*:\s*$/.test(beforeUsername)) return false;
         const gameKeywords = ['bicanh', 'bi cảnh', 'bí cảnh', 'thap', 'tầng', 'leo tầng', 'fight', 'battle', 'đánh', 'thắng', 'thua', 'cooldown', ...keywords].map(keyword => String(keyword || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').trim().toLowerCase());
         return gameKeywords.some(keyword => keyword && normalizedText.includes(keyword));
       };
       const username = ${JSON.stringify(username)};
       const nameNoD = ${JSON.stringify(nameNoD)};
       const msgs = document.querySelectorAll('[role="article"]');
       const recent = Array.from(msgs).slice(-40).reverse();
       for (const msg of recent) {
         const rawText = msg.textContent || '';
         const norm = rawText.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d').replace(/\u0110/g,'d').toLowerCase();
         if (username && !isOwnedGameMessage(rawText, username, ['bicanh', 'bi cảnh', 'bí cảnh', 'thap', 'tầng', 'leo tầng', 'fight', 'battle', 'đánh'])) continue;
         const btns = msg.querySelectorAll('button, [role="button"]');
         if (btns.length === 0) continue;
         for (const btn of btns) {
           if (btn.disabled) continue;
           const raw = (btn.textContent || '').trim();
           if (!raw || /[@|!]/.test(raw)) continue;
           const clean = raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d').replace(/\u0110/g,'d').toLowerCase();
           if (clean === nameNoD || clean.includes(nameNoD)) {
             btn.disabled = false;
             btn.click();
             return raw;
           }
         }
       }
       return null;
     })()`);
  }
}

module.exports = { NpcBot };
