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

// On failure, a picture of where the journey stopped.
let failShot = async () => {};

(async () => {
  const errors = [];
  const launched = await chromium.launch();
  // Agent/weapon art loads from media.valorant-api.com. Sandboxes without internet refuse it, and the
  // HUD retries failed art on every redraw, so the walkthrough runs as an offline venue: art is aborted.
  // Art not yet on this PC answers 404 at /art/ (the offline venue); any other 404 is a problem.
  const offline = async (p) => {
    await p.route(/media\.valorant-api\.com/, (r) => r.abort('internetdisconnected'));
    p.on('response', (res) => res.status() === 404 && !new URL(res.url()).pathname.startsWith('/art/') && errors.push(`404 ${res.url()}`));
    return p;
  };
  const browser = { newPage: async (o) => offline(await launched.newPage(o)), close: () => launched.close() };
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  failShot = async () => { console.error('toasts on screen:', await page.locator('.toast').allInnerTexts()); await page.screenshot({ path: path.join(OUT, 'failure.png') }); };
  // Agent/weapon art loads from media.valorant-api.com; sandboxes without internet cannot fetch it.
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 400|status of 404/.test(m.text()) && errors.push(m.text()));
  let n = 0;
  const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
  const rail = (name) => page.locator('nav.rail').getByRole('button', { name }).click();
  const btn = (name, opts) => page.getByRole('button', { name, ...opts }).first().click();
  // Types the way a person does, after a pause long enough for live updates to arrive, and checks the
  // text landed in the field that was clicked (a re-render once moved focus back to the first field).
  const typeLikeAPerson = async (scope, label, text) => {
    const field = scope.getByLabel(label, { exact: true });
    await field.click();
    await page.waitForTimeout(2500);
    await page.keyboard.type(text, { delay: 60 });
    const value = await field.inputValue();
    if (value !== text) throw new Error(`typing in ${label} landed elsewhere: "${value}"`);
  };

  await page.goto(`${HOST}/?host=${HOST}`);
  // First run (spec 4A): welcome, guest, game (no default), setup, Connect OBS, then Matches.
  await page.getByRole('heading', { name: 'Run a professional broadcast from one place.' }).waitFor();
  await shot('first-run-welcome');
  await btn('Get started');
  await page.getByRole('button', { name: 'Continue as guest' }).waitFor();
  await typeLikeAPerson(page, 'Email', 'producer@example.com');
  await typeLikeAPerson(page, 'Password', 'not sent');
  if ((await page.getByLabel('Email', { exact: true }).inputValue()) !== 'producer@example.com') throw new Error('the email changed while typing the password');
  await shot('first-run-account');
  await btn('Continue as guest');
  const cont = page.getByRole('button', { name: 'Continue', exact: true });
  if (!(await cont.isDisabled())) throw new Error('Continue must wait until a game is chosen');
  if (await page.getByRole('radio', { checked: true }).count()) throw new Error('No game may be chosen by default');
  await page.getByRole('radio', { name: /Valorant/ }).click();
  await page.getByText('What Air shows for Valorant').waitFor();
  await shot('first-run-game');
  await cont.click();
  await page.getByRole('radio', { name: /With player PCs/ }).click();
  await shot('first-run-setup');
  await cont.click();
  await page.getByLabel('Password').fill('secret');
  await btn('Connect', { exact: true });
  await page.getByText(/^Connected to OBS/).waitFor();
  await shot('first-run-obs');
  await btn('Finish');
  // No event yet: Air opens on Event, the first thing to set up (never on Live).
  await page.getByRole('button', { name: 'Create event' }).waitFor();
  await shot('first-landing-event');
  // The game for the whole app: a menu beside the product name.
  await page.getByRole('button', { name: /^Valorant/ }).click();
  await page.getByRole('menu', { name: 'Game for the whole app' }).waitFor();
  await shot('game-switcher');
  await page.keyboard.press('Escape');

  // Event first (build step 3): identity, the people on air and the sponsors every match uses.
  await page.getByLabel('Event name').fill('Community Cup');
  await btn('Create event');
  await page.getByRole('heading', { name: 'Community Cup' }).waitFor();
  await page.getByLabel('Stages').fill('Groups, Playoffs, Grand final');
  await btn('Save', { exact: true });
  await page.getByText('Groups · Playoffs · Grand final').waitFor();
  const editor = (name) => page.getByRole('dialog', { name });
  await btn('Add person');
  await editor('Add a person').getByLabel('Name on air').fill('Sara Malik');
  await editor('Add a person').getByLabel('Handle').fill('@saram');
  await editor('Add a person').getByRole('button', { name: 'Save' }).click();
  await editor('Add a person').waitFor({ state: 'detached' });
  await btn('Add person');
  await editor('Add a person').getByLabel('Name on air').fill('Omar Sheikh');
  await editor('Add a person').getByLabel('Role').selectOption('analyst');
  await editor('Add a person').getByRole('button', { name: 'OBS source' }).click();
  await editor('Add a person').getByLabel('OBS source').fill('Game Capture');
  await editor('Add a person').getByRole('button', { name: 'Save' }).click();
  await editor('Add a person').waitFor({ state: 'detached' });
  await page.locator('.talent-row').filter({ hasText: 'Sara Malik' }).getByRole('button', { name: 'Edit' }).click();
  await editor('Sara Malik').getByLabel('Camera link').waitFor();
  await shot('event-person-editor');
  await editor('Sara Malik').getByRole('button', { name: 'Cancel' }).click();
  await btn('Add sponsor');
  await editor('Add a sponsor').getByLabel('Name').fill('Acme Energy');
  await editor('Add a sponsor').getByRole('button', { name: 'Title sponsor' }).click();
  await editor('Add a sponsor').getByLabel('Read').fill('This match is brought to you by Acme Energy.');
  await shot('event-sponsor-editor');
  await editor('Add a sponsor').getByRole('button', { name: 'Save' }).click();
  await editor('Add a sponsor').waitFor({ state: 'detached' });
  await page.getByText('Half the slots or more').waitFor();
  await shot('event');

  await rail('Matches');
  await page.getByRole('heading', { name: 'Set up your first show' }).waitFor();
  await shot('first-show');
  await btn('New match', { exact: true });
  const wizard = page.getByRole('dialog', { name: 'New match' });
  await wizard.waitFor();
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
      await rows.nth(i).getByLabel('In-game name').fill(`${roster[t][i]}#${t ? "FNC" : "PRX"}`);
    }
  }
  await wizard.locator('.lineup').nth(0).locator('.player-row').nth(0).locator('input[type=file]').setInputFiles(png('#a78bfa'));
  await wizard.locator('.lineup').nth(0).locator('.player-row .imgpick-btn img').first().waitFor();
  await shot('wizard-players');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  // The event step: the match joins Community Cup; its people come from the event.
  await wizard.getByLabel('Stage on air').fill('Playoffs');
  await wizard.getByText('Sara Malik, Omar Sheikh · 1 sponsor.', { exact: false }).waitFor();
  await shot('wizard-event');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByRole('radio', { name: /Impact/ }).click();
  await page.waitForTimeout(2500);
  await shot('wizard-graphics');
  await wizard.getByRole('button', { name: 'Create match and rehearse' }).click();
  // Step 6: the match rehearses privately at 4x, autopilot firing (intro, back to the game, halftime, result).
  await wizard.getByRole('button', { name: 'Play rehearsal' }).waitFor();
  await shot('wizard-rehearse-ready');
  await wizard.getByRole('group', { name: 'Rehearsal speed' }).getByRole('button', { name: '4×' }).click();
  await wizard.getByRole('button', { name: 'Play rehearsal' }).click();
  await wizard.getByText('→ Map 1 · halftime').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1200);
  await shot('wizard-rehearse-halftime');
  await wizard.getByText('→ Map 1 · result').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot('wizard-rehearse-map-result');
  await wizard.getByRole('button', { name: 'Finish · Readiness' }).click();
  await wizard.waitFor({ state: 'detached' });
  await page.getByText('Sara Malik, Omar Sheikh · 1 sponsor').waitFor();
  await shot('readiness-first-run');
  await page.getByRole('tab', { name: 'Teams and players' }).click();
  await shot('match-teams');
  await page.locator('.lineup-row').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make a camera link' }).waitFor();
  await shot('player-editor');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('tab', { name: 'Talent and sponsors' }).click();
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match' }).click();
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match', checked: false }).waitFor();
  await shot('match-talent');
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match' }).click();
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match', checked: true }).waitFor();
  await btn('← Matches');
  await page.locator('.mrow').first().waitFor();
  await shot('matches');
  await page.locator('.mrow').first().click();
  await page.getByRole('tab', { name: 'Rehearse' }).click();
  await page.getByRole('region', { name: 'Rehearse' }).waitFor();
  await page.waitForTimeout(1500);
  await shot('match-rehearse');
  await page.getByRole('tab', { name: 'Readiness' }).click();
  // Art: this sandbox cannot reach media.valorant-api.com, so Readiness offers to download again.
  await page.getByText(/pictures are not on this PC yet/).waitFor({ timeout: 30_000 });

  // HUD library: live previews with this match's teams.
  await rail('Library');
  await page.getByRole('heading', { name: 'Graphics packs' }).waitFor();
  await page.waitForTimeout(3000);
  await shot('library');
  await btn('Open Esportra Broadcast pack');
  const pack = page.getByRole('dialog', { name: 'Esportra Broadcast pack' });
  await pack.getByRole('option', { name: /Map result/ }).click();
  await page.waitForTimeout(2500);
  await shot('pack-window');
  // Win probability starts out of the show: add it, see it under "In my show", remove it again.
  await pack.getByRole('option', { name: /Win probability/ }).click();
  await pack.getByRole('button', { name: 'Add to my show' }).click();
  await pack.getByRole('button', { name: /In my show ✓/ }).waitFor();
  await pack.getByRole('button', { name: 'In my show', exact: true }).click();
  await pack.getByRole('option', { name: /Win probability/ }).waitFor();
  if (await pack.getByRole('option', { name: /Agent select/ }).count() !== 1) throw new Error('Agent select is in the show by default');
  await shot('pack-in-my-show');
  await pack.getByRole('button', { name: /In my show ✓/ }).click();
  await pack.getByRole('option', { name: /Win probability/ }).waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');

  // Settings: connect OBS (software settings), then Scenes: add for me, fill the game-feed slot
  // OBS was connected in first run; Settings shows the connection.
  await rail('Settings');
  await page.getByText('Connected', { exact: true }).first().waitFor();
  await shot('settings');
  await rail('OBS');
  await btn('Add for me');
  await page.getByRole('button', { name: 'Rebuild scenes', exact: true }).waitFor();
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

  await rail('OBS');
  await page.getByRole('tab', { name: 'Browser sources' }).click();
  await page.getByText(/\d of \d connected/).first().waitFor();
  await shot('outputs');

  // Go live (build step 5): My show to OBS, game data only with the consent tick, autopilot off for
  // the manual part of the journey. It never starts the stream.
  await rail('Matches');
  await page.getByText(/ready$/).first().waitFor();
  await shot('readiness');
  await btn('Go live', { exact: true });
  const golive = page.getByRole('dialog', { name: 'Go live' });
  await golive.getByText('Send ').first().waitFor();
  await golive.getByRole('switch', { name: 'Autopilot' }).click();
  await golive.getByRole('checkbox').check();
  await shot('go-live');
  await golive.getByRole('button', { name: 'Go live', exact: true }).click();
  await golive.getByRole('button', { name: 'Open Live' }).waitFor();
  await golive.getByText('Now start your stream in OBS.').waitFor();
  await shot('go-live-done');
  if (!(await call('snapshot')).obs.scenes.every((x) => x.inObs)) throw new Error('Go live did not put every scene in OBS');

  // Live, graphics only: changes are cued (Cued monitor), Space takes them, F7 takes behind the stinger.
  await golive.getByRole('button', { name: 'Open Live' }).click();
  await page.getByText(/Nothing cued/).waitFor();
  await page.getByText('Waiting for game data').or(page.getByText(/Round \d+/)).first().waitFor();
  await page.waitForTimeout(9000);
  await page.keyboard.press('F5');          // caster lower third -> cued
  await page.locator('.cue-chip', { hasText: 'Caster lower third' }).waitFor();
  // All graphics (Ctrl G): every layer with its key; the layer keys work with it open or closed.
  await page.keyboard.press('Control+g');
  const drawer = page.getByRole('dialog', { name: 'All graphics' });
  await page.keyboard.press('2');           // player cards: on -> cued off
  await drawer.getByRole('button', { name: /^Player cards: on, cued off/ }).waitFor();
  await page.keyboard.press('q');           // economy board -> cued
  await drawer.getByRole('button', { name: /^Economy board: auto, cued/ }).waitFor();
  await shot('all-graphics');
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
  await page.waitForTimeout(2500);
  await shot('live-cued');
  await page.keyboard.press(' ');           // Take
  await page.getByText(/Nothing cued/).waitFor();
  await page.getByText('On screen · press again to hide').waitFor();
  await page.keyboard.press('Control+g');
  await drawer.getByRole('button', { name: /^Economy board: \w+, set by hand/ }).first().waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('2');           // player cards back on, cued
  await page.keyboard.press('F4');
  await page.getByLabel(/Short on-screen update/).fill('Map 2 starts in two minutes');
  await page.getByRole('button', { name: 'Show toast' }).click();
  await page.locator('.cue-chip', { hasText: 'Toast' }).waitFor();
  await page.keyboard.press('F7');          // stinger take: the wipe plays, the cue lands behind it
  await page.getByText(/Nothing cued/).waitFor();
  await page.keyboard.press('F1');          // pauses go straight on air
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }));
  await shot('live');
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
  await page.locator('.next-card').getByText('Match intro', { exact: true }).waitFor();
  await shot('autopilot-armed');
  await page.keyboard.press(' ');           // Space takes the waiting step: the intro goes up full screen
  await page.waitForFunction(() => /Map 1 · back to the game/.test(document.querySelector('.next-card')?.textContent ?? ''));
  await page.waitForTimeout(2500);
  await shot('autopilot-intro-on-air');
  await post([{ feature: 'match_info', key: 'round_phase', data: 'shopping' }]);
  await post([{ feature: 'match_info', key: 'round_phase', data: 'combat' }]);
  await page.getByText('Taking when the ring ends').waitFor();
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
  await page.waitForFunction(() => /Map 1 · halftime/.test(document.querySelector('.next-card')?.textContent ?? ''));
  await page.waitForTimeout(1500);
  await shot('autopilot-back-to-game');
  // Matches › Autopilot: how it works, presets, every step as a sentence (locked while running).
  await rail('Matches');
  await page.getByRole('tab', { name: 'Autopilot' }).click();
  await page.getByText('A hold window counts down').waitFor();
  await shot('autopilot-rules-running');
  await rail('Live');
  await page.getByLabel('Autopilot').getByRole('button', { name: 'Run manually' }).click();
  await rail('Matches');
  await page.getByRole('tab', { name: 'Autopilot' }).click();
  await page.getByRole('radio', { name: /Results only/ }).click();
  await page.getByRole('radio', { name: /Results only/, checked: true }).waitFor();
  await shot('autopilot-presets');
  await page.getByRole('radio', { name: /Standard show/ }).click();
  await page.getByRole('radio', { name: /Standard show/, checked: true }).waitFor();
  await page.getByRole('tab', { name: 'Readiness' }).click();

  // Player cameras (S5): make links, copy one, 10-up; the overlay pages show the streams and report connection.
  await rail('Devices');
  await page.getByRole('tab', { name: 'Cameras' }).click();
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

  await rail('Devices');
  await page.getByRole('tab', { name: 'Game data' }).click();
  await btn('Stop capture');
  await page.getByRole('button', { name: '4×' }).click();
  await btn('Play');
  await page.getByText(/^\d+:\d\d \/ /).waitFor();
  await page.waitForTimeout(3500);
  await shot('capture');
  await rail('Matches');
  await page.getByRole('tab', { name: 'My show' }).click();
  await page.getByRole('heading', { name: 'ESPORTRA · Full screen' }).waitFor();
  await shot('my-show');
  await btn('Add from the Library');
  await page.getByRole('dialog', { name: 'Esportra Broadcast pack' }).waitFor();
  await page.keyboard.press('Escape');
  await rail('Event');
  await page.getByLabel('Name', { exact: true }).fill('Community Cup Finals');
  await btn('Save', { exact: true });
  await page.locator('.crumbs').filter({ hasText: /Night Owls vs Crimson Five\s*· Community Cup Finals/ }).waitFor();
  await shot('match-event');

  // Esportra (Stage 2): sign in against the stand-in backend, pick a scheduled match.
  await rail('Settings');
  await page.getByText('Not signed in').first().waitFor();
  await page.locator('#set-account').scrollIntoViewIfNeeded();
  await shot('sync-signed-out');
  await btn('Sign in');
  await page.getByRole('dialog', { name: 'Sign in to Esportra' }).waitFor();
  await page.getByRole('dialog').getByLabel('Email').fill('producer@example.com');
  // The bug you reported: clicking Password jumped back to Email. Type the way a person does.
  await typeLikeAPerson(page.getByRole('dialog'), 'Password', 'wrong password');
  if ((await page.getByRole('dialog').getByLabel('Email').inputValue()) !== 'producer@example.com') throw new Error('the email changed while typing the password');
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
  await btn('← Matches');
  await page.locator('.mrow').filter({ hasText: 'Paper Rex' }).first().waitFor();
  await shot('matches-with-esportra');
  // Switching match changes every graphic on air, so it is refused while game data or a test round runs.
  const callWith = (m, args = []) => fetch(`${HOST}/call/${m}`, { method: "POST", body: JSON.stringify(args) });
  await callWith('testRound', ['start']);
  for (let i = 0; i < 50 && !(await call('snapshot')).gameLocked; i++) await page.waitForTimeout(200);
  await page.locator('.mrow').filter({ hasText: 'Paper Rex' }).first().click();
  await page.getByText('Stop game data or the test round before switching matches.').first().waitFor();
  await callWith("testRound", ["stop"]);
  await callWith("stopCapture");
  for (let i = 0; i < 50 && (await call('snapshot')).gameLocked; i++) await page.waitForTimeout(200);
  await page.locator('.mrow').filter({ hasText: 'Paper Rex' }).first().click();
  await page.locator('.tl-name').filter({ hasText: 'Paper Rex' }).first().waitFor();
  await page.getByText(/signed in as|Signed in as/i).first().waitFor();
  await shot('readiness-esportra');

  // Observer and player PCs (Stage 3): allow joining, then act as the capture-only PC against ourselves.
  await rail('Devices');
  await page.getByRole('switch', { name: 'Allow other PCs to join' }).click();
  await page.locator('.joincode strong').waitFor();
  const joinCode = (await page.locator('.joincode strong').innerText()).replace('-', '');
  if (!/^[A-Z2-9]{6}$/.test(joinCode)) throw new Error('unexpected join code ' + joinCode);

  // Check-in (build step 6): the observer's game lists ten players; Juno's own PC joins and sends her
  // health. Her seat turns live by itself, matched by her player id; the other nine say why not.
  const roomCode = (await call('snapshot')).match.code;
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const names = [['Juno', 'Mira', 'Dax', 'Riku', 'Echo'], ['Kairo', 'Sol', 'Vex', 'Nyx', 'Zen']];
  const board = names.flatMap((team, t) => team.map((name, i) => ({ feature: 'match_info', key: `scoreboard_${t * 5 + i}`, data: JSON.stringify({ player_id: uuid(t * 5 + i), name: `${name} #EU1`, character: 'Clay', team: t, alive: true, money: 800 }) })));
  await fetch(`http://127.0.0.1:5399/api/${roomCode}/ingest/valorant`, { method: 'POST', headers: { 'X-Esportra-Key': 'dev-host-key-0123456789abcdef', 'Content-Type': 'application/json' }, body: JSON.stringify(board) });
  const WebSocket = require('ws');
  const juno = new WebSocket(`ws://127.0.0.1:5301/join?code=${joinCode}&role=player&name=JUNO-PC`);
  await new Promise((r) => juno.once('message', r));
  const sendMe = () => juno.send(JSON.stringify({ type: 'valorant', message: { feature: 'me', info: { me: { health: '80' } }, playerId: uuid(0) } }));
  sendMe();
  const beat = setInterval(sendMe, 1000);
  await page.locator('.seat.live').filter({ hasText: 'JUNO' }).or(page.locator('.seat.live').filter({ hasText: 'Juno' })).first().waitFor();
  await page.getByText(/Player PCs · 1 of 10 checked in/).waitFor();
  await page.locator('.seat').filter({ hasText: 'JUNO-PC' }).waitFor();
  // Earlier steps failed on purpose (a wrong password, a refused switch); clear their notes.
  for (const close of await page.locator('.toast button').all()) await close.click().catch(() => {});
  await shot('devices-checkin');
  await page.getByRole('tab', { name: 'Cameras' }).click();
  await shot('devices-cameras');
  await page.getByRole('tab', { name: 'Check-in' }).click();
  clearInterval(beat);
  juno.close();
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
  await rail('Devices');
  await page.getByRole('switch', { name: 'Allow other PCs to join' }).click();
  await page.getByText('Joined PCs').waitFor({ state: 'detached' });
  await page.locator('.topbar').getByRole('button', { name: /^OBS:/ }).click();
  await page.getByRole('dialog').waitFor();
  await shot('status-drawer');
  await page.keyboard.press('Escape');

  // Search and go to anything (Ctrl+K), and the keyboard help (?).
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search' }).fill('rehe');
  await shot('command-palette');
  await page.keyboard.press('Enter');
  await page.getByRole('region', { name: 'Rehearse' }).waitFor();
  await page.keyboard.press('?');
  await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
  await shot('keyboard-help');
  await page.keyboard.press('Escape');

  // Help: the manual by situation, with this PC's keys; Save as PDF prints the same source.
  await page.locator('nav.rail').getByRole('button', { name: 'Help' }).click();
  await page.getByRole('heading', { name: 'Running a show' }).waitFor();
  await page.getByRole('button', { name: 'When something breaks' }).click();
  await page.getByText(/A player PC drops/).waitFor();
  await shot('manual');
  await btn('Save as PDF');
  await page.getByText(/^Saved: .*manual\.pdf$/).waitFor({ timeout: 30_000 });
  const pdf = (await page.getByText(/^Saved: /).innerText()).replace('Saved: ', '');
  const head = fs.readFileSync(pdf).subarray(0, 5).toString();
  if (head !== '%PDF-' || fs.statSync(pdf).size < 20_000) throw new Error(`the manual PDF looks wrong: ${head} ${fs.statSync(pdf).size} bytes`);

  // Settings › Keyboard: Tech pause moves to F10; Timeout cannot take it without a swap; F10 works on Live.
  await rail('Settings');
  await page.locator('#set-keys').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Change the key for Tech pause' }).click();
  await page.keyboard.press('F10');
  await page.locator('#set-keys').getByText('F10', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Change the key for Timeout' }).click();
  await page.keyboard.press('F10');
  await page.getByRole('alert').filter({ hasText: 'F10 is already Tech pause' }).waitFor();
  await shot('keyboard');
  await page.getByRole('button', { name: 'Pick another' }).click();
  await rail('Live');
  await page.keyboard.press('F10');
  await page.getByText('On screen · press again to resume').waitFor();
  await page.keyboard.press('F10');
  await page.getByText('On screen · press again to resume').waitFor({ state: 'detached' });
  await call('resetKeys');

  // A laptop screen: every main page at 1280x800.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [name, label] of [['laptop-live', 'Live'], ['laptop-matches', 'Matches'], ['laptop-library', 'Library'], ['laptop-obs', 'OBS'], ['laptop-devices', 'Devices'], ['laptop-settings', 'Settings']]) {
    await rail(label);
    await page.waitForTimeout(900);
    await shot(name);
  }

  const loading = (await call('snapshot')).outputs.filter((o) => o.connections > 0).length;
  if (loading !== snap.outputs.length) errors.push(`only ${loading} of ${snap.outputs.length} outputs connected`);
  await browser.close();
  if (errors.length) { console.error('Problems:\n' + errors.join('\n')); process.exit(1); }
  console.log(`Walkthrough complete: ${n} screenshots in ${OUT}`);
})().catch(async (e) => { console.error(e); await failShot().catch(() => {}); process.exit(1); });
