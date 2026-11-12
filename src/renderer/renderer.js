let isNpcRunning = false;
let isWebviewRegistered = false;
let isMuted = false;

window.addEventListener('DOMContentLoaded', () => {
  initWebview();
  loadLogs();
  loadLuanHoiSettings();
  loadSharedUserId();
  loadSharedDelay();
  startStatsPolling();
  const vanduRealmEl = document.getElementById('vandu-realm');
  if (vanduRealmEl) {
    const savedRealm = localStorage.getItem('vanduRealm') || '';
    if (savedRealm) vanduRealmEl.value = savedRealm;
  }
  // (Ô User ID riêng của tab Vân Du đã bỏ — dùng userid-shared trong modal ⚙️.)
  // V24: Số lần đi Vân Du, như ô cùng tên ở tab Luân Hồi.
  const vanduTotalTripsEl = document.getElementById('vandu-total-trips');
  if (vanduTotalTripsEl) {
    const savedTotalTrips = localStorage.getItem('vandu-total-trips');
    if (savedTotalTrips !== null) vanduTotalTripsEl.value = savedTotalTrips;
  }

  window.api.onLogMessage((msg) => {
    appendLog(msg);
    if ((msg.includes('Bot stopped') || msg.includes('Dừng bot')) && isNpcRunning) {
      isNpcRunning = false;
      updateBotButton();
    }
  });
});

function initWebview() {
  const webview = document.createElement('webview');
  webview.id = 'webview-main';
  webview.setAttribute('partition', 'persist:discord-main-account');
  webview.src = 'https://discord.com/app';

  webview.addEventListener('did-finish-load', () => onWebviewLoad(webview));
  document.getElementById('content').appendChild(webview);
}

function onWebviewLoad(webview) {
  const wcId = webview.getWebContentsId();
  window.api.registerWebview(0, wcId);
  isWebviewRegistered = true;
}

function toggleMute() {
  const webview = document.getElementById('webview-main');
  if (!webview || typeof webview.setAudioMuted !== 'function') {
    appendLog('[🔇] Webview chưa sẵn sàng!');
    return;
  }
  isMuted = !isMuted;
  webview.setAudioMuted(isMuted);
  const btn = document.getElementById('btn-mute');
  btn.textContent = isMuted ? '🔇' : '🔊';
  btn.classList.toggle('muted', isMuted);
  appendLog(isMuted ? '[🔇] Đã tắt tiếng toàn bộ âm thanh' : '[🔊] Đã bật tiếng');
}

const ALL_SKILLS = [
  // Tấn Công
  { stt: 1, name: 'Kiếm Cơ Bản', cat: 'Tấn Công' },
  { stt: 2, name: 'Liên Hoàn Kích', cat: 'Tấn Công' },
  { stt: 3, name: 'Trọng Kích', cat: 'Tấn Công' },
  { stt: 4, name: 'Phá Giáp', cat: 'Tấn Công' },
  { stt: 5, name: 'Xuyên Tâm', cat: 'Tấn Công' },
  // Đặc Biệt
  { stt: 6, name: 'Liệt Hỏa Trảm', cat: 'Đặc Biệt' },
  { stt: 7, name: 'Hấp Huyết', cat: 'Đặc Biệt' },
  { stt: 8, name: 'Kịch Độc', cat: 'Đặc Biệt' },
  { stt: 9, name: 'Lôi Kích', cat: 'Đặc Biệt' },
  { stt: 10, name: 'Tuyệt Sát', cat: 'Đặc Biệt' },
  { stt: 11, name: 'Thần Uy', cat: 'Đặc Biệt' },
  { stt: 12, name: 'Băng Phong', cat: 'Đặc Biệt' },
  // Chống Xỏ Lá
  { stt: 13, name: 'Phòng Ngự', cat: 'Chống Xỏ Lá' },
  { stt: 14, name: 'Phản Kích', cat: 'Chống Xỏ Lá' },
  { stt: 15, name: 'Hồi Phục', cat: 'Chống Xỏ Lá' },
  { stt: 16, name: 'Hộ Thuẫn', cat: 'Chống Xỏ Lá' },
  { stt: 17, name: 'Hỏa Giáp', cat: 'Chống Xỏ Lá' },
  { stt: 18, name: 'Chống Xỏ Lá', cat: 'Chống Xỏ Lá' },
  // Luyện Khí
  { stt: 19, name: 'Thái Cực Dưỡng Sinh', cat: 'Luyện Khí' },
  { stt: 20, name: 'Kiếm Khí Xung Thiên', cat: 'Luyện Khì' },
  { stt: 21, name: 'Kim Cương Phục Ma', cat: 'Luyện Khí' },
  // Trúc Cơ
  { stt: 22, name: 'Hỗn Nguyên Hộ Thể', cat: 'Trúc Cơ' },
  { stt: 23, name: 'Vạn Kiếm Quy Tông', cat: 'Trúc Cơ' },
  { stt: 24, name: 'Phong Ấn Thất Mạch', cat: 'Trúc Cơ' },
  // Kết Đan
  { stt: 25, name: 'Cửu Chuyển Hồi Xuân', cat: 'Kết Đan' },
  { stt: 26, name: 'Kim Đan Phá Sát', cat: 'Kết Đan' },
  { stt: 27, name: 'Tam Muội Chân Hỏa', cat: 'Kết Đan' },
  // Nguyên Anh
  { stt: 28, name: 'Bất Diệt Kim Thân', cat: 'Nguyên Anh' },
  { stt: 29, name: 'Hư Không Đại Na Di', cat: 'Nguyên Anh' },
  { stt: 30, name: 'Nguyên Anh Xuất Khiếu', cat: 'Nguyên Anh' },
  // Hóa Thần
  { stt: 31, name: 'Pháp Tướng Thiên Địa', cat: 'Hóa Thần' },
  { stt: 32, name: 'Lôi Đình Vạn Quân', cat: 'Hóa Thần' },
  { stt: 33, name: 'Niết Bàn Trùng Sinh', cat: 'Hóa Thần' },
];

