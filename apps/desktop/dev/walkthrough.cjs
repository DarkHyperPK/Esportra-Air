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
    await p.route(/vdo\.ninja/, (r) => r.abort('internetdisconnected'));
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
  // A step of the open match (approved 12 Nov: the match is the hub). From anywhere: Events, the
  // selected match's event, then the match.
  const step = async (name) => {
    const steps = page.getByRole('navigation', { name: 'Match steps' });
    if (!(await steps.count())) {
      await rail('Events');
      await page.locator('.ev-card, .ev-match').first().waitFor();
      if (await page.locator('.ev-card').count()) {
        const cur = page.locator('.ev-card[aria-current="true"]');
        await ((await cur.count()) ? cur : page.locator('.ev-card')).first().click();
      }
      const cur = page.locator('.ev-match[aria-current="true"]');
      await ((await cur.count()) ? cur : page.locator('.ev-match')).first().getByRole('button', { name: 'Open' }).click();
      // Opening waits for the engine to switch match; wait for the match itself.
      await steps.waitFor();
    }
    await steps.getByRole('button', { name, exact: true }).click();
  };
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
  // No event yet: Air opens on Events, the top of the tree (never on Live).
  await page.getByRole('heading', { name: 'Set up your first event' }).waitFor();
  await shot('first-landing-event');
  // The game for the whole app: a menu beside the product name.
  await page.getByRole('button', { name: /^Valorant/ }).click();
  await page.getByRole('menu', { name: 'Game for the whole app' }).waitFor();
  await shot('game-switcher');
  await page.keyboard.press('Escape');

  // Event first (build step 3): identity, the people on air and the sponsors every match uses.
  await page.getByLabel('New event name').fill('Community Cup');
  await btn('New event');
  await page.locator('.ev-card').filter({ hasText: 'Community Cup' }).click();
  await page.getByRole('heading', { name: 'Community Cup' }).waitFor();
  await page.getByRole('tab', { name: 'Branding' }).click();
  await page.getByLabel('Stages').fill('Groups, Playoffs, Grand final');
  await btn('Save', { exact: true });
  await page.getByText('Groups · Playoffs · Grand final').waitFor();
  const editor = (name) => page.getByRole('dialog', { name });
  await page.getByRole('tab', { name: 'Talent and sponsors' }).click();
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

  await page.getByRole('tab', { name: 'Matches' }).click();
  await page.getByText('No matches in this event yet.').waitFor();
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
  // The event line: started inside the event, so the wizard just says so; the stage sits next to it.
  await wizard.getByLabel('Stage on air').fill('Playoffs');
  await wizard.getByText('On air: Sara Malik, Omar Sheikh · 1 sponsor', { exact: false }).waitFor();
  if (await wizard.getByRole('button', { name: /Event/ }).count()) throw new Error('the Event step is gone (approved mock, 14 Nov)');
  // Screens: every screen previewed; Standard ticks the usual show; the banner style sits with the HUD.
  await wizard.getByRole('checkbox', { name: 'Match intro' }).waitFor();
  if (await wizard.getByRole('checkbox', { name: 'Map veto' }).getAttribute('aria-checked') !== 'true') throw new Error('Standard ticks the map veto');
  await wizard.getByRole('checkbox', { name: 'Standings' }).click();
  if (await wizard.getByRole('checkbox', { name: 'Standings' }).getAttribute('aria-checked') !== 'true') throw new Error('a screen can be ticked');
  await wizard.getByRole('radio', { name: 'Impact' }).click();
  await page.waitForTimeout(2500);
  await shot('wizard-screens');
  await wizard.getByRole('button', { name: 'Create match and rehearse' }).click();
  // Rehearse: one big picture and the screens just picked, in show order.
  await wizard.getByRole('button', { name: /Play/ }).first().waitFor();
  { const snap = await call('snapshot'); if (!snap.rundown.some((r) => r.show === 'standings') || !snap.rundown.some((r) => r.show === 'map-veto')) throw new Error('the ticked screens are the Rundown'); }
  await wizard.getByRole('complementary', { name: 'Your show' }).getByText('Standings').waitFor();
  await shot('wizard-rehearse-ready');
  await wizard.getByRole('group', { name: 'Rehearsal speed' }).getByRole('button', { name: '4×' }).click();
  await wizard.getByRole('button', { name: /^▶ Play/ }).click();
  await wizard.locator('.reh2-item.now', { hasText: 'Halftime' }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1200);
  await shot('wizard-rehearse-halftime');
  await wizard.locator('.reh2-item.now', { hasText: 'Map result' }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1200);
  await shot('wizard-rehearse-map-result');
  // Jump straight to a screen from Your show.
  await wizard.getByRole('complementary', { name: 'Your show' }).getByRole('button', { name: /Standings/ }).click();
  await wizard.locator('.reh2-item.now', { hasText: 'Standings' }).waitFor({ timeout: 10_000 });
  await wizard.getByRole('button', { name: 'Finish · Readiness' }).click();
  await wizard.waitFor({ state: 'detached' });
  await page.locator('[title="Sara Malik, Omar Sheikh · 1 sponsor"]').waitFor(); // a Ready chip
  await shot('readiness-first-run');
  await step('Teams/Players');
  await shot('match-teams');
  await page.locator('.lineup-pick').first().getByRole('button', { name: /^Edit / }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make a camera link' }).waitFor();
  await shot('player-editor');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  // Teams/Players (step 4): the match's teams are already there. Add a team with a logo and a player,
  // assign the player with the team dropdown, then the match picks players from the bench.
  await rail('Teams/Players');
  await page.getByRole('option', { name: /Night Owls/ }).waitFor();
  await btn('Add team');
  const teamDrawer = page.getByRole('dialog', { name: 'Add a team' });
  await teamDrawer.getByLabel('Name', { exact: true }).fill('Paper Tigers');
  await teamDrawer.locator('input[type=file]').setInputFiles(png('#22d3ee'));
  await teamDrawer.locator('.imgpick-btn img').first().waitFor();
  await teamDrawer.getByRole('button', { name: 'Save' }).click();
  await teamDrawer.waitFor({ state: 'detached' });
  await page.getByRole('option', { name: /Night Owls/ }).click();
  await shot('teams');
  await page.getByRole('tab', { name: 'Players' }).click();
  await btn('Add player');
  const playerDrawer = page.getByRole('dialog', { name: 'Add a player' });
  await playerDrawer.getByLabel('Name on air').fill('Vale');
  await playerDrawer.getByLabel(/Riot ID|In-game name/).fill('VALE#EU1');
  await playerDrawer.getByRole('button', { name: 'Save' }).click();
  await playerDrawer.waitFor({ state: 'detached' });
  await page.getByLabel('Team of Vale').selectOption({ label: 'Night Owls' });
  await page.getByLabel('Team of Vale').locator('option:checked', { hasText: 'Night Owls' }).waitFor({ state: 'attached' });
  await shot('players');
  await step('Teams/Players');
  await page.locator('.lineup-pick').filter({ hasText: 'Vale' }).getByRole('button', { name: 'Add to lineup' }).click();
  await page.locator('.lineup-pick').filter({ hasText: 'Vale' }).getByText('Sub').waitFor();
  await shot('match-teams-picked');
  await step('Talent and sponsors');
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match' }).click();
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match', checked: false }).waitFor();
  await shot('match-talent');
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match' }).click();
  await page.getByRole('switch', { name: 'Omar Sheikh on air for this match', checked: true }).waitFor();
  // Match data: the veto entered live, one map at a time, with a side for a pick; then undo.
  await step('Match data');
  await page.getByRole('group', { name: 'Map pool' }).waitFor();
  const vrows = page.locator('.md-vrow:not(.next):not(.now)');
  const vetoMap = async (name) => { const before = await vrows.count(); await page.getByRole('group', { name: 'Map pool' }).getByRole('button', { name: new RegExp(`^${name}$`) }).click(); await vrows.nth(before).waitFor(); };
  await vetoMap('Bind');
  await vetoMap('Abyss');
  await page.locator('.md-vrow.now').getByRole('button', { name: 'DEF' }).click();
  await vetoMap('Lotus');
  await page.locator('.md-vrow').nth(2).getByText('DEF').waitFor();
  await shot('match-data-veto');
  await btn('Undo last');
  await page.locator('.md-vrow.now').getByText('PICK', { exact: false }).waitFor();
  await page.getByRole('tab', { name: 'Event data' }).click();
  await btn('Add team');
  await page.getByRole('textbox', { name: 'Standings row 1 team' }).fill('NIGHT OWLS');
  await page.getByRole('textbox', { name: 'Standings row 1 W–L' }).fill('3–1');
  await btn('Add line');
  await page.getByRole('textbox', { name: 'Ticker line 1' }).fill('Night Owls lead the group');
  await btn('Save · on air');
  await page.getByRole('button', { name: 'Save · on air', disabled: true }).waitFor();
  await shot('match-data-event');
  await page.getByRole('tab', { name: 'Players' }).click();
  await shot('match-data-players');
  await page.getByRole('tab', { name: 'Show text' }).click();
  await page.getByRole('group', { name: 'Which text shows' }).getByRole('button', { name: 'Break' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Back after the break');
  await btn('Save · on air');
  await page.getByRole('button', { name: 'Save · on air', disabled: true }).waitFor();
  await shot('match-data-show');
  await btn('← Community Cup');
  await page.locator('.ev-match').first().waitFor();
  await shot('matches');
  await page.locator('.ev-match').first().getByRole('button', { name: 'Open' }).click();
  await page.getByRole('navigation', { name: 'Match steps' }).waitFor();
  await step('Rehearse');
  await page.getByRole('region', { name: 'Rehearse' }).waitFor();
  await page.waitForTimeout(1500);
  await shot('match-rehearse');
  await step('Overview');
  // Art: this sandbox cannot reach media.valorant-api.com, so Readiness offers to download again.
  await page.getByText(/pictures are not on this PC yet/).waitFor({ timeout: 30_000 });

  // HUD library: live previews with this match's teams.
  await rail('Graphics');
  await page.getByRole('heading', { name: 'Graphics packs' }).waitFor();
  await page.waitForTimeout(3000);
  await shot('library');
  await btn('Open Esportra Broadcast pack');
  const pack = page.getByRole('dialog', { name: 'Esportra Broadcast pack' });
  await pack.getByRole('option', { name: /Map result/ }).click();
  await page.waitForTimeout(2500);
  await shot('pack-window');
  // Win probability starts out of the HUD: add it, see it under "In the show", remove it again.
  await pack.getByRole('option', { name: /Win probability/ }).click();
  await pack.getByRole('button', { name: 'Add to the HUD' }).click();
  await pack.getByRole('button', { name: /In the HUD ✓/ }).waitFor();
  await pack.getByRole('button', { name: 'In the show', exact: true }).click();
  await pack.getByRole('option', { name: /Win probability/ }).waitFor();
  if (await pack.getByRole('option', { name: /Player cams/ }).count() !== 0) throw new Error('Player cams was not ticked, so it is not in the show');
  if (await pack.getByRole('option', { name: /Agent select/ }).count() !== 1) throw new Error('Agent select was ticked (Standard), so it is in the show');
  await shot('pack-in-my-show');
  await pack.getByRole('button', { name: /In the HUD ✓/ }).click();
  await pack.getByRole('option', { name: /Win probability/ }).waitFor({ state: 'detached' });
  // Rehearse this: the match's Rehearse step, playing that screen.
  await pack.getByRole('button', { name: 'All', exact: true }).click();
  await pack.getByRole('option', { name: /Halftime/ }).click();
  await pack.getByRole('button', { name: 'Rehearse this' }).waitFor();
  // Map veto in both looks.
  await pack.getByRole('button', { name: 'All', exact: true }).click();
  await pack.getByRole('option', { name: /Map veto/ }).click();
  await pack.getByRole('tab', { name: 'Overlay bar' }).click();
  await page.waitForTimeout(2500);
  // Each graphic lists its looks: the built-in ones to start from.
  await pack.getByRole('region', { name: 'Looks' }).getByRole('button', { name: 'Start from this' }).first().waitFor();
  await shot('pack-over-the-game');
  await pack.getByRole('tab', { name: 'Full screen' }).click();
  // A screen goes into this match's Rundown.
  await pack.getByRole('button', { name: 'All', exact: true }).click();
  await pack.getByRole('option', { name: /Player cams/ }).click();
  await pack.getByRole('button', { name: 'Add to this match’s Rundown' }).click();
  await pack.getByRole('button', { name: /In the Rundown ✓/ }).click();
  await pack.getByRole('button', { name: 'Add to this match’s Rundown' }).waitFor();
  await page.keyboard.press('Escape');

  // Settings: connect OBS (software settings), then Scenes: add for me, fill the game-feed slot
  // OBS was connected in first run; Settings shows the connection.
  await rail('Settings');
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await shot('settings');
  // Back (top bar) returns to where you were, and comes back with Alt ←.
  await page.getByRole('button', { name: /^Back to / }).click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor({ state: 'detached' });
  await rail('Settings');
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.keyboard.press('Alt+ArrowLeft');
  await page.getByRole('heading', { name: 'Settings' }).waitFor({ state: 'detached' });
  await rail('Settings');
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await step('OBS');
  await btn('Add all to OBS');
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

  await step('OBS');
  await page.getByRole('heading', { name: 'Browser sources' }).scrollIntoViewIfNeeded();
  await page.getByText(/\d of \d connected/).first().waitFor();
  await shot('outputs');

  // Go live (build step 5): My show to OBS, game data only with the consent tick, autopilot off for
  // the manual part of the journey. It never starts the stream.
  await step('Overview');
  await page.getByText(/ready$/).first().waitFor();
  await shot('readiness');
  // Full HD: the page stays compact and centred, and the Go live label sits inside its button.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  const fit = await page.getByRole('button', { name: 'Go live', exact: true }).evaluate((b) => {
    const r = b.getBoundingClientRect();
    const t = document.createRange(); t.selectNodeContents(b); const tr = t.getBoundingClientRect();
    return { inside: tr.left >= r.left - 1 && tr.right <= r.right + 1, width: r.width };
  });
  if (!fit.inside) throw new Error(`Go live label outside its button: ${JSON.stringify(fit)}`);
  await shot('readiness-1920');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await btn('Go live', { exact: true });
  const golive = page.getByRole('dialog', { name: 'Go live' });
  await golive.getByText('Send ').first().waitFor();
  await golive.getByRole('switch', { name: 'Autopilot', checked: false }).waitFor(); // off until ticked
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
  // The ticked pre-show screens follow on Take: the veto, then agent select, then back to the game.
  await page.waitForFunction(() => /Map veto/.test(document.querySelector('.next-card')?.textContent ?? ''));
  await page.keyboard.press(' ');
  await page.waitForFunction(() => /Agent select/.test(document.querySelector('.next-card')?.textContent ?? ''));
  await page.keyboard.press(' ');
  await page.waitForFunction(() => /Map 1 · Back to the game/.test(document.querySelector('.next-card')?.textContent ?? ''));
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
  await page.waitForFunction(() => /Map 1 · Halftime/.test(document.querySelector('.next-card')?.textContent ?? ''));
  await page.waitForTimeout(1500);
  await shot('autopilot-back-to-game');
  // The match's Rundown (step 5): locked while autopilot runs.
  await step('Rundown');
  await page.getByText('Autopilot is running. Choose Run manually on Live to change the Rundown.').waitFor();
  await shot('autopilot-rules-running');
  await rail('Live');
  await page.getByLabel('Autopilot').getByRole('button', { name: 'Run manually' }).click();
  await step('Rundown');
  // Pre-show, Game, Between maps and Post-show; a starting template replaces the rows.
  const section = (name) => page.getByRole('region', { name, exact: true });
  await btn('Use a starting template');
  await page.getByRole('menuitem', { name: /Results only/ }).click();
  await section('Between maps').getByText(/^When I press Take/).first().waitFor();
  await btn('Use a starting template');
  await page.getByRole('menuitem', { name: /Standard show/ }).click();
  await section('Between maps').getByText(/^By itself when the map ends/).waitFor();
  // Graphics › Templates: a look of our own for Map result over the game (approved mock, 13 Nov).
  await rail('Graphics');
  await page.getByRole('tab', { name: /Templates/ }).click();
  await page.getByLabel('Graphic for a new template').selectOption('map-result|band');
  await btn('+ New template');
  const ed = page.getByRole('dialog', { name: /Template editor/ });
  await ed.getByLabel('Template name').fill('Gold result');
  await ed.getByRole('option', { name: 'Panel' }).click();
  await ed.getByRole('radiogroup').filter({ hasText: 'Gradient' }).getByRole('radio', { name: 'Gradient' }).click();
  await ed.getByLabel('Y', { exact: true }).fill('-30');
  await ed.getByRole('radiogroup').filter({ hasText: 'Bottom' }).getByRole('radio', { name: 'Top' }).click();
  await ed.getByRole('option', { name: 'Title' }).click();
  await ed.getByRole('button', { name: 'Brand secondary' }).first().click();
  await ed.getByLabel('Font', { exact: true }).selectOption('barlow');
  await ed.getByRole('radiogroup').filter({ hasText: 'Wipe' }).getByRole('radio', { name: 'Wipe' }).click();
  const entrance = ed.getByRole('radiogroup').filter({ hasText: 'Wipe' });
  await page.keyboard.press('Control+z');
  await entrance.getByRole('radio', { name: 'None', checked: true }).waitFor();
  await page.keyboard.press('Control+y');
  await entrance.getByRole('radio', { name: 'Wipe', checked: true }).waitFor();
  await page.waitForTimeout(2500);
  await shot('template-editor');
  await page.keyboard.press('Control+s');
  await ed.getByText('Saved', { exact: true }).first().waitFor();
  { const t = (await call('snapshot')).templates.find((x) => x.name === 'Gold result'); if (!t || t.parts.panel?.y !== -30 || t.parts.title?.color !== 'brand.secondary' || t.parts.title?.entrance?.kind !== 'wipe') throw new Error('the template was not saved as edited: ' + JSON.stringify(t)); }
  await ed.getByRole('button', { name: 'Esc · Close' }).click();
  await ed.waitFor({ state: 'detached' });
  await page.locator('.tpl-card').filter({ hasText: 'Gold result' }).waitFor();
  await page.waitForTimeout(2000);
  await shot('templates');
  // A HUD template from the built-in HUD: the Scoreboard sample shows the scoreboard so it can be styled.
  await page.getByRole('button', { name: 'Start from this: In-game HUD' }).click();
  const hudEd = page.getByRole('dialog', { name: /Template editor/ });
  await hudEd.getByLabel('Template name').fill('Cup HUD');
  await hudEd.getByRole('button', { name: /^Sample:/ }).click();
  await hudEd.getByRole('menuitemradio', { name: 'Scoreboard' }).click();
  await hudEd.getByRole('option', { name: 'Scoreboard' }).click();
  await hudEd.getByLabel('px', { exact: true }).last().fill('14');
  await hudEd.getByRole('radiogroup').filter({ hasText: 'Wipe' }).getByRole('radio', { name: 'Fade' }).click();
  await page.waitForTimeout(2500);
  await shot('template-hud-sample');
  await page.keyboard.press('Control+s');
  await hudEd.getByText('Saved', { exact: true }).first().waitFor();
  { const t = (await call('snapshot')).templates.find((x) => x.name === 'Cup HUD'); if (!t || t.graphic !== 'hud' || t.parts.scoreboard?.radius !== 14 || t.parts.scoreboard?.entrance?.kind !== 'fade') throw new Error('the HUD template was not saved as edited: ' + JSON.stringify(t)); }
  await hudEd.getByRole('button', { name: 'Esc · Close' }).click();
  await hudEd.waitFor({ state: 'detached' });
  // Your own graphics (approved mock, 14 Nov): a design from Photoshop, data boxes on it, then used in the match.
  const designFile = path.join(OUT, 'neon-cup-map-result.png');
  { const art = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await art.setContent('<body style="margin:0;background:transparent"><div style="position:absolute;left:260px;top:220px;width:1400px;height:520px;background:#1d0f2b;box-shadow:0 0 0 3px #ffb22e inset"></div><div style="position:absolute;left:260px;top:160px;width:520px;height:60px;background:#ffb22e"></div></body>');
    await art.screenshot({ path: designFile, omitBackground: true });
    await art.close(); }
  await page.getByRole('tab', { name: /Your graphics/ }).click();
  await btn('+ Import a design');
  const own = page.getByRole('dialog', { name: /Your graphic/ });
  await own.getByLabel('Design PNG').setInputFiles(designFile);
  await own.getByRole('img', { name: 'Your design' }).waitFor();
  await own.getByLabel('Graphic name').fill('Neon Cup · Map result');
  await shot('own-import');
  await own.getByRole('button', { name: 'Next: place the data' }).click();
  for (const [field, x, y] of [['Team A name', 560, 510], ['Team B map score', 1000, 300], ['Map MVP K/D/A', 900, 600]]) {
    await own.getByRole('button', { name: new RegExp(`^${field.replace('/', '\\/')}`) }).first().click();
    await own.getByLabel('X', { exact: true }).fill(String(x));
    await own.getByLabel('Y', { exact: true }).fill(String(y));
  }
  await own.getByLabel('Size').fill('120');
  await shot('own-boxes');
  // Esc with unsaved boxes asks first, never loses work.
  await page.keyboard.press('Escape');
  await own.getByRole('alertdialog', { name: 'Unsaved changes' }).waitFor();
  await own.getByRole('button', { name: 'Keep editing' }).click();
  await own.getByRole('button', { name: 'With data' }).click();
  await page.waitForTimeout(2500);
  await shot('own-with-data');
  await own.getByRole('button', { name: 'Save', exact: true }).click();
  await own.getByText('Saved', { exact: true }).waitFor();
  { const snap = await call('snapshot'); const g = snap.ownGraphics.find((x) => x.name === 'Neon Cup · Map result');
    if (!g || g.boxes.length !== 3 || !g.boxes.some((b) => b.field === 'mvp.kda' && b.size === 120 && b.x === 900)) throw new Error('the own graphic was not saved as placed: ' + JSON.stringify(g)); }
  await own.getByRole('button', { name: 'Esc · Close' }).click();
  await own.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Use in this match' }).first().click();
  await page.getByText('In this match').first().waitFor();
  await page.waitForTimeout(1500);
  await shot('own-graphics');
  await step('Rundown');
  // Add a screen to Between maps with its own rule.
  await section('Between maps').getByRole('button', { name: 'Add screen' }).click();
  const addDrawer = page.getByRole('dialog', { name: 'Add to Between maps' });
  await addDrawer.getByRole('radiogroup', { name: 'Screen' }).getByRole('radio', { name: 'Map result', exact: true }).click();
  await addDrawer.getByRole('radiogroup', { name: 'When' }).getByRole('radio', { name: 'I press Take' }).click();
  await addDrawer.getByRole('radiogroup', { name: 'Map' }).getByRole('radio', { name: 'Map 2' }).click();
  await addDrawer.getByRole('radiogroup', { name: 'On screen' }).getByRole('radio', { name: '20 s' }).click();
  await addDrawer.getByText('Map result, on map 2, when you press Take, for 20 s, via the stinger.').waitFor();
  // The look: one of the built-in looks or a template (here our own, over the game).
  await addDrawer.getByRole('radiogroup', { name: 'Look' }).getByRole('radio', { name: /Gold result/ }).click();
  await addDrawer.getByText(/An overlay bar over the game feed/).waitFor();
  await page.waitForTimeout(2500);
  await shot('add-screen');
  await addDrawer.getByRole('button', { name: 'Add to rundown' }).click();
  await addDrawer.waitFor({ state: 'detached' });
  await section('Between maps').getByText(/map 2 · 20 s/).waitFor();
  { const snap = await call('snapshot'); const gold = snap.templates.find((x) => x.name === 'Gold result'); if (!snap.rundown.some((r) => r.show === 'map-result' && r.style === 'band' && r.template === gold.id)) throw new Error('the row did not keep its look'); }
  // Desk in Post-show is an OBS scene: no rule, Air never switches to it.
  await section('Post-show').getByRole('button', { name: 'Add screen' }).click();
  const postDrawer = page.getByRole('dialog', { name: 'Add to Post-show' });
  await postDrawer.getByRole('radiogroup', { name: 'Screen' }).getByRole('radio', { name: 'Desk' }).click();
  await postDrawer.getByText(/is its own OBS scene/).waitFor();
  await postDrawer.getByRole('button', { name: 'Add to rundown' }).click();
  await postDrawer.waitFor({ state: 'detached' });
  await section('Post-show').getByText(/In OBS: switch to/).waitFor();
  // The in-game HUD is one row; its parts are switches.
  const parts = page.getByRole('group', { name: 'Parts of the in-game HUD' });
  const winProb = parts.getByRole('button', { name: /Win probability/ });
  const wasOn = (await winProb.getAttribute('aria-pressed')) === 'true';
  await winProb.click();
  await parts.getByRole('button', { name: /Win probability/, pressed: !wasOn }).waitFor();
  await shot('rundown');
  await winProb.click();
  await parts.getByRole('button', { name: /Win probability/, pressed: wasOn }).waitFor();
  // The HUD's look: the built-in HUD or a HUD template, and the pause style.
  await page.getByText('Look of the HUD and the pause').click();
  await page.getByRole('radiogroup', { name: 'Look of the in-game HUD' }).getByRole('radio', { name: /Default HUD/, checked: true }).waitFor();
  await page.waitForTimeout(1500);
  await shot('hud-look');
  // Break's look: add Starting soon with the frame look, then switch it back to the classic screen on its row.
  await section('Pre-show').getByRole('button', { name: 'Add screen' }).click();
  const preDrawer = page.getByRole('dialog', { name: 'Add to Pre-show' });
  await preDrawer.getByRole('radiogroup', { name: 'Screen' }).getByRole('radio', { name: /Starting soon/ }).click();
  await preDrawer.getByRole('radiogroup', { name: 'Look' }).getByRole('radio', { name: /Default frame/ }).click();
  await page.waitForTimeout(1500);
  await shot('break-look');
  await preDrawer.getByRole('button', { name: 'Add to rundown' }).click();
  await preDrawer.waitFor({ state: 'detached' });
  if ((await call('snapshot')).rundown.find((r) => r.show === 'holding')?.style !== 'band') throw new Error('Break did not take the frame');
  await page.getByText('Look of Starting soon, Break and Ending').click();
  await page.getByText(/The two windows show what you put in ESPORTRA · Break window 1 and 2/).waitFor();
  await page.getByRole('radiogroup', { name: /Look of Starting soon/ }).getByRole('radio', { name: /Default classic/ }).click();
  await page.getByText(/The two windows show what you put/).waitFor({ state: 'detached' });
  if ((await call('snapshot')).rundown.find((r) => r.show === 'holding')?.style !== 'full') throw new Error('Break did not go back to classic');
  await section('Pre-show').getByRole('button', { name: /^Remove Starting soon/ }).click();
  await section('Pre-show').getByText('Look of Starting soon, Break and Ending').waitFor({ state: 'detached' });
  await section('Post-show').getByRole('button', { name: 'Remove Desk' }).click();
  await section('Post-show').getByText(/In OBS: switch to/).waitFor({ state: 'detached' });
  await step('Overview');
  // A played match keeps the teams it was played with; Reopen makes it follow Teams/Players again.
  await btn('Mark as finished');
  await page.getByText(/It keeps the teams and players it was played with/).waitFor();
  await shot('match-finished');
  await btn('Reopen');
  await page.getByText(/It keeps the teams and players it was played with/).waitFor({ state: 'detached' });

  // Player cameras (S5): make links, copy one, 10-up; the overlay pages show the streams and report connection.
  await step('Player PCs and cameras');
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

  await step('Player PCs and cameras');
  await page.getByRole('tab', { name: 'Game data' }).click();
  await btn('Stop capture');
  await page.getByRole('button', { name: '4×' }).click();
  await btn('Play', { exact: true });
  await page.getByText(/^\d+:\d\d \/ /).waitFor();
  await page.waitForTimeout(3500);
  await shot('capture');
  await step('Rundown');
  await page.getByRole('region', { name: 'Pre-show', exact: true }).waitFor();
  await shot('my-show');
  await btn('← Community Cup');
  await page.getByRole('tab', { name: 'Branding' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Community Cup Finals');
  await btn('Save', { exact: true });
  await page.getByRole('heading', { name: 'Community Cup Finals' }).waitFor();
  // The brand kit: every graphic and template reads these colours.
  await page.getByLabel('Secondary colour').fill('#ffc83d');
  await page.getByLabel('Attack colour').fill('#e8452c');
  await page.waitForTimeout(2000);
  await shot('brand-kit');
  await btn('Save kit');
  await page.getByRole('button', { name: 'Save kit', disabled: true }).waitFor();
  { const ev = (await call('snapshot')).events.find((e) => e.name === 'Community Cup Finals'); if (ev?.brand?.atk !== '#e8452c') throw new Error('the kit was not saved: ' + JSON.stringify(ev?.brand)); }
  await page.getByRole('tab', { name: 'Matches' }).click();
  await page.locator('.ev-match').first().getByRole('button', { name: 'Open' }).click();
  await page.locator('.crumbs').filter({ hasText: /Community Cup Finals\s*\/\s*Night Owls vs Crimson Five/ }).waitFor();
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
  // Esportra's tournament shows in Events until one of its matches is opened.
  await rail('Events');
  await btn('← Events');
  await page.locator('.ev-card').filter({ hasText: 'Esportra tournament' }).first().click();
  const paper = page.locator('.ev-match').filter({ hasText: 'Paper Rex' }).first();
  await paper.waitFor();
  await shot('matches-with-esportra');
  // Switching match changes every graphic on air, so it is refused while game data or a test round runs.
  const callWith = (m, args = []) => fetch(`${HOST}/call/${m}`, { method: "POST", body: JSON.stringify(args) });
  await callWith('testRound', ['start']);
  for (let i = 0; i < 50 && !(await call('snapshot')).gameLocked; i++) await page.waitForTimeout(200);
  await paper.getByRole('button', { name: 'Open' }).click();
  await page.getByText('Stop game data or the test round before switching matches.').first().waitFor();
  await callWith("testRound", ["stop"]);
  await callWith("stopCapture");
  for (let i = 0; i < 50 && (await call('snapshot')).gameLocked; i++) await page.waitForTimeout(200);
  await paper.getByRole('button', { name: 'Open' }).click();
  await page.locator('.tl-name').filter({ hasText: 'Paper Rex' }).first().waitFor();
  await page.locator('[title^="Signed in as"]').first().waitFor(); // the Esportra chip in Ready
  await shot('readiness-esportra');
  // Deleting asks first; an event with no match goes at once.
  await rail('Events');
  await btn('← Events');
  await page.getByLabel('New event name').fill('Scratch event');
  await btn('New event');
  await page.locator('.ev-card').filter({ hasText: 'Scratch event' }).click();
  await btn('Delete event');
  await page.getByRole('group', { name: 'Delete Scratch event?' }).waitFor();
  await shot('delete-event-confirm');
  await page.getByRole('group', { name: 'Delete Scratch event?' }).getByRole('button', { name: 'Delete' }).click();
  await page.locator('.ev-card').filter({ hasText: 'Scratch event' }).waitFor({ state: 'detached' });
  await shot('events');

  // Observer and player PCs (Stage 3): allow joining, then act as the capture-only PC against ourselves.
  await step('Player PCs and cameras');
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
  const WebSocket = require('ws');
  // Juno's PC joins before the match: it shows as a detected PC (by its own name and address), never as a player.
  const juno = new WebSocket(`ws://127.0.0.1:5301/join?code=${joinCode}&role=player&name=JUNO-PC`);
  await new Promise((r) => juno.once('message', r));
  const sendMe = () => juno.send(JSON.stringify({ type: 'valorant', message: { feature: 'me', info: { me: { health: '80' } }, playerId: uuid(0) } }));
  sendMe();
  const beat = setInterval(sendMe, 1000);
  const detected = page.getByLabel('Detected player PCs');
  await detected.getByText('JUNO-PC').waitFor();
  await detected.getByText(/PC detected · ready/).waitFor();
  await page.getByText(/Player PCs · 1 detected/).waitFor();
  if ((await detected.innerText()).includes('Juno')) throw new Error('a player name was shown before pairing');
  await shot('devices-detected');
  // The match starts: the observer's game lists its ten players and the PC pairs with its seat by itself.
  await fetch(`http://127.0.0.1:5399/api/${roomCode}/ingest/valorant`, { method: 'POST', headers: { 'X-Esportra-Key': 'dev-host-key-0123456789abcdef', 'Content-Type': 'application/json' }, body: JSON.stringify(board) });
  await page.locator('.seat.live').filter({ hasText: 'JUNO' }).or(page.locator('.seat.live').filter({ hasText: 'Juno' })).first().waitFor();
  await page.getByText(/Player PCs · 1 of 10 checked in/).waitFor();
  await page.locator('.seat').filter({ hasText: 'JUNO-PC' }).waitFor();
  await detected.getByText(/Paired with Juno/i).waitFor();
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
  await step('Player PCs and cameras');
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

  // Keys over the game (step 6): F-keys and Ctrl/Alt keys are registered with the PC; the others work in Air.
  const press = async (key) => (await fetch(`${HOST}/dev/press?key=${encodeURIComponent(key)}`, { method: 'POST' })).status;
  const keyRow = (label) => page.locator('#set-keys .key-row').filter({ hasText: label }).first();
  await rail('Settings');
  await page.locator('#set-keys').scrollIntoViewIfNeeded();
  await keyRow('Tech pause').getByText('Over the game').waitFor();
  await keyRow('Take what is waiting').getByText('Inside Air only').waitFor();
  await page.getByRole('button', { name: 'Change the key for Player spotlight' }).click();
  await page.keyboard.press('F12');
  await keyRow('Player spotlight').getByText('Taken by another app').waitFor();
  await page.getByText(/F12 is taken by another app on this PC/).waitFor();
  await page.locator('#set-keys').scrollIntoViewIfNeeded();
  await shot('keys-global');
  await call('resetKeys');
  // F1 while another app has focus (pressed through the dev host): the pause goes up on Live.
  await rail('Teams/Players');
  if (await press('F1') !== 200) throw new Error('F1 is not registered over the game');
  await rail('Live');
  await page.getByText('On screen · press again to resume').waitFor();
  await press('F1');
  await page.getByText('On screen · press again to resume').waitFor({ state: 'detached' });
  // Switched off, nothing is held over the game.
  await rail('Settings');
  const overSwitch = page.getByRole('switch', { name: 'Keys work over the game and other apps' });
  await overSwitch.click();
  await keyRow('Tech pause').getByText('Inside Air only').waitFor();
  if (await press('F1') !== 404) throw new Error('F1 still held with keys over the game switched off');
  await overSwitch.click();
  await keyRow('Tech pause').getByText('Over the game').waitFor();
  // The Settings menu follows the page down to the last section.
  await page.evaluate(() => { let el = document.getElementById('set-about'); while (el && el.scrollHeight <= el.clientHeight + 2) el = el.parentElement; if (el) el.scrollTop = el.scrollHeight; });
  await page.locator('.settings-nav a[aria-current="true"]', { hasText: 'About' }).waitFor();
  await page.locator('.settings-nav a', { hasText: 'Keyboard' }).click();
  await page.locator('.settings-nav a[aria-current="true"]', { hasText: 'Keyboard' }).waitFor();
  await shot('settings-nav');

  // A laptop screen: every main page at 1280x800.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [name, label] of [['laptop-live', 'Live'], ['laptop-events', 'Events'], ['laptop-graphics', 'Graphics'], ['laptop-settings', 'Settings']]) {
    await rail(label);
    await page.waitForTimeout(900);
    await shot(name);
  }
  for (const [name, label] of [['laptop-match-overview', 'Overview'], ['laptop-match-obs', 'OBS'], ['laptop-match-devices', 'Player PCs and cameras']]) {
    await step(label);
    await page.waitForTimeout(900);
    await shot(name);
  }

  // Compared with the outputs the match has now (the Rundown changed during the walk).
  const end = await call('snapshot');
  const loading = end.outputs.filter((o) => o.connections > 0).length;
  if (loading !== end.outputs.length) errors.push(`only ${loading} of ${end.outputs.length} outputs connected`);
  await browser.close();
  if (errors.length) { console.error('Problems:\n' + errors.join('\n')); process.exit(1); }
  console.log(`Walkthrough complete: ${n} screenshots in ${OUT}`);
})().catch(async (e) => { console.error(e); await failShot().catch(() => {}); process.exit(1); });
