let isNpcRunning = false;
let isLuanhoiRunning = false;
let isWebviewRegistered = false;

window.addEventListener('DOMContentLoaded', () => {
  initWebview();
  loadLogs();

  window.api.onLogMessage((msg) => {
    appendLog(msg);
  });
});

function initWebview() {
  const webview = document.createElement('webview');
  webview.id = 'webview-main';
  webview.setAttribute('partition', 'persist:discord-main-account');
  webview.src = 'https://discord.com/login';
  webview.addEventListener('did-finish-load', () => onWebviewLoad(webview));
  document.getElementById('content').appendChild(webview);
}

function onWebviewLoad(webview) {
  const wcId = webview.getWebContentsId();
  window.api.registerWebview(0, wcId);
  isWebviewRegistered = true;
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
  };
}

async function toggleNpc() {
  if (isNpcRunning) {
    window.api.botStop(0);
    isNpcRunning = false;
    appendLog('[NPC] ⏹ Stopped');
  } else {
    if (!isWebviewRegistered) return;
    // Stop luanhoi if running
    if (isLuanhoiRunning) {
      window.api.botStop(0);
      isLuanhoiRunning = false;
      updateLuanhoiButton();
      appendLog('[Luân Hồi] ⏹ Stopped (switched to NPC)');
      await new Promise(r => setTimeout(r, 500));
    }
    const config = getNpcConfig();
    await window.api.botUpdateConfig(0, config);
    window.api.botStart(0);
    isNpcRunning = true;
    appendLog('[NPC] ▶ Started');
  }
  updateNpcButton();
}

function updateNpcButton() {
  const btn = document.getElementById('btn-npc-toggle');
  if (isNpcRunning) {
    btn.textContent = '⏹ STOP';
    btn.className = 'btn-stop';
  } else {
    btn.textContent = '▶ START';
    btn.className = 'btn-start';
  }
}

// === LUÂN HỒI MODE ===

function getLuanhoiConfig() {
  return {
    mode: 'luanhoi',
    username: (document.getElementById('username-lh').value || '').trim(),
    cooldownMs: (parseInt(document.getElementById('cooldown-seconds-lh').value) || 120) * 1000,
    buttonDelayMs: (parseFloat(document.getElementById('button-delay-lh').value) || 1) * 1000,
    smartMode: true,
    maxLayer: parseInt(document.getElementById('max-layer').value) || 20,
  };
}

async function toggleLuanhoi() {
  if (isLuanhoiRunning) {
    window.api.botStop(0);
    isLuanhoiRunning = false;
    appendLog('[Luân Hồi] ⏹ Stopped');
  } else {
    if (!isWebviewRegistered) return;
    // Stop npc if running
    if (isNpcRunning) {
      window.api.botStop(0);
      isNpcRunning = false;
      updateNpcButton();
      appendLog('[NPC] ⏹ Stopped (switched to Luân Hồi)');
      await new Promise(r => setTimeout(r, 500));
    }
    const config = getLuanhoiConfig();
    await window.api.botUpdateConfig(0, config);
    window.api.botStart(0);
    isLuanhoiRunning = true;
    appendLog('[Luân Hồi] ▶ Started');
  }
  updateLuanhoiButton();
}

function updateLuanhoiButton() {
  const btn = document.getElementById('btn-luanhoi-toggle');
  if (isLuanhoiRunning) {
    btn.textContent = '⏹ STOP';
    btn.className = 'btn-stop';
  } else {
    btn.textContent = '▶ START';
    btn.className = 'btn-start';
  }
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
