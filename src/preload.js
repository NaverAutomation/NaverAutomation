import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getLastUpdaterStatus: () => ipcRenderer.invoke('updater:getLastStatus'),
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
  onUpdaterStatus: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:status', listener);

    return () => {
      ipcRenderer.removeListener('updater:status', listener);
    };
  },
});