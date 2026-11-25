// Esportra Air · 60 s showcase that moves (v5, 25 Nov, approved plan). The producer on v4: "still images with
// transitions", and too long. Here something happens on screen in every second: a Valorant round plays out on the
// HUD (kills, health, spike, round win), a recorded PUBG MOBILE game runs on its HUD, graphics build on camera as they
// go on air by themselves, and edits land on the HUD letter by letter. No cross-dissolves: hard cuts on movement,
// usually the next graphic's own entrance. The camera makes slow eased moves toward what is happening.
// Every graphic is an Air page fed through Air's own paths (dev/reel-setup.cjs); every frame is stepped and the
// pages' clocks pinned (dev/rec-kit.cjs), so motion is exact 30 fps.
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   node dev/showcase-motion.cjs [host] [engine port] <out dir> [--only=4,6]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const S = require('./reel-setup.cjs');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const H = args[0] || 'http://127.0.0.1:5334';
const ENGINE = args[1] || '5396';
const OUT = args[2] || path.join(process.cwd(), 'showcase-motion');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean).map(Number);
const want = (n) => !ONLY.length || ONLY.includes(n);
const h = S.connect(H, ENGINE);
const { ENG, call, patchRoom, action, LOTUS } = h;
const SITE = process.env.ESPORTRA_SITE || path.join(__dirname, '../../../../esportra/public');
const FPS = kit.FPS;
const F = (secs) => Math.round(secs * FPS);
const sleep = S.sleep;
const dataUrl = (file, type = 'image/png') => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const { VAL, REPLAY } = S;

