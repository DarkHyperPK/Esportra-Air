// Battle royale walkthrough video (23 Nov): Air to broadcast for a PUBG MOBILE lobby, recorded from a fresh dev host.
// Events (structure), the game pack, Teams/Players, the lobby; HUD library (choose); Graphics studio (event theme,
// a look on one graphic); Live (each graphic on air, results typed in, browser sources). Captions are drawn into
// the page; the graphics are recorded frame by frame (every animation stepped to the frame's time) so the motion
// is exact whatever the machine. Writes <out>/air-br-walkthrough.mp4 and <out>/chapters.txt.
//   AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 --data <empty dir> &
//   node dev/br-tour.cjs [host] [engine port] <out dir>
// Live game numbers (HUD, WWCD stats, MVP) are written into the room by this script: the observer feed is not
// built yet, and the captions say so.
'use strict';
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const H = process.argv[2] || 'http://127.0.0.1:5334';
const ENGINE = process.argv[3] || '5396';
const OUT = process.argv[4] || path.join(process.cwd(), 'tour');
const KEY = 'dev-host-key-0123456789abcdef'; // the dev host's engine key (dev/host.ts)
const FPS = 30, W = 1920, HGT = 1080;
const FRAMES = path.join(OUT, 'frames');
const call = async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
const room = async (code, fields) => { const r = await fetch(`http://127.0.0.1:${ENGINE}/api/${code}`, { method: 'PATCH', headers: { 'X-Esportra-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }); if (!r.ok) throw new Error('room patch ' + r.status); };
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
const TAGS = ['NOW', 'CF5', 'IRP', 'DUNE', 'SFX', 'NTD', 'BHB', 'STW', 'RKS', 'LOB', 'WCD', 'GRM', 'FR6', 'ECV', 'QST', 'HGD'];
const COLORS = ['#22d3ee', '#f43f5e', '#ffb60e', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9'];
const MAPS = ['Erangel', 'Miramar', 'Sanhok', 'Erangel', 'Vikendi', 'Rondo'];

// ── recording: a list of frames (jpg) with how long each shows ──
let frameNo = 0;
const list = [];
const chapters = [];
let clock = 0;
const addFrame = (file, secs) => { list.push([file, secs]); clock += secs; };
const nextFile = () => path.join(FRAMES, String(frameNo++).padStart(6, '0') + '.jpg');
async function shot(page, secs) { const f = nextFile(); await page.screenshot({ path: f, type: 'jpeg', quality: 90 }); addFrame(f, secs); }
const chapter = (title) => chapters.push([clock, title]);

// Captions, a chapter tag and a pointer drawn into the page (never part of the app or the graphics).
const CHROME = `
#tour-cap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);max-width:1360px;padding:18px 30px;background:rgba(8,9,12,.9);border:1px solid rgba(255,255,255,.14);border-left:4px solid #FFB60E;color:#fff;font:500 28px/1.35 Poppins,system-ui,sans-serif;letter-spacing:.005em;z-index:2147483646;box-shadow:0 18px 50px rgba(0,0,0,.5);pointer-events:none}
#tour-cap:empty{display:none}
#tour-ch{position:fixed;left:96px;top:62px;padding:8px 14px;background:#FFB60E;color:#111;font:800 17px/1 Poppins,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;z-index:2147483646;pointer-events:none}
#tour-ch:empty{display:none}
#tour-ptr{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transition:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.6))}
#tour-ptr.down::after{content:'';position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:3px solid #FFB60E}`;
async function dress(page, ch, cap, ptr = false) {
  await page.evaluate(([css, ch, cap, ptr]) => {
    if (!document.getElementById('tour-css')) { const s = document.createElement('style'); s.id = 'tour-css'; s.textContent = css; document.head.appendChild(s); }
    for (const id of ['tour-cap', 'tour-ch']) if (!document.getElementById(id)) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
    document.getElementById('tour-cap').textContent = cap || '';
    document.getElementById('tour-ch').textContent = ch || '';
    let p = document.getElementById('tour-ptr');
    if (ptr && !p) { p = document.createElement('div'); p.id = 'tour-ptr'; p.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l17 9-7.5 2L9 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>'; p.style.left = '960px'; p.style.top = '700px'; document.body.appendChild(p); }
    if (!ptr && p) p.remove();
  }, [CHROME, ch, cap, ptr]);
}

// ── the app: move the pointer to a thing, click it, record the result ──
let app;
const ptrAt = () => app.evaluate(() => { const p = document.getElementById('tour-ptr'); return p ? [parseFloat(p.style.left), parseFloat(p.style.top)] : [960, 700]; });
async function point(loc, frames = 12) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error('nothing to point at');
  const [x0, y0] = await ptrAt(), x1 = b.x + Math.min(b.width / 2, 60), y1 = b.y + b.height / 2;
  for (let i = 1; i <= frames; i++) {
    const t = i / frames, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await app.evaluate(([x, y]) => { const p = document.getElementById('tour-ptr'); p.style.left = x + 'px'; p.style.top = y + 'px'; }, [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e]);
    await shot(app, 1 / FPS * 2);
  }
}
async function click(loc, hold = 0.6) {
  await point(loc);
  await app.evaluate(() => document.getElementById('tour-ptr').classList.add('down'));
  await shot(app, 0.15);
  await loc.click();
  await app.evaluate(() => document.getElementById('tour-ptr').classList.remove('down'));
  await app.waitForTimeout(450);
  await shot(app, hold);
}
async function type(loc, text) {
  await click(loc, 0.1);
  await loc.fill('');
  for (let i = 1; i <= text.length; i += 2) { await loc.fill(text.slice(0, i)); await shot(app, 0.08); }
  await loc.fill(text); await shot(app, 0.4);
}
/** A few seconds of the app as it is (real time, so loading and transitions show). */
async function hold(secs, step = 0.5) { for (let t = 0; t < secs; t += step) { await shot(app, step); await app.waitForTimeout(80); } }
const rail = (name) => app.locator('nav.rail').getByRole('button', { name });

// ── a graphic as viewers see it: the lobby room's page, every animation stepped frame by frame ──
async function reel(browser, url, secs, ch, cap, opts = {}) {
  const p = await browser.newPage({ viewport: { width: W, height: HGT } });
  await p.goto(url);
  await p.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 });
  if (opts.backdrop) await p.evaluate((src) => { document.documentElement.style.background = `#000 url('${src}') center/cover`; document.body.style.background = 'transparent'; }, opts.backdrop);
  await p.waitForTimeout(opts.settle ?? 900);
  if (opts.before) await opts.before(p);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => { document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; }); document.querySelectorAll('svg').forEach((v) => v.pauseAnimations && v.pauseAnimations()); });
  await dress(p, ch, cap);
  const n = Math.round(secs * FPS);
  for (let f = 0; f < n; f++) {
    await p.evaluate((t) => { document.getAnimations().forEach((a) => { if (a.playState !== 'paused') a.pause(); a.currentTime = t; }); document.querySelectorAll('svg').forEach((v) => v.setCurrentTime && v.setCurrentTime(t / 1000)); }, (f * 1000) / FPS);
    await shot(p, 1 / FPS);
  }
  await p.close();
}
/** A plain card between chapters. */
async function card(browser, title, sub, secs) {
  const p = await browser.newPage({ viewport: { width: W, height: HGT } });
  await p.setContent(`<html><body style="margin:0;background:radial-gradient(120% 120% at 70% 0%,#1d2230,#07080b 70%);color:#fff;font-family:Poppins,system-ui,sans-serif;display:grid;place-items:center;height:1080px">
    <div style="text-align:center"><div style="font:800 22px Poppins,system-ui;letter-spacing:.3em;color:#FFB60E">ESPORTRA AIR</div>
    <div style="font:800 86px/1.05 Poppins,system-ui;margin:22px 0 18px;letter-spacing:-.01em">${title}</div><div style="font:400 30px Poppins,system-ui;color:#b8bcc6">${sub}</div></div></body></html>`);
  for (let i = 0; i < secs * 2; i++) await shot(p, 0.5);
  await p.close();
}

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });
  // The data a producer would type: teams with their players (no photos: the graphics draw shadows).
  await call('chooseGame', ['pubgm']); await call('finishOnboarding');
  await call('esportraSignIn', ['producer@example.com', 'correct horse battery']); // the dev host's fake Esportra
  for (const [i, n] of NAMES.entries()) await call('saveTeam', [{ name: n, tag: TAGS[i], color: COLORS[i % COLORS.length], logo: '' }]);
  let snap = await call('snapshot');
  for (const t of snap.library?.teams ?? snap.teams ?? []) {
    const i = NAMES.indexOf(t.name);
    for (let k = 1; k <= 4; k++) await call('savePlayer', [{ name: `${TAGS[i]}_${['ACE', 'ROOK', 'VEX', 'KAI'][k - 1]}`, realName: '', gameId: `${TAGS[i]}_${['ACE', 'ROOK', 'VEX', 'KAI'][k - 1]}`, photo: '', role: '', teamId: t.id }]);
  }
  const browser = await chromium.launch();
  app = await browser.newPage({ viewport: { width: W, height: HGT } });
  const errs = []; app.on('pageerror', (e) => errs.push(e.message));
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor();

  await card(browser, 'Battle royale, from setup to on air', 'PUBG MOBILE · events, the graphics set and editing it', 4);

  // 1 · Events: the structure
  chapter('Events: the structure');
  await rail('Events').click(); await app.waitForTimeout(600);
  await dress(app, 'Events', 'Events hold the structure. Start with the event: its lobbies, teams and matches live inside it.', true);
  await hold(2.5);
  await type(app.getByLabel('New event name'), 'Air Showcase Cup');
  await click(app.getByRole('button', { name: 'New event', exact: true }), 1.5);
  snap = await call('snapshot');
  const ev = snap.events[0];
  await call('saveSponsor', [ev.id, { name: 'Volt Energy', tier: 'title', logo: '', logoLight: '', line: '' }]);
  await call('saveSponsor', [ev.id, { name: 'Northline', tier: 'partner', logo: '', logoLight: '', line: '' }]);

  chapter('The official game pack');
  await rail(/Graphics studio/).click(); await app.waitForTimeout(500);
  await app.getByRole('tab', { name: 'Game assets' }).click(); await app.waitForTimeout(500);
  await dress(app, 'Game pack', 'The official PUBG MOBILE kit is for licensed tournaments. Confirm the licence once for the event and Air downloads the pack.', true);
  await hold(2.5);
  await click(app.locator('label').filter({ has: app.locator('input[type=checkbox]') }).first(), 0.4);
  await click(app.getByRole('button', { name: 'Confirm and download the pack' }), 0.4);
  for (let i = 0; i < 60 && !(await app.locator('.ga-card').count()); i++) await app.waitForTimeout(250);
  await dress(app, 'Game pack', 'Logos, maps, wallpapers and props from the kit, ready for every graphic. Logos are used as they are, never recoloured.', true);
  await hold(3.5);

  chapter('Teams and players');
  await rail(/Teams/).click(); await app.waitForTimeout(700);
  await dress(app, 'Teams/Players', 'Teams and players are kept once and shared by every lobby. A photo is optional: without one the graphics show a grey player shadow.', true);
  await hold(4);

  chapter('The lobby');
  await rail('Events').click(); await app.waitForTimeout(400);
  await click(app.locator('.ev-card').first(), 0.8);
  await dress(app, 'Events › Lobby', 'A lobby is the teams playing a day of matches. Name it and add it to the event.', true);
  await hold(1.5);
  await type(app.getByLabel('Lobby name'), 'Group A · Day 2');
  await click(app.getByRole('button', { name: 'New lobby' }), 0.8);
  await click(app.getByRole('button', { name: 'Open' }).first(), 0.8);
  snap = await call('snapshot');
  const lobby = snap.lobbies[0];
  const lib = snap.library?.teams ?? snap.teams;
  await call('lobbyTeams', [lobby.id, NAMES.map((n) => lib.find((t) => t.name === n).id)]);
  const now = new Date(Date.now() + 9 * 60_000), hh = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  await call('lobbyUpdate', [lobby.id, { stage: 'Group stage', games: MAPS.map((map, i) => ({ map, startsAt: hh(new Date(now.getTime() + (i - 2) * 40 * 60_000)) })) }]);
  await app.getByRole('tab', { name: /Teams/ }).click(); await app.waitForTimeout(500);
  await dress(app, 'Events › Lobby', 'Pick its 16 teams from Teams/Players. Names, colours, logos and players follow the library.', true);
  await hold(3);
  await click(app.getByRole('tab', { name: /es and maps/ }), 0.4);
  await dress(app, 'Events › Lobby', 'The day’s matches with their maps and drop times, and the scoring (PMGC points by default). Events stop here: structure only.', true);
  await hold(4);

  // Two matches already played, so the graphics have a story.
  const teams = (await call('snapshot')).lobbies[0].teams;
  const order1 = [2, 0, 5, 3, 1, 7, 9, 6, 11, 10, 13, 15, 12, 8, 4, 14], el1 = [7, 9, 6, 3, 4, 2, 3, 0, 2, 1, 1, 1, 1, 1, 1, 0];
  const order2 = [0, 2, 1, 6, 3, 4, 5, 8, 7, 12, 9, 10, 11, 13, 15, 14], el2 = [11, 5, 6, 4, 2, 3, 1, 2, 1, 0, 2, 1, 0, 1, 0, 0];
  await call('lobbyResult', [lobby.id, 1, order1.map((t, i) => ({ team: teams[t].id, place: i + 1, elims: el1[i] }))]);
  await call('lobbyResult', [lobby.id, 2, order2.map((t, i) => ({ team: teams[t].id, place: i + 1, elims: el2[i] }))]);
  // Typed results are provisional until confirmed (27 Nov).
  for (const n of [1, 2]) await call('lobbyConfirm', [lobby.id, (await call('snapshot')).lobbies[0].games[n - 1].id]);

  // 2 · HUD library: choose
  chapter('HUD library: choose');
  await rail(/HUD library/).click(); await app.waitForTimeout(800);
  await dress(app, 'HUD library', 'HUD library is where you choose. The ESPORTRA HUD pack holds every PUBG MOBILE graphic.', true);
  await hold(2);
  await click(app.locator('.pack-card').first(), 1.2);
  for (const name of ['Starting soon', "Today's matches", 'Overall standings', 'Champions']) {
    await dress(app, 'HUD library', { 'Starting soon': 'Starting soon: the countdown over a tilted map, the plane riding its flight path.', "Today's matches": 'Today’s matches: each map as a disc along the flight path, winners marked.', 'Overall standings': 'Overall standings: the points race with the match-point line.', Champions: 'Champions: the title winners and their road through the day.' }[name], true);
    await click(app.locator('.pack-list [role=option]').filter({ hasText: name }), 0.3);
    await app.waitForTimeout(1600); await hold(2.2);
  }
  await click(app.locator('.pack-list [role=option]').filter({ hasText: 'In-game HUD' }), 0.3);
  await dress(app, 'HUD library', 'The in-game HUD comes in three layouts, each kept clear of the observer client’s own minimap, killfeed and compass.', true);
  await app.waitForTimeout(1400); await hold(1.5);
  await click(app.locator('.br-layout').filter({ hasText: 'Points grid' }), 1.2);
  await click(app.locator('.br-layout').filter({ hasText: 'Points rail' }), 1.5);
  await app.keyboard.press('Escape'); await app.waitForTimeout(300);

  // 3 · Graphics studio: edit
  chapter('Graphics studio: the event theme');
  await rail(/Graphics studio/).click(); await app.waitForTimeout(500);
  await click(app.getByRole('tab', { name: 'Event theme' }), 0.5);
  await app.waitForTimeout(1800);
  await dress(app, 'Graphics studio › Event theme', 'Graphics studio is where you edit. The event theme sets the colour world of every graphic at once.', true);
  await hold(2.5);
  for (const [preset, words] of [['Jungle', 'Jungle: deep green and antique gold.'], ['Inferno', 'Inferno: ember red and molten gold.'], ['Sky', 'Sky: bright blue with white cards.']]) {
    await dress(app, 'Graphics studio › Event theme', words, true);
    await click(app.locator('.bt-preset').filter({ hasText: preset }), 0.2);
    await app.waitForTimeout(1500); await hold(2);
  }
  await click(app.getByRole('tab', { name: 'Overall standings' }), 0.2); await app.waitForTimeout(1500);
  await dress(app, 'Graphics studio › Event theme', 'Swap the background for another kit wallpaper, or upload the event’s own picture.', true);
  await hold(1);
  await click(app.getByRole('button', { name: 'Kit wallpaper…' }), 0.8);
  await click(app.locator('.ap-grid .ga-card').nth(1), 0.2);
  await app.waitForTimeout(1500); await hold(2);
  await click(app.getByRole('tab', { name: 'Starting soon' }), 0.2); await app.waitForTimeout(1500);
  await dress(app, 'Graphics studio › Event theme', 'Props are yours too: the airdrop crate and parachutes, on either side, or off.', true);
  await click(app.getByRole('tab', { name: 'Left' }), 0.2); await app.waitForTimeout(1300); await hold(2);
  await click(app.locator('.bt-actions').getByRole('button', { name: /^Save/ }), 1.5);

  chapter('Graphics studio: a look for one graphic');
  await click(app.getByRole('tab', { name: 'Looks' }), 0.6);
  await dress(app, 'Graphics studio › Looks', 'A look changes one graphic: move, resize, recolour, re-word or hide any layer, or change a picture.', true);
  await hold(1.5);
  await app.getByLabel('Graphic for a new template').selectOption({ label: 'Overall standings' });
  await click(app.getByRole('button', { name: '+ New template' }), 1);
  await app.waitForTimeout(2500);
  await hold(1.5);
  await click(app.locator('.tpl-tree .tpl-fold[aria-label$=" layers of Header"]'), 0.4);
  await click(app.locator('.tpl-tree [role=option]').filter({ hasText: /^Title$/ }), 0.6);
  await dress(app, 'Graphics studio › Looks', 'Every text, picture and shape is a layer. Change the title’s words…', true);
  await type(app.locator('.tpl-right').getByLabel('Words'), 'POINTS RACE');
  await app.waitForTimeout(800); await hold(1.5);
  await dress(app, 'Graphics studio › Looks', '…or its colour. Pictures change from the kit, and Ctrl Z takes any change back.', true);
  await click(app.locator('.tpl-right .sw').nth(1), 0.3);
  await app.waitForTimeout(900); await hold(2);
  await type(app.getByLabel('Template name'), 'Points race');
  const editor = app.getByRole('dialog', { name: /Template editor/ });
  await click(editor.getByRole('button', { name: /^Save/ }).last(), 1);
  await click(editor.getByRole('button', { name: /Close/ }).first(), 0.4);
  await editor.waitFor({ state: 'detached', timeout: 5000 });

  // 4 · Live: run the show
  chapter('Live: run the show');
  await rail('Live').click(); await app.waitForTimeout(900);
  await dress(app, 'Live', 'Live runs the whole show from one page: the lobby, its graphics by phase, and what viewers see.', true);
  await hold(3);
  const lobbyCode = (await call('snapshot')).lobbies[0].code;
  const out = (page) => `http://127.0.0.1:${ENGINE}/overlays/${page}.html?match=${lobbyCode}`;
  const take = async (name, ch, cap) => {
    const item = app.locator('.cp-gi').filter({ hasText: name }).first();
    if (!(await item.isVisible())) { const tab = app.getByRole('tab', { name: /Post-game/ }); if (await tab.count()) await tab.click(); }
    await click(app.locator('.cp-gi').filter({ hasText: name }).first(), 0.3);
    await dress(app, ch, cap, true);
    await click(app.getByRole('button', { name: 'Put on air' }), 0.2);
    await app.waitForTimeout(1600); await hold(1.5);
  };
  const tab = async (re) => { const t = app.getByRole('tab', { name: re }); if (await t.count()) await click(t, 0.3); };
  await tab(/Pre-game/);
  await take('Starting soon', 'Live', 'Before the drop: Starting soon goes on air with one click.');
  await reel(browser, out('fullscreen'), 7, 'On air', 'Starting soon: the countdown to the next drop over its map, with the standings so far.');
  await take("Today's matches", 'Live', 'Today’s matches: the run of the day.');
  await reel(browser, out('fullscreen'), 6, 'On air', 'Today’s matches: played maps show their winners; the next one is marked.');

  // The match: the in-game HUD over the game (live numbers written by this script; the observer feed is a later step).
  await tab(/In-game/);
  const alive = 'aaaa', live = { game: 3, teamsAlive: 9, playersAlive: 27, teams: {}, players: [] };
  teams.forEach((t, i) => { live.teams[t.id] = { players: i < 9 ? ['aaaa', 'aaak', 'aakd', 'akdd'][i % 4] : 'dddd', elims: [5, 4, 3, 3, 2, 2, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0][i], place: i < 9 ? null : 16 - (i - 9) }; });
  live.lastOut = { team: teams[9].id, place: 8, at: Date.now() + 600_000 };
  await room(lobbyCode, { brLive: live });
  await dress(app, 'Live', 'During the match the in-game HUD is its own browser source over the game: points, who is alive or knocked, and eliminations.', true);
  await hold(3);
  await reel(browser, out('br-hud'), 7, 'On air · simulated data', 'Live points as teams fall. These numbers are simulated: the observer data feed arrives in a later step.', { backdrop: `http://127.0.0.1:${ENGINE}${(await (await fetch(`http://127.0.0.1:${ENGINE}/api/${lobbyCode}`)).json()).state?.airPack?.wallpaper?.[1] ?? ''}` });

  // Results: typed in the Results drawer, saved straight to air.
  chapter('Results and the post-game set');
  const order3 = [0, 5, 2, 1, 9, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15], el3 = [9, 6, 4, 5, 3, 2, 3, 1, 1, 1, 0, 1, 0, 0, 1, 0];
  live.teams = {}; teams.forEach((t, k) => { const i = order3.indexOf(k); live.teams[t.id] = { players: i === 0 ? 'aaka' : 'dddd', elims: el3[i], place: i + 1 }; });
  live.teamsAlive = 1; live.playersAlive = 3; delete live.lastOut;
  live.players = [{ team: teams[0].id, name: 'NOW_ACE', elims: 4, damage: 612 }, { team: teams[0].id, name: 'NOW_ROOK', elims: 3, damage: 455 }, { team: teams[0].id, name: 'NOW_VEX', elims: 2, damage: 301 }, { team: teams[0].id, name: 'NOW_KAI', elims: 0, damage: 120 }];
  live.mvp = [{ team: teams[0].id, name: 'NOW_ACE', elims: 4, damage: 612, survived: 1712 }, { team: teams[5].id, name: 'NTD_VEX', elims: 4, damage: 540, survived: 1590 }, { team: teams[2].id, name: 'IRP_ROOK', elims: 3, damage: 498, survived: 1640 }, { team: teams[1].id, name: 'CF5_ACE', elims: 3, damage: 470, survived: 1501 }];
  await room(lobbyCode, { brLive: live });
  await click(app.getByRole('button', { name: 'Results', exact: true }), 0.6);
  await dress(app, 'Live › Results', 'When the match ends, type each team’s place and eliminations. Air checks every place is used once.', true);
  const drawer = app.getByRole('dialog', { name: 'Results' });
  await drawer.getByRole('tab', { name: /3/ }).first().click().catch(() => {});
  for (let place = 1; place <= 16; place++) {
    const t = teams[order3[place - 1]].name;
    const pl = drawer.getByLabel(`${t} place`), elx = drawer.getByLabel(`${t} elims`);
    if (place <= 3) { await type(pl, String(place)); await type(elx, String(el3[place - 1])); } else { await pl.fill(String(place)); await elx.fill(String(el3[place - 1])); }
  }
  await hold(1.5);
  await click(drawer.getByRole('button', { name: 'Save and put on air' }), 1.2);
  await app.keyboard.press('Escape'); await app.waitForTimeout(500);
  await tab(/Post-game/);
  await take('Match results', 'Live', 'Match results: the winning squad and every team’s place, eliminations and points.');
  await reel(browser, out('fullscreen'), 7, 'On air', 'Match 3 results, straight from what was typed.');
  await take('WWCD', 'Live', 'Winner Winner Chicken Dinner for the match winner (BOOYAH for Free Fire).');
  await reel(browser, out('fullscreen'), 6, 'On air', 'WWCD: the squad, the points and each player’s numbers (simulated here).');
  await take('Match MVP', 'Live', 'Match MVP: the best player by damage, eliminations and survival.');
  await reel(browser, out('fullscreen'), 6, 'On air · simulated data', 'Match MVP. Player numbers come from the observer feed (a later step); simulated here.');
  // The look is chosen before it goes on air: Put on air sends the graphic with its look.
  await click(app.locator('.cp-gi').filter({ hasText: 'Overall standings' }).first(), 0.3);
  await dress(app, 'Live', 'Overall standings, in the look made a minute ago in Graphics studio.', true);
  const look = app.getByLabel(/Look for Overall standings/);
  await point(look); await look.selectOption({ label: 'Points race' }); await app.waitForTimeout(900); await hold(1);
  await click(app.getByRole('button', { name: 'Put on air' }), 0.2);
  await app.waitForTimeout(1600); await hold(1.5);
  await reel(browser, out('fullscreen'), 7, 'On air', 'The points race after three matches, in the “Points race” look.');

  // Three more matches (typed the same way), then the title.
  const more = [[2, 0, 1, 5, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [0, 2, 3, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]];
  for (const [k, o] of more.entries()) {
    await call('lobbyResult', [lobby.id, 4 + k, o.map((t, i) => ({ team: teams[t].id, place: i + 1, elims: Math.max(0, 8 - i) }))]);
    await call('lobbyConfirm', [lobby.id, (await call('snapshot')).lobbies[0].games[3 + k].id]);
  }
  await take('Champions', 'Live', 'After the last match: Champions.');
  await reel(browser, out('fullscreen'), 8, 'On air', 'Champions: the title winners, their points, wins and eliminations, and their road through the day.');

  chapter('Change the theme any time');
  for (const [preset, words] of [['jungle', 'One switch changes every graphic’s theme: Jungle…'], ['inferno', '…or Inferno, live on air.']]) {
    await call('lobbyLook', [lobby.id, { theme: { preset, props: { crate: true, chutes: true, side: 'right' } } }]);
    await reel(browser, out('fullscreen'), 4, 'On air', words);
  }
  await call('lobbyLook', [lobby.id, { theme: { preset: 'sky', props: { crate: true, chutes: true, side: 'left' } } }]);

  chapter('Into OBS');
  await click(app.getByRole('button', { name: 'Sources', exact: true }), 0.6);
  await dress(app, 'Live › Sources', 'Every graphic is a browser source for OBS or vMix: copy its address once. Air drives the graphics; it never switches or streams.', true);
  await hold(5);
  await app.keyboard.press('Escape');
  await card(browser, 'Events · HUD library · Graphics studio · Live', 'Structure, choose, edit, run', 4);
  await browser.close();
  if (errs.length) console.warn('page errors: ' + errs.join('; '));

  // ── encode: every frame for its time, 30 fps, chapters as metadata ──
  const listFile = path.join(OUT, 'frames.txt');
  fs.writeFileSync(listFile, list.map(([f, d]) => `file '${f}'\nduration ${d.toFixed(4)}`).join('\n') + `\nfile '${list.at(-1)[0]}'\n`);
  const meta = path.join(OUT, 'chapters.ffmeta');
  const ms = (s) => Math.round(s * 1000);
  fs.writeFileSync(meta, ';FFMETADATA1\ntitle=Esportra Air: battle royale walkthrough\n' + chapters.map(([t, title], i) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${ms(t)}\nEND=${ms(chapters[i + 1]?.[0] ?? clock)}\ntitle=${title}`).join('\n') + '\n');
  const mp4 = path.join(OUT, 'air-br-walkthrough.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', meta, '-map_metadata', '1', '-map_chapters', '1', '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', mp4]);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  fs.writeFileSync(path.join(OUT, 'chapters.txt'), chapters.map(([t, title]) => `${mmss(t)}  ${title}`).join('\n') + `\n(${mmss(clock)} in all)\n`);
  console.log(`${mp4} · ${mmss(clock)} · ${frameNo} frames`);
})().catch((e) => { console.error(e); process.exit(1); });
