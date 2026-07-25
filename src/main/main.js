const { app, BrowserWindow, ipcMain, webContents } = require('electron');
const path = require('path');
const { NpcBot } = require('./npc-bot');

let mainWindow = null;
const botMap = {};
let globalLogBuffer = [];

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
