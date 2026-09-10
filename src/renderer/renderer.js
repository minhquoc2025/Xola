let isNpcRunning = false;
let isWebviewRegistered = false;
let isMuted = false;

window.addEventListener('DOMContentLoaded', () => {
  initWebview();
  loadLogs();
  startStatsPolling();

  window.api.onLogMessage((msg) => {
    appendLog(msg);
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

// === MODE ===

let currentMode = 'npc';

function setMode(mode) {
  currentMode = mode;
  document.getElementById('tab-npc').classList.toggle('active', mode === 'npc');
  document.getElementById('tab-luanhoi').classList.toggle('active', mode === 'luanhoi');
  document.getElementById('tab-bicanh').classList.toggle('active', mode === 'bicanh');
  document.getElementById('tab-dianguc').classList.toggle('active', mode === 'dianguc');
  document.getElementById('config-npc').classList.toggle('active', mode === 'npc');
  document.getElementById('config-luanhoi').classList.toggle('active', mode === 'luanhoi');
  document.getElementById('config-bicanh').classList.toggle('active', mode === 'bicanh');
  document.getElementById('config-dianguc').classList.toggle('active', mode === 'dianguc');
  updateBotButton();
}

// === NPC MODE ===

function getNpcConfig() {
  const patternStr = document.getElementById('click-pattern').value || '3,2,1';
  const clickPattern = patternStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  return {
    mode: 'npc',
    username: (document.getElementById('username').value || '').trim(),
    npcNumber: parseInt(document.getElementById('npc-number').value) || 1,
    totalBattles: parseInt(document.getElementById('total-battles').value) || 5,
    cooldownMs: (parseInt(document.getElementById('cooldown-seconds').value) || 120) * 1000,
    buttonDelayMs: (parseFloat(document.getElementById('button-delay').value) || 1) * 1000,
    smartMode: true,
    clickPattern: clickPattern.length > 0 ? clickPattern : [3, 2, 1],
    autoClimb: document.getElementById('auto-climb').checked,
    targetMaxNpc: parseInt(document.getElementById('target-max-npc').value) || 60,
    tuLuyen: document.getElementById('tu-luyen').checked,
    tuLuyenStartCmd: '!tuluyen',
    tuLuyenEndCmd: '!ketthuc',
  };
}

function getLuanHoiConfig() {
  const configuredOrder = localStorage.getItem('bicanhSkillOrder') || '';
  const skills = resolveSkillNames(configuredOrder);
  return {
    mode: 'luanhoi',
    luanhoi: true,
    username: (document.getElementById('username-lh').value || 'Quất Bất Lực').trim(),
    luanhoiTarget: parseInt(document.getElementById('luanhoi-target').value) || 10,
    luanhoiCmd: (document.getElementById('luanhoi-cmd').value || '!luanhoi').trim(),
    buttonDelayMs: (parseFloat(document.getElementById('button-delay-lh').value) || 1) * 1000,
    luanhoiSkillNames: skills.length > 0
      ? skills
      : ['Vạn Kiếm Quy Tông', 'Hỗn Nguyên Hộ Thể', 'Kiếm Khí Xung Thiên', 'Thái Cực Dưỡng Sinh'],
  };
}

function getBicanhConfig() {
  return {
    mode: 'bicanh',
    username: (document.getElementById('username-bicanh').value || 'Quất Bất Lực').trim(),
    bicanhCmd: (document.getElementById('bicanh-cmd').value || '!bicanh').trim(),
    bicanhSkillOrder: localStorage.getItem('bicanhSkillOrder') || '',
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
  const inputValue = document.getElementById('dianguc-skills').value || '';
  const skillNames = resolveSkillNames(configuredOrder || inputValue);
  const resolvedSkills = skillNames.length > 0
    ? skillNames
    : ['Vạn Kiếm Quy Tông', 'Hỗn Nguyên Hộ Thể', 'Kiếm Khí Xung Thiên', 'Thái Cực Dưỡng Sinh'];
  return {
    mode: 'dianguc',
    dianguc: true,
    username: (document.getElementById('username-dianguc').value || 'Quất Bất Lực').trim(),
    diangucCmd: (document.getElementById('dianguc-cmd').value || '!dianguc').trim(),
    luanhoiSkillNames: resolvedSkills,
    diangucDelayMs: 1500,
    diangucChoiceDelayMs: 1500,
    diangucSkillDelayMs: 1700,
    diangucWinDelayMs: 3000,
  };
}

function getActiveConfig() {
  if (currentMode === 'dianguc') return getDiangucConfig();
  if (currentMode === 'bicanh') return getBicanhConfig();
  return currentMode === 'luanhoi' ? getLuanHoiConfig() : getNpcConfig();
}

async function toggleBot() {
  if (isNpcRunning) {
    window.api.botStop(0);
    isNpcRunning = false;
    appendLog('[BOT] ⏹ Stopped');
  } else {
    if (!isWebviewRegistered) return;
    const config = getActiveConfig();
    await window.api.botUpdateConfig(0, config);
    window.api.botStart(0);
    isNpcRunning = true;
    const label = config.mode === 'luanhoi' ? 'Luân Hồi' : (config.mode === 'bicanh' ? 'Bicanh' : (config.mode === 'dianguc' ? 'Địa Ngục' : 'NPC'));
    appendLog(`[${label}] ▶ Started`);
  }
  updateBotButton();
}

function updateBotButton() {
  const isLH = currentMode === 'luanhoi';
  const isBC = currentMode === 'bicanh';
  const btns = [document.getElementById('btn-npc-toggle'), document.getElementById('btn-luanhoi-toggle'), document.getElementById('btn-bicanh-toggle'), document.getElementById('btn-dianguc-toggle')];
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

// === SKILL MODAL ===

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
  // Luyện Khí
  { stt: 18, name: 'Thái Cực Dưỡng Sinh', cat: 'Luyện Khí' },
  { stt: 19, name: 'Kiếm Khí Xung Thiên', cat: 'Luyện Khì' },
  { stt: 20, name: 'Kim Cương Phục Ma', cat: 'Luyện Khí' },
  // Trúc Cơ
  { stt: 21, name: 'Hỗn Nguyên Hộ Thể', cat: 'Trúc Cơ' },
  { stt: 22, name: 'Vạn Kiếm Quy Tông', cat: 'Trúc Cơ' },
  { stt: 23, name: 'Phong Ấn Thất Mạch', cat: 'Trúc Cơ' },
];

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

function buildSkillGrid() {
  const left = document.getElementById('skill-grid-left');
  const right = document.getElementById('skill-grid-right');
  if (!left || !right) return;
  left.innerHTML = '';
  right.innerHTML = '';
  const half = Math.ceil(ALL_SKILLS.length / 2);
  for (let i = 0; i < ALL_SKILLS.length; i++) {
    const sk = ALL_SKILLS[i];
    const div = document.createElement('div');
    div.className = 'skill-item';
    div.innerHTML = `<span class="stt">${sk.stt}</span><span class="skill-name">${sk.name}</span><span class="skill-cat">${sk.cat}</span>`;
    (i < half ? left : right).appendChild(div);
  }
}

function loadSkillOrder() {
  const saved = localStorage.getItem('bicanhSkillOrder');
  const input = document.getElementById('skill-order-input');
  if (saved && input) input.value = saved;
}

function saveSkillOrder() {
  const input = document.getElementById('skill-order-input');
  const status = document.getElementById('skill-order-status');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) { status.textContent = '⚠️ Chưa nhập thứ tự'; status.style.color = '#e94560'; return; }
  const order = raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 23);
  if (order.length === 0) { status.textContent = '⚠️ Không có STT hợp lệ'; status.style.color = '#e94560'; return; }
  localStorage.setItem('bicanhSkillOrder', raw);
  status.textContent = `✅ Đã lưu: ${order.join(' → ')} (${order.length} skill)`;
  status.style.color = '#4ecca3';
  toggleSkillModal();
}

function resetSkillOrder() {
  localStorage.removeItem('bicanhSkillOrder');
  const input = document.getElementById('skill-order-input');
  const status = document.getElementById('skill-order-status');
  if (input) input.value = '';
  if (status) { status.textContent = '🔄 Đã reset về mặc định'; status.style.color = '#4ecca3'; }
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

     // Top row stats - Target shows battle progress
     if (status.mode === 'dianguc') {
       document.getElementById('stat-total').textContent = `Tầng ${status.diangucFloor || 0}, bước ${status.diangucStep || 0}`;
     } else if (status.mode === 'bicanh') {
       document.getElementById('stat-total').textContent = `⚔️ Đang spam skill...`;
     } else if (status.mode === 'luanhoi') {
      const cur = status.lastLuanhoiTarget != null ? status.lastLuanhoiTarget : 0;
      const tgt = status.luanhoiTarget || 0;
      document.getElementById('stat-total').textContent = `Tầng ${cur}/${tgt}`;
    } else if (totalBattles > 0) {
      const remaining = totalBattles - battleCount;
      document.getElementById('stat-total').textContent = `${battleCount}/${totalBattles} (${remaining} còn lại)`;
    } else {
      document.getElementById('stat-total').textContent = `${battleCount} trận`;
    }
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

function appendLog(msg) {
  const logArea = document.getElementById('log-area');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
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
    btn.style.background = '#1a5a2e';
    btn.style.borderColor = '#2a7a3e';
    setTimeout(() => {
      btn.textContent = '📋 Copy Log';
      btn.style.background = '';
      btn.style.borderColor = '';
    }, 2000);
  }).catch(() => {
    btn.textContent = '❌ Lỗi copy';
    btn.style.background = '#5a1a1a';
    btn.style.borderColor = '#7a2a2a';
    setTimeout(() => {
      btn.textContent = '📋 Copy Log';
      btn.style.background = '';
      btn.style.borderColor = '';
    }, 2000);
  });
}
