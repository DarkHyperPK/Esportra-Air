// Esportra AIR · loop reel (26 Nov, the producer's brief). 79.5 s that repeat seamlessly, on "Path To Victory"
// (Universfield, CC BY 4.0; ~117.5 BPM; its breakdown cut on bar lines by dev/reel-loop-track.sh, so bars fall every
// 2 s from 1.5 s and the second drop lands at 49.5 s). The story: Esportra runs the tournament; six splashes show what
// it gives AIR for the broadcast (teams and players, schedule, bracket and standings, the live veto, casters,
// sponsors), each through Air's real graphic where one exists; AIR's real screen picks the match up from Esportra
// with everything in; not on Esportra, a team is made by hand (PUBG MOBILE lobbies are run that way); then it is on
// air: Valorant, PUBG MOBILE, Graphics studio, more games; the score goes back to Esportra and the reel lands on the
// Esportra mark it opened with, so the last frame meets the first.
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   REEL_MUSIC=<loop track .wav> REEL_SFX=<sfx dir> REEL_PHOTOS=<9 player cutouts, 00–08.png> REEL_TALENT=<2 talent photos> \
//     node dev/showreel-loop.cjs [host] [engine port] <out dir> [--stills]
// Posters and the Esportra icon are read from the Esportra website's assets (../esportra/public); player and talent
// photos are the producer's (dev/reel-portraits.py prepares them); team emblems and sponsor marks are drawn here.
// Nothing is copied into the repo.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const S = require('./reel-setup.cjs');
const E = require('./reel-emblems.cjs');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const H = args[0] || 'http://127.0.0.1:5334';
const ENGINE = args[1] || '5396';
const OUT = args[2] || path.join(process.cwd(), 'showreel-loop');
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
const { VAL, REPLAY } = S;

