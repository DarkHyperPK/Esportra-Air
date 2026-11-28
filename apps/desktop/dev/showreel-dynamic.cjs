// Esportra Air · 60 s dynamic showreel (v6, 25 Nov, approved plan). The producer: "show people what we made, not a
// lecture." So: no sentences, only small tags; cuts every 2–4 s, usually on an event; one continuous moment (a
// Valorant round, a PUBG MOBILE game) covered from several framings, each with its own move; graphics building on
// camera as autopilot puts them on air; one quick look at the real Graphics studio, then edits landing on graphics
// on air. Every graphic is an Air page fed through Air's paths (dev/reel-setup.cjs); frames are stepped and clocks
// pinned (dev/rec-kit.cjs), so motion is exact 30 fps.
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   node dev/showreel-dynamic.cjs [host] [engine port] <out dir> [--only=4,8]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const S = require('./reel-setup.cjs');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const H = args[0] || 'http://127.0.0.1:5334';
const ENGINE = args[1] || '5396';
const OUT = args[2] || path.join(process.cwd(), 'showreel-dynamic');
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
.tag{position:absolute;z-index:40;left:56px;top:48px;padding:9px 14px;background:#ffb60e;color:#0b0b0f;font:700 18px/1 Poppins;letter-spacing:.16em;animation:tagin .35s cubic-bezier(.2,.8,.2,1) both,tagout .35s var(--out,1.6s) ease-in both}
@keyframes tagin{0%{opacity:0;transform:translateX(-16px)}100%{opacity:1;transform:none}}
@keyframes tagout{0%{opacity:1}100%{opacity:0}}
.fade{animation:fin .7s cubic-bezier(.2,.8,.2,1) var(--fd,.05s) both}
@keyframes fin{0%{opacity:0;transform:translateY(18px)}100%{opacity:1;transform:none}}
.black{position:absolute;inset:0;z-index:90;background:#000}
@keyframes blk{0%{opacity:0}100%{opacity:1}}
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const FONTS = kit.fontCss();
  const ICON = dataUrl(path.join(SITE, 'brand/esportra-icon-512.png'));
  const POSTER = (n) => dataUrl(path.join(SITE, `games/${n}-logo.png`));

  // ═════ Off camera: the producer's data, through Air (dev/reel-setup.cjs) ═════
  const d = await S.prepare(h);
  const { lobby, code, states, wwcdAt, fbAt, vmatch, players, pool } = d;
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

  // ── camera: per cut, eased keys [frame in cut, scale, focus x, focus y]; the focus sits mid-frame ──
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function camAt(keys, i) {
    let a = keys[0], b = keys[0];
    for (const k of keys) { if (k[0] <= i) a = k; if (k[0] >= i) { b = k; break; } b = k; }
    const t = b[0] === a[0] ? 1 : ease(Math.min(1, Math.max(0, (i - a[0]) / (b[0] - a[0]))));
    const s = a[1] + (b[1] - a[1]) * t;
    const fx = Math.min(1920 - 960 / s, Math.max(960 / s, a[2] + (b[2] - a[2]) * t));
    const fy = Math.min(1080 - 540 / s, Math.max(540 / s, a[3] + (b[3] - a[3]) * t));
    return `translate(${(960 - fx * s).toFixed(2)}px,${(540 - fy * s).toFixed(2)}px) scale(${s.toFixed(5)})`;
  }
  // Moves, each from the frame a cut starts (secs = the cut's length).
  const M = {
    push: (sx, fx = 960, fy = 540, s0 = 1, s1 = 1.06) => [[0, s0, fx, fy], [F(sx), s1, fx, fy]],
    pull: (sx, fx = 960, fy = 540, s0 = 1.1, s1 = 1) => [[0, s0, fx, fy], [F(sx), s1, fx, fy]],
    track: (sx, s, x0, x1, fy = 540) => [[0, s, x0, fy], [F(sx), s, x1, fy]],
    tilt: (sx, s, fx, y0, y1) => [[0, s, fx, y0], [F(sx), s, fx, y1]],
    // A held framing still creeps in a little, so the picture never sits still between events.
    lock: (sx, s, fx, fy) => [[0, s, fx, fy], [F(sx), s * 1.035, fx, fy]],
  };

  /** One shot: a page, covered by cuts [[secs, keys, label]] (hard cuts, one page, so its time runs on). */
  async function film(name, html, cutsIn, each, opts = {}) {
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}</style></head><body><div class="bg"></div><div id="cam">${html}</div><div id="over">${opts.over ?? ''}</div></body></html>`, { waitUntil: 'load' });
    for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
    await stage.evaluate(() => document.fonts.ready);
    if (opts.ready) await opts.ready();
    await sleep(400);
    let i = 0;
    for (const [secs, keys, label, shift] of cutsIn) {
      // Edge graphics (the PUBG rail) slide to the middle for a close framing; at a cut the eye never sees it move.
      await stage.evaluate((x) => { const e = document.getElementById('hud'); if (e) e.style.left = (x ?? 0) + 'px'; }, shift ?? 0);
      cuts.push(`${(rec.frames / FPS).toFixed(3)}s  ${name}${label ? ' · ' + label : ''}`);
      for (let k = 0; k < F(secs); k++, i++) {
        if (each) await each(i);
        let b64 = null;
        if (opts.app) b64 = (await src.grab(opts.app)).toString('base64');
        await stage.evaluate(async ([tf, b64]) => {
          document.getElementById('cam').style.transform = tf;
          if (b64) { const img = document.getElementById('appimg'); img.src = 'data:image/jpeg;base64,' + b64; await img.decode().catch(() => {}); }
        }, [camAt(keys, k), b64]);
        await rec.frame(stage, opts.vt ? opts.vt(i) : null, true);
      }
    }
  }
  const g = (src, style = '', id = '') => `<iframe class="g" ${id ? `id="${id}" ` : ''}src="${src}" style="${style}"></iframe>`;
  const tag = (t, out = 1.6) => `<div class="tag" style="--out:${out}s">${t}</div>`;
  const word = (d0) => 'ESPORTRA AIR'.split('').map((c, i) => `<span class="fade" style="display:inline-block;--fd:${(d0 + i * 0.035).toFixed(3)}s;${i > 8 ? 'color:#ffb60e' : ''}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  /** Refreshes the room-fed pages' look: Air's saved copy of a template, as Air sends it to a room. */
  const savedTemplate = async (id) => (await call('snapshot')).templates.find((t) => t.id === id);

  // ═════ 1 · Logo (0–2.5 s) ═════
  if (want(1)) await film('1-logo', `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="fade" src="${ICON}" style="width:104px;height:104px;border-radius:22px">
      <div style="margin-top:26px;font:700 116px/1 Poppins;letter-spacing:-.02em">${word(0.12)}</div></div>`, [[2.5, M.push(2.5, 960, 540, 1, 1.05)]]);

  // ═════ 2 · Esportra → Air (2.5–6 s) ═════
  if (want(2)) {
    const packets = [vmatch.teams?.[0]?.name, vmatch.teams?.[1]?.name, `Best of ${vmatch.bestOf ?? 3}`, ...players.slice(0, 8), ...pool.slice(0, 5), 'Bracket', 'Veto'].filter(Boolean).slice(0, 16);
    const pk = packets.map((p, i) => { const y = 380 + ((i * 71) % 300); return `<div style="position:absolute;left:0;top:0;offset-path:path('M 650 ${y} C 900 ${y - 160}, 1100 ${y + 160}, 1360 540');offset-rotate:0deg;padding:8px 16px;border-radius:999px;background:rgba(255,182,14,.1);border:1px solid rgba(255,182,14,.55);color:#ffe2a3;font:500 20px Poppins;white-space:nowrap;animation:fly 1.2s ${0.05 + i * 0.15}s cubic-bezier(.45,0,.35,1) both">${p}</div>`; }).join('');
    await film('2-import', `<style>@keyframes fly{0%{offset-distance:0%;opacity:0}12%{opacity:1}88%{opacity:1}100%{offset-distance:100%;opacity:0}}@keyframes beat{0%,100%{box-shadow:0 0 40px rgba(255,182,14,.15);transform:scale(1)}50%{box-shadow:0 0 100px rgba(255,182,14,.45);transform:scale(1.03)}}</style>
      <div style="position:absolute;left:190px;top:330px;width:460px;padding:30px;border-radius:18px;background:#10131c;border:1px solid rgba(255,255,255,.1)">
        <div style="display:flex;gap:16px;align-items:center"><img src="${ICON}" style="width:60px;height:60px;border-radius:14px"><div><div style="font:700 14px Poppins;letter-spacing:.2em;color:#ffb60e">ESPORTRA</div><div style="font:700 28px Poppins">Community Cup</div></div></div>
        <div style="margin-top:22px;font:600 24px Poppins">${vmatch.teams?.[0]?.name ?? ''} <span style="color:#7d828d">vs</span> ${vmatch.teams?.[1]?.name ?? ''}</div>
        <div style="margin-top:8px;font:500 18px Poppins;color:#9aa0ab">Best of ${vmatch.bestOf ?? 3} · players · veto</div></div>
      <div style="position:absolute;left:1360px;top:390px;width:300px;height:300px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,182,14,.8);animation:beat .8s ease-in-out infinite"><div style="font:700 60px Poppins;letter-spacing:-.01em">AIR</div></div>
      ${pk}`, [[3.5, M.track(3.5, 1.15, 820, 1120)]], null, { over: tag('ESPORTRA → AIR') });
  }

  // ═════ 3 · The imported match's intro builds (6–9 s) ═════
  if (want(3)) await film('3-intro', g(`${ENG}/overlays/match-intro.html?match=${vmatch.code}`), [[3, M.push(3, 960, 500, 1.0, 1.08)]]);

  // ═════ 4 · Valorant: a live round, four framings (9–21 s) ═════
  const P0 = clone(sample.players).map((team) => team.map((p) => ({ ...p, alive: true, hp: 100, armor: 50 })));
  const teams0 = clone(sample.teams); teams0[0].score = 11; teams0[1].score = 11; teams0[0].series = 1; teams0[1].series = 1;
  const series0 = clone(sample.series); series0[2] = { ...series0[2], score: [11, 11], winner: null };
  const rounds0 = clone(sample.rounds).slice(0, 22);
  const liveRound = (n) => ({ round: { number: n, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' }, killfeed: [], banner: { type: '', team: 1, player: 0, text: '', method: '', ts: 0, hold: 4200 }, show: { economy: 'auto', roundRecap: false, scoreboard: false } });
  if (want(4)) {
    const P = clone(P0);
    await patchRoom(VAL, { ...liveRound(23), teams: teams0, series: series0, rounds: rounds0, players: P });
    const base = Date.now() + 2000, vt4 = (i) => base + (i / FPS) * 1000;
    const kf = [];
    const kill = (k, v, weapon, hs, ts) => { kf.push({ killer: k, victim: v, weapon, hs, ts }); const p = P[v[0]][v[1]]; p.alive = false; p.hp = 0; p.armor = 0; P[k[0]][k[1]].k += 1; };
    const script = {
      [F(1.2)]: (t) => { kill([1, 0], [0, 1], 'OPERATOR', false, t); return { killfeed: kf, players: P }; },
      [F(2.4)]: () => { Object.assign(P[0][0], { hp: 62, armor: 0 }); Object.assign(P[1][1], { hp: 45, armor: 25 }); return { players: P }; },
      [F(3.7)]: (t) => { kill([0, 0], [1, 1], 'VANDAL', true, t); return { killfeed: kf, players: P }; },
      [F(5.6)]: (t) => { P[1][3].credits += 300; return { round: { phase: 'planted', endsAt: t + 45000 }, players: P }; },
      [F(8.6)]: (t) => { kill([1, 3], [0, 2], 'PHANTOM', false, t - 300); kill([1, 3], [0, 4], 'PHANTOM', true, t); Object.assign(P[0][0], { hp: 18 }); return { killfeed: kf, players: P }; },
      [F(9.8)]: (t) => { kill([1, 0], [0, 0], 'OPERATOR', false, t - 200); kill([1, 2], [0, 3], 'GHOST', true, t); return { killfeed: kf, players: P }; },
      [F(10.4)]: (t) => {
        const tm = clone(teams0); tm[1].score = 12;
        const se = clone(series0); se[2].score = [11, 12];
        return { round: { number: 23, phase: 'end', endsAt: 0, remaining: 0, winner: 1, method: 'elim' }, teams: tm, series: se, rounds: [...rounds0, { w: 1, how: 'elim' }], banner: { type: 'round', team: 1, player: 0, text: '', method: 'ELIMINATION', ts: t, hold: 4200 } };
      },
    };
    await film('4-valorant', `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div>`, [
      [3.0, M.track(3.0, 1.12, 1060, 880, 560), 'wide, first blood'],
      [2.5, M.lock(2.5, 1.75, 1500, 260), 'killfeed'],
      [2.5, M.push(2.5, 960, 200, 1.6, 1.8), 'scorebug, spike'],
      [4.0, M.pull(4.0, 960, 520, 1.12, 1.0), 'wide, round won'],
    ], async (i) => { if (script[i]) { await patchRoom(VAL, script[i](vt4(i))); await sleep(140); } }, { vt: vt4, over: tag('VALORANT') });
  }

  // ═════ 5 · PUBG MOBILE: the recorded game on its HUD at 2×, three framings (21–30 s) ═════
  if (want(5)) {
    // Start so a team is eliminated about 6.3 s in, in the third framing.
    const outs = [...new Set(states.map(([, s]) => s.brLive?.lastOut?.at).filter(Boolean))];
    const o = outs.find((x) => x - 12600 >= states[0][0] + 1500 && x < wwcdAt - 4000);
    const from5 = o ? o - 12600 : fbAt - 1200, vt5 = (i) => from5 + (i / FPS) * 2000;
    await resetReplay(from5);
    await patchRoom(REPLAY, { layout: { brHud: 'rail' }, brPopup: false });
    await film('5-pubg', `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`, '', 'hud')}</div>`, [
      [3.0, M.push(3.0, 900, 540, 1.0, 1.05), 'wide'],
      [3.0, M.tilt(3.0, 1.65, 1030, 360, 640), 'points rail', -640],
      [3.0, M.pull(3.0, 880, 200, 1.7, 1.5), 'team eliminated'],
    ], async (i) => { await seek(vt5(i)); }, { vt: vt5, over: tag('PUBG MOBILE') });
  }

  // ═════ 6 · Autopilot: the match ends and the Rundown runs; Player vs player on a key (30–40 s) ═════
  if (want(6)) {
    const from6 = wwcdAt - 600;
    await resetReplay(from6);
    const last = states[states.length - 1][1];
    const steps = [[0.6, 'br-wwcd', 'WWCD'], [2.6, 'br-rankings', 'Match results'], [4.5, 'br-mvp', 'Match MVP'], [6.4, 'br-overall', 'Overall standings'], [8.1, 'br-pvp', 'Player vs player']];
    const at = Object.fromEntries(steps.map(([t, sc], k) => [F(t), [sc, k]]));
    const chips = steps.map(([, , n], k) => `<b data-k="${k}">${k === 4 ? '<i>F6</i>' : ''}${n}</b>`).join('');
    await film('6-autopilot', `<style>.rd{position:absolute;right:40px;top:34px;z-index:5;display:flex;gap:8px;font:600 15px Poppins}.rd b{padding:9px 14px;border-radius:999px;background:rgba(8,10,16,.82);border:1px solid rgba(255,255,255,.14);color:#aab0bb;font-weight:600}.rd b.on{border-color:#ffb60e;color:#fff;box-shadow:0 0 24px rgba(255,182,14,.3)}.rd b.done{color:#6f7581}.rd i{font-style:normal;margin-right:8px;padding:1px 6px;border-radius:4px;background:#ffb60e;color:#0b0b0f;font-weight:700}</style>
      <div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}${g(`${ENG}/overlays/fullscreen.html?match=${REPLAY}`)}</div>`, [
      [0.6, M.lock(0.6, 1.04, 1100, 540), 'match ends'],
      [2.0, M.push(2.0, 960, 560, 1.0, 1.07), 'WWCD'],
      [1.9, M.track(1.9, 1.08, 1060, 860, 560), 'results'],
      [1.9, M.pull(1.9, 900, 560, 1.12, 1.0), 'MVP'],
      [1.7, M.tilt(1.7, 1.08, 960, 480, 600), 'standings'],
      [1.9, M.push(1.9, 960, 540, 1.02, 1.08), 'player vs player'],
    ], async (i) => {
      if (i < F(0.6)) await seek(from6 + (i / FPS) * 1000);
      else if (i === F(0.6)) { await seek(wwcdAt + 50); await sleep(120); }
      else if (at[i] && at[i][1] > 0) {
        if (at[i][1] === 1) await patchRoom(REPLAY, { ...last, brPick: { scope: 'match', game: 1 } });
        await action(REPLAY, 'fullscreen.show', { screen: at[i][0], style: 'full' }); await sleep(160);
      }
      const k = steps.reduce((acc, [t], j) => (i >= F(t) ? j : acc), -1);
      await stage.evaluate((k) => document.querySelectorAll('.rd b').forEach((b) => { const j = Number(b.dataset.k); b.className = j === k ? 'on' : j < k ? 'done' : ''; }), k);
    }, { vt: (i) => (i < F(0.6) ? from6 + (i / FPS) * 1000 : wwcdAt + (i / FPS) * 1000), over: `<div class="rd">${chips}</div>${tag('AUTOPILOT')}` });
  }

  // ═════ 7 · Graphics studio, a glimpse: the real editor, full frame; two clicks on the scorebug's colour (40–43 s) ═════
  if (want(7)) {
    const app = await appCtx.newPage(); app.on('pageerror', (e) => errs.push('app: ' + e.message));
    const ui = kit.chrome(app, FONTS);
    await call('chooseGame', ['valorant']);
    await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor();
    await ui.dress();
    await app.locator('nav.rail').getByRole('button', { name: /Graphics studio/ }).click(); await app.waitForTimeout(500);
    await app.getByRole('tab', { name: 'Looks' }).click(); await app.waitForTimeout(500);
    await app.getByLabel('Graphic for a new template').selectOption({ label: 'In-game HUD' });
    await app.getByRole('button', { name: '+ New template' }).click(); await app.waitForTimeout(3000);
    const inspector = app.locator('.tpl-right');
    await app.locator('.tpl-tree [role=option]').filter({ hasText: /^[▸▾]?\s*Scorebug( · \d+)?\s*$/ }).first().click(); await app.waitForTimeout(300);
    await inspector.getByText('Solid', { exact: true }).first().click(); await app.waitForTimeout(300);
    const swatches = inspector.locator('.tpl-color').first().locator('button.sw');
    await swatches.nth(4).scrollIntoViewIfNeeded(); await app.waitForTimeout(300);
    ui.pos = [900, 520]; await ui.place();
    const filmApp = { run: async (_p, count, each) => { for (let k = 0; k < count; k++) { if (each) await each(k); await stepApp(); } } };
    let stepApp = null;
    // One page: the app picture fills the frame; a slight push.
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}</style></head><body><div id="cam"><img id="appimg" style="display:block;width:1920px;height:1080px"></div><div id="over">${tag('GRAPHICS STUDIO')}</div></body></html>`, { waitUntil: 'load' });
    await stage.evaluate(() => document.fonts.ready);
    cuts.push(`${(rec.frames / FPS).toFixed(3)}s  7-studio`);
    const N = F(3), keys = M.push(3, 960, 540, 1.0, 1.04);
    let k = 0;
    stepApp = async () => {
      const b64 = (await src.grab(app)).toString('base64');
      await stage.evaluate(async ([tf, b64]) => { document.getElementById('cam').style.transform = tf; const img = document.getElementById('appimg'); img.src = 'data:image/jpeg;base64,' + b64; await img.decode().catch(() => {}); }, [camAt(keys, k), b64]);
      await rec.frame(stage, null, true); k++;
    };
    await filmApp.run(app, 6);
    await ui.click(filmApp, swatches.nth(4), { frames: 14, after: 22 });
    await ui.click(filmApp, swatches.nth(6), { frames: 10, after: 4 });
    while (k < N) await stepApp();
    if (k > N) console.warn(`7-studio: ${k - N} frames over`);
  }

  // ═════ 8 · Edits landing on air: three graphics, three moves (43–52 s) ═════
  if (want(8)) {
    // a · The Valorant HUD on air: its template re-saved in Air, sent to the room as Air sends it.
    const tplVal = (a) => call('templateSave', [{ id: 'reel-hud', name: 'Reel HUD', graphic: 'hud', parts: a ? { scorebug: { fill: { kind: 'solid', a, alpha: 0.95 } } } : {} }]);
    const sendVal = async () => { const t = await savedTemplate('reel-hud'); await patchRoom(VAL, { airTemplates: [t], airHudTemplate: 'reel-hud' }); };
    await patchRoom(VAL, { ...liveRound(24), teams: teams0, series: series0, rounds: rounds0, players: clone(P0) });
    await tplVal(null); await sendVal();
    const colours = { [F(0.5)]: '#0e7490', [F(1.4)]: '#6d28d9', [F(2.3)]: '#be123c' };
    await film('8a-edit-valorant', `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div>`,
      [[3, M.lock(3, 1.8, 960, 160), 'scorebug recoloured']], async (i) => { if (colours[i]) { await tplVal(colours[i]); await sendVal(); await sleep(140); } }, { over: tag('YOUR LOOK') });

    // b · The PUBG MOBILE HUD rail: the lobby's HUD template, re-saved in Air (lobbyLook publishes it to the lobby room).
    await call('chooseGame', ['pubgm']); await call('lobbySelect', [lobby.id]);
    const tplBr = (parts) => call('templateSave', [{ id: 'reel-brhud', name: 'Reel BR HUD', graphic: 'brhud', parts }]);
    await tplBr({});
    await call('lobbyLook', [lobby.id, { hud: 'rail', templates: { brhud: 'reel-brhud' } }]);
    await call('lobbyTake', [lobby.id, null]);
    const brEdits = {
      [F(0.4)]: { 'rail.title': { label: 'LEAD' } },
      [F(0.6)]: { 'rail.title': { label: 'LEADER' } },
      [F(0.8)]: { 'rail.title': { label: 'LEADERBOARD' } },
      [F(1.5)]: { 'rail.title': { label: 'LEADERBOARD', color: '#ffffff' }, 'rail.head': { fill: { kind: 'solid', a: '#e11d48', alpha: 1 } } },
    };
    await film('8b-edit-pubg', `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${code}`, '', 'hud')}</div>`,
      [[2.5, M.tilt(2.5, 1.7, 1030, 330, 460), 'rail retitled', -640]], async (i) => { if (brEdits[i]) { await tplBr(brEdits[i]); await sleep(160); } });

    // c · Overall standings re-themed for the whole event: sky, jungle, inferno.
    await call('lobbyLook', [lobby.id, { theme: { preset: 'sky', props: { crate: true, chutes: true, side: 'right' } } }]);
    await call('lobbyTake', [lobby.id, 'br-overall']);
    const themes = { [F(1.2)]: 'jungle', [F(2.4)]: 'inferno' };
    await film('8c-retheme', g(`${ENG}/overlays/fullscreen.html?match=${code}`),
      [[3.5, M.track(3.5, 1.1, 820, 1100, 540), 'event re-themed']], async (i) => { if (themes[i]) { await call('lobbyLook', [lobby.id, { theme: { preset: themes[i], props: { crate: true, chutes: true, side: 'right' } } }]); await sleep(180); } });
    await call('lobbyLook', [lobby.id, { theme: { preset: 'sky', props: { crate: true, chutes: true, side: 'right' } } }]);
    await call('lobbyTake', [lobby.id, null]);
  }

  // ═════ 9 · More games coming (52–57 s) ═════
  if (want(9)) {
    const coming = ['apex', 'eafc', 'cs2', 'r6s', 'lol', 'dota2', 'cod', 'fortnite', 'rocket-league', 'tekken8'];
    const car = coming.map((n, i) => `<img src="${POSTER(n)}" style="flex:none;width:300px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:pin .6s ${(0.1 + i * 0.22).toFixed(2)}s cubic-bezier(.2,.8,.2,1) both">`).join('');
    await film('9-coming', `<style>@keyframes pin{0%{opacity:0;transform:translateX(160px)}100%{opacity:1;transform:none}}@keyframes car{0%{transform:translateX(160px)}100%{transform:translateX(-1240px)}}</style>
      <div style="position:absolute;left:0;top:200px;display:flex;gap:40px;animation:car 5s cubic-bezier(.35,.1,.45,1) both">${car}</div>
      <div class="fade" style="--fd:.6s;position:absolute;left:0;right:0;top:780px;text-align:center;font:700 56px Poppins;letter-spacing:-.01em">More games coming</div>`,
    [[5, M.push(5, 960, 540, 1.0, 1.04)]]);
  }

  // ═════ 10 · Logo (57–60 s) ═════
  if (want(10)) await film('10-end', `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="fade" src="${ICON}" style="width:104px;height:104px;border-radius:22px">
      <div style="margin-top:26px;font:700 112px/1 Poppins;letter-spacing:-.02em">${word(0.12)}</div>
      <div class="fade" style="--fd:.9s;margin-top:24px;font:500 28px Poppins;color:#c5c9d2">Broadcast graphics, live from the game.</div></div>`,
  [[3, M.pull(3, 960, 540, 1.06, 1.0)]], null, { over: '<div class="black" style="animation:blk .5s 2.5s linear both"></div>' });

  await browser.close();
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 6).join(' | '));
  fs.writeFileSync(path.join(OUT, 'cuts.txt'), `${cuts.join('\n')}\n${(rec.frames / FPS).toFixed(3)}s  end\n`);
  const t = ONLY.length ? `-only-${ONLY.join('-')}` : '';
  const mp4 = path.join(OUT, `esportra-air-showreel${t}-16x9.mp4`), vert = path.join(OUT, `esportra-air-showreel${t}-9x16.mp4`);
  kit.encode(rec.dir, mp4, ONLY.length ? {} : { vertical: vert });
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(mp4, 0.5), cuts }));
})().catch((e) => { console.error(e); process.exit(1); });
