let isAutoRunning = false;
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
  // Use a stable partition for single account persistence
  webview.setAttribute('partition', 'persist:discord-main-account');
  webview.src = 'https://discord.com/login';
  webview.addEventListener('did-finish-load', () => onWebviewLoad(webview));
  document.getElementById('content').appendChild(webview);
}

function onWebviewLoad(webview) {
  const wcId = webview.getWebContentsId();
  window.api.registerWebview(0, wcId);
  isWebviewRegistered = true;
  updateStatus();
}

function updateStatus() {
  const statusEl = document.getElementById('status-text');
  if (isWebviewRegistered) {
    statusEl.textContent = 'Ready';
    statusEl.style.color = '#4ecca3';
  } else {
    statusEl.textContent = 'Not connected';
    statusEl.style.color = '#e94560';
  }
}

function startBot() {
  if (!isWebviewRegistered) return;
  const config = getConfig();
  window.api.botUpdateConfig(0, config);
  window.api.botStart(0);
  isAutoRunning = true;
  updateToggleButton();
  appendLog(`[System] Bot started`);
}

function stopBot() {
  window.api.botStop(0);
  isAutoRunning = false;
  updateToggleButton();
  appendLog(`[System] Bot stopped`);
}

function toggleBot() {
  if (isAutoRunning) {
    stopBot();
  } else {
    startBot();
  }
}

function updateToggleButton() {
  const btn = document.getElementById('btn-toggle');
  if (isAutoRunning) {
    btn.textContent = '⏹ STOP';
    btn.className = 'btn-stop';
  } else {
    btn.textContent = '▶ START';
    btn.className = 'btn-start';
  }
}

function getConfig() {
  const patternStr = document.getElementById('click-pattern').value || '3,2,1';
  const clickPattern = patternStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  return {
    npcNumber: parseInt(document.getElementById('npc-number').value) || 1,
    totalBattles: parseInt(document.getElementById('total-battles').value) || 5,
    cooldownMs: (parseInt(document.getElementById('cooldown-seconds').value) || 120) * 1000,
    buttonDelayMs: (parseInt(document.getElementById('button-delay').value) || 1) * 1000,
    clickPattern: clickPattern.length > 0 ? clickPattern : [3, 2, 1],
  };
}

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
