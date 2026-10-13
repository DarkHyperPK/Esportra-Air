// Verify distributable contents and load packaged native/runtime dependencies.
// This does not install the app, start game capture, or contact live services.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'dist/win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const entries = asar.listPackage(archive).map(name => name.split('\\').join('/'));
for (const file of ['/src/main.js', '/src/preload.js', '/src/renderer/app.js', '/assets/icon.ico']) {
  assert.ok(entries.includes(file), `Missing packaged file: ${file}`);
}
const forbidden = entries.filter(name => /(^|\/)\.env(\.|$)|\.ndjson$|\/server\/data\/|\/design\/|\/\.claude\//.test(name));
assert.deepEqual(forbidden, [], 'Protected data or design sources must not ship');
const capture = path.join(resources, 'app.asar.unpacked/esportra-valorant-hud/capture/overwolf-valorant');
assert.ok(fs.existsSync(path.join(capture, 'node_modules/@overwolf/ow-electron/dist/electron.exe')));
assert.ok(fs.existsSync(path.join(capture, 'node_modules/ws/index.js')));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'air-package-probe-'));
try {
  const entry = path.join(temporary, 'probe.cjs');
  fs.writeFileSync(entry, `
    const {app} = require('electron');
    app.setPath('userData', ${JSON.stringify(temporary)});
    try {
      const bundled = require('node:module').createRequire(${JSON.stringify(path.join(archive, 'package.json'))});
      const modules = ['keytar', '@microsoft/signalr', 'obs-websocket-js', 'node-fetch', 'ws', 'dotenv'];
      for (const name of modules) bundled(name);
      console.log('PACKAGED_MODULES_OK');
      app.exit(0);
    } catch (error) { console.error(error.message); app.exit(1); }
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [entry], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, `Packaged dependency probe failed: ${result.error?.message || result.stderr}`);
  assert.ok(result.stdout.includes('PACKAGED_MODULES_OK'));
  const installer = path.join(root, 'dist/Esportra Air Setup 0.1.0.exe');
  const bytes = fs.readFileSync(installer);
  const report = { package: 'passed', nativeRuntimeDependencies: 'passed', captureSdkIncluded: true, protectedEntries: 0,
    installer: path.basename(installer), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    signed: false, installed: false, liveGameTested: false };
  const reportPath = path.join(root, 'docs/audits/product-smoke/package-result.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  assert.equal(path.dirname(temporary), os.tmpdir());
  assert.ok(path.basename(temporary).startsWith('air-package-probe-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