// === MODE ===

let currentMode = 'npc';

function setMode(mode) {
  currentMode = mode;
  document.getElementById('tab-npc').classList.toggle('active', mode === 'npc');
  document.getElementById('tab-luanhoi').classList.toggle('active', mode === 'luanhoi');
  document.getElementById('tab-bicanh').classList.toggle('active', mode === 'bicanh');
  const tabVandu = document.getElementById('tab-vandu');
  if (tabVandu) tabVandu.classList.toggle('active', mode === 'vandu');
  document.getElementById('tab-dianguc').classList.toggle('active', mode === 'dianguc');
  const tabUpgrade = document.getElementById('tab-upgrade');
  if (tabUpgrade) tabUpgrade.classList.toggle('active', mode === 'spam');
  document.getElementById('config-npc').classList.toggle('active', mode === 'npc');
  document.getElementById('config-luanhoi').classList.toggle('active', mode === 'luanhoi');
  document.getElementById('config-bicanh').classList.toggle('active', mode === 'bicanh');
  const configVandu = document.getElementById('config-vandu');
  if (configVandu) configVandu.classList.toggle('active', mode === 'vandu');
  document.getElementById('config-dianguc').classList.toggle('active', mode === 'dianguc');
  const configUpgrade = document.getElementById('config-upgrade');
  if (configUpgrade) configUpgrade.classList.toggle('active', mode === 'spam');
  updateBotButton();
}

// === NPC MODE ===

function normalizeSkillOrder(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  const normalized = items
    .map(item => Number(String(item).trim()))
    .filter(item => Number.isInteger(item) && item >= 1 && item <= ALL_SKILLS.length);
  return normalized;
}

const SKILL_CLICK_DELAY_KEY = 'skillClickDelayMs';
const SKILL_CLICK_DELAY_DEFAULT = 1000;

function clampSkillClickDelayMs(value) {
  if (value === null || value === undefined || String(value).trim() === '') return SKILL_CLICK_DELAY_DEFAULT;
  const ms = Number(value);
  if (!Number.isFinite(ms)) return SKILL_CLICK_DELAY_DEFAULT;
  return Math.min(10000, Math.max(100, Math.round(ms)));
}

function getSkillClickDelayMs() {
  return clampSkillClickDelayMs(localStorage.getItem(SKILL_CLICK_DELAY_KEY));
}

function getNpcConfig() {
  const configuredOrder = localStorage.getItem('bicanhSkillOrder') || '';
  const comboArray = normalizeSkillOrder(configuredOrder);
  return {
    mode: 'npc',
    userId: getSharedUserId(),
    username: '', // NPC giờ check theo User ID, không dùng username nữa
    npcNumber: parseInt(document.getElementById('npc-number').value) || 1,
    totalBattles: parseInt(document.getElementById('total-battles').value) || 5,
    cooldownMs: 80 * 1000, // Cooldown NPC cố định 80s — bỏ khỏi giao diện (v76)
    autoClimb: document.getElementById('auto-climb').checked,
    targetMaxNpc: parseInt(document.getElementById('target-max-npc').value) || 60,
    tuLuyen: document.getElementById('tu-luyen').checked,
    tuLuyenStartCmd: '!tuluyen',
    tuLuyenEndCmd: '!ketthuc',
    bicanhSkillOrder: comboArray.length > 0 ? comboArray : [],
    skillClickDelayMs: getSkillClickDelayMs(),
  };
}

function loadLuanHoiSettings() {
  const savedTotalRuns = localStorage.getItem("luanhoi-total-runs");
  if (savedTotalRuns !== null) {
    const el = document.getElementById("luanhoi-total-runs");
    if (el) el.value = savedTotalRuns;
  }
  // Target giờ là 1 input duy nhất (input + datalist): giá trị đã lưu,
  // dù là preset hay tự nhập, đều load thẳng vào ô đó.
  const savedTarget = localStorage.getItem("luanhoi-target");
  if (savedTarget !== null) {
    const el = document.getElementById("luanhoi-target");
    if (el) el.value = savedTarget;
  }
  const savedCmd = localStorage.getItem("luanhoi-cmd");
  if (savedCmd !== null) {
    const el = document.getElementById("luanhoi-cmd");
    if (el) el.value = savedCmd;
  }
  // Checkbox "Đi tiếp khi chưa thấy Mảnh": mặc định bật (hành vi cũ); chỉ
  // tắt khi đã lưu "0".
  const continueEl = document.getElementById("luanhoi-continue-noshard");
  if (continueEl) continueEl.checked = localStorage.getItem("luanhoi-continue-noshard") !== "0";

  ["luanhoi-total-runs", "luanhoi-target", "luanhoi-cmd", "luanhoi-continue-noshard"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", saveLuanHoiSettings);
      el.addEventListener("change", saveLuanHoiSettings);
    }
  });
}

