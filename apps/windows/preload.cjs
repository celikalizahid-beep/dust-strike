// Oyuna, uygulamanın ayarlarına ulaşan küçük bir köprü verir (window.dustApp).
const { contextBridge, ipcRenderer } = require('electron');

const config = ipcRenderer.sendSync('get-config') || {};
contextBridge.exposeInMainWorld('dustApp', {
  fpsUnlock: !!config.fpsUnlock,
  // Değişirse uygulama ayarı kaydedip kendini yeniden başlatır
  setFpsUnlock: (on) => ipcRenderer.send('set-fps-unlock', !!on),
});