const CSS = (fonts) => `${fonts}
*{box-sizing:border-box}
body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#06070b;color:#fff;font-family:Poppins,system-ui,sans-serif}
.bg{position:absolute;inset:0;background:radial-gradient(80% 70% at 70% 20%,#151b29 0%,#0a0c12 55%,#06070b 100%)}
#cam{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}
.g{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;background:transparent}
.fr{position:absolute;overflow:hidden;border-radius:14px;box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);background:#000}
.cap{position:absolute;z-index:30;left:120px;bottom:100px;max-width:1300px}
.cap.top{left:160px;bottom:auto;top:46px}
.cap.center{left:0;right:0;max-width:none;text-align:center}
.cap .bar{display:block;width:44px;height:3px;border-radius:2px;background:#ffb60e;margin-bottom:18px;animation:rise .7s cubic-bezier(.25,.6,.3,1) var(--cd,.3s) both}
.cap.center .bar{margin-left:auto;margin-right:auto}
.cap .hl{display:block;font:700 56px/1.1 Poppins;letter-spacing:-.015em;text-shadow:0 6px 30px rgba(0,0,0,.6);animation:rise .7s cubic-bezier(.25,.6,.3,1) var(--cd,.3s) both}
.cap .sb{display:block;margin-top:10px;font:500 24px/1.45 Poppins;color:#c5c9d2;text-shadow:0 4px 20px rgba(0,0,0,.6);animation:rise .7s cubic-bezier(.25,.6,.3,1) calc(var(--cd,.3s) + .2s) both}
.cap.brief{animation:capout .6s var(--out,3.6s) ease-in both}
@keyframes capout{0%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
@keyframes rise{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}
.veil{position:absolute;inset:0;z-index:20;pointer-events:none}
.veil.l{background:linear-gradient(90deg,rgba(6,7,11,.75) 0%,rgba(6,7,11,.4) 28%,transparent 50%);animation:capout .6s var(--out,3.6s) ease-in both}
.veil.b{background:linear-gradient(0deg,rgba(6,7,11,.85) 0%,transparent 40%)}
.fade{animation:fin .9s cubic-bezier(.25,.6,.3,1) var(--fd,.1s) both}
@keyframes fin{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}
.black{position:absolute;inset:0;z-index:90;background:#000}
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const FONTS = kit.fontCss();
  const ICON = dataUrl(path.join(SITE, 'brand/esportra-icon-512.png'));
  const POSTER = (n) => dataUrl(path.join(SITE, `games/${n}-logo.png`));

  // ═════ Off camera: the producer's data, through Air (dev/reel-setup.cjs) ═════
  const d = await S.prepare(h);
  const { lobby, states, wwcdAt, fbAt, vmatch, players, pool } = d;
  await call('lobbyShow', [lobby.id, { pick: { scope: 'match', game: 1 } }]);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await kit.prepare(ctx); await kit.prepare(appCtx);
  const { logo, sample, wall, seek, resetReplay } = await S.dress(h, ctx, d);
  await appCtx.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: logo }));
  const stage = await ctx.newPage();
  const errs = []; stage.on('pageerror', (e) => errs.push('stage: ' + e.message));
  const rec = kit.recorder(path.join(OUT, 'frames'));
  const src = kit.recorder(path.join(OUT, 'src-unused'));
  const cuts = [];

  // ── camera: eased moves between keys [frame, scale, focus x, focus y]; the focus point sits mid-frame ──
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function camAt(keys, i) {
    let a = keys[0], b = keys[0];
    for (const k of keys) { if (k[0] <= i) a = k; if (k[0] >= i) { b = k; break; } b = k; }
    const t = b[0] === a[0] ? 1 : ease(Math.min(1, Math.max(0, (i - a[0]) / (b[0] - a[0]))));
    const s = a[1] + (b[1] - a[1]) * t;
    // Keep the frame covered: the focus can only go as far as the edges allow at this scale.
    const fx = Math.min(1920 - 960 / s, Math.max(960 / s, a[2] + (b[2] - a[2]) * t));
    const fy = Math.min(1080 - 540 / s, Math.max(540 / s, a[3] + (b[3] - a[3]) * t));
    return `translate(${(960 - fx * s).toFixed(2)}px,${(540 - fy * s).toFixed(2)}px) scale(${s.toFixed(5)})`;
  }

  /** Opens a shot off camera: its page and camera keys. Pages' own entrances restart at the shot's first frame. */
  async function begin(name, html, secs, opts = {}) {
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}</style></head><body><div class="bg"></div><div id="cam">${html}</div>${opts.over ?? ''}</body></html>`, { waitUntil: 'load' });
    for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
    await stage.evaluate(() => document.fonts.ready);
    if (opts.ready) await opts.ready();
    await sleep(400);
    cuts.push(`${(rec.frames / FPS).toFixed(3)}s  ${name}`);
    return { name, n: F(secs), i: 0, cam: opts.cam ?? [[0, 1, 960, 540], [F(secs), 1.04, 960, 540]], app: opts.app ?? null };
  }
  /** One video frame: the camera at this frame, the app's next frame for app shots. */
  async function tick(s, vt = null) {
    const tf = camAt(s.cam, s.i);
    let b64 = null;
    if (s.app) b64 = (await src.grab(s.app)).toString('base64');
    await stage.evaluate(async ([tf, b64]) => {
      document.getElementById('cam').style.transform = tf;
      if (b64) { const img = document.getElementById('appimg'); img.src = 'data:image/jpeg;base64,' + b64; await img.decode().catch(() => {}); }
    }, [tf, b64]);
    await rec.frame(stage, vt, true);
    s.i++;
  }
  async function shot(name, html, secs, each, opts = {}) {
    const s = await begin(name, html, secs, opts);
    while (s.i < s.n) { if (each) await each(s.i, s); await tick(s, opts.vt ? opts.vt(s.i) : null); }
  }
  const g = (src, style = '') => `<iframe class="g" src="${src}" style="${style}"></iframe>`;
  const cap = (hl, sb = '', cls = '', more = '') => `<div class="cap ${cls}" style="${more}"><span class="bar"></span><span class="hl">${hl}</span>${sb ? `<span class="sb">${sb}</span>` : ''}</div>`;
  const word = (size, d0) => 'ESPORTRA AIR'.split('').map((c, i) => `<span class="fade" style="display:inline-block;--fd:${(d0 + i * 0.04).toFixed(2)}s;${i > 8 ? 'color:#ffb60e' : ''}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');

  // ═════ 1 · Open (0–3 s) ═════
  if (want(1)) await shot('1-open', `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="fade" src="${ICON}" style="--fd:.05s;width:112px;height:112px;border-radius:24px">
      <div style="margin-top:30px;font:700 112px/1 Poppins;letter-spacing:-.02em">${word(112, 0.2)}</div>
      <div class="fade" style="--fd:1.1s;margin-top:28px;font:500 30px Poppins;color:#c5c9d2">Broadcast graphics, live from the game.</div></div>`, 3, null,
  { cam: [[0, 1, 960, 540], [F(3), 1.05, 960, 540]] });

  // ═════ 2 · Esportra → Air (3–9 s): the imported match's own data flying into Air ═════
  if (want(2)) {
    const packets = [vmatch.teams?.[0]?.name, vmatch.teams?.[1]?.name, `Best of ${vmatch.bestOf ?? 3}`, ...players.slice(0, 5), ...pool.slice(0, 4), 'Bracket'].filter(Boolean).slice(0, 13);
    const pk = packets.map((p, i) => { const y = 400 + ((i * 83) % 260); return `<div style="position:absolute;left:0;top:0;offset-path:path('M 650 ${y} C 900 ${y - 140}, 1100 ${y + 140}, 1360 540');offset-rotate:0deg;padding:8px 16px;border-radius:999px;background:rgba(255,182,14,.08);border:1px solid rgba(255,182,14,.45);color:#ffe2a3;font:500 20px Poppins;white-space:nowrap;animation:fly 1.9s ${0.15 + i * 0.32}s cubic-bezier(.45,0,.35,1) both">${p}</div>`; }).join('');
    await shot('2-import', `<style>@keyframes fly{0%{offset-distance:0%;opacity:0}12%{opacity:1}88%{opacity:1}100%{offset-distance:100%;opacity:0}}@keyframes beat{0%,100%{box-shadow:0 0 40px rgba(255,182,14,.15)}50%{box-shadow:0 0 90px rgba(255,182,14,.4)}}</style>
      <div class="fade" style="--fd:0s;position:absolute;left:190px;top:330px;width:460px;padding:30px;border-radius:18px;background:#10131c;border:1px solid rgba(255,255,255,.1)">
        <div style="display:flex;gap:16px;align-items:center"><img src="${ICON}" style="width:60px;height:60px;border-radius:14px"><div><div style="font:700 14px Poppins;letter-spacing:.2em;color:#ffb60e">ESPORTRA</div><div style="font:700 28px Poppins">Community Cup</div></div></div>
        <div style="margin-top:22px;font:600 24px Poppins">${vmatch.teams?.[0]?.name ?? ''} <span style="color:#7d828d">vs</span> ${vmatch.teams?.[1]?.name ?? ''}</div>
        <div style="margin-top:8px;font:500 18px Poppins;color:#9aa0ab">Best of ${vmatch.bestOf ?? 3} · players · veto</div></div>
      <div style="position:absolute;left:1360px;top:390px;width:300px;height:300px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,182,14,.8);animation:beat 1.2s ease-in-out infinite"><div style="font:700 60px Poppins;letter-spacing:-.01em">AIR</div></div>
      ${pk}`, 6, null, { cam: [[0, 1.12, 860, 560], [F(6), 1.12, 1080, 540]], over: cap('Your tournament, straight from Esportra', 'Teams, players and veto. No spreadsheets.') });
  }

  // ═════ 3 · The imported match's intro builds (9–13 s) ═════
  if (want(3)) await shot('3-intro', g(`${ENG}/overlays/match-intro.html?match=${vmatch.code}`), 4, null,
    { cam: [[0, 1, 960, 540], [F(4), 1.07, 960, 520]], over: `<div class="veil b"></div>${cap('Ready before the first round', '', '', 'bottom:80px')}` });

  // ═════ 4 · Valorant: a live round on the HUD (13–25 s) ═════
  if (want(4)) {
    // Mid-round seed from the HUD's own sample: round 23, 11–11, everyone up, nothing in the killfeed.
    const P = clone(sample.players).map((team) => team.map((p) => ({ ...p, alive: true, hp: 100, armor: 50 })));
    const teams = clone(sample.teams); teams[0].score = 11; teams[1].score = 11; teams[0].series = 1; teams[1].series = 1;
    const series = clone(sample.series); series[2] = { ...series[2], score: [11, 11], winner: null };
    const rounds = clone(sample.rounds).slice(0, 22);
    await patchRoom(VAL, { round: { number: 23, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' }, teams, series, rounds, killfeed: [], banner: { type: '', team: 1, player: 0, text: '', method: '', ts: 0, hold: 4200 }, players: P, show: { economy: 'auto', roundRecap: false, scoreboard: false } });
    const base = Date.now() + 2000, vt4 = (i) => base + (i / FPS) * 1000;
    const kf = [];
    const kill = (k, v, weapon, hs, ts) => { kf.push({ killer: k, victim: v, weapon, hs, ts }); const p = P[v[0]][v[1]]; p.alive = false; p.hp = 0; p.armor = 0; P[k[0]][k[1]].k += 1; };
    const script = {
      [F(1.0)]: (t) => { kill([1, 0], [0, 1], 'OPERATOR', false, t); return { killfeed: kf, players: P }; },
      [F(2.5)]: () => { Object.assign(P[0][0], { hp: 62, armor: 0 }); Object.assign(P[1][1], { hp: 45, armor: 25 }); return { players: P }; },
      [F(4.0)]: (t) => { kill([0, 0], [1, 1], 'VANDAL', true, t); return { killfeed: kf, players: P }; },
      [F(5.5)]: (t) => { P[1][3].credits += 300; return { round: { phase: 'planted', endsAt: t + 45000 }, players: P }; },
      [F(7.5)]: (t) => { kill([1, 3], [0, 2], 'PHANTOM', false, t - 300); kill([1, 3], [0, 4], 'PHANTOM', true, t); Object.assign(P[0][0], { hp: 18 }); return { killfeed: kf, players: P }; },
      [F(9.3)]: (t) => { kill([1, 0], [0, 0], 'OPERATOR', false, t - 200); kill([1, 2], [0, 3], 'GHOST', true, t); return { killfeed: kf, players: P }; },
      [F(9.8)]: (t) => {
        const tm = clone(teams); tm[1].score = 12;
        const se = clone(series); se[2].score = [11, 12];
        return { round: { number: 23, phase: 'end', endsAt: 0, remaining: 0, winner: 1, method: 'elim' }, teams: tm, series: se, rounds: [...rounds, { w: 1, how: 'elim' }], banner: { type: 'round', team: 1, player: 0, text: '', method: 'ELIMINATION', ts: t, hold: 4200 } };
      },
    };
    await shot('4-valorant', `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div>`, 12, async (i) => {
      if (script[i]) { await patchRoom(VAL, script[i](vt4(i))); await sleep(140); }
    }, {
      vt: vt4,
      // Wide; in on the scorebug as the spike goes down; out again for the round win.
      cam: [[0, 1.0, 960, 540], [F(5.2), 1.04, 960, 520], [F(6.3), 1.16, 960, 300], [F(8.6), 1.16, 1160, 300], [F(9.9), 1.0, 960, 540], [F(12), 1.03, 960, 520]],
      over: `<div class="veil l" style="--out:3.4s"></div>${cap('Valorant', 'Live from the game', 'brief', 'bottom:auto;top:330px;--out:3.4s')}`,
    });
  }

  // ═════ 5 · PUBG MOBILE: the recorded game on its HUD, at 2× (25–35 s) ═════
  if (want(5)) {
    const from5 = fbAt - 1200, vt5 = (i) => from5 + (i / FPS) * 2000;
    await resetReplay(from5);
    await patchRoom(REPLAY, { layout: { brHud: 'rail' }, brPopup: false });
    await shot('5-pubg-hud', `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}</div>`, 10, async (i) => { await seek(vt5(i)); }, {
      vt: vt5,
      cam: [[0, 1.0, 960, 540], [F(3.5), 1.02, 960, 540], [F(7), 1.14, 1300, 470], [F(10), 1.14, 1300, 520]],
      over: `<div class="veil l" style="--out:3.4s"></div>${cap('PUBG MOBILE', 'Live points, straight from the game', 'brief', 'bottom:auto;top:330px;--out:3.4s')}`,
    });
  }

  // ═════ 6 · On air by themselves (35–47 s): the match ends, autopilot runs the Rundown; Player vs player on a key ═════
  if (want(6)) {
    const from6 = wwcdAt - 900;
    await resetReplay(from6);
    const last = states[states.length - 1][1];
    // [start s, screen, chip]: WWCD comes from the recorded game (Air's autopilot put it on air); the rest are the
    // same engine call a Take sends, with the room on the final saved state (results, brStats).
    const steps = [[0.9, 'br-wwcd', 'WWCD'], [3.4, 'br-rankings', 'Match results'], [5.6, 'br-mvp', 'Match MVP'], [7.8, 'br-overall', 'Overall standings'], [9.7, 'br-pvp', 'Player vs player']];
    const at = Object.fromEntries(steps.map(([t, sc], k) => [F(t), [sc, k]]));
    const chips = steps.map(([, , n], k) => `<b data-k="${k}">${k === 4 ? `<i>F6</i>` : ''}${n}</b>`).join('');
    await shot('6-on-air', `<style>.rd{position:absolute;right:40px;top:34px;z-index:5;display:flex;gap:8px;font:600 15px Poppins;letter-spacing:.02em}.rd b{padding:9px 14px;border-radius:999px;background:rgba(8,10,16,.82);border:1px solid rgba(255,255,255,.14);color:#aab0bb;font-weight:600}.rd b.on{border-color:#ffb60e;color:#fff;box-shadow:0 0 24px rgba(255,182,14,.3)}.rd b.done{color:#6f7581}.rd i{font-style:normal;margin-right:8px;padding:1px 6px;border-radius:4px;background:#ffb60e;color:#0b0b0f;font-weight:700}</style>
      <div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}${g(`${ENG}/overlays/fullscreen.html?match=${REPLAY}`)}</div>`, 12, async (i) => {
      if (i < F(0.9)) await seek(from6 + (i / FPS) * 1000);
      else if (i === F(0.9)) { await seek(wwcdAt + 50); await sleep(120); }
      else if (at[i] && at[i][1] > 0) {
        if (at[i][1] === 1) await patchRoom(REPLAY, { ...last, brPick: { scope: 'match', game: 1 } });
        await action(REPLAY, 'fullscreen.show', { screen: at[i][0], style: 'full' }); await sleep(160);
      }
      const k = steps.reduce((acc, [t], j) => (i >= F(t) ? j : acc), -1);
      await stage.evaluate((k) => document.querySelectorAll('.rd b').forEach((b) => { const j = Number(b.dataset.k); b.className = j === k ? 'on' : j < k ? 'done' : ''; }), k);
    }, {
      vt: (i) => (i < F(0.9) ? from6 + (i / FPS) * 1000 : wwcdAt + (i / FPS) * 1000),
      cam: [[0, 1.0, 960, 540], [F(12), 1.05, 960, 540]],
      over: `<div class="rd">${chips}</div><div class="veil b"></div>${cap('Set it once. It runs the show.', '', '', 'bottom:70px')}`,
    });
  }

  // ═════ 7 · Edit (47–55 s): Graphics studio, the edit landing on the HUD letter by letter ═════
  if (want(7)) {
    const app = await appCtx.newPage(); app.on('pageerror', (e) => errs.push('app: ' + e.message));
    const ui = kit.chrome(app, FONTS);
    const appShot = `<div class="fr" style="left:160px;top:150px;width:1600px;height:900px"><img id="appimg" style="display:block;width:100%;height:100%"></div>`;
    const tree = (name) => app.locator('.tpl-tree [role=option]').filter({ hasText: new RegExp(`^[▸▾]?\\s*${name}( · \\d+)?\\s*$`) }).first();
    const inspector = app.locator('.tpl-right');
    // Sets a field as typing or the colour picker does, without scrolling it into view (that would move the zoomed app).
    const setValue = (loc, v) => loc.evaluate((el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    const zoomCanvas = async (f, scale, fx, fy, frames) => {
      const b = await app.locator('.tpl-canvas').first().boundingBox();
      const tx = b.x + b.width * fx, ty = b.y + b.height * fy;
      await ui.zoomTo(f, scale, (640 - tx * scale) / (1 - scale), (360 - ty * scale) / (1 - scale), frames);
    };
    async function openEditor(game, graphic) {
      await call('chooseGame', [game]);
      await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor();
      ui.zoom = { s: 1, x: 0, y: 0 }; await ui.dress();
      await app.locator('nav.rail').getByRole('button', { name: /Graphics studio/ }).click(); await app.waitForTimeout(500);
      await app.getByRole('tab', { name: 'Looks' }).click(); await app.waitForTimeout(500);
      await app.getByLabel('Graphic for a new template').selectOption({ label: graphic });
      await app.getByRole('button', { name: '+ New template' }).click(); await app.waitForTimeout(3000);
      ui.pos = [1400, 900]; await ui.place(); // the pointer waits out of the picture
    }
    const filmOf = (s) => ({ async run(_p, count, each) { for (let k = 0; k < count; k++) { if (each) await each(k); await tick(s); } } });
    const finish = async (s) => { if (s.i > s.n) console.warn(`${s.name}: ${s.i - s.n} frames over`); while (s.i < s.n) await tick(s); };
    const cam7 = (secs) => [[0, 1.0, 960, 600], [F(secs), 1.06, 960, 600]];

    // PUBG MOBILE HUD (4.5 s): in on the rail; its title retyped on the graphic, then a colour.
    await openEditor('pubgm', 'Battle royale HUD');
    await app.locator('.tpl-tree .tpl-fold[aria-label$=" layers of Points rail"]').click().catch(() => {});
    await tree('Rail title').click(); await app.waitForTimeout(500);
    let s = await begin('7a-edit-pubg', appShot, 4.5, { app, cam: cam7(4.5), over: cap('Edit any graphic', '', 'top') });
    let f = filmOf(s);
    const words = inspector.getByLabel('Words').first();
    await zoomCanvas(f, 2.3, 0.78, 0.3, 30);
    for (let n = 1; n <= 'LEADERBOARD'.length; n++) { await setValue(words, 'LEADERBOARD'.slice(0, n)); await f.run(app, 3); }
    await f.run(app, 10);
    await setValue(inspector.getByLabel('Colour: any colour').first(), '#e11d48');
    await f.run(app, 30);
    await zoomCanvas(f, 1.6, 0.6, 0.3, 30);
    await finish(s);

    // Valorant HUD (3.5 s): in on the scorebug; its plate teal, then purple.
    await openEditor('valorant', 'In-game HUD');
    await tree('Scorebug').click(); await app.waitForTimeout(300);
    await inspector.getByText('Solid', { exact: true }).first().click(); await app.waitForTimeout(300);
    s = await begin('7b-edit-valorant', appShot, 3.5, { app, cam: cam7(3.5), over: cap('Your colours, your words', '', 'top') });
    f = filmOf(s);
    const fill = inspector.getByLabel('Colour: any colour').first();
    await zoomCanvas(f, 2.4, 0.5, 0.1, 26);
    await setValue(fill, '#0e7490');
    await f.run(app, 34);
    await setValue(fill, '#6d28d9');
    await f.run(app, 24);
    await finish(s);
  }

  // ═════ 8 · More games coming (55–58 s) ═════
  if (want(8)) {
    const coming = ['apex', 'eafc', 'cs2', 'r6s', 'lol', 'dota2', 'cod', 'fortnite', 'rocket-league', 'tekken8'];
    const car = coming.map((n, i) => `<img class="fade" src="${POSTER(n)}" style="--fd:${(i * 0.1).toFixed(2)}s;flex:none;width:300px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6)">`).join('');
    await shot('8-coming', `<style>@keyframes car{0%{transform:translateX(120px)}100%{transform:translateX(-700px)}}</style>
      <div style="position:absolute;left:0;top:190px;display:flex;gap:40px;animation:car 3s cubic-bezier(.3,.1,.4,1) both">${car}</div>`, 3, null,
    { cam: [[0, 1.0, 960, 540], [F(3), 1.03, 960, 540]], over: `<div class="veil b"></div>${cap('More games coming', '', '', 'bottom:90px;--cd:.5s')}` });
  }

  // ═════ 9 · End (58–60 s) ═════
  if (want(9)) await shot('9-end', `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="fade" src="${ICON}" style="--fd:.05s;width:104px;height:104px;border-radius:22px">
      <div style="margin-top:28px;font:700 104px/1 Poppins;letter-spacing:-.02em">${word(104, 0.15)}</div></div>`, 2, null,
  { cam: [[0, 1, 960, 540], [F(2), 1.04, 960, 540]], over: '<div class="black" style="animation:fin .5s 1.5s linear both;transform:none"></div>' });

  await browser.close();
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 6).join(' | '));
  fs.writeFileSync(path.join(OUT, 'cuts.txt'), `${cuts.join('\n')}\n${(rec.frames / FPS).toFixed(3)}s  end\n`);
  const tag = ONLY.length ? `-only-${ONLY.join('-')}` : '';
  const mp4 = path.join(OUT, `esportra-air-showcase${tag}-16x9.mp4`), vert = path.join(OUT, `esportra-air-showcase${tag}-9x16.mp4`);
  kit.encode(rec.dir, mp4, ONLY.length ? {} : { vertical: vert });
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(mp4, 0.5), cuts }));
})().catch((e) => { console.error(e); process.exit(1); });