// User ID dùng chung cho cả 6 mode (anh chốt 2026-11-06): 1 ô duy nhất trong
// modal Cấu hình (⚙️), thay cho 6 ô riêng mỗi tab (thêm từng ô lâu mà nhập
// lại 6 lần). Lưu localStorage key "userid-shared". Lần đầu mở app mà chưa
// có thì lấy từ ô cũ đã lưu (ưu tiên userid-lh vì đó là tab anh hay dùng)
// để khỏi nhập lại.
function getSharedUserId() {
  const el = document.getElementById("userid-shared");
  return el ? el.value.replace(/[^0-9]/g, "") : "";
}

function loadSharedUserId() {
  const el = document.getElementById("userid-shared");
  if (!el) return;
  let saved = localStorage.getItem("userid-shared");
  if (saved === null) {
    saved = localStorage.getItem("userid-lh") || localStorage.getItem("userid-vandu") || localStorage.getItem("userid") || localStorage.getItem("userid-bicanh") || localStorage.getItem("userid-dianguc") || localStorage.getItem("userid-upgrade") || "";
  }
  el.value = saved;
  el.addEventListener("input", () => localStorage.setItem("userid-shared", el.value));
  el.addEventListener("change", () => localStorage.setItem("userid-shared", el.value));
}

// Delay (sec) dùng chung cho tất cả mode (anh chốt 2026-11-12): 1 ô duy
// nhất trong modal Cấu hình (⚙️), thay cho 3 ô riêng (Luân Hồi 3s, Vân Du
// 2s, Spam 2s). Lưu localStorage key "delay-shared". Mặc định 2s (giá trị
// mặc định của bot + 2/3 mode); Luân Hồi trước là 3s nên giờ sẽ nhanh hơn
// 1s nếu không chỉnh lại trong modal.
function getSharedDelayMs() {
  const el = document.getElementById("delay-shared");
  const sec = el ? parseFloat(el.value) : NaN;
  return (Number.isFinite(sec) && sec > 0 ? sec : 2) * 1000;
}

function loadSharedDelay() {
  const el = document.getElementById("delay-shared");
  if (!el) return;
  const saved = localStorage.getItem("delay-shared");
  if (saved !== null) el.value = saved;
  el.addEventListener("input", () => localStorage.setItem("delay-shared", el.value));
  el.addEventListener("change", () => localStorage.setItem("delay-shared", el.value));
}

function saveLuanHoiSettings() {
  const totalRunsEl = document.getElementById("luanhoi-total-runs");
  if (totalRunsEl) localStorage.setItem("luanhoi-total-runs", totalRunsEl.value);

  const targetEl = document.getElementById("luanhoi-target");
  if (targetEl) localStorage.setItem("luanhoi-target", targetEl.value);

  const cmdEl = document.getElementById("luanhoi-cmd");
  if (cmdEl) localStorage.setItem("luanhoi-cmd", cmdEl.value);

  const continueEl = document.getElementById("luanhoi-continue-noshard");
  if (continueEl) localStorage.setItem("luanhoi-continue-noshard", continueEl.checked ? "1" : "0");
}

function getLuanHoiConfig() {
  saveLuanHoiSettings();
  const configuredOrder = localStorage.getItem("bicanhSkillOrder") || "";
  const skills = resolveSkillNames(configuredOrder);
  const totalRunsEl = document.getElementById("luanhoi-total-runs");
  const totalRunsVal = totalRunsEl ? parseInt(totalRunsEl.value) : 0;
  return {
    mode: "luanhoi",
    luanhoi: true,
    userId: getSharedUserId(),
    username: "", // Luân Hồi giờ check theo User ID, không dùng username nữa
    luanhoiTarget: parseInt(document.getElementById("luanhoi-target").value) || 10,
    luanhoiTotalRuns: (!isNaN(totalRunsVal) && totalRunsVal > 0) ? totalRunsVal : 0,
    luanhoiContinueNoShard: document.getElementById("luanhoi-continue-noshard") ? document.getElementById("luanhoi-continue-noshard").checked : true,
    luanhoiCmd: (document.getElementById("luanhoi-cmd").value || "!luanhoi").trim(),
    buttonDelayMs: getSharedDelayMs(),
    luanhoiSkillNames: skills.length > 0
      ? skills
      : ["Vạn Kiếm Quy Tông", "Hỗn Nguyên Hộ Thể", "Kiếm Khí Xung Thiên", "Thái Cực Dưỡng Sinh"],
    skillClickDelayMs: getSkillClickDelayMs(),
  };
}

