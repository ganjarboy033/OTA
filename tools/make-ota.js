const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web/engine.js'), 'utf8');
const ver = +(src.match(/(?:const|let|var)\s+SV\s*=\s*(\d+)/) || [])[1];
if (!ver) throw new Error('const SV tidak ditemukan di web/engine.js');
const esbuild = require('esbuild');
const out = esbuild.transformSync(src, { minify: true, target: 'es2019', legalComments: 'none' }).code;
const dir = path.join(root, 'ota');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'bundle.js'), out);
const meta = {
  scraperVersion: ver,
  updatedAt: Date.now(),
  minAppVersion: process.argv[3] || '1.0.0',
  sourceHash: crypto.createHash('sha256').update(out, 'utf8').digest('hex'),
  changelog: process.argv[2] || ''
};
fs.writeFileSync(path.join(dir, 'scrapers-version.json'), JSON.stringify(meta, null, 2));
console.log('OK v' + ver, out.length + ' B', meta.sourceHash);
