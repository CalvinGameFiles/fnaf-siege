// tiny splice helper: node scripts/patch.js <file> <patchfile.json>  (json: [[old, new], ...]; every old must match exactly once)
const fs = require('fs');
const [file, pf] = process.argv.slice(2);
let s = fs.readFileSync(file, 'utf8');
for (const [a, b] of JSON.parse(fs.readFileSync(pf, 'utf8'))) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error(`expected 1 match, got ${n}: ${a.slice(0, 90)}`); process.exit(1); }
  s = s.replace(a, () => b);
}
fs.writeFileSync(file, s);
console.log('patched', file);