function getVanduConfig() {
  const vanduRealmEl = document.getElementById('vandu-realm');
  const vanduRealm = vanduRealmEl ? (vanduRealmEl.value || '').trim() : '';
  if (vanduRealmEl) {
    if (vanduRealm) localStorage.setItem('vanduRealm', vanduRealm);
    else localStorage.removeItem('vanduRealm');
  }
  const VANDU_REALM_MAPS = {
    'Luyện Khí': 'Thanh Vân Trấn',
    'Trúc Cơ': 'Vạn Sơn Liên Mạch',
    'Kết Đan': 'Đông Hải Tiên Đảo',
    'Nguyên Anh': 'Tây Vực Sa Mạc',
    'Hóa Thần': 'Thiên Sơn Tuyết Lãnh',
  };
  // User ID dùng chung (userid-shared trong modal ⚙️) như 5 mode kia —
  // ô riêng của tab Vân Du đã bỏ, dùng chung 1 ô trong modal (port 2026-11-09).
  // V24: Số lần đi, cùng cách tính như Luân Hồi (nhập > 0 mới có giới
  // hạn, để trống/0 thì bot giữ dừng sau 1 chuyến như cũ).
  const vanduTotalTripsEl = document.getElementById('vandu-total-trips');
  const vanduTotalTripsVal = vanduTotalTripsEl ? parseInt(vanduTotalTripsEl.value) : 0;
  if (vanduTotalTripsEl) localStorage.setItem('vandu-total-trips', vanduTotalTripsEl.value);
  // V15: Vân Du lấy thứ tự skill từ cùng ô cấu hình chung (bicanhSkillOrder,
  // vd 29,26,23) như Luân Hồi, không chọn cứng trong code nữa. Rỗng thì bot
  // giữ thứ tự mặc định cũ.
  const vanduConfiguredOrder = localStorage.getItem("bicanhSkillOrder") || "";
  const vanduSkills = resolveSkillNames(vanduConfiguredOrder);
  return {
    mode: 'vandu',
    vandu: true,
    // V3: Vân Du dùng User ID như các chức năng kia, không dùng tên nữa.
    // username để rỗng để bot không rơi về lọc theo tên.
    username: '',
    userId: getSharedUserId(),
    vanduCmd: (document.getElementById('vandu-cmd').value || '!vandu').trim(),
    buttonDelayMs: getSharedDelayMs(),
    vanduRealm: vanduRealm,
    vanduMap: vanduRealm ? (VANDU_REALM_MAPS[vanduRealm] || '') : '',
    vanduTotalTrips: (!isNaN(vanduTotalTripsVal) && vanduTotalTripsVal > 0) ? vanduTotalTripsVal : 0,
    vanduSkillNames: vanduSkills,
    skillClickDelayMs: getSkillClickDelayMs(),
  };
}

function getBicanhConfig() {
  return {
    mode: 'bicanh',
    userId: getSharedUserId(),
    username: '', // Bicanh giờ check theo User ID, không dùng username nữa
    bicanhCmd: (document.getElementById('bicanh-cmd').value || '!bicanh').trim(),
    bicanhSkillOrder: normalizeSkillOrder(localStorage.getItem('bicanhSkillOrder') || ''),
    skillClickDelayMs: getSkillClickDelayMs(),
  };
}

  const SPAM_CMDS = {
  hp: '/upgrade hp',
  atk: '/upgrade atk',
  def: '/upgrade def',
  roll_x10: '/roll_x10',
  waifu_roll: '/waifu roll count: 10',
};

function getUpgradeConfig() {
  const typeEl = document.getElementById('upgrade-type');
  const type = typeEl ? typeEl.value : 'hp';
  const countEl = document.getElementById('spam-count');
  const countVal = countEl ? (parseInt(countEl.value) || 10) : 10;
  const cmd = SPAM_CMDS[type] || SPAM_CMDS.hp;
  return {
    mode: 'upgrade',
    userId: getSharedUserId(),
    username: '', // Upgrade/Spam giờ dùng User ID, không dùng username nữa
    upgradeType: Object.prototype.hasOwnProperty.call(SPAM_CMDS, type) ? type : 'hp',
    upgradeCmd: cmd,
    upgradeDelayMs: Math.min(60000, Math.max(100, Math.round(getSharedDelayMs()))),
    spamCount: Math.min(9999, Math.max(1, countVal)),
    spamType: type,
  };
}

function resolveSkillNames(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return raw.map(item => {
    const token = String(item).trim();
    const stt = Number(token);
    return Number.isInteger(stt) && stt >= 1 && stt <= ALL_SKILLS.length
      ? ALL_SKILLS[stt - 1].name
      : token;
  }).filter(Boolean);
}

function getDiangucConfig() {
  const configuredOrder = localStorage.getItem('bicanhSkillOrder') || '';
  const skillNames = resolveSkillNames(configuredOrder);
  const resolvedSkills = skillNames.length > 0
    ? skillNames
    : ['Vạn Kiếm Quy Tông', 'Hỗn Nguyên Hộ Thể', 'Kiếm Khí Xung Thiên', 'Thái Cực Dưỡng Sinh'];
  return {
    mode: 'dianguc',
    dianguc: true,
    userId: getSharedUserId(),
    username: '', // Địa Ngục giờ check theo User ID, không dùng username nữa
    diangucCmd: (document.getElementById('dianguc-cmd').value || '!dianguc').trim(),
    luanhoiSkillNames: resolvedSkills,
    diangucDelayMs: 2000,
    diangucChoiceDelayMs: 2000,
    diangucBuffWaitMs: Math.min(120, Math.max(0, Number(document.getElementById('dianguc-wait-buff').value) || 0)) * 1000,
    skillClickDelayMs: getSkillClickDelayMs(),
  };
}

function getActiveConfig() {
  if (currentMode === 'vandu') return getVanduConfig();
  if (currentMode === 'dianguc') return getDiangucConfig();
  if (currentMode === 'bicanh') return getBicanhConfig();
  if (currentMode === 'upgrade' || currentMode === 'spam') return getUpgradeConfig();
  return currentMode === 'luanhoi' ? getLuanHoiConfig() : getNpcConfig();
}

