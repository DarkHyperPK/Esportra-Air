// Esportra AIR · "From bracket to broadcast" (reel v7, 25 Nov, the producer's brief). 60 s on "Unstoppable Force"
// (Universfield, CC BY 4.0; ~99 BPM; cuts land on its hits). The story: your tournament runs on Esportra; Esportra
// AIR is the bridge that carries that tournament data to the broadcast, so nothing is typed twice. Teams, players,
// sponsors and talent are built once; Valorant plays out (overlay-bar veto, overlay-bar agent select, the HUD); PUBG
// MOBILE plays out (3D drop map, today's maps, HUD, standings, MVP, WWCD); Graphics studio edits land on air; more
// games are coming. Every graphic is an Air page fed through Air's own paths (dev/reel-setup.cjs); the bridge is
// three.js (dev/reel-bridge.js); every frame is stepped and clocks pinned (dev/rec-kit.cjs).
//   cd apps/desktop && npm i --no-save three@0.170.0
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   REEL_MUSIC=<track.mp3> REEL_PHOTOS=<9 player cutouts, 00–08.png> REEL_TALENT=<2 talent photos> \
//     node dev/showreel-v7.cjs [host] [engine port] <out dir> [--stills]
// Posters and the Esportra icon are read from the Esportra website's assets (../esportra/public); player and talent
// photos are the producer's (pro portraits); team emblems are drawn by dev/reel-emblems.cjs. Nothing is copied into the repo.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const kit = require('./rec-kit.cjs');
const S = require('./reel-setup.cjs');
const E = require('./reel-emblems.cjs');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const H = args[0] || 'http://127.0.0.1:5334';
const ENGINE = args[1] || '5396';
const OUT = args[2] || path.join(process.cwd(), 'showreel-v7');
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

