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

// A small solid-colour PNG, for logo and photo uploads.
function makePng(hex) {
  const zlib = require('node:zlib');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const w = 64, h = 64, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const edge = x < 6 || y < 6 || x > 57 || y > 57; raw[o] = edge ? 255 : r; raw[o + 1] = edge ? 255 : g; raw[o + 2] = edge ? 255 : b; }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Agent/weapon art loads from media.valorant-api.com; sandboxes without internet cannot fetch it.
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 400/.test(m.text()) && errors.push(m.text()));
  let n = 0;
  const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
  const rail = (name) => page.locator('nav.rail').getByRole('button', { name }).click();
  const btn = (name, opts) => page.getByRole('button', { name, ...opts }).first().click();

  await page.goto(`${HOST}/?host=${HOST}`);
  // First run: the New match wizard opens by itself.
  const wizard = page.getByRole('dialog', { name: 'New match' });
  await wizard.waitFor();
  await shot('wizard-game');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  // Teams: names, colours and logos.
  const png = (hex) => { const fs = require('node:fs'); const f = path.join(OUT, `img-${hex.slice(1)}.png`); fs.writeFileSync(f, require('node:zlib') && makePng(hex)); return f; };
  const teamCards = wizard.locator('.team-card');
  await teamCards.nth(0).getByLabel('Team name').fill('Night Owls');
  await teamCards.nth(1).getByLabel('Team name').fill('Crimson Five');
  await teamCards.nth(0).locator('input[type=file]').setInputFiles(png('#22d3ee'));
  await teamCards.nth(1).locator('input[type=file]').setInputFiles(png('#f43f5e'));
  await teamCards.nth(1).locator('.imgpick-btn img').waitFor();
  await shot('wizard-teams');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  // Players: display names, Riot IDs and a photo (the sample match's in-game names).
  const roster = [['JUNO', 'MIRA', 'DAX', 'RIKU', 'ECHO'], ['KAIRO', 'SOL', 'VEX', 'NYX', 'ZEN']];
  for (const t of [0, 1]) {
    const rows = wizard.locator('.lineup').nth(t).locator('.player-row');
    for (let i = 0; i < 5; i++) {
      await rows.nth(i).getByLabel('Display name').fill(roster[t][i][0] + roster[t][i].slice(1).toLowerCase());
      await rows.nth(i).getByLabel('Riot ID').fill(`${roster[t][i]}#${t ? "FNC" : "PRX"}`);
    }
  }
  await wizard.locator('.lineup').nth(0).locator('.player-row').nth(0).locator('input[type=file]').setInputFiles(png('#a78bfa'));
  await wizard.locator('.lineup').nth(0).locator('.player-row .imgpick-btn img').first().waitFor();
  await shot('wizard-players');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByLabel('Play-by-play').fill('Sara Malik');
  await wizard.getByLabel('Analyst').fill('Omar Sheikh');
  await wizard.getByLabel('Event name (event bug)').fill('Community Cup');
  await wizard.getByLabel('Sponsor name').fill('Acme Energy');
  await wizard.getByRole('button', { name: 'Add', exact: true }).click();
  await shot('wizard-talent');
  await wizard.getByRole('button', { name: 'Create match' }).click();
  await wizard.waitFor({ state: 'detached' });
  await page.getByText('2 casters ready').waitFor();
  await shot('readiness-first-run');
  await page.getByRole('tab', { name: 'Teams and players' }).click();
  await shot('match-teams');
  await page.getByRole('tab', { name: 'Readiness' }).click();

  // Settings: connect OBS (software settings), then Scenes: add for me, fill the game-feed slot
  await rail('Settings');
  await page.getByLabel('Password').fill('secret');
  await btn('Connect', { exact: true });
  await page.getByText('Connected', { exact: true }).first().waitFor();
  await page.getByRole('switch', { name: 'Studio Mode' }).click();
  await page.getByText('On · takes go through Preview').waitFor();
  await shot('settings');
  await rail('Scenes');
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
  await rail('Matches');
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
  await rail('Live');
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
  await rail('Live');
  await btn('Run manually');

  // Player cameras (S5): make links, copy one, 10-up; the overlay pages show the streams and report connection.
  await rail('Live');
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
    if (name === 'cam-grid') await page.getByLabel('Player cameras').locator('.cdot.connected').first().waitFor();
    await overlay.close();
  }
  await page.getByLabel('Player cameras').getByRole('button', { name: 'In-game cams' }).click();

  await rail('Capture');
  await btn('Stop capture');
  await page.getByRole('button', { name: '4×' }).click();
  await btn('Play');
  await page.getByText(/^\d+:\d\d \/ /).waitFor();
  await page.waitForTimeout(3500);
  await shot('capture');
  await rail('Matches');
  await page.getByRole('tab', { name: 'Graphics' }).click();
  await shot('match-graphics');
  await page.getByRole('tab', { name: 'Event and sponsors' }).click();
  await page.getByLabel('Event name (on the event bug)').fill('Community Cup');
  await btn('Save');
  await page.getByText(/Night Owls vs Crimson Five · Community Cup/).first().waitFor();
  await shot('match-event');

  // Esportra (Stage 2): sign in against the stand-in backend, pick a scheduled match.
  await rail('Settings');
  await page.getByText('Not signed in').first().waitFor();
  await page.locator('#set-account').scrollIntoViewIfNeeded();
  await shot('sync-signed-out');
  await btn('Sign in');
  await page.getByRole('dialog', { name: 'Sign in to Esportra' }).waitFor();
  await page.getByRole('dialog').getByLabel('Email').fill('producer@example.com');
  await page.getByRole('dialog').getByLabel('Password').fill('wrong password');
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText(/Check your email and password/).waitFor();
  await page.getByRole('dialog').getByLabel('Password').fill('correct horse battery');
  await shot('sign-in');
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByText('Your scheduled matches').waitFor();
  await page.getByText('Community Cup').first().waitFor();
  await shot('sync-signed-in');
  await rail('Matches');
  await page.getByRole('group', { name: 'Esportra matches' }).getByRole('button', { name: /Paper Rex/ }).click();
  await page.getByRole('button', { name: /Paper Rex/ }).and(page.locator('[aria-pressed=true]')).first().waitFor();
  await page.getByText(/signed in as|Signed in as/i).first().waitFor();
  await shot('readiness-esportra');

  // Observer and player PCs (Stage 3): allow joining, then act as the capture-only PC against ourselves.
  await rail('Capture');
  await page.getByRole('switch', { name: 'Allow other PCs to join' }).click();
  await page.locator('.joincode strong').waitFor();
  const joinCode = (await page.locator('.joincode strong').innerText()).replace('-', '');
  if (!/^[A-Z2-9]{6}$/.test(joinCode)) throw new Error('unexpected join code ' + joinCode);
  await page.getByText('Joined PCs · 0').scrollIntoViewIfNeeded();
  await shot('join-panel');
  await rail('Settings');
  await page.getByRole('button', { name: 'Capture-only' }).click();
  await page.getByText('Observer PC').first().waitFor();
  await page.getByLabel('Producer’s address').fill('127.0.0.1:5301');
  await page.getByLabel('Join code').fill('WRONG2');
  await btn('Connect', { exact: true });
  await page.getByText(/join code was not accepted/).waitFor();
  await page.getByLabel('Join code').fill(joinCode.toLowerCase());
  await btn('Connect', { exact: true });
  await page.locator('.tally', { hasText: 'Connected' }).waitFor();
  await shot('capture-only');
  await btn('Disconnect');
  await btn('Switch this PC back to Production');
  await page.getByRole('button', { name: 'Capture-only' }).waitFor();
  await rail('Capture');
  await page.getByRole('switch', { name: 'Allow other PCs to join' }).click();
  await page.getByText('Joined PCs').waitFor({ state: 'detached' });
  await page.locator('.chipbar').getByRole('button', { name: /OBS/ }).click();
  await page.getByRole('dialog').waitFor();
  await shot('status-drawer');

  const loading = (await call('snapshot')).outputs.filter((o) => o.connections > 0).length;
  if (loading !== snap.outputs.length) errors.push(`only ${loading} of ${snap.outputs.length} outputs connected`);
  await browser.close();
  if (errors.length) { console.error('Problems:\n' + errors.join('\n')); process.exit(1); }
  console.log(`Walkthrough complete: ${n} screenshots in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
