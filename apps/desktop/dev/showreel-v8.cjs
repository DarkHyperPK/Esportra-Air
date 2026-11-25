// Esportra AIR · "From bracket to broadcast" (reel v8, 25 Nov, the producer's brief). 60 s on "Unstoppable Force"
// (Universfield, CC BY 4.0; ~99 BPM; cuts land on its hits). The story: a tournament runs on data no one sees. Hosted
// on Esportra, it all comes in (the ops wall); running your own match, the producer builds the team once in Air's real
// Teams/Players screen. Either way the data becomes graphic: the team just made and Esportra's veto fly into the
// overlay-bar match intro and map veto. Valorant plays out (agent select, a round on the HUD), then PUBG MOBILE (drop
// map, today's maps, HUD, standings, MVP, WWCD), Graphics studio edits land on air, and more games are coming.
// Every graphic is an Air page fed through Air's own paths (dev/reel-setup.cjs); every frame is stepped and clocks
// pinned (dev/rec-kit.cjs). Plan: concept, storyboard and plumbing agreed with the producer, 25 Nov.
//   NODE_USE_ENV_PROXY=1 AIR_DEV_PACK=<local pack dir> node dev/host.ts --port 5334 --engine-port 5396 &
//   REEL_MUSIC=<track.mp3> REEL_SFX=<sfx dir> REEL_PHOTOS=<9 player cutouts, 00–08.png> REEL_TALENT=<2 talent photos> \
//     node dev/showreel-v8.cjs [host] [engine port] <out dir> [--stills]
// Posters and the Esportra icon are read from the Esportra website's assets (../esportra/public); player and talent
// photos are the producer's (dev/reel-portraits.py prepares them); team emblems are drawn by dev/reel-emblems.cjs.
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
const OUT = args[2] || path.join(process.cwd(), 'showreel-v8');
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
  ops: 0, team: 6.6, payoff: 16.35, vetoPay: 18.9, agents: 21.76, hud: 25.4, drop: 32.4, today: 34.8, brhud: 36.76,
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
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const scratch = await ctx.newPage();
  const emblems = [];
  for (let i = 0; i < S.NAMES.length; i++) emblems[i] = 'data:image/png;base64,' + (await E.png(scratch, E.svg(i, S.TAGS[i], S.COLORS[i % S.COLORS.length]))).toString('base64');
  await scratch.close();
  const files = (dir) => (dir ? fs.readdirSync(dir).filter((f) => /^\d+\.png$/i.test(f)).sort().map((f) => path.join(dir, f)) : []);
  const photoFiles = files(PHOTOS), talentFiles = files(TALENT);
  const photos = photoFiles.map((f) => dataUrl(f)), talents = talentFiles.map((f) => dataUrl(f));
  // The producer's portraits (dev/reel-portraits.py order): 00 NAVID, 01 SiNiSTER, 02 Gen.G, 03 Inside Games, 04 green
  // jersey, 05 Dragon Rangers, 06 Alternate, 07 ahq, 08 DN. The Valorant team made on camera uses 00, 03, 01; PUBG's
  // NOCTURNE KAI (the MVP) uses 08 and NORTH TIDE (the winners: MVP side cards) 05, 07, 06; RIKU 02 and ECHO 04 complete
  // the Valorant line-up. All nine portraits are on screen, none twice.
  const MADE = [{ name: 'JUNO', riot: 'Juno#NOW', role: 'Duelist', photo: 0 }, { name: 'MIRA', riot: 'Mira#NOW', role: 'Controller', photo: 3 }, { name: 'DAX', riot: 'Dax#NOW', role: 'Initiator', photo: 1 }];
  const pubgPhoto = (i, j) => (i === 0 && j === 3 ? photos[8] : i === 5 ? [photos[5], photos[7], photos[6], null][j] : null) || null;
  // The library holds one team per name across games: the PUBG lobby's first team is NOCTURNE, so NIGHT OWLS is made new.
  const names = [...S.NAMES], tags = [...S.TAGS]; names[0] = 'NOCTURNE'; tags[0] = 'NCT';

  // ═════ Off camera: the producer's data, through Air (dev/reel-setup.cjs) ═════
  const d = await S.prepare(h, { names, tags, logo: (i) => emblems[i], photo: pubgPhoto });
  const { lobby, code, states, wwcdAt, fbAt } = d;
  await call('lobbyShow', [lobby.id, { pick: { scope: 'match', game: 1 } }]);
  await kit.prepare(ctx);
  const { sample, wall, seek, resetReplay } = await S.dress(h, ctx, d);

  const stage = await ctx.newPage();
  const errs = []; stage.on('pageerror', (e) => errs.push('stage: ' + e.message));
  const rec = kit.recorder(path.join(OUT, STILLS ? 'stills-raw' : 'frames'));
  const src = kit.recorder(path.join(OUT, 'src-unused'));
  const board = [], cuts = [];
  const liveShot = {};
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


  // ═════ 1 · Ops wall (0–6.6 s): the data a tournament runs on, hosted on Esportra ═════
  const tile = (k, label, body, extra = '') => `<div class="ow-t rise" style="--d:${(0.15 + k * 0.12).toFixed(2)}s;${extra}"><div class="ow-l">${label}</div>${body}</div>`;
  const swap = (a, b, at, cls = '') => `<span class="ow-sw ${cls}"><span class="a" style="animation-delay:${at}s">${a}</span><span class="b" style="animation-delay:${at}s">${b}</span></span>`;
  const okMark = '<b class="ok">✓</b>';
  const opsTiles = [
    tile(0, 'CHECK-IN', `<div class="ow-r"><img src="${emblems[0]}"><b>NIGHT OWLS</b><span>5/5</span>${okMark}<i>14:02</i></div><div class="ow-r"><img src="${emblems[1]}"><b>CRIMSON FIVE</b>${swap('<span>4/5</span><i class="wait">waiting</i>', `<span>5/5</span>${okMark}<i>14:06</i>`, 3.0)}</div><div class="ow-r dim"><img src="${emblems[2]}"><b>IRON PINE</b><span>5/5</span>${okMark}<i>13:58</i></div>`),
    tile(1, 'RIOT IDs · VERIFIED BY ESPORTRA', MADE.map((p, k) => `<div class="ow-r mono"><b>${p.riot}</b>${swap('<i class="wait">verifying…</i>', `${okMark}<i>verified</i>`, 1.7 + k * 0.32)}<em>puuid ${['3f9c…a71b', '81d0…4e2c', 'c27a…90f1'][k]}</em></div>`).join('')),
    tile(2, 'SCHEDULE', [['UB SEMI-FINAL', '15:00', 'Bo3'], ['LB ROUND 2', '16:30', 'Bo3'], ['GRAND FINAL', '19:00', 'Bo5']].map(([a, b, c], k) => `<div class="ow-r ${k ? 'dim' : ''}"><b>${a}</b><span>${b}</span><i class="pill">${c}</i></div>`).join('')),
    tile(3, 'COIN TOSS', `<div class="ow-coin"><span class="coin" style="animation-delay:.9s">◎</span>${swap('<i class="wait">flipping…</i>', '<b>CRF</b> won · <span class="acc">Go first</span>', 2.0)}</div>`),
    tile(4, 'VETO SEQUENCE · Bo3', `<div class="ow-seq">${['BAN', 'BAN', 'PICK', 'PICK', 'BAN', 'BAN', 'DEC'].map((s, k) => `<i class="${s === 'PICK' ? 'pk' : s === 'DEC' ? 'dc' : ''}" style="animation-delay:${(1.1 + k * 0.42).toFixed(2)}s">${s}</i>`).join('')}</div><div class="ow-turn">TURN · <b>CRF</b> · <span id="owTimer" class="mono">0:28</span></div>`),
    tile(5, 'MAP POOL', `<div class="ow-pool">${['SPLIT', 'ABYSS', 'HAVEN', 'SUNSET', 'ASCENT', 'SUMMIT', 'LOTUS'].map((m) => `<i class="${m === 'SPLIT' || m === 'ABYSS' ? 'x' : ''}" style="animation-delay:${m === 'SPLIT' ? 1.4 : 1.8}s">${m}</i>`).join('')}</div>`),
    tile(6, 'BRACKET · UPPER', `<svg viewBox="0 0 360 150" class="ow-br"><g class="ln">${[[10, 20, 120, 45], [10, 70, 120, 45], [10, 100, 120, 125], [10, 150, 120, 125], [130, 45, 240, 85], [130, 125, 240, 85], [250, 85, 350, 85]].map(([x1, y1, x2, y2], k) => `<path style="animation-delay:${(0.9 + k * 0.18).toFixed(2)}s" d="M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}"/>`).join('')}</g></svg>`),
    tile(7, 'SCORING · PUBG MOBILE', `<div class="ow-sc">${[10, 6, 5, 4, 3, 2, 1, 1].map((p, k) => `<div><i style="height:${p * 9}px;animation-delay:${(1.0 + k * 0.08).toFixed(2)}s"></i><b>${p}</b><span>${k + 1}</span></div>`).join('')}</div><div class="ow-note">+1 per elimination</div>`),
    tile(8, 'TIEBREAKS', `<div class="ow-tb">${['Wins', 'Placement pts', 'Elims', 'Last game'].map((t, k) => `<i style="animation-delay:${(1.2 + k * 0.2).toFixed(2)}s">${k + 1}. ${t}</i>`).join('')}</div>`),
    tile(9, 'SPONSORS', [['VOLT ENERGY', 'Title', 3, '#ffb60e'], ['KITE NETWORK', 'Partner', 2, '#38bdf8'], ['NOVA GEAR', 'Supporter', 1, '#f43f5e']].map(([n, t, x, c]) => `<div class="ow-r"><b style="color:${c}">${n}</b><span>${t}</span><i class="pill">×${x}</i></div>`).join('')),
    tile(10, 'CASTERS', `<div class="ow-cast">${['SAM "ECHO" REYES', 'MAYA LIN'].map((n, k) => `<div><span style="background-image:url('${talents[k] || ''}')"></span><b>${n}</b></div>`).join('')}</div><div class="ow-note">assigned · UB SEMI-FINAL</div>`),
    tile(11, 'RESULTS · TO ESPORTRA', `<div class="ow-r"><b>MAP 2</b><span>NOW 13–9 CRF</span></div><div class="ow-r">${swap('<i class="pill wait">proposed</i>', `<i class="pill ok">applied ✓</i>`, 4.4)}</div><div class="ow-r dim"><b>MAP 1</b><span>NOW 11–13 CRF</span><i class="pill ok">applied ✓</i></div>`),
  ];
  const opsCss = `<style>
    .ow{position:absolute;left:96px;top:96px;display:grid;grid-template-columns:repeat(4,414px);grid-auto-rows:280px;gap:24px}
    .ow-t{position:relative;border-radius:14px;background:#0f1526;border:1px solid rgba(255,255,255,.08);padding:22px 24px;overflow:hidden;font-family:Poppins}
    .ow-l{font:700 13px Poppins;letter-spacing:.2em;color:#8fa0c4;margin-bottom:16px}
    .ow-r{display:flex;align-items:center;gap:10px;height:40px;font:600 17px Poppins;color:#e7ecf6}.ow-r.dim{opacity:.55}
    .ow-r img{width:30px;height:30px}.ow-r b{font-weight:700}.ow-r span{margin-left:auto;color:#c8d0e4}.ow-r i{font-style:normal;color:#8fa0c4;font-size:14px}
    .ow-r.mono b{font:600 18px 'JetBrains Mono',ui-monospace,monospace}.ow-r em{position:absolute;right:24px;font:500 11px ui-monospace,monospace;color:#3e4b68;margin-top:30px}
    .ok{color:#34d399}.wait{color:#ffb60e}.acc{color:#ffb60e}.mono{font-family:ui-monospace,monospace}
    .pill{padding:3px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.18);font:700 13px Poppins!important;color:#c8d0e4!important}.pill.ok{border-color:#34d399;color:#34d399!important}.pill.wait{border-color:#ffb60e;color:#ffb60e!important}
    .ow-sw{position:relative;display:inline-flex;align-items:center;gap:10px;margin-left:auto}.ow-sw .a,.ow-sw .b{display:inline-flex;align-items:center;gap:10px}
    .ow-sw .a{animation:owA .01s both}.ow-sw .b{position:absolute;right:0;white-space:nowrap;animation:owB .3s both}
    @keyframes owA{to{opacity:0}}@keyframes owB{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:none}}
    .ow-coin{display:flex;align-items:center;gap:18px;font:600 20px Poppins}.ow-coin .coin{font-size:64px;color:#ffb60e;display:inline-block;animation:coin 1s cubic-bezier(.3,.6,.4,1) both}
    @keyframes coin{0%{transform:rotateY(0)}100%{transform:rotateY(1440deg)}}
    .ow-seq{display:flex;gap:6px;flex-wrap:wrap}.ow-seq i{font-style:normal;padding:10px 0;width:48px;text-align:center;border-radius:8px;border:1px solid rgba(255,255,255,.16);font:800 13px Poppins;color:#5b6987;animation:fillin .25s both}
    .ow-seq i.pk{--fc:#22d3ee}.ow-seq i.dc{--fc:#ffb60e}@keyframes fillin{to{background:var(--fc,#f43f5e);color:#05070d;border-color:transparent}}
    .ow-turn{margin-top:26px;font:600 16px Poppins;color:#c8d0e4}.ow-turn span{color:#ffb60e;font-size:22px;margin-left:6px}
    .ow-pool{display:flex;flex-wrap:wrap;gap:8px}.ow-pool i{font-style:normal;padding:8px 12px;border-radius:8px;background:#151e33;font:700 15px Poppins;color:#dbe3f2;position:relative}
    .ow-pool i.x{animation:strike .3s both}@keyframes strike{to{color:#5b6987;text-decoration:line-through;text-decoration-color:#f43f5e;text-decoration-thickness:3px}}
    .ow-br{width:100%;height:170px}.ow-br .ln path{fill:none;stroke:#3b4a72;stroke-width:3;stroke-dasharray:300;stroke-dashoffset:300;animation:draw .5s forwards}.ow-br .ln path:last-child{stroke:#ffb60e}
    @keyframes draw{to{stroke-dashoffset:0}}
    .ow-sc{display:flex;align-items:flex-end;gap:10px;height:120px}.ow-sc div{display:flex;flex-direction:column;align-items:center;gap:4px;font:700 14px Poppins}.ow-sc i{width:30px;border-radius:4px 4px 0 0;background:linear-gradient(#ffb60e,#b47b00);transform-origin:bottom;animation:grow .4s both}.ow-sc span{color:#5b6987;font-size:12px}
    @keyframes grow{0%{transform:scaleY(0)}100%{transform:none}}.ow-note{margin-top:14px;font:600 15px Poppins;color:#8fa0c4}
    .ow-tb{display:flex;flex-direction:column;gap:8px}.ow-tb i{font-style:normal;padding:9px 14px;border-radius:8px;background:#151e33;font:600 16px Poppins;animation:tbin .3s both}@keyframes tbin{0%{opacity:0;transform:translateX(-14px)}100%{opacity:1;transform:none}}
    .ow-cast{display:flex;gap:22px}.ow-cast div{display:flex;flex-direction:column;align-items:center;gap:10px;font:700 15px Poppins}.ow-cast span{width:96px;height:96px;border-radius:50%;background:#1a2236 center/cover;box-shadow:0 0 0 3px #ffb60e}
    .ow-band{position:absolute;left:0;right:0;bottom:0;height:330px;z-index:30;background:linear-gradient(0deg,rgba(5,7,13,.98) 0%,rgba(5,7,13,.9) 50%,transparent 100%)}
  </style>`;
  const opsHtml = `${opsCss}<div class="ow">${opsTiles.join('')}</div>`;
  await scene('1-ops', T.ops, T.team, opsHtml, 'cut', async (i) => {
    // the turn timer counts down, as Esportra's veto room does
    const t = i / FPS, left = Math.max(0, 28 - Math.floor(Math.max(0, t - 1.0) * 2.5));
    await stage.evaluate((s) => { const e = document.getElementById('owTimer'); if (e) e.textContent = s; }, `0:${String(left).padStart(2, '0')}`);
  }, {
    cam: [[0, 1.0, 960, 540], [F(6.6), 1.06, 741, 540]],
    over: `<div class="ow-band"></div>${copy('Every tournament runs on data <em>no one sees.</em>', { d: 0.6, out: 3.4, cls: 'c', style: 'bottom:auto;top:900px;font-size:64px' })}${copy('Hosted on Esportra? <em>It all comes in.</em>', { d: 3.6, out: 6.35, cls: 'c', style: 'bottom:auto;top:900px;font-size:64px' })}`,
    key: 0.5,
  });

  // ═════ 2 · Make the team in AIR (6.6–16.35 s): the real Teams/Players screen, standalone mode ═════
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2.5 });  // sharp crops; 1 app px = 1.5 stage px whatever the scale
  await kit.prepare(appCtx);
  const app = await appCtx.newPage(); app.on('pageerror', (e) => errs.push('app: ' + e.message));
  await call('chooseGame', ['valorant']);
  await app.goto(`${H}/?host=${H}`); await app.locator('nav.rail').waitFor();
  const ui = kit.chrome(app, FONTS); await ui.dress();
  await app.locator('nav[aria-label="Main"]').getByRole('button', { name: 'Teams/Players' }).click(); await app.waitForTimeout(600);
  await app.getByRole('tab', { name: 'Teams' }).click(); await app.waitForTimeout(300);
  ui.pos = [760, 560]; await ui.place();
  // Files the producer would pick: the owl emblem and the three portraits.
  const tmp = path.join(OUT, 'picks'); fs.mkdirSync(tmp, { recursive: true });
  const owlFile = path.join(tmp, 'night-owls.png'); fs.writeFileSync(owlFile, Buffer.from(emblems[0].split(',')[1], 'base64'));

  // The app scene: every frame is Air's own picture (1280×720 at 1.5×), full frame or a hard-cut crop of it.
  let crop = { x: 0, y: 0, w: 1280 };
  const cropOn = async (loc, w = 560, dy = 0) => {
    const b = await loc.boundingBox(); const hgt = (w * 9) / 16;
    crop = { x: Math.min(1280 - w, Math.max(0, b.x + b.width / 2 - w / 2)), y: Math.min(720 - hgt, Math.max(0, b.y + b.height / 2 - hgt / 2 + dy)), w };
  };
  const full = () => { crop = { x: 0, y: 0, w: 1280 }; };
  const appStill = async () => 'data:image/jpeg;base64,' + (await src.grab(app)).toString('base64');
  let appN = 0;
  const appFrame = async () => {
    const b64 = (await src.grab(app)).toString('base64'), k = 1280 / crop.w;
    await stage.evaluate(async ([b64, tf]) => { const img = document.getElementById('appimg'); img.src = 'data:image/jpeg;base64,' + b64; img.style.transform = tf; await img.decode().catch(() => {}); },
      [b64, `translate(${(-crop.x * 1.5 * k).toFixed(2)}px,${(-crop.y * 1.5 * k).toFixed(2)}px) scale(${k.toFixed(5)})`]);
    const shoot = !STILLS || appN === appKey || (process.env.REEL_APPSTILLS && appN % 12 === 0);
    await rec.frame(stage, null, shoot);
    if (STILLS && shoot) board.push(['2-team', lastFrame()]);
    appN++;
  };
  const film = { run: async (_p, count, each) => { for (let k = 0; k < count; k++) { if (each) await each(k); await appFrame(); } } };
  const N2 = F(T.payoff) - F(T.team), appKey = Math.floor(N2 * 0.93);
  await stage.setContent(`<!doctype html><html><head><style>${CSS(FONTS)}
    .tr.shrink{animation:shrink .5s cubic-bezier(.6,0,.3,1) both;transform-origin:50% 50%}@keyframes shrink{0%{transform:none;opacity:1}100%{transform:scale(.3);opacity:0}}
    .in.grow{animation:growin .5s cubic-bezier(.15,.85,.25,1) both}@keyframes growin{0%{transform:scale(1.25)}100%{transform:none}}
    #appimg{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}</style></head><body><div class="bg"></div>
    <div class="${STILLS ? 'in' : 'in grow'}" id="wrap"><div id="cam"><img id="appimg"></div></div>
    <div id="over"><div class="copyband" style="position:absolute;left:0;right:0;bottom:0;height:260px;z-index:30;background:linear-gradient(0deg,rgba(5,7,13,.92),transparent);animation:cout .35s 2.95s ease-in both"></div>${copy('Running your own match? <em>Build the team once.</em>', { d: 0.3, out: 2.9, cls: 'c', style: 'bottom:auto;top:930px;font-size:58px' })}</div>
    ${STILLS ? '' : `<img class="tr shrink" src="${dataUrl(lastFrame(), 'image/jpeg')}">`}</body></html>`, { waitUntil: 'load' });
  await stage.evaluate(() => document.fonts.ready);
  cuts.push(`${(rec.frames / FPS).toFixed(3)}s  2-team`);
  // a · Add team. Each crop is a hard cut, framed from the drawer's top edge so its title and fields sit whole.
  const cropTop = async (dlg, loc, w, pad = 36) => {
    const d0 = await dlg.boundingBox(), b = await loc.boundingBox(), hgt = (w * 9) / 16;
    crop = { x: Math.min(1280 - w, Math.max(0, d0.x + d0.width / 2 - w / 2)), y: Math.min(720 - hgt, Math.max(0, b.y - pad)), w };
  };
  await film.run(app, 4);
  await ui.click(film, app.getByRole('button', { name: 'Add team' }), { frames: 10, after: 6 });
  const drawer = app.getByRole('dialog', { name: 'Add a team' });
  const logoBtn = drawer.getByRole('button', { name: /logo of/i }).first();
  await cropTop(drawer, logoBtn, 600, 40);
  await ui.point(film, logoBtn, 8);
  await drawer.locator('input[type=file]').first().setInputFiles(owlFile);
  await app.getByRole('button', { name: /Change logo/i }).first().waitFor();
  await film.run(app, 7);
  await ui.type(film, drawer.getByLabel('Name', { exact: true }), 'NIGHT OWLS', { per: 2 });
  await ui.type(film, drawer.getByLabel('Tag'), 'NOW', { per: 2 });
  await film.run(app, 3);
  full();
  await ui.click(film, drawer.getByRole('button', { name: 'Save' }), { frames: 10, after: 7 });
  await app.getByRole('button', { name: 'Add a player to NIGHT OWLS' }).waitFor();
  // b · Three players: the first step by step, the next two quickly
  for (const [k, p] of MADE.entries()) {
    const quick = k > 0;
    const add = app.getByRole('button', { name: 'Add a player to NIGHT OWLS' });
    full();
    await ui.click(film, add, { frames: quick ? 8 : 10, after: quick ? 4 : 5 });
    const pd = app.getByRole('dialog', { name: 'Add a player' });
    const photoBtn = pd.getByRole('button', { name: /photo of/i }).first();
    await cropTop(pd, photoBtn, quick ? 720 : 600, 40);
    if (!quick) await ui.point(film, photoBtn, 7);
    await pd.locator('input[type=file]').first().setInputFiles(photoFiles[p.photo]);
    await pd.getByRole('button', { name: /Change photo/i }).first().waitFor();
    if (quick) {
      await film.run(app, 4);
      await ui.type(film, pd.getByLabel('Name on air'), p.name, { per: 1 });
      await pd.getByLabel('In-game name').fill(p.riot); await pd.getByLabel('Role').selectOption({ label: p.role });
      await film.run(app, 4);
    } else {
      await film.run(app, 4);
      await ui.type(film, pd.getByLabel('Name on air'), p.name, { per: 2 });
      await cropTop(pd, pd.getByLabel('In-game name'), 600, 60);
      await ui.type(film, pd.getByLabel('In-game name'), p.riot, { per: 1 });
      await ui.point(film, pd.getByLabel('Role'), 6); await pd.getByLabel('Role').selectOption({ label: p.role }); await film.run(app, 4);
    }
    full();
    await ui.click(film, pd.getByRole('button', { name: 'Save' }), { frames: quick ? 6 : 8, after: quick ? 4 : 6 });
  }
  // c · The team, done
  full(); ui.pos = [1250, 700]; await ui.place();
  if (appN > N2) console.warn(`2-team: ${appN - N2} frames over`);
  while (appN < N2) await film.run(app, 1);
  // Where the team's pieces sit in Air's picture, for the flights that follow (stage pixels = app pixels × 1.5).
  const sec = app.locator('section[aria-label="NIGHT OWLS"]');
  const box = async (loc) => { const b = await loc.boundingBox(); return b ? { x: b.x * 1.5, y: b.y * 1.5, w: b.width * 1.5, h: b.height * 1.5 } : null; };
  const fromLogo = await box(sec.locator('img').first()), fromName = await box(sec.locator('h2').first());
  const fromPhotos = []; for (let k = 0; k < 3; k++) fromPhotos.push(await box(sec.locator('.tp-player img').nth(k)));
  const lastApp = lastFrame();

  // ═════ 3 · Data becomes graphic (16.35–21.76 s): both modes on air ═════
  // a · The team just made, from Air's library into the Valorant room (as a standalone match gets it).
  const lib = await call('snapshot');
  const made = lib.library.teams.find((t) => t.name === 'NIGHT OWLS');
  const madePlayers = MADE.map((p) => lib.library.players.find((x) => x.name === p.name && x.teamId === made.id));
  const vteams = clone(sample.teams); Object.assign(vteams[0], { name: made.name, tag: made.tag, color: made.color, logo: made.logo });
  const vlogo1 = d.logos[1]; vteams[1].logo = vlogo1;
  const P0 = clone(sample.players).map((team) => team.map((p) => ({ ...p, alive: true, hp: 100, armor: 50 })));
  madePlayers.forEach((p, k) => { Object.assign(P0[0][k], { name: p.name, photo: p.photo }); });
  // The rest of the line-up gets the producer's other portraits too (02 Gen.G, 04 green jersey), so every face on screen is a real player.
  for (const [k, f] of [[3, 2], [4, 4]]) if (photos[f]) P0[0][k].photo = await call('uploadImage', [photos[f]]);
  const vbase = { teams: vteams, event: { ...sample.event, bestOf: 3, logo: await call('uploadImage', [ICON]) }, killfeed: [], banner: { type: '', team: 1, player: 0, text: '', method: '', ts: 0, hold: 4200 }, show: { economy: 'auto', roundRecap: false, scoreboard: false } };
  await patchRoom(VAL, { ...vbase, veto: [], vetoTurn: null, players: P0 });
  await action(VAL, 'fullscreen.show', { screen: 'match-intro', style: 'band' });
  await sleep(300);
  const host = (room) => `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/fullscreen.html?match=${room}&over=1`)}</div>`;
  /** Rects of elements inside the host page, measured with its entrance finished (the recorder restarts it at frame 0). */
  const rectsOf = async (sels) => {
    const f = stage.frames()[1];
    return f.evaluate((sels) => { document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }); return sels.map((q) => { const [sel, n] = q; const e = document.querySelectorAll(sel)[n || 0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); }, sels);
  };
  /** A chip that flies from one rect to another (stage pixels), lands and fades into the element it became. */
  const chip = (id, from, to, inner, t0, dur = 0.6, round0 = '50%', round1 = '4px') => {
    if (!from || !to) return '';
    const sx = from.w / to.w, sy = from.h / to.h, dx = from.x - to.x, dy = from.y - to.y;
    return `<style>@keyframes ${id}{0%{transform:translate(${dx}px,${dy}px) scale(${sx},${sy});border-radius:${round0};opacity:1}82%{opacity:1}100%{transform:none;border-radius:${round1};opacity:0}}</style>
      <div style="position:absolute;z-index:60;left:${to.x}px;top:${to.y}px;width:${to.w}px;height:${to.h}px;transform-origin:0 0;overflow:hidden;box-shadow:0 0 0 2px #ffb60e,0 0 28px rgba(255,182,14,.6);animation:${id} ${dur}s ${t0}s cubic-bezier(.55,0,.2,1) both">${inner}</div>`;
  };
  await scene('3a-intro', T.payoff, T.vetoPay, host(VAL), 'cut', null, {
    ready: async () => {
      const [logo, nm, f0, f1, f2] = await rectsOf([['.bd-row.end .bd-mark'], ['.bd-row.end .bd-tname b'], ['.bd-lineup[data-team="0"] .bd-face', 0], ['.bd-lineup[data-team="0"] .bd-face', 1], ['.bd-lineup[data-team="0"] .bd-face', 2]]);
      const chips = [
        chip('cLogo', fromLogo, logo, `<img src="${emblems[0]}" style="width:100%;height:100%">`, 0.08, 0.6, '8px', '6px'),
        chip('cName', fromName, nm, `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:flex-end;font:800 ${Math.round(nm ? nm.h * 0.8 : 30)}px Poppins;color:#fff;white-space:nowrap">NIGHT OWLS</div>`, 0.16, 0.6, '6px', '2px'),
        ...[f0, f1, f2].map((r, k) => chip(`cP${k}`, fromPhotos[k], r, `<div style="width:100%;height:100%;background:url('${photos[MADE[k].photo]}') 50% 4%/auto 190% no-repeat,#123a4a"></div>`, 0.26 + k * 0.1)),
      ];
      // the frame the flights leave from: the last picture of Air, fading under them
      await stage.evaluate(([html, under]) => { const o = document.getElementById('over'); document.getElementById('cam').insertAdjacentHTML('beforeend', html); if (under) o.insertAdjacentHTML('afterbegin', `<img src="${under}" style="position:absolute;inset:0;width:1920px;height:1080px;z-index:55;animation:cout .45s .05s ease-in both">`); }, [chips.join(''), STILLS ? '' : dataUrl(lastApp, 'image/jpeg')]);
    },
    over: copy('Either way, <em>it\'s on every graphic.</em>', { d: 0.55, out: 99, cls: 'c', style: 'bottom:auto;top:90px;font-size:58px' }),
    cam: [[0, 1.0, 960, 540], [F(2.55), 1.04, 960, 700]], key: 0.8,
  });

  // b · Esportra's veto, step by step onto the overlay-bar map veto (the hosted mode on air)
  await action(VAL, 'fullscreen.show', { screen: 'map-veto', style: 'band' });
  await sleep(300);
  const vetoSteps = clone(sample.veto);
  const nameOf = (st) => (st.team === 0 ? vteams[0].tag : st.team === 1 ? vteams[1].tag : 'DECIDER');
  const vLand = vetoSteps.map((_, k) => 0.2 + k * 0.33 + 0.45);
  await scene('3b-veto', T.vetoPay, T.agents, host(VAL), 'slash', async (i) => {
    const k = vLand.findIndex((t) => F(t) === i);
    if (k >= 0) { await patchRoom(VAL, { veto: vetoSteps.slice(0, k + 1) }); await sleep(110); }
  }, {
    ready: async () => {
      const tiles = await rectsOf(vetoSteps.map((_, k) => ['.bd-vgrid .bd-vcol', k]));
      const html = vetoSteps.map((st, k) => {
        const to = tiles[k]; if (!to) return '';
        const w = 230, hh = 64, from = { x: k % 2 ? 1920 + 40 : -w - 40, y: Math.max(40, to.y - 260 + (k % 3) * 40), w, h: hh };
        const label = st.action === 'decider' ? `DECIDER · ${st.map}` : `${nameOf(st)} ${st.action.toUpperCase()} · ${st.map}`;
        return chip(`cV${k}`, from, to, `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0f1526;border:1px solid rgba(255,255,255,.12);font:800 ${Math.round(Math.min(18, to.w / 9))}px Poppins;letter-spacing:.06em;color:${st.action === 'ban' ? '#f43f5e' : st.action === 'pick' ? '#22d3ee' : '#ffb60e'}">${label}</div>`, 0.2 + k * 0.33, 0.45, '10px', '4px');
      }).join('');
      await stage.evaluate((html) => document.getElementById('cam').insertAdjacentHTML('beforeend', html), html);
    },
    over: `<div class="copy c" style="bottom:auto;top:90px;font-size:58px;animation:cout .3s 99s both">Either way, <em>it's on every graphic.</em></div>`,
    cam: push(2.86, 1.0, 1.04, 960, 760), key: 0.85,
  });

  // ═════ 4 · Valorant live (21.76–32.4 s): overlay-bar agent select, then the HUD playing a round ═════
  const agentsP = P0.map((t) => t.map((p) => ({ ...p, locked: false })));
  await patchRoom(VAL, { players: agentsP, veto: vetoSteps });
  await action(VAL, 'fullscreen.show', { screen: 'agent-select', style: 'band' });
  await sleep(300);
  const lockOrder = [[0, 0], [1, 0], [0, 1], [1, 2], [0, 2], [1, 1], [0, 3], [1, 3], [0, 4], [1, 4]];
  await scene('4a-agents', T.agents, T.hud, host(VAL), 'slashl', async (i) => {
    const k = Math.floor((i - F(0.3)) / F(0.3));
    if (i >= F(0.3) && (i - F(0.3)) % F(0.3) === 0 && k < lockOrder.length) { const [t, s] = lockOrder[k]; agentsP[t][s].locked = true; await patchRoom(VAL, { players: agentsP }); await sleep(110); }
  }, { cam: [[0, 1.05, 960, 780], [F(3.6), 1.0, 960, 700]], over: tag('VALORANT') });

  await action(VAL, 'fullscreen.show', { screen: null, style: 'band' });
  const P = clone(P0);
  const teams0 = clone(vteams); teams0[0].score = 11; teams0[1].score = 11; teams0[0].series = 1; teams0[1].series = 1;
  const series0 = clone(sample.series); series0[2] = { ...series0[2], score: [11, 11], winner: null };
  const rounds0 = clone(sample.rounds).slice(0, 22);
  await patchRoom(VAL, { ...vbase, teams: teams0, series: series0, rounds: rounds0, players: P, round: { number: 23, phase: 'live', endsAt: 0, remaining: 0, winner: null, method: '' } });
  const vbaseT = Date.now() + 3000, vt4 = (i) => vbaseT + (i / FPS) * 1000;
  const kf = [];
  const kill = (k, v, weapon, hs, ts) => { kf.push({ killer: k, victim: v, weapon, hs, ts }); const p = P[v[0]][v[1]]; p.alive = false; p.hp = 0; p.armor = 0; P[k[0]][k[1]].k += 1; };
  // A round the team just made wins: first blood against them, the plant, a 2K, then JUNO's clutch.
  const round = {
    [F(0.5)]: (t) => { kill([1, 0], [0, 1], 'OPERATOR', false, t); return { killfeed: kf, players: P }; },
    [F(1.2)]: () => { Object.assign(P[0][0], { hp: 62, armor: 0 }); Object.assign(P[1][1], { hp: 45, armor: 25 }); return { players: P }; },
    [F(1.9)]: (t) => { kill([0, 0], [1, 1], 'VANDAL', true, t); return { killfeed: kf, players: P }; },
    [F(2.6)]: (t) => { kill([0, 2], [1, 2], 'SPECTRE', false, t); return { killfeed: kf, players: P }; },
    [F(3.3)]: (t) => { P[1][3].credits += 300; return { round: { phase: 'planted', endsAt: t + 45000 }, players: P }; },
    [F(4.1)]: (t) => { kill([1, 3], [0, 2], 'PHANTOM', false, t - 200); kill([1, 3], [0, 4], 'PHANTOM', true, t); Object.assign(P[0][0], { hp: 18 }); return { killfeed: kf, players: P }; },
    [F(4.9)]: (t) => { kill([0, 0], [1, 3], 'VANDAL', true, t - 150); kill([1, 0], [0, 3], 'OPERATOR', false, t); return { killfeed: kf, players: P }; },
    [F(5.6)]: (t) => { kill([0, 0], [1, 0], 'VANDAL', true, t - 200); kill([0, 0], [1, 4], 'VANDAL', false, t); return { killfeed: kf, players: P }; },
    [F(6.0)]: (t) => { const tm = clone(teams0); tm[0].score = 12; const se = clone(series0); se[2].score = [12, 11]; return { round: { number: 23, phase: 'end', endsAt: 0, remaining: 0, winner: 0, method: 'elim' }, teams: tm, series: se, rounds: [...rounds0, { w: 0, how: 'elim' }], banner: { type: 'round', team: 0, player: 0, text: '', method: 'ELIMINATION', ts: t, hold: 4200 } }; },
  };
  await scene('4b-hud', T.hud, T.drop, `<div style="position:absolute;inset:0;background:#000 url('${LOTUS}') center/cover">${g(`${ENG}/overlays/ingame.html?match=${VAL}`)}</div>`, 'zoom', async (i) => {
    if (round[i]) { await patchRoom(VAL, round[i](vt4(i))); await sleep(130); }
    if (i === F(4.6)) liveShot.val = await stage.screenshot({ type: 'jpeg', quality: 85 });
  }, { vt: vt4, cam: [[0, 1.0, 960, 540], [F(3.1), 1.0, 960, 540], [F(3.8), 1.1, 960, 380], [F(5.4), 1.1, 1000, 420], [F(6.2), 1.0, 960, 520], [F(7), 1.02, 960, 520]], key: 0.88 });

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
  await scene('5c-brhud', T.brhud, T.standings, `<div style="position:absolute;inset:0;background:#000 url('${ENG}${wall}') center/cover">${g(`${ENG}/overlays/br-hud.html?match=${REPLAY}`)}</div>`, 'zoom', async (i) => { await seek(vt5(i)); if (i === F(2.0)) liveShot.pubg = await stage.screenshot({ type: 'jpeg', quality: 85 }); }, { vt: vt5, cam: [[0, 1.0, 960, 540], [F(2.8), 1.1, 1300, 500]] });
  // standings → MVP → WWCD on the lobby's own room, each a Take
  await take('br-overall');
  await scene('5d-standings', T.standings, T.mvp, lob, 'slash', null, { cam: [[0, 1.06, 960, 600], [F(1.8), 1.0, 960, 540]] });
  await take('br-mvp');
  await scene('5e-mvp', T.mvp, T.wwcd, lob, 'zoom', null, { cam: push(1.8, 1.0, 1.05, 900, 560) });
  // WWCD shows the squad as Air's grey silhouettes: their photos are cleared in Teams/Players (the lobby follows).
  for (const p of (await call('snapshot')).library.players.filter((p) => /^NTD_/.test(p.name))) await call('savePlayer', [{ ...p, photo: '' }]);
  await sleep(400);
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
  // ═════ 7 · More games coming (53.4–56.8 s): the ops wall returns and turns into the games ═════
  // Every tile flips: ten games coming (the Esportra website's posters) and the two on air now, as they looked above.
  const coming = [['apex', 66], ['eafc', 0], ['cs2', 0], ['r6s', 38], ['lol', 100], ['dota2', 100], ['cod', 56], ['fortnite', 100], ['rocket-league', 0], ['tekken8', 74]];
  const live = { 5: ['VALORANT', liveShot.val], 6: ['PUBG MOBILE', liveShot.pubg] };
  const order = [5, 6, 1, 2, 9, 10, 4, 7, 0, 3, 8, 11]; // from the centre out
  let c = 0;
  const backs = opsTiles.map((_, k) => {
    if (live[k]) return `<div class="fb live" style="background-image:url('${live[k][1] ? 'data:image/jpeg;base64,' + live[k][1].toString('base64') : ''}')"><b>${live[k][0]}</b></div>`;
    const [n, y] = coming[c++];
    return `<div class="fb" style="background-image:url('${POSTER(n)}');background-position:50% ${y}%"></div>`;
  });
  const wall7 = `${opsCss}<style>
    .ow7 .ow-t,.ow7 .ow-t *{animation-duration:0s!important;animation-delay:0s!important}
    .fl{position:relative;width:414px;height:280px;perspective:1600px}
    .fi{position:absolute;inset:0;transform-style:preserve-3d;animation:flip7 .5s cubic-bezier(.5,0,.2,1) var(--d) both}
    @keyframes flip7{0%{transform:rotateY(0)}100%{transform:rotateY(180deg)}}
    .fi>.ow-t,.fb{position:absolute;inset:0;backface-visibility:hidden;border-radius:14px}
    .fb{transform:rotateY(180deg);background:#0f1526 50% 50%/cover no-repeat;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
    .fb.live{background-size:cover;background-position:50% 50%;box-shadow:inset 0 0 0 3px #ffb60e,0 0 40px rgba(255,182,14,.35)}
    .fb.live b{position:absolute;left:16px;top:16px;display:flex;align-items:center;gap:8px;padding:7px 12px;background:#ffb60e;color:#0b0b0f;font:800 14px/1 Poppins;letter-spacing:.18em}
    .fb.live b::before{content:'';width:9px;height:9px;border-radius:50%;background:#e11d48}
  </style><div class="ow ow7">${opsTiles.map((t, k) => `<div class="fl"><div class="fi" style="--d:${(0.25 + order.indexOf(k) * 0.1).toFixed(2)}s">${t}${backs[k]}</div></div>`).join('')}</div>`;
  await scene('7-close', T.close, T.end, wall7, 'zoom', null, {
    cam: [[0, 1.08, 960, 540], [F(3.4), 1.0, 960, 540]],
    over: `<div class="ow-band"></div>${copy('More games <em>coming.</em>', { d: 0.9, out: 99, cls: 'c', style: 'bottom:auto;top:900px;font-size:70px' })}`, key: 0.85,
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
  if (MUSIC) require('./reel-mix.cjs').mix(silent, MUSIC, process.env.REEL_SFX || '', mp4, require('./reel-mix.cjs').V8_CUES, T.out);
  else fs.copyFileSync(silent, mp4);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-filter_complex', '[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', String(FPS), '-c:a', 'copy', '-movflags', '+faststart', vert]);
  console.log(JSON.stringify({ mp4, frames: rec.frames, seconds: +(rec.frames / FPS).toFixed(2), frozen: kit.frozenRuns(silent, 0.5), cuts }));
})().catch((e) => { console.error(e); process.exit(1); });
