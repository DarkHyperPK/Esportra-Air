// PUBG MOBILE broadcast walk (28 Nov): one broadcast, end to end, in a browser against fresh dev hosts. First run,
// import of a made-up sheet with pictures, format and points table, HUD template, OBS and vMix, a test game with the
// stand-in PCOB, day 1 (three matches armed, played, confirmed), Day 1 standings on air, an event file, day 2 with an
// Air restart mid-match, the event file opened on a second fresh profile, day 2 finished, Champions; then the first
// steps again with a stage from the stand-in Esportra. Exits 1 on any failed check, page error or 404.
//
//   node dev/host.ts --port 5340 --engine-port 5341 --data-dir <out>/profile-a &
//   NODE_PATH=… node dev/br-broadcast-walk.cjs http://127.0.0.1:5340 5341 <out> [--steps=1-10]
//
// The walk starts further hosts itself (ports host+1/+2, engine+1/+2): the restart of step 8, the second profile of
// step 9 and the Esportra stage run of step 10. Screenshots go to <out>/<step>-<name>.png.
'use strict';
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const H1 = args[0] || 'http://127.0.0.1:5340';
const E1 = args[1] || '5341';
const OUT = path.resolve(args[2] || path.join(process.cwd(), 'br-walk'));
const stepsArg = (process.argv.find((a) => a.startsWith('--steps=')) || '--steps=1-10').slice(8);
const [FROM, TO] = stepsArg.split('-').map(Number).concat([undefined]).slice(0, 2).map((x, i, a) => x ?? a[0]);
fs.mkdirSync(OUT, { recursive: true });
const hostPort = Number(new URL(H1).port);
const DEV = path.resolve(__dirname, 'host.ts');

// ── made-up data (no real names): 16 teams × 4 players ──
const TEAMS = [['NIGHT OWLS', 'NOW'], ['CRIMSON FIVE', 'CF5'], ['IRON PINE', 'IRP'], ['DUNE RUNNERS', 'DUNE'], ['SILVER FOX', 'SFX'], ['NORTH TIDE', 'NTD'], ['BLUE HARBOR', 'BHB'], ['STONE WOLVES', 'STW'], ['RED KESTREL', 'RKS'], ['LOW ORBIT', 'LOB'], ['WILD CARD', 'WCD'], ['GREY MOUNTAIN', 'GRM'], ['FERAL SIX', 'FR6'], ['ECHO VALLEY', 'ECV'], ['QUIET STORM', 'QST'], ['HIGH GROUND', 'HGD']];
const SUFFIX = ['ACE', 'ROOK', 'VEX', 'KAI'];
const ROLES = ['IGL', 'Player', 'Player', 'Player'];
// The stand-in PCOB's default uIDs run 510000001… in team and player order: the sheet uses the same ones.
const uidOf = (t, p) => String(510000001 + t * 4 + p);
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0];

// ── a tiny PNG writer (zlib only) for the picture folder ──
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(w, h, rgb, seed) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const edge = x < 4 || y < 4 || x >= w - 4 || y >= h - 4; const stripe = ((x + y + seed) >> 3) & 1; raw[o] = edge ? 255 : rgb[0] - stripe * 30; raw[o + 1] = edge ? 255 : rgb[1] - stripe * 30; raw[o + 2] = edge ? 255 : rgb[2] - stripe * 30; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function makeSheet(dir) {
  fs.mkdirSync(path.join(dir, 'pictures', 'logos'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'pictures', 'players'), { recursive: true });
  const rows = ['Group,Team,Tag,Player IGN,UID,Role'];
  TEAMS.forEach(([name, tag], t) => {
    const hue = (t * 22) % 360, c = (k) => Math.round(120 + 100 * Math.sin((hue + k) * Math.PI / 180));
    fs.writeFileSync(path.join(dir, 'pictures', 'logos', `${name}.png`), png(96, 96, [c(0), c(120), c(240)], t));
    SUFFIX.forEach((s, p) => {
      rows.push(`Group A,${name},${tag},${tag}_${s},${uidOf(t, p)},${ROLES[p]}`);
      fs.writeFileSync(path.join(dir, 'pictures', 'players', `${tag}_${s}.png`), png(64, 80, [c(p * 40), c(120 + p * 40), c(240 + p * 40)], t * 4 + p));
    });
  });
  const file = path.join(dir, 'teams-and-players.csv');
  fs.writeFileSync(file, rows.join('\n') + '\n');
  return { csv: rows.join('\n') + '\n', file, pictures: path.join(dir, 'pictures') };
}

// ── checking ──
const results = [];
let failures = 0;
function ok(cond, msg) { if (!cond) throw new Error('CHECK FAILED: ' + msg); }
const mkCall = (H) => async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
const mkDev = (H) => async (kind, q) => (await fetch(`${H}/dev/${kind}?${q}`, { method: 'POST' })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await sleep(150); } };

