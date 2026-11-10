// Walks the producer journey in Chromium against dev/host.ts and saves screenshots (1600×1000, like the PRD pictures).
//   node dev/walkthrough.cjs <out dir> [host url]
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(process.argv[2] || 'walkthrough');
const HOST = process.argv[3] || 'http://127.0.0.1:5320';
fs.mkdirSync(OUT, { recursive: true });
const call = async (m) => (await fetch(`${HOST}/call/${m}`, { method: 'POST', body: '[]' })).json();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Agent/weapon art loads from media.valorant-api.com; sandboxes without internet cannot fetch it.
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()));
  let n = 0;
  const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
  const rail = (name) => page.locator('nav.rail').getByRole('button', { name }).click();
  const btn = (name, opts) => page.getByRole('button', { name, ...opts }).first().click();

  await page.goto(`${HOST}/?host=${HOST}`);
  await page.getByRole('heading', { name: 'Almost ready' }).waitFor();
  await shot('readiness-first-run');

  // Match
  await page.getByLabel('Team A').fill('Night Owls');
  await page.getByLabel('Team B').fill('Crimson Five');
  await btn('Create match');
  await page.getByText('Night Owls vs Crimson Five').first().waitFor();
  // Talent → casters drawer
  await btn('Add casters');
  await page.getByLabel('Play-by-play').fill('Sara Malik');
  await page.getByLabel('Analyst').fill('Omar Sheikh');
  await btn('Save casters');
  await page.getByText('2 casters ready').waitFor();

  // Scenes: connect + add for me
  await rail('Scenes');
  await page.getByLabel('Password').fill('secret');
  await btn('Connect', { exact: true });
  await page.getByText('Connected', { exact: true }).first().waitFor();
  await page.getByLabel(/Game feed/).selectOption('Game Capture');
  await btn('Add for me');
  await page.getByRole('button', { name: 'Update', exact: true }).waitFor();
  await shot('scenes');

  // OBS opens each browser source once
  const snap = await call('snapshot');
  const obsPages = [];
  for (const o of snap.outputs) {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    p.on('pageerror', (e) => errors.push(`${o.title}: ${e.message}`));
    await p.goto(o.url);
    obsPages.push([o, p]);
  }
  await page.waitForTimeout(2500);

  await rail('Outputs');
  await page.getByText(/9 connected|1 connected/).first().waitFor();
  await shot('outputs');

  // Readiness: start capture through its fix button
  await rail('Console');
  await btn('Start capture');
  await page.getByRole('dialog', { name: /Start game capture/ }).waitFor();
  await shot('consent');
  await btn('Allow and start capture');
  await page.getByText(/ready/).first().waitFor();
  await shot('readiness');

  // Console
  await btn('Run manually');
  await page.getByText('Waiting for game data').or(page.getByText(/R\d+/)).first().waitFor();
  await page.waitForTimeout(9000);
  await page.keyboard.press('F5');
  await page.getByText('On screen · press again to hide').waitFor();
  await page.keyboard.press('F1');
  await page.waitForTimeout(1500);
  await shot('console');
  const ingame = obsPages.find(([o]) => o.screenId === 'in-game')[1];
  await ingame.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-obs-in-game-output.png`) });
  await page.keyboard.press('F1');

  await page.keyboard.press('Control+d');
  await page.getByRole('dialog', { name: 'Fix data' }).waitFor();
  await page.getByRole('button', { name: 'Increase Night Owls' }).click();
  await shot('fix-data');
  await btn('Apply · on air now');
  await page.getByRole('dialog', { name: 'Fix data' }).waitFor({ state: 'detached' });

  await rail('Capture');
  await shot('capture');
  await rail('Sync');
  await rail('Setup');
  await shot('setup');
  await page.getByRole('tab', { name: 'Layout' }).click();
  await shot('setup-layout');
  await page.locator('.chipbar').getByRole('button', { name: /OBS/ }).click();
  await page.getByRole('dialog').waitFor();
  await shot('status-drawer');

  const loading = (await call('snapshot')).outputs.filter((o) => o.connections > 0).length;
  if (loading !== snap.outputs.length) errors.push(`only ${loading} of ${snap.outputs.length} outputs connected`);
  await browser.close();
  if (errors.length) { console.error('Problems:\n' + errors.join('\n')); process.exit(1); }
  console.log(`Walkthrough complete: ${n} screenshots in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
