const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gsMonitor", {
  save: (url) => ipcRenderer.invoke("monitor:save-url", url),
  current: () => ipcRenderer.invoke("monitor:current-url")
});
