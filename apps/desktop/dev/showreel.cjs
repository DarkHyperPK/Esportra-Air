// Esportra Air launch showreel (24 Nov): five features, each one claim and one clean proof, 60 s on a 128 BPM grid.
//   1 Open · 2 Two ways in (Esportra import, or standalone) · 3 Library (real broadcast screens) · 4 Autopilot Rundown
//   (the rules, then the show running itself; game data as a faint texture behind) · 5 Graphics studio (heading,
//   colour, kit art, whole-event theme) · 6 End card.
// Every frame goes through a compositor page (the "stage"): app shots sit in a framed window with a slow camera move
// and soft entrances, graphics go full-bleed with a name chip. Sources are stepped frame by frame (dev/rec-kit.cjs),
// so nothing pauses or jumps however long the app takes. All data is Air's own, from a fresh dev host:
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   node dev/showreel.cjs [host] [engine port] <out dir>
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const H = process.argv[2] || 'http://127.0.0.1:5334';
const ENGINE = process.argv[3] || '5396';
const OUT = process.argv[4] || path.join(process.cwd(), 'showreel');
const ENG = `http://127.0.0.1:${ENGINE}`;
const KEY = 'dev-host-key-0123456789abcdef';
const REPLAY = 'REELREPLAY2';
const FPS = kit.FPS, BEAT = kit.BEAT;
const beats = (b) => Math.round(b * BEAT * FPS);
const call = async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
const dev = async (q) => (await fetch(`${H}/dev/pcob?${q}`, { method: 'POST' })).json();
const roomState = async (code) => (await (await fetch(`${ENG}/api/${code}`)).json()).state;
const patchRoom = async (code, fields) => { const r = await fetch(`${ENG}/api/${code}`, { method: 'PATCH', headers: { 'X-Esportra-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }); if (!r.ok) throw new Error('room patch ' + r.status); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
const TAGS = ['NOW', 'CF5', 'IRP', 'DUNE', 'SFX', 'NTD', 'BHB', 'STW', 'RKS', 'LOB', 'WCD', 'GRM', 'FR6', 'ECV', 'QST', 'HGD'];
const COLORS = ['#22d3ee', '#f43f5e', '#ffb60e', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9'];
const LOTUS = `${ENG}/art/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/splash.png`;

// ── the stage: one page that every video frame is taken from ──
const STAGE = (fonts) => `<!doctype html><html><head><style>${fonts}
*{box-sizing:border-box}
body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#05060a;font-family:Poppins,system-ui,sans-serif;color:#fff}
#bg{position:absolute;inset:0;background:radial-gradient(90% 80% at 78% 18%,#1a2233 0%,#0a0c12 55%,#05060a 100%)}
#bg::after{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:64px 64px}
#data{position:absolute;inset:-200px 0 0 0;columns:5;column-gap:40px;padding:0 40px;font:500 13px/1.9 'JetBrains Mono',ui-monospace,monospace;color:#7fe0b8;opacity:.07;white-space:nowrap;overflow:hidden;animation:drift 60s linear both}
@keyframes drift{0%{transform:translateY(0)}100%{transform:translateY(-900px)}}
.layer{position:absolute;overflow:hidden}
.layer img{display:block;width:100%;height:100%}
body.win .layer{left:470px;top:150px;width:1380px;height:776px;border-radius:14px;box-shadow:0 40px 120px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.1)}
body.mon .layer{left:160px;top:176px;width:1600px;height:900px;box-shadow:0 30px 100px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)}
body.full .layer{inset:0}
body.title .layer{inset:0;opacity:.32}
.in{animation:in .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes in{0%{opacity:0;transform:translateY(40px) scale(.985)}100%{opacity:1;transform:none}}
#txt{position:absolute;z-index:5}
body.win #txt{left:72px;top:0;bottom:0;width:370px;display:flex;flex-direction:column;justify-content:center}
body.mon #txt{left:160px;top:44px;right:160px}
body.full #txt{left:72px;bottom:70px}
body.title #txt{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.k{display:inline-block;align-self:flex-start;padding:7px 13px;background:#ffb60e;color:#0b0b0f;font:800 15px/1 Poppins;letter-spacing:.2em;animation:up .42s cubic-bezier(.2,.8,.2,1) both}
body.title .k{align-self:center}
.t{display:block;margin-top:16px;font:800 52px/1.04 Poppins;letter-spacing:-.02em;animation:up .55s .08s cubic-bezier(.2,.8,.2,1) both}
body.mon .t{font-size:44px;margin-top:12px}
body.title .t{font-size:96px;line-height:1}
body.full .t{font-size:40px;text-shadow:0 6px 30px rgba(0,0,0,.7)}
.t em{font-style:normal;color:#ffb60e}
.s{display:block;margin-top:18px;font:500 21px/1.45 Poppins;color:#b9bec9;animation:up .55s .2s cubic-bezier(.2,.8,.2,1) both}
body.title .s{font-size:30px;color:#c9ccd4}
@keyframes up{0%{opacity:0;transform:translateY(28px)}100%{opacity:1;transform:none}}
#chip{position:absolute;z-index:6;left:72px;bottom:64px;display:none;align-items:center;gap:12px;font:700 15px Poppins;letter-spacing:.16em;animation:up .4s cubic-bezier(.2,.8,.2,1) both}
#chip b{padding:8px 14px;background:rgba(6,7,10,.82);border:1px solid rgba(255,255,255,.16)}
#chip i{font-style:normal;padding:8px 12px;background:#ffb60e;color:#0b0b0f}
body.full #chip.on{display:flex}
#live{position:absolute;z-index:6;right:160px;top:64px;display:none;gap:10px;align-items:center;font:700 13px Poppins;letter-spacing:.2em;color:#7fe0b8}
#live::before{content:'';width:9px;height:9px;border-radius:50%;background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.2)}
body.mon #live{display:flex}
#shade{position:absolute;inset:auto 0 0 0;height:300px;background:linear-gradient(0deg,rgba(5,6,10,.85),transparent);display:none;z-index:4}
body.full #shade.on{display:block}
</style></head><body class="win"><div id="bg"></div><div id="data"></div><div class="layer" id="layer"><img id="img"></div><div id="shade"></div><div id="txt"></div><div id="chip"></div><div id="live">LIVE GAME DATA</div></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const FONTS = kit.fontCss();
  // ── off camera: the producer's library and a PUBG MOBILE lobby ──
  await call('chooseGame', ['valorant']); await call('finishOnboarding');
  await call('esportraSignIn', ['producer@example.com', 'correct horse battery']);
  await call('artDownload');
  await call('chooseGame', ['pubgm']); // PUBG MOBILE players have in-game names, not Riot IDs
  for (const [i, n] of NAMES.entries()) await call('saveTeam', [{ name: n, tag: TAGS[i], color: COLORS[i % COLORS.length], logo: '' }]);
  let snap = await call('snapshot');
  for (const t of snap.library.teams) { const i = NAMES.indexOf(t.name); for (const p of ['ACE', 'ROOK', 'VEX', 'KAI']) await call('savePlayer', [{ name: `${TAGS[i]}_${p}`, realName: '', gameId: `${TAGS[i]}_${p}`, photo: '', role: '', teamId: t.id }]); }
  await call('chooseGame', ['valorant']);
  await call('createEvent', ['Friday Scrims']);
  await call('chooseGame', ['pubgm']);
  await call('createEvent', ['Air Showcase Cup']);
  snap = await call('snapshot');
  const ev = snap.events.find((e) => e.name === 'Air Showcase Cup');
  await call('eventLicence', [ev.id, 'pubgm', { confirmed: true }]);
  await call('saveSponsor', [ev.id, { name: 'Volt Energy', tier: 'title', logo: '', logoLight: '', line: '' }]);
  await call('lobbyCreate', [{ eventId: ev.id, game: 'pubgm', title: 'Group A · Day 2', games: 6 }]);
  snap = await call('snapshot');
  const lobby = snap.lobbies[0];
  await call('lobbyTeams', [lobby.id, NAMES.map((n) => snap.library.teams.find((t) => t.name === n).id)]);
  await call('lobbyUpdate', [lobby.id, { stage: 'Group stage', games: ['Erangel', 'Miramar', 'Sanhok', 'Erangel', 'Vikendi', 'Rondo'].map((map) => ({ map })) }]);
  await call('lobbySelect', [lobby.id]);
  for (let i = 0; i < 120 && !(await call('snapshot')).packs?.some((p) => p.game === 'pubgm' && p.state === 'ready'); i++) await sleep(500);
  for (let i = 0; i < 120 && (await call('snapshot')).art?.have < 279; i++) await sleep(500);

  // ── off camera: a real game through Air, recorded as Air writes the lobby room ──
  const fake = await dev('do=start&speed=40&length=900');
  await call('pcobConnect', [`127.0.0.1:${fake.port}`, true]);
  await sleep(1500);
  const code = lobby.code;
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
        for (const p of pl.playerInfoList ?? []) {
          const o = prev.get(p.playerName);
          if (o && Number(p.killNum) !== Number(o.killNum)) lines.push(`${p.playerName}  killNum ${o.killNum}→${p.killNum}`);
          if (o && Number(p.liveState) !== Number(o.liveState)) lines.push(`${p.playerName}  liveState ${o.liveState}→${p.liveState}`);
          prev.set(p.playerName, p);
        }
        for (const k of (ki.killInfo ?? []).slice(seen)) lines.push(`${k.CauserName} ${Number(k.ResultHealthStatus) === 2 ? '✕' : '↓'} ${k.VictimName}  t=${k.CurGameTime}`);
        seen = (ki.killInfo ?? []).length;
      } catch { /* between games */ }
      await sleep(250);
    }
  })();
  const pollAir = (async () => { let last = ''; while (recording) { const s = await call('snapshot'); if (s.lobbyOnAir !== last) { last = s.lobbyOnAir; onAir.push([Date.now(), s.lobbyOnAir]); } await sleep(150); } })();
  for (let i = 0; i < 400 && !onAir.some(([, s]) => s === 'br-mvp'); i++) await sleep(250);
  recording = false; await Promise.all([pollRoom, pollFeed, pollAir]);
  await call('pcobDisconnect');
  const at = (s) => onAir.find(([, x]) => x === s)?.[0];
  const wwcdAt = at('br-wwcd'), resultsAt = at('br-rankings');
  if (!wwcdAt || !resultsAt) throw new Error('autopilot did not run: ' + JSON.stringify(onAir));
  console.log(`recorded ${states.length} states, ${lines.length} data lines, game ${((wwcdAt - t0) / 1000).toFixed(1)} s`);

  // ── browsers: the app at 1280×720 with 1.5× pixels; graphics and the stage at 1920×1080 ──
  const browser = await chromium.launch();
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const gfxCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await kit.prepare(appCtx); await kit.prepare(gfxCtx);
  // The fake Esportra's logo address points nowhere: serve a clean logo for it in this browser only.
  const logoPage = await gfxCtx.newPage();
  await logoPage.setContent(`<html><body style="margin:0;background:transparent"><svg id="l" width="256" height="256" viewBox="0 0 64 64"><path d="M32 3l26 15v28L32 61 6 46V18z" fill="#14b8a6"/><path d="M19 20h8l5 15 5-15h8L35 46h-6z" fill="#fff"/></svg></body></html>`);
  const logo = await logoPage.locator('#l').screenshot({ omitBackground: true }); await logoPage.close();
  await appCtx.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: logo }));
  const errs = [];
  const app = await appCtx.newPage(); app.on('pageerror', (e) => errs.push('app: ' + e.message));
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor();
  const ui = kit.chrome(app, FONTS); await ui.dress();
  const rail = (name) => app.locator('nav.rail').getByRole('button', { name });
  const stage = await gfxCtx.newPage(); stage.on('pageerror', (e) => errs.push('stage: ' + e.message));
  await stage.setContent(STAGE(FONTS));
  await stage.evaluate((ls) => { document.getElementById('data').textContent = ''; const d = document.getElementById('data'); for (const l of ls) { const p = document.createElement('div'); p.textContent = l; d.appendChild(p); } }, lines.slice(0, 260));
  const src = kit.recorder(path.join(OUT, 'src-unused'));

  /** A shot: the stage's layout and words, then frames of a source page composited into it. */
  const shots = [];
  function shot(name) {
    const rec = kit.recorder(path.join(OUT, `shot-${String(shots.length).padStart(2, '0')}-${name}`));
    shots.push([name, rec]);
    let source = null, vt = null, cam = 0;
    const film = {
      async scene(layout, { k = '', t = '', s = '', chip = null, shade = false } = {}) {
        await stage.evaluate(([layout, k, t, s, chip, shade]) => {
          document.body.className = layout;
          document.getElementById('txt').innerHTML = (k ? `<span class="k">${k}</span>` : '') + (t ? `<span class="t">${t}</span>` : '') + (s ? `<span class="s">${s}</span>` : '');
          const c = document.getElementById('chip'); c.className = chip ? 'on' : ''; c.innerHTML = chip ? `<i>${chip[0]}</i><b>${chip[1]}</b>` : ''; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
          document.getElementById('shade').className = shade ? 'on' : '';
          const L = document.getElementById('layer'); L.classList.remove('in'); void L.offsetWidth; L.classList.add('in');
        }, [layout, k, t, s, chip, shade]);
        cam = 0;
      },
      use(page, clock = null) { source = page; vt = clock; },
      /** One video frame: the source's next frame inside the stage, the camera a little further in. */
      async step(i = 0) {
        const buf = source ? await src.grab(source, typeof vt === 'function' ? vt(i) : vt) : null;
        cam++;
        await stage.evaluate(async ([b64, cam]) => {
          const img = document.getElementById('img');
          if (b64) { img.src = 'data:image/jpeg;base64,' + b64; await img.decode().catch(() => {}); }
          const L = document.getElementById('layer'), mode = document.body.className;
          const s = 1 + Math.min(cam, 600) * (mode === 'full' ? 0.00012 : 0.00007);
          L.style.transform = mode === 'win' ? `perspective(2400px) rotateY(-3deg) scale(${s})` : `scale(${s})`;
          L.style.transformOrigin = mode === 'win' ? '30% 50%' : '50% 50%';
        }, [buf ? buf.toString('base64') : null, cam]);
        await rec.frame(stage);
      },
      // The kit's pointer, click, type and zoom helpers call run(page, n, each): every one of those frames is a stage frame.
      async run(_page, count, each) { for (let i = 0; i < count; i++) { if (each) await each(i); await this.step(i); } },
      async until(b) { const target = beats(b); while (rec.frames < target) await this.step(rec.frames); },
      rec,
    };
    return film;
  }
  const gfxPage = async (url, backdrop) => {
    const p = await gfxCtx.newPage(); p.on('pageerror', (e) => errs.push('gfx: ' + e.message));
    await p.goto(url); await p.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
    if (backdrop) await p.evaluate((b) => { document.documentElement.style.background = `#000 url('${b}') center/cover`; document.body.style.background = 'transparent'; }, backdrop);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    return p;
  };

  // ═════ 4a · Autopilot: the Rundown, set once (PUBG MOBILE lobby) ═════
  await rail('Events').click(); await app.waitForTimeout(300);
  await app.locator('.ev-card').filter({ hasText: 'Air Showcase Cup' }).click(); await app.waitForTimeout(300);
  await app.getByRole('button', { name: 'Open' }).first().click(); await app.waitForTimeout(400);
  await app.getByRole('tab', { name: 'Rundown' }).click(); await app.waitForTimeout(600);
  let f = shot('rundown');
  await f.scene('win', { k: 'AUTOPILOT', t: 'Set the show <em>once</em>', s: 'Rules for every match: when it ends, WWCD, results, MVP and standings go on air in order.' });
  f.use(app);
  await f.run(app, 20);
  const table = await app.locator('.br-rd').boundingBox();
  await ui.zoomTo(f, 1.32, table.x + 40, table.y + 140, 22);
  await f.run(app, 40);
  await ui.point(f, app.locator('.br-rd tbody tr').nth(1), 12);
  await ui.point(f, app.locator('.br-rd tbody tr').nth(4), 14);
  await f.until(10);
  await ui.zoomTo(f, 1, 0, 0, 1);

  // ═════ 4b · …and it runs itself: the recorded game replayed, clocks pinned to when Air wrote each state ═════
  await patchRoom(REPLAY, states[0][1]);
  const wall = states[0][1].airPack?.wallpaper?.[1] || states[0][1].airPack?.wallpaper?.[0] || '';
  const mon = await gfxCtx.newPage();
  await mon.setContent(`<html><body style="margin:0;width:1920px;height:1080px;overflow:hidden;background:#000 url('${ENG}${wall}') center/cover"><iframe src="${ENG}/overlays/br-hud.html?match=${REPLAY}" style="position:absolute;inset:0;width:1920px;height:1080px;border:0"></iframe><iframe src="${ENG}/overlays/fullscreen.html?match=${REPLAY}" style="position:absolute;inset:0;width:1920px;height:1080px;border:0"></iframe></body></html>`);
  for (const fr of mon.frames().slice(1)) await fr.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 }).catch(() => {});
  await mon.waitForTimeout(800);
  let patched = -1;
  const seek = async (w) => { let i = patched; while (i + 1 < states.length && states[i + 1][0] <= w) i++; if (i !== patched && i >= 0) { await patchRoom(REPLAY, states[i][1]); patched = i; await sleep(70); } };
  const planeAt = t0 + 2500;
  const total = beats(22), c1 = beats(12), c2 = beats(17);
  const map = (i) => i < c1 ? planeAt + ((wwcdAt - 600 - planeAt) * i) / c1 : i < c2 ? wwcdAt + ((i - c1) / FPS) * 1000 : resultsAt + ((i - c2) / FPS) * 1000;
  f = shot('autopilot');
  await f.scene('mon', { k: 'AUTOPILOT', t: 'The show runs <em>itself</em>' });
  f.use(mon, map);
  for (let i = 0; i < total; i++) { await seek(map(i)); await f.step(i); }

  // ═════ 5 · Graphics studio: four edits, each one a capability ═════
  await rail(/Graphics studio/).click(); await app.waitForTimeout(400);
  await app.getByRole('tab', { name: 'Looks' }).click(); await app.waitForTimeout(400);
  await app.getByLabel('Graphic for a new template').selectOption({ label: 'Overall standings' });
  await app.getByRole('button', { name: '+ New template' }).click(); await app.waitForTimeout(2500);
  const editor = app.getByRole('dialog', { name: /Template editor/ });
  await app.locator('.tpl-tree .tpl-fold[aria-label$=" layers of Header"]').click().catch(() => {});
  await app.waitForTimeout(300);
  const canvas = await (editor.locator('iframe').first()).boundingBox();
  f = shot('studio-words');
  await f.scene('win', { k: 'GRAPHICS STUDIO', t: 'Rewrite any <em>heading</em>', s: 'Every text, picture and shape on every graphic is a layer you can change.' });
  f.use(app);
  await f.run(app, 10);
  await ui.click(f, app.locator('.tpl-tree [role=option]').filter({ hasText: /^Title$/ }), { frames: 10, after: 4 });
  await ui.zoomTo(f, 1.35, canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.2, 14);
  await ui.type(f, app.locator('.tpl-right').getByLabel('Words'), 'POINTS RACE', { per: 2 });
  await f.run(app, 12);
  await f.until(8);
  f = shot('studio-colour');
  await f.scene('win', { k: 'GRAPHICS STUDIO', t: 'Recolour any <em>layer</em>', s: 'Pick a colour and the graphic changes as you click.' });
  f.use(app);
  // The heading's own text colour, picked with the editor's any-colour field: amber, green, rose.
  const anyColour = app.locator('.tpl-right').getByLabel('Colour: any colour').first();
  await ui.zoomTo(f, 1, 0, 0, 8);
  await ui.point(f, anyColour, 10);
  await ui.zoomTo(f, 1.4, canvas.x + canvas.width * 0.28, canvas.y + canvas.height * 0.18, 10);
  for (const c of ['#ffb60e', '#34d399', '#f43f5e']) { await anyColour.fill(c); await f.run(app, 22); }
  await f.until(8);
  await ui.zoomTo(f, 1, 0, 0, 1);
  await editor.getByRole('button', { name: /^Save/ }).last().click();
  await app.waitForTimeout(600);
  await editor.getByRole('button', { name: /Close/ }).first().click();
  await editor.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await app.waitForTimeout(400);
  await app.getByRole('tab', { name: 'Event theme' }).click(); await app.waitForTimeout(1500);
  await app.getByRole('tab', { name: 'Overall standings' }).click().catch(() => {}); await app.waitForTimeout(1200);
  f = shot('studio-art');
  await f.scene('win', { k: 'GRAPHICS STUDIO', t: 'Official kit art, <em>built in</em>', s: 'Wallpapers, logos and props from the licensed game pack, one click away.' });
  f.use(app);
  await f.run(app, 10);
  await ui.click(f, app.getByRole('button', { name: 'Kit wallpaper…' }), { frames: 10, after: 14 });
  await ui.click(f, app.locator('.ap-grid .ga-card').nth(2), { frames: 10, after: 30 });
  await f.until(8);
  f = shot('studio-theme');
  await f.scene('win', { k: 'GRAPHICS STUDIO', t: 'Re-theme the whole <em>event</em>', s: 'One switch recolours every graphic in the set.' });
  f.use(app);
  for (const p of ['Jungle', 'Inferno']) { await ui.click(f, app.locator('.bt-preset').filter({ hasText: p }), { frames: 9, after: 2 }); await f.run(app, 34); }
  await f.until(8);

  // ═════ 3 · The library: real broadcast screens, each named ═════
  const lib = [
    [`${ENG}/overlays/ingame.html?preview=1`, LOTUS, 'VALORANT', 'IN-GAME HUD'],
    [`${ENG}/overlays/map-veto.html?preview=1`, null, 'VALORANT', 'MAP VETO'],
    [`${ENG}/overlays/agent-select.html?preview=1`, null, 'VALORANT', 'AGENT SELECT'],
    [`${ENG}/overlays/map-result.html?preview=1`, null, 'VALORANT', 'MAP RESULT'],
    [`${ENG}/overlays/br-hud.html?preview=1&mode=rail`, `${ENG}${wall}`, 'PUBG MOBILE', 'LIVE POINTS HUD'],
    [`${ENG}/overlays/br-lobby.html?match=${code}`, null, 'PUBG MOBILE', 'STARTING SOON'],
    [`${ENG}/overlays/br-wwcd.html?match=${code}`, null, 'PUBG MOBILE', 'WINNER WINNER CHICKEN DINNER'],
    [`${ENG}/overlays/br-overall.html?match=${code}`, null, 'PUBG MOBILE', 'OVERALL STANDINGS'],
  ];
  for (const [i, [url, back, game, name]] of lib.entries()) {
    const p = await gfxPage(url, back);
    f = shot(`lib-${i}`);
    await f.scene('full', i === 0 ? { k: 'THE LIBRARY', t: 'Broadcast-ready <em>from day one</em>', chip: [game, name], shade: true } : { chip: [game, name] });
    f.use(p);
    await f.until(3);
    await p.close();
  }

  // ═════ 2 · Two ways in (Valorant): Esportra import, then a standalone match ═════
  await call('chooseGame', ['valorant']); await app.waitForTimeout(600);
  await rail('Events').click(); await app.waitForTimeout(600);
  f = shot('import');
  await f.scene('win', { k: 'TWO WAYS IN', t: 'Import your <em>Esportra</em> tournament', s: 'Teams, players, Riot IDs, best-of and the veto arrive by themselves. No spreadsheets.' });
  f.use(app);
  await f.run(app, 14);
  await ui.click(f, app.locator('.ev-card').filter({ hasText: 'Community Cup' }).getByRole('button', { name: /Open event/ }), { frames: 12, after: 10 });
  await ui.click(f, app.getByRole('button', { name: 'Open' }).first(), { frames: 12, after: 30 });
  await ui.zoomTo(f, 1.28, 640, 110, 16);
  await f.run(app, 26);
  await ui.zoomTo(f, 1, 0, 0, 10);
  await ui.click(f, app.getByRole('button', { name: /Teams\/Players/ }).first(), { frames: 10, after: 24 });
  await f.until(14);
  await rail('Events').click(); await app.waitForTimeout(500);
  f = shot('standalone');
  await f.scene('win', { k: 'TWO WAYS IN', t: 'Or a standalone match <em>in seconds</em>', s: 'Your own event, your saved teams. Nothing to set up twice.' });
  f.use(app);
  await f.run(app, 8);
  await ui.click(f, app.locator('.ev-card').filter({ hasText: 'Friday Scrims' }).getByRole('button', { name: /Open event/ }), { frames: 10, after: 8 });
  await ui.click(f, app.getByRole('button', { name: 'New match' }), { frames: 10, after: 10 });
  const wiz = app.getByRole('dialog', { name: 'New match' });
  await ui.click(f, wiz.getByRole('button', { name: 'Best of 3' }), { frames: 8, after: 4 });
  for (const [side, team] of [['A', 'NIGHT OWLS'], ['B', 'CRIMSON FIVE']]) {
    const sel = wiz.getByLabel(`Saved team for side ${side}`);
    await ui.point(f, sel, 10);
    await sel.selectOption({ label: team });
    await f.run(app, 12);
  }
  await f.until(10);

  // ═════ 1 · Open and 6 · End ═════
  const hero = await gfxPage(`${ENG}/overlays/agent-select.html?preview=1`);
  f = shot('open');
  await f.scene('title', { k: 'ESPORTRA AIR', t: 'Broadcast graphics<br>that <em>run themselves</em>', s: 'Valorant · PUBG MOBILE · Free Fire' });
  f.use(hero);
  await f.until(8);
  await hero.close();
  const endBg = await gfxPage(`${ENG}/overlays/br-wwcd.html?match=${code}`);
  f = shot('end');
  await f.scene('title', { k: 'ESPORTRA AIR', t: 'Your show,<br><em>on autopilot</em>', s: 'Import · Broadcast library · Autopilot · Graphics studio' });
  f.use(endBg);
  await f.until(8);
  await browser.close();

  // ── assemble in video order on the beat grid ──
  const ORDER = ['open', 'import', 'standalone', 'lib-0', 'lib-1', 'lib-2', 'lib-3', 'lib-4', 'lib-5', 'lib-6', 'lib-7', 'rundown', 'autopilot', 'studio-words', 'studio-colour', 'studio-art', 'studio-theme', 'end'];
  const LEN = { open: 8, import: 14, standalone: 10, rundown: 10, autopilot: 22, 'studio-words': 8, 'studio-colour': 8, 'studio-art': 8, 'studio-theme': 8, end: 8 };
  const all = path.join(OUT, 'frames'); fs.rmSync(all, { recursive: true, force: true }); fs.mkdirSync(all);
  let n = 0; const cuts = [];
  for (const name of ORDER) {
    const r = shots.find(([s]) => s === name)[1];
    const want = beats(LEN[name] ?? 3);
    cuts.push(`${(n / FPS).toFixed(3)}s  beat ${Math.round(n / FPS / BEAT)}  ${name}`);
    const files = fs.readdirSync(r.dir).sort();
    for (const fl of files.slice(0, want)) fs.renameSync(path.join(r.dir, fl), path.join(all, String(n++).padStart(6, '0') + '.jpg'));
  }
  cuts.push(`${(n / FPS).toFixed(3)}s  end`);
  fs.writeFileSync(path.join(OUT, 'beats.txt'), `128 BPM · one beat ${BEAT.toFixed(4)} s · each line is a cut:\n${cuts.join('\n')}\n`);
  const mp4 = path.join(OUT, 'esportra-air-showreel-16x9.mp4'), vert = path.join(OUT, 'esportra-air-showreel-9x16.mp4');
  kit.encode(all, mp4, { vertical: vert });
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 8).join(' | '));
  console.log(JSON.stringify({ mp4, frames: n, seconds: +(n / FPS).toFixed(2), frozen: kit.frozenRuns(mp4, 0.4) }));
})().catch((e) => { console.error(e); process.exit(1); });
