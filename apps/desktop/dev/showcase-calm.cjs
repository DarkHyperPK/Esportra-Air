// Esportra Air · calm product showcase (v4, 25 Nov, approved storyboard): 90 s, 13 unhurried shots on a 90 BPM grid.
// The producer's rule: a product showcase, not a dance. Shots of 6–15 s, soft 0.8 s cross-dissolves, one slow push per
// shot, captions that fade and rise 12 px and then stay. Valorant shows only its in-game HUD; PUBG MOBILE shows its
// live HUD, Overall standings, Match MVP and Player vs player; then the HUDs are edited in Graphics studio (the real
// app, framed, with a slow pointer). Every graphic is an Air page fed through Air's own paths (dev/reel-setup.cjs);
// every frame is stepped (dev/rec-kit.cjs), so motion is exact 30 fps.
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   node dev/showcase-calm.cjs [host] [engine port] <out dir> [--stills]
// Posters and the Esportra icon are read from the Esportra website's own assets (../esportra/public); nothing is copied.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const S = require('./reel-setup.cjs');
const H = process.argv[2] || 'http://127.0.0.1:5334';
const ENGINE = process.argv[3] || '5396';
const OUT = process.argv[4] || path.join(process.cwd(), 'showcase-calm');
const STILLS = process.argv.includes('--stills');
const h = S.connect(H, ENGINE);
const { ENG, call, patchRoom, LOTUS } = h;
const SITE = process.env.ESPORTRA_SITE || path.join(__dirname, '../../../../esportra/public');
const FPS = kit.FPS, BPM = 90, BEAT = 60 / BPM;
const sleep = S.sleep;
const dataUrl = (file, type = 'image/png') => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const { VAL, REPLAY } = S;

