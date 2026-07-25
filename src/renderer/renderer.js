let currentTab = 0;
const tabs = [];
let isAutoRunning = false;

window.addEventListener('DOMContentLoaded', () => {
  addTab();
  loadLogs();

  window.api.onLogMessage((msg) => {
    appendLog(msg);
  });
});

function addTab() {
  const idx = tabs.length;
  tabs.push({ idx, webview: null, registered: false });

  const tabBtn = document.createElement('button');
  tabBtn.className = 'tab-btn';
  tabBtn.textContent = `Tab ${idx + 1}`;
  tabBtn.onclick = () => switchTab(idx);
  document.getElementById('tabs').appendChild(tabBtn);

  const webview = document.createElement('webview');
  webview.id = `webview-${idx}`;
  webview.className = 'wv-hidden';
  webview.setAttribute('partition', 'persist:discord-npc');
  webview.src = 'https://discord.com/login';
  webview.addEventListener('did-finish-load', () => onWebviewLoad(idx, webview));
  document.getElementById('content').appendChild(webview);

  switchTab(idx);
}

function switchTab(idx) {
  currentTab = idx;
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('#content webview').forEach((wv, i) => {
    wv.classList.toggle('wv-hidden', i !== idx);
  });
  updateStatus();
}

function onWebviewLoad(idx, webview) {
  const wcId = webview.getWebContentsId();
  window.api.registerWebview(idx, wcId);
  tabs[idx].registered = true;
  updateStatus();
}

function updateStatus() {
  const entry = tabs[currentTab];
  const statusEl = document.getElementById('status-text');
  if (entry && entry.registered) {
    statusEl.textContent = 'Ready';
    statusEl.style.color = '#4ecca3';
  } else {
    statusEl.textContent = 'Not connected';
    statusEl.style.color = '#e94560';
  }
}

function startBot() {
  const config = getConfig();
  window.api.botUpdateConfig(currentTab, config);
  window.api.botStart(currentTab);
  isAutoRunning = true;
  updateToggleButton();
  appendLog(`[System] Bot started for Tab ${currentTab + 1}`);
}

function stopBot() {
  window.api.botStop(currentTab);
  isAutoRunning = false;
  updateToggleButton();
  appendLog(`[System] Bot stopped for Tab ${currentTab + 1}`);
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

function addNewTab() {
  addTab();
}