let browser;
const problems = [];
async function open(H, vp = { width: 1600, height: 1000 }) {
  const page = await browser.newPage({ viewport: vp });
  watch(page, H);
  return page;
}
// Page errors, console errors and failed requests of this PC's own hosts (Riot's picture server is never reached: offline).
function watch(page, H) {
  const where = () => page.url().replace(/\?.*/, '');
  page.on('pageerror', (e) => problems.push(`page error at ${where()}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console error at ${where()}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && /^http:\/\/127\.0\.0\.1/.test(r.url()) && !/\/call\/|favicon/.test(r.url())) problems.push(`${r.status()} ${r.url()}`); });
}
const shotIn = async (page, step, name) => { const f = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); return f; };

// ── hosts ──
const children = [];
function spawnHost(port, enginePort, dataDir) {
  const log = fs.openSync(path.join(OUT, `host-${port}.log`), 'a');
  const c = spawn(process.execPath, [DEV, '--port', String(port), '--engine-port', String(enginePort), '--data-dir', dataDir], { stdio: ['ignore', log, log] });
  children.push(c);
  return c;
}
async function waitHost(H) { await until(async () => { try { return (await fetch(`${H}/dev/state`)).ok; } catch { return false; } }, 'host ' + H, 40000); }
async function quitHost(H) {
  await fetch(`${H}/dev/quit`, { method: 'POST' }).catch(() => {});
  await until(async () => { try { await fetch(`${H}/dev/state`); return false; } catch { return true; } }, 'the host to stop', 20000);
  await sleep(1500); // the engine lets go of its port
}

// A host left over from an earlier run on the same port would answer for the new one: stop it first.
async function freeHost(H) { try { await fetch(`${H}/dev/state`); } catch { return; } await quitHost(H); }
const STEPS = [];
const step = (n, title, fn) => STEPS.push({ n, title, fn });
const S = { dataDir: path.resolve((process.argv.find((a) => a.startsWith('--data-dir=')) || '').slice(11) || path.join(OUT, 'profile-a')), H: H1, E: E1, call: mkCall(H1), dev: mkDev(H1), sheet: null };

// A window onto Air (the interface) for the current host.
async function air(H) {
  const p = await open(H);
  await p.goto(`${H}/?host=${H}`);
  await p.locator('nav.rail, .fr').first().waitFor();
  return p;
}
const rail = (p, name) => p.locator('nav.rail').getByRole('button', { name }).click();
// Events opens on the event list, or straight on the event that was open last.
async function toEvent(p) {
  await rail(p, 'Events');
  await p.locator('.ev-card, [role=tab][aria-label], .tabs [role=tab]').first().waitFor();
  if (!(await p.getByRole('tab', { name: 'Lobbies' }).count())) await p.locator('.ev-card').first().click();
}
async function openLobby(p, tab) {
  // Wherever Air is (Events, an event, a lobby): the lobby of the first event, on `tab`.
  if (!(await p.getByRole('tab', { name: 'Run sheet' }).count())) {
    if (!(await p.getByRole('tab', { name: 'Lobbies' }).count())) {
      await toEvent(p);
    }
    await p.getByRole('tab', { name: 'Lobbies' }).click();
    await p.getByRole('button', { name: 'Open' }).first().click();
  }
  if (tab) await p.getByRole('tab', { name: tab }).click();
}

step(1, 'First run, PUBG MOBILE, new event', async (c) => {
  const p = c.page = await air(S.H);
  await p.getByRole('button', { name: 'Get started' }).click();
  await p.getByRole('button', { name: 'Continue as guest' }).click();
  await shotIn(p, 1, 'first-run-game');
  await p.getByRole('radio', { name: /PUBG MOBILE/ }).click();
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByRole('radio').first().click();
  await shotIn(p, 1, 'first-run-setup');
  await p.getByRole('button', { name: 'Continue' }).click();
  // OBS: the dev host's in-memory OBS (its password is `secret`).
  await p.getByLabel('Password').fill('secret');
  await p.getByRole('button', { name: 'Connect', exact: true }).click();
  await p.getByText(/Connected to OBS/).waitFor();
  await p.getByRole('button', { name: 'Finish' }).click();
  await p.locator('nav.rail').waitFor();
  await p.getByLabel('New event name').fill('Air Showcase Cup');
  await p.getByRole('button', { name: 'New event', exact: true }).click();
  await p.getByRole('button', { name: 'Open Air Showcase Cup' }).click();
  await p.getByRole('tab', { name: 'Lobbies' }).waitFor();
  await shotIn(p, 1, 'new-event');
  const snap = await S.call('snapshot');
  ok(snap.setup.game === 'pubgm' && snap.events.some((e) => e.name === 'Air Showcase Cup'), 'PUBG MOBILE game and the event exist');
  ok(snap.onboardingDone !== false, 'first run finished');
  c.page = p;
});

step(2, 'Import the sheet with its pictures', async (c) => {
  const p = c.page ?? await air(S.H);
  S.sheet = makeSheet(OUT);
  if (!c.page) { await rail(p, 'Events'); await p.locator('.ev-card').first().click(); await p.getByRole('tab', { name: 'Lobbies' }).click(); }
  await p.getByRole('button', { name: 'Choose' }).first().click();
  await p.getByLabel('Paste the list here').fill(S.sheet.csv);
  await p.getByText('Found it').first().waitFor();
  ok((await p.getByText('✓ Found it').count()) >= 5, 'columns found');
  await p.getByText('Pictures · optional').waitFor();
  await p.locator('details summary', { hasText: 'Type the folder' }).click();
  await p.getByLabel('Pictures folder path').fill(S.sheet.pictures);
  await p.getByRole('button', { name: 'Look here' }).click();
  await p.locator('.pp-stat', { hasText: 'logos matched' }).waitFor();
  await p.waitForFunction(() => /16 \/ 16/.test(document.querySelector('.pp-stats')?.textContent || ''), null, { timeout: 8000 });
  ok(/64 \/ 64/.test(await p.locator('.pp-stats').innerText()), 'all 64 photos matched');
  await shotIn(p, 2, 'import-preview');
  await p.getByLabel('After importing').selectOption('groups');
  await p.getByRole('button', { name: /^Import 16 teams, 64 players/ }).click();
  await p.getByRole('heading', { name: 'Imported' }).waitFor();
  const text = await p.locator('section[aria-live]').innerText();
  ok(/16 new/.test(text) && /64 new/.test(text) && /16 logos and 64 photos/.test(text) && /Group A/.test(text), 'import result: ' + text);
  await shotIn(p, 2, 'imported');
  const snap = await S.call('snapshot');
  ok(snap.library.teams.length === 16 && snap.library.players.length === 64, 'library has 16 teams and 64 players');
  ok(snap.library.players.every((x) => /^\d+$/.test(x.uid || '') && x.photo), 'every player has a UID and a photo');
  ok(snap.library.teams.every((t) => t.logo), 'every team has a logo');
  const l = snap.lobbies.find((x) => x.title === 'Group A');
  ok(l && l.teams.length === 16, 'Group A lobby has 16 teams');
  await p.getByRole('button', { name: 'Done' }).click();
});


step(3, 'Format: Group A, 3 + 3 matches over two days, points table, readiness', async (c) => {
  const p = c.page ?? (c.page = await air(S.H));
  await openLobby(p, 'Format');
  const fill = async (n) => {
    await p.getByLabel('Number of matches').fill(String(n));
    await p.getByLabel('First match starts at').fill('16:00');
    await p.getByLabel('Minutes between matches').fill('30');
    await p.getByRole('button', { name: 'Fill the list' }).click();
  };
  await fill(3);
  await until(async () => (await S.call('snapshot')).lobbies[0].games.length === 3, 'day 1 with 3 matches');
  await p.getByRole('button', { name: '+ Day' }).click();
  await p.getByRole('tab', { name: /^Day 2/ }).click();
  // The tab resets the boxes to the new day's numbers (6 for an empty day) a moment after the click; type after that.
  await p.waitForFunction(() => document.querySelector('[aria-label="Number of matches"]')?.value === '6');
  await fill(3);
  const lob = await until(async () => { const l = (await S.call('snapshot')).lobbies[0]; return (l.games.length === 6 && l.days.length === 2) ? l : null; }, 'two days of three matches');
  ok(lob.days[0].matchIds.length === 3 && lob.days[1].matchIds.length === 3, 'days hold 3 + 3 matches: ' + JSON.stringify(lob.days.map((d) => d.matchIds.length)));
  ok(lob.games.every((g) => g.map), 'every match has a map');
  await shotIn(p, 3, 'format-matches');
  // Points table 15-12-10-8-6-4-2-1-1-1-1-1-0-0-0-0 + 1 per kill, saved on the lobby and as "my" table.
  for (let i = 0; i < 16; i++) await p.getByLabel(`Points for place ${i + 1}`, { exact: true }).fill(String(POINTS[i]));
  await p.getByLabel('Points per kill').fill('1');
  await p.getByRole('button', { name: 'Save scoring' }).click();
  await p.getByRole('button', { name: 'Save as my points table' }).click();
  await p.getByLabel('Name of the points table').fill('Showcase 15-12-10');
  await p.getByRole('button', { name: 'Save table' }).click();
  const snap = await until(async () => { const d = await S.call('snapshot'); return JSON.stringify(d.lobbies[0].scoring.placement) === JSON.stringify(POINTS) && d.pointsTables.length === 1 ? d : null; }, 'scoring and saved table');
  ok(snap.lobbies[0].scoring.perElim === 1 && snap.pointsTables[0].name === 'Showcase 15-12-10', 'scoring saved with 1 per kill and the table kept');
  await p.getByText('Complete', { exact: true }).waitFor();
  await shotIn(p, 3, 'format-points');
  // Readiness: Teams tab, Needs you · nothing.
  await p.getByRole('tab', { name: /^Teams/ }).click();
  await p.getByRole('heading', { name: 'Needs you · nothing' }).waitFor();
  await p.getByText(/Ready · \d+/).waitFor();
  await shotIn(p, 3, 'readiness-green');
});


const roomOf = async (E, code) => { const r = await (await fetch(`http://127.0.0.1:${E}/api/${code}`)).json(); return r.state ?? r; };
const lobbyOf = async () => (await S.call('snapshot')).lobbies[0];

step(4, 'HUD template, OBS scenes, vMix pages', async (c) => {
  const p = c.page ?? (c.page = await air(S.H));
  const l = await lobbyOf();
  // HUD library › ESPORTRA HUD › Broadcast Grid › Use for this lobby.
  await rail(p, 'HUD library');
  await p.locator('.pack-card').first().click();
  await p.getByRole('button', { name: 'Preview Broadcast Grid' }).click();
  await p.getByRole('button', { name: 'Use for this lobby' }).click();
  await until(async () => (await roomOf(S.E, l.code)).layout?.brHud === 'grid', 'the room to take the grid HUD');
  await p.getByRole('button', { name: 'Used by this lobby' }).waitFor();
  await p.waitForTimeout(1500);
  await shotIn(p, 4, 'hud-library-grid');
  await p.keyboard.press('Escape');
  // Live › Sources · OBS: Add Air's scenes (the dev host's in-memory OBS).
  await rail(p, 'Live');
  await p.getByRole('button', { name: /Sources · OBS/ }).click();
  await p.getByRole('switch', { name: 'Add Air’s scenes to OBS' }).click();
  const scenes = await until(async () => { const st = await (await fetch(`${S.H}/dev/state`)).json(); return ['ESPORTRA · Gameplay', 'ESPORTRA · Full screen', 'ESPORTRA · Break'].every((n) => st.obsScenes.includes(n)) ? st.obsScenes : null; }, 'Air’s three scenes in OBS');
  ok(!scenes.some((n) => /Replay|Desk/.test(n)), 'no Replay or Desk scene for a lobby: ' + scenes.join(', '));
  let snap = await S.call('snapshot');
  await until(async () => (await S.call('snapshot')).obs.installed, 'OBS installed flag');
  ok(snap.obs.missingScenes.length === 0 || (await S.call('snapshot')).obs.missingScenes.length === 0, 'no scene missing in OBS');
  await p.getByText(/In OBS: ESPORTRA/).waitFor();
  // The pages in OBS point at this lobby's room on the engine.
  const obsPages = (await S.call('snapshot')).vmix.pages;
  ok(obsPages.length >= 3 && obsPages.every((x) => x.url.includes(`:${S.E}/`) && x.url.includes(`match=${l.code}`)), 'pages follow this lobby: ' + JSON.stringify(obsPages.map((x) => x.url)));
  // vMix: the stand-in's Web API, one Web Browser input per page, paired from the dropdowns.
  const v = await S.dev('vmix', 'do=start');
  for (let i = 3; i <= obsPages.length; i++) await S.dev('vmix', `do=add&title=Browser ${i}`);
  const browserKeys = (await S.dev('vmix', 'do=list')).inputs.filter((x) => x.type === 'Browser').map((x) => x.key);
  ok(browserKeys.length >= obsPages.length, 'a Web Browser input for each page in vMix');
  await p.getByLabel('vMix address').fill(`127.0.0.1:${v.port}`);
  await p.getByRole('button', { name: 'Connect', exact: true }).click();
  await p.getByText(/Connected to vMix/).waitFor();
  for (let i = 0; i < obsPages.length; i++) {
    const pg = obsPages[i];
    await p.getByLabel(`vMix input for ${pg.label}`).selectOption({ value: browserKeys[i] });
  }
  const paired = await until(async () => { const v2 = (await S.call('snapshot')).vmix; return v2.pages.every((x) => x.status === 'paired') ? v2 : null; }, 'every page paired in vMix');
  const st = await S.dev('vmix', 'do=list');
  ok(st.refused.length === 0, 'vMix refused calls: ' + JSON.stringify(st.refused));
  ok(st.calls.every((x) => ['SetInputName', 'BrowserNavigate', 'BrowserReload'].includes(x.fn)), 'only the three documented vMix functions: ' + JSON.stringify([...new Set(st.calls.map((x) => x.fn))]));
  const navs = st.calls.filter((x) => x.fn === 'BrowserNavigate').map((x) => x.value);
  ok(navs.length >= obsPages.length && navs.every((u) => u.includes(`:${S.E}/`)), 'every input was pointed at an Air page: ' + JSON.stringify(navs));
  ok(paired.pages.length === obsPages.length, 'all pages paired');
  await p.waitForTimeout(500);
  await shotIn(p, 4, 'obs-vmix');
  await p.keyboard.press('Escape');
});


async function connectGameData(p) {
  await p.getByRole('button', { name: /Game data · / }).click();
  const dlg = p.getByRole('dialog', { name: 'Game data' });
  await dlg.getByLabel('Observer PC address').fill(`127.0.0.1:${S.pcobPort}`);
  const consent = dlg.getByRole('checkbox', { name: /Let Air read game data/ });
  if (!(await consent.isChecked())) await consent.check();
  await dlg.getByRole('button', { name: 'Connect' }).click();
  await p.locator('.pcob-state.waiting, .pcob-state.live').first().waitFor({ timeout: 15000 });
  return dlg;
}
const dayOf = async (n) => { const l = await lobbyOf(); return l.days[n - 1]; };
const gamesOf = async (dayNo) => { const l = await lobbyOf(); const d = l.days[dayNo - 1]; return d.matchIds.map((id) => l.games.find((g) => g.id === id)); };

step(5, 'Test game with the stand-in PCOB: roster check, then Start day 1', async (c) => {
  const p = c.page ?? (c.page = await air(S.H));
  const fake = await S.dev('pcob', 'do=start&speed=60&length=1500');
  ok(fake.port, 'the stand-in PCOB started for the lobby\'s teams: ' + JSON.stringify(fake));
  S.pcobPort = fake.port;
  await rail(p, 'Live');
  await S.dev('pcob', 'do=begin');
  const dlg = await connectGameData(p);
  await p.locator('.pcob-state.live').waitFor({ timeout: 15000 });
  // Roster check: all 64 players placed by their UID.
  const rc = dlg.getByLabel('Roster check');
  await rc.getByText('64 of 64').waitFor({ timeout: 15000 });
  await rc.getByText('16 of 16 teams paired').waitFor();
  await rc.getByText(/Every player in the game is placed by UID/).waitFor();
  await shotIn(p, 5, 'roster-check-64');
  await p.keyboard.press('Escape');
  // The game starts with nothing armed: Air only reads it, no match changes.
  await p.getByText('A game started but no match is armed.', { exact: true }).waitFor({ timeout: 10000 });
  ok((await lobbyOf()).games.every((g) => g.state === 'scheduled'), 'a test game with nothing armed changed no match');
  await S.dev('pcob', 'do=stop');
  await until(async () => (await p.locator('.pcob-state.live').count()) === 0 || true, 'game stop');
  // Start day 1 from the run sheet.
  await openLobby(p, 'Run sheet');
  await p.getByRole('button', { name: 'Start day 1' }).click();
  const sd = p.getByRole('dialog', { name: 'Start Day 1' });
  await sd.getByText('Points carried in').waitFor();
  await p.waitForTimeout(500);
  await shotIn(p, 5, 'start-day-1');
  await sd.getByRole('button', { name: 'Start day 1' }).click();
  const g = await until(async () => { const l = await lobbyOf(); return l.days[0].startedAt && l.games.find((x) => x.state === 'armed') ? l : null; }, 'day 1 started with Match 1 armed');
  ok(g.games.filter((x) => x.state === 'armed').length === 1 && g.days[0].matchIds[0] === g.games.find((x) => x.state === 'armed').id, 'Match 1 is the one armed');
  await shotIn(p, 5, 'run-sheet-day-1');
});


// The points the lobby's confirmed matches add up to, worked out here from the typed-in table and each match's places and
// elims (not by Air's code), per team id.
function expectedTotals(l) {
  const t = {};
  for (const g of l.games) if (g.state === 'confirmed') for (const r of g.results || []) t[r.team] = (t[r.team] || 0) + (l.scoring.placement[r.place - 1] ?? 0) + r.elims * l.scoring.perElim;
  return t;
}
async function checkStandings(l, label) {
  const room = await roomOf(S.E, l.code);
  const exp = expectedTotals(l);
  const got = Object.fromEntries((room.br?.standings || []).map((r) => [r.team, r.total]));
  for (const team of l.teams) ok((got[team.id] ?? 0) === (exp[team.id] ?? 0), `${label}: ${team.name} has ${got[team.id] ?? 0} in the room, ${exp[team.id] ?? 0} from the table`);
  const sum = Object.values(got).reduce((a, b) => a + b, 0), sumE = Object.values(exp).reduce((a, b) => a + b, 0);
  ok(sum === sumE, `${label}: standings add up to ${sum}, expected ${sumE}`);
  return { room, total: sum, standings: room.br.standings };
}

// Plays one match from armed to confirmed on Live: the stand-in game, the HUD page (grid) with a moment, the provisional
// checks, Confirm with Ctrl+Enter, the next match armed, and Match results / Overall standings put on air.
async function playMatch(c, no, dayNo, opts = {}) {
  const p = c.page;
  const l0 = await lobbyOf();
  const g0 = l0.games.find((x) => x.n === no);
  ok(g0 && g0.state === (opts.resumed ? 'live' : 'armed'), `Match ${no} is ${opts.resumed ? 'live (resumed)' : 'armed'} before the game (is ${g0 && g0.state})`);
  await rail(p, 'Live');
  const hud = c.hud ?? (c.hud = await open(S.H, { width: 1920, height: 1080 }));
  await hud.goto(`http://127.0.0.1:${S.E}/overlays/br-hud.html?match=${l0.code}`);
  if (!opts.resumed) await S.dev('pcob', 'do=begin');
  await p.locator('.run-st.live').first().waitFor({ timeout: 20000 });
  // Live: poll the HUD for the grid and a moment until the game is saved as provisional.
  const seen = new Set(); let grid = false, shot = false;
  const g1 = await until(async () => {
    const l = await lobbyOf();
    const g = l.games.find((x) => x.n === no);
    const state = await hud.evaluate((want) => ({ grid: want ? !!document.querySelector('.brh.v-grid .brh-gridbox') : !!document.querySelector('.brh'), tiles: document.querySelectorAll('.brh.v-grid .brh-t').length, mo: [...document.querySelectorAll('.brh-mo em, .brh-elim')].map((x) => x.textContent.trim().slice(0, 24)) }), opts.grid !== false).catch(() => null);
    if (state) { grid = grid || state.grid; state.mo.forEach((m) => seen.add(m)); if (!shot && state.mo.length && state.grid) { shot = true; await shotIn(hud, opts.shotStep ?? 6, `hud-live-match-${no}`); } }
    return g && g.state === 'provisional' ? g : null;
  }, `Match ${no} to be saved from the game`, 150000);
  ok(grid, `Match ${no}: the live HUD page drew the ${opts.grid === false ? 'HUD' : 'Broadcast Grid'}`);
  ok(seen.size > 0, `Match ${no}: a moment or Team eliminated showed on the HUD (saw ${[...seen].join(', ') || 'nothing'})`);
  ok(g1.source === 'pcob' && g1.results.length === 16 && g1.feed.stats.length >= (opts.players ?? 64), `Match ${no} was saved from the game with 16 teams and ${g1.feed.stats.length} players`);
  // Provisional: the checks list, then Confirm with Ctrl+Enter.
  await p.locator('.run-st.provisional').first().waitFor();
  await p.getByRole('button', { name: 'Review results' }).click();
  const pr = p.getByRole('dialog', { name: `Match ${no} results` });
  await pr.getByText('Each place once').waitFor();
  await pr.getByText('Team kills equal the players’ kills').waitFor();
  await p.waitForTimeout(400);
  await shotIn(p, 6, `match-${no}-provisional`);
  await p.keyboard.press('Escape');
  await p.keyboard.press('Control+Enter');
  const l2 = await until(async () => { const l = await lobbyOf(); const g = l.games.find((x) => x.n === no); return g.state === 'confirmed' ? l : null; }, `Match ${no} confirmed`, 10000);
  const nextInDay = l2.days[dayNo - 1].matchIds.map((id) => l2.games.find((x) => x.id === id)).find((x) => x.n > no);
  if (nextInDay) ok(nextInDay.state === 'armed', `Confirming Match ${no} armed Match ${nextInDay.n} (is ${nextInDay.state})`);
  else ok(!l2.games.some((x) => x.state === 'armed'), `nothing armed after the last match of Day ${dayNo}`);
  const st = await checkStandings(l2, `after Match ${no}`);
  ok(l2.games.find((x) => x.n === no).confirmedAt, 'Confirm stamped the match');
  // The game ends in PCOB; the producer's graphics: Match results, then Overall standings.
  await S.dev('pcob', 'do=stop');
  await p.getByRole('tab', { name: /Post-game/ }).click();
  const fs = c.fs ?? (c.fs = await open(S.H, { width: 1920, height: 1080 }));
  await fs.goto(`http://127.0.0.1:${S.E}/overlays/fullscreen.html?match=${l2.code}`);
  const lead = l2.teams.find((t) => t.id === st.standings[0].team);
  // Match results shows this match (its winner and points); Overall standings shows the lobby's totals.
  const won = g1.results.find((r) => r.place === 1);
  const winner = l2.teams.find((t) => t.id === won.team);
  const winnerPts = l2.scoring.placement[0] + won.elims * l2.scoring.perElim;
  for (const [name, id, team, pts] of [['Match results', 'br-rankings', winner, winnerPts], ['Overall standings', 'br-overall', lead, st.standings[0].total]]) {
    await p.locator('.cp-gi', { hasText: name }).first().click();
    await p.getByRole('button', { name: 'Put on air' }).click();
    await until(async () => (await S.call('snapshot')).lobbyOnAir === id, `${name} on air`, 8000);
    await until(async () => (await fs.innerText('body')).toUpperCase().includes(team.name.toUpperCase()), `${name} page on the full-screen host shows ${team.name}`, 12000);
    await fs.waitForTimeout(2600);
    const text = (await fs.innerText('body')).toUpperCase();
    ok(text.includes(team.name.toUpperCase()) && new RegExp(`\\b${pts}\\b`).test(text), `${name}: the page shows ${team.name} on ${pts}`);
    if (opts.shots !== false) await shotIn(fs, 6, `match-${no}-${id}`);
  }
  await p.getByRole('button', { name: 'Take off' }).click();
  await until(async () => !(await S.call('snapshot')).lobbyOnAir, 'graphic taken off', 6000);
  await p.getByRole('tab', { name: /Pre-game/ }).click().catch(() => {});
  return { l: l2, st };
}

step(6, 'Day 1: three matches armed, played, provisional, confirmed, graphics on air', async (c) => {
  const p = c.page ?? (c.page = await air(S.H));
  S.pcobPort ??= (await S.dev('pcob', 'do=port')).port;
  ok(S.pcobPort, 'step 5 first (the stand-in PCOB and its address)');
  // Game data is connected from step 5; Live shows it.
  await rail(p, 'Live');
  for (const no of [1, 2, 3]) {
    const r = await playMatch(c, no, 1);
    S.day1 = r;
    console.log(`  match ${no}: standings total ${r.st.total}, leader ${r.l.teams.find((t) => t.id === r.st.standings[0].team).name} on ${r.st.standings[0].total}`);
  }
  const l = await lobbyOf();
  ok(l.games.slice(0, 3).every((x) => x.state === 'confirmed') && l.games.slice(3).every((x) => x.state === 'scheduled'), 'day 1 matches confirmed, day 2 still scheduled');
  await rail(p, 'Live'); await p.waitForTimeout(500);
  await shotIn(p, 6, 'live-after-day-1-matches');
});


async function openEvent(p) {
  if (!(await p.getByRole('tab', { name: 'Lobbies' }).count())) {
    // From inside a lobby the way back is its crumb; from anywhere else Events.
    if (await p.getByRole('button', { name: '← Lobbies' }).count()) await p.getByRole('button', { name: '← Lobbies' }).click();
    else await toEvent(p);
  }
  await p.getByRole('tab', { name: 'Lobbies' }).click();
}
async function closeDay(c, dayNo, label) {
  const p = c.page;
  await openLobby(p, 'Run sheet');
  await p.getByRole('button', { name: `Close day ${dayNo}` }).click();
  const cd = p.getByRole('dialog', { name: `Close Day ${dayNo}` });
  await cd.getByText('Every match is confirmed or void').waitFor();
  const l = await lobbyOf();
  // The day's table: each row's Day + Adj = what the matches of the day add up to, and Total = all days so far.
  const dayGames = l.days[dayNo - 1].matchIds.map((id) => l.games.find((g) => g.id === id));
  ok(dayGames.every((g) => g.state === 'confirmed'), `Day ${dayNo}: every match confirmed`);
  const dayPts = {};
  for (const g of dayGames) for (const r of g.results) dayPts[r.team] = (dayPts[r.team] || 0) + (l.scoring.placement[r.place - 1] ?? 0) + r.elims * l.scoring.perElim;
  const rows = await cd.locator('table.lb-st tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));
  ok(rows.length === 16, `Day ${dayNo}: the table lists 16 teams`);
  const exp = expectedTotals(l);
  for (const r of rows) {
    const team = l.teams.find((t) => r[1].includes(t.name));
    ok(team, 'team of row ' + r[1]);
    ok(Number(r[2]) === (dayPts[team.id] || 0), `Day ${dayNo}: ${team.name} Day column ${r[2]} vs ${dayPts[team.id] || 0}`);
    ok(Number(r[4]) === (exp[team.id] || 0), `Day ${dayNo}: ${team.name} Total column ${r[4]} vs ${exp[team.id] || 0}`);
  }
  ok(rows.every((r, i) => i === 0 || Number(r[4]) <= Number(rows[i - 1][4])), `Day ${dayNo}: the table is in points order`);
  const sumDay = rows.reduce((a, r) => a + Number(r[2]), 0);
  ok(sumDay === Object.values(dayPts).reduce((a, b) => a + b, 0), `Day ${dayNo}: the Day column adds up (${sumDay})`);
  await p.waitForTimeout(400);
  await shotIn(p, label, `close-day-${dayNo}`);
  // Put Day N standings on air: the full-screen host draws DAY N STANDINGS with these numbers.
  await cd.getByRole('button', { name: `Put Day ${dayNo} standings on air` }).click();
  await until(async () => (await S.call('snapshot')).lobbyOnAir === 'br-day', 'Day standings on air', 8000);
  const fs = c.fs ?? (c.fs = await open(S.H, { width: 1920, height: 1080 }));
  await fs.goto(`http://127.0.0.1:${S.E}/overlays/fullscreen.html?match=${l.code}`);
  await until(async () => /DAY \d+ STANDINGS/i.test(await fs.innerText('body')), 'the Day standings page', 15000);
  await fs.waitForTimeout(3000);
  const text = (await fs.innerText('body')).toUpperCase();
  ok(text.includes(`DAY ${dayNo} STANDINGS`), `the page reads DAY ${dayNo} STANDINGS`);
  const room = await roomOf(S.E, l.code);
  ok(room.brDay && room.brDay.rows.length === 16, 'the room carries brDay with 16 rows');
  for (const r of room.brDay.rows) {
    ok(r.days.reduce((a, b) => a + b, 0) === r.total, `brDay: ${r.team} days ${JSON.stringify(r.days)} add up to ${r.total}`);
    ok(r.total === (exp[r.team] || 0), `brDay: ${r.team} total ${r.total} matches the table ${exp[r.team] || 0}`);
  }
  const lead = l.teams.find((t) => t.id === room.brDay.rows[0].team);
  ok(text.includes(lead.name.toUpperCase()) && new RegExp(`\\b${room.brDay.rows[0].total}\\b`).test(text), `the page shows the leader ${lead.name} on ${room.brDay.rows[0].total}`);
  await shotIn(fs, label, `day-${dayNo}-standings-on-air`);
  await cd.getByRole('button', { name: `Close day ${dayNo}` }).click();
  await until(async () => (await lobbyOf()).days[dayNo - 1].closedAt, `Day ${dayNo} closed`, 8000);
  await shotIn(p, label, `day-${dayNo}-closed`);
  return { rows, lead, total: Object.values(exp).reduce((a, b) => a + b, 0) };
}
async function saveEventFile(c, label) {
  const p = c.page;
  await openEvent(p);
  await p.getByRole('button', { name: /Event file/ }).click();
  await p.getByRole('menuitem', { name: /Save event file/ }).click();
  const m = p.getByRole('dialog', { name: 'Event file saved' });
  await m.waitFor({ timeout: 20000 });
  const text = await m.innerText();
  await shotIn(p, label, 'event-file-saved');
  await m.getByRole('button', { name: 'Done' }).click();
  return text;
}

step(7, 'Close day 1, Day 1 standings on air, save the event file', async (c) => {
  const p = c.page ?? (c.page = await air(S.H));
  const r = await closeDay(c, 1, 7);
  S.day1Total = r.total;
  const text = await saveEventFile(c, 7);
  ok(/Saved .*\.airevent/.test(text) && /16 teams|Teams/i.test(text) || /airevent/.test(text), 'event file saved: ' + text.slice(0, 200));
  const dir = path.join(S.dataDir, 'Event files');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.airevent')) : [];
  ok(files.length >= 1, 'the event file is on disk in ' + dir);
  S.eventFile = path.join(dir, files[0]);
  const bundle = JSON.parse(fs.readFileSync(S.eventFile, 'utf8'));
  const lobbyIn = (bundle.lobbies || [])[0];
  ok(lobbyIn && lobbyIn.games.filter((g) => g.state === 'confirmed').length === 3, 'the file holds the 3 confirmed matches of day 1');
  console.log(`  day 1 closed, ${r.total} points in all, event file ${path.basename(S.eventFile)}`);
});


// First run as a guest: PUBG MOBILE, this PC's own graphics, the dev host's OBS.
async function firstRun(p, { email, password } = {}) {
  await p.getByRole('button', { name: 'Get started' }).click();
  if (email) {
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Password').fill(password);
    await p.getByRole('button', { name: 'Sign in' }).click();
  } else await p.getByRole('button', { name: 'Continue as guest' }).click();
  await p.getByRole('radio', { name: /PUBG MOBILE/ }).click();
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByRole('radio').first().click();
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByLabel('Password').fill('secret');
  await p.getByRole('button', { name: 'Connect', exact: true }).click();
  await p.getByText(/Connected to OBS/).waitFor();
  await p.getByRole('button', { name: 'Finish' }).click();
  await p.locator('nav.rail').waitFor();
}
async function startDay(c, dayNo, shotStep) {
  const p = c.page;
  await openLobby(p, 'Run sheet');
  await p.getByRole('button', { name: `Start day ${dayNo}` }).click();
  const sd = p.getByRole('dialog', { name: `Start Day ${dayNo}` });
  await sd.getByText('Points carried in').waitFor();
  const text = await sd.innerText();
  await p.waitForTimeout(500);
  await shotIn(p, shotStep, `start-day-${dayNo}`);
  await sd.getByRole('button', { name: `Start day ${dayNo}` }).click();
  const l = await until(async () => { const x = await lobbyOf(); return x.days[dayNo - 1].startedAt && x.games.find((g) => g.state === 'armed') ? x : null; }, `Day ${dayNo} started with its first match armed`, 10000);
  ok(l.days[dayNo - 1].matchIds[0] === l.games.find((g) => g.state === 'armed').id, `the first match of Day ${dayNo} is the one armed`);
  return text;
}
// Names, not ids: a restored event keeps its teams by name, with new ids when it is added as a copy.
const totalsByName = (l) => { const e = expectedTotals(l); return Object.fromEntries(l.teams.map((t) => [t.name, e[t.id] || 0])); };

step(8, 'Day 2: Start day 2, restart Air mid-match, Resume, finish, confirm', async (c) => {
  const p = c.page ?? (c.page = await air(S.H));
  S.pcobPort ??= (await S.dev('pcob', 'do=port')).port;
  const t = await startDay(c, 2, 8);
  const l1 = await lobbyOf();
  const carry = totalsByName(l1);
  const top = Object.entries(carry).sort((a, b) => b[1] - a[1])[0];
  ok(t.toUpperCase().includes(top[0].toUpperCase()) && new RegExp(`\\b${top[1]}\\b`).test(t), `Start day 2 carries the day 1 leader ${top[0]} on ${top[1]} in`);
  const m4 = l1.games.find((g) => g.state === 'armed');
  ok(m4.n === 4, 'Match 4 armed');
  await rail(p, 'Live');
  await S.dev('pcob', 'do=begin');
  await p.locator('.run-st.live').first().waitFor({ timeout: 20000 });
  // Let the game run so teams go out and a few checkpoints (every 2 s) are saved.
  await p.waitForTimeout(9000);
  ok((await lobbyOf()).games.find((g) => g.n === 4).state === 'live', 'Match 4 is live before the restart');
  await shotIn(p, 8, 'before-restart-live');
  // Restart Air: the host stops and starts again on the same data folder (the engine restarts with it).
  await p.close(); c.page = null; if (c.hud) { await c.hud.close(); c.hud = null; } if (c.fs) { await c.fs.close(); c.fs = null; }
  await quitHost(S.H);
  c.hostProc = spawnHost(hostPort, Number(S.E), S.dataDir);
  await waitHost(S.H);
  const p2 = c.page = await air(S.H);
  const offer = await until(async () => (await S.call('snapshot')).brResume, 'the resume offer after the restart', 15000);
  ok(offer.n === 4 && offer.placed >= 1, 'Air offers to resume Match 4 with teams already out: ' + JSON.stringify(offer));
  ok((await lobbyOf()).games.find((g) => g.n === 4).state === 'live', 'Match 4 is still live after the restart');
  await rail(p2, 'Live');
  await p2.getByText(/Air closed during Match 4/).waitFor();
  await p2.waitForTimeout(300);
  await shotIn(p2, 8, 'resume-prompt');
  await p2.getByRole('button', { name: 'Resume', exact: true }).click();
  await until(async () => !(await S.call('snapshot')).brResume, 'the resume offer to go', 8000);
  ok((await lobbyOf()).games.find((g) => g.n === 4).state === 'live', 'Match 4 carries on live after Resume');
  // The stand-in game died with the host: the observer client is back with a fresh game for the same match (consent asked again).
  const fake = await S.dev('pcob', 'do=start&speed=60&length=1500');
  ok(fake.port, 'the stand-in PCOB is back'); S.pcobPort = fake.port;
  await S.dev('pcob', 'do=begin');
  await connectGameData(p2);
  await p2.keyboard.press('Escape');
  const r = await playMatch(c, 4, 2, { resumed: true, shots: false });
  S.afterM4 = totalsByName(r.l);
  await shotIn(p2, 8, 'match-4-confirmed');
  const text = await saveEventFile(c, 8);
  ok(/airevent/.test(text), 'event file saved after Match 4: ' + text.slice(0, 120));
  const files = fs.readdirSync(path.join(S.dataDir, 'Event files')).filter((f) => f.endsWith('.airevent')).map((f) => path.join(S.dataDir, 'Event files', f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  S.eventFile = files[0];
  const bundle = JSON.parse(fs.readFileSync(S.eventFile, 'utf8'));
  ok(bundle.lobbies[0].games.filter((g) => g.state === 'confirmed').length === 4, 'the new event file holds 4 confirmed matches');
  console.log(`  resumed Match 4 and confirmed it; ${Object.values(S.afterM4).reduce((a, b) => a + b, 0)} points in all`);
});

step(9, 'Second fresh profile: open the event file, restore check, day 2 matches 5-6, close day 2, Champions', async (c) => {
  if (!S.eventFile) {
    // Run on its own: the newest event file of the first profile, and the numbers it holds.
    const dirA = path.join(OUT, 'profile-a', 'Event files');
    S.eventFile = fs.readdirSync(dirA).filter((f) => f.endsWith('.airevent')).map((f) => path.join(dirA, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    S.afterM4 = totalsByName(JSON.parse(fs.readFileSync(S.eventFile, 'utf8')).lobbies[0]);
  }
  ok(S.eventFile && S.afterM4, 'step 8 first (the event file and the numbers after Match 4)');
  if (c.page) { await c.page.close(); c.page = null; }
  if (c.hud) { await c.hud.close(); c.hud = null; } if (c.fs) { await c.fs.close(); c.fs = null; }
  await quitHost(S.H);
  const dirB = path.join(OUT, 'profile-b');
  await freeHost(`http://127.0.0.1:${hostPort + 1}`);
  fs.rmSync(dirB, { recursive: true, force: true });
  fs.mkdirSync(path.join(dirB, 'Event files'), { recursive: true });
  fs.copyFileSync(S.eventFile, path.join(dirB, 'Event files', path.basename(S.eventFile)));
  S.H = `http://127.0.0.1:${hostPort + 1}`; S.E = String(Number(E1) + 1); S.dataDir = dirB;
  S.call = mkCall(S.H); S.dev = mkDev(S.H);
  c.hostProc = spawnHost(hostPort + 1, Number(S.E), dirB);
  await waitHost(S.H);
  const p = c.page = await air(S.H);
  await firstRun(p);
  await p.getByRole('button', { name: 'Open event file…' }).click();
  const rc = p.getByRole('dialog', { name: 'Restore check' });
  await rc.getByText('Restore check').first().waitFor();
  const counts = Object.fromEntries(await rc.locator('.li').evaluateAll((els) => els.map((e) => [e.children[0].textContent.trim(), Number(e.children[1].textContent)])));
  ok(counts.Lobbies === 1 && counts.Teams === 16 && counts.Players === 64 && counts.Results === 4 && counts.Pictures >= 80, 'restore check counts: ' + JSON.stringify(counts));
  await shotIn(p, 9, 'restore-check');
  await rc.getByRole('button', { name: /^Restore|Add/ }).click();
  await p.getByRole('button', { name: 'Open Air Showcase Cup' }).waitFor({ timeout: 20000 });
  const notice = await p.getByText(/is on this PC/).count();
  await shotIn(p, 9, 'restored-events');
  ok(notice > 0, 'after the restore Events says the event is on this PC');
  const snap = await S.call('snapshot');
  const l = snap.lobbies[0];
  ok(l && l.teams.length === 16 && l.games.filter((g) => g.state === 'confirmed').length === 4, 'restored: 16 teams, 4 confirmed matches');
  const got = totalsByName(l);
  for (const [name, pts] of Object.entries(S.afterM4)) ok(got[name] === pts, `restored: ${name} has ${got[name]}, had ${pts}`);
  ok(l.games.find((g) => g.n === 5).state === 'armed', 'Match 5 is armed in the restored lobby');
  ok(snap.library.players.length === 64 && snap.library.teams.every((t) => t.logo), 'players and logos came with the file');
  await openLobby(p, 'Run sheet');
  await p.getByRole('button', { name: 'Use this lobby on the graphics' }).click().catch(() => {});
  await until(async () => (await S.call('snapshot')).selectedLobbyId === l.id, 'the restored lobby on the graphics', 8000);
  const room = await until(async () => { const r = await roomOf(S.E, l.code); return r.br?.standings?.length ? r : null; }, 'the restored lobby in the room', 8000);
  ok(room.layout?.brHud === 'grid', 'the restored lobby keeps the Broadcast Grid HUD');
  const logo = (await S.call('snapshot')).library.teams[0].logo;
  ok((await fetch(`http://127.0.0.1:${S.E}${logo}`)).ok, 'a restored logo loads from the engine: ' + logo);
  await shotIn(p, 9, 'restored-run-sheet');
  // The stand-in PCOB for the restored teams (their UIDs came with the file), then Match 5 and 6.
  const fake = await S.dev('pcob', 'do=start&speed=60&length=1500');
  ok(fake.port, 'stand-in PCOB for the restored lobby'); S.pcobPort = fake.port;
  await rail(p, 'Live');
  await connectGameData(p);
  await p.keyboard.press('Escape');
  for (const no of [5, 6]) { const r = await playMatch(c, no, 2, { shots: no === 6 }); S.last = r; }
  const l2 = await lobbyOf();
  ok(l2.games.every((g) => g.state === 'confirmed'), 'all 6 matches confirmed');
  const r2 = await closeDay(c, 2, 9);
  const exp = totalsByName(l2);
  const champion = Object.entries(exp).sort((a, b) => b[1] - a[1])[0];
  ok(r2.lead.name === champion[0], `the Day 2 leader is the champion ${champion[0]}`);
  // Champions on air.
  await rail(p, 'Live');
  await p.getByRole('tab', { name: /Post-game/ }).click();
  await p.locator('.cp-gi', { hasText: 'Champions' }).first().click();
  await p.getByRole('button', { name: 'Put on air' }).click();
  await until(async () => (await S.call('snapshot')).lobbyOnAir === 'br-champion', 'Champions on air', 8000);
  const fs2 = c.fs ?? (c.fs = await open(S.H, { width: 1920, height: 1080 }));
  await fs2.goto(`http://127.0.0.1:${S.E}/overlays/fullscreen.html?match=${l2.code}`);
  await until(async () => (await fs2.innerText('body')).toUpperCase().includes('CHAMPIONS'), 'the Champions page', 15000);
  await fs2.waitForTimeout(3500);
  const text = (await fs2.innerText('body')).toUpperCase();
  ok(text.includes(champion[0].toUpperCase()) && new RegExp(`\\b${champion[1]}\\b`).test(text), `Champions shows ${champion[0]} on ${champion[1]}`);
  await shotIn(fs2, 9, 'champions-on-air');
  console.log(`  champion ${champion[0]} on ${champion[1]}, ${Object.values(exp).reduce((a, b) => a + b, 0)} points in all`);
});


step(10, 'The same through "Use a stage from Esportra": Start day 1 and one confirmed match', async (c) => {
  if (c.page) { await c.page.close(); c.page = null; }
  if (c.hud) { await c.hud.close(); c.hud = null; } if (c.fs) { await c.fs.close(); c.fs = null; }
  await quitHost(S.H);
  const dirC = path.join(OUT, 'profile-c');
  await freeHost(`http://127.0.0.1:${hostPort + 2}`);
  fs.rmSync(dirC, { recursive: true, force: true });
  S.H = `http://127.0.0.1:${hostPort + 2}`; S.E = String(Number(E1) + 2); S.dataDir = dirC;
  S.call = mkCall(S.H); S.dev = mkDev(S.H);
  c.hostProc = spawnHost(hostPort + 2, Number(S.E), dirC);
  await waitHost(S.H);
  const creds = JSON.parse(fs.readFileSync(path.join(OUT, `host-${hostPort + 2}.log`), 'utf8').split('\n').filter((x) => x.startsWith('{"esportra"')).pop());
  const p = c.page = await air(S.H);
  await firstRun(p, creds);
  await p.getByLabel('New event name').fill('Spring Cup');
  await p.getByRole('button', { name: 'New event', exact: true }).click();
  await p.getByRole('button', { name: 'Open Spring Cup' }).click();
  await p.getByRole('tab', { name: 'Lobbies' }).click();
  await p.getByRole('button', { name: 'Pick a stage from Esportra' }).click();
  await p.locator('.pp-opt[aria-pressed]').first().click();
  await p.getByRole('heading', { name: /Spring Clash · Qualifiers/ }).waitFor();
  await p.getByText('Points table', { exact: false }).first().waitFor();
  await p.waitForTimeout(600);
  await shotIn(p, 10, 'esportra-stage');
  await p.getByRole('button', { name: 'Use this stage' }).click();
  await p.getByText(/Following Esportra/).first().waitFor({ timeout: 20000 });
  // The groups are made one after another; wait for the last.
  let snap;
  try { snap = await until(async () => { const d = await S.call('snapshot'); return d.lobbies.length === 2 && d.lobbies.every((l) => l.teams.length === 16) ? d : null; }, 'both groups made from the stage', 20000); }
  catch (e) { const d = await S.call('snapshot'); throw new Error(e.message + ' ' + JSON.stringify(d.lobbies.map((l) => [l.title, l.teams.length, l.games.length])) + ' held ' + JSON.stringify(d.esportraStages.followed.map((f) => f.held))); }
  ok(snap.esportraStages.followed[0].held.length === 0, 'nothing held back: ' + JSON.stringify(snap.esportraStages.followed[0].held));
  ok(snap.lobbies.length === 2 && snap.lobbies.every((l) => l.source?.esportra && l.teams.length === 16 && l.games.length === 6), 'two lobbies (one per group) with 16 teams and 6 matches each, got ' + JSON.stringify(snap.lobbies.map((l) => [l.title, l.teams.length, l.games.length, !!l.source])));
  const lob = snap.lobbies.find((l) => l.title === 'Group A');
  ok(JSON.stringify(lob.scoring.placement) === JSON.stringify(POINTS) && lob.scoring.perElim === 1, 'the points table came from Esportra');
  ok(lob.days.length === 2 && lob.days.every((d) => d.matchIds.length === 3), 'two days of three matches from the schedule: ' + JSON.stringify(lob.days.map((d) => d.matchIds.length)));
  await shotIn(p, 10, 'esportra-used');
  // Format and readiness (no UIDs come from Esportra: the sheet says so and asks for them).
  await p.getByRole('button', { name: '← Spring Cup' }).click();
  await p.getByRole('tab', { name: 'Lobbies' }).click();
  await p.locator('.li', { hasText: 'Group A' }).getByRole('button', { name: 'Open' }).click();
  await p.getByRole('tab', { name: 'Format' }).click();
  await p.getByText('Complete', { exact: true }).waitFor();
  await shotIn(p, 10, 'esportra-format');
  await p.getByRole('tab', { name: /^Teams/ }).click();
  await p.getByText(/Needs you · \d+/).waitFor();
  await shotIn(p, 10, 'esportra-readiness');
  // Group A on the graphics.
  await p.getByRole('button', { name: 'Use this lobby on the graphics' }).click().catch(() => {});
  await until(async () => (await S.call('snapshot')).selectedLobbyId === lob.id, 'Group A on the graphics', 8000);
  c.lobbyTitle = 'Group A';
  // Start day 1, the stand-in PCOB for these teams, one match to Confirm.
  const sd = await startDay(c, 1, 10);
  const fake = await S.dev('pcob', 'do=start&speed=60&length=1500');
  ok(fake.port, 'stand-in PCOB for the stage teams'); S.pcobPort = fake.port;
  await rail(p, 'Live');
  await connectGameData(p);
  await p.keyboard.press('Escape');
  const r = await playMatch(c, 1, 1, { shots: false, grid: false, players: 60, shotStep: 10 });
  ok(r.st.total > 0, 'a confirmed match with points: ' + r.st.total);
  await shotIn(p, 10, 'esportra-match-1-confirmed');
  console.log(`  stage lobby: Match 1 confirmed, ${r.st.total} points`);
});

//STEPS-HERE

const MAIN = async () => {
  browser = await chromium.launch();
  const c = {};
  let code = 0;
  for (const st of STEPS) {
    if (st.n < FROM || st.n > TO) continue;
    const before = problems.length;
    try {
      await st.fn(c);
      if (problems.length > before) throw new Error('page problems: ' + problems.slice(before).join(' | '));
      results.push([st.n, st.title, 'PASS']);
      console.log(`step ${st.n} PASS  ${st.title}`);
    } catch (e) {
      code = 1; failures++;
      results.push([st.n, st.title, 'FAIL ' + e.message]);
      console.log(`step ${st.n} FAIL  ${st.title}\n  ${e.message}`);
      try { if (c.page) await shotIn(c.page, st.n, 'FAIL'); } catch {}
      break;
    }
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  await browser.close();
  for (const ch of children) ch.kill('SIGTERM');
  process.exit(code);
};
MAIN().catch((e) => { console.error(e); process.exit(1); });
