// Esportra AIR · loop reel v2 (26 Nov): problem, then solution. The same 79.5 s of music (bars every 2 s from 1.5 s, the
// second drop at 49.5 s) and the same seamless loop (the last frame is frame 0), rebuilt on one design system
// (dev/reel-frame.css + dev/reel-frame.cjs): stage black, square surfaces, Inter and JetBrains Mono, a Swiss 12-column
// grid, one rose accent, entrance and exit curves, clip + rise + scale reveals, 40 ms staggers, a camera with three
// parallax layers, and every scene change a 600 ms crossover (spec 7: nothing cuts, snaps or punches in). AIR's real
// graphics appear only in the solution; AIR's own window is filmed through a virtual camera that eases between framings.
//   0 - 27.5 s   dev/reel/problem-solution.html (the problem, Esportra holding it once, AIR picking it all up; AIR's
//                window is composited into it)
//   27.5 - 35.5  five beats: the data from Esportra becomes real graphics
//   35.5 - 41.5  by hand, not on Esportra (its own visual mode)
//   41.5 - 63.5  Valorant, PUBG MOBILE      63.5 - 69.5  Graphics studio      69.5 - 73.5  more games
//   73.5 - 79.5  From bracket to broadcast, the result goes back, the lockup lands on frame 0
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   REEL_BRAND=<lockup + mark> REEL_PHOTOS=<9 player cutouts> REEL_TALENT=<2 talent photos> REEL_MUSIC=<loop track .wav> \
//     REEL_SFX=<sfx dir> REEL_PY=<python with opencv> node dev/showreel-loop2.cjs [host] [engine port] <out dir> [--stills]
// Photos, the lockup and the music are the producer's and never go in the repo; posters come from the Esportra site's
// assets (../esportra/public); emblems and sponsor marks are drawn here.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const S = require('./reel-setup.cjs');
const E = require('./reel-emblems.cjs');
const RF = require('./reel-frame.cjs');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const H = args[0] || 'http://127.0.0.1:5334';
const ENGINE = args[1] || '5396';
const OUT = args[2] || path.join(process.cwd(), 'showreel-loop2');
const STILLS = process.argv.includes('--stills');
const h = S.connect(H, ENGINE);
const { ENG, call, patchRoom, action, LOTUS } = h;
const SITE = process.env.ESPORTRA_SITE || path.join(__dirname, '../../../../esportra/public');
const PHOTOS = process.env.REEL_PHOTOS || '';
const TALENT = process.env.REEL_TALENT || '';
const MUSIC = process.env.REEL_MUSIC || '';
const FPS = kit.FPS;
const F = (secs) => Math.round(secs * FPS);
const sleep = S.sleep;
const dataUrl = (file, type = 'image/png') => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const { VAL } = S;
const PAGE = 'file://' + path.join(__dirname, 'reel/problem-solution.html') + '?record=1';

// The cut sheet, on the edited track's bars (seconds). The last frame is the first: the Esportra lockup.
const BEAT = 48 / FPS;                    // five beats of 48 frames (1.6 s)
const T = {
  page: 0, beat: 27.5, byHand: 35.5, agents: 41.5, hud: 43.5,
  drop: 49.5, today: 51.5, brhud: 53.5, standings: 57.5, mvp: 59.5, wwcd: 61.5, studio: 63.5, close: 69.5, word: 73.5, back: 76.5, out: 79.5,
};
let AIR_FROM = 20.17;                     // AIR's window opens in the page; its capture starts then (set from the capture's length)
let CAP = F(27.5) - F(AIR_FROM) - 1;      // capture frames the AIR act needs (the window is open for the rest of the page)
const BH_CAP = F(T.agents) - F(T.byHand) - F(0.45); // by-hand capture frames (the window opens 0.45 s in)

