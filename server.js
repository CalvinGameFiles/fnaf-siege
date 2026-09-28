// FNAF SIEGE on the PC: serves the game from www/ and opens it in its own app window (no browser tabs or address bar).
// No installs needed: plain Node.js. Run `node server.js --open`.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = +process.env.PORT || 8080;
const ROOT = path.join(__dirname, 'www');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/ping') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"game":"fnaf-siege"}'); }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('no'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// open the game as an app window (Chrome or Edge "--app" mode), falling back to the normal browser
function openApp() {
  const url = `http://localhost:${PORT}`;
  const profile = path.join(process.env.LOCALAPPDATA || __dirname, 'FnafSiegeWindow');
  const browsers = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  const b = browsers.find(f => f && fs.existsSync(f));
  if (b) exec(`"${b}" --app=${url} --user-data-dir="${profile}" --start-maximized --autoplay-policy=no-user-gesture-required`);
  else exec(`start "" ${url}`);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  FNAF SIEGE is running. Keep this window open while you play; close it when you are done.');
  if (process.argv.includes('--open')) openApp();
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`  The game is already running - opening another window.`);
    if (process.argv.includes('--open')) openApp();
    setTimeout(() => process.exit(0), 1500);
  } else throw e;
});
