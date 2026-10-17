const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('diffApi', {
  get: () => ipcRenderer.invoke('diff:get'),
  open: (p) => ipcRenderer.send('openFile', p),
});