// Esportra's side of the story, served by the dev host's stand-in Esportra (FakeEsportra.showcase).
const SHOWCASE = {
  tournamentName: 'Esportra Invitational',
  matches: [
    { teamA: 'NIGHT OWLS', tagA: 'NWL', logoA: null, teamB: 'CRIMSON FIVE', tagB: 'CRF', logoB: null, bestOf: 3, inHours: 2,
      veto: [{ team: 1, action: 'ban', map: 'Bind', side: null }, { team: 0, action: 'ban', map: 'Abyss', side: null },
        { team: 1, action: 'pick', map: 'Haven', side: 'DEF', sideTeam: 0 }, { team: 0, action: 'pick', map: 'Sunset', side: 'ATK', sideTeam: 1 },
        { team: 1, action: 'ban', map: 'Ascent', side: null }, { team: 0, action: 'ban', map: 'Corrode', side: null },
        { team: -1, action: 'decider', map: 'Lotus', side: 'ATK', sideTeam: 0 }] },
    { teamA: 'VOLTAGE', tagA: 'VLT', logoA: null, teamB: 'HELIX', tagB: 'HLX', logoB: null, bestOf: 1, inHours: 0.5 },
  ],
  lineups: {
    NWL: ['Juno', 'Mira', 'Dax', 'Riku', 'Echo'].map((n) => ({ name: n, riot: `${n}#NWL` })),
    CRF: ['Kairo', 'Sol', 'Vex', 'Nyx', 'Zen'].map((n) => ({ name: n, riot: `${n}#CRF` })),
  },
  talent: [{ name: 'Sam "Sparrow" Reyes', role: 'Caster' }, { name: 'Alex Lin', role: 'Caster' }],
  sponsors: [{ name: 'NOVA ENERGY', logoUrl: 'https://example.com/reel/nova.png' }, { name: 'ARCLIGHT PC', logoUrl: 'https://example.com/reel/arclight.png' }, { name: 'KITE NETWORK', logoUrl: 'https://example.com/reel/kite.png' }],
};
const VETO = SHOWCASE.matches[0].veto.map((s) => ({ team: s.team, action: s.action, map: s.map.toUpperCase(), ...(s.side ? { side: s.side } : {}) }));
// Sponsor marks drawn here: flat monochrome glyphs (the system's palette has no other hue)
const SPONSORS = [
  { name: 'NOVA ENERGY', tier: 'TITLE', line: 'Official energy partner', color: '#FAFAFA', glyph: 'M14 2 4 14h7l-2 8 10-12h-7z' },
  { name: 'ARCLIGHT PC', tier: 'PARTNER', line: 'Powering every observer', color: '#FAFAFA', glyph: 'M3 18a9 9 0 0 1 18 0h-3a6 6 0 0 0-12 0z' },
  { name: 'KITE NETWORK', tier: 'SUPPORTER', line: 'Low-latency partner', color: '#FAFAFA', glyph: 'M12 2 20 10 12 22 4 10z' },
];
const sponsorSvg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="200" viewBox="0 0 720 200"><rect width="720" height="200" fill="none"/><g transform="translate(24 40) scale(5)"><path d="${s.glyph}" fill="${s.color}"/></g><text x="170" y="122" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="62" letter-spacing="-2" fill="#FAFAFA">${s.name}</text></svg>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const LOCAL = new Map();
  const serve = (name, body, type = 'image/png') => { LOCAL.set(name, { body, type }); return `http://reel.local/${name}`; };
  const FONTS = RF.fontCss(serve);
  const BRAND = process.env.REEL_BRAND || '';
  const brandFile = (f, fallback) => (BRAND && fs.existsSync(path.join(BRAND, f)) ? path.join(BRAND, f) : path.join(__dirname, '../../../assets/brand', fallback));
  const MARK = serve('mark.png', fs.readFileSync(brandFile('esportra-mark.png', 'esportra-mark.png')));
  const MARK_DATA = dataUrl(brandFile('esportra-mark.png', 'esportra-mark.png'));
  const LOCKUP = BRAND && fs.existsSync(path.join(BRAND, 'esportra-lockup.png')) ? serve('lockup.png', fs.readFileSync(path.join(BRAND, 'esportra-lockup.png'))) : MARK;
  const POSTER = (n) => serve(`poster-${n}.png`, fs.readFileSync(path.join(SITE, `games/${n}-logo.png`)));
  const localRoute = (c) => c.route('http://reel.local/**', (r) => { const v = LOCAL.get(path.basename(new URL(r.request().url()).pathname)); return v ? r.fulfill({ status: 200, contentType: v.type, headers: { 'access-control-allow-origin': '*' }, body: v.body }) : r.fulfill({ status: 404, body: '' }); });

  // ═════ Pictures: emblems and sponsor marks drawn here; the producer's player and talent photos ═════
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const scratch = await ctx.newPage();
  const emb = async (i, tag, color) => 'data:image/png;base64,' + (await E.png(scratch, E.svg(i, tag, color))).toString('base64');
  const emblems = [];
  for (let i = 0; i < S.NAMES.length; i++) emblems[i] = await emb(i, S.TAGS[i], S.COLORS[i % S.COLORS.length]);
  const EMB = { NWL: emblems[0], CRF: emblems[1], NCT: await emb(19, 'NCT', '#7c3aed'), RRG: await emb(22, 'RRG', '#ef4444') };
  const sponsorPng = [];
  for (const s of SPONSORS) {
    await scratch.setContent(`<html><head><style>${FONTS}</style></head><body style="margin:0;background:transparent"><div id="e" style="width:720px;height:200px">${sponsorSvg(s)}</div></body></html>`);
    await scratch.evaluate(() => document.fonts.ready);
    sponsorPng.push(await scratch.locator('#e').screenshot({ omitBackground: true }));
  }
  await scratch.close();
  const files = (dir) => (dir ? fs.readdirSync(dir).filter((f) => /^\d+\.png$/i.test(f)).sort().map((f) => path.join(dir, f)) : []);
  const photoFiles = files(PHOTOS), talentFiles = files(TALENT);
  const photos = photoFiles.map((f) => dataUrl(f)), talents = talentFiles.map((f) => dataUrl(f));
  // Talent photos are placed by their faces (spec 5), computed once here.
  const faceInfo = talentFiles.length ? RF.faceBoxes(talentFiles, process.env.REEL_PY) : [];
  // The producer's portraits (dev/reel-portraits.py order): NIGHT OWLS 00, 03, 01, 02, 04; NORTH TIDE 05, 07, 06; NOCTURNE KAI 08.
  const NWL = [['JUNO', 0, 'Duelist'], ['MIRA', 3, 'Controller'], ['DAX', 1, 'Initiator'], ['RIKU', 2, 'Sentinel'], ['ECHO', 4, 'Flex']];
  const CRF = ['KAIRO', 'SOL', 'VEX', 'NYX', 'ZEN'];
  const BYHAND = [['NTD_ACE', 5], ['NTD_VEX', 7], ['NTD_ROOK', 6]];
  const names = [...S.NAMES], tags = [...S.TAGS];
  names[0] = 'NOCTURNE'; tags[0] = 'NCT'; names[1] = 'RED RIDGE'; tags[1] = 'RRG';
  const lobbyLogo = (i) => (i === 0 ? EMB.NCT : i === 1 ? EMB.RRG : emblems[i]);
  const lobbyPhoto = (i, j) => (i === 0 && j === 3 ? photos[8] : null) || null;

  // ═════ Off camera: Esportra's tournament, the producer's library, through Air ═════
  const seed = await fetch(`${H}/dev/esportra`, { method: 'POST', body: JSON.stringify({ showcase: SHOWCASE }) });
  if (!seed.ok) throw new Error('showcase seed ' + seed.status);
  await call('chooseGame', ['valorant']); await call('finishOnboarding');
  await call('esportraSignIn', ['producer@example.com', 'correct horse battery']);
  const upload = (u) => (u ? call('uploadImage', [u]) : '');
  for (const [team, tag, color, list] of [['NIGHT OWLS', 'NWL', '#22d3ee', NWL], ['CRIMSON FIVE', 'CRF', '#f43f5e', CRF.map((n) => [n, -1, ''])]]) {
    await call('saveTeam', [{ name: team, tag, color, logo: await upload(EMB[tag]) }]);
    const t = (await call('snapshot')).library.teams.find((x) => x.name === team);
    for (const [n, ph, role] of list) await call('savePlayer', [{ name: n, realName: '', gameId: `${n[0]}${n.slice(1).toLowerCase()}#${tag}`, photo: ph >= 0 ? await upload(photos[ph]) : '', role, teamId: t.id }]);
  }
  const routes = async (c) => {
    await c.route('https://example.com/reel/**', (r) => { const k = ['nova', 'arclight', 'kite'].findIndex((n) => r.request().url().includes(n)); r.fulfill({ status: 200, contentType: 'image/png', body: sponsorPng[Math.max(0, k)] }); });
  };
  await routes(ctx); await localRoute(ctx);

  // ═════ Air's own screen, filmed off camera: every frame is Air's full 1280x720 picture; the virtual camera frames it later ═════
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await kit.prepare(appCtx); await routes(appCtx);
  const app = await appCtx.newPage(); const errs = [];
  app.on('pageerror', (e) => errs.push('app: ' + e.message));
  const src = kit.recorder(path.join(OUT, 'src-unused'));
  const ui = kit.chrome(app, FONTS);
  const tmp = path.join(OUT, 'picks'); fs.mkdirSync(tmp, { recursive: true });
  const fileOf = (name, b64) => { const f = path.join(tmp, name); fs.writeFileSync(f, Buffer.from(b64.split(',')[1], 'base64')); return f; };
  /** A take: Air's pictures on disk, the framings the virtual camera moves between, and named moments (frame numbers). */
  const newTake = (dir) => { fs.mkdirSync(dir, { recursive: true }); return { list: [], keys: [], marks: {}, dir }; };
  let cur = null;
  const grab = async () => { const f = path.join(cur.dir, String(cur.list.length).padStart(4, '0') + '.jpg'); fs.writeFileSync(f, await src.grab(app)); cur.list.push(f); };
  const film = { run: async (_p, count, each) => { for (let k = 0; k < count; k++) { if (each) await each(k); await grab(); } } };
  const mark = (k) => { cur.marks[k] = cur.list.length; };
  /** A framing starts here: Air's picture is shown through a crop (x, y, w) the camera eases to over 0.7 s. */
  const frame = (c) => { cur.keys.push({ at: cur.list.length, ...RF.clampRect(c) }); };
  const wide = (w = 1280) => frame({ x: (1280 - w) / 2, y: (720 - (w * 9) / 16) / 2, w });
  const onTop = async (dlg, loc, w, pad = 36) => { const d0 = await dlg.boundingBox(), b = await loc.boundingBox(); frame({ x: d0.x + d0.width / 2 - w / 2, y: b.y - pad, w }); };
  const onBox = async (loc, w, dy = 0) => { const b = await loc.boundingBox(), hgt = (w * 9) / 16; frame({ x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - hgt / 2 + dy, w }); };
  const fromLeft = async (loc, w, padTop = 30, padLeft = 40) => { const b = await loc.boundingBox(); frame({ x: b.x - padLeft, y: b.y - padTop, w }); };
  /** The take stretched or squeezed to exactly n pictures (keeps order; framings move with it). */
  const fit = (take, n) => {
    const L = take.list.length; if (L === n) return take;
    const idx = [...Array(n).keys()].map((k) => Math.min(L - 1, Math.round((k * (L - 1)) / Math.max(1, n - 1))));
    if (L > n) console.warn(`take: ${L} pictures squeezed into ${n}`);
    const map = (at) => Math.max(0, Math.round((at * (n - 1)) / Math.max(1, L - 1)));
    return { ...take, list: idx.map((i) => take.list[i]), keys: take.keys.map((k) => ({ ...k, at: map(k.at) })), marks: Object.fromEntries(Object.entries(take.marks).map(([k, v]) => [k, map(v)])) };
  };

  // 35.5 s: a PUBG MOBILE team made by hand in Teams/Players (recorded before the lobby exists), 3 framings
  await call('chooseGame', ['pubgm']);
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor(); await ui.dress();
  await app.locator('nav[aria-label="Main"]').getByRole('button', { name: 'Teams/Players' }).click(); await app.waitForTimeout(600);
  await app.getByRole('tab', { name: 'Teams' }).click(); await app.waitForTimeout(300);
  ui.pos = [760, 560]; await ui.place();
  cur = newTake(path.join(OUT, 'byhand'));
  {
    await onBox(app.getByRole('button', { name: 'Add team' }), 860, 130); await film.run(app, 3);
    await ui.click(film, app.getByRole('button', { name: 'Add team' }), { frames: 7, after: 3 });
    const drawer = app.getByRole('dialog', { name: 'Add a team' });
    const logoBtn = drawer.getByRole('button', { name: /logo of/i }).first();
    await onTop(drawer, logoBtn, 820, 150);
    await ui.point(film, logoBtn, 6);
    await drawer.locator('input[type=file]').first().setInputFiles(fileOf('north-tide.png', emblems[5]));
    await app.getByRole('button', { name: /Change logo/i }).first().waitFor();
    await film.run(app, 3);
    await ui.type(film, drawer.getByLabel('Name', { exact: true }), 'NORTH TIDE', { per: 1 });
    await ui.type(film, drawer.getByLabel('Tag'), 'NTD', { per: 1 });
    await film.run(app, 2);
    await ui.click(film, drawer.getByRole('button', { name: 'Save' }), { frames: 7, after: 4 });
    await app.getByRole('button', { name: 'Add a player to NORTH TIDE' }).waitFor();
    for (const [k, [n, ph]] of BYHAND.entries()) {
      const add = app.getByRole('button', { name: 'Add a player to NORTH TIDE' });
      await ui.click(film, add, { frames: k ? 6 : 7, after: 3 });
      const pd = app.getByRole('dialog', { name: 'Add a player' });
      const photoBtn = pd.getByRole('button', { name: /photo of/i }).first();
      if (!k) await onTop(pd, photoBtn, 820, 150);
      await pd.locator('input[type=file]').first().setInputFiles(photoFiles[ph]);
      await pd.getByRole('button', { name: /Change photo/i }).first().waitFor();
      await film.run(app, 3);
      if (k < 1) await ui.type(film, pd.getByLabel('Name on air'), n, { per: 1 }); else await pd.getByLabel('Name on air').fill(n);
      await pd.getByLabel('In-game name').fill(n);
      await film.run(app, 2);
      await ui.click(film, pd.getByRole('button', { name: 'Save' }), { frames: 6, after: 3 });
    }
    frame({ x: 230, y: 70, w: 860 });
    ui.pos = [1250, 700]; await ui.place();
    while (cur.list.length < BH_CAP) await film.run(app, 1);
  }
  const byHand = fit(cur, BH_CAP);
  console.log(`by hand: ${cur.list.length} pictures, ${byHand.keys.length} framings`);

  // ═════ Off camera: the PUBG MOBILE lobby (NORTH TIDE as made above) and a recorded game; Valorant chosen ═════
  const d = await S.prepare(h, { names, tags, logo: lobbyLogo, photo: lobbyPhoto, esportra: false });
  const { lobby, code, states, wwcdAt, fbAt } = d;
  await call('lobbyShow', [lobby.id, { pick: { scope: 'match', game: 1 } }]);
  await kit.prepare(ctx);
  const { sample, wall, seek, resetReplay } = await S.dress(h, ctx, d);
  for (let i = 0; i < 20; i++) { await call('esportraRefresh').catch(() => {}); if ((await call('snapshot')).esportra.matches.some((m) => m.teamA === 'NIGHT OWLS')) break; await sleep(500); }

  // ═════ about 20 s: AIR picks the match up from Esportra: Air's real screen, 4 framings, ticks timed to what appears ═════
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor(); await ui.dress();
  await app.locator('nav[aria-label="Main"]').getByRole('button', { name: 'Events' }).click();
  await app.getByText('Esportra Invitational').first().waitFor({ timeout: 20000 }); await app.waitForTimeout(400);
  ui.pos = [900, 600]; await ui.place();
  cur = newTake(path.join(OUT, 'air3'));
  try {
    await onBox(app.getByText('Open event', { exact: true }).last(), 860, 90); await film.run(app, 3);
    await ui.click(film, app.getByText('Open event', { exact: true }).last(), { frames: 8, after: 3 });
    const row = app.locator('div, li, tr').filter({ hasText: /NIGHT OWLS\s*vs\s*CRIMSON FIVE/ }).last();
    await onBox(row, 860, 40); mark('schedule');
    await film.run(app, 2);
    await ui.click(film, row.getByRole('button', { name: 'Open', exact: true }), { frames: 8, after: 1 });
    await app.locator('nav[aria-label="Match steps"]').waitFor(); await app.waitForTimeout(400);
    const steps = app.locator('nav[aria-label="Match steps"]');
    await fromLeft(app.getByText('NIGHT OWLS', { exact: true }).first(), 860, 40, 90);
    mark('teams'); await film.run(app, 12); mark('logos'); await film.run(app, 20);
    await ui.click(film, steps.getByRole('button', { name: /Talent and sponsors/ }), { frames: 7, after: 2 });
    mark('casters'); await film.run(app, 16); mark('sponsors'); await film.run(app, 18);
    await ui.click(film, steps.getByRole('button', { name: /Match data/ }), { frames: 7, after: 2 });
    await film.run(app, 8);
    await app.getByText('The sequence', { exact: false }).first().scrollIntoViewIfNeeded(); await app.waitForTimeout(300);
    await fromLeft(app.getByText(/The sequence/i).first(), 860, 230, 40);
    mark('veto');
    await film.run(app, 12);
  } catch (e) { await app.screenshot({ path: path.join(OUT, 'air-failed.png') }); throw e; }
  // The window opens so that the capture just fills the rest of the act (about 1 s of hold at the end), never before 19.7 s.
  AIR_FROM = Math.max(19.7, Math.min(21.7, (F(27.5) - cur.list.length - 31) / FPS)); CAP = F(27.5) - F(AIR_FROM) - 1;
  while (cur.list.length < CAP) await film.run(app, 1);
  const air3 = fit(cur, CAP);
  console.log(`air: ${cur.list.length} pictures, ${air3.keys.length} framings, marks ${JSON.stringify(air3.marks)}`);
  await app.close(); await appCtx.close();

  // The Valorant room for the graphics: Esportra's match (names, tags, veto, casters, sponsors) with the library's
  // logos and photos, on the HUD's own sample match (agents, numbers, rounds).
  const lib = (await call('snapshot')).library;
  const libTeam = (n) => lib.teams.find((t) => t.name === n);
  const vteams = clone(sample.teams);
  for (const [k, n] of ['NIGHT OWLS', 'CRIMSON FIVE'].entries()) { const t = libTeam(n); Object.assign(vteams[k], { name: t.name, tag: t.tag, color: t.color, logo: t.logo }); }
  const P0 = clone(sample.players).map((team) => team.map((p) => ({ ...p, alive: true, hp: 100, armor: 50 })));
  NWL.forEach(([n], k) => { const p = lib.players.find((x) => x.name === n); Object.assign(P0[0][k], { name: n, photo: p.photo }); });
  CRF.forEach((n, k) => { P0[1][k].name = n; });
  const sponsorLogos = []; for (const b of sponsorPng) sponsorLogos.push(await upload('data:image/png;base64,' + b.toString('base64')));
  const vbase = {
    teams: vteams, event: { ...sample.event, name: 'ESPORTRA INVITATIONAL', bestOf: 3, logo: await upload(MARK_DATA) }, killfeed: [],
    banner: { type: '', team: 1, player: 0, text: '', method: '', ts: 0, hold: 4200 }, show: { economy: 'auto', roundRecap: false, scoreboard: false },
    casters: SHOWCASE.talent.map((t) => ({ name: t.name, handle: 'Play-by-play' })),
    sponsors: SPONSORS.map((s, k) => ({ name: s.name, line: s.line, logo: sponsorLogos[k] })),
  };
  const vetoSteps = clone(VETO);
  await patchRoom(VAL, { ...vbase, players: P0, veto: vetoSteps, vetoTurn: null });

  let stage;
  const openStage = async () => { stage = await ctx.newPage(); stage.on('pageerror', (e) => errs.push('stage: ' + e.message)); };
  await openStage();
  const rec = kit.recorder(path.join(OUT, STILLS ? 'stills-raw' : 'frames'));
  const board = [], cuts = [], shots = {};
  const liveShot = {};
  let outgoing = '';   // the scene just recorded, without chrome and grain, leaving over the next one's first 600 ms
  const lastFrame = () => path.join(rec.dir, String(rec.frames - 1).padStart(6, '0') + '.jpg');
  const hideChrome = (on) => stage.evaluate((on) => { for (const s of ['#chrome', '.grain']) { const e = document.querySelector(s); if (e) e.style.visibility = on ? 'hidden' : ''; } }, on);
  /** A picture of the stage as it is now (the closing wall's tiles), without chrome and grain; `clip` is a rectangle of it. */
  const snapStage = async (key, clip) => {
    await hideChrome(true);
    shots[key] = serve(`shot-${key}.jpg`, await stage.screenshot({ type: 'jpeg', quality: 82, ...(clip ? { clip } : {}) }), 'image/jpeg');
    await hideChrome(false);
  };
  const keyShot = (key, at, clip) => async (i) => { if (i === F(at)) await snapStage(key, clip); };

  /**
   * One scene from `from` to `to` (seconds on the cut sheet). `o.ui`/`o.fg`/`o.css` make the page (or `o.page` loads a
   * file). Every scene but the first is a crossover: the frame before leaves over its first 600 ms, its elements start
   * 150 ms before that ends, and AIR's pages (iframes with data-src) load at 0.4 s so their own entrances are seen.
   */
  async function scene(name, from, to, o) {
    const start = rec.frames, boardAt = board.length, cutsAt = cuts.length;
    console.log(`scene ${name} at ${(start / FPS).toFixed(2)} s`);
    try { await sceneOnce(name, from, to, o); } catch (e) {
      if (!/crash|closed/i.test(e.message)) throw e;
      console.warn(`scene ${name}: page crashed (${e.message.split('\n')[0]}); recording it again`);
      await stage.close().catch(() => {}); await openStage();
      rec.rewind(start); board.length = boardAt; cuts.length = cutsAt;
      await sceneOnce(name, from, to, o);
    }
  }
  async function sceneOnce(name, from, to, o) {
    const n = F(to) - F(from), cross = o.cross !== false && !!outgoing;
    const late = cross ? F(0.4) : 0;
    if (o.page) {
      await stage.goto(PAGE, { waitUntil: 'load' });
      await stage.evaluate((b) => window.reelBuild(b), o.build);
    } else {
      await stage.setContent(RF.pageHtml({ fonts: FONTS, css: o.css, ui: o.ui, fg: o.fg, dur: n / FPS, dz: o.dz ?? 0.035, over: o.over, sub: o.sub, outgoing: cross ? outgoing : '', cross, drift: o.drift !== false, reveal: o.reveal }), { waitUntil: 'load' });
    }
    await stage.evaluate(() => Promise.all([document.fonts.load('700 64px Inter'), document.fonts.load('500 16px Inter'), document.fonts.load('500 16px "JetBrains Mono"'), document.fonts.ready]));
    await stage.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    const loadLate = async () => {
      await stage.evaluate(() => document.querySelectorAll('iframe[data-src]').forEach((f) => { f.src = f.dataset.src; f.removeAttribute('data-src'); }));
      for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
      await sleep(250);
      if (o.ready) await o.ready();
    };
    if (!late) await loadLate();
    await sleep(250);
    cuts.push(`${(rec.frames / FPS).toFixed(3)}s  ${name}`);
    const key = Math.floor(n * (o.key ?? 0.7));
    for (let i = 0; i < n; i++) {
      if (late && i === late) await loadLate();
      const abs = F(from) + i;
      if (o.page) await stage.evaluate((ms) => window.reelSeek(ms), (i * 1000) / FPS);
      else await stage.evaluate((t) => window.ReelChrome.tick(t), abs / FPS);
      if (o.each) await o.each(i);
      const sampled = STILLS && ((abs % 15 === 0 && abs <= F(12)) || abs === F(1.2) || (abs % 45 === 0 && abs <= F(41.5)));
      const cross15 = STILLS && cross && ((o.xover && i % 3 === 0 && i >= 9 && i <= 24) || (!o.xover && i === 15 && from <= T.agents));
      const xo = STILLS && o.xover && i % 3 === 0 && i >= 9 && i <= 24;
      const lastOfAll = name === '9-back' && i === n - 1;
      const shoot = !STILLS || i === key || sampled || cross15 || lastOfAll;
      await rec.frame(stage, o.vt ? o.vt(i) : null, shoot);
      if (STILLS && shoot) board.push([name, lastFrame(), abs / FPS, xo ? 'xover' : '']);
    }
    await hideChrome(true);
    outgoing = 'data:image/jpeg;base64,' + (await stage.screenshot({ type: 'jpeg', quality: 90 })).toString('base64');
    await hideChrome(false);
  }
  const g = (u, style = '', id = '') => `<iframe class="g" ${id ? `id="${id}" ` : ''}data-src="${u}" style="${style}"></iframe>`;
  const host = (room, bg = LOTUS) => `<div style="position:absolute;inset:0;background:#000 url('${bg}') center/cover">${g(`${ENG}/overlays/fullscreen.html?match=${room}&over=1`)}</div>`;
  const page = (name) => g(`${ENG}/overlays/${name}.html?match=${VAL}`);

  // ═════ 0 – 27.5 s: the problem, Esportra holds it once, AIR picks it all up (reel/problem-solution.html) ═════
  // The ledger's ticks are timed to what Air shows: SCHEDULE when the match row is on screen, then names, logos,
  // casters, sponsors, the veto.
  const mk = air3.marks, AIR_AT = (m) => AIR_FROM + (m ?? 0) / FPS + 0.1;
  const ticks = [mk.teams, mk.logos, mk.veto, mk.schedule, mk.casters, mk.sponsors].map(AIR_AT);
  const AF = F(AIR_FROM);
  const airShow = async (i) => {
    const k = i - AF; if (k < 0) return;
    const idx = Math.min(k, air3.list.length - 1);
    const r = RF.rectAt(air3.keys, k);
    await stage.evaluate(([s, tf]) => window.reelAir(s, tf), [k <= air3.list.length - 1 ? 'data:image/jpeg;base64,' + fs.readFileSync(air3.list[idx]).toString('base64') : '', RF.cropTransform(r, 972)]);
  };
  await scene('1-page', T.page, T.beat, {
    page: true, build: { lockup: LOCKUP, emblem: EMB.NWL, ticks, airFrom: AIR_FROM }, cross: false,
    each: async (i) => { await airShow(i); if (i === F(26.8)) await snapStage('air', { x: 852, y: 330, width: 972, height: 547 }); },
    key: 0.9,
  });

  // ═════ 27.5 – 35.5 s: data to graphics, five beats of 48 frames ═════
  // Layout of a beat: a left column (columns 1-3: index, label, source) and the real graphic inset in columns 4-12.
  const BEAT_CSS = `
    .bx{position:absolute;left:96px;top:219px;width:414px;height:726px}
    .bx .ix{color:var(--text);font-size:18px}
    .bx .lb{margin-top:30px}
    .bx .sr{position:absolute;left:0;bottom:0}
    .bx .sr i{display:block;width:48px;height:2px;background:var(--rose);margin-bottom:18px}
    .bx .sr span{color:var(--muted);font-size:16px}
    .inset{position:absolute;left:534px;top:219px;width:1290px;height:726px;overflow:hidden;background:var(--bg)}
    .inset .gw{position:absolute;left:0;top:0;width:1920px;height:1080px;transform:scale(.671875);transform-origin:0 0;overflow:hidden}
    .inset .fr{position:absolute;left:0;top:0;width:1290px;height:726px;border:1px solid var(--line);z-index:5}`;
  const beatUi = (n, lines, gw, extra = '') => ({
    css: BEAT_CSS + extra,
    ui: `<div class="bx"><div class="m ix rv" style="--d:0s">0${n}</div>${RF.wordsHtml(lines, 'd56 lb', 0.04)}<div class="sr"><i class="rv" style="--d:.12s"></i><span class="m rv" style="--d:.16s">FROM ESPORTRA</span></div></div>
      <div class="inset rv" style="--d:.04s"><div class="gw">${gw}</div><div class="fr"></div></div>`,
  });
  const bs = (k) => T.beat + k * BEAT;
  const INSET = { x: 534, y: 219, width: 1290, height: 726 };
  // 1 · TEAM NAMES · LOGOS: the match intro overlay bar over Lotus, then (crossover) the team roster with the players' photos
  await patchRoom(VAL, { ...vbase, veto: vetoSteps, vetoTurn: null, players: P0 });
  await action(VAL, 'fullscreen.show', { screen: 'match-intro', style: 'band' });
  await sleep(300);
  const ROSTER_AT = F(0.8);
  const rosterUrl = `${ENG}/overlays/team-roster-a.html?match=${VAL}`;
  await scene('b1-teams', bs(0), bs(1), {
    ...beatUi(1, ['TEAM NAMES', 'LOGOS'], host(VAL) + `<div class="rost rv" style="--d:${(ROSTER_AT / FPS).toFixed(2)}s"><div id="rostbox"></div></div>`, '.rost{position:absolute;left:0;top:0;width:1920px;height:1080px;background:var(--bg)}'),
    dz: 0.02, reveal: true, key: 0.9, xover: true,
    each: async (i) => {
      if (i === ROSTER_AT) {
        await stage.evaluate((u) => { const f = document.createElement('iframe'); f.className = 'g'; f.src = u; document.getElementById('rostbox').appendChild(f); }, rosterUrl);
        for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
        await sleep(250);
      }
      if (i === F(0.7)) await snapStage('teams', INSET);
      if (i === F(1.5)) await snapStage('roster', INSET);
    },
  });
  // 3 · VETO: the overlay-bar veto filling, step by step
  await patchRoom(VAL, { veto: [], vetoTurn: { team: 1, action: 'ban', endsAt: Date.now() + 30000 } });
  await action(VAL, 'fullscreen.show', { screen: 'map-veto', style: 'band' });
  await sleep(300);
  const vClock = Date.now() + 60000, vt3 = (i) => vClock + (i / FPS) * 1000;
  await scene('b3-veto', bs(1), bs(2), {
    ...beatUi(2, ['VETO'], host(VAL)), dz: 0.02, vt: vt3, key: 0.9,
    each: async (i) => {
      const k = Math.floor((i - F(0.55)) / 3);
      if (i >= F(0.55) && (i - F(0.55)) % 3 === 0 && k < vetoSteps.length) {
        const next = SHOWCASE.matches[0].veto[k + 1];
        await patchRoom(VAL, { veto: vetoSteps.slice(0, k + 1), vetoTurn: next && next.team >= 0 ? { team: next.team, action: next.action, endsAt: vt3(i) + 28000 } : null });
        await sleep(110);
      }
      if (i === F(1.25)) await snapStage('veto', INSET);
    },
  });
  // 4 · SCHEDULE
  await scene('b4-schedule', bs(2), bs(3), { ...beatUi(3, ['SCHEDULE'], page('schedule')), dz: 0.02, each: keyShot('schedule', 1.1, INSET), key: 0.8 });
  // 5 · CASTERS: the desk graphic, each talent photo placed by the face (face 42 % of the window, eyes at 40 %)
  const deskPics = talents.slice(0, 2).map((t, k) => {
    const info = faceInfo[k], p = RF.placeFace(info, info?.size?.[0] || 512, info?.size?.[1] || 512, 820, 462);
    console.log(`casters ${k}: face ${info?.face ? 'found' : 'estimated'}, face ${(p.faceShare * 100).toFixed(0)} % of the window, eyes at ${(p.eyeAt * 100).toFixed(0)} %`);
    return `<div style="position:absolute;left:${k ? 980 : 120}px;top:250px;width:820px;height:462px;background-color:#111;background-image:url('${t}');${p.css}"></div>`;
  }).join('');
  await scene('b5-casters', bs(3), bs(4), { ...beatUi(4, ['CASTERS'], deskPics + page('casters')), dz: 0.02, each: keyShot('casters', 1.1, INSET), key: 0.8 });
  // 6 · SPONSORS: the three marks by tier and the real Presented by bar
  const sp3 = `<style>
      .sp3{position:absolute;left:96px;top:150px;display:flex;gap:36px}
      .sp3 div{width:536px;height:298px;background:var(--surface);border:1px solid var(--line);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:30px;padding:0 48px}
      .sp3 div:first-child{border-color:var(--rose)}
      .sp3 img{width:440px}.sp3 span{font:500 28px 'JetBrains Mono',monospace;letter-spacing:.08em;color:var(--muted)}
      .spbar{position:absolute;left:0;top:0;width:1920px;height:1080px;transform:scale(1.7);transform-origin:50% 100%}
    </style><div class="sp3">${SPONSORS.map((s, k) => `<div class="rv" style="--d:${(0.1 + k * 0.04).toFixed(2)}s"><img src="${serve(`sponsor-${k}.png`, sponsorPng[k])}"><span>${s.tier}</span></div>`).join('')}</div>
    <div class="spbar">${g(`${ENG}/overlays/sponsor.html?match=${VAL}`)}</div>`;
  await scene('b6-sponsors', bs(4), T.byHand, { ...beatUi(5, ['SPONSORS'], sp3), dz: 0.02, each: keyShot('sponsors', 1.1, INSET), key: 0.8 });

  // ═════ 35.5 – 41.5 s: by hand, its own visual mode: a full-width band and AIR's Teams/Players window on the right ═════
  const BHW = { x: 900, y: 285, w: 924, h: 520 };
  const BH_FROM = F(0.45);
  await scene('4-byhand', T.byHand, T.agents, {
    css: `
      .band{position:absolute;left:0;top:250px;width:1920px;height:580px;background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
      .btag{position:absolute;left:242px;top:292px;color:var(--muted);font-size:16px}
      .bwin{position:absolute;left:${BHW.x}px;top:${BHW.y}px;width:${BHW.w}px;height:${BHW.h}px;overflow:hidden;background:var(--bg);border:1px solid var(--line)}
      .bwin img{position:absolute;left:0;top:0;width:2560px;height:1440px;transform-origin:0 0;display:none}`,
    ui: `<div class="band rv" style="--d:0s"></div><div class="m btag rv" style="--d:.06s">WITHOUT ESPORTRA</div>
      ${RF.wordsHtml(['Not on Esportra?', 'Add teams in a minute.'], 'd60', 0.1, 'position:absolute;left:242px;top:360px')}
      <div class="bwin rv" style="--d:.1s"><img id="bwi"></div>`,
    each: async (i) => {
      const k = i - BH_FROM; if (k < 0) return;
      const r = RF.rectAt(byHand.keys, k);
      await stage.evaluate(([s, tf]) => { const im = document.getElementById('bwi'); im.style.display = 'block'; im.style.transform = tf; im.src = s; return im.decode().catch(() => {}); },
        ['data:image/jpeg;base64,' + fs.readFileSync(byHand.list[Math.min(k, byHand.list.length - 1)]).toString('base64'), RF.cropTransform(r, BHW.w)]);
      if (i === F(5.3)) await snapStage('byhand', { x: BHW.x, y: BHW.y, width: BHW.w + 2, height: BHW.h + 2 });
    }, key: 0.85, sub: '',
  });
  await call('chooseGame', ['valorant']).catch(() => {});

  // ═════ 41.5 – 49.5 s: Valorant, full bleed: agent select, then the HUD round ═════
  const agentsP = P0.map((t) => t.map((p) => ({ ...p, locked: false })));
  await patchRoom(VAL, { players: agentsP });
  await action(VAL, 'fullscreen.show', { screen: 'agent-select', style: 'band' });
  await sleep(300);
  const lockOrder = [[0, 0], [1, 0], [0, 1], [1, 2], [0, 2], [1, 1], [0, 3], [1, 3], [0, 4], [1, 4]];
  await scene('5c-agents', T.agents, T.hud, {
    ui: host(VAL), over: true, sub: 'VALORANT', reveal: true, key: 0.85,
    each: async (i) => {
      const k = Math.floor((i - 20) / 4);
      if (i >= 20 && (i - 20) % 4 === 0 && k < lockOrder.length) { const [t, s] = lockOrder[k]; agentsP[t][s].locked = true; await patchRoom(VAL, { players: agentsP }); await sleep(110); }
      if (i === F(1.7)) await snapStage('agents');
    },
  });
  await action(VAL, 'fullscreen.show', { screen: null, style: 'band' });
  const P = clone(P0);
  const teams0 = clone(vteams); teams0[0].score = 11; teams0[1].score = 11; teams0[0].series = 1; teams0[1].series = 1;
  const series0 = clone(sample.series); series0[2] = { ...series0[2], score: [11, 11], winner: null };
  const rounds0 = clone(sample.rounds).slice(0, 22);
  await patchRoom(VAL, { ...vbase, teams: teams0, series: series0, rounds: rounds0, players: P, spotlight: null, round: { number: 23, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' } });
  const vbaseT = Date.now() + 3000, vt4 = (i) => vbaseT + (i / FPS) * 1000;
  const kf = [];
  const kill = (k, v, weapon, hs, ts) => { kf.push({ killer: k, victim: v, weapon, hs, ts }); const p = P[v[0]][v[1]]; p.alive = false; p.hp = 0; p.armor = 0; P[k[0]][k[1]].k += 1; };
  const R = 6 / 7; // the round, played in 6 s
  const round = {
    [F(0.5 * R)]: (t) => { kill([1, 0], [0, 1], 'OPERATOR', false, t); return { killfeed: kf, players: P }; },
    [F(1.2 * R)]: () => { Object.assign(P[0][0], { hp: 62, armor: 0 }); Object.assign(P[1][1], { hp: 45, armor: 25 }); return { players: P }; },
    [F(1.9 * R)]: (t) => { kill([0, 0], [1, 1], 'VANDAL', true, t); return { killfeed: kf, players: P }; },
    [F(2.6 * R)]: (t) => { kill([0, 2], [1, 2], 'SPECTRE', false, t); return { killfeed: kf, players: P }; },
    [F(3.3 * R)]: (t) => { P[1][3].credits += 300; return { round: { phase: 'planted', endsAt: t + 45000 }, players: P }; },
    [F(4.1 * R)]: (t) => { kill([1, 3], [0, 2], 'PHANTOM', false, t - 200); kill([1, 3], [0, 4], 'PHANTOM', true, t); Object.assign(P[0][0], { hp: 18 }); return { killfeed: kf, players: P }; },
    [F(4.9 * R)]: (t) => { kill([0, 0], [1, 3], 'VANDAL', true, t - 150); kill([1, 0], [0, 3], 'OPERATOR', false, t); return { killfeed: kf, players: P }; },
    [F(5.6 * R)]: (t) => { kill([0, 0], [1, 0], 'VANDAL', true, t - 200); kill([0, 0], [1, 4], 'VANDAL', false, t); return { killfeed: kf, players: P }; },
    [F(6.0 * R)]: (t) => { const tm = clone(teams0); tm[0].score = 12; const se = clone(series0); se[2].score = [12, 11]; return { round: { number: 23, phase: 'end', endsAt: 0, remaining: 0, winner: 0, method: 'elim' }, teams: tm, series: se, rounds: [...rounds0, { w: 0, how: 'elim' }], banner: { type: 'round', team: 0, player: 0, text: '', method: 'ELIMINATION', ts: t, hold: 4200 } }; },
  };
  await scene('5d-hud', T.hud, T.drop, {
    ui: `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div>`, over: true, sub: 'VALORANT',
    each: async (i) => {
      if (round[i]) { await patchRoom(VAL, round[i](vt4(i))); await sleep(130); }
      if (i === F(4.0)) { await hideChrome(true); liveShot.val = await stage.screenshot({ type: 'jpeg', quality: 85 }); await hideChrome(false); shots.hud = serve('shot-hud.jpg', liveShot.val, 'image/jpeg'); }
    }, vt: vt4, key: 0.82,
  });

  // ═════ 49.5 – 63.5 s: PUBG MOBILE, full bleed, on the second drop ═════
  await call('chooseGame', ['pubgm']); await call('lobbySelect', [lobby.id]);
  const take = async (screen) => { await call('lobbyTake', [lobby.id, screen]); await sleep(250); };
  await take('br-drop');
  const lob = g(`${ENG}/overlays/fullscreen.html?match=${code}`);
  const PB = { over: true, sub: 'PUBG MOBILE' };
  await scene('6a-drop', T.drop, T.today, { ...PB, ui: lob });
  await take('br-today');
  await scene('6b-today', T.today, T.brhud, { ...PB, ui: lob });
  const outs = [...new Set(states.map(([, s]) => s.brLive?.lastOut?.at).filter(Boolean))];
  const o5 = outs.find((x) => x - 3600 >= states[0][0] + 1500 && x < wwcdAt - 3000);
  const from5 = o5 ? o5 - 3600 : fbAt - 800, vt5 = (i) => from5 + (i / FPS) * 2000;
  await resetReplay(from5);
  await patchRoom(h.REPLAY || S.REPLAY, { layout: { brHud: 'rail' }, brPopup: false });
  await scene('6c-brhud', T.brhud, T.standings, {
    ...PB, ui: `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${S.REPLAY}`)}</div>`,
    each: async (i) => { await seek(vt5(i)); if (i === F(2.0)) { await hideChrome(true); liveShot.pubg = await stage.screenshot({ type: 'jpeg', quality: 85 }); await hideChrome(false); } }, vt: vt5,
  });
  await take('br-overall');
  await scene('6d-standings', T.standings, T.mvp, { ...PB, ui: lob });
  await take('br-mvp');
  await scene('6e-mvp', T.mvp, T.wwcd, { ...PB, ui: lob, each: keyShot('mvp', 1.3) });
  for (const p of (await call('snapshot')).library.players.filter((p) => /^NTD_/.test(p.name))) await call('savePlayer', [{ ...p, photo: '' }]);
  await sleep(400);
  await take('br-wwcd');
  await scene('6f-wwcd', T.wwcd, T.studio, { ...PB, ui: lob, each: keyShot('wwcd', 1.3) });

  // ═════ 63.5 – 69.5 s: Graphics studio: a studio panel; the graphic on air changes as it is edited ═════
  const sw = ['#22d3ee', '#ffb60e', '#f43f5e', '#a78bfa', '#34d399', '#ffffff'];
  const studioCss = `
    .sp{position:absolute;left:242px;top:420px;width:560px;height:560px;padding:28px}
    .sp .gname{font:600 28px/1.1 Inter;letter-spacing:-.02em}
    .sp .ly{margin-top:26px;display:flex;flex-direction:column;gap:6px}
    .sp .ly div{position:relative;padding:13px 16px;font:500 16px/1 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border:1px solid transparent}
    .sp .ly div.on{color:var(--text);border-color:var(--line);background:var(--bg)}
    .sp .ly div.on::before{content:'';position:absolute;left:-1px;top:-1px;bottom:-1px;width:2px;background:var(--rose)}
    .sp .sws{margin-top:26px;display:flex;gap:12px}
    .sp .sws b{width:44px;height:44px;border:1px solid var(--line)}.sp .sws b.on{outline:2px solid var(--text);outline-offset:2px}
    .sp .wd{margin-top:22px;padding:14px 16px;background:var(--bg);border:1px solid var(--line);font:500 18px/1.2 'JetBrains Mono',monospace;letter-spacing:.04em;min-height:52px}
    .mon{position:absolute;left:826px;top:250px;width:998px;height:561px;overflow:hidden;background:#000;border:1px solid var(--line)}
    .mon .v{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;visibility:hidden}
    .mon .vi{position:absolute;left:0;top:0;width:1920px;height:1080px;transform:scale(${998 / 1920});transform-origin:0 0}
    .mon .v.act{visibility:visible;animation:rv .6s var(--in) both}
    .mon .v.first.act{animation:none}
    .mon .v.gone{visibility:visible;animation:xu .6s var(--out) forwards}
    .onair{position:absolute;left:826px;top:836px;display:flex;align-items:center;gap:12px;color:var(--text);font-size:16px}
    .onair i{width:10px;height:10px;background:var(--rose)}
    #ptr{position:absolute;z-index:30;width:30px;height:30px;left:560px;top:760px}`;
  const studioHtml = `
    ${RF.wordsHtml(['Make every', 'graphic yours.'], 'd64', 0.04, 'position:absolute;left:242px;top:196px')}
    <div class="sp sf rv" style="--d:.1s"><div class="gname" id="gname">In-game HUD</div><div class="ly" id="ly"></div><div class="sws" id="sws">${sw.map((c, k) => `<b data-k="${k}" style="background:${c}"></b>`).join('')}</div><div class="wd" id="wd" style="display:none"></div></div>
    <div class="mon rv" style="--d:.06s"><div class="v act first" id="v0"><div class="vi" style="background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div></div><div class="v" id="v1"><div class="vi" style="background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/fullscreen.html?match=${VAL}&over=1`)}</div></div><div class="v" id="v2"><div class="vi">${g(`${ENG}/overlays/fullscreen.html?match=${code}`)}</div></div></div>
    <div class="m onair rv" style="--d:.2s"><i></i>ON AIR</div>
    <svg id="ptr" viewBox="0 0 24 24"><path d="M3 2l17 9-7.5 2L9 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  await patchRoom(VAL, { ...vbase, teams: teams0, series: series0, rounds: rounds0, players: clone(P0), round: { number: 24, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' }, banner: { type: '', ts: 0 } });
  const saveT = async (id, graphic, parts) => { await call('templateSave', [{ id, name: id, graphic, parts }]); return (await call('snapshot')).templates.find((t) => t.id === id); };
  const hudT = await saveT('reel-hud', 'hud', {}); const vetoT = await saveT('reel-veto', 'map-veto|band', {});
  await patchRoom(VAL, { airTemplates: [hudT, vetoT], airHudTemplate: 'reel-hud' });
  await patchRoom(VAL, { veto: vetoSteps });
  await call('lobbyTake', [lobby.id, 'br-overall']);
  const layers = { hud: ['Scorebug', 'Player cards', 'Killfeed', 'Minimap frame', 'Win probability'], veto: ['Panel', 'Title', 'Map tiles', 'Action labels', 'Logos'], br: ['Header', 'Table', 'Theme · Sky', 'Theme · Jungle', 'Theme · Inferno'], wwcd: ['Winner word', 'Winner line', 'Team plate', 'Player photos', 'Parachutes'] };
  const panel = (name, list, on, swOn, wd) => stage.evaluate(([name, list, on, swOn, wd]) => {
    document.getElementById('gname').textContent = name;
    document.getElementById('ly').innerHTML = list.map((l, k) => `<div class="${k === on ? 'on' : ''}">${l}</div>`).join('');
    document.querySelectorAll('#sws b').forEach((b, k) => b.classList.toggle('on', k === swOn));
    const w = document.getElementById('wd'); w.style.display = wd === null ? 'none' : ''; w.textContent = wd ?? '';
  }, [name, list, on, swOn, wd]);
  // a graphic swap inside the scene is the same 600 ms crossover: the one on the monitor leaves upward, the next enters
  const showV = (k) => stage.evaluate((k) => {
    [0, 1, 2].forEach((j) => { const e = document.getElementById('v' + j); const was = e.classList.contains('act');
      if (j === k && !was) { e.classList.remove('gone', 'first'); void e.offsetWidth; e.classList.add('act'); }
      else if (j !== k && was) { e.classList.remove('act'); void e.offsetWidth; e.classList.add('gone'); } });
  }, k);
  let ptr = [560, 760];
  const ptrTo = (xy) => { ptr = xy; return stage.evaluate(([x, y]) => { const p = document.getElementById('ptr'); p.style.left = x + 'px'; p.style.top = y + 'px'; }, xy); };
  let swPos = [], lyPos = [], wdPos = [560, 760];
  const plan = [
    [0.0, async () => { await panel('In-game HUD', layers.hud, 1, -1, null); }],
    [0.7, async () => { await panel('In-game HUD', layers.hud, 1, 0, null); await patchRoom(VAL, { airTemplates: [await saveT('reel-hud', 'hud', { players: { fill: { kind: 'solid', a: sw[0], alpha: 0.85 } } }), vetoT] }); }],
    [1.5, async () => { await panel('In-game HUD', layers.hud, 1, 2, null); await patchRoom(VAL, { airTemplates: [await saveT('reel-hud', 'hud', { players: { fill: { kind: 'solid', a: sw[2], alpha: 0.85 } } }), vetoT] }); }],
    [2.4, async () => { await action(VAL, 'fullscreen.show', { screen: 'map-veto', style: 'band', template: 'reel-veto' }); await showV(1); await panel('Map veto · Overlay bar', layers.veto, 0, -1, null); }],
    [3.1, async () => { await panel('Map veto · Overlay bar', layers.veto, 0, 3, null); await patchRoom(VAL, { airTemplates: [hudT, await saveT('reel-veto', 'map-veto|band', { panel: { fill: { kind: 'solid', a: sw[3], alpha: 0.92 } } })] }); }],
    [4.0, async () => { await panel('Map veto · Overlay bar', layers.veto, 0, 4, null); await patchRoom(VAL, { airTemplates: [hudT, await saveT('reel-veto', 'map-veto|band', { panel: { fill: { kind: 'solid', a: sw[4], alpha: 0.92 } } })] }); }],
    [5.0, async () => { await showV(2); await panel('Overall standings', layers.br, 2, -1, null); }],
    [5.6, async () => { await panel('Overall standings', layers.br, 3, -1, null); await call('lobbyLook', [lobby.id, { theme: { preset: 'jungle', props: { crate: true, chutes: true, side: 'right' } } }]); }],
    [6.2, async () => { await panel('Overall standings', layers.br, 4, -1, null); await call('lobbyLook', [lobby.id, { theme: { preset: 'inferno', props: { crate: true, chutes: true, side: 'right' } } }]); }],
    [6.8, async () => {
      await call('lobbyLook', [lobby.id, { theme: { preset: 'sky', props: { crate: true, chutes: true, side: 'right' } } }]);
      await saveT('reel-wwcd', 'br-wwcd|full', {}); await call('lobbyLook', [lobby.id, { templates: { 'br-wwcd|full': 'reel-wwcd' } }]); await call('lobbyTake', [lobby.id, 'br-wwcd']);
      await panel('WWCD', layers.wwcd, 1, -1, 'WINNER WINNER CHICKEN DINNER');
    }],
    [7.3, async () => { await panel('WWCD', layers.wwcd, 1, -1, 'CHAMPIONS OF THE DROP'); await saveT('reel-wwcd', 'br-wwcd|full', { subline: { label: 'CHAMPIONS OF THE DROP' } }); }],
    [7.8, async () => { await panel('WWCD', layers.wwcd, 0, 2, 'CHAMPIONS OF THE DROP'); await saveT('reel-wwcd', 'br-wwcd|full', { subline: { label: 'CHAMPIONS OF THE DROP' }, 'word.face': { color: sw[2] } }); }],
  ];
  const SS = (T.close - T.studio) / 8.4;
  const at = Object.fromEntries(plan.map(([t, fn]) => [F(t * SS), fn]));
  const targetsOf = () => [[0.0, wdPos], [0.5, swPos[0]], [1.3, swPos[2]], [2.3, lyPos[1]], [2.9, swPos[3]], [3.8, swPos[4]], [4.9, lyPos[2]], [5.4, lyPos[3]], [6.0, lyPos[4]], [6.7, lyPos[1]], [7.1, wdPos], [7.6, swPos[2]]];
  let targets = null;
  await scene('7-studio', T.studio, T.close, {
    css: studioCss, ui: studioHtml, key: 0.92,
    ready: async () => {
      await panel('In-game HUD', layers.hud, 1, -1, null);
      const r = await stage.evaluate(() => { const c = (e) => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; };
        return { sw: [...document.querySelectorAll('#sws b')].map(c), ly: [...document.querySelectorAll('#ly div')].map((e) => { const b = e.getBoundingClientRect(); return [b.x + 90, b.y + b.height / 2]; }), wd: [(document.getElementById('sws').getBoundingClientRect().x + 80), document.getElementById('sws').getBoundingClientRect().y + 120] }; });
      swPos = r.sw; lyPos = r.ly; wdPos = r.wd; targets = targetsOf();
    },
    each: async (i) => {
      if (at[i]) { await at[i](); await sleep(170); }
      if (!targets) return;
      const t = i / FPS / SS;
      let a = targets[0], b = targets[targets.length - 1];
      for (let k = 0; k < targets.length - 1; k++) if (t >= targets[k][0] && t < targets[k + 1][0]) { a = targets[k]; b = targets[k + 1]; break; }
      const u = Math.min(1, (t - a[0]) / Math.max(0.01, Math.min(0.45, b[0] - a[0])));
      const e = RF.EASE_IN(u);
      await ptrTo([a[1][0] + (b[1][0] - a[1][0]) * e, a[1][1] + (b[1][1] - a[1][1]) * e]);
    },
  });
  await call('lobbyTake', [lobby.id, null]);

  // ═════ 69.5 – 73.5 s: more games: twelve tiles of what was just on screen turn into the games ═════
  const coming = [['apex', 66], ['eafc', 0], ['cs2', 0], ['r6s', 38], ['lol', 100], ['dota2', 100], ['cod', 56], ['fortnite', 100], ['rocket-league', 0], ['tekken8', 74]];
  const fronts = ['teams', 'roster', 'veto', 'schedule', 'casters', 'sponsors', 'air', 'byhand', 'agents', 'hud', 'mvp', 'wwcd'].map((k) => shots[k] || '');
  const live = { 9: ['VALORANT', liveShot.val], 10: ['PUBG MOBILE', liveShot.pubg] };
  const flipOrder = [9, 10, 1, 2, 5, 6, 4, 7, 0, 3, 8, 11];
  let c7 = 0;
  const backs = fronts.map((_, k) => {
    if (live[k]) return `<div class="fb live" style="background-image:url('${live[k][1] ? serve(`live-${k}.jpg`, live[k][1], 'image/jpeg') : ''}')"><b class="m">${live[k][0]}</b></div>`;
    const [n, y] = coming[c7++];
    return `<div class="fb" style="background-image:url('${POSTER(n)}');background-position:50% ${y}%"></div>`;
  });
  await scene('8-close', T.close, T.word, {
    css: `
      .ow{position:absolute;left:96px;top:156px;display:grid;grid-template-columns:repeat(4,414px);grid-auto-rows:233px;gap:24px}
      .fl{position:relative;width:414px;height:233px;perspective:1600px}
      .fi{position:absolute;inset:0;transform-style:preserve-3d;animation:flip7 .6s var(--in) var(--d) both}
      @keyframes flip7{0%{transform:rotateY(0)}100%{transform:rotateY(180deg)}}
      .ff,.fb{position:absolute;inset:0;backface-visibility:hidden;background:var(--surface) 50% 50%/cover no-repeat;border:1px solid var(--line)}
      .fb{transform:rotateY(180deg)}
      .fb.live{border-top:2px solid var(--rose);background-size:cover}
      .fb.live b{position:absolute;left:14px;top:14px;padding:6px 10px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-size:14px}
      .ow-band{position:absolute;left:0;top:800px;width:1920px;height:280px;background:var(--bg);z-index:30}`,
    ui: `<div class="ow">${fronts.map((f, k) => `<div class="fl rv" style="--d:${(k * 0.04).toFixed(2)}s"><div class="fi" style="--d:${(0.95 + flipOrder.indexOf(k) * 0.04).toFixed(2)}s"><div class="ff" style="background-image:url('${f}')"></div>${backs[k]}</div></div>`).join('')}</div>
      <div class="ow-band"></div>${RF.wordsHtml(['More games coming.'], 'd96', 1.0, 'position:absolute;left:242px;top:850px;z-index:31')}`,
    key: 0.9,
  });

  // ═════ 73.5 – 76.5 s: From bracket to broadcast. ═════
  await scene('9-word', T.word, T.back, {
    ui: `<img class="rv" src="${MARK}" style="position:absolute;left:242px;top:290px;height:64px;--d:0s">${RF.wordsHtml(['From bracket', 'to broadcast.'], 'd132', 0.08, 'position:absolute;left:242px;top:392px')}`, key: 0.75,
  });

  // ═════ 76.5 – 79.5 s: the result goes back; the lockup settles into frame 0 ═════
  const t0n = vteams[0], t1n = vteams[1];
  await scene('9-back', T.back, T.out, {
    drift: false, key: 0.45,
    css: `
      #lk{position:absolute;left:242px;top:280px;height:520px;transform-origin:50% 50%;animation:lksettle 2.9667s linear both}
      @keyframes lksettle{from{transform:scale(.97)}to{transform:scale(1)}}
      .rcw{position:absolute;left:1000px;top:420px;width:640px;animation:fly .8s var(--in) 1.5s forwards,clipout .25s var(--out) 2.3s forwards}
      @keyframes fly{to{transform:translate(-854px,35px) scale(.16)}}
      @keyframes clipout{to{clip-path:inset(0 0 100% 0)}}
      .rc{padding:26px 30px}
      .rc .k{color:var(--muted);font-size:16px}
      .rc .r{margin-top:18px;font:500 40px/1 'JetBrains Mono',monospace;letter-spacing:.02em;font-variant-numeric:tabular-nums;white-space:pre}
      .ap{position:absolute;left:242px;top:838px;display:flex;align-items:center;gap:12px;font-size:16px;color:var(--text);animation:rv .6s var(--in) 2.15s both,clipout .4s var(--out) 2.5s forwards}
      .ap i{width:10px;height:10px;background:var(--rose)}`,
    ui: `<img id="lk" src="${LOCKUP}"><div class="rcw"><div class="rc sf rv" style="--d:0s"><div class="m k">MAP 3 · LOTUS · RESULT</div><div class="r">${t0n.tag} 13 — 11 ${t1n.tag}</div></div></div>
      <div class="m ap"><i></i>RESULT APPLIED · ESPORTRA</div>`,
  });

  await browser.close();
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 8).join(' | '));
  if (STILLS) {
    const dir = path.join(OUT, 'stills'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    board.forEach(([, file], k) => fs.copyFileSync(file, path.join(dir, String(k).padStart(3, '0') + '.jpg')));
    const { execFileSync } = require('node:child_process');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', `scale=480:-1,tile=6x${Math.ceil(board.length / 6)}:padding=6:color=0x09090b`, '-frames:v', '1', path.join(OUT, 'board.jpg')]);
    fs.writeFileSync(path.join(OUT, 'stills.txt'), board.map(([n, , t, x], k) => `${String(k).padStart(3, '0')}  ${t.toFixed(2)} s  ${n}${x ? ' (crossover)' : ''}`).join('\n') + '\n');
    const xs = board.map((b, k) => [b, k]).filter(([b]) => b[3] === 'xover');
    if (xs.length) { const xd = path.join(OUT, 'stills-crossover'); fs.rmSync(xd, { recursive: true, force: true }); fs.mkdirSync(xd); xs.forEach(([b], k) => fs.copyFileSync(b[1], path.join(xd, `${String(k).padStart(2, '0')}.jpg`)));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(xd, '%02d.jpg'), '-vf', 'scale=640:-1,tile=3x2:padding=6:color=0x09090b', '-frames:v', '1', path.join(OUT, 'crossover.jpg')]); }
    console.log(JSON.stringify({ stills: board.length, board: path.join(OUT, 'board.jpg'), cuts }));
    return;
  }
  fs.writeFileSync(path.join(OUT, 'cuts.txt'), `${cuts.join('\n')}\n${(rec.frames / FPS).toFixed(3)}s  end\n`);
  const silent = path.join(OUT, 'picture-16x9.mp4');
  kit.encode(rec.dir, silent);
  const mp4 = path.join(OUT, 'esportra-air-loop-16x9.mp4'), vert = path.join(OUT, 'esportra-air-loop-9x16.mp4');
  const { execFileSync } = require('node:child_process');
  const M = require('./reel-mix.cjs');
  if (MUSIC) M.mix(silent, MUSIC, process.env.REEL_SFX || '', mp4, M.LOOP2_CUES || M.LOOP_CUES, T.out, { loop: true });
  else fs.copyFileSync(silent, mp4);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-filter_complex', '[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', String(FPS), '-c:a', 'copy', '-movflags', '+faststart', vert]);
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(silent, 0.5), cuts }));
})().catch((e) => { console.error(e); process.exit(1); });
