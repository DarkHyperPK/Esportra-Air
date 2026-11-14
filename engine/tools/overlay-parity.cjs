#!/usr/bin/env node
// Renders HUD overlays from the JavaScript server and the Rust engine with the same state and
// compares them pixel by pixel in Chromium.
//
//   node engine/tools/overlay-parity.cjs [path/to/air-engine] [--out dir]
//
// Both servers load the HUD's demo state (PUT /api/<match> with an empty body); the browser clock
// is pinned so countdowns match. Exits non-zero if any overlay differs or logs a page error.
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const HUD = path.resolve(__dirname, '../../esportra-valorant-hud');
const ENGINE = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../target/release/air-engine');
const OUT = process.argv.includes('--out') ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : null;
const KEY = 'parity-key-0123456789';
const MATCH = 'PARITY';
const OVERLAYS = ['scorebug', 'ingame', 'killfeed', 'scoreboard', 'player-cards', 'map-veto', 'series', 'casters', 'starting-soon', 'economy', 'round-history', 'map-result', 'team-roster-a', 'match-intro'];
const FIXED_TIME = new Date('2026-11-10T12:00:00Z');

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start: ' + url);
}

async function main() {
  const dataJs = fs.mkdtempSync(path.join(require('os').tmpdir(), 'parity-js-'));
  const dataRs = fs.mkdtempSync(path.join(require('os').tmpdir(), 'parity-rs-'));
  const js = await require(path.join(HUD, 'server/server.js')).start({ port: 0, key: KEY, root: HUD, dataDir: dataJs });
  const rs = spawn(ENGINE, ['--root', HUD, '--data', dataRs, '--port', '0'], { env: { ...process.env, AIR_ENGINE_KEY: KEY }, stdio: ['ignore', 'pipe', 'inherit'] });
  const rsPort = await new Promise((resolve, reject) => {
    rs.stdout.once('data', (d) => { try { resolve(JSON.parse(String(d).split('\n')[0]).port); } catch (e) { reject(e); } });
    rs.once('exit', (code) => reject(new Error('engine exited ' + code)));
  });
  const bases = { js: `http://127.0.0.1:${js.port}`, rust: `http://127.0.0.1:${rsPort}` };
  await waitFor(bases.rust + '/health');
  for (const base of Object.values(bases)) {
    const res = await fetch(`${base}/api/${MATCH}`, { method: 'PUT', headers: { 'X-Esportra-Key': KEY, 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) throw new Error(`${base}: PUT failed ${res.status}`);
  }

  const browser = await chromium.launch();
  const failures = [];
  const results = [];
  try {
    for (const overlay of OVERLAYS) {
      const shots = {}, errors = [];
      for (const [name, base] of Object.entries(bases)) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
        // The JS server points pictures at Riot's server; the engine at its own /art/ cache. Neither is
        // part of what is compared, so pictures from Riot's server are blocked for both.
        await page.route(/media\.valorant-api\.com/, (r) => r.abort());
        await page.clock.setFixedTime(FIXED_TIME);
        page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
        await page.goto(`${base}/overlays/${overlay}.html?match=${MATCH}&bg=1`, { waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(2500);
        shots[name] = await page.screenshot({ type: 'png' });
        const connected = await page.evaluate(() => typeof window.HUD === 'object' && !!window.HUD.state);
        if (!connected) errors.push(`${name}: HUD client did not receive state`);
        await page.close();
      }
      const cmp = await browser.newPage();
      const diff = await cmp.evaluate(async ([a, b]) => {
        const load = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(ia, 0, 0); const da = ctx.getImageData(0, 0, c.width, c.height).data;
        ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(ib, 0, 0); const db = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++;
        return n / (c.width * c.height);
      }, [shots.js, shots.rust].map((b) => 'data:image/png;base64,' + b.toString('base64')));
      await cmp.close();
      if (OUT) { fs.mkdirSync(OUT, { recursive: true }); for (const [n, b] of Object.entries(shots)) fs.writeFileSync(path.join(OUT, `${overlay}-${n}.png`), b); }
      const pct = (diff * 100).toFixed(3);
      results.push(`${overlay.padEnd(16)} ${pct.padStart(7)}% pixels differ${errors.length ? '  errors: ' + errors.join('; ') : ''}`);
      if (diff > 0.001 || errors.length) failures.push(overlay);
    }
  } finally {
    await browser.close();
    js.stop();
    rs.kill();
  }
  console.log(results.join('\n'));
  if (failures.length) { console.error('Differences: ' + failures.join(', ')); process.exitCode = 1; } else console.log(`All ${OVERLAYS.length} overlays render identically.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