// The cut sheet, on the track's hits (seconds).
const T = {
  hook: 0, bridge: 6.6, library: 16.35, veto: 21.76, agents: 25.4, hud: 29.0, drop: 32.4, today: 34.8, brhud: 36.76,
  standings: 39.6, mvp: 41.4, wwcd: 43.2, studio: 45.0, close: 53.4, end: 56.8, out: 60.0,
};

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
  const POSTER = (n) => dataUrl(path.join(SITE, `games/${n}-logo.png`));

  // ═════ Pictures: emblems drawn here; the producer's player and talent photos ═════
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const scratch = await ctx.newPage();
  const emblems = [];
  for (let i = 0; i < S.NAMES.length; i++) emblems[i] = 'data:image/png;base64,' + (await E.png(scratch, E.svg(i, S.TAGS[i], S.COLORS[i % S.COLORS.length]))).toString('base64');
  await scratch.close();
  const pngs = (dir) => (dir ? fs.readdirSync(dir).filter((f) => /^\d+\.png$/i.test(f)).sort().map((f) => dataUrl(path.join(dir, f))) : []);
  const photos = pngs(PHOTOS), talents = pngs(TALENT);
  // Only faces seen on screen get a photo: NIGHT OWLS (team 0, the library card; NOW_KAI is the PUBG MVP) and
  // NORTH TIDE (team 5, the PUBG winners in the recorded game). Everyone else keeps Air's own grey shadow.
  const photoOf = (i, j) => (i === 0 ? photos[j] : i === 5 ? photos[5 + j] : null) || null;

  // ═════ Off camera: the producer's data, through Air (dev/reel-setup.cjs) ═════
  const d = await S.prepare(h, { logo: (i) => emblems[i], photo: photoOf });
  const { lobby, code, states, wwcdAt, fbAt, logos } = d;
  await call('lobbyShow', [lobby.id, { pick: { scope: 'match', game: 1 } }]);
  await kit.prepare(ctx);
  const { sample, wall, seek, resetReplay } = await S.dress(h, ctx, d);
  // The Valorant room's two teams are the library's NIGHT OWLS and CRIMSON FIVE, with their emblems.
  const vteams = clone(sample.teams); vteams[0].logo = logos[0]; vteams[1].logo = logos[1];
  // three.js and the bridge, served to the stage from a local origin
  await ctx.route('http://reel.local/**', (r) => {
    const f = new URL(r.request().url()).pathname.slice(1);
    const p = f === 'three.module.js' ? path.join(__dirname, '../node_modules/three/build/three.module.js') : path.join(__dirname, f);
    if (!/^(three\.module|reel-bridge)\.js$/.test(f) || !fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(p) });
  });

  const stage = await ctx.newPage();
  const errs = []; stage.on('pageerror', (e) => errs.push('stage: ' + e.message));
  const rec = kit.recorder(path.join(OUT, STILLS ? 'stills-raw' : 'frames'));
  const board = [], cuts = [];
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

  // ═════ 1 · Hook (0–6.6 s): the bracket draws itself in light ═════
  const bracketSvg = () => {
    const teams = [0, 1, 2, 3, 4, 5, 6, 7];
    const W = 1760, Hh = 860, colX = [80, 520, 960, 1400], slot = (r, k) => 80 + (Hh - 160) * ((k + 0.5) / (8 >> r));
    let svg = `<svg id="bracket" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg"><style>.ln{fill:none;stroke:#3b4a72;stroke-width:4;stroke-dasharray:900;stroke-dashoffset:900;animation:draw .55s cubic-bezier(.5,0,.2,1) forwards}.ln.win{stroke:#ffb60e;filter:drop-shadow(0 0 8px #ffb60e)}@keyframes draw{to{stroke-dashoffset:0}}.box{fill:#0f1526;stroke:#26324f;stroke-width:2}.nm{font:700 22px Poppins;fill:#fff}.sc{font:800 22px Poppins;fill:#ffb60e}.it{opacity:0;animation:pop .45s cubic-bezier(.2,1.4,.3,1) forwards}@keyframes pop{0%{opacity:0;transform:scale(.7)}100%{opacity:1;transform:none}}</style>`;
    // winners after each round: quarter-finals, semi-finals, final
    const win = [[0, 2, 4, 6], [0, 4], [0]];
    const item = (x, y, t, delay, score) => `<g class="it" style="animation-delay:${delay}s;transform-origin:${x + 160}px ${y}px"><rect class="box" x="${x}" y="${y - 30}" width="320" height="60" rx="10"/><image href="${emblems[t]}" x="${x + 10}" y="${y - 24}" width="48" height="48"/><text class="nm" x="${x + 70}" y="${y + 8}">${S.NAMES[t]}</text>${score !== undefined ? `<text class="sc" x="${x + 300}" y="${y + 8}" text-anchor="end">${score}</text>` : ''}</g>`;
    teams.forEach((t, k) => { svg += item(colX[0], slot(0, k), t, 0.1 + k * 0.06, win[0].includes(t) ? 2 : k % 2); });
    for (let r = 1; r <= 3; r++) {
      const n = 8 >> r;
      for (let k = 0; k < n; k++) {
        const y0 = slot(r - 1, 2 * k), y1 = slot(r - 1, 2 * k + 1), y = slot(r, k), x0 = colX[r - 1] + 320, x = colX[r];
        const winner = win[r - 1][k], delay = 0.7 + (r - 1) * 0.9 + k * 0.08;
        const fromWin = winner === 0;
        svg += `<path class="ln${fromWin ? ' win' : ''}" style="animation-delay:${delay}s" d="M${x0} ${y0} H${(x0 + x) / 2} V${y} H${x}"/><path class="ln" style="animation-delay:${delay}s" d="M${x0} ${y1} H${(x0 + x) / 2} V${y}"/>`;
        svg += r < 3 ? item(x, y, winner, delay + 0.4, 2) : `<g class="it" style="animation-delay:${delay + 0.4}s;transform-origin:${x + 160}px ${y}px"><rect x="${x - 10}" y="${y - 56}" width="300" height="112" rx="16" fill="#1a1405" stroke="#ffb60e" stroke-width="4" style="filter:drop-shadow(0 0 22px #ffb60e)"/><image href="${emblems[0]}" x="${x + 14}" y="${y - 44}" width="88" height="88"/><text x="${x + 110}" y="${y - 6}" style="font:800 20px Poppins;fill:#ffb60e;letter-spacing:.12em">CHAMPION</text><text x="${x + 110}" y="${y + 24}" class="nm">NOW</text></g>`;
      }
    }
    return svg + '</svg>';
  };
  const hookHtml = `<div style="position:absolute;left:160px;top:110px">${bracketSvg()}</div>
    <div class="rise" style="--d:.1s;position:absolute;left:180px;top:46px;display:flex;align-items:center;gap:14px;font:700 20px Poppins;letter-spacing:.22em;color:#8fa0c4"><img src="${ICON}" style="width:38px;height:38px;border-radius:9px">ESPORTRA · COMMUNITY CUP</div>`;
  await scene('1-hook', T.hook, T.bridge, hookHtml, 'cut', null, {
    cam: [[0, 1.12, 760, 560], [F(3.6), 1.0, 960, 540], [F(6.6), 1.0, 960, 540]],
    over: copy('Your tournament runs on <em>Esportra.</em>', { d: 1.1, out: 5.6, cls: 'c', style: 'bottom:auto;top:930px;font-size:64px' }), key: 0.75,
  });
  const bracketPng = 'data:image/jpeg;base64,' + (await stage.screenshot({ type: 'jpeg', quality: 92 })).toString('base64');

  // ═════ 2 · The bridge (6.6–16.35 s) — the screen shows the library's first frame, so the camera flies into it ═════
  const libHtml = libraryHtml();
  const libFirst = await (async () => {
    await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}.w,.pop,.rise,.copy,.tag{animation:none!important}</style></head><body><div class="bg"></div><div id="cam">${libHtml}</div></body></html>`, { waitUntil: 'load' });
    await stage.evaluate(() => document.fonts.ready); await sleep(300);
    return 'data:image/jpeg;base64,' + (await stage.screenshot({ type: 'jpeg', quality: 90 })).toString('base64');
  })();
  const cardPics = [...emblems.slice(0, 8), ...photos.slice(0, 8)];
  await scene('2-bridge', T.bridge, T.library, `<canvas id="gl" width="1920" height="1080" style="position:absolute;inset:0"></canvas><script type="module" src="http://reel.local/reel-bridge.js"></script>`, 'cut', null, {
    three: true,
    ready: async () => {
      await stage.waitForFunction(() => window.bridge, null, { timeout: 20000 });
      await stage.evaluate((o) => window.bridge.init(o), { bracket: bracketPng, screen: libFirst, cards: cardPics.filter(Boolean), mode: 'open' });
    },
    over: copy('<em>Esportra AIR</em> carries it to air.', { d: 1.7, out: 5.2, cls: 'c', style: 'bottom:auto;top:880px;font-size:66px' }) + copy('Nothing typed twice.', { d: 5.6, out: 8.9, cls: 'c', style: 'bottom:auto;top:880px;font-size:66px' }),
    key: 0.45,
  });

  // ═════ 3 · Teams, players, sponsors, talent (16.35–21.76 s) ═════
  function libraryHtml() {
    const ph = (k) => photos[k] || '';
    const pcard = (k, d) => `<div class="pop" style="--d:${d}s;width:176px;border-radius:16px;overflow:hidden;background:#101728;border:1px solid rgba(255,255,255,.1)"><div style="height:176px;background:${ph(k) ? `url('${ph(k)}') center bottom/cover no-repeat,` : ''} radial-gradient(80% 80% at 50% 30%,#2b3a63,#121a2e)"></div><div style="padding:10px 12px;font:700 18px Poppins">NOW_${['ACE', 'ROOK', 'VEX', 'KAI', 'ZEN'][k]}</div></div>`;
    const sponsor = (n, c, d) => `<div class="pop" style="--d:${d}s;height:78px;padding:0 24px;display:flex;align-items:center;border-radius:14px;background:#101728;border:1px solid rgba(255,255,255,.1);font:800 26px Poppins;letter-spacing:.04em;color:${c}">${n}</div>`;
    const talent = (k, n, d) => `<div class="pop" style="--d:${d}s;display:flex;align-items:center;gap:16px;padding:12px 20px 12px 12px;border-radius:16px;background:#101728;border:1px solid rgba(255,255,255,.1)"><div style="width:84px;height:84px;border-radius:50%;background:#1a2236 ${talents[k] ? `url('${talents[k]}') center/cover` : ''}"></div><div><div style="font:700 22px Poppins">${n}</div><div style="font:600 15px Poppins;letter-spacing:.14em;color:#8fa0c4">CASTER</div></div></div>`;
    return `<div style="position:absolute;left:120px;top:150px;width:560px;padding:34px;border-radius:24px;background:linear-gradient(160deg,#141c30,#0c111e);border:1px solid rgba(255,255,255,.1)" class="rise">
        <div style="font:700 16px Poppins;letter-spacing:.24em;color:#8fa0c4">TEAM</div>
        <div style="display:flex;align-items:center;gap:26px;margin-top:20px"><img class="pop" src="${emblems[0]}" style="--d:.25s;width:170px;height:170px"><div><div style="font:800 48px/1 Poppins">NIGHT OWLS</div><div style="margin-top:10px;display:inline-block;padding:6px 12px;border-radius:8px;background:#22d3ee;color:#05070d;font:800 18px Poppins;letter-spacing:.12em">NOW</div></div></div>
        <div style="margin-top:28px;font:700 16px Poppins;letter-spacing:.24em;color:#8fa0c4">PLAYERS</div></div>
      <div style="position:absolute;left:120px;top:560px;display:flex;gap:18px">${[0, 1, 2, 3, 4].map((k) => pcard(k, 0.55 + k * 0.12)).join('')}</div>
      <div style="position:absolute;left:1180px;top:150px;font:700 16px Poppins;letter-spacing:.24em;color:#8fa0c4" class="rise">SPONSORS</div>
      <div style="position:absolute;left:1180px;top:190px;display:flex;flex-direction:column;gap:14px;width:600px">${sponsor('VOLT ENERGY', '#ffb60e', 1.3)}${sponsor('KITE NETWORK', '#38bdf8', 1.42)}${sponsor('NOVA GEAR', '#f43f5e', 1.54)}</div>
      <div style="position:absolute;left:1180px;top:520px;font:700 16px Poppins;letter-spacing:.24em;color:#8fa0c4" class="rise">TALENT</div>
      <div style="position:absolute;left:1180px;top:560px;display:flex;flex-direction:column;gap:14px">${talent(0, 'SAM "ECHO" REYES', 1.9)}${talent(1, 'MAYA LIN', 2.05)}</div>`;
  }
  await scene('3-library', T.library, T.veto, libHtml, 'cut', null, {
    cam: [[0, 1.0, 960, 540], [F(5.4), 1.06, 900, 520]],
    over: copy('Teams. Players. Sponsors. Talent.', { d: 0.15, out: 2.6, cls: 'c', style: 'bottom:auto;top:920px;font-size:60px' }) + copy('Build it once. <em>On every graphic.</em>', { d: 2.8, out: 99, cls: 'c', style: 'bottom:auto;top:920px;font-size:60px' }),
  });

  // ═════ 4 · Valorant (21.76–32.4 s): overlay-bar veto → overlay-bar agent select → the HUD, played out ═════
  const P0 = clone(sample.players).map((team) => team.map((p) => ({ ...p, alive: true, hp: 100, armor: 50 })));
  const vbase = { teams: vteams, event: { ...sample.event, bestOf: 3 }, killfeed: [], banner: { type: '', team: 1, player: 0, text: '', method: '', ts: 0, hold: 4200 }, show: { economy: 'auto', roundRecap: false, scoreboard: false } };
  await patchRoom(VAL, { ...vbase, veto: [], vetoTurn: null, players: P0.map((t) => t.map((p) => ({ ...p, locked: false, agent: '' }))) });
  await action(VAL, 'fullscreen.show', { screen: 'map-veto', style: 'band' });
  const vetoSteps = clone(sample.veto);
  const host = (room) => `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/fullscreen.html?match=${room}&over=1`)}</div>`;
  await scene('4a-veto', T.veto, T.agents, host(VAL), 'zoom', async (i) => {
    const k = Math.floor((i - F(0.35)) / F(0.42)) + 1;
    if (i >= F(0.35) && (i - F(0.35)) % F(0.42) === 0 && k <= vetoSteps.length) { await patchRoom(VAL, { veto: vetoSteps.slice(0, k) }); await sleep(120); }
  }, { cam: push(3.64, 1.0, 1.04, 960, 760), over: tag('VALORANT') });

  // agent select: everyone hovering an agent, then locking in one after another
  const agentsP = P0.map((t) => t.map((p) => ({ ...p, locked: false })));
  await patchRoom(VAL, { players: agentsP, veto: vetoSteps });
  await action(VAL, 'fullscreen.show', { screen: 'agent-select', style: 'band' });
  await sleep(300);
  const lockOrder = [[0, 0], [1, 0], [0, 1], [1, 2], [0, 2], [1, 1], [0, 3], [1, 3], [0, 4], [1, 4]];
  await scene('4b-agents', T.agents, T.hud, host(VAL), 'slash', async (i) => {
    const k = Math.floor((i - F(0.3)) / F(0.3));
    if (i >= F(0.3) && (i - F(0.3)) % F(0.3) === 0 && k < lockOrder.length) { const [t, s] = lockOrder[k]; agentsP[t][s].locked = true; await patchRoom(VAL, { players: agentsP }); await sleep(110); }
  }, { cam: [[0, 1.05, 960, 780], [F(3.6), 1.0, 960, 700]] });

  // the HUD, a round played fast
  await action(VAL, 'fullscreen.show', { screen: null, style: 'band' });
  const P = clone(P0);
  const teams0 = clone(vteams); teams0[0].score = 11; teams0[1].score = 11; teams0[0].series = 1; teams0[1].series = 1;
  const series0 = clone(sample.series); series0[2] = { ...series0[2], score: [11, 11], winner: null };
  const rounds0 = clone(sample.rounds).slice(0, 22);
  await patchRoom(VAL, { ...vbase, teams: teams0, series: series0, rounds: rounds0, players: P, round: { number: 23, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' } });
  const vbaseT = Date.now() + 3000, vt4 = (i) => vbaseT + (i / FPS) * 1000;
  const kf = [];
  const kill = (k, v, weapon, hs, ts) => { kf.push({ killer: k, victim: v, weapon, hs, ts }); const p = P[v[0]][v[1]]; p.alive = false; p.hp = 0; p.armor = 0; P[k[0]][k[1]].k += 1; };
  const round = {
    [F(0.35)]: (t) => { kill([1, 0], [0, 1], 'OPERATOR', false, t); return { killfeed: kf, players: P }; },
    [F(0.95)]: (t) => { kill([0, 0], [1, 1], 'VANDAL', true, t); Object.assign(P[0][0], { hp: 54, armor: 0 }); return { killfeed: kf, players: P }; },
    [F(1.5)]: (t) => ({ round: { phase: 'planted', endsAt: t + 45000 } }),
    [F(2.1)]: (t) => { kill([1, 3], [0, 2], 'PHANTOM', false, t - 200); kill([1, 3], [0, 4], 'PHANTOM', true, t); return { killfeed: kf, players: P }; },
    [F(2.6)]: (t) => { kill([1, 0], [0, 0], 'OPERATOR', false, t - 150); kill([1, 2], [0, 3], 'GHOST', true, t); const tm = clone(teams0); tm[1].score = 12; const se = clone(series0); se[2].score = [11, 12]; return { killfeed: kf, players: P, round: { number: 23, phase: 'end', endsAt: 0, remaining: 0, winner: 1, method: 'elim' }, teams: tm, series: se, rounds: [...rounds0, { w: 1, how: 'elim' }], banner: { type: 'round', team: 1, player: 0, text: '', method: 'ELIMINATION', ts: t, hold: 4200 } }; },
  };
  await scene('4c-hud', T.hud, T.drop, `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div>`, 'slashl', async (i) => {
    if (round[i]) { await patchRoom(VAL, round[i](vt4(i))); await sleep(130); }
  }, { vt: vt4, cam: [[0, 1.0, 960, 540], [F(1.4), 1.0, 960, 540], [F(2.2), 1.08, 960, 420], [F(3.4), 1.02, 960, 500]] });

  // ═════ 5 · PUBG MOBILE (32.4–45 s) ═════
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
  await scene('5c-brhud', T.brhud, T.standings, `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}</div>`, 'zoom', async (i) => { await seek(vt5(i)); }, { vt: vt5, cam: [[0, 1.0, 960, 540], [F(2.8), 1.1, 1300, 500]] });
  // standings → MVP → WWCD on the lobby's own room, each a Take
  await take('br-overall');
  await scene('5d-standings', T.standings, T.mvp, lob, 'slash', null, { cam: [[0, 1.06, 960, 600], [F(1.8), 1.0, 960, 540]] });
  await take('br-mvp');
  await scene('5e-mvp', T.mvp, T.wwcd, lob, 'zoom', null, { cam: push(1.8, 1.0, 1.05, 900, 560) });
  await take('br-wwcd');
  await scene('5f-wwcd', T.wwcd, T.studio, lob, 'cut', null, { cam: push(1.8, 1.03, 1.0, 960, 540) });

  // ═════ 6 · Graphics studio (45–53.4 s): a studio panel; the graphic on air changes as it is edited ═════
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
  const at = Object.fromEntries(plan.map(([t, fn]) => [F(t), fn]));
  // The pointer glides to the swatch or layer the next step clicks.
  const targets = [[0.0, [560, 760]], [0.5, swXY(0)], [1.3, swXY(2)], [2.3, [300, 300]], [2.9, swXY(3)], [3.8, swXY(4)], [4.9, [300, 330]], [5.4, [300, 390]], [6.0, [300, 430]], [6.7, [300, 330]], [7.1, [380, 640]], [7.6, swXY(2)]];
  await scene('6-studio', T.studio, T.close, studioHtml, 'iris', async (i) => {
    if (at[i]) { await at[i](); await sleep(170); }
    const t = i / FPS;
    let a = targets[0], b = targets[targets.length - 1];
    for (let k = 0; k < targets.length - 1; k++) if (t >= targets[k][0] && t < targets[k + 1][0]) { a = targets[k]; b = targets[k + 1]; break; }
    const u = Math.min(1, (t - a[0]) / Math.max(0.01, Math.min(0.45, b[0] - a[0])));
    const e = ease(u);
    await ptrTo([a[1][0] + (b[1][0] - a[1][0]) * e, a[1][1] + (b[1][1] - a[1][1]) * e]);
  }, { over: copy('Make every graphic <em>yours.</em>', { d: 0.2, out: 99, cls: 'top', style: 'left:72px;top:44px;font-size:56px' }), cam: push(8.4, 1.0, 1.02, 1100, 520), key: 0.92 });
  await call('lobbyTake', [lobby.id, null]);

  // ═════ 7 · More games coming, on the bridge (53.4–56.8 s) ═════
  const coming = ['apex', 'eafc', 'cs2', 'r6s', 'lol', 'dota2', 'cod', 'fortnite', 'rocket-league', 'tekken8'];
  await scene('7-close', T.close, T.end, `<canvas id="gl" width="1920" height="1080" style="position:absolute;inset:0"></canvas><script type="module" src="http://reel.local/reel-bridge.js"></script>`, 'zoom', null, {
    three: true,
    ready: async () => {
      await stage.waitForFunction(() => window.bridge, null, { timeout: 20000 });
      await stage.evaluate((o) => window.bridge.init(o), { bracket: bracketPng, screen: libFirst, cards: cardPics.slice(0, 6).filter(Boolean), posters: coming.map(POSTER), mode: 'close' });
    },
    over: copy('More games <em>coming.</em>', { d: 0.5, out: 99, cls: 'c', style: 'bottom:auto;top:900px;font-size:70px' }), key: 0.85,
  });

  // ═════ 8 · End (56.8–60 s) ═════
  const word = 'ESPORTRA AIR'.split('').map((c, i) => `<span class="w" style="animation-delay:${(0.15 + i * 0.04).toFixed(2)}s;${i > 8 ? 'color:#ffb60e' : ''}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  await scene('8-end', T.end, T.out, `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <img class="pop" src="${ICON}" style="--d:.05s;width:110px;height:110px;border-radius:24px">
      <div style="margin-top:28px;font:800 128px/1 Poppins;letter-spacing:-.03em">${word}</div>
      <div class="rise" style="--d:.9s;margin-top:28px;font:600 40px Poppins;color:#dfe4ee">From bracket to broadcast.</div></div>`, 'iris', null,
  { cam: push(3.2, 1.04, 1.0), over: '<div class="black" style="animation:cout .6s 2.6s linear reverse both"></div>', key: 0.6 });

  await browser.close();
  if (errs.length) console.warn('page errors: ' + [...new Set(errs)].slice(0, 8).join(' | '));
  if (STILLS) {
    const dir = path.join(OUT, 'stills'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    board.forEach(([, file], k) => fs.copyFileSync(file, path.join(dir, String(k).padStart(3, '0') + '.jpg')));
    const { execFileSync } = require('node:child_process');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', 'scale=640:-1,tile=4x5:padding=8:color=0x05070d', '-frames:v', '1', path.join(OUT, 'stills-board.jpg')]);
    fs.writeFileSync(path.join(OUT, 'stills.txt'), board.map(([n], k) => `${k}  ${n}`).join('\n') + '\n');
    console.log(JSON.stringify({ stills: board.length, board: path.join(OUT, 'stills-board.jpg'), cuts }));
    return;
  }
  fs.writeFileSync(path.join(OUT, 'cuts.txt'), `${cuts.join('\n')}\n${(rec.frames / FPS).toFixed(3)}s  end\n`);
  const silent = path.join(OUT, 'picture-16x9.mp4');
  kit.encode(rec.dir, silent);
  const mp4 = path.join(OUT, 'esportra-air-showreel-16x9.mp4'), vert = path.join(OUT, 'esportra-air-showreel-9x16.mp4');
  const { execFileSync } = require('node:child_process');
  // The track under the picture, plus CC0 sound effects on the transitions (dev/reel-mix.cjs; REEL_SFX = their folder).
  if (MUSIC) require('./reel-mix.cjs').mix(silent, MUSIC, process.env.REEL_SFX || '', mp4, undefined, T.out);
  else fs.copyFileSync(silent, mp4);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-filter_complex', '[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', String(FPS), '-c:a', 'copy', '-movflags', '+faststart', vert]);
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(silent, 0.5), cuts }));
})().catch((e) => { console.error(e); process.exit(1); });
