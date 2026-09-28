// Builds the Windows app:  desktop/dist/FNAF Siege-win32-x64/FNAF Siege.exe      (run: npm run build)
// Assembled by hand from the Electron that `npm install` already unpacked (electron-packager's unzip step
// silently dies under Node 26), then the .exe gets FNAF Siege's name and icon with rcedit.
'use strict';
const fs = require('fs');
const path = require('path');

(async () => {
  const here = __dirname, www = path.join(here, '..', 'www');
  const outDir = path.join(here, 'dist', 'FNAF Siege-win32-x64');
  const electronDist = path.join(here, 'node_modules', 'electron', 'dist');
  if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) throw new Error('run `npm install` in desktop/ first');

  // don't pull the app apart while it is open (Windows locks its files, and a half-deleted app won't start)
  const running = require('child_process').execSync('tasklist /FI "IMAGENAME eq FNAF Siege.exe" /NH').toString();
  if (running.includes('FNAF Siege.exe')) throw new Error('FNAF Siege is open - close the game, then build again');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(electronDist, outDir, { recursive: true });
  fs.rmSync(path.join(outDir, 'resources', 'default_app.asar'), { force: true });
  const exe = path.join(outDir, 'FNAF Siege.exe');
  fs.renameSync(path.join(outDir, 'electron.exe'), exe);

  // the app itself: main.js + package.json + a copy of the game (used if the project's www/ folder isn't found)
  const app = path.join(outDir, 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  fs.copyFileSync(path.join(here, 'main.js'), path.join(app, 'main.js'));
  const pkg = require('./package.json');
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: 'main.js' }, null, 2));
  fs.cpSync(www, path.join(app, 'www'), { recursive: true });

  const rcedit = require('rcedit');
  await (rcedit.rcedit || rcedit)(exe, {
    icon: path.join(www, 'img', 'icon.ico'),
    'file-version': pkg.version, 'product-version': pkg.version,
    'version-string': { ProductName: 'FNAF Siege', FileDescription: 'FNAF Siege', CompanyName: 'CalvinGameFiles', OriginalFilename: 'FNAF Siege.exe' },
  });
  console.log('built:', exe);
})().catch(e => { console.error(e); process.exit(1); });
