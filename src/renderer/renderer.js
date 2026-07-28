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
  const autoClimb = document.getElementById('auto-climb').checked;
  const targetMaxNpc = parseInt(document.getElementById('target-max-npc').value) || 60;
  const username = document.getElementById('username').value.trim();
  return {
    npcNumber: parseInt(document.getElementById('npc-number').value) || 1,
    totalBattles: parseInt(document.getElementById('total-battles').value) || 5,
    cooldownMs: (parseInt(document.getElementById('cooldown-seconds').value) || 120) * 1000,
    buttonDelayMs: (parseFloat(document.getElementById('button-delay').value) || 1) * 1000,
    smartMode: true,
    healPosition: parseInt(document.getElementById('heal-position').value) || 3,
    skillPriority: document.getElementById('skill-priority').value.trim() || '1,2,3',
    rollSchedule: (() => {
      const d = document.getElementById('roll-date').value.trim();
      const t = document.getElementById('roll-time').value.trim();
      if (!d || !t) return null;
      if (d.length === 8 && t.length >= 3) {
        const y = d.substring(0,4), m = d.substring(4,6), day = d.substring(6,8);
        const h = t.substring(0,2), min = t.substring(2,4);
        return `${y}-${m}-${day}T${h}:${min}`;
      }
      return null;
    })(),
    rollCount: parseInt(document.getElementById('roll-count').value) || 1,
    autoClimb,
    targetMaxNpc,
    username,
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