// V53: không cho START mode nào khi chưa nhập User ID (anh chốt 2026-11-09):
// chạy không ID thì bot không lọc được màn của mình, dễ mất lượt oan (Vân Du
// mất 1/6 vé ngày, Luân Hồi mất 1 lượt chạy). Chặn ở nút START (cả 6 mode đi
// chung qua toggleBot) để user thấy ngay trong log, kèm hướng dẫn mở ⚙️.
function requireUserIdForStart() {
  if (getSharedUserId()) return true;
  appendLog('⛔ Chưa nhập User ID nên không START được — bấm ⚙️ mở Cấu hình, nhập User ID Discord rồi START lại.');
  return false;
}

async function toggleBot() {
  if (isNpcRunning) {
    window.api.botStop(0);
    isNpcRunning = false;
    appendLog('[BOT] ⏹ Stopped');
  } else {
    if (!isWebviewRegistered) return;
    if (!requireUserIdForStart()) return;
    const config = getActiveConfig();
    await window.api.botUpdateConfig(0, config);
    window.api.botStart(0);
    isNpcRunning = true;
    const label = config.mode === 'luanhoi' ? 'Luân Hồi' : (config.mode === 'vandu' ? 'Vân Du' : (config.mode === 'bicanh' ? 'Bicanh' : (config.mode === 'dianguc' ? 'Địa Ngục' : (config.mode === 'upgrade' || config.mode === 'spam' ? 'Spam' : 'NPC'))));
    appendLog(`[${label}] ▶ Started`);
  }
  updateBotButton();
}

function updateBotButton() {
  const btns = [document.getElementById('btn-npc-toggle'), document.getElementById('btn-luanhoi-toggle'), document.getElementById('btn-bicanh-toggle'), document.getElementById('btn-dianguc-toggle'), document.getElementById('btn-upgrade-toggle'), document.getElementById('btn-vandu-toggle')];
  for (const btn of btns) {
    if (!btn) continue;
    if (isNpcRunning) {
      btn.textContent = '⏹ STOP';
      btn.className = 'btn-stop';
    } else {
      btn.textContent = '▶ START';
      btn.className = 'btn-start';
    }
  }
}

let skillModalOpen = false;

function toggleSkillModal() {
  skillModalOpen = !skillModalOpen;
  const modal = document.getElementById('skill-modal');
  if (skillModalOpen) {
    modal.style.display = 'flex';
    buildSkillGrid();
    loadSkillOrder();
  } else {
    modal.style.display = 'none';
  }
}

// V53: list skill chia 4 cột cho gọn (anh chốt 2026-11-09) — trước đây 2 cột
// (trái 1–17, phải 18–33) nên modal dài, kéo mỏi. Chia đều theo STT: mỗi cột
// 9 skill (cột cuối 6), đọc xuống từng cột như cũ.
function buildSkillGrid() {
  const cols = [0, 1, 2, 3].map(i => document.getElementById('skill-grid-' + i));
  if (cols.some(c => !c)) return;
  cols.forEach(c => { c.innerHTML = ''; });
  const per = Math.ceil(ALL_SKILLS.length / 4);
  for (let i = 0; i < ALL_SKILLS.length; i++) {
    const sk = ALL_SKILLS[i];
    const div = document.createElement('div');
    div.className = 'skill-item';
    div.innerHTML = `<span class="stt">${sk.stt}</span><span class="skill-name">${sk.name}</span><span class="skill-cat">${sk.cat}</span>`;
    cols[Math.floor(i / per)].appendChild(div);
  }
}

const SKILL_COMBO_PRESETS = [
  { id: 'tutiendmg', label: 'Tu Tiên DMG', order: [26, 23, 20] },
  { id: 'normaldmg', label: 'Normal DMG', order: [12, 4, 1] },
  { id: 'normalall', label: 'Normal ALL', order: [17, 12, 4, 1] },
  { id: 'mixed', label: 'Hỗ Hợp', order: [22, 26, 23, 20, 12, 4, 1] },
  { id: 'custom', label: '✏️ Tự nhập', order: [] },
];

function skillNameByStt(stt) {
  const skill = ALL_SKILLS[stt - 1];
  return skill ? skill.name : `#${stt}`;
}

function skillOrderToNames(order) {
  return order.map(skillNameByStt);
}

function buildSkillPresetOptions() {
  const select = document.getElementById('skill-combo-preset');
  if (!select) return;
  select.innerHTML = '';
  for (const preset of SKILL_COMBO_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.order.length
      ? `${preset.label} — ${skillOrderToNames(preset.order).join(' / ')}`
      : preset.label;
    select.appendChild(option);
  }
}

function applySkillPreset(presetId) {
  const preset = SKILL_COMBO_PRESETS.find(item => item.id === presetId);
  const input = document.getElementById('skill-order-input');
  if (!preset || !input || !preset.order.length) return;
  input.value = preset.order.join(',');
}

function syncSkillPresetFromInput() {
  const select = document.getElementById('skill-combo-preset');
  const input = document.getElementById('skill-order-input');
  if (!select || !input) return;
  const current = normalizeSkillOrder(input.value).join(',');
  const matched = SKILL_COMBO_PRESETS.find(preset => preset.order.length && preset.order.join(',') === current);
  select.value = matched ? matched.id : 'custom';
}

