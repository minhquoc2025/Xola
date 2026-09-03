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
  document.getElementById('config-npc').classList.toggle('active', mode === 'npc');
  document.getElementById('config-luanhoi').classList.toggle('active', mode === 'luanhoi');
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
  const skillsEl = document.getElementById('luanhoi-skills');
  const skillsStr = (skillsEl && skillsEl.value) || '';
  const skills = skillsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
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

function getActiveConfig() {
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
    const label = config.mode === 'luanhoi' ? 'Luân Hồi' : 'NPC';
    appendLog(`[${label}] ▶ Started`);
  }
  updateBotButton();
}

function updateBotButton() {
  const isLH = currentMode === 'luanhoi';
  const btns = [document.getElementById('btn-npc-toggle'), document.getElementById('btn-luanhoi-toggle')];
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
    if (status.mode === 'luanhoi') {
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
