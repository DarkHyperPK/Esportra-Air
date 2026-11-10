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

  // Scenes: connect, Studio Mode, add for me, fill the game-feed slot
  await rail('Scenes');
  await page.getByLabel('Password').fill('secret');
  await btn('Connect', { exact: true });
  await page.getByText('Connected', { exact: true }).first().waitFor();
  await page.getByRole('switch', { name: 'Studio Mode' }).click();
  await page.getByText('On · takes go through Preview').waitFor();
  await btn('Add for me');
  await page.getByRole('button', { name: 'Rebuild', exact: true }).waitFor();
  await page.getByLabel('Use an existing OBS source for Game feed').selectOption('Game Capture');
  await page.getByText('Game Capture').first().waitFor();
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
  await page.getByText(/\d of \d loading/).first().waitFor();
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
  // Switching: Preview a scene, Take it; then Cut to another
  await page.getByRole('button', { name: /^Gameplay/ }).click();
  await page.getByRole('button', { name: 'Take', exact: true }).click();
  await page.getByText(/OBS scene · Gameplay on air/).waitFor();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^Holding/ }).click();
  await page.getByRole('button', { name: 'Stinger', exact: true }).click();
  await page.getByText(/OBS scene · Holding on air/).waitFor();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^Gameplay/ }).click();
  await page.getByText('Waiting for game data').or(page.getByText(/R\d+/)).first().waitFor();
  await page.waitForTimeout(9000);
  await page.keyboard.press('F5');
  await page.getByText('On screen · press again to hide').waitFor();
  await page.keyboard.press('F1');
  await page.keyboard.press('2');           // player cards -> off
  await page.getByRole('button', { name: /^Player cards: off/ }).waitFor();
  await page.keyboard.press('2');
  await page.keyboard.press('q');           // economy -> manual
  await page.getByRole('button', { name: /Economy.*set by hand/ }).first().waitFor();
  await page.keyboard.press('F4');
  await page.getByLabel(/Short on-screen update/).fill('Map 2 starts in two minutes');
  await page.getByRole('button', { name: 'Show toast' }).click();
  await page.keyboard.press('F7');
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

  // Autopilot (S4): start, take two manual segments, let a round going live open a hold window, hold it, take now.
  await rail('Console');
  const code = (await (await fetch('http://127.0.0.1:5320/call/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[]' })).json()).match.code;
  const post = (body) => fetch(`http://127.0.0.1:5399/api/${code}/ingest/valorant`, { method: 'POST', headers: { 'X-Esportra-Key': 'dev-host-key-0123456789abcdef', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await btn('Start autopilot');
  await page.getByText('Starting soon').first().waitFor();
  await shot('autopilot-armed');
  await page.keyboard.press(' ');
  await page.getByText(/^Now$/).waitFor();
  await page.waitForFunction(() => /Starting soon/.test(document.querySelector('[aria-label="Autopilot"]')?.textContent ?? '') && /Match intro/.test(document.querySelector('.next-card')?.textContent ?? ''));
  await page.keyboard.press(' ');
  await page.waitForFunction(() => /Map 1 live/.test(document.querySelector('.next-card')?.textContent ?? ''));
  await post([{ feature: 'match_info', key: 'round_phase', data: 'shopping' }]);
  await post([{ feature: 'match_info', key: 'round_phase', data: 'combat' }]);
  await page.getByText('Taking when the ring ends').waitFor();
  await page.waitForTimeout(1500);
  await shot('autopilot-hold-window');
  await page.keyboard.press('h');
  await page.getByText(/Held by operator/).first().waitFor();
  await shot('autopilot-held');
  await page.keyboard.press('F1');
  await page.getByText(/Technical pause\./).waitFor();
  await shot('autopilot-paused');
  await btn('Resume autopilot');
  await page.getByText(/Technical pause\./).waitFor({ state: 'detached' });
  await btn('Take now');
  await page.getByText(/OBS scene · Gameplay on air/).waitFor();
  await shot('autopilot-on-air');
  await rail('Scenes');
  await page.getByText('Segment → Scene').scrollIntoViewIfNeeded();
  await shot('segments');
  await rail('Console');
  await btn('Run manually');

  // Player cameras (S5): make links, copy one, 10-up; the overlay pages show the streams and report connection.
  await rail('Console');
  await page.getByLabel('Player cameras').getByRole('button', { name: 'Make link' }).first().click();
  await page.getByLabel('Player cameras').getByRole('button', { name: 'Copy link' }).first().waitFor();
  await page.getByLabel('Player cameras').getByRole('button', { name: 'Make link' }).first().click();
  await page.getByLabel('Player cameras').getByRole('button', { name: 'Make link' }).first().click();
  await page.getByLabel('Player cameras').getByRole('button', { name: 'Copy link' }).first().click();
  await page.getByLabel('Player cameras').getByRole('button', { name: 'Copied' }).waitFor();
  await page.getByLabel('Player cameras').getByRole('button', { name: '10-up' }).click();
  await page.getByLabel('Player cameras').getByRole('button', { name: '10-up' }).and(page.locator('[aria-pressed=true]')).waitFor();
  await page.getByLabel('Player cameras').scrollIntoViewIfNeeded();
  await shot('cameras');
  for (const [name, selector] of [['cam-grid', '.camwall .cam iframe'], ['ingame', '.player-cams .cam iframe']]) {
    if (name === 'ingame') await fetch(`http://127.0.0.1:5399/control/action`, { method: 'POST', headers: { 'X-Esportra-Key': 'dev-host-key-0123456789abcdef', 'Content-Type': 'application/json' }, body: JSON.stringify({ match: code, name: 'cams.set', args: { layout: 'ingame' } }) });
    const overlay = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await overlay.goto(`http://127.0.0.1:5399/overlays/${name === 'ingame' ? 'ingame' : 'cam-grid'}.html?match=${code}&screen=1`);
    await overlay.waitForSelector(selector, { state: 'attached' });
    const srcs = await overlay.$$eval(selector, (f) => f.map((x) => x.src));
    if (srcs.length !== 3 || !srcs.every((u) => u.startsWith('https://vdo.ninja/?view=') && u.includes('noaudio'))) throw new Error(`${name}: expected 3 camera views, got ${JSON.stringify(srcs)}`);
    // A camera reporting in through VDO.Ninja's iframe API turns its window live and reaches the engine.
    await overlay.evaluate((sel) => { const f = document.querySelector(sel); window.dispatchEvent(new MessageEvent('message', { data: { action: 'view-connection', value: true }, source: f.contentWindow })); }, selector);
    await overlay.waitForTimeout(400);
    const status = await (await fetch('http://127.0.0.1:5399/control/status', { headers: { 'X-Esportra-Key': 'dev-host-key-0123456789abcdef' } })).json();
    const cams = status.rooms.find((r) => r.match === code.toUpperCase()).cams;
    if (cams.flat().filter(Boolean).length !== 1) throw new Error(`${name}: one camera should report connected, got ${JSON.stringify(cams)}`);
    if (name === 'cam-grid') { await overlay.locator('.camwall-title').waitFor({ state: 'visible' }); await overlay.waitForTimeout(1500); }
    if (name === 'cam-grid') await overlay.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-cam-wall-output.png`) });
    await overlay.close();
  }
  await page.getByLabel('Player cameras').locator('.cdot.connected').first().waitFor();
  await page.getByLabel('Player cameras').getByRole('button', { name: 'In-game cams' }).click();

  await rail('Capture');
  await btn('Stop capture');
  await page.getByRole('button', { name: '4×' }).click();
  await btn('Play');
  await page.getByText(/^\d+:\d\d \/ /).waitFor();
  await page.waitForTimeout(3500);
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
