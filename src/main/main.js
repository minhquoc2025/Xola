const { app, BrowserWindow, ipcMain, webContents, screen } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('disable-site-isolation-trials');

const { NpcBot } = require('./npc-bot');

let mainWindow = null;
const botMap = {};
let globalLogBuffer = [];

function createMainWindow() {
  // Cửa sổ theo kích thước màn thật thay vì cố định 1200x800:
  // màn 14"/15.6"/16" (thường 1366x768 hoặc 1920x1080 scale 125-150%)
  // mở ~92% vùng làm việc, không tràn taskbar; màn 22" mở rộng hơn,
  // tối đa 1600x1000. Người dùng vẫn kéo to/nhỏ, thu nhỏ tối thiểu 960x640.
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(960, Math.min(1600, Math.floor(workArea.width * 0.92)));
  const height = Math.max(640, Math.min(1000, Math.floor(workArea.height * 0.92)));
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    title: 'Discord NPC Auto',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    Object.keys(botMap).forEach(k => {
      if (botMap[k]) { botMap[k].stop(); delete botMap[k]; }
    });
  });
}

app.whenReady().then(() => {
  createMainWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC Handlers
ipcMain.handle('bot-start', async (e, idx) => {
  const entry = botMap[idx];
  if (entry) {
    entry.start();
    return 'started';
  }
  return 'not_found';
});

ipcMain.handle('bot-stop', async (e, idx) => {
  const entry = botMap[idx];
  if (entry) {
    entry.stop();
    return 'stopped';
  }
  return 'not_found';
});

ipcMain.handle('bot-update-config', async (e, idx, config) => {
  const entry = botMap[idx];
  if (entry) {
    entry.updateConfig(config);
    return 'updated';
  }
  return 'not_found';
});

ipcMain.handle('register-webview', async (e, idx, wcId) => {
  if (botMap[idx]) {
    console.log(`[MAIN] register-webview(${idx}): already registered`);
    return;
  }

  const wc = webContents.fromId(wcId);
  if (!wc) {
    console.log(`[MAIN] register-webview(${idx}): webContents not found`);
    return;
  }

  console.log(`[MAIN] register-webview(${idx}): creating NpcBot`);
  const bot = new NpcBot(wc, idx);

  bot.log = (...args) => {
    const msg = `[${bot.ts()}] [Bot ${idx}] ${args.join(' ')}`;
    console.log(msg);
    globalLogBuffer.push(msg);
    if (globalLogBuffer.length > 500) globalLogBuffer.splice(0, globalLogBuffer.length - 500);
    if (mainWindow) mainWindow.webContents.send('log-message', msg);
  };

  botMap[idx] = bot;
});

ipcMain.handle('unregister-webview', async (e, idx) => {
  const entry = botMap[idx];
  if (entry) {
    entry.stop();
    delete botMap[idx];
  }
});

ipcMain.handle('get-logs', () => globalLogBuffer);

ipcMain.handle('clear-logs', () => {
  globalLogBuffer = [];
  return 'cleared';
});

ipcMain.handle('bot-get-stats', async (e, idx) => {
  const entry = botMap[idx];
  if (entry) {
    return entry.getStatus();
  }
  return null;
});

ipcMain.handle('bot-reset-stats', async (e, idx) => {
  const entry = botMap[idx];
  if (entry) {
    entry.resetStats();
    return 'reset';
  }
  return 'not_found';
});
