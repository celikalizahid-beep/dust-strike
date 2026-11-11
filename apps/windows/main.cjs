// DUST STRIKE Windows uygulaması: canlı oyun sunucusunu kendi penceresinde açar.
// F11 tam ekran; menü çubuğu yok (Ctrl+W gibi kısayollar oyunu kapatmaz).
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');

const GAME_URL = 'https://dust-strike-jqkv.onrender.com';

// Eski ekran kartlarında da WebGL açık kalsın
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Uygulama ayarları (oyundaki Ayarlar > Görüntü > "FPS sınırını kaldır" buradan okunur).
// Bu seçenek yalnızca açılışta uygulanabildiği için değişince uygulama yeniden başlatılır.
const CONFIG_FILE = path.join(app.getPath('userData'), 'dust-app.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* ilk açılış */ }
if (config.fpsUnlock) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
ipcMain.on('get-config', (event) => { event.returnValue = { fpsUnlock: !!config.fpsUnlock }; });
ipcMain.on('set-fps-unlock', (event, on) => {
  if (!!on === !!config.fpsUnlock) return;
  config.fpsUnlock = !!on;
  try { fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(config)); } catch { return; }
  // Taşınabilir (tek dosya) sürümde asıl exe'nin yolu bu değişkendedir
  const exe = process.env.PORTABLE_EXECUTABLE_FILE;
  app.relaunch(exe ? { execPath: exe } : undefined);
  app.exit(0);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    title: 'DUST STRIKE',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  Menu.setApplicationMenu(null);
  win.maximize();
  win.loadURL(GAME_URL);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // Oyun dışı bağlantılar varsayılan tarayıcıda açılsın
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', () => {
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="background:#000;color:#ffb228;font-family:Verdana;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">'
      + '<div><h1>DUST STRIKE</h1><p>Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.<br>Sunucu uyuyorsa açılması 1 dakika sürebilir.</p>'
      + '<button onclick="location.href=\'' + GAME_URL + '\'" style="padding:10px 20px;font-size:16px">Tekrar dene</button></div></body>'));
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
