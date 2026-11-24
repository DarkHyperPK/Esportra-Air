// Esportra Air product showcase reel v3 (24 Nov, approved storyboard): 75 s of motion graphics around Air's real
// graphics, 22 shots on a 128 BPM grid. Almost no app UI: the product is shown through its graphics, the data that
// feeds them (Esportra → Air, the game → Air) and the moments they go live. Every graphic is an Air page in an
// iframe on a stage page; the stage and every iframe are stepped frame by frame (dev/rec-kit.cjs), so all motion
// is exact 30 fps. Every change goes through Air's real path: the Esportra import, veto steps, engine actions (the
// same call a key sends), templates and themes saved through Air, and a PUBG MOBILE game played into Air from the
// stand-in PCOB and replayed exactly as Air wrote it.
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   node dev/showcase.cjs [host] [engine port] <out dir> [--stills]
// Posters and the Esportra icon are read from the Esportra website's own assets (../esportra/public); nothing is copied.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const H = process.argv[2] || 'http://127.0.0.1:5334';
const ENGINE = process.argv[3] || '5396';
const OUT = process.argv[4] || path.join(process.cwd(), 'showcase');
const STILLS = process.argv.includes('--stills');
const ENG = `http://127.0.0.1:${ENGINE}`;
const KEY = 'dev-host-key-0123456789abcdef';
const SITE = process.env.ESPORTRA_SITE || path.join(__dirname, '../../../../esportra/public');
const FPS = kit.FPS, BEAT = kit.BEAT;
const beats = (b) => Math.round(b * BEAT * FPS);
const call = async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
const dev = async (q) => (await fetch(`${H}/dev/pcob?${q}`, { method: 'POST' })).json();
const engine = (p, method = 'GET', body) => fetch(`${ENG}${p}`, { method, headers: { 'X-Esportra-Key': KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const roomState = async (code) => (await (await engine(`/api/${code}`)).json()).state;
const patchRoom = async (code, fields) => { const r = await engine(`/api/${code}`, 'PATCH', fields); if (!r.ok) throw new Error('room patch ' + r.status); };
const action = (room, name, args) => engine('/control/action', 'POST', { match: room, name, args });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataUrl = (file, type = 'image/png') => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
const TAGS = ['NOW', 'CF5', 'IRP', 'DUNE', 'SFX', 'NTD', 'BHB', 'STW', 'RKS', 'LOB', 'WCD', 'GRM', 'FR6', 'ECV', 'QST', 'HGD'];
const COLORS = ['#22d3ee', '#f43f5e', '#ffb60e', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9'];
const LOTUS = `${ENG}/art/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/splash.png`;
const VAL = 'REELVAL';      // a Valorant room seeded with the HUD's own sample match
const REPLAY = 'REELPUBG';  // the recorded PUBG MOBILE game, replayed

// ── the stage: shared look, kinetic type and transitions ──
const CSS = (fonts) => `${fonts}
*{box-sizing:border-box}
@property --n{syntax:'<integer>';inherits:false;initial-value:0}
body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#05060a;color:#fff;font-family:Poppins,system-ui,sans-serif}
.bg{position:absolute;inset:0;background:radial-gradient(90% 80% at 75% 15%,#1a2234 0%,#0a0c13 55%,#05060a 100%)}
.bg::after{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:64px 64px;animation:gridpan 6s linear both}
@keyframes gridpan{to{background-position:0 128px,128px 0}}
#cam{position:absolute;inset:0;transform-origin:50% 50%;animation:cam var(--d,4s) linear both}
@keyframes cam{0%{transform:scale(1.0)}100%{transform:scale(var(--z,1.06))}}
#shot{position:absolute;inset:0;animation:shotin .42s cubic-bezier(.2,.8,.2,1) both}
@keyframes shotin{0%{opacity:0;transform:scale(1.12)}100%{opacity:1;transform:none}}
.whip{animation:whip .38s cubic-bezier(.3,.7,.2,1) both}
@keyframes whip{0%{transform:translateX(18%) skewX(-8deg);opacity:0}100%{transform:none;opacity:1}}
.punch{animation:punch .5s cubic-bezier(.15,.9,.2,1) both}
@keyframes punch{0%{transform:scale(1.25);filter:brightness(2)}100%{transform:none;filter:none}}
.flash{position:absolute;inset:0;background:#fff;animation:flash .3s ease-out both;pointer-events:none}
@keyframes flash{0%{opacity:.85}100%{opacity:0}}
.g{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;background:transparent}
.cap{position:absolute;left:96px;bottom:92px;z-index:20}
.cap.c{left:0;right:0;bottom:auto;top:50%;transform:translateY(-50%);text-align:center}
.k{display:inline-block;padding:8px 14px;background:#ffb60e;color:#0b0b0f;font:800 17px/1 Poppins;letter-spacing:.22em;animation:up .4s cubic-bezier(.2,.8,.2,1) both}
.t{display:block;margin-top:16px;font:800 76px/1.02 Poppins;letter-spacing:-.025em;text-shadow:0 10px 40px rgba(0,0,0,.6);animation:up .55s .08s cubic-bezier(.2,.8,.2,1) both}
.t em{font-style:normal;color:#ffb60e}
.s{display:block;margin-top:14px;font:600 30px Poppins;color:#cfd3dc;animation:up .55s .2s cubic-bezier(.2,.8,.2,1) both}
@keyframes up{0%{opacity:0;transform:translateY(36px)}100%{opacity:1;transform:none}}
.shade{position:absolute;inset:auto 0 0 0;height:480px;background:linear-gradient(0deg,rgba(5,6,10,.92),transparent);z-index:15}
.chip{position:absolute;left:72px;bottom:64px;z-index:20;display:flex;gap:10px;align-items:center;font:700 16px Poppins;letter-spacing:.16em;animation:chip .35s cubic-bezier(.2,.8,.2,1) both}
.chip i{font-style:normal;padding:9px 13px;background:#ffb60e;color:#0b0b0f}
.chip b{padding:9px 15px;background:rgba(6,7,10,.86);border:1px solid rgba(255,255,255,.18)}
@keyframes chip{0%{opacity:0;transform:translateX(-30px)}100%{opacity:1;transform:none}}
.live{position:absolute;right:72px;top:60px;z-index:20;display:flex;gap:10px;align-items:center;font:700 15px Poppins;letter-spacing:.2em;color:#7fe0b8}
.live::before{content:'';width:10px;height:10px;border-radius:50%;background:#34d399;animation:pulse 1s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,.6)}50%{box-shadow:0 0 0 9px rgba(52,211,153,0)}}
.data{position:absolute;inset:-300px 0 0 0;columns:6;column-gap:36px;padding:0 36px;font:500 14px/1.9 ui-monospace,monospace;color:#7fe0b8;opacity:.08;white-space:nowrap;overflow:hidden;animation:drift 20s linear both}
@keyframes drift{to{transform:translateY(-700px)}}
.cnt{--n:0;counter-reset:n var(--n);animation:count 1.1s .15s cubic-bezier(.2,.8,.2,1) both}
.cnt::after{content:counter(n)}
@keyframes count{to{--n:var(--to)}}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const FONTS = kit.fontCss();
  const ICON = dataUrl(path.join(SITE, 'brand/esportra-icon-512.png'));
  const POSTER = (n) => dataUrl(path.join(SITE, `games/${n}-logo.png`));

  // ═════ Off camera: the producer's data, through Air ═════
  await call('chooseGame', ['valorant']); await call('finishOnboarding');
  await call('esportraSignIn', ['producer@example.com', 'correct horse battery']);
  await call('artDownload');
  await call('chooseGame', ['pubgm']); // PUBG MOBILE players have in-game names, not Riot IDs
  for (const [i, n] of NAMES.entries()) await call('saveTeam', [{ name: n, tag: TAGS[i], color: COLORS[i % COLORS.length], logo: '' }]);
  let snap = await call('snapshot');
  for (const t of snap.library.teams) { const i = NAMES.indexOf(t.name); for (const p of ['ACE', 'ROOK', 'VEX', 'KAI']) await call('savePlayer', [{ name: `${TAGS[i]}_${p}`, realName: '', gameId: `${TAGS[i]}_${p}`, photo: '', role: '', teamId: t.id }]); }
  await call('createEvent', ['Air Showcase Cup']);
  snap = await call('snapshot');
  const ev = snap.events.find((e) => e.name === 'Air Showcase Cup');
  await call('eventLicence', [ev.id, 'pubgm', { confirmed: true }]);
  await call('saveSponsor', [ev.id, { name: 'Volt Energy', tier: 'title', logo: '', logoLight: '', line: '' }]);
  await call('lobbyCreate', [{ eventId: ev.id, game: 'pubgm', title: 'Group A · Day 2', games: 6 }]);
  snap = await call('snapshot');
  const lobby = snap.lobbies[0], code = lobby.code;
  await call('lobbyTeams', [lobby.id, NAMES.map((n) => snap.library.teams.find((t) => t.name === n).id)]);
  await call('lobbyUpdate', [lobby.id, { stage: 'Group stage', games: ['Erangel', 'Miramar', 'Sanhok', 'Erangel', 'Vikendi', 'Rondo'].map((map) => ({ map })) }]);
  await call('lobbySelect', [lobby.id]);
  for (let i = 0; i < 120 && !(await call('snapshot')).packs?.some((p) => p.game === 'pubgm' && p.state === 'ready'); i++) await sleep(500);
  for (let i = 0; i < 120 && (await call('snapshot')).art?.have < 279; i++) await sleep(500);

  // A PUBG MOBILE game through Air, recorded as Air writes the lobby room.
  const fake = await dev('do=start&speed=40&length=900');
  await call('pcobConnect', [`127.0.0.1:${fake.port}`, true]);
  await sleep(1500);
  const states = [], lines = [], onAir = [];
  let lastJson = '', recording = true;
  const t0 = Date.now();
  await dev('do=begin');
  const pollRoom = (async () => { while (recording) { const s = await roomState(code); const j = JSON.stringify(s); if (j !== lastJson) { lastJson = j; states.push([Date.now(), s]); } await sleep(100); } })();
  const pollFeed = (async () => {
    const prev = new Map(); let seen = 0;
    while (recording) {
      try {
        const [pl, ki] = await Promise.all(['gettotalplayerlist', 'getkillinfo'].map((r) => fetch(`http://127.0.0.1:${fake.port}/${r}`).then((x) => x.json())));
        for (const p of pl.playerInfoList ?? []) { const o = prev.get(p.playerName); if (o && Number(p.killNum) !== Number(o.killNum)) lines.push(`${p.playerName} killNum ${o.killNum}→${p.killNum}`); if (o && Number(p.liveState) !== Number(o.liveState)) lines.push(`${p.playerName} liveState ${o.liveState}→${p.liveState}`); prev.set(p.playerName, p); }
        for (const k of (ki.killInfo ?? []).slice(seen)) lines.push(`${k.CauserName} ${Number(k.ResultHealthStatus) === 2 ? '✕' : '↓'} ${k.VictimName} t=${k.CurGameTime}`);
        seen = (ki.killInfo ?? []).length;
      } catch { /* between games */ }
      await sleep(250);
    }
  })();
  const pollAir = (async () => { let last = ''; while (recording) { const s = await call('snapshot'); if (s.lobbyOnAir !== last) { last = s.lobbyOnAir; onAir.push([Date.now(), s.lobbyOnAir]); } await sleep(150); } })();
  for (let i = 0; i < 400 && !onAir.some(([, s]) => s === 'br-mvp'); i++) await sleep(250);
  await sleep(2500);
  recording = false; await Promise.all([pollRoom, pollFeed, pollAir]);
  await call('pcobDisconnect');
  const at = (s) => onAir.find(([, x]) => x === s)?.[0];
  const dropAt = at('br-drop'), wwcdAt = at('br-wwcd'), resultsAt = at('br-rankings'), mvpAt = at('br-mvp');
  if (!wwcdAt || !resultsAt) throw new Error('autopilot did not run: ' + JSON.stringify(onAir));
  const outs = states.filter(([, s]) => s.brLive?.lastOut).map(([t, s]) => [t, s.brLive.lastOut.at]);
  const fbAt = states.find(([, s]) => s.brLive?.moment?.kind === 'first.blood')?.[0] ?? t0 + 6000;
  console.log(`recorded ${states.length} states, ${lines.length} data lines, game ${((wwcdAt - t0) / 1000).toFixed(1)} s`);
  await call('lobbyTake', [lobby.id, null]);

  // Valorant: the Esportra import (Air's own path), and a room seeded with the HUD's sample match for the keys.
  await call('chooseGame', ['valorant']);
  for (let i = 0; i < 20 && (await call('snapshot')).esportra.state !== 'online'; i++) { await call('esportraCheck').catch(() => {}); await call('esportraRefresh').catch(() => {}); await sleep(500); }
  snap = await call('snapshot');
  const remote = snap.esportra.matches.find((m) => m.teamA === 'Vanguard Esports') ?? snap.esportra.matches[0];
  await call('useEsportraMatch', [remote.id]);
  for (let i = 0; i < 40 && !(await call('snapshot')).match; i++) await sleep(250);
  snap = await call('snapshot');
  const vmatch = snap.match;
  const players = (vmatch.players ?? []).flat().map((p) => p.gameId || p.name).filter(Boolean);
  const pool = (snap.matchData?.pool?.length ? snap.matchData.pool : ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset', 'Abyss']);
  await call('vetoReset').catch(() => {});

  // ═════ Browser, stage, recorder ═════
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await kit.prepare(ctx);
  // The fake Esportra's logo address points nowhere: a clean logo for it, in this browser only.
  const lp = await ctx.newPage();
  await lp.setContent(`<html><body style="margin:0;background:transparent"><svg id="l" width="256" height="256" viewBox="0 0 64 64"><path d="M32 3l26 15v28L32 61 6 46V18z" fill="#14b8a6"/><path d="M19 20h8l5 15 5-15h8L35 46h-6z" fill="#fff"/></svg></body></html>`);
  const logo = await lp.locator('#l').screenshot({ omitBackground: true }); await lp.close();
  await ctx.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: logo }));
  // The Valorant sample room: the HUD's own sample state (core/state.default.js), as a sample room gets it.
  const sp = await ctx.newPage(); await sp.goto(`${ENG}/overlays/ingame.html?preview=1`);
  await sp.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 });
  const sample = await sp.evaluate(() => JSON.parse(JSON.stringify(typeof HUD_DEFAULT !== 'undefined' ? HUD_DEFAULT : window.HUD_DEFAULT)));
  await sp.close();
  await patchRoom(VAL, sample);
  await patchRoom(REPLAY, states[0][1]);
  const wall = states[0][1].airPack?.wallpaper?.[1] || states[0][1].airPack?.wallpaper?.[0] || '';
  const walls = states[0][1].airPack?.wallpaper ?? [];

  const stage = await ctx.newPage();
  const errs = []; stage.on('pageerror', (e) => errs.push(e.message));
  const rec = kit.recorder(path.join(OUT, STILLS ? 'stills-raw' : 'frames'));
  const board = []; const cuts = [];
  /** Sets up a shot (off camera), waits for its graphics, then records `count` frames; `each(i)` runs before each. */
  async function shot(name, html, count, each, opts = {}) {
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}</style></head><body><div class="bg"></div><div id="cam" style="--d:${(count / FPS).toFixed(2)}s;--z:${opts.zoom ?? 1.06}"><div id="shot">${html}</div></div></body></html>`, { waitUntil: 'load' });
    for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
    await stage.evaluate(() => document.fonts.ready);
    if (opts.ready) await opts.ready();
    await sleep(350);
    cuts.push(`${(rec.frames / FPS).toFixed(3)}s  beat ${Math.round(rec.frames / FPS / BEAT)}  ${name}`);
    const key = Math.floor(count * (opts.key ?? 0.62));
    for (let i = 0; i < count; i++) {
      if (each) await each(i);
      const shoot = !STILLS || i === key;
      await rec.frame(stage, opts.vt ? opts.vt(i) : null, shoot);
      if (STILLS && i === key) board.push([name, path.join(rec.dir, String(rec.frames - 1).padStart(6, '0') + '.jpg')]);
    }
  }
  const g = (src, style = '') => `<iframe class="g" src="${src}" style="${style}"></iframe>`;
  const val = (n) => `${ENG}/overlays/${n}.html?preview=1`;
  const br = (n) => `${ENG}/overlays/${n}.html?match=${code}`;
  const cap = (k, t, s = '', c = false) => `<div class="cap ${c ? 'c' : ''}">${k ? `<span class="k">${k}</span>` : ''}${t ? `<span class="t">${t}</span>` : ''}${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const chip = (a, b) => `<div class="chip"><i>${a}</i><b>${b}</b></div>`;
  const dataLayer = (n = 220, from = 0) => `<div class="data">${lines.slice(from, from + n).map((l) => `<div>${l.replace(/</g, '')}</div>`).join('')}</div>`;
  /** One graphic full frame, punched in, with its name chip. */
  const full = (src, a, b, back) => `<div class="punch" style="position:absolute;inset:0;${back ? `background:#000 url('${back}') center/cover` : ''}">${g(src)}</div><div class="shade" style="height:300px"></div>${chip(a, b)}`;
  // Replay: the room gets Air's recorded state for wall time w; pages' clocks are pinned to w.
  let patched = -1;
  const seek = async (w) => { let i = patched; while (i + 1 < states.length && states[i + 1][0] <= w) i++; if (i !== patched && i >= 0) { await patchRoom(REPLAY, states[i][1]); patched = i; await sleep(60); } };
  const resetReplay = async (w) => { patched = -1; await seek(w); };

  // ═════ ACT 0 · OPEN ═════
  const flashes = [[val('agent-select')], [br('br-wwcd')], [val('map-result')], [br('br-champion')]];
  for (const [i, [src]] of flashes.entries()) await shot(`1-flash-${i}`, `<div class="punch" style="position:absolute;inset:0">${g(src)}</div><div class="flash"></div>`, beats(1), null, { zoom: 1.08 });
  const word = 'ESPORTRA AIR'.split('').map((c, i) => `<span style="display:inline-block;animation:up .5s ${0.25 + i * 0.045}s cubic-bezier(.2,.8,.2,1) both;${i > 8 ? 'color:#ffb60e' : ''}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  const rays = Array.from({ length: 14 }, (_, i) => { const y = 80 + i * 70, from = i % 2 ? -200 : 2120; return `<path d="M${from} ${y} Q 960 ${540 + (y - 540) * 0.2} 960 540" stroke="${i % 3 ? '#3b82f6' : '#ffb60e'}" stroke-width="2" fill="none" stroke-dasharray="2400" style="animation:ray 1s ${i * 0.03}s cubic-bezier(.6,0,.3,1) both;opacity:.55"/>`; }).join('');
  await shot('2-wordmark', `<svg width="1920" height="1080" style="position:absolute;inset:0"><style>@keyframes ray{0%{stroke-dashoffset:2400}100%{stroke-dashoffset:0;opacity:0}}</style>${rays}</svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img src="${ICON}" style="width:120px;height:120px;border-radius:26px;animation:punch .6s .2s cubic-bezier(.15,.9,.2,1) both">
      <div style="margin-top:28px;font:800 150px/1 Poppins;letter-spacing:-.03em">${word}</div>
      <div class="s" style="font-size:36px;margin-top:26px;animation-delay:.9s">Broadcast graphics, live from the game.</div></div>`, beats(8), null, { zoom: 1.08 });

  // ═════ ACT 1 · ESPORTRA → AIR ═════
  const packets = [vmatch.teams?.[0]?.name, vmatch.teams?.[1]?.name, `Best of ${vmatch.bestOf ?? 3}`, ...players.slice(0, 6), ...pool.slice(0, 4), 'Bracket', 'Schedule'].filter(Boolean);
  const pk = packets.map((p, i) => { const y = 380 + ((i * 97) % 340); return `<div style="position:absolute;left:0;top:0;offset-path:path('M 520 ${y} C 860 ${y - 260}, 1060 ${y + 260}, 1400 540');offset-rotate:0deg;padding:8px 14px;border-radius:999px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.6);color:#bff5dd;font:600 18px Poppins;white-space:nowrap;box-shadow:0 0 24px rgba(52,211,153,.35);animation:fly 1.5s ${0.5 + i * 0.16}s cubic-bezier(.5,0,.3,1) both">${p}</div>`; }).join('');
  await shot('3-dataflow', `<style>@keyframes fly{0%{offset-distance:0%;opacity:0}12%{opacity:1}88%{opacity:1}100%{offset-distance:100%;opacity:0}}@keyframes ring{0%{transform:scale(.6);opacity:0}100%{transform:none;opacity:1}}@keyframes glow{0%,100%{box-shadow:0 0 40px rgba(255,182,14,.3)}50%{box-shadow:0 0 90px rgba(255,182,14,.7)}}</style>
    <div style="position:absolute;left:150px;top:300px;width:400px;padding:28px;border-radius:18px;background:#10131c;border:1px solid rgba(255,255,255,.12);animation:whip .5s .1s both">
      <div style="display:flex;gap:16px;align-items:center"><img src="${ICON}" style="width:64px;height:64px;border-radius:14px"><div><div style="font:800 15px Poppins;letter-spacing:.2em;color:#ffb60e">ESPORTRA</div><div style="font:800 30px Poppins">Community Cup</div></div></div>
      <div style="margin-top:22px;font:700 24px Poppins">${vmatch.teams?.[0]?.name ?? ''} <span style="color:#8b8f99">vs</span> ${vmatch.teams?.[1]?.name ?? ''}</div>
      <div style="margin-top:8px;font:500 18px Poppins;color:#9aa0ab">Best of ${vmatch.bestOf ?? 3} · ${players.length} players · veto · bracket</div></div>
    <div style="position:absolute;left:1400px;top:390px;width:300px;height:300px;border-radius:50%;display:grid;place-items:center;border:2px solid #ffb60e;animation:ring .5s .2s both,glow 1.4s 1s ease-in-out infinite"><div style="font:800 64px Poppins;letter-spacing:-.02em">AIR</div></div>
    ${pk}${cap('ESPORTRA × AIR', 'Your tournament, <em>straight in</em>')}`, beats(8), null, { zoom: 1.05 });

  const vroom = vmatch.code;
  const order = [{ i: 0 }, { i: 1 }, { i: 2, side: 'ATK' }, { i: 3, side: 'DEF' }, { i: 4 }, { i: 5 }, { i: 6, side: 'ATK' }];
  let vetoDone = 0;
  await shot('4-intro', `<div class="punch" style="position:absolute;inset:0">${g(`${ENG}/overlays/match-intro.html?match=${vroom}`)}</div><div class="shade"></div>${cap('IMPORTED FROM ESPORTRA', 'Teams, players, veto.')}`, beats(4), null, { zoom: 1.05 });
  await shot('4-veto', `<div class="whip" style="position:absolute;inset:0">${g(`${ENG}/overlays/map-veto.html?match=${vroom}`)}</div><div class="shade"></div>${cap('', '<em>No spreadsheets.</em>')}`, beats(4), async (i) => {
    // A veto step entered through Air every few frames: each one morphs onto the graphic.
    if (i % 7 === 3 && vetoDone < order.length && pool[order[vetoDone].i]) { const o = order[vetoDone++]; await call('vetoStep', [{ map: pool[o.i], ...(o.side ? { side: o.side } : {}) }]).catch(() => {}); await sleep(120); }
  }, { zoom: 1.05 });
  await shot('5-standalone', `<div style="position:absolute;inset:-60px;filter:blur(18px) brightness(.45)">${g(`${ENG}/overlays/map-veto.html?match=${vroom}`)}</div>${cap('', 'No tournament?<br><em>Start a match in seconds.</em>', '', true)}`, beats(4), null, { zoom: 1.1 });

  // ═════ ACT 2 · VALORANT ═════
  const titleCard = (poster, name, n, sub) => `<style>@keyframes slam{0%{transform:translateY(-60px) rotate(-8deg) scale(1.3);opacity:0}100%{transform:rotate(-4deg);opacity:1}}</style>
    <img src="${poster}" style="position:absolute;left:1180px;top:150px;width:520px;border-radius:16px;box-shadow:0 40px 120px rgba(0,0,0,.7);animation:slam .55s cubic-bezier(.2,.9,.2,1.1) both">
    <div class="cap" style="bottom:auto;top:340px"><span class="k">${name}</span><span class="t" style="font-size:180px;line-height:.9"><span class="cnt" style="--to:${n}"></span>${sub[0]}</span><span class="s">${sub[1]}</span></div>`;
  await shot('6-valorant', titleCard(POSTER('valorant'), 'VALORANT', 45, ['+', 'broadcast graphics']), beats(4), null, { zoom: 1.06 });
  const wallSet = ['ingame', 'match-intro', 'map-veto', 'agent-select', 'scoreboard', 'map-result', 'postgame-player', 'postgame-matchup', 'map-breakdown', 'team-compare', 'standings', 'player-profile'];
  const tiles = wallSet.map((n, i) => `<div style="position:absolute;left:${(i % 4) * 500}px;top:${Math.floor(i / 4) * 300}px;width:480px;height:270px;overflow:hidden;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6);background:#000 ${n === 'ingame' ? `url('${LOTUS}') center/cover` : ''};animation:up .5s ${i * 0.05}s both">${g(val(n), 'transform:scale(.25)')}</div>`).join('');
  await shot('7-wall', `<style>@keyframes dolly{0%{transform:perspective(2200px) rotateX(18deg) rotateZ(-6deg) translate(-120px,-40px) scale(.95)}100%{transform:perspective(2200px) rotateX(18deg) rotateZ(-6deg) translate(-520px,-200px) scale(1.15)}}</style>
    <div style="position:absolute;left:120px;top:140px;width:2000px;height:900px;animation:dolly ${(beats(8) / FPS).toFixed(2)}s linear both">${tiles}</div>`, beats(8), null, { zoom: 1.02 });
  const hero = [['ingame', 'IN-GAME HUD', LOTUS], ['match-intro', 'MATCH INTRO'], ['map-veto', 'MAP VETO'], ['agent-select', 'AGENT SELECT'], ['scoreboard', 'SCOREBOARD', LOTUS], ['map-result', 'MAP RESULT'], ['postgame-player', 'TOP FRAGGER'], ['postgame-matchup', 'MATCHUP'], ['map-breakdown', 'MAP BREAKDOWN'], ['team-compare', 'TEAM COMPARE'], ['standings', 'STANDINGS'], ['player-profile', 'PLAYER PROFILE']];
  for (const [n, name, back] of hero) await shot(`8-${n}`, full(val(n), 'VALORANT', name, back), beats(1), null, { zoom: 1.08 });
  // Live at a keypress: the key's own action (fullscreen.show, as Air sends it) on a room over the game.
  await action(VAL, 'fullscreen.show', { screen: null, style: 'band' });
  const key = (k, d) => `<div style="position:absolute;right:140px;bottom:150px;width:150px;height:150px;border-radius:22px;background:linear-gradient(#2b2f3a,#161922);border:2px solid #3a3f4c;box-shadow:0 14px 0 #0c0e13,0 30px 60px rgba(0,0,0,.6);display:grid;place-items:center;font:800 54px Poppins;animation:press .5s ${d}s both"><span>${k}</span><i style="position:absolute;inset:-10px;border-radius:30px;border:3px solid #ffb60e;animation:ripple .6s ${d + 0.08}s ease-out both;opacity:0"></i></div>`;
  await shot('9-keys', `<style>@keyframes press{0%,40%{transform:translateY(0)}55%{transform:translateY(12px);box-shadow:0 2px 0 #0c0e13,0 10px 20px rgba(0,0,0,.6)}100%{transform:translateY(0)}}@keyframes ripple{0%{opacity:1;transform:scale(.8)}100%{opacity:0;transform:scale(1.6)}}</style>
    <div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}${g(`${ENG}/overlays/fullscreen.html?match=${VAL}&over=1`)}</div>
    <div id="k1" style="position:absolute;inset:0">${key('F3', 0.2)}</div><div id="k2" style="position:absolute;inset:0;display:none">${key('F5', 0.1)}</div>
    <div class="cap" style="bottom:auto;top:330px;left:auto;right:330px;text-align:right;padding:22px 28px;background:rgba(5,6,10,.78);border-radius:14px"><span class="k">ONE KEY</span><span class="t" style="font-size:72px">Go <em>live</em></span></div>`, beats(8), async (i) => {
    if (i === 12) await action(VAL, 'fullscreen.show', { screen: 'player-profile', style: 'band' });
    if (i === Math.round(beats(4))) { await stage.evaluate(() => { document.getElementById('k1').style.display = 'none'; document.getElementById('k2').style.display = ''; }); await action(VAL, 'fullscreen.show', { screen: null, style: 'band' }); }
    if (i === Math.round(beats(4)) + 10) await action(VAL, 'fullscreen.show', { screen: 'map-result', style: 'band' });
    if ([12, beats(4) + 10].includes(i)) await sleep(150);
  }, { zoom: 1.04 });

  // ═════ ACT 3 · PUBG MOBILE ═════
  await shot('10-pubg', titleCard(POSTER('pubg'), 'PUBG MOBILE', 24, [' graphics', '16-team lobbies, every screen covered']), beats(4), null, { zoom: 1.06 });
  const mid = fbAt - 400;
  await resetReplay(mid);
  const hud = `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}</div>${dataLayer(240)}<div class="live">LIVE FROM THE GAME</div><div class="cap" style="bottom:auto;top:56px"><span class="t" style="margin:0;font-size:68px">Live <em>from the game</em></span></div>`;
  const n11 = beats(8);
  await shot('11-live', hud, n11, async (i) => {
    const w = mid + (i / FPS) * 1000 * 2.2;
    await seek(w);
    if (i === Math.round(n11 * 0.55)) await patchRoom(REPLAY, { layout: { brHud: 'grid' } });
    if (i === Math.round(n11 * 0.8)) await patchRoom(REPLAY, { layout: { brHud: 'strip' }, brPopup: true });
  }, { zoom: 1.04, vt: (i) => mid + (i / FPS) * 1000 * 2.2 });
  await patchRoom(REPLAY, { layout: { brHud: 'rail' }, brPopup: false });
  const brSet = [['br-lobby', 'STARTING SOON'], ['br-today', "TODAY'S MATCHES"], ['br-teams', 'TEAMS IN THIS LOBBY'], ['br-drop', 'DROP MAP'], ['br-rankings', 'MATCH RESULTS'], ['br-overall', 'OVERALL STANDINGS'], ['br-wwcd', 'WWCD'], ['br-mvp', 'MATCH MVP'], ['br-fraggers', 'TOP FRAGGERS'], ['br-tom', 'TEAM OF THE MATCH'], ['br-profile', 'PLAYER PROFILE'], ['br-mstats', 'MATCH STATS'], ['br-champion', 'CHAMPIONS']];
  const per = beats(16) / brSet.length;
  for (const [k, [n, name]] of brSet.entries()) await shot(`12-${n}`, full(br(n), 'PUBG MOBILE', name), Math.round(per * (k + 1)) - Math.round(per * k), null, { zoom: 1.08 });
  const moments = [['first.blood', 'FIRST BLOOD'], ['kill.leader', 'KILL LEADER'], ['zone', 'ZONE CLOSING'], ['final.teams', 'FINAL 4'], ['match.point', 'MATCH POINT'], ['ltf', 'LIVE TOP FRAGGERS']];
  const mt = moments.map(([m, name], i) => { const q = m === 'ltf' ? '&mode=rail&ltf=1' : `&mode=rail&moment=${m}`; const crop = m === 'ltf' ? 'left:0px;top:-730px' : 'left:-680px;top:-150px'; return `<div style="position:absolute;left:${60 + (i % 3) * 610}px;top:${170 + Math.floor(i / 3) * 440}px;width:580px;height:400px;overflow:hidden;border-radius:12px;background:#000 url('${ENG}${walls[(i + 2) % Math.max(1, walls.length)] ?? wall}') center/cover;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:up .45s ${i * 0.12}s both"><div style="position:absolute;${crop};width:1920px;height:1080px">${g(`${ENG}/overlays/br-hud.html?preview=1${q}`, 'transform:none')}</div><div style="position:absolute;left:14px;bottom:12px;font:800 14px Poppins;letter-spacing:.16em;padding:6px 10px;background:#ffb60e;color:#0b0b0f">${name}</div></div>`; }).join('');
  await shot('13-moments', `${mt}<div class="cap" style="bottom:auto;top:56px"><span class="t" style="font-size:56px;margin:0">Moments <em>fire themselves</em></span></div>`, beats(8), null, {
    zoom: 1.03,
    // Preview pages always show the sample Team eliminated banner: hide it in these tiles so each shows its own moment.
    ready: async () => { for (const f of stage.frames().slice(1)) await f.evaluate(() => { const st = document.createElement('style'); st.textContent = '.brh-elim{display:none!important}'; document.head.appendChild(st); }).catch(() => {}); },
  });

  // ═════ ACT 4 · AUTOPILOT ═════
  // The lobby's Standard Rundown (src/shared/br-rundown.ts presetRows('standard'), BR_WHEN_NAME), as a track.
  const rows = [['Plane takes off', 'Drop map'], ['Match ends', 'WWCD'], ['then', 'Match results'], ['then', 'Match MVP'], ['then', 'Overall standings'], ['then', 'Starting soon']];
  const track = (lit) => rows.map(([w, s], i) => `<div class="rc" data-i="${i}" style="flex:none;width:262px;padding:26px 22px;border-radius:16px;background:${lit ? '#10131c' : '#10131c'};border:2px solid rgba(255,255,255,.12);animation:up .4s ${i * 0.08}s both"><div style="font:700 15px Poppins;letter-spacing:.16em;color:#8b8f99;text-transform:uppercase">${w}</div><div style="font:800 32px/1.1 Poppins;margin-top:10px">${s}</div></div>`).join('<div style="flex:none;width:30px;height:2px;background:rgba(255,255,255,.25);align-self:center"></div>');
  await shot('14-rundown', `<style>.rc.on{border-color:#ffb60e!important;box-shadow:0 0 40px rgba(255,182,14,.45)}@keyframes sweep{0%{left:80px}100%{left:1820px}}@keyframes pulseup{0%{transform:translateY(160px);opacity:0}30%{opacity:1}100%{transform:translateY(0);opacity:0}}</style>
    ${dataLayer(160, 200)}<div style="position:absolute;left:50px;right:50px;top:420px;display:flex;align-items:stretch;justify-content:center">${track()}</div>
    <div style="position:absolute;top:390px;width:4px;height:230px;background:#ffb60e;box-shadow:0 0 20px #ffb60e;animation:sweep ${(beats(8) / FPS).toFixed(2)}s linear both"></div>
    <div style="position:absolute;left:330px;top:640px;font:600 18px ui-monospace,monospace;color:#7fe0b8;animation:pulseup 1s .9s both">rank 1 · WWCD</div>
    ${cap('AUTOPILOT', 'Set it <em>once.</em>')}`, beats(8), async (i) => {
    const lit = Math.floor((i / beats(8)) * rows.length * 1.1);
    await stage.evaluate((lit) => document.querySelectorAll('.rc').forEach((e, k) => e.classList.toggle('on', k <= lit)), lit);
  }, { zoom: 1.04 });
  const n15 = beats(16), c1 = beats(6), c2 = beats(11);
  const map15 = (i) => i < c1 ? dropAt - 300 + ((wwcdAt - 700 - (dropAt - 300)) * i) / c1 : i < c2 ? wwcdAt + ((i - c1) / FPS) * 1000 : resultsAt + ((i - c2) / FPS) * 1000 * 1.6;
  await resetReplay(map15(0));
  const steps = [['br-drop', 'Drop map'], ['br-wwcd', 'WWCD'], ['br-rankings', 'Match results'], ['br-mvp', 'Match MVP']];
  await shot('15-autopilot', `<style>.ac{padding:14px 18px;border-radius:12px;background:#10131c;border:2px solid rgba(255,255,255,.1);font:800 24px Poppins;margin-bottom:14px;transition:none}.ac.on{border-color:#ffb60e;box-shadow:0 0 36px rgba(255,182,14,.4)}.ac small{display:block;font:700 12px Poppins;letter-spacing:.16em;color:#8b8f99}</style>
    ${dataLayer(160, 300)}<div style="position:absolute;left:80px;top:250px;width:330px">${steps.map(([s, n]) => `<div class="ac" data-s="${s}"><small>AUTO</small>${n}</div>`).join('')}</div>
    <div style="position:absolute;left:470px;top:150px;width:1370px;height:771px;overflow:hidden;border-radius:12px;box-shadow:0 30px 100px rgba(0,0,0,.6);background:#000 url('${ENG}${wall}') center/cover"><div style="position:absolute;inset:0;transform:scale(.7135);transform-origin:0 0;width:1920px;height:1080px">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}${g(`${ENG}/overlays/fullscreen.html?match=${REPLAY}`)}</div></div>
    <div style="position:absolute;left:80px;top:700px;font:700 14px Poppins;letter-spacing:.2em;color:#8b8f99">PRODUCER CLICKS</div><div style="position:absolute;left:80px;top:724px;font:800 96px Poppins;color:#34d399">0</div>
    <div class="cap" style="bottom:auto;top:56px"><span class="t" style="font-size:60px;margin:0">It <em>runs the show.</em></span></div>`, n15, async (i) => {
    const w = map15(i); await seek(w);
    const a = [...onAir].reverse().find(([t]) => t <= w)?.[1];
    await stage.evaluate((a) => document.querySelectorAll('.ac').forEach((e) => e.classList.toggle('on', e.dataset.s === a)), a ?? '');
  }, { zoom: 1.03, vt: map15 });

  // ═════ ACT 5 · EDIT ANYTHING (through Air's templates and themes) ═════
  await call('chooseGame', ['pubgm']);
  const tplId = 'points-race';
  await call('templateSave', [{ id: tplId, name: 'Points race', graphic: 'br-overall|full', parts: {} }]);
  const saveTpl = (parts) => call('templateSave', [{ id: tplId, name: 'Points race', graphic: 'br-overall|full', parts }]);
  await call('lobbyLook', [lobby.id, { templates: { 'br-overall|full': tplId } }]);
  await call('lobbyTake', [lobby.id, 'br-overall']);
  const titleRect = async () => { const f = stage.frames()[1]; return f ? f.evaluate(() => { const r = document.querySelector('.b6-hd h1')?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height] : null; }).catch(() => null) : null; };
  const handles = `<div id="sel" style="position:absolute;border:2px solid #38bdf8;box-shadow:0 0 0 9999px rgba(0,0,0,.18);z-index:12;display:none"><i style="position:absolute;left:-7px;top:-7px;width:12px;height:12px;background:#fff;border:2px solid #38bdf8"></i><i style="position:absolute;right:-7px;top:-7px;width:12px;height:12px;background:#fff;border:2px solid #38bdf8"></i><i style="position:absolute;left:-7px;bottom:-7px;width:12px;height:12px;background:#fff;border:2px solid #38bdf8"></i><i style="position:absolute;right:-7px;bottom:-7px;width:12px;height:12px;background:#fff;border:2px solid #38bdf8"></i></div>`;
  const placeSel = async () => { const r = await titleRect(); if (r) await stage.evaluate((r) => { const s = document.getElementById('sel'); s.style.display = ''; Object.assign(s.style, { left: r[0] - 10 + 'px', top: r[1] - 8 + 'px', width: r[2] + 20 + 'px', height: r[3] + 16 + 'px' }); }, r); };
  const word2 = 'POINTS RACE';
  await shot('16-edit-text', `<div style="position:absolute;inset:0">${g(`${ENG}/overlays/fullscreen.html?match=${code}`)}</div>${handles}<div class="shade" style="height:300px"></div>${cap('EDIT', 'Edit <em>any text</em>')}`, beats(6), async (i) => {
    const n = Math.min(word2.length, Math.max(0, Math.floor((i - 10) / 3)));
    if (i >= 10 && (i - 10) % 3 === 0 && n <= word2.length) { await saveTpl({ 'header.title': { label: word2.slice(0, Math.max(1, n)) } }); await sleep(90); }
    if (i % 4 === 0) await placeSel();
  }, { zoom: 1.05 });
  const dots = ['#ffb60e', '#2dd4bf', '#f43f5e'];
  await shot('17-edit-colour', `<div style="position:absolute;inset:0">${g(`${ENG}/overlays/fullscreen.html?match=${code}`)}</div>${handles}
    <div style="position:absolute;right:96px;top:70px;display:flex;gap:18px;z-index:20">${dots.map((c, k) => `<b class="dot" data-k="${k}" style="width:54px;height:54px;border-radius:50%;background:${c};border:4px solid rgba(255,255,255,.2);animation:up .4s ${k * 0.08}s both"></b>`).join('')}</div>
    <style>.dot.on{border-color:#fff!important;transform:scale(1.2)}</style><div class="shade" style="height:300px"></div>${cap('EDIT', 'Edit <em>any colour</em>')}`, beats(6), async (i) => {
    const k = Math.floor((i / beats(6)) * 3);
    if (i % Math.ceil(beats(6) / 3) === 4) { await saveTpl({ 'header.title': { label: word2, color: dots[k] }, 'table.fill': { fill: { kind: 'solid', a: dots[k] } } }).catch(async () => saveTpl({ 'header.title': { label: word2, color: dots[k] } })); await sleep(90); }
    await stage.evaluate((k) => document.querySelectorAll('.dot').forEach((d, j) => d.classList.toggle('on', j === k)), k);
    if (i % 5 === 0) await placeSel();
  }, { zoom: 1.05 });
  await call('lobbyTake', [lobby.id, 'br-wwcd']);
  await patchRoom(VAL, { airBrand: { primary: '#22d3ee' } }).catch(() => {});
  const half = beats(6);
  await shot('18-edit-art', `<div style="position:absolute;left:0;top:0;width:960px;height:1080px;overflow:hidden"><div style="position:absolute;left:-480px;top:0;width:1920px;height:1080px">${g(`${ENG}/overlays/fullscreen.html?match=${code}`)}</div></div>
    <div style="position:absolute;left:960px;top:0;width:960px;height:1080px;overflow:hidden;background:#000 url('${LOTUS}') center/cover"><div style="position:absolute;left:-560px;top:0;width:1920px;height:1080px">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div></div>
    <div style="position:absolute;left:957px;top:0;width:6px;height:1080px;background:#ffb60e;box-shadow:0 0 24px #ffb60e;z-index:5"></div>
    <div class="shade" style="height:300px"></div>${cap('EDIT', 'Swap in <em>official art</em>', 'Your brand on every game')}`, half, async (i) => {
    const step = Math.floor(i / (half / 3));
    if (i % Math.ceil(half / 3) === 2 && walls.length > 1) { await call('lobbyLook', [lobby.id, { theme: { preset: 'sky', background: walls[(step + 2) % walls.length], props: { crate: true, chutes: true, side: 'right' } } }]).catch(() => {}); await patchRoom(VAL, { airBrand: { primary: ['#22d3ee', '#f43f5e', '#a78bfa'][step % 3], accent: ['#22d3ee', '#f43f5e', '#a78bfa'][step % 3] } }).catch(() => {}); await sleep(100); }
  }, { zoom: 1.04 });
  await call('lobbyLook', [lobby.id, { theme: { preset: 'sky', props: { crate: true, chutes: true, side: 'right' } } }]);
  const tri = ['br-wwcd', 'br-overall', 'br-lobby'].map((n, k) => `<div style="position:absolute;left:${60 + k * 610}px;top:250px;width:580px;height:326px;overflow:hidden;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.6);animation:up .45s ${k * 0.1}s both"><div style="position:absolute;inset:0;transform:scale(.302);transform-origin:0 0;width:1920px;height:1080px">${g(br(n))}</div><div class="wipe" style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);transform:translateX(-120%)"></div></div>`).join('');
  const n19 = beats(6);
  await shot('19-retheme', `<style>@keyframes wipe{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}.wipe.go{animation:wipe .45s ease-in-out both}</style>${tri}
    <div style="position:absolute;left:60px;top:620px;display:flex;gap:14px" id="pr">${['SKY', 'JUNGLE', 'INFERNO'].map((p, k) => `<b data-k="${k}" style="padding:12px 22px;border-radius:999px;border:2px solid rgba(255,255,255,.2);font:800 18px Poppins;letter-spacing:.14em">${p}</b>`).join('')}</div>
    <style>#pr b.on{background:#ffb60e;color:#0b0b0f;border-color:#ffb60e}</style>${cap('EDIT', 'Re-theme the <em>whole event</em>')}`, n19, async (i) => {
    const k = Math.min(2, Math.floor(i / (n19 / 3)));
    if (i === Math.round(n19 / 3) || i === Math.round((2 * n19) / 3)) {
      await call('lobbyLook', [lobby.id, { theme: { preset: ['sky', 'jungle', 'inferno'][k], props: { crate: true, chutes: true, side: 'right' } } }]);
      await stage.evaluate(() => document.querySelectorAll('.wipe').forEach((w) => { w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); }));
      await sleep(120);
    }
    await stage.evaluate((k) => document.querySelectorAll('#pr b').forEach((b, j) => b.classList.toggle('on', j === k)), k);
  }, { zoom: 1.04 });

  // ═════ ACT 6 · MORE GAMES ═════
  await shot('20-today', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:60px">
      <img src="${POSTER('valorant')}" style="width:330px;border-radius:14px;box-shadow:0 30px 90px rgba(0,0,0,.7);animation:punch .5s both">
      <img src="${POSTER('pubg')}" style="width:330px;border-radius:14px;box-shadow:0 30px 90px rgba(0,0,0,.7);animation:punch .5s .12s both">
</div>
    <div class="cap" style="bottom:60px"><span class="k">LIVE TODAY</span><span class="t" style="font-size:64px">Valorant and <em>PUBG MOBILE</em></span></div>`, beats(4), null, { zoom: 1.06 });
  const coming = ['apex', 'eafc', 'cs2', 'r6s', 'lol', 'dota2', 'cod', 'fortnite', 'rocket-league', 'tekken8'];
  const car = coming.map((n) => `<img src="${POSTER(n)}" style="flex:none;width:300px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.7)">`).join('');
  await shot('21-coming', `<style>@keyframes car{0%{transform:perspective(2000px) rotateY(-14deg) translateX(400px)}100%{transform:perspective(2000px) rotateY(-14deg) translateX(-1900px)}}</style>
    <div style="position:absolute;left:0;top:250px;display:flex;gap:34px;animation:car ${(beats(4) / FPS).toFixed(2)}s linear both">${car}</div>
    <div class="cap" style="bottom:60px"><span class="k">MORE GAMES</span><span class="t" style="font-size:64px">More games <em>coming</em></span></div>`, beats(4), null, { zoom: 1.03 });
  await shot('22-end', `<div style="position:absolute;inset:0;display:flex;opacity:.18;filter:blur(6px)">${coming.slice(0, 7).map((n) => `<img src="${POSTER(n)}" style="height:100%">`).join('')}</div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><img src="${ICON}" style="width:110px;border-radius:24px;animation:punch .5s both">
    <div style="margin-top:24px;font:800 140px/1 Poppins;letter-spacing:-.03em">${word}</div><div class="s" style="font-size:34px;margin-top:22px;animation-delay:.6s">Broadcast graphics, live from the game.</div></div>`, beats(4), null, { zoom: 1.05 });
  await browser.close();
  if (errs.length) console.warn('stage errors: ' + [...new Set(errs)].slice(0, 6).join(' | '));

  if (STILLS) {
    // One key frame per shot, labelled, as a contact sheet.
    const dir = path.join(OUT, 'stills'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    board.forEach(([n, f], k) => fs.copyFileSync(f, path.join(dir, String(k).padStart(3, '0') + '.jpg')));
    const { execFileSync } = require('node:child_process');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', 'scale=640:-1,tile=7x7:padding=8:color=0x05060a', '-frames:v', '1', path.join(OUT, 'stills-board.jpg')]);
    fs.writeFileSync(path.join(OUT, 'stills.txt'), board.map(([n], k) => `${k}  ${n}`).join('\n') + '\n');
    console.log(JSON.stringify({ stills: board.length, board: path.join(OUT, 'stills-board.jpg') }));
    return;
  }
  fs.writeFileSync(path.join(OUT, 'beats.txt'), `128 BPM · one beat ${BEAT.toFixed(4)} s · each line is a cut:\n${cuts.join('\n')}\n${(rec.frames / FPS).toFixed(3)}s  end\n`);
  const mp4 = path.join(OUT, 'esportra-air-showcase-16x9.mp4'), vert = path.join(OUT, 'esportra-air-showcase-9x16.mp4');
  kit.encode(rec.dir, mp4, { vertical: vert });
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(mp4, 0.3) }));
})().catch((e) => { console.error(e); process.exit(1); });
