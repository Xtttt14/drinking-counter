const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("waterApi", {
  getState: () => ipcRenderer.invoke("state:get"),
  addDrink: (payload) => ipcRenderer.invoke("drink:add", payload),
  undoDrink: () => ipcRenderer.invoke("drink:undo"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  requestClose: () => ipcRenderer.invoke("app:request-close"),
  resolveCloseChoice: (choice) => ipcRenderer.invoke("app:resolve-close-choice", choice),
  onStateChanged: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onClosePrompt: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("close:prompt", listener);
    return () => ipcRenderer.removeListener("close:prompt", listener);
  }
});