function loadSkillOrder() {
  buildSkillPresetOptions();
  const saved = localStorage.getItem('bicanhSkillOrder');
  const input = document.getElementById('skill-order-input');
  if (input) input.value = saved || '';
  syncSkillPresetFromInput();
  const delayInput = document.getElementById('skill-click-delay');
  if (delayInput) delayInput.value = getSkillClickDelayMs();
}

function saveSkillOrder() {
  const input = document.getElementById('skill-order-input');
  const delayInput = document.getElementById('skill-click-delay');
  const status = document.getElementById('skill-order-status');
  if (!status) return;

  // User ID dùng chung cũng lưu ở đây (dù đã lưu live theo từng phím gõ).
  const sharedUserIdEl = document.getElementById('userid-shared');
  if (sharedUserIdEl) localStorage.setItem('userid-shared', sharedUserIdEl.value);

  // Delay dùng chung cũng lưu ở đây (dù đã lưu live theo từng phím gõ).
  const sharedDelayEl = document.getElementById('delay-shared');
  if (sharedDelayEl) localStorage.setItem('delay-shared', sharedDelayEl.value);

  let delayMs = getSkillClickDelayMs();
  if (delayInput) {
    delayMs = clampSkillClickDelayMs(delayInput.value);
    delayInput.value = delayMs;
    localStorage.setItem(SKILL_CLICK_DELAY_KEY, String(delayMs));
  }

  if (!input) {
    status.textContent = `✅ Delay: ${delayMs}ms`;
    status.style.color = '#4ecca3';
    toggleSkillModal();
    return;
  }

  const raw = input.value.trim();
  if (!raw) {
    status.textContent = `✅ Delay: ${delayMs}ms — ⚠️ chưa nhập thứ tự skill`;
    status.style.color = '#e9c44a';
    toggleSkillModal();
    return;
  }
  const order = raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= ALL_SKILLS.length);
  if (order.length === 0) { status.textContent = '⚠️ Không có STT hợp lệ'; status.style.color = '#e94560'; return; }
  localStorage.setItem('bicanhSkillOrder', raw);
  const preset = SKILL_COMBO_PRESETS.find(item => item.order.length && normalizeSkillOrder(raw).join(',') === item.order.join(','));
  status.textContent = `✅ Delay: ${delayMs}ms — ${preset ? preset.label : 'Tự nhập'}: ${skillOrderToNames(order).join(' → ')}`;
  status.style.color = '#4ecca3';
  toggleSkillModal();
}

function resetSkillOrder() {
  localStorage.removeItem('bicanhSkillOrder');
  localStorage.removeItem(SKILL_CLICK_DELAY_KEY);
  const input = document.getElementById('skill-order-input');
  const select = document.getElementById('skill-combo-preset');
  const delayInput = document.getElementById('skill-click-delay');
  const status = document.getElementById('skill-order-status');
  if (input) input.value = '';
  if (select) select.value = 'custom';
  if (delayInput) delayInput.value = SKILL_CLICK_DELAY_DEFAULT;
  if (status) { status.textContent = `🔄 Đã reset về mặc định (delay ${SKILL_CLICK_DELAY_DEFAULT}ms)`; status.style.color = '#4ecca3'; }
}

// === STATS ===

let statsPollTimer = null;

function startStatsPolling() {
  if (statsPollTimer) clearInterval(statsPollTimer);
  statsPollTimer = setInterval(updateStats, 2000);
}

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

