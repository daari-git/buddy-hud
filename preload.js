const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hud', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onRefit: (cb) => ipcRenderer.on('refit', () => cb()),
  send: (channel, data) => ipcRenderer.send(channel, data),
});