// ── the stage: quiet background, one slow camera move, captions that rise once and stay ──
const CSS = (fonts) => `${fonts}
*{box-sizing:border-box}
body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#06070b;color:#fff;font-family:Poppins,system-ui,sans-serif}
.bg{position:absolute;inset:0;background:radial-gradient(80% 70% at 70% 20%,#151b29 0%,#0a0c12 55%,#06070b 100%)}
#cam{position:absolute;inset:0;transform-origin:var(--ox,50%) var(--oy,50%);animation:cam var(--d,8s) linear both}
@keyframes cam{0%{transform:translateX(0) scale(1)}100%{transform:translateX(var(--dx,0px)) scale(var(--z,1.035))}}
.g{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;background:transparent}
.fr{position:absolute;overflow:hidden;border-radius:14px;box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);background:#000}
.cap{position:absolute;z-index:30;left:120px;bottom:100px;max-width:1300px}
.cap.mid{bottom:auto;top:50%;transform:translateY(-50%)}
.cap.under{left:250px;bottom:62px}
.cap.top{left:160px;bottom:auto;top:46px}
.cap.center{left:0;right:0;max-width:none;text-align:center}
.cap .bar{display:block;width:44px;height:3px;border-radius:2px;background:#ffb60e;margin-bottom:20px;animation:rise .8s cubic-bezier(.25,.6,.3,1) var(--cd,.7s) both}
.cap.center .bar{margin-left:auto;margin-right:auto}
.cap .hl{display:block;font:700 56px/1.1 Poppins;letter-spacing:-.015em;text-shadow:0 6px 30px rgba(0,0,0,.55);animation:rise .8s cubic-bezier(.25,.6,.3,1) var(--cd,.7s) both}
.cap .sb{display:block;margin-top:12px;font:500 24px/1.45 Poppins;color:#c5c9d2;text-shadow:0 4px 20px rgba(0,0,0,.6);animation:rise .8s cubic-bezier(.25,.6,.3,1) calc(var(--cd,.7s) + .3s) both}
@keyframes rise{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}
.veil{position:absolute;inset:0;z-index:20;pointer-events:none}
.veil.l{background:linear-gradient(90deg,rgba(6,7,11,.78) 0%,rgba(6,7,11,.45) 30%,transparent 55%)}
.veil.b{background:linear-gradient(0deg,rgba(6,7,11,.8) 0%,transparent 40%)}
.prev{position:absolute;inset:0;z-index:100;width:1920px;height:1080px;animation:dis .8s ease-in-out both}
@keyframes dis{0%{opacity:1}100%{opacity:0}}
.fade{animation:fin 1.2s cubic-bezier(.25,.6,.3,1) var(--fd,.2s) both}
@keyframes fin{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}
.black{position:absolute;inset:0;z-index:90;background:#000}
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const FONTS = kit.fontCss();
  const ICON = dataUrl(path.join(SITE, 'brand/esportra-icon-512.png'));
  const POSTER = (n) => dataUrl(path.join(SITE, `games/${n}-logo.png`));

  // ═════ Off camera: the producer's data, through Air (dev/reel-setup.cjs) ═════
  const d = await S.prepare(h);
  const { lobby, code, states, onAir, wwcdAt, resultsAt, fbAt, vmatch, players, pool } = d;
  // Player vs player and Match MVP read the first match (the one Air just saved from the game); with no player picked
  // Player vs player shows the two best by MVP rating.
  await call('lobbyShow', [lobby.id, { pick: { scope: 'match', game: 1 } }]);

  // ═════ Browsers: graphics and the stage at 1920×1080; the app at 1280×720 with 1.5× pixels ═════
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await kit.prepare(ctx); await kit.prepare(appCtx);
  const { logo, wall, seek, resetReplay } = await S.dress(h, ctx, d);
  await appCtx.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: logo }));
  const stage = await ctx.newPage();
  const errs = []; stage.on('pageerror', (e) => errs.push('stage: ' + e.message));
  const rec = kit.recorder(path.join(OUT, STILLS ? 'stills-raw' : 'frames'));
  const src = kit.recorder(path.join(OUT, 'src-unused'));
  const board = [], cuts = [];
  const lastFrame = () => path.join(rec.dir, String(rec.frames - 1).padStart(6, '0') + '.jpg');

  /** Opens a shot off camera: its page, the last frame of the shot before fading over it, the camera move. */
  async function begin(name, html, secs, opts = {}) {
    const n = Math.round(secs * FPS);
    const prev = !STILLS && rec.frames > 0 ? `<img class="prev" src="${dataUrl(lastFrame(), 'image/jpeg')}">` : '';
    const cam = `--d:${secs}s;--z:${opts.zoom ?? 1.035};--dx:${opts.dx ?? 0}px;--ox:${opts.ox ?? '50%'};--oy:${opts.oy ?? '50%'}`;
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}</style></head><body><div class="bg"></div><div id="cam" style="${cam}">${html}</div>${opts.over ?? ''}${prev}</body></html>`, { waitUntil: 'load' });
    for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
    await stage.evaluate(() => document.fonts.ready);
    if (opts.ready) await opts.ready();
    await sleep(400);
    cuts.push(`${(rec.frames / FPS).toFixed(3)}s  beat ${(rec.frames / FPS / BEAT).toFixed(1)}  ${name}`);
    return { name, n, i: 0, key: Math.floor(n * (opts.key ?? 0.7)), app: opts.app ?? null };
  }
  /** One video frame of the shot (with the app's next frame composited in, for app shots). */
  async function tick(s, vt = null) {
    const shoot = !STILLS || s.i === s.key;
    if (s.app && shoot) {
      const buf = await src.grab(s.app);
      await stage.evaluate(async (b64) => { const img = document.getElementById('appimg'); img.src = 'data:image/jpeg;base64,' + b64; await img.decode().catch(() => {}); }, buf.toString('base64'));
    }
    await rec.frame(stage, vt, shoot);
    if (STILLS && shoot) board.push([s.name, lastFrame()]);
    s.i++;
  }
  async function shot(name, html, secs, each, opts = {}) {
    const s = await begin(name, html, secs, opts);
    while (s.i < s.n) { if (each) await each(s.i, s); await tick(s, opts.vt ? opts.vt(s.i) : null); }
  }
  /** A mid-shot dissolve: the frame just recorded fades over what comes next. */
  const dissolveNow = async () => { if (STILLS) return; const u = dataUrl(lastFrame(), 'image/jpeg'); await stage.evaluate((u) => { const i = document.createElement('img'); i.className = 'prev'; i.src = u; document.body.appendChild(i); return i.decode().catch(() => {}); }, u); };

  const g = (src, style = '') => `<iframe class="g" src="${src}" style="${style}"></iframe>`;
  const br = (n) => `${ENG}/overlays/${n}.html?match=${code}`;
  const cap = (hl, sb = '', cls = '', cd) => `<div class="cap ${cls}"${cd ? ` style="--cd:${cd}s"` : ''}><span class="bar"></span><span class="hl">${hl}</span>${sb ? `<span class="sb">${sb}</span>` : ''}</div>`;
  /** A graphic shown as a product shot: framed, a little smaller than the screen, its name underneath. */
  const W = 1421, HH = Math.round(W * 9 / 16), SC = W / 1920;
  const framed = (src, back = '') => `<div class="fr" style="left:${(1920 - W) / 2}px;top:70px;width:${W}px;height:${HH}px;${back ? `background:#000 url('${back}') center/cover` : ''}">${g(src, `transform:scale(${SC})`)}</div>`;

  // ═════ 1 · Open (0–6 s) ═════
  await shot('1-open', `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="fade" src="${ICON}" style="--fd:.5s;width:112px;height:112px;border-radius:24px">
      <div class="fade" style="--fd:.9s;margin-top:30px;font:700 112px/1 Poppins;letter-spacing:-.02em">ESPORTRA <span style="color:#ffb60e">AIR</span></div>
      <div class="fade" style="--fd:1.8s;margin-top:28px;font:500 30px Poppins;color:#c5c9d2">Broadcast graphics, live from the game.</div></div>`, 6, null,
  { zoom: 1.04, over: '<div class="black" style="animation:dis 1.2s ease-in-out both"></div>' });

  // ═════ 2 · Esportra → Air (6–15 s): the imported match's own data drifting across ═════
  const packets = [vmatch.teams?.[0]?.name, vmatch.teams?.[1]?.name, `Best of ${vmatch.bestOf ?? 3}`, ...players.slice(0, 4), ...pool.slice(0, 3), 'Bracket'].filter(Boolean).slice(0, 11);
  const pk = packets.map((p, i) => { const y = 400 + ((i * 83) % 260); return `<div style="position:absolute;left:0;top:0;offset-path:path('M 650 ${y} C 900 ${y - 140}, 1100 ${y + 140}, 1360 540');offset-rotate:0deg;padding:8px 16px;border-radius:999px;background:rgba(255,182,14,.08);border:1px solid rgba(255,182,14,.45);color:#ffe2a3;font:500 20px Poppins;white-space:nowrap;animation:fly 2.6s ${1.0 + i * 0.5}s cubic-bezier(.45,0,.35,1) both">${p}</div>`; }).join('');
  await shot('2-import', `<style>@keyframes fly{0%{offset-distance:0%;opacity:0}15%{opacity:1}85%{opacity:1}100%{offset-distance:100%;opacity:0}}</style>
    <div class="fade" style="--fd:.3s;position:absolute;left:190px;top:330px;width:460px;padding:30px;border-radius:18px;background:#10131c;border:1px solid rgba(255,255,255,.1)">
      <div style="display:flex;gap:16px;align-items:center"><img src="${ICON}" style="width:60px;height:60px;border-radius:14px"><div><div style="font:700 14px Poppins;letter-spacing:.2em;color:#ffb60e">ESPORTRA</div><div style="font:700 28px Poppins">Community Cup</div></div></div>
      <div style="margin-top:22px;font:600 24px Poppins">${vmatch.teams?.[0]?.name ?? ''} <span style="color:#7d828d">vs</span> ${vmatch.teams?.[1]?.name ?? ''}</div>
      <div style="margin-top:8px;font:500 18px Poppins;color:#9aa0ab">Best of ${vmatch.bestOf ?? 3} · players · veto</div></div>
    <div class="fade" style="--fd:.6s;position:absolute;left:1360px;top:390px;width:300px;height:300px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,182,14,.8);box-shadow:0 0 60px rgba(255,182,14,.18)"><div style="font:700 60px Poppins;letter-spacing:-.01em">AIR</div></div>
    ${pk}`, 9, null, { zoom: 1.03, over: cap('Your tournament, straight from Esportra', 'Teams, players and veto. No spreadsheets.') });

  // ═════ 3 · The imported match's intro (15–21 s) ═════
  await shot('3-intro', framed(`${ENG}/overlays/match-intro.html?match=${vmatch.code}`), 6, null, { zoom: 1.03, over: cap('Ready before the first round', '', 'under', 0.9) });

  // ═════ 4 · Valorant: the in-game HUD mid-round (21–30 s): the HUD's own Round live sample ═════
  await shot('4-valorant', `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?preview=1&sample=live`)}</div>`, 9, null, {
    zoom: 1.04, oy: '45%', over: `<div class="veil l"></div>${cap('Valorant', 'The in-game HUD', '', 0.9).replace('class="cap "', 'class="cap" style="bottom:auto;top:300px"')}`,
    // The preview page's own "sample data" tag is for the editor, not for a reel.
    ready: async () => { for (const f of stage.frames().slice(1)) await f.evaluate((lotus) => { const st = document.createElement('style'); st.textContent = `.preview-label{display:none!important}html{background:#000 url('${lotus}') center/cover!important}body{background:transparent!important}`; document.head.appendChild(st); }, LOTUS).catch(() => {}); },
  });

  // ═════ 5 · PUBG MOBILE: the live HUD from the recorded game, at the speed Air wrote it (30–39 s) ═════
  const from5 = fbAt - 1500, vt5 = (i) => from5 + (i / FPS) * 1000;
  await resetReplay(from5);
  await patchRoom(REPLAY, { layout: { brHud: 'rail' }, brPopup: false });
  const half5 = Math.round(4.5 * FPS);
  await shot('5-pubg-hud', `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}</div>`, 9, async (i) => {
    await seek(vt5(i));
    if (i === half5) { await dissolveNow(); await patchRoom(REPLAY, { layout: { brHud: 'grid' } }); await sleep(150); }
  }, { zoom: 1.04, vt: vt5, key: 0.35, over: `<div class="veil l"></div>${cap('PUBG MOBILE', 'Live points, straight from the game', 'mid')}` });
  await patchRoom(REPLAY, { layout: { brHud: 'rail' } });

  // ═════ 6–8 · Standings, Match MVP, Player vs player (39–57 s) ═════
  await shot('6-standings', framed(br('br-overall')), 6, null, { zoom: 1.03, over: cap('Standings', '', 'under', 0.9) });
  await shot('7-mvp', framed(br('br-mvp')), 6, null, { zoom: 1.03, over: cap('Match MVP', '', 'under', 0.9) });
  await shot('8-pvp', framed(br('br-pvp')), 6, null, { zoom: 1.03, over: cap('Player vs player', '', 'under', 0.9) });

  // ═════ 9 · Autopilot (57–66 s): the Standard Rundown, and the end of the recorded match running it ═════
  const rows = [['Plane takes off', 'Drop map', 'br-drop'], ['Match ends', 'WWCD', 'br-wwcd'], ['Then', 'Match results', 'br-rankings'], ['Then', 'Match MVP', 'br-mvp'], ['Then', 'Overall standings', 'br-overall']];
  const c1 = 3 * FPS, c2 = 6 * FPS;
  const vt9 = (i) => (i < c1 ? wwcdAt - 3000 + (i / FPS) * 1000 : i < c2 ? wwcdAt + ((i - c1) / FPS) * 1000 : resultsAt - 500 + ((i - c2) / FPS) * 1000);
  await resetReplay(vt9(0));
  const MW = 1180, MH = Math.round(MW * 9 / 16);
  await shot('9-autopilot', `<style>.ac{padding:16px 20px;border-radius:12px;background:#0f121a;border:1px solid rgba(255,255,255,.1);margin-bottom:12px;transition:none}.ac.on{border-color:#ffb60e;box-shadow:0 0 30px rgba(255,182,14,.22)}.ac small{display:block;font:600 12px Poppins;letter-spacing:.14em;color:#8b909b;text-transform:uppercase}.ac b{display:block;margin-top:4px;font:600 24px Poppins}</style>
    <div class="fade" style="--fd:.2s;position:absolute;left:150px;top:330px;width:400px">${rows.map(([w, n, s]) => `<div class="ac" data-s="${s}"><small>${w}</small><b>${n}</b></div>`).join('')}</div>
    <div class="fr" style="left:620px;top:250px;width:${MW}px;height:${MH}px;background:#000 url('${ENG}${wall}') center/cover"><div style="position:absolute;inset:0;transform:scale(${MW / 1920});transform-origin:0 0;width:1920px;height:1080px">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}${g(`${ENG}/overlays/fullscreen.html?match=${REPLAY}`)}</div></div>`, 9, async (i) => {
    const w = vt9(i); await seek(w);
    const a = [...onAir].reverse().find(([t]) => t <= w)?.[1];
    await stage.evaluate((a) => document.querySelectorAll('.ac').forEach((e) => e.classList.toggle('on', e.dataset.s === a)), a ?? '');
  }, { zoom: 1.025, ox: '60%', vt: vt9, over: cap('Set it once. It runs the show.', '', 'top') });

  // ═════ 10–11 · Editing in Graphics studio: the real app, framed, a slow pointer ═════
  const app = await appCtx.newPage(); app.on('pageerror', (e) => errs.push('app: ' + e.message));
  const ui = kit.chrome(app, FONTS);
  const AW = 1600, AH = 900;
  const appShot = `<div class="fr" style="left:160px;top:150px;width:${AW}px;height:${AH}px"><img id="appimg" style="display:block;width:100%;height:100%"></div>`;
  /** Graphics studio › Looks › a new template for `graphic`, off camera. */
  async function openEditor(game, graphic) {
    await call('chooseGame', [game]);
    await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor();
    ui.zoom = { s: 1, x: 0, y: 0 };
    await ui.dress();
    await app.locator('nav.rail').getByRole('button', { name: /Graphics studio/ }).click(); await app.waitForTimeout(500);
    await app.getByRole('tab', { name: 'Looks' }).click(); await app.waitForTimeout(500);
    await app.getByLabel('Graphic for a new template').selectOption({ label: graphic });
    await app.getByRole('button', { name: '+ New template' }).click(); await app.waitForTimeout(3000);
    ui.pos = [760, 520]; await ui.place();
  }
  /** The shot as a film the kit's pointer helpers can drive (every frame they ask for is a stage frame). */
  const filmOf = (s) => ({ async run(_p, count, each) { for (let k = 0; k < count; k++) { if (each) await each(k); await tick(s); } } });
  const finish = async (s) => { if (s.i > s.n) console.warn(`${s.name}: ${s.i - s.n} frames over`); while (s.i < s.n) await tick(s); };
  const tree = (name) => app.locator('.tpl-tree [role=option]').filter({ hasText: new RegExp(`^[▸▾]?\\s*${name}( · \\d+)?\\s*$`) }).first();
  const inspector = app.locator('.tpl-right');
  /** Picks a colour as the colour picker does (fill() would scroll the field into view and move the zoomed app). */
  const pick = (loc, c) => loc.evaluate((el, c) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, c); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, c);
  /** Eases the view onto a point of the editor's canvas (fractions of its width and height). */
  // The kit's zoom keeps its point still; this one brings the canvas point to the middle of the window.
  const zoomCanvas = async (f, scale, fx, fy, frames) => {
    const b = await app.locator('.tpl-canvas').first().boundingBox();
    const tx = b.x + b.width * fx, ty = b.y + b.height * fy;
    await ui.zoomTo(f, scale, (640 - tx * scale) / (1 - scale), (360 - ty * scale) / (1 - scale), frames);
  };

  // 10 · PUBG MOBILE HUD (66–74 s): the points rail's title gets new words, then a colour.
  await openEditor('pubgm', 'Battle royale HUD');
  await app.locator('.tpl-tree .tpl-fold[aria-label$=" layers of Points rail"]').click().catch(() => {});
  await app.waitForTimeout(400);
  let s = await begin('10-edit-pubg', appShot, 8, { app, zoom: 1.03, key: 0.95, over: cap('Edit any graphic', '', 'top') });
  let f = filmOf(s);
  await f.run(app, 18);
  await ui.click(f, tree('Rail title'), { frames: 26, after: 14 });
  const words = inspector.getByLabel('Words').first();
  await ui.point(f, words, 22);
  await ui.type(f, words, 'LEADERBOARD', { per: 3 });
  await f.run(app, 18);
  const anyColour = inspector.getByLabel('Colour: any colour').first();
  await ui.point(f, anyColour, 22);
  // In on the rail as the colour changes.
  await zoomCanvas(f, 2.2, 0.78, 0.3, 36);
  await f.run(app, 14);
  await pick(anyColour, '#e11d48');
  await finish(s);

  // 11 · Valorant HUD (74–81 s): the scorebug's plate gets a colour of the producer's own.
  await openEditor('valorant', 'In-game HUD');
  s = await begin('11-edit-valorant', appShot, 7, { app, zoom: 1.03, key: 0.95, over: cap('Your colours, your words, live', '', 'top') });
  f = filmOf(s);
  await f.run(app, 16);
  await ui.click(f, tree('Scorebug'), { frames: 24, after: 12 });
  await ui.click(f, inspector.getByText('Solid', { exact: true }).first(), { frames: 22, after: 12 });
  const fillColour = inspector.getByLabel('Colour: any colour').first();
  await ui.point(f, fillColour, 20);
  // In on the scorebug as its plate takes the new colour.
  await zoomCanvas(f, 2.4, 0.5, 0.1, 34);
  await f.run(app, 8);
  await pick(fillColour, '#0e7490');
  await f.run(app, 44);
  await pick(fillColour, '#6d28d9');
  await finish(s);

  // ═════ 12 · More games coming (81–87 s) ═════
  const coming = ['apex', 'eafc', 'cs2', 'r6s', 'lol', 'dota2', 'cod', 'fortnite', 'rocket-league', 'tekken8'];
  const car = coming.map((n) => `<img src="${POSTER(n)}" style="flex:none;width:300px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6)">`).join('');
  await shot('12-coming', `<style>@keyframes car{0%{transform:translateX(160px)}100%{transform:translateX(-1000px)}}</style>
    <div style="position:absolute;left:0;top:190px;display:flex;gap:40px;animation:car 6s linear both">${car}</div>`, 6, null,
  { zoom: 1.02, over: `<div class="veil b"></div>${cap('More games coming', '', '', 0.8)}` });

  // ═════ 13 · End (87–90 s) ═════
  await shot('13-end', `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="fade" src="${ICON}" style="--fd:.4s;width:104px;height:104px;border-radius:22px">
      <div class="fade" style="--fd:.6s;margin-top:28px;font:700 104px/1 Poppins;letter-spacing:-.02em">ESPORTRA <span style="color:#ffb60e">AIR</span></div></div>`, 3, null,
  { zoom: 1.03, over: '<div class="black" style="animation:fin .7s 2.3s linear both"></div>' });
  await browser.close();
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 6).join(' | '));

  if (STILLS) {
    const dir = path.join(OUT, 'stills'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    board.forEach(([, file], k) => fs.copyFileSync(file, path.join(dir, String(k).padStart(3, '0') + '.jpg')));
    const { execFileSync } = require('node:child_process');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', 'scale=640:-1,tile=4x4:padding=8:color=0x06070b', '-frames:v', '1', path.join(OUT, 'stills-board.jpg')]);
    fs.writeFileSync(path.join(OUT, 'stills.txt'), board.map(([n], k) => `${k}  ${n}`).join('\n') + '\n');
    console.log(JSON.stringify({ stills: board.length, board: path.join(OUT, 'stills-board.jpg'), cuts }));
    return;
  }
  fs.writeFileSync(path.join(OUT, 'beats.txt'), `90 BPM · one beat ${BEAT.toFixed(4)} s · each line is a cut:\n${cuts.join('\n')}\n${(rec.frames / FPS).toFixed(3)}s  end\n`);
  const mp4 = path.join(OUT, 'esportra-air-showcase-16x9.mp4'), vert = path.join(OUT, 'esportra-air-showcase-9x16.mp4');
  kit.encode(rec.dir, mp4, { vertical: vert });
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(mp4, 1.0) }));
})().catch((e) => { console.error(e); process.exit(1); });