async function updateStats() {
  try {
    const status = await window.api.botGetStats(0);
    if (!status) return;

    const s = status.stats || {};
    const wins = s.wins || 0;
    const losses = s.losses || 0;
    const battleCount = status.battleCount || 0;
    const totalBattles = status.totalBattles || 0;

    if (status.isRunning !== undefined && !status.isRunning && isNpcRunning) {
      isNpcRunning = false;
      updateBotButton();
    }

    // Top row stats - Target shows battle progress
    if (status.mode === 'vandu') {
      // V16: hiện Số lần đi (tăng khi bấm Trở Về Giang Hồ). V24: như Luân
      // Hồi, có giới hạn thì hiện dạng Z / N.
      const vanduTrips = status.vanduTripCount || 0;
      const vanduTripsLimit = status.vanduTotalTrips || 0;
      const vanduTripsText = vanduTripsLimit > 0 ? `Đã đi: ${vanduTrips} / ${vanduTripsLimit} lần` : `Đã đi: ${vanduTrips} lần`;
      document.getElementById('stat-total').textContent = `🌿 Vân Du: Tiết ${status.vanduNode || 0} | Đan ${status.vanduDanCount || 0}/3 | ${vanduTripsText}`;
    } else if (status.mode === 'dianguc') {
      document.getElementById('stat-total').textContent = `Tầng ${status.diangucFloor || 0}, bước ${status.diangucStep || 0}`;
    } else if (status.mode === 'bicanh') {
      document.getElementById('stat-total').textContent = `⚔️ Đang spam skill...`;
    } else if (status.mode === 'upgrade') {
      document.getElementById('stat-total').textContent = `💀 Đang spam (${status.upgradeCmd || ''}) x${status.upgradeCount || 0}/${status.spamCount || ''}...`;
    } else if (status.mode === 'luanhoi') {
      const cur = status.lastLuanhoiTarget != null ? status.lastLuanhoiTarget : 0;
      const tgt = status.luanhoiTarget || 0;
      const totalRuns = status.luanhoiTotalRuns || 0;
      const runs = status.luanhoiRunCount || 0;
      if (totalRuns > 0) {
        document.getElementById('stat-total').textContent = `Đã đi: ${runs} / ${totalRuns} lần`;
      } else {
        document.getElementById('stat-total').textContent = `Tầng ${cur}/${tgt}`;
      }
    } else if (totalBattles > 0) {
      const remaining = totalBattles - battleCount;
      document.getElementById('stat-total').textContent = `${battleCount}/${totalBattles} (${remaining} còn lại)`;
    } else {
      document.getElementById('stat-total').textContent = `${battleCount} trận`;
    }
    // V71: thẻ trạng thái Neon (tiến trình / HP / đan) — dữ liệu đã có sẵn
    // trong status (vanduNode, vanduDanCount, vanduHpPct, vanduDanEmptyNode).
    updateStatusRow(status);

    document.getElementById('stat-wins').textContent = formatNumber(wins);
    document.getElementById('stat-losses').textContent = formatNumber(losses);
    document.getElementById('stat-coins').textContent = formatNumber(s.coins || 0);
    document.getElementById('stat-exp').textContent = formatNumber(s.exp || 0);
    document.getElementById('stat-items-count').textContent = formatNumber((s.items || []).length);

    // Last battle info
    const lastBattleDiv = document.getElementById('last-battle-info');
    const lb = s.lastBattle;
    if (lb && lb.result) {
      const isWin = lb.result === 'win';
      let html = `<div class="last-battle-result ${isWin ? 'win' : 'loss'}">${isWin ? '✅ THẮNG' : '❌ THUA'}</div>`;
      html += `<div class="last-battle-npc">🔮 ${lb.npc || '-'}</div>`;
      html += `<div class="last-battle-rewards">`;
      if (lb.coins > 0) html += `<span>💰 +${formatNumber(lb.coins)} 🪙</span> `;
      if (lb.exp > 0) html += `<span>✨ +${formatNumber(lb.exp)} XP</span>`;
      if (lb.items && lb.items.length > 0) {
        html += `<div style="margin-top:2px;color:#c084fc;">💎 ${lb.items.join(', ')}</div>`;
      }
      html += `</div>`;
      lastBattleDiv.innerHTML = html;
    }

    // Items list with counts
    const itemsListDiv = document.getElementById('items-list');
    const itemCounts = s.itemCounts || {};
    const itemEntries = Object.entries(itemCounts);
    if (itemEntries.length > 0) {
      itemsListDiv.innerHTML = itemEntries.map(([name, count]) =>
        `<div class="item-row"><span class="item-name">💎 ${name}</span><span class="item-count">x${count}</span></div>`
      ).join('');
    }
  } catch (e) {
    // Bot not running, ignore
  }
}

