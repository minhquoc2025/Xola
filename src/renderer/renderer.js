let isAutoRunning = false;
let isWebviewRegistered = false;
let sellItems = [];
let isAutoSelling = false;
let autoSellTimer = null;

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
  webview.setAttribute('partition', 'persist:discord-npc');
  webview.src = 'https://discord.com/app';
  webview.addEventListener('dom-ready', () => onWebviewLoad(webview));
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
  const autoClimb = document.getElementById('auto-climb').checked;
  const targetMaxNpc = parseInt(document.getElementById('target-max-npc').value) || 60;
  return {
    username: (document.getElementById('username').value || '').trim(),
    npcNumber: parseInt(document.getElementById('npc-number').value) || 1,
    totalBattles: parseInt(document.getElementById('total-battles').value) || 5,
    cooldownMs: (parseInt(document.getElementById('cooldown-seconds').value) || 120) * 1000,
    buttonDelayMs: (parseFloat(document.getElementById('button-delay').value) || 1) * 1000,
    clickPattern: clickPattern.length > 0 ? clickPattern : [3, 2, 1],
    autoClimb,
    targetMaxNpc,
    mode: document.getElementById('luanhoi-mode').checked ? 'luanhoi' : 'npc',
    maxLayer: parseInt(document.getElementById('max-layer').value) || 20,
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

// === SELL PANEL ===

function toggleSellPanel() {
  const sellSection = document.getElementById('sell-section');
  const configSection = document.getElementById('config-section');
  const isActive = sellSection.classList.contains('active');
  if (isActive) {
    sellSection.classList.remove('active');
    configSection.style.display = '';
  } else {
    sellSection.classList.add('active');
    configSection.style.display = 'none';
  }
}

function getColorFilter() {
  const filters = {};
  if (document.getElementById('filter-blue').checked) filters['🔵'] = true;
  if (document.getElementById('filter-yellow').checked) filters['🟡'] = true;
  if (document.getElementById('filter-green').checked) filters['🟢'] = true;
  if (document.getElementById('filter-purple').checked) filters['🟣'] = true;
  if (document.getElementById('filter-red').checked) filters['🔴'] = true;
  return filters;
}

function matchesFilter(item) {
  const filters = getColorFilter();
  return !!filters[item.color];
}

function renderSellItems() {
  const listEl = document.getElementById('sell-item-list');
  listEl.innerHTML = '';
  const filtered = sellItems.filter(matchesFilter);
  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="color:#666;padding:8px;">Khong co vat pham phu hop.</div>';
    return;
  }
  filtered.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'sell-item';
    div.innerHTML = `<span style="cursor:default;">${item.color} ${item.name} <small style="color:#888;">(${item.id})</small></span>`;
    listEl.appendChild(div);
  });
}

function toggleSellAllColors() {
  const ids = ['filter-blue', 'filter-yellow', 'filter-green', 'filter-purple', 'filter-red'];
  const allChecked = ids.every(id => document.getElementById(id).checked);
  const newVal = !allChecked;
  ids.forEach(id => document.getElementById(id).checked = newVal);
  renderSellItems();
}

// === AUTO SELL ===

function toggleAutoSell() {
  isAutoSelling = !isAutoSelling;
  const btn = document.getElementById('btn-auto-sell');
  if (isAutoSelling) {
    btn.textContent = '⏹ Stop Auto';
    btn.className = 'btn-stop-auto';
    appendLog('[Sell] 🔴 Auto Sell ON - sẽ scan và bán liên tục');
    autoSellLoop();
  } else {
    btn.textContent = '🔴 Auto Sell';
    btn.className = 'btn-auto-sell';
    appendLog('[Sell] ⏹ Auto Sell OFF');
    if (autoSellTimer) { clearTimeout(autoSellTimer); autoSellTimer = null; }
  }
}

async function autoSellLoop() {
  if (!isAutoSelling) return;

  // Scan inventory
  appendLog('[Sell] 🔄 Auto: đang scan...');
  const items = await window.api.sellScan(0);
  sellItems = items || [];
  renderSellItems();

  // Filter items
  const filtered = sellItems.filter(matchesFilter);
  if (filtered.length === 0) {
    appendLog('[Sell] ✅ Auto: hết vật phẩm phù hợp! Dừng auto sell.');
    isAutoSelling = false;
    const btn = document.getElementById('btn-auto-sell');
    btn.textContent = '🔴 Auto Sell';
    btn.className = 'btn-auto-sell';
    return;
  }

  // Sell each item
  appendLog(`[Sell] Auto: tìm thấy ${filtered.length} vật phẩm, bắt đầu bán...`);
  for (const item of filtered) {
    if (!isAutoSelling) break;
    const result = await window.api.sellSend(0, item.id);
    if (result.sent) {
      appendLog(`[Sell] ✅ Auto: bán ${item.color} ${item.name} (ID ${item.id})`);
    } else {
      appendLog(`[Sell] ⏳ Auto: ID ${item.id} đang chờ quy đổi`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // Scan again after selling
  if (isAutoSelling) {
    appendLog('[Sell] Auto: scan lại sau 5s...');
    autoSellTimer = setTimeout(autoSellLoop, 5000);
  }
}
