// The 60-second reel (24 Nov): PUBG MOBILE, setup in seconds, the game driving the graphics on its own, Insights,
// Graphics studio. True 30 fps (dev/rec-kit.cjs), cuts on a 128 BPM grid (no music: the producer adds a track),
// 16:9 and 9:16. Every number on screen is Air's own: the stand-in PCOB (dev/fake-pcob.ts, the official API's routes)
// plays a real game into Air on a fresh dev host, the lobby room's states are recorded as Air writes them, and the
// centrepiece replays exactly those states frame by frame with the pages' clocks pinned to when Air wrote them.
//   AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   node dev/reel.cjs [host] [engine port] <out dir>
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const H = process.argv[2] || 'http://127.0.0.1:5334';
const ENGINE = process.argv[3] || '5396';
const OUT = process.argv[4] || path.join(process.cwd(), 'reel');
const KEY = 'dev-host-key-0123456789abcdef';
const W = 1920, HGT = 1080, FPS = kit.FPS, BEAT = kit.BEAT;
const ENG = `http://127.0.0.1:${ENGINE}`;
const REPLAY = 'REELREPLAY';
const call = async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
const dev = async (q) => (await fetch(`${H}/dev/pcob?${q}`, { method: 'POST' })).json();
const roomState = async (code) => (await (await fetch(`${ENG}/api/${code}`)).json()).state;
const patchRoom = async (code, fields) => { const r = await fetch(`${ENG}/api/${code}`, { method: 'PATCH', headers: { 'X-Esportra-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }); if (!r.ok) throw new Error('room patch ' + r.status); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
const TAGS = ['NOW', 'CF5', 'IRP', 'DUNE', 'SFX', 'NTD', 'BHB', 'STW', 'RKS', 'LOB', 'WCD', 'GRM', 'FR6', 'ECV', 'QST', 'HGD'];
const COLORS = ['#22d3ee', '#f43f5e', '#ffb60e', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9'];
// Sections on the beat grid (128 beats = 60 s).
const SECTIONS = { open: 8, setup: 28, auto: 44, insights: 20, studio: 20, end: 8 };
const frames = (beats) => Math.round(beats * BEAT * FPS);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // ── what a producer has before the show: teams and players (made-up names) ──
  await call('chooseGame', ['pubgm']); await call('finishOnboarding');
  await call('esportraSignIn', ['producer@example.com', 'correct horse battery']);
  for (const [i, n] of NAMES.entries()) await call('saveTeam', [{ name: n, tag: TAGS[i], color: COLORS[i % COLORS.length], logo: '' }]);
  let snap = await call('snapshot');
  for (const t of snap.library.teams) { const i = NAMES.indexOf(t.name); for (const p of ['ACE', 'ROOK', 'VEX', 'KAI']) await call('savePlayer', [{ name: `${TAGS[i]}_${p}`, realName: '', gameId: `${TAGS[i]}_${p}`, photo: '', role: '', teamId: t.id }]); }

  const browser = await chromium.launch();
  // The app is recorded at 1280×720 with 1.5× pixels: the same 1920×1080 frame, with the interface big enough to read.
  const FONTS = kit.fontCss();
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const ctx = await browser.newContext({ viewport: { width: W, height: HGT } });
  await kit.prepare(appCtx); await kit.prepare(ctx);
  const app = await appCtx.newPage();
  const errs = []; app.on('pageerror', (e) => errs.push(e.message));
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor();
  await app.evaluate(() => document.fonts.ready);
  const ui = kit.chrome(app, FONTS);
  await ui.dress();
  const rail = (name) => app.locator('nav.rail').getByRole('button', { name });

  // ═════ 2 · Setup in seconds (recorded first: it makes the event and lobby) ═════
  const setup = kit.recorder(path.join(OUT, 's2'));
  await rail('Events').click(); await app.waitForTimeout(400);
  await ui.caption('Set up', 'An event in <em>seconds</em>');
  await setup.run(app, 8);
  await ui.type(setup, app.getByLabel('New event name'), 'Air Showcase Cup', { per: 1 });
  await ui.click(setup, app.getByRole('button', { name: 'New event', exact: true }), { after: 6 });
  await ui.click(setup, app.locator('.ev-card').first(), { after: 6 });
  await ui.caption('Set up', 'A lobby of <em>16 teams</em>');
  await ui.type(setup, app.getByLabel('Lobby name'), 'Group A · Day 2', { per: 1 });
  await ui.click(setup, app.getByRole('button', { name: 'New lobby' }), { after: 4 });
  await ui.click(setup, app.getByRole('button', { name: 'Open' }).first(), { after: 4 });
  await ui.click(setup, app.getByRole('tab', { name: /Teams/ }), { after: 3 });
  const boxes = app.locator('.lb-team');
  for (let i = 0; i < 16; i++) await ui.click(setup, boxes.nth(i), { frames: 3, after: 1 });
  await ui.click(setup, app.getByRole('button', { name: 'Save teams' }), { after: 4 });
  snap = await call('snapshot');
  const ev = snap.events[0], lobby = snap.lobbies[0];
  await call('lobbyUpdate', [lobby.id, { stage: 'Group stage', games: ['Erangel', 'Miramar', 'Sanhok', 'Erangel', 'Vikendi', 'Rondo'].map((map) => ({ map })) }]);
  await call('eventLicence', [ev.id, 'pubgm', { confirmed: true }]);
  await call('saveSponsor', [ev.id, { name: 'Volt Energy', tier: 'title', logo: '', logoLight: '', line: '' }]);
  const fake = await dev('do=start&speed=40&length=900');
  await rail('Live').click(); await app.waitForTimeout(500);
  await ui.caption('Set up', 'Connect the <em>game</em>');
  await ui.click(setup, app.getByRole('button', { name: /Game data · Off/ }), { after: 4 });
  const dlg = app.getByRole('dialog', { name: 'Game data' });
  await ui.type(setup, dlg.getByLabel('Observer PC address'), `127.0.0.1:${fake.port}`, { per: 1 });
  await ui.click(setup, dlg.getByRole('checkbox'), { frames: 6, after: 2 });
  await ui.click(setup, dlg.getByRole('button', { name: 'Connect' }), { frames: 6, after: 2 });
  await setup.toBeat(app, SECTIONS.setup);
  console.log(`setup: ${setup.frames} frames (${frames(SECTIONS.setup)} on the grid)`);
  await app.keyboard.press('Escape');
  await ui.caption(null);

  // The pack (licensed above) downloads while the game is set up.
  for (let i = 0; i < 120 && !(await call('snapshot')).packs?.some((p) => p.game === 'pubgm' && p.state === 'ready'); i++) await sleep(500);

  // ═════ Record a real game through Air (real time, nothing captured on screen) ═════
  const code = (await call('snapshot')).lobbies[0].code;
  const states = [], lines = [], onAir = [];
  let lastJson = '', lastPlayers = new Map(), seenKills = 0, recording = true;
  const t0 = Date.now();
  await dev('do=begin');
  const pollRoom = (async () => { while (recording) { const s = await roomState(code); const j = JSON.stringify(s); if (j !== lastJson) { lastJson = j; states.push([Date.now(), s]); } await sleep(100); } })();
  const pcob = (route) => fetch(`http://127.0.0.1:${fake.port}/${route}`).then((r) => r.json());
  const pollFeed = (async () => {
    while (recording) {
      try {
        const [pl, ki] = await Promise.all([pcob('gettotalplayerlist'), pcob('getkillinfo')]);
        const now = Date.now();
        for (const p of pl.playerInfoList ?? []) {
          const prev = lastPlayers.get(p.playerName);
          const n = (v) => Number(v);
          if (prev) {
            if (n(p.liveState) !== n(prev.liveState) && [4, 5].includes(n(p.liveState))) lines.push([now, 'gettotalplayerlist', p.playerName, `liveState ${prev.liveState} → ${p.liveState}`, n(p.liveState) === 4 ? 'knocked · HUD mark' : 'out · HUD mark']);
            if (n(p.killNum) > n(prev.killNum)) lines.push([now, 'gettotalplayerlist', p.playerName, `killNum ${prev.killNum} → ${p.killNum}`, 'elims · live points']);
            if (n(p.rank) > 0 && n(prev.rank) === 0) lines.push([now, 'gettotalplayerlist', p.teamName, `rank 0 → ${p.rank}`, n(p.rank) === 1 ? 'WWCD' : 'team eliminated']);
          }
          lastPlayers.set(p.playerName, p);
        }
        const kl = ki.killInfo ?? [];
        for (const k of kl.slice(seenKills)) lines.push([now, 'getkillinfo', k.CauserName, `${Number(k.ResultHealthStatus) === 2 ? '✕' : '↓'} ${k.VictimName} · ${Math.round(Number(k.Distance) / 100) || ''}m`, Number(k.ResultHealthStatus) === 2 ? 'kill feed · moments' : 'knock']);
        seenKills = kl.length;
      } catch { /* between games */ }
      await sleep(250);
    }
  })();
  const pollAir = (async () => { let last = ''; while (recording) { const s = await call('snapshot'); const k = `${s.lobbyOnAir}|${s.brAuto.running}`; if (k !== last) { last = k; onAir.push([Date.now(), s.lobbyOnAir, s.brAuto.running, s.brAuto.next]); } await sleep(150); } })();
  for (let i = 0; i < 400; i++) {
    await sleep(250);
    if (onAir.some(([, s]) => s === 'br-mvp')) { await sleep(1500); break; }
  }
  recording = false; await Promise.all([pollRoom, pollFeed, pollAir]);
  fs.writeFileSync(path.join(OUT, 'recording.json'), JSON.stringify({ t0, states: states.length, lines, onAir }, null, 1));
  const at = (screen) => onAir.find(([, s]) => s === screen)?.[0];
  const wwcdAt = at('br-wwcd'), resultsAt = at('br-rankings');
  if (!wwcdAt || !resultsAt) throw new Error('autopilot did not run WWCD and results: ' + JSON.stringify(onAir));
  const planeAt = (lines.find(([, , , txt]) => /killNum/.test(txt))?.[0] ?? t0 + 3000) - 2500;
  console.log(`recorded ${states.length} room states, ${lines.length} data lines, game ${((wwcdAt - t0) / 1000).toFixed(1)} s`);

  // ═════ Replay stage: the on-air pages fed the recorded states, clocks pinned to when Air wrote them ═════
  const base = states[0][1];
  await patchRoom(REPLAY, base);
  const wall = base.airPack?.wallpaper?.[1] || base.airPack?.wallpaper?.[0] || '';
  const stageHtml = (mode) => `<!doctype html><html><head><style>${FONTS}
    .mon{animation:kb 24s linear both}@keyframes kb{0%{transform:scale(1)}100%{transform:scale(1.06)}}
    body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#06070a;font-family:Poppins,system-ui,sans-serif;color:#fff}
    .mon{position:absolute;overflow:hidden;background:#000 url('${ENG}${wall}') center/cover}
    .mon iframe{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;background:transparent}
    .full{left:0;top:0;width:1920px;height:1080px}
    .split{left:600px;top:150px;width:1280px;height:720px;box-shadow:0 30px 90px rgba(0,0,0,.6);outline:1px solid rgba(255,255,255,.12)}
    .split iframe{transform:scale(.6667)}
    .feed{position:absolute;left:40px;top:150px;width:520px;height:720px;overflow:hidden;font:500 15px/1.25 'JetBrains Mono',ui-monospace,monospace}
    .feed h4{margin:0 0 14px;font:700 13px Poppins,system-ui;letter-spacing:.2em;color:#34d399}
    .feed .ln{display:grid;grid-template-columns:1fr;gap:3px;padding:9px 12px;margin-bottom:6px;background:rgba(52,211,153,.06);border-left:2px solid #34d399;animation:ln .5s cubic-bezier(.2,.8,.2,1) both}
    .feed .ln b{color:#fff;font-weight:700}.feed .ln .r{color:#6ee7b7;font-size:13px}.feed .ln .to{color:#ffb60e;font:700 12px Poppins,system-ui;letter-spacing:.12em;text-transform:uppercase}
    .feed .ln .rt{color:#5f6f68;font-size:12px}
    @keyframes ln{0%{opacity:0;transform:translateX(-24px);background:rgba(52,211,153,.35)}100%{opacity:1;transform:none}}
    .hdr{position:absolute;left:40px;top:48px;right:40px;display:flex;align-items:flex-end;justify-content:space-between}
    .hdr .k{display:inline-block;padding:6px 12px;background:#ffb60e;color:#0b0b0f;font:800 18px/1 Poppins;letter-spacing:.18em}
    .hdr .t{display:block;margin-top:10px;font:800 46px/1 Poppins;letter-spacing:-.01em}.hdr .t em{font-style:normal;color:#ffb60e}
    .stats{display:flex;gap:26px}.stats div{text-align:right;font:700 12px Poppins;letter-spacing:.16em;color:#8b8f99}.stats b{display:block;font:800 40px/1 Poppins;color:#fff;letter-spacing:0}.stats .zero b{color:#34d399}
    .auto{position:absolute;left:600px;top:892px;display:flex;gap:12px;align-items:center;font:600 18px Poppins;color:#c9ccd4}
    .auto .chip{padding:6px 12px;border:1px solid rgba(52,211,153,.5);color:#34d399;font:800 13px Poppins;letter-spacing:.16em}
    .auto b{color:#fff}
    .ttl{position:absolute;left:96px;bottom:110px;z-index:3}
    .ttl .k{display:inline-block;padding:7px 14px;background:#ffb60e;color:#0b0b0f;font:800 20px/1 Poppins;letter-spacing:.2em;animation:up .45s cubic-bezier(.2,.8,.2,1) both}
    .ttl .t{display:block;margin-top:14px;font:800 118px/.95 Poppins;letter-spacing:-.025em;text-shadow:0 10px 40px rgba(0,0,0,.6);animation:up .6s .1s cubic-bezier(.2,.8,.2,1) both}
    .ttl .t em{font-style:normal;color:#ffb60e}.ttl .s{display:block;margin-top:16px;font:500 34px Poppins;color:#d9dce3;animation:up .6s .3s cubic-bezier(.2,.8,.2,1) both}
    .shade{position:absolute;inset:auto 0 0 0;height:520px;background:linear-gradient(0deg,rgba(4,5,8,.95),rgba(4,5,8,0));z-index:2}
    @keyframes up{0%{opacity:0;transform:translateY(40px)}100%{opacity:1;transform:none}}
  </style></head><body>
  ${mode === 'split' ? `<div class="hdr"><div><span class="k">ZERO TOUCH</span><span class="t">The game drives the <em>graphics</em></span></div>
    <div class="stats"><div><b id="n-lines">0</b>DATA LINES</div><div><b id="n-gfx">0</b>GRAPHICS UPDATED</div><div class="zero"><b>0</b>PRODUCER CLICKS</div></div></div>
    <div class="feed"><h4>● LIVE FROM PCOB · OBSERVER PC</h4><div id="lines"></div></div>` : ''}
  <div class="mon ${mode === 'split' ? 'split' : 'full'}"><iframe src="${ENG}/overlays/br-hud.html?match=${REPLAY}"></iframe><iframe src="${ENG}/overlays/fullscreen.html?match=${REPLAY}"></iframe></div>
  ${mode === 'split' ? '<div class="auto"><span class="chip">AUTOPILOT</span><span id="auto">Watching the game</span></div>' : '<div class="shade"></div><div class="ttl" id="ttl"></div>'}
  </body></html>`;
  const stage = await ctx.newPage();
  stage.on('pageerror', (e) => errs.push('stage: ' + e.message));
  let patched = -1;
  /** Puts the room in the state Air had at wall time `w`. */
  const seek = async (w) => {
    let i = patched; while (i + 1 < states.length && states[i + 1][0] <= w) i++;
    if (i !== patched && i >= 0) { await patchRoom(REPLAY, states[i][1]); patched = i; await sleep(70); return true; }
    return false;
  };
  const ready = async () => { for (const f of stage.frames().slice(1)) await f.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {}); await stage.evaluate(() => document.fonts.ready); await sleep(600); };

  // ═════ 1 · Cold open: the live HUD mid-game, the title over it ═════
  const open = kit.recorder(path.join(OUT, 's1'));
  const mid = planeAt + (wwcdAt - planeAt) * 0.55;
  patched = -1; await seek(mid - 4000);
  await stage.setContent(stageHtml('full'), { waitUntil: 'load' }); await ready();
  await stage.evaluate(() => { document.getElementById('ttl').innerHTML = '<span class="k">ESPORTRA AIR</span><span class="t">Game data in.<br><em>Graphics out.</em></span><span class="s">PUBG MOBILE · live from the official observer API</span>'; });
  await open.run(stage, frames(SECTIONS.open), async (i) => { await seek(mid + (i / FPS) * 1000); }, (i) => mid + (i / FPS) * 1000);

  // ═════ 3 · Zero touch: data lines in, graphics react, autopilot runs the post-match set ═════
  const auto = kit.recorder(path.join(OUT, 's3'));
  patched = -1; await seek(planeAt);
  await stage.setContent(stageHtml('split'), { waitUntil: 'load' }); await ready();
  // Video time → Air's wall time: the match at about 1.7×, then WWCD and Match results as they went on air.
  const total = frames(SECTIONS.auto), cut1 = frames(29), cut2 = frames(37);
  const map = (f) => f < cut1 ? planeAt + ((wwcdAt - 600 - planeAt) * f) / cut1 : f < cut2 ? wwcdAt + ((f - cut1) / FPS) * 1000 : resultsAt + ((f - cut2) / FPS) * 1000;
  let shownLines = 0, gfx = 0;
  await auto.run(stage, total, async (f) => {
    const w = map(f);
    if (await seek(w)) gfx++;
    const fresh = lines.filter(([t]) => t <= w).slice(shownLines);
    shownLines += fresh.length;
    const a = [...onAir].reverse().find(([t]) => t <= w);
    await stage.evaluate(([fresh, n, g, a]) => {
      const box = document.getElementById('lines');
      for (const [, route, who, txt, to] of fresh.slice(-6)) { const d = document.createElement('div'); d.className = 'ln'; d.innerHTML = `<span class="rt">${route}</span><span><b>${who}</b> <span class="r">${txt}</span></span><span class="to">→ ${to}</span>`; box.appendChild(d); }
      while (box.children.length > 9) box.firstChild.remove();
      document.getElementById('n-lines').textContent = n; document.getElementById('n-gfx').textContent = g;
      document.getElementById('auto').innerHTML = a && a[2] ? `On air: <b>${a[2]}</b>${a[3]?.length ? ` · next ${a[3].slice(0, 2).join(', ')}` : ''}` : 'Watching the game · moments come up by themselves';
    }, [fresh, shownLines, gfx, a ?? null]);
  }, (f) => map(f));

  // ═════ 4 · Insights (the match is saved by now) ═════
  const ins = kit.recorder(path.join(OUT, 's4'));
  await app.bringToFront();
  await app.getByRole('button', { name: 'Control', exact: true }).waitFor();
  await ui.caption('Insights', 'Every player. <em>Every number.</em>');
  await ui.click(ins, app.getByRole('button', { name: /^Insights/ }), { after: 10 });
  await ui.click(ins, app.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Match 1' }), { after: 12 });
  await ui.zoomTo(ins, 1.22, 730, 250, 14);
  await ins.run(app, 18);
  await ui.zoomTo(ins, 1, 0, 0, 10);
  const scroller = app.locator('.cp-ins');
  await ins.run(app, 40, async (i) => { await scroller.evaluate((el, y) => { el.scrollTop = y; }, Math.round(620 * (1 - Math.pow(1 - (i + 1) / 40, 3)))); });
  await ui.caption('Insights', 'One click to <em>air</em>');
  const prof = app.getByRole('button', { name: 'On air · Profile' }).first();
  await ui.click(ins, prof, { frames: 12, after: 14 });
  await ins.toBeat(app, SECTIONS.insights);
  await ui.caption(null);

  // ═════ 5 · Graphics studio: the same HUD, re-themed live ═════
  const studio = kit.recorder(path.join(OUT, 's5'));
  await rail(/Graphics studio/).click(); await app.waitForTimeout(400);
  await app.getByRole('tab', { name: 'Event theme' }).click();
  await app.waitForTimeout(1800);
  await ui.caption('Graphics studio', 'Restyle it. <em>Live.</em>');
  await studio.run(app, 12);
  for (const preset of ['Jungle', 'Inferno']) { await ui.click(studio, app.locator('.bt-preset').filter({ hasText: preset }), { frames: 9, after: 2 }); await app.waitForTimeout(700); await studio.run(app, 40); }
  await studio.toBeat(app, SECTIONS.studio);
  await ui.caption(null);

  // ═════ 6 · End card ═════
  const end = kit.recorder(path.join(OUT, 's6'));
  const card = await ctx.newPage();
  await card.setContent(`<!doctype html><html><body style="margin:0;width:1920px;height:1080px;display:grid;place-items:center;background:radial-gradient(120% 120% at 70% 0%,#1b2130,#06070a 68%);color:#fff;font-family:Poppins,system-ui,sans-serif"><style>${FONTS}@keyframes up{0%{opacity:0;transform:translateY(40px)}100%{opacity:1;transform:none}}</style>
    <div style="text-align:center"><div style="font:800 26px Poppins;letter-spacing:.34em;color:#ffb60e;animation:up .5s both">ESPORTRA AIR</div>
    <div style="font:800 96px/1.02 Poppins;letter-spacing:-.02em;margin:24px 0 20px;animation:up .6s .12s both">Broadcast graphics<br>that run themselves.</div>
    <div style="font:500 30px Poppins;color:#b8bcc6;animation:up .6s .3s both">PUBG MOBILE · Valorant · Free Fire</div></div></body></html>`);
  await card.evaluate(() => document.fonts.ready);
  await end.run(card, frames(SECTIONS.end));

  // ── assemble in video order, encode, check ──
  const all = path.join(OUT, 'frames'); fs.rmSync(all, { recursive: true, force: true }); fs.mkdirSync(all);
  const order = [['open', open], ['setup', setup], ['auto', auto], ['insights', ins], ['studio', studio], ['end', end]];
  let n = 0; const beats = [];
  for (const [name, r] of order) {
    const want = frames(SECTIONS[name]);
    const files = fs.readdirSync(r.dir).sort();
    // Each section is exactly its beats long: a longer recording is trimmed at the end, a shorter one never happens (toBeat pads).
    beats.push(`${(n / FPS).toFixed(3)}s  beat ${Math.round(n / FPS / BEAT)}  ${name}${files.length > want ? ` (trimmed ${files.length - want} frames)` : ''}`);
    for (const f of files.slice(0, want)) fs.renameSync(path.join(r.dir, f), path.join(all, String(n++).padStart(6, '0') + '.jpg'));
  }
  beats.push(`${(n / FPS).toFixed(3)}s  beat ${Math.round(n / FPS / BEAT)}  end`);
  fs.writeFileSync(path.join(OUT, 'beats.txt'), `128 BPM · one beat ${BEAT.toFixed(4)} s · cuts:\n` + beats.join('\n') + '\n');
  const mp4 = path.join(OUT, 'esportra-air-reel-16x9.mp4'), vert = path.join(OUT, 'esportra-air-reel-9x16.mp4');
  kit.encode(all, mp4, { vertical: vert });
  await browser.close();
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 8).join(' | '));
  console.log(JSON.stringify({ mp4, vert, frames: n, seconds: n / FPS, frozen: kit.frozenRuns(mp4, 0.5) }));
})().catch((e) => { console.error(e); process.exit(1); });