// The cut sheet, on the edited track's bars (seconds). The last frame is the first: the Esportra mark.
const T = {
  mark: 0, teams: 3.5, schedule: 5.5, bracket: 7.5, standings0: 8.5, veto: 9.5, casters: 11.5, sponsors: 13.5, recap: 15.5,
  air: 17.5, byHand: 27.5, intro: 35.5, profile: 37.5, agents: 39.5, hud: 43.5,
  drop: 49.5, today: 51.5, brhud: 53.5, standings: 57.5, mvp: 59.5, wwcd: 61.5, studio: 63.5, close: 69.5, word: 73.5, back: 76.5, out: 79.5,
};

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
// The same veto in the HUD's spelling, for the graphics.
const VETO = SHOWCASE.matches[0].veto.map((s) => ({ team: s.team, action: s.action, map: s.map.toUpperCase(), ...(s.side ? { side: s.side } : {}) }));
const SPONSORS = [
  { name: 'NOVA ENERGY', tier: 'Title', line: 'Official energy partner', color: '#ffb60e', glyph: 'M14 2 4 14h7l-2 8 10-12h-7z' },
  { name: 'ARCLIGHT PC', tier: 'Partner', line: 'Powering every observer', color: '#38bdf8', glyph: 'M3 18a9 9 0 0 1 18 0h-3a6 6 0 0 0-12 0z' },
  { name: 'KITE NETWORK', tier: 'Supporter', line: 'Low-latency partner', color: '#f43f5e', glyph: 'M12 2 20 10 12 22 4 10z' },
];
const sponsorSvg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="200" viewBox="0 0 720 200"><rect width="720" height="200" fill="none"/><g transform="translate(24 40) scale(5)"><path d="${s.glyph}" fill="${s.color}"/></g><text x="170" y="122" font-family="Poppins, Arial, sans-serif" font-weight="800" font-size="62" letter-spacing="1" fill="#ffffff">${s.name}</text></svg>`;

const CSS = (fonts) => `${fonts}
*{box-sizing:border-box}
body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#05070d;color:#fff;font-family:Poppins,system-ui,sans-serif;perspective:2200px}
.bg{position:absolute;inset:0;background:radial-gradient(70% 70% at 70% 25%,#16203a 0%,#0a0d18 55%,#05070d 100%)}
#cam{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}
.in{position:absolute;inset:0;transform-origin:50% 50%}
.g{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;background:transparent}
/* copy: words rise in fast, one after another */
.copy{position:absolute;z-index:40;left:110px;bottom:110px;max-width:1500px;font:800 78px/1.04 Poppins;letter-spacing:-.025em;text-shadow:0 8px 40px rgba(0,0,0,.6);animation:cout .35s var(--out,99s) ease-in both}
.copy.c{left:0;right:0;max-width:none;text-align:center}
.copy.top{bottom:auto;top:90px}
.copy em{font-style:normal;color:#ffb60e}
.copy .w{display:inline-block;animation:wrise .45s cubic-bezier(.15,.85,.25,1) both}
@keyframes wrise{0%{opacity:0;transform:translateY(46px) rotate(2deg)}100%{opacity:1;transform:none}}
@keyframes cout{0%{opacity:1}100%{opacity:0;transform:translateY(-14px)}}
.tag{position:absolute;z-index:40;left:56px;top:48px;padding:9px 14px;background:#ffb60e;color:#0b0b0f;font:800 18px/1 Poppins;letter-spacing:.18em;animation:tagin .35s cubic-bezier(.2,.8,.2,1) both,cout .3s var(--out,2.2s) ease-in both}
@keyframes tagin{0%{opacity:0;transform:translateX(-18px)}100%{opacity:1;transform:none}}
.pop{animation:pop .5s cubic-bezier(.2,1.4,.3,1) var(--d,0s) both}
@keyframes pop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:none}}
.rise{animation:rise2 .55s cubic-bezier(.15,.85,.25,1) var(--d,0s) both}
@keyframes rise2{0%{opacity:0;transform:translateY(40px)}100%{opacity:1;transform:none}}
/* transitions: the frame before, leaving in a different way each time */
.tr{position:absolute;inset:0;z-index:80;width:1920px;height:1080px;pointer-events:none}
.tr.slash{animation:slash .42s cubic-bezier(.7,0,.2,1) both}
@keyframes slash{0%{clip-path:polygon(0% 0%,100% 0%,100% 100%,0% 100%)}100%{clip-path:polygon(120% 0%,140% 0%,140% 100%,100% 100%)}}
.tr.slashl{animation:slashl .42s cubic-bezier(.7,0,.2,1) both}
@keyframes slashl{0%{clip-path:polygon(0% 0%,100% 0%,100% 100%,0% 100%)}100%{clip-path:polygon(-40% 0%,-20% 0%,0% 100%,-40% 100%)}}
.edge{position:absolute;z-index:81;top:-10%;height:120%;width:26px;background:#ffb60e;box-shadow:0 0 40px #ffb60e;transform:skewX(-11deg);animation:edge .42s cubic-bezier(.7,0,.2,1) both}
@keyframes edge{0%{left:-4%}100%{left:112%}}
.edge.l{animation-name:edgel}@keyframes edgel{0%{left:104%}100%{left:-12%}}
.tr.zoom{animation:zoomout .42s cubic-bezier(.6,0,.4,1) both}
@keyframes zoomout{0%{transform:scale(1);opacity:1}100%{transform:scale(1.7);opacity:0}}
.in.zin{animation:zin .5s cubic-bezier(.15,.85,.25,1) both}@keyframes zin{0%{transform:scale(.82)}100%{transform:none}}
.tr.flip{transform-origin:50% 50%;animation:flipout .3s cubic-bezier(.6,0,.9,.6) both}
@keyframes flipout{0%{transform:rotateY(0)}100%{transform:rotateY(-90deg)}}
.in.flipin{animation:flipin .32s .3s cubic-bezier(.1,.4,.3,1) both}@keyframes flipin{0%{transform:rotateY(90deg)}100%{transform:none}}
.in.iris{animation:iris .55s cubic-bezier(.6,0,.2,1) both}@keyframes iris{0%{clip-path:circle(0% at 50% 50%)}100%{clip-path:circle(75% at 50% 50%)}}
.ring{position:absolute;z-index:81;left:50%;top:50%;width:40px;height:40px;margin:-20px;border-radius:50%;border:6px solid #ffb60e;box-shadow:0 0 40px #ffb60e;animation:ring .55s cubic-bezier(.6,0,.2,1) both}
@keyframes ring{0%{transform:scale(0);opacity:1}100%{transform:scale(60);opacity:0}}
.black{position:absolute;inset:0;z-index:90;background:#000}
`;


(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const FONTS = kit.fontCss();
  const ICON = dataUrl(path.join(SITE, 'brand/esportra-icon-512.png'));
  // The official lockup (assets/brand): the triangle mark and the ESPORTRA wordmark.
  // Pictures reach the stage by address (http://reel.local/<name>), never as large data URLs in the page.
  const LOCAL = new Map();
  const serve = (name, body, type = 'image/png') => { LOCAL.set(name, { body, type }); return `http://reel.local/${name}`; };
  // The producer's lockup (mark and name) and the mark alone, prepared from their PNG (REEL_BRAND); else the repo's.
  const BRAND = process.env.REEL_BRAND || '';
  const brandFile = (f, fallback) => (BRAND && fs.existsSync(path.join(BRAND, f)) ? path.join(BRAND, f) : path.join(__dirname, '../../../assets/brand', fallback));
  const MARK = serve('mark.png', fs.readFileSync(brandFile('esportra-mark.png', 'esportra-mark.png')));
  const MARK_DATA = dataUrl(brandFile('esportra-mark.png', 'esportra-mark.png'));
  const LOCKUP = BRAND && fs.existsSync(path.join(BRAND, 'esportra-lockup.png')) ? serve('lockup.png', fs.readFileSync(path.join(BRAND, 'esportra-lockup.png'))) : '';
  const WORDMARK = serve('wordmark.png', fs.readFileSync(path.join(__dirname, '../../../assets/brand/esportra-wordmark.png')));
  const POSTER = (n) => serve(`poster-${n}.png`, fs.readFileSync(path.join(SITE, `games/${n}-logo.png`)));
  const localRoute = (c) => c.route('http://reel.local/**', (r) => { const v = LOCAL.get(path.basename(new URL(r.request().url()).pathname)); return v ? r.fulfill({ status: 200, contentType: v.type, body: v.body }) : r.fulfill({ status: 404, body: '' }); });

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
  // The producer's portraits (dev/reel-portraits.py order): 00 NAVID, 01 SiNiSTER, 02 Gen.G, 03 Inside Games, 04 green
  // jersey, 05 Dragon Rangers, 06 Alternate, 07 ahq, 08 DN. NIGHT OWLS (Valorant, from Esportra) 00, 03, 01, 02, 04;
  // NORTH TIDE (PUBG MOBILE, made by hand on camera) 05, 07, 06; NOCTURNE KAI (the PUBG MVP) 08. None twice.
  const NWL = [['JUNO', 0, 'Duelist'], ['MIRA', 3, 'Controller'], ['DAX', 1, 'Initiator'], ['RIKU', 2, 'Sentinel'], ['ECHO', 4, 'Flex']];
  const CRF = ['KAIRO', 'SOL', 'VEX', 'NYX', 'ZEN'];
  const BYHAND = [['NTD_ACE', 5], ['NTD_VEX', 7], ['NTD_ROOK', 6]];
  // The lobby's 16 teams; the first two are renamed so the Valorant teams keep their names in the shared library.
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
  // The Esportra teams in Teams/Players, with the producer's photos: an Esportra import links them by Riot ID.
  for (const [team, tag, color, list] of [['NIGHT OWLS', 'NWL', '#22d3ee', NWL], ['CRIMSON FIVE', 'CRF', '#f43f5e', CRF.map((n) => [n, -1, ''])]]) {
    await call('saveTeam', [{ name: team, tag, color, logo: await upload(EMB[tag]) }]);
    const t = (await call('snapshot')).library.teams.find((x) => x.name === team);
    for (const [n, ph, role] of list) await call('savePlayer', [{ name: n, realName: '', gameId: `${n[0]}${n.slice(1).toLowerCase()}#${tag}`, photo: ph >= 0 ? await upload(photos[ph]) : '', role, teamId: t.id }]);
  }
  const routes = async (c) => {
    // The stand-in Esportra's sponsor logo addresses, answered with the marks drawn above.
    await c.route('https://example.com/reel/**', (r) => { const k = ['nova', 'arclight', 'kite'].findIndex((n) => r.request().url().includes(n)); r.fulfill({ status: 200, contentType: 'image/png', body: sponsorPng[Math.max(0, k)] }); });
  };
  await routes(ctx); await localRoute(ctx);

  // ═════ Recorded first, shown at 27.5 s: a PUBG MOBILE team made by hand in Teams/Players (Air's real screen) ═════
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await kit.prepare(appCtx); await routes(appCtx);
  const app = await appCtx.newPage(); const errs = []; app.on('pageerror', (e) => errs.push('app: ' + e.message));
  const src = kit.recorder(path.join(OUT, 'src-unused'));
  const ui = kit.chrome(app, FONTS);
  const tmp = path.join(OUT, 'picks'); fs.mkdirSync(tmp, { recursive: true });
  const fileOf = (name, b64) => { const f = path.join(tmp, name); fs.writeFileSync(f, Buffer.from(b64.split(',')[1], 'base64')); return f; };
  let crop = { x: 0, y: 0, w: 1280 };
  const full = () => { crop = { x: 0, y: 0, w: 1280 }; };
  const cropTop = async (dlg, loc, w, pad = 36) => {
    const d0 = await dlg.boundingBox(), b = await loc.boundingBox(), hgt = (w * 9) / 16;
    crop = { x: Math.min(1280 - w, Math.max(0, d0.x + d0.width / 2 - w / 2)), y: Math.min(720 - hgt, Math.max(0, b.y - pad)), w };
  };
  const cropOn = async (loc, w, dy = 0) => {
    const b = await loc.boundingBox(), hgt = (w * 9) / 16;
    crop = { x: Math.min(1280 - w, Math.max(0, b.x + b.width / 2 - w / 2)), y: Math.min(720 - hgt, Math.max(0, b.y + b.height / 2 - hgt / 2 + dy)), w };
  };
  /** A crop whose top-left corner sits just above and left of `loc` (for page content beside the step list). */
  const cropLeft = async (loc, w, padTop = 30, padLeft = 40) => {
    const b = await loc.boundingBox(), hgt = (w * 9) / 16;
    crop = { x: Math.min(1280 - w, Math.max(0, b.x - padLeft)), y: Math.min(720 - hgt, Math.max(0, b.y - padTop)), w };
  };
  /** Air's picture for one video frame, kept on disk with the crop it is shown at. */
  const appTake = (dir) => { fs.mkdirSync(dir, { recursive: true }); const list = []; return { list, async grab() { const f = path.join(dir, String(list.length).padStart(4, '0') + '.jpg'); fs.writeFileSync(f, await src.grab(app)); list.push({ file: f, crop: { ...crop } }); } }; };
  const filmOf = (take) => ({ run: async (_p, count, each) => { for (let k = 0; k < count; k++) { if (each) await each(k); await take.grab(); } } });

  await call('chooseGame', ['pubgm']);
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor(); await ui.dress();
  await app.locator('nav[aria-label="Main"]').getByRole('button', { name: 'Teams/Players' }).click(); await app.waitForTimeout(600);
  await app.getByRole('tab', { name: 'Teams' }).click(); await app.waitForTimeout(300);
  ui.pos = [760, 560]; await ui.place();
  const byHand = appTake(path.join(OUT, 'byhand')), fb = filmOf(byHand);
  {
    full();
    await fb.run(app, 4);
    await ui.click(fb, app.getByRole('button', { name: 'Add team' }), { frames: 10, after: 6 });
    const drawer = app.getByRole('dialog', { name: 'Add a team' });
    const logoBtn = drawer.getByRole('button', { name: /logo of/i }).first();
    await cropTop(drawer, logoBtn, 600, 40);
    await ui.point(fb, logoBtn, 8);
    await drawer.locator('input[type=file]').first().setInputFiles(fileOf('north-tide.png', emblems[5]));
    await app.getByRole('button', { name: /Change logo/i }).first().waitFor();
    await fb.run(app, 5);
    await ui.type(fb, drawer.getByLabel('Name', { exact: true }), 'NORTH TIDE', { per: 2 });
    await ui.type(fb, drawer.getByLabel('Tag'), 'NTD', { per: 2 });
    await fb.run(app, 3);
    full();
    await ui.click(fb, drawer.getByRole('button', { name: 'Save' }), { frames: 10, after: 7 });
    await app.getByRole('button', { name: 'Add a player to NORTH TIDE' }).waitFor();
    for (const [k, [n, ph]] of BYHAND.entries()) {
      const add = app.getByRole('button', { name: 'Add a player to NORTH TIDE' });
      full();
      await ui.click(fb, add, { frames: k ? 8 : 10, after: 4 });
      const pd = app.getByRole('dialog', { name: 'Add a player' });
      const photoBtn = pd.getByRole('button', { name: /photo of/i }).first();
      await cropTop(pd, photoBtn, k ? 720 : 600, 40);
      if (!k) await ui.point(fb, photoBtn, 7);
      await pd.locator('input[type=file]').first().setInputFiles(photoFiles[ph]);
      await pd.getByRole('button', { name: /Change photo/i }).first().waitFor();
      await fb.run(app, k ? 3 : 4);
      if (k < 2) await ui.type(fb, pd.getByLabel('Name on air'), n, { per: 1 });
      else await pd.getByLabel('Name on air').fill(n);
      await pd.getByLabel('In-game name').fill(n);
      await fb.run(app, 4);
      full();
      await ui.click(fb, pd.getByRole('button', { name: 'Save' }), { frames: 6, after: k === 2 ? 6 : 4 });
    }
    ui.pos = [1250, 700]; await ui.place();
  }

  // ═════ Off camera: the PUBG MOBILE lobby (NORTH TIDE as made above) and a recorded game; Valorant chosen ═════
  const d = await S.prepare(h, { names, tags, logo: lobbyLogo, photo: lobbyPhoto, esportra: false });
  const { lobby, code, states, wwcdAt, fbAt } = d;
  await call('lobbyShow', [lobby.id, { pick: { scope: 'match', game: 1 } }]);
  await kit.prepare(ctx);
  const { sample, wall, seek, resetReplay } = await S.dress(h, ctx, d);
  for (let i = 0; i < 20; i++) { await call('esportraRefresh').catch(() => {}); if ((await call('snapshot')).esportra.matches.some((m) => m.teamA === 'NIGHT OWLS')) break; await sleep(500); }

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
  /** A picture of the stage as it is now (for the recap and the closing wall). */
  const snapStage = async (key) => { shots[key] = serve(`shot-${key}.jpg`, await stage.screenshot({ type: 'jpeg', quality: 82 }), 'image/jpeg'); };
  const lastFrame = () => path.join(rec.dir, String(rec.frames - 1).padStart(6, '0') + '.jpg');
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /** Camera keys [frame, scale, focus x, focus y] → a transform for #cam (eased between keys). */
  function camAt(keys, i) {
    let a = keys[0], b = keys[0];
    for (const k of keys) { if (k[0] <= i) a = k; if (k[0] >= i) { b = k; break; } b = k; }
    const t = b[0] === a[0] ? 1 : ease(Math.min(1, Math.max(0, (i - a[0]) / (b[0] - a[0]))));
    const s = a[1] + (b[1] - a[1]) * t;
    const fx = Math.min(1920 - 960 / s, Math.max(960 / s, a[2] + (b[2] - a[2]) * t));
    const fy = Math.min(1080 - 540 / s, Math.max(540 / s, a[3] + (b[3] - a[3]) * t));
    return `translate(${(960 - fx * s).toFixed(2)}px,${(540 - fy * s).toFixed(2)}px) scale(${s.toFixed(5)})`;
  }
  const push = (secs, s0 = 1, s1 = 1.05, fx = 960, fy = 540) => [[0, s0, fx, fy], [F(secs), s1, fx, fy]];
  const prevImg = (kind) => (STILLS || !rec.frames ? '' : kind === 'cut' ? '' : `<img class="tr ${kind}" src="${dataUrl(lastFrame(), 'image/jpeg')}">${kind === 'slash' ? '<div class="edge"></div>' : kind === 'slashl' ? '<div class="edge l"></div>' : kind === 'iris' ? '' : ''}`);
  const inClass = { zoom: 'zin', flip: 'flipin', iris: 'iris' };
  /** A transition inside a page: the frame just recorded leaves over what is now there. */
  const transitionNow = async (kind) => {
    if (STILLS) return;
    const u = dataUrl(lastFrame(), 'image/jpeg');
    await stage.evaluate(([u, kind]) => {
      const i = document.createElement('img'); i.className = `tr ${kind}`; i.src = u; document.body.appendChild(i);
      if (kind === 'slash' || kind === 'slashl') { const e = document.createElement('div'); e.className = `edge${kind === 'slashl' ? ' l' : ''}`; document.body.appendChild(e); }
      return i.decode().catch(() => {});
    }, [u, kind]);
  };

  /**
   * One scene from `from` to `to` (seconds on the cut sheet): a page, entered by transition `enter`, its camera keys
   * and `each(i)` before every frame. `opts.three` drives the bridge (draw(t)). Returns when the scene's last frame is shot.
   */
  async function scene(name, from, to, html, enter, each, opts = {}) {
    // A page that crashes (memory) is opened again and the scene recorded again from its first frame, once.
    const start = rec.frames, boardAt = board.length, cutsAt = cuts.length;
    console.log(`scene ${name} at ${(start / FPS).toFixed(2)} s`);
    try { await sceneOnce(name, from, to, html, enter, each, opts); } catch (e) {
      if (!/crash|closed/i.test(e.message)) throw e;
      console.warn(`scene ${name}: page crashed (${e.message.split('\n')[0]}); recording it again`);
      await stage.close().catch(() => {}); await openStage();
      rec.rewind(start); board.length = boardAt; cuts.length = cutsAt;
      await sceneOnce(name, from, to, html, enter, each, opts);
    }
  }
  async function sceneOnce(name, from, to, html, enter, each, opts = {}) {
    const n = F(to) - F(from);
    const wrapCls = inClass[enter] && !STILLS ? `in ${inClass[enter]}` : 'in';
    const iris = enter === 'iris' && !STILLS ? '<div class="ring"></div>' : '';
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}</style></head><body><div class="bg"></div><div class="${wrapCls}" id="wrap"><div id="cam">${html}</div></div><div id="over">${opts.over ?? ''}</div>${enter === 'iris' ? '' : prevImg(enter)}${iris}</body></html>`, { waitUntil: 'load' });
    if (enter === 'iris' && !STILLS && rec.frames) {
      // The old frame sits under the new scene while it opens out of a circle.
      await stage.evaluate((u) => { const i = document.createElement('img'); i.className = 'tr'; i.style.zIndex = '-1'; i.src = u; document.body.prepend(i); return i.decode().catch(() => {}); }, dataUrl(lastFrame(), 'image/jpeg'));
    }
    for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
    await stage.evaluate(() => document.fonts.ready);
    if (opts.ready) await opts.ready();
    await sleep(350);
    cuts.push(`${(rec.frames / FPS).toFixed(3)}s  ${name}`);
    const key = Math.floor(n * (opts.key ?? 0.65));
    for (let i = 0; i < n; i++) {
      if (each) await each(i);
      if (opts.three) await stage.evaluate((t) => window.bridge.draw(t), i / FPS);
      if (opts.cam) await stage.evaluate((tf) => { document.getElementById('cam').style.transform = tf; }, camAt(opts.cam, i));
      const shoot = !STILLS || i === key;
      await rec.frame(stage, opts.vt ? opts.vt(i) : null, shoot);
      if (STILLS && shoot) board.push([name, lastFrame()]);
    }
  }
  const g = (src, style = '', id = '') => `<iframe class="g" ${id ? `id="${id}" ` : ''}src="${src}" style="${style}"></iframe>`;
  const words = (html, d0 = 0, step = 0.07) => html.split(/(<em>.*?<\/em>|\s+)/).filter((w) => w && w.trim()).map((w, k) => `<span class="w" style="animation-delay:${(d0 + k * step).toFixed(2)}s">${w}</span>`).join(' ');
  const copy = (html, { d = 0.15, out = 99, cls = '', style = '' } = {}) => `<div class="copy ${cls}" style="--out:${out}s;${style}">${words(html, d)}</div>`;
  const tag = (t, out = 2.4) => `<div class="tag" style="--out:${out}s">${t}</div>`;

  // Shared pieces for this reel: the Esportra mark (first and last frame), splash labels, Air's picture.
  const MARK_CSS = `<style>
    .mk{position:absolute;left:0;right:0;top:190px;display:flex;flex-direction:column;align-items:center;gap:44px}
    .mk .lk{height:520px}.mk .m{height:190px}.mk .w{width:820px}
    .mk .lk{transform-origin:50% 50%}
    .mk.grow .lk{animation:lkgrow 3.5s linear both}@keyframes lkgrow{from{transform:scale(1)}to{transform:scale(1.035)}}
    .mk.settle .lk{animation:lksettle 2.9667s linear both}@keyframes lksettle{from{transform:scale(.97)}to{transform:scale(1)}}
    .sl{position:absolute;z-index:45;display:flex;flex-direction:column;gap:10px;padding:26px 34px 30px;background:linear-gradient(120deg,rgba(5,7,13,.92),rgba(5,7,13,.72));border-left:6px solid #ffb60e;border-radius:4px;box-shadow:0 18px 50px rgba(0,0,0,.45);animation:slin .45s cubic-bezier(.15,.85,.25,1) both}
    .sl .k{display:flex;align-items:center;gap:10px;font:700 16px/1 Poppins;letter-spacing:.26em;color:#8fa0c4}.sl .k img{height:22px}
    .sl b{font:800 64px/1 Poppins;letter-spacing:-.02em;color:#fff;white-space:nowrap}
    @keyframes slin{0%{opacity:0;transform:translateX(-30px)}100%{opacity:1;transform:none}}
    .sl.at-tl{left:70px;top:70px}.sl.at-tr{right:70px;top:70px;border-left:0;border-right:6px solid #ffb60e;align-items:flex-end;animation-name:slinr}.sl.at-bl{left:70px;bottom:70px}.sl.at-br{right:70px;bottom:70px;border-left:0;border-right:6px solid #ffb60e;align-items:flex-end;animation-name:slinr}
    @keyframes slinr{0%{opacity:0;transform:translateX(30px)}100%{opacity:1;transform:none}}
  </style>`;
  const markHtml = (cls = '') => `${MARK_CSS}<div class="mk ${cls}">${LOCKUP ? `<img class="lk" src="${LOCKUP}">` : `<img class="m lk" src="${MARK}"><img class="w" src="${WORDMARK}">`}</div>`;
  const label = (text, pos) => `${MARK_CSS}<div class="sl at-${pos}"><span class="k"><img src="${MARK}">ESPORTRA</span><b>${text}</b></div>`;
  const host = (room, bg = LOTUS) => `<div style="position:absolute;inset:0;background:#000 url('${bg}') center/cover">${g(`${ENG}/overlays/fullscreen.html?match=${room}&over=1`)}</div>`;
  const page = (name, extra = '') => `${extra}${g(`${ENG}/overlays/${name}.html?match=${VAL}`)}`;
  /** Rects of elements inside the scene's page, measured with its entrance finished. */
  const rectsOf = async (sels) => stage.frames()[1].evaluate((sels) => { document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }); return sels.map(([sel, n]) => { const e = document.querySelectorAll(sel)[n || 0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); }, sels);
  const keyShot = (key, at) => async (i) => { if (i === F(at)) await snapStage(key); };

  // ═════ 1 · Esportra (0–3.5 s): the mark the reel opens and closes on ═════
  await scene('1-mark', T.mark, T.teams, markHtml('grow'), 'cut', null, {
    over: copy('Run your whole tournament on <em>Esportra.</em>', { d: 0.45, out: 99, cls: 'c', style: 'bottom:auto;top:800px;font-size:60px' }), key: 0.8,
  });

  // ═════ 2 · What Esportra gives AIR (3.5–15.5 s): six splashes, each through a real graphic where Air has one ═════
  // a · Teams & players: the team roster graphic with the line-up's photos; each Riot ID verified by Esportra.
  await scene('2a-teams', T.teams, T.schedule, page('team-roster-a'), 'slash', keyShot('teams', 1.3), {
    ready: async () => {
      const cards = await rectsOf([0, 1, 2, 3, 4].map((k) => ['.tr .cd', k]));
      const chips = cards.map((r, k) => (r ? `<div class="rid" style="left:${r.x + 16}px;top:${r.y + r.h - 186}px;animation-delay:${(0.35 + k * 0.1).toFixed(2)}s"><span>${SHOWCASE.lineups.NWL[k].riot}</span><i style="animation-delay:${(0.75 + k * 0.1).toFixed(2)}s">✓</i></div>` : '')).join('');
      await stage.evaluate((html) => document.getElementById('cam').insertAdjacentHTML('beforeend', html), `<style>
        .rid{position:absolute;z-index:20;display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(5,7,13,.86);border:1px solid rgba(255,255,255,.16);font:600 17px 'JetBrains Mono',ui-monospace,monospace;color:#e7ecf6;animation:ridin .4s cubic-bezier(.15,.85,.25,1) both}
        .rid i{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:800 13px Poppins;background:#1c2438;color:transparent;animation:ridok .25s both}
        @keyframes ridin{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}@keyframes ridok{to{background:#34d399;color:#05070d}}</style>${chips}`);
    },
    over: label('Teams &amp; players', 'tr'), cam: [[0, 1.06, 960, 600], [F(2), 1.0, 960, 540]], key: 0.7,
  });
  // b · Schedule: today's matches.
  await scene('2b-schedule', T.schedule, T.bracket, page('schedule'), 'zoom', keyShot('schedule', 1.3), { over: label('Schedule', 'bl'), cam: push(2, 1.0, 1.06, 820, 460), key: 0.7 });
  // c · Bracket, then standings.
  await scene('2c-bracket', T.bracket, T.standings0, page('bracket'), 'slashl', keyShot('bracket', 0.8), { over: label('Bracket &amp; standings', 'br'), cam: [[0, 1.08, 760, 500], [F(1), 1.02, 900, 520]], key: 0.8 });
  await scene('2c-standings', T.standings0, T.veto, page('standings'), 'cut', null, { over: label('Bracket &amp; standings', 'br').replace('class="sl at-br"', 'class="sl at-br" style="animation:none"'), cam: [[0, 1.02, 900, 520], [F(1), 1.06, 760, 600]], key: 0.5 });
  // d · The live veto: Esportra's steps fill the overlay-bar map veto, whose turn and the clock with them.
  await patchRoom(VAL, { veto: [], vetoTurn: { team: 1, action: 'ban', endsAt: Date.now() + 30000 } });
  await action(VAL, 'fullscreen.show', { screen: 'map-veto', style: 'band' });
  await sleep(300);
  const vClock = Date.now() + 60000, vt2d = (i) => vClock + (i / FPS) * 1000;
  await scene('2d-veto', T.veto, T.casters, host(VAL), 'flip', async (i) => {
    const k = Math.floor((i - F(0.2)) / F(0.22));
    if (i >= F(0.2) && (i - F(0.2)) % F(0.22) === 0 && k < vetoSteps.length) {
      const next = SHOWCASE.matches[0].veto[k + 1];
      await patchRoom(VAL, { veto: vetoSteps.slice(0, k + 1), vetoTurn: next && next.team >= 0 ? { team: next.team, action: next.action, endsAt: vt2d(i) + 28000 } : null });
      await sleep(110);
    }
    if (i === F(1.5)) await snapStage('veto');
  }, { vt: vt2d, over: label('Map veto · live', 'tl'), cam: [[0, 1.0, 960, 700], [F(2), 1.05, 960, 780]], key: 0.75 });
  // e · Casters: the desk graphic, the talent in its camera windows.
  const deskPics = talents.slice(0, 2).map((t, k) => `<div style="position:absolute;left:${k ? 980 : 120}px;top:250px;width:820px;height:462px;background:#111 url('${t}') 50% 22%/cover"></div>`).join('');
  await scene('2e-casters', T.casters, T.sponsors, page('casters', deskPics), 'iris', keyShot('casters', 1.3), { over: label('Casters', 'tr'), cam: push(2, 1.0, 1.05, 960, 520), key: 0.7 });
  // f · Sponsors: the marks by tier, and their Presented by line on air.
  const sponsorHtml = `<style>
      .sp3{position:absolute;left:0;right:0;top:250px;display:flex;justify-content:center;gap:40px}
      .sp3 div{width:520px;height:300px;border-radius:18px;background:#0f1526;border:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;animation:rise2 .5s cubic-bezier(.15,.85,.25,1) both}
      .sp3 img{width:460px}.sp3 span{font:700 16px Poppins;letter-spacing:.24em;color:#8fa0c4}
      .sp3 div:first-child{border-color:#ffb60e;box-shadow:0 0 50px rgba(255,182,14,.18)}
      .spbar{position:absolute;left:0;top:0;width:1920px;height:1080px;transform:scale(2.1);transform-origin:50% 86%}
    </style><div class="sp3">${SPONSORS.map((s, k) => `<div style="animation-delay:${(0.1 + k * 0.12).toFixed(2)}s"><img src="${serve(`sponsor-${k}.png`, sponsorPng[k])}"><span>${s.tier.toUpperCase()}</span></div>`).join('')}</div>
    <div class="spbar">${g(`${ENG}/overlays/sponsor.html?match=${VAL}`)}</div>`;
  await scene('2f-sponsors', T.sponsors, T.recap, sponsorHtml, 'zoom', keyShot('sponsors', 1.3), { over: label('Sponsors', 'tl'), cam: push(2, 1.03, 1.0, 960, 560), key: 0.75 });

  // ═════ 2g · All of it (15.5–17.5 s): the six, together ═════
  const order6 = ['teams', 'schedule', 'bracket', 'veto', 'casters', 'sponsors'];
  const recapHtml = `<style>
      .rc{position:absolute;left:150px;top:120px;display:grid;grid-template-columns:repeat(3,520px);grid-auto-rows:292px;gap:30px}
      .rc div{border-radius:14px;background:#000 center/cover;box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.12);animation:rcin .5s cubic-bezier(.15,.85,.25,1) both}
      @keyframes rcin{0%{opacity:0;transform:scale(1.5)}100%{opacity:1;transform:none}}
      .rcb{position:absolute;left:0;right:0;bottom:0;height:330px;z-index:30;background:linear-gradient(0deg,rgba(5,7,13,.97) 0%,rgba(5,7,13,.85) 50%,transparent 100%)}
    </style><div class="rc">${order6.map((k, n) => `<div style="background-image:url('${shots[k] || ''}');animation-delay:${(n * 0.06).toFixed(2)}s"></div>`).join('')}</div>`;
  await scene('2g-recap', T.recap, T.air, recapHtml, 'cut', null, {
    over: `<div class="rcb"></div>${copy('Every tournament runs on <em>all of this.</em>', { d: 0.25, out: 99, cls: 'c', style: 'bottom:auto;top:900px;font-size:64px' })}`,
    cam: [[0, 1.0, 960, 540], [F(2), 1.05, 960, 470]], key: 0.85,
  });

  // ═════ The app scenes: every frame is Air's own picture (1280×720 at 2.5×) shown full or as a hard-cut crop ═════
  const APP_CSS = `.tr.shrink{animation:shrink .5s cubic-bezier(.6,0,.3,1) both;transform-origin:50% 50%}@keyframes shrink{0%{transform:none;opacity:1}100%{transform:scale(.3);opacity:0}}
    .in.grow{animation:growin .5s cubic-bezier(.15,.85,.25,1) both}@keyframes growin{0%{transform:scale(1.25)}100%{transform:none}}
    #appimg{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}
    .cb{position:absolute;left:0;right:0;bottom:0;height:260px;z-index:30;background:linear-gradient(0deg,rgba(5,7,13,.92),transparent);animation:cout .35s var(--out) ease-in both}`;
  async function appScene(name, from, to, enter, line, fill) {
    const N = F(to) - F(from), key = Math.floor(N * 0.85);
    console.log(`scene ${name} at ${(rec.frames / FPS).toFixed(2)} s`);
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}${APP_CSS}</style></head><body><div class="bg"></div>
      <div class="${STILLS ? 'in' : enter === 'grow' ? 'in grow' : 'in'}" id="wrap"><div id="cam"><img id="appimg"></div></div>
      <div id="over"><div class="cb" style="--out:${line.out}s"></div>${copy(line.html, { d: 0.3, out: line.out - 0.05, cls: 'c', style: 'bottom:auto;top:930px;font-size:58px' })}</div>
      ${STILLS || enter !== 'grow' ? '' : `<img class="tr shrink" src="${dataUrl(lastFrame(), 'image/jpeg')}">`}</body></html>`, { waitUntil: 'load' });
    await stage.evaluate(() => document.fonts.ready);
    cuts.push(`${(rec.frames / FPS).toFixed(3)}s  ${name}`);
    let n = 0, held = '', since = 0;
    const show = async (b64, c) => {
      const k = 1280 / c.w;
      // Each held framing drifts in slowly (about 2 % a second) so Air's screen never reads as a still.
      const id = JSON.stringify(c); if (id !== held) { held = id; since = n; }
      const z = Math.min(1.05, 1 + 0.0007 * (n - since));
      await stage.evaluate((tf) => { document.getElementById('cam').style.transform = tf; }, `translate(${(960 - 960 * z).toFixed(2)}px,${(540 - 540 * z).toFixed(2)}px) scale(${z.toFixed(5)})`);
      await stage.evaluate(async ([b64, tf]) => { const img = document.getElementById('appimg'); img.src = 'data:image/jpeg;base64,' + b64; img.style.transform = tf; await img.decode().catch(() => {}); },
        [b64, `translate(${(-c.x * 1.5 * k).toFixed(2)}px,${(-c.y * 1.5 * k).toFixed(2)}px) scale(${k.toFixed(5)})`]);
      const shoot = !STILLS || n === key || (process.env.REEL_APPSTILLS && n % 15 === 0);
      await rec.frame(stage, null, shoot);
      if (STILLS && shoot) board.push([name, lastFrame()]);
      n++;
    };
    await fill(show, N);
    if (n > N) console.warn(`${name}: ${n - N} frames over`);
    return n;
  }

  // ═════ 3 · AIR picks it up (17.5–27.5 s): Air's real screen, the match opened from Esportra ═════
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor(); await ui.dress();
  await app.locator('nav[aria-label="Main"]').getByRole('button', { name: 'Events' }).click();
  await app.getByText('Esportra Invitational').first().waitFor({ timeout: 20000 }); await app.waitForTimeout(400);
  ui.pos = [900, 600]; await ui.place();
  full();
  await appScene('3-air', T.air, T.byHand, 'grow', { html: 'Esportra AIR picks it all up. <em>Nothing typed twice.</em>', out: 3.3 }, async (show, N) => { try {
    let n = 0;
    const film = { run: async (_p, count, each) => { for (let k = 0; k < count && n < N; k++) { if (each) await each(k); await show((await src.grab(app)).toString('base64'), crop); n++; } } };
    await film.run(app, 6);
    // The Esportra tournament's card is the last one (its "Open event" is text on a card you click).
    await ui.click(film, app.getByText('Open event', { exact: true }).last(), { frames: 12, after: 6 });
    const row = app.locator('div, li, tr').filter({ hasText: /NIGHT OWLS\s*vs\s*CRIMSON FIVE/ }).last();
    await cropOn(row, 900, 40);
    await film.run(app, 4);
    await ui.click(film, row.getByRole('button', { name: 'Open', exact: true }), { frames: 10, after: 2 });
    await app.locator('nav[aria-label="Match steps"]').waitFor(); await app.waitForTimeout(400);
    full(); await film.run(app, 8);
    const steps = app.locator('nav[aria-label="Match steps"]');
    await cropLeft(app.getByText('NIGHT OWLS', { exact: true }).first(), 1000, 40, 120); await film.run(app, 20);
    full(); await ui.click(film, steps.getByRole('button', { name: /Teams\/Players/ }), { frames: 9, after: 3 });
    await cropLeft(app.getByText('Pick each side').first(), 960, 30); await film.run(app, 40);
    full(); await ui.click(film, steps.getByRole('button', { name: /Talent and sponsors/ }), { frames: 9, after: 3 });
    await cropLeft(app.getByText('On air for this match').first(), 940, 40); await film.run(app, 32);
    full(); await ui.click(film, steps.getByRole('button', { name: /Match data/ }), { frames: 9, after: 3 });
    await cropLeft(app.getByText('Maps and veto', { exact: true }).first(), 900, 30); await film.run(app, 24);
    await app.getByText('The sequence', { exact: false }).first().scrollIntoViewIfNeeded(); await app.waitForTimeout(300);
    await cropLeft(app.getByText(/The sequence/i).first(), 900, 330); await film.run(app, 34);
    // The close of the act: back on Overview, the whole match in and ready.
    full(); await ui.click(film, steps.getByRole('button', { name: /Overview/ }), { frames: 9, after: 3 });
    await ui.point(film, app.getByRole('button', { name: 'Go live', exact: true }), 16);
    while (n < N) await film.run(app, 1);
    await snapStage('air');
  } catch (e) { await app.screenshot({ path: path.join(OUT, 'air-failed.png') }); throw e; } });

  await app.close(); await appCtx.close(); // Act 4 replays from disk; Air's window is no longer needed
  console.log(`by hand: ${byHand.list.length} frames recorded for ${F(T.intro) - F(T.byHand)}`);
  // ═════ 4 · By hand (27.5–35.5 s): not on Esportra, the team is made in Teams/Players (recorded before the lobby) ═════
  await appScene('4-byhand', T.byHand, T.intro, 'cut', { html: 'Not on Esportra? <em>Add teams in a minute.</em>', out: 2.8 }, async (show, N) => {
    const list = byHand.list;
    for (let k = 0; k < N; k++) { const f = list[Math.min(k, list.length - 1)]; await show(fs.readFileSync(f.file).toString('base64'), f.crop); }
    if (list.length > N) console.warn(`4-byhand: ${list.length - N} recorded frames cut`);
    await snapStage('byhand');
  });
  await call('chooseGame', ['valorant']).catch(() => {});

  // ═════ 5 · On air (35.5–49.5 s): Valorant from the Esportra match ═════
  // a · The overlay-bar match intro with the line-up's photos.
  await patchRoom(VAL, { ...vbase, veto: vetoSteps, vetoTurn: null, players: P0 });
  await action(VAL, 'fullscreen.show', { screen: 'match-intro', style: 'band' });
  await sleep(300);
  await scene('5a-intro', T.intro, T.profile, host(VAL), 'zoom', keyShot('intro', 1.2), {
    over: copy('Either way, <em>it\'s on every graphic.</em>', { d: 0.3, out: 99, cls: 'c', style: 'bottom:auto;top:90px;font-size:58px' }),
    cam: [[0, 1.0, 960, 540], [F(2), 1.04, 960, 700]], key: 0.7,
  });
  // b · Player profile, over the game: JUNO's photo and numbers.
  await patchRoom(VAL, { spotlight: { team: 0, player: 0, season: { acs: 248, kd: 1.31, hs: '29%', fb: 41, clutch: 9 } } });
  await action(VAL, 'fullscreen.show', { screen: 'player-profile', style: 'band' });
  await sleep(300);
  await scene('5b-profile', T.profile, T.agents, host(VAL), 'slash', null, { over: `<div class="copy c" style="bottom:auto;top:90px;font-size:58px;animation:cout .3s .2s both">Either way, <em>it's on every graphic.</em></div>`, cam: push(2, 1.0, 1.05, 760, 820), key: 0.7 });
  // c · Agent select over the game, cards locking.
  const agentsP = P0.map((t) => t.map((p) => ({ ...p, locked: false })));
  await patchRoom(VAL, { players: agentsP });
  await action(VAL, 'fullscreen.show', { screen: 'agent-select', style: 'band' });
  await sleep(300);
  const lockOrder = [[0, 0], [1, 0], [0, 1], [1, 2], [0, 2], [1, 1], [0, 3], [1, 3], [0, 4], [1, 4]];
  await scene('5c-agents', T.agents, T.hud, host(VAL), 'slashl', async (i) => {
    const k = Math.floor((i - F(0.3)) / F(0.3));
    if (i >= F(0.3) && (i - F(0.3)) % F(0.3) === 0 && k < lockOrder.length) { const [t, s] = lockOrder[k]; agentsP[t][s].locked = true; await patchRoom(VAL, { players: agentsP }); await sleep(110); }
  }, { cam: [[0, 1.05, 960, 780], [F(4), 1.0, 960, 700]], over: tag('VALORANT') });
  // d · The HUD playing a round: JUNO's clutch.
  await action(VAL, 'fullscreen.show', { screen: null, style: 'band' });
  const P = clone(P0);
  const teams0 = clone(vteams); teams0[0].score = 11; teams0[1].score = 11; teams0[0].series = 1; teams0[1].series = 1;
  const series0 = clone(sample.series); series0[2] = { ...series0[2], score: [11, 11], winner: null };
  const rounds0 = clone(sample.rounds).slice(0, 22);
  await patchRoom(VAL, { ...vbase, teams: teams0, series: series0, rounds: rounds0, players: P, spotlight: null, round: { number: 23, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' } });
  const vbaseT = Date.now() + 3000, vt4 = (i) => vbaseT + (i / FPS) * 1000;
  const kf = [];
  const kill = (k, v, weapon, hs, ts) => { kf.push({ killer: k, victim: v, weapon, hs, ts }); const p = P[v[0]][v[1]]; p.alive = false; p.hp = 0; p.armor = 0; P[k[0]][k[1]].k += 1; };
  const R = 6 / 7; // the v8 round, played in 6 s
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
  await scene('5d-hud', T.hud, T.drop, `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div>`, 'zoom', async (i) => {
    if (round[i]) { await patchRoom(VAL, round[i](vt4(i))); await sleep(130); }
    if (i === F(4.0)) { liveShot.val = await stage.screenshot({ type: 'jpeg', quality: 85 }); shots.hud = serve('shot-hud.jpg', liveShot.val, 'image/jpeg'); }
  }, { vt: vt4, cam: [[0, 1.0, 960, 540], [F(2.6), 1.0, 960, 540], [F(3.3), 1.1, 960, 380], [F(4.6), 1.1, 1000, 420], [F(5.3), 1.0, 960, 520], [F(6), 1.02, 960, 520]], key: 0.82 });

  // ═════ 6 · PUBG MOBILE (49.5–63.5 s), on the track's second drop ═════
  await call('chooseGame', ['pubgm']); await call('lobbySelect', [lobby.id]);
  const take = async (screen) => { await call('lobbyTake', [lobby.id, screen]); await sleep(250); };
  await take('br-drop');
  const lob = g(`${ENG}/overlays/fullscreen.html?match=${code}`);
  await scene('5a-drop', T.drop, T.today, lob, 'flip', null, { cam: push(2.4, 1.0, 1.06, 1100, 560), over: tag('PUBG MOBILE') });
  await take('br-today');
  await scene('5b-today', T.today, T.brhud, lob, 'iris', null, { cam: [[0, 1.08, 760, 540], [F(2), 1.08, 1160, 540]] });
  // the live HUD from the recorded game, at 2×
  const outs = [...new Set(states.map(([, s]) => s.brLive?.lastOut?.at).filter(Boolean))];
  const o = outs.find((x) => x - 3600 >= states[0][0] + 1500 && x < wwcdAt - 3000);
  const from5 = o ? o - 3600 : fbAt - 800, vt5 = (i) => from5 + (i / FPS) * 2000;
  await resetReplay(from5);
  await patchRoom(REPLAY, { layout: { brHud: 'rail' }, brPopup: false });
  await scene('5c-brhud', T.brhud, T.standings, `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}</div>`, 'zoom', async (i) => { await seek(vt5(i)); if (i === F(2.0)) liveShot.pubg = await stage.screenshot({ type: 'jpeg', quality: 85 }); }, { vt: vt5, cam: [[0, 1.0, 960, 540], [F(2.8), 1.1, 1300, 500]] });
  // standings → MVP → WWCD on the lobby's own room, each a Take
  await take('br-overall');
  await scene('5d-standings', T.standings, T.mvp, lob, 'slash', null, { cam: [[0, 1.06, 960, 600], [F(1.8), 1.0, 960, 540]] });
  await take('br-mvp');
  await scene('5e-mvp', T.mvp, T.wwcd, lob, 'zoom', keyShot('mvp', 1.2), { cam: push(1.8, 1.0, 1.05, 900, 560) });
  // WWCD shows the squad as Air's grey silhouettes: their photos are cleared in Teams/Players (the lobby follows).
  for (const p of (await call('snapshot')).library.players.filter((p) => /^NTD_/.test(p.name))) await call('savePlayer', [{ ...p, photo: '' }]);
  await sleep(400);
  await take('br-wwcd');
  await scene('5f-wwcd', T.wwcd, T.studio, lob, 'cut', keyShot('wwcd', 1.2), { cam: push(1.8, 1.03, 1.0, 960, 540) });

  // ═════ 6b · Graphics studio (63.5–69.5 s): a studio panel; the graphic on air changes as it is edited ═════
  const sw = ['#22d3ee', '#ffb60e', '#f43f5e', '#a78bfa', '#34d399', '#ffffff'];
  const studioHtml = `<style>
      .sp{position:absolute;left:70px;top:150px;width:600px;height:800px;border-radius:22px;background:linear-gradient(170deg,#141c30,#0b1020);border:1px solid rgba(255,255,255,.1);padding:30px;font-family:Poppins}
      .sp h4{margin:0;font:700 15px Poppins;letter-spacing:.24em;color:#8fa0c4}.sp .gname{margin-top:8px;font:800 30px Poppins}
      .sp .ly{margin-top:22px;display:flex;flex-direction:column;gap:8px}.sp .ly div{padding:12px 16px;border-radius:10px;background:#0f1526;font:600 19px Poppins;color:#c8d0e4;border:1px solid transparent}
      .sp .ly div.on{border-color:#ffb60e;background:#1d1a10;color:#fff}
      .sp .sws{margin-top:24px;display:flex;gap:12px}.sp .sws b{width:54px;height:54px;border-radius:12px;border:3px solid rgba(255,255,255,.15)}.sp .sws b.on{border-color:#fff;transform:scale(1.12)}
      .sp .wd{margin-top:22px;padding:14px 16px;border-radius:10px;background:#0f1526;border:1px solid #ffb60e;font:700 22px Poppins;min-height:58px}
      .mon{position:absolute;left:730px;top:150px;width:1120px;height:630px;border-radius:16px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1);background:#000}
      .mon .v{position:absolute;inset:0;transform:scale(${1120 / 1920});transform-origin:0 0;width:1920px;height:1080px;visibility:hidden}.mon .v.on{visibility:visible}
      .onair{position:absolute;left:730px;top:796px;display:flex;align-items:center;gap:10px;font:700 18px Poppins;letter-spacing:.2em;color:#f43f5e}.onair::before{content:'';width:12px;height:12px;border-radius:50%;background:#f43f5e;box-shadow:0 0 14px #f43f5e}
      #ptr{position:absolute;z-index:30;width:34px;height:34px;left:400px;top:600px;transition:none}
    </style>
    <div class="sp"><h4>GRAPHICS STUDIO</h4><div class="gname" id="gname">In-game HUD</div><div class="ly" id="ly"></div><div class="sws" id="sws">${sw.map((c, k) => `<b data-k="${k}" style="background:${c}"></b>`).join('')}</div><div class="wd" id="wd" style="display:none"></div></div>
    <div class="mon"><div class="v on" id="v0" style="background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div><div class="v" id="v1" style="background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/fullscreen.html?match=${VAL}&over=1`)}</div><div class="v" id="v2">${g(`${ENG}/overlays/fullscreen.html?match=${code}`)}</div></div>
    <div class="onair">ON AIR</div>
    <svg id="ptr" viewBox="0 0 24 24"><path d="M3 2l17 9-7.5 2L9 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  // the HUD for the first edit: mid-round again, players alive
  await patchRoom(VAL, { ...vbase, teams: teams0, series: series0, rounds: rounds0, players: clone(P0), round: { number: 24, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' }, banner: { type: '', ts: 0 } });
  const saveT = async (id, graphic, parts) => { await call('templateSave', [{ id, name: id, graphic, parts }]); return (await call('snapshot')).templates.find((t) => t.id === id); };
  const hudT = await saveT('reel-hud', 'hud', {}); const vetoT = await saveT('reel-veto', 'map-veto|band', {});
  await patchRoom(VAL, { airTemplates: [hudT, vetoT], airHudTemplate: 'reel-hud' });
  await patchRoom(VAL, { veto: vetoSteps });
  await call('lobbyTake', [lobby.id, 'br-overall']);
  // Phase plan (seconds into the scene): what the panel shows, where the pointer goes, what is saved.
  const layers = { hud: ['Scorebug', 'Player cards', 'Killfeed', 'Minimap frame', 'Win probability'], veto: ['Panel', 'Title', 'Map tiles', 'Action labels', 'Logos'], br: ['Header', 'Table', 'Theme · Sky', 'Theme · Jungle', 'Theme · Inferno'], wwcd: ['Winner word', 'Winner line', 'Team plate', 'Player photos', 'Parachutes'] };
  const panel = (name, list, on, swOn, wd) => stage.evaluate(([name, list, on, swOn, wd]) => {
    document.getElementById('gname').textContent = name;
    document.getElementById('ly').innerHTML = list.map((l, k) => `<div class="${k === on ? 'on' : ''}">${l}</div>`).join('');
    document.querySelectorAll('#sws b').forEach((b, k) => b.classList.toggle('on', k === swOn));
    const w = document.getElementById('wd'); w.style.display = wd === null ? 'none' : ''; w.textContent = wd ?? '';
  }, [name, list, on, swOn, wd]);
  const showV = (k) => stage.evaluate((k) => [0, 1, 2].forEach((j) => document.getElementById('v' + j).classList.toggle('on', j === k)), k);
  let ptr = [400, 640];
  const ptrTo = (xy) => { ptr = xy; return stage.evaluate(([x, y]) => { const p = document.getElementById('ptr'); p.style.left = x + 'px'; p.style.top = y + 'px'; }, xy); };
  const swXY = (k) => [100 + 30 + k * 66 + 20, 150 + 30 + 0];
  const plan = [
    // 0–2.4: Valorant HUD player cards
    [0.0, async () => { await showV(0); await panel('In-game HUD', layers.hud, 1, -1, null); }],
    [0.7, async () => { await panel('In-game HUD', layers.hud, 1, 0, null); await patchRoom(VAL, { airTemplates: [await saveT('reel-hud', 'hud', { players: { fill: { kind: 'solid', a: sw[0], alpha: 0.85 } } }), vetoT] }); }],
    [1.5, async () => { await panel('In-game HUD', layers.hud, 1, 2, null); await patchRoom(VAL, { airTemplates: [await saveT('reel-hud', 'hud', { players: { fill: { kind: 'solid', a: sw[2], alpha: 0.85 } } }), vetoT] }); }],
    // 2.4–5.0: the overlay-bar map veto
    [2.4, async () => { await action(VAL, 'fullscreen.show', { screen: 'map-veto', style: 'band', template: 'reel-veto' }); await showV(1); await panel('Map veto · Overlay bar', layers.veto, 0, -1, null); }],
    [3.1, async () => { await panel('Map veto · Overlay bar', layers.veto, 0, 3, null); await patchRoom(VAL, { airTemplates: [hudT, await saveT('reel-veto', 'map-veto|band', { panel: { fill: { kind: 'solid', a: sw[3], alpha: 0.92 } } })] }); }],
    [4.0, async () => { await panel('Map veto · Overlay bar', layers.veto, 0, 4, null); await patchRoom(VAL, { airTemplates: [hudT, await saveT('reel-veto', 'map-veto|band', { panel: { fill: { kind: 'solid', a: sw[4], alpha: 0.92 } } })] }); }],
    // 5.0–6.8: PUBG standings, the event theme
    [5.0, async () => { await showV(2); await panel('Overall standings', layers.br, 2, -1, null); }],
    [5.6, async () => { await panel('Overall standings', layers.br, 3, -1, null); await call('lobbyLook', [lobby.id, { theme: { preset: 'jungle', props: { crate: true, chutes: true, side: 'right' } } }]); }],
    [6.2, async () => { await panel('Overall standings', layers.br, 4, -1, null); await call('lobbyLook', [lobby.id, { theme: { preset: 'inferno', props: { crate: true, chutes: true, side: 'right' } } }]); }],
    // 6.8–8.4: WWCD, new words
    [6.8, async () => {
      await call('lobbyLook', [lobby.id, { theme: { preset: 'sky', props: { crate: true, chutes: true, side: 'right' } } }]);
      await saveT('reel-wwcd', 'br-wwcd|full', {}); await call('lobbyLook', [lobby.id, { templates: { 'br-wwcd|full': 'reel-wwcd' } }]); await call('lobbyTake', [lobby.id, 'br-wwcd']);
      await panel('WWCD', layers.wwcd, 1, -1, 'WINNER WINNER CHICKEN DINNER');
    }],
    [7.3, async () => { await panel('WWCD', layers.wwcd, 1, -1, 'CHAMPIONS OF THE DROP'); await saveT('reel-wwcd', 'br-wwcd|full', { subline: { label: 'CHAMPIONS OF THE DROP' } }); }],
    [7.8, async () => { await panel('WWCD', layers.wwcd, 0, 2, 'CHAMPIONS OF THE DROP'); await saveT('reel-wwcd', 'br-wwcd|full', { subline: { label: 'CHAMPIONS OF THE DROP' }, 'word.face': { color: sw[2] } }); }],
  ];
  const SS = (T.close - T.studio) / 8.4; // v8's 8.4 s of edits, played in this reel's slot
  const at = Object.fromEntries(plan.map(([t, fn]) => [F(t * SS), fn]));
  // The pointer glides to the swatch or layer the next step clicks.
  const targets = [[0.0, [560, 760]], [0.5, swXY(0)], [1.3, swXY(2)], [2.3, [300, 300]], [2.9, swXY(3)], [3.8, swXY(4)], [4.9, [300, 330]], [5.4, [300, 390]], [6.0, [300, 430]], [6.7, [300, 330]], [7.1, [380, 640]], [7.6, swXY(2)]];
  await scene('6-studio', T.studio, T.close, studioHtml, 'iris', async (i) => {
    if (at[i]) { await at[i](); await sleep(170); }
    const t = i / FPS / SS;
    let a = targets[0], b = targets[targets.length - 1];
    for (let k = 0; k < targets.length - 1; k++) if (t >= targets[k][0] && t < targets[k + 1][0]) { a = targets[k]; b = targets[k + 1]; break; }
    const u = Math.min(1, (t - a[0]) / Math.max(0.01, Math.min(0.45, b[0] - a[0])));
    const e = ease(u);
    await ptrTo([a[1][0] + (b[1][0] - a[1][0]) * e, a[1][1] + (b[1][1] - a[1][1]) * e]);
  }, { over: copy('Make every graphic <em>yours.</em>', { d: 0.2, out: 99, cls: 'top', style: 'left:72px;top:44px;font-size:56px' }), cam: push(T.close - T.studio, 1.0, 1.02, 1100, 520), key: 0.92 });
  await call('lobbyTake', [lobby.id, null]);

  // ═════ 7 · More games coming (69.5–73.5 s): the reel's own moments turn into the games ═════
  // Twelve tiles of what was just on screen flip over: ten games coming (the Esportra website's posters) and the two
  // on air now. The fronts are pictures of this reel.
  const coming = [['apex', 66], ['eafc', 0], ['cs2', 0], ['r6s', 38], ['lol', 100], ['dota2', 100], ['cod', 56], ['fortnite', 100], ['rocket-league', 0], ['tekken8', 74]];
  const fronts = ['teams', 'schedule', 'bracket', 'veto', 'casters', 'sponsors', 'air', 'byhand', 'intro', 'hud', 'mvp', 'wwcd'].map((k) => shots[k] || '');
  const live = { 5: ['VALORANT', liveShot.val], 6: ['PUBG MOBILE', liveShot.pubg] };
  const flipOrder = [5, 6, 1, 2, 9, 10, 4, 7, 0, 3, 8, 11];
  let c7 = 0;
  const backs = fronts.map((_, k) => {
    if (live[k]) return `<div class="fb live" style="background-image:url('${live[k][1] ? serve(`live-${k}.jpg`, live[k][1], 'image/jpeg') : ''}')"><b>${live[k][0]}</b></div>`;
    const [n, y] = coming[c7++];
    return `<div class="fb" style="background-image:url('${POSTER(n)}');background-position:50% ${y}%"></div>`;
  });
  const wall7 = `<style>
    .ow{position:absolute;left:96px;top:96px;display:grid;grid-template-columns:repeat(4,414px);grid-auto-rows:280px;gap:24px}
    .fl{position:relative;width:414px;height:280px;perspective:1600px}
    .fi{position:absolute;inset:0;transform-style:preserve-3d;animation:flip7 .5s cubic-bezier(.5,0,.2,1) var(--d) both}
    @keyframes flip7{0%{transform:rotateY(0)}100%{transform:rotateY(180deg)}}
    .ff,.fb{position:absolute;inset:0;backface-visibility:hidden;border-radius:14px;background:#0f1526 50% 50%/cover no-repeat;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
    .fb{transform:rotateY(180deg)}
    .fb.live{background-size:cover;background-position:50% 50%;box-shadow:inset 0 0 0 3px #ffb60e,0 0 40px rgba(255,182,14,.35)}
    .fb.live b{position:absolute;left:16px;top:16px;display:flex;align-items:center;gap:8px;padding:7px 12px;background:#ffb60e;color:#0b0b0f;font:800 14px/1 Poppins;letter-spacing:.18em}
    .fb.live b::before{content:'';width:9px;height:9px;border-radius:50%;background:#e11d48}
    .ow-band{position:absolute;left:0;right:0;bottom:0;height:330px;z-index:30;background:linear-gradient(0deg,rgba(5,7,13,.98) 0%,rgba(5,7,13,.9) 50%,transparent 100%)}
  </style><div class="ow">${fronts.map((f, k) => `<div class="fl"><div class="fi" style="--d:${(0.3 + flipOrder.indexOf(k) * 0.1).toFixed(2)}s"><div class="ff" style="background-image:url('${f}')"></div>${backs[k]}</div></div>`).join('')}</div>`;
  await scene('7-close', T.close, T.word, wall7, 'zoom', null, {
    cam: [[0, 1.08, 960, 540], [F(4), 1.0, 960, 540]],
    over: `<div class="ow-band"></div>${copy('More games <em>coming.</em>', { d: 1.0, out: 99, cls: 'c', style: 'bottom:auto;top:900px;font-size:70px' })}`, key: 0.85,
  });

  // ═════ 8 · ESPORTRA AIR (73.5–76.5 s) ═════
  const word = 'ESPORTRA AIR'.split('').map((ch, i) => `<span class="w" style="animation-delay:${(0.12 + i * 0.035).toFixed(2)}s;${i > 8 ? 'color:#ffb60e' : ''}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  await scene('8-word', T.word, T.back, `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="pop" src="${MARK}" style="--d:.05s;height:120px">
      <div style="margin-top:28px;font:800 128px/1 Poppins;letter-spacing:-.03em">${word}</div>
      <div class="rise" style="--d:.8s;margin-top:28px;font:600 40px Poppins;color:#dfe4ee">From bracket to broadcast.</div></div>`, 'iris', null,
  { cam: push(3, 1.04, 1.0), key: 0.7 });

  // ═════ 9 · The score goes back (76.5–79.5 s) and the reel lands on the mark it opened with ═════
  // The map's result rises as a card, flies into the Esportra mark and is applied there. By 79.0 s only the mark is
  // left, exactly as frame 0 shows it, so the loop has no seam.
  const t0n = vteams[0], t1n = vteams[1];
  const backHtml = `${markHtml('settle')}<style>
      .res{position:absolute;z-index:20;left:660px;top:770px;width:600px;padding:22px 28px;border-radius:16px;background:#0f1526;border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.6);font-family:Poppins;
        animation:resin .45s .05s cubic-bezier(.15,.85,.25,1) both,resfly .62s 0.7s cubic-bezier(.6,0,.4,1) both;transform-origin:50% 50%}
      .res .k{font:700 14px Poppins;letter-spacing:.24em;color:#8fa0c4}.res .r{margin-top:12px;display:flex;align-items:center;justify-content:space-between;font:800 40px Poppins}
      .res .r img{width:46px;height:46px}.res .r span{display:flex;align-items:center;gap:12px}.res .r em{font-style:normal;color:#ffb60e}
      .res .s{margin-top:12px;display:flex;align-items:center;gap:10px;font:600 16px Poppins;color:#c8d0e4}.res .s i{width:10px;height:10px;border-radius:50%;background:#ffb60e}
      @keyframes resin{0%{opacity:0;transform:translateY(60px)}100%{opacity:1;transform:none}}
      @keyframes resfly{0%{transform:none;opacity:1}85%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.06);opacity:0}}
      .ap{position:absolute;z-index:21;left:50%;top:730px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:10px 20px;border-radius:999px;background:rgba(52,211,153,.14);border:1px solid #34d399;color:#34d399;font:700 20px Poppins;
        animation:apin .3s 1.3s cubic-bezier(.2,1.3,.3,1) both,cout .35s 2.0s ease-in both}
      @keyframes apin{0%{opacity:0;transform:translate(-50%,10px) scale(.8)}100%{opacity:1;transform:translateX(-50%)}}
      .rg{position:absolute;z-index:19;left:593px;top:540px;width:20px;height:20px;margin:-10px;border-radius:50%;border:5px solid #ffb60e;opacity:0;animation:ringp .7s 1.25s cubic-bezier(.2,.7,.3,1) both}
      @keyframes ringp{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(14)}}
    </style>
    <div class="res"><div class="k">MAP 3 · LOTUS · RESULT</div><div class="r"><span><img src="${EMB.NWL}">${t0n.tag} <em>13</em></span><span style="color:#5b6987">–</span><span><em>11</em> ${t1n.tag}<img src="${EMB.CRF}"></span></div><div class="s"><i></i>Sent to Esportra</div></div>
    <div class="rg"></div><div class="ap">✓ Result applied on Esportra</div>`;
  await scene('9-back', T.back, T.out, backHtml, 'zoom', null, {
    key: 0.45,
    ready: async () => {
      // Aim the card and the ring at the icon as the mark lays out.
      await stage.evaluate(() => {
        const ic = document.querySelector('.mk .lk').getBoundingClientRect(), rs = document.querySelector('.res'), rr = rs.getBoundingClientRect();
        const cx = ic.left + ic.width / 2, cy = ic.top + ic.height / 2;
        rs.style.setProperty('--dx', `${cx - (rr.left + rr.width / 2)}px`); rs.style.setProperty('--dy', `${cy - (rr.top + rr.height / 2)}px`);
        const rg = document.querySelector('.rg'); rg.style.left = `${cx}px`; rg.style.top = `${cy}px`;
      });
    },
  });

  await browser.close();
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 8).join(' | '));
  if (STILLS) {
    const dir = path.join(OUT, 'stills'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    board.forEach(([, file], k) => fs.copyFileSync(file, path.join(dir, String(k).padStart(3, '0') + '.jpg')));
    const { execFileSync } = require('node:child_process');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', 'scale=640:-1,tile=4x7:padding=8:color=0x05070d', '-frames:v', '1', path.join(OUT, 'stills-board.jpg')]);
    fs.writeFileSync(path.join(OUT, 'stills.txt'), board.map(([n], k) => `${k}  ${n}`).join('\n') + '\n');
    console.log(JSON.stringify({ stills: board.length, board: path.join(OUT, 'stills-board.jpg'), cuts }));
    return;
  }
  fs.writeFileSync(path.join(OUT, 'cuts.txt'), `${cuts.join('\n')}\n${(rec.frames / FPS).toFixed(3)}s  end\n`);
  const silent = path.join(OUT, 'picture-16x9.mp4');
  kit.encode(rec.dir, silent);
  const mp4 = path.join(OUT, 'esportra-air-loop-16x9.mp4'), vert = path.join(OUT, 'esportra-air-loop-9x16.mp4');
  const { execFileSync } = require('node:child_process');
  // The edited track under the picture, no fade at the end (the loop goes on), plus CC0 sound effects.
  const M = require('./reel-mix.cjs');
  if (MUSIC) M.mix(silent, MUSIC, process.env.REEL_SFX || '', mp4, M.LOOP_CUES, T.out, { loop: true });
  else fs.copyFileSync(silent, mp4);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-filter_complex', '[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', String(FPS), '-c:a', 'copy', '-movflags', '+faststart', vert]);
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(silent, 0.5), cuts }));
})().catch((e) => { console.error(e); process.exit(1); });
