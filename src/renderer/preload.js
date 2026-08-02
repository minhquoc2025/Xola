const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  botStart: (idx) => ipcRenderer.invoke('bot-start', idx),
  botStop: (idx) => ipcRenderer.invoke('bot-stop', idx),
  botUpdateConfig: (idx, config) => ipcRenderer.invoke('bot-update-config', idx, config),
  registerWebview: (idx, wcId) => ipcRenderer.invoke('register-webview', idx, wcId),
  unregisterWebview: (idx) => ipcRenderer.invoke('unregister-webview', idx),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  onLogMessage: (cb) => ipcRenderer.on('log-message', (e, msg) => cb(msg)),
  sellScan: (idx) => ipcRenderer.invoke('sell-scan', idx),
  sellSend: (idx, itemId) => ipcRenderer.invoke('sell-send', idx, itemId),
});
