// Copy only browser HUD assets into the web app. Runtime state and server files never leave Air.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../esportra-valorant-hud');
const target = path.resolve(__dirname, '../../frag-and-book-main/public/air-hud');
for (const directory of ['core', 'overlays']) {
  fs.cpSync(path.join(source, directory), path.join(target, directory), { recursive: true });
}
fs.mkdirSync(path.join(target, 'previews'), { recursive: true });
for (const filename of fs.readdirSync(path.join(source, 'overlays')).filter(name => name.endsWith('.html'))) {
  const overlayPath = path.join(target, 'overlays', filename);
  const html = fs.readFileSync(overlayPath, 'utf8').replace('</body>', '<script src="../core/setup-preview.js"></script></body>');
  fs.writeFileSync(overlayPath, html);
  const preview = filename.replace('.html', '.jpg');
  if (fs.existsSync(path.join(source, 'previews', preview))) fs.copyFileSync(path.join(source, 'previews', preview), path.join(target, 'previews', preview));
}
fs.writeFileSync(path.join(target, 'README.md'), 'These are browser assets from Esportra-Air/esportra-valorant-hud. Refresh with node tools/sync-hud-preview.cjs in Air after HUD changes. They are production preview assets, not an alternative UI design reference. Preview mode is isolated from game rooms, local storage and GEP.\n');
console.log('Synced HUD browser assets. Server, captures, credentials and runtime state excluded.');
