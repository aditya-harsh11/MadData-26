const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getBackendUrl: () => ipcRenderer.invoke("get-backend-url"),
  getWsUrl: () => ipcRenderer.invoke("get-ws-url"),
  platform: process.platform,
});
