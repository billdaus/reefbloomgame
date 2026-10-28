// Reef Bloom Desktop Edition — an Electron shell around the same app build the
// iOS/Mac Catalyst editions use (../dist-app, copied into ./app at build time).
// Ships as a macOS DMG (10.15 Catalina and up, Intel), a Linux AppImage/deb,
// and a Windows installer.
//
// Why Electron 32: it is the last Electron that still runs on macOS 10.15 (a
// 2012 MacBook Pro tops out there); Electron 33 dropped it — do not bump past 32.
//
// The pages are served from a custom app://reefbloom origin rather than
// file://: Chromium refuses ES-module scripts over file://, and a fixed origin
// keeps localStorage (the saves) stable between launches.
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_DIR = path.join(__dirname, 'app');
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
// The Home page labels itself "Desktop edition" from this token (app.html).
app.userAgentFallback = app.userAgentFallback.replace(/Electron\/[\d.]+ /, '') + ' ReefBloomDesktop';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: 'Reef Bloom', backgroundColor: '#0a3550', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  // Links that leave the app (the website, support) open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL(process.env.RB_URL || 'app://reefbloom/index.html');   // RB_URL (dev): open another page, e.g. the reef
  // RB_SHOT=/path.png (dev): photograph the window after load and quit.
  if (process.env.RB_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require('node:fs').writeFileSync(process.env.RB_SHOT, img.toPNG());
      app.quit();
    }, Number(process.env.RB_SHOT_WAIT || 6000)));
  }
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(APP_DIR, p));
    if (!file.startsWith(APP_DIR)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
