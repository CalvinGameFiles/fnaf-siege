// FNAF Siege for Windows: a real desktop app (Electron) - its own window and icon, no browser.
'use strict';
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Play straight from the project's www/ folder when it's there (so game changes show up without rebuilding
// the app); otherwise use the copy packed inside the app.
function gameDir() {
  const live = [
    path.resolve(path.dirname(process.execPath), '..', '..', '..', 'www'),   // desktop/dist/FNAF Siege-win32-x64/ -> FnafSiege/www
    path.resolve(__dirname, '..', 'www'),                                     // running with `npm start`
  ];
  for (const d of live) if (fs.existsSync(path.join(d, 'index.html'))) return d;
  return path.join(__dirname, 'www');
}

function createWindow() {
  const dir = gameDir();
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 800, minHeight: 450,
    title: 'FNAF Siege',
    icon: path.join(dir, 'img', 'icon.ico'),
    backgroundColor: '#07060f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  // FNAF_SIEGE_TEST=1 keeps the window hidden (the automated tests drive it over the debugging port)
  if (!process.env.FNAF_SIEGE_TEST) win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // F11 = full screen
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadFile(path.join(dir, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