// V71: cập nhật 3 thẻ trạng thái Neon (tiến trình / HP / đan).
// Vân Du có đủ dữ liệu (vanduNode, vanduHpPct, vanduDanCount); mode khác
// chỉ hiện tiến trình riêng của nó, HP/đan hiện "—".
function updateStatusRow(status) {
  const el = (id) => document.getElementById(id);
  const progressValue = el('status-progress-value');
  const progressFill = el('status-progress-fill');
  const progressSub = el('status-progress-sub');
  const progressLabel = el('status-progress-label');
  if (!progressValue || !progressFill || !progressSub) return;
  const hpValue = el('status-hp-value');
  const hpFill = el('status-hp-fill');
  const hpSub = el('status-hp-sub');
  const danValue = el('status-dan-value');
  const danSub = el('status-dan-sub');
  const markers = [12, 24, 36].map((n) => el('boss-marker-' + n));
  const showMarkers = (on) => markers.forEach((m) => { if (m) m.style.display = on ? '' : 'none'; });
  const running = status.isRunning ? true : false;
  const dot = running
    ? '<span class="status-dot on"></span>ĐANG CHẠY'
    : '<span class="status-dot off"></span>ĐÃ DỪNG';

  const setHp = (hpPct, thresholdText) => {
    if (!hpValue || !hpFill || !hpSub) return;
    if (hpPct === null || hpPct === undefined) {
      hpValue.textContent = '—';
      hpFill.style.width = '0%';
      hpFill.className = 'hp-fill high';
      hpSub.innerHTML = dot + ' · ' + thresholdText;
      return;
    }
    const hp = Math.max(0, Math.min(100, hpPct));
    hpValue.textContent = hp + '%';
    hpFill.style.width = hp + '%';
    hpFill.className = 'hp-fill ' + (hp >= 50 ? 'high' : hp >= 25 ? 'mid' : 'low');
    hpSub.innerHTML = dot + ' · ' + thresholdText;
  };
  const setDan = (dan, emptyNode, nextBoss) => {
    if (!danValue || !danSub) return;
    if (dan === null || dan === undefined) {
      danValue.textContent = '—';
      danValue.style.color = '';
      danSub.textContent = '—';
      danSub.className = 'status-sub';
      return;
    }
    danValue.textContent = dan + '/3';
    danValue.style.color = dan === 0 ? '#ff2d78' : '#39ff14';
    if (dan === 0) {
      const from = emptyNode ? ' từ Tiết ' + emptyNode : '';
      const boss = nextBoss ? ' trước Boss ' + nextBoss : '';
      danSub.textContent = '⚠ HẾT ĐAN' + from + ' — không còn hồi phục' + boss;
      danSub.className = 'status-sub warn';
    } else {
      danSub.textContent = 'Còn ' + dan + '/3 — sẵn sàng hồi phục';
      danSub.className = 'status-sub ok';
    }
  };

  if (status.mode === 'vandu') {
    const node = status.vanduNode || 0;
    const trips = status.vanduTripCount || 0;
    const limit = status.vanduTotalTrips || 0;
    const pct = Math.max(0, Math.min(100, (node / 36) * 100));
    if (progressLabel) progressLabel.textContent = limit > 0 ? 'Tiến trình chuyến ' + trips + '/' + limit : 'Tiến trình chuyến';
    progressValue.innerHTML = 'Tiết ' + node + ' / 36' + (limit > 0 ? ' <span class="dim">· Chuyến ' + trips + '/' + limit + '</span>' : '');
    progressFill.style.width = pct + '%';
    showMarkers(true);
    markers.forEach((m, i) => { if (m) m.classList.toggle('done', node >= [12, 24, 36][i]); });
    const nextBoss = [12, 24, 36].find((b) => b > node);
    progressSub.textContent = nextBoss
      ? 'Boss tiếp theo: ' + nextBoss + ' (còn ' + (nextBoss - node) + ' Tiết)'
      : 'Đã qua Boss 36 — chờ Hoàn Tất Nhận Thưởng';
    const inBossZone = node === 11 || node === 23 || node === 35 || node === 12 || node === 24 || node === 36;
    setHp(status.vanduHpPct, inBossZone ? 'Ngưỡng hồi: <50% (boss)' : 'Ngưỡng hồi: <20% (thường)');
    setDan(status.vanduDanCount || 0, status.vanduDanEmptyNode, nextBoss);
  } else if (status.mode === 'luanhoi') {
    const cur = status.lastLuanhoiTarget != null ? status.lastLuanhoiTarget : 0;
    const tgt = status.luanhoiTarget || 0;
    const totalRuns = status.luanhoiTotalRuns || 0;
    const runs = status.luanhoiRunCount || 0;
    if (progressLabel) progressLabel.textContent = 'Tiến trình Luân Hồi';
    progressValue.textContent = 'Tầng ' + cur + ' / ' + tgt;
    progressFill.style.width = (tgt > 0 ? Math.max(0, Math.min(100, (cur / tgt) * 100)) : 0) + '%';
    showMarkers(false);
    progressSub.textContent = totalRuns > 0 ? 'Đã đi: ' + runs + ' / ' + totalRuns + ' lần' : 'Mục tiêu: Tầng ' + tgt;
    setHp(null, 'Không theo dõi HP ở Luân Hồi');
    setDan(null);
  } else {
    if (progressLabel) progressLabel.textContent = 'Trạng thái';
    progressValue.textContent = running ? 'Đang chạy' : 'Đã dừng';
    progressFill.style.width = '0%';
    showMarkers(false);
    progressSub.textContent = status.mode === 'dianguc'
      ? 'Tầng ' + (status.diangucFloor || 0) + ', bước ' + (status.diangucStep || 0)
      : status.mode === 'bicanh' ? 'Đang spam skill...' : '';
    setHp(null, 'Không theo dõi HP ở mode này');
    setDan(null);
  }
}

async function resetStats() {
  await window.api.botResetStats(0);
  updateStats();
}

// === LOGS ===

function loadLogs() {
  window.api.getLogs().then(logs => {
    const logArea = document.getElementById('log-area');
    logArea.innerHTML = '';
    logs.forEach(msg => appendLog(msg));
  });
}

// V71: tô màu log theo loại (như mockup Neon) — phân loại theo từ khóa.
// BOSS check trước: dòng "BOSS 24 Tới mốc..." có chứa chữ "kẹt" nên phải
// nhận diện boss trước, không thì nó rơi vào nhóm cảnh báo đỏ.
function logClass(msg) {
  if (/BOSS \d+/.test(msg)) return 'log-boss';
  if (/CẢNH BÁO|⛔|HẾT ĐAN|không hồi|kẹt/i.test(msg)) return 'log-warn';
  if (/THẮNG|✅|hồi máu bằng|🏁|Hoàn Tất/i.test(msg)) return 'log-win';
  if (/vào trận|⚔️|đánh|skill/i.test(msg)) return 'log-battle';
  return 'log-info';
}

function appendLog(msg) {
  const logArea = document.getElementById('log-area');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + logClass(msg);
  entry.textContent = msg;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function clearLogs() {
  window.api.clearLogs();
  document.getElementById('log-area').innerHTML = '';
}

function copyLogs() {
  const logArea = document.getElementById('log-area');
  const entries = logArea.querySelectorAll('.log-entry');
  const text = Array.from(entries).map(e => e.textContent).join('\n');
  const btn = document.getElementById('btn-copy-log');

  if (!text.trim()) {
    btn.textContent = '⚠️ Log trống';
    setTimeout(() => { btn.textContent = '📋 Copy Log'; }, 1500);
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅ Đã copy!';
    btn.style.background = '#00c853';
    btn.style.borderColor = '#39ff14';
    setTimeout(() => {
      btn.textContent = '📋 Copy Log';
      btn.style.background = '';
      btn.style.borderColor = '';
    }, 2000);
  }).catch(() => {
    btn.textContent = '❌ Lỗi copy';
    btn.style.background = '#ff1c1c';
    btn.style.borderColor = '#ff2d78';
    setTimeout(() => {
      btn.textContent = '📋 Copy Log';
      btn.style.background = '';
      btn.style.borderColor = '';
    }, 2000);
  });
}
