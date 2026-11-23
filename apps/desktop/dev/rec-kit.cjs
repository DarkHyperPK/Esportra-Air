// Recording kit (24 Nov): true 30 fps video of Air and its graphics, whatever the machine's speed.
// The 4-minute walkthrough held stills of the app for half a second (2–15 fps of real motion). Here every video frame
// is its own screenshot: before each one, every CSS/Web animation in the page and in all its frames (preview iframes
// too) is paused and set to the frame's time, SVG animations are set to it, and the page's clock (`Date.now`, `new
// Date()`) can be pinned to a chosen time (`vt`), so graphics that compare against timestamps (Team eliminated,
// moments) move in step with the video, not with how long a screenshot took.
//   const kit = require('./rec-kit.cjs'); const rec = kit.recorder(dir); await kit.prepare(context); …
'use strict';
const fs = require('node:fs'), path = require('node:path'), { execFileSync, spawnSync } = require('node:child_process');

const FPS = 30, DT = 1000 / FPS;
const BPM = 128, BEAT = 60 / BPM;

/** Runs in every page and frame before its own scripts: a clock the recorder can pin. */
const CLOCK = () => {
  const Real = Date;
  const now = () => (typeof window.__vtNow === 'number' ? window.__vtNow : Real.now());
  function VDate(...a) {
    if (!new.target) return new Real(now()).toString();
    return a.length ? new Real(...a) : new Real(now());
  }
  VDate.prototype = Real.prototype;
  VDate.now = now; VDate.UTC = Real.UTC; VDate.parse = Real.parse;
  window.Date = VDate;
};
async function prepare(context) { await context.addInitScript(CLOCK); }

/** Sets every animation and the clock in one frame (document) to page time `t` (ms) and wall time `vt`. */
const STEP = ([t, vt]) => {
  if (vt !== null) window.__vtNow = vt;
  const seen = window.__recSeen || (window.__recSeen = new WeakMap());
  for (const a of document.getAnimations()) {
    if (!seen.has(a)) seen.set(a, t);
    if (a.playState !== 'paused') a.pause();
    try { a.currentTime = Math.max(0, t - seen.get(a)); } catch { /* finished, no effect */ }
  }
  if (window.__recSvg === undefined) window.__recSvg = t;
  for (const v of document.querySelectorAll('svg')) { if (v.pauseAnimations) { v.pauseAnimations(); v.setCurrentTime((t - window.__recSvg) / 1000); } }
};

/**
 * A recorder: numbered JPEG frames in `dir`, one per 1/30 s. `frame(page)` steps the page (all its frames) to the
 * next frame's time and saves a screenshot. Each page keeps its own time, so a page opened mid-video starts at 0.
 */
function recorder(dir) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const times = new WeakMap();
  const marks = [];
  return {
    dir,
    get frames() { return n; },
    get seconds() { return n / FPS; },
    /** A named point on the video's time line (for beats.txt). */
    mark(label) { marks.push([n / FPS, label]); },
    marks,
    /** One frame of `page`; `vt` pins its clock (ms since epoch) or null to leave it. */
    async frame(page, vt = null) {
      const t = (times.get(page) ?? -DT) + DT;
      times.set(page, t);
      for (const f of page.frames()) { try { await f.evaluate(STEP, [t, vt]); } catch { /* a frame that is going away */ } }
      await page.screenshot({ path: path.join(dir, String(n++).padStart(6, '0') + '.jpg'), type: 'jpeg', quality: 90 });
    },
    /** `count` frames (or seconds with `secs`) of the page as it moves. `each(i)` runs before every frame. */
    async run(page, count, each, vt) {
      for (let i = 0; i < count; i++) { if (each) await each(i); await this.frame(page, typeof vt === 'function' ? vt(i) : vt ?? null); }
    },
    /** Frames up to a beat on the 128 BPM grid (at least `min`). */
    async toBeat(page, beat, each) {
      const target = Math.round(beat * BEAT * FPS);
      while (n < target) { if (each) await each(); await this.frame(page); }
    },
  };
}

/** A pointer, kinetic captions and a zoom drawn into the app page (outside #root, so the app's layout never moves). */
const CHROME_CSS = `
#rk-ptr{position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}
#rk-ptr i{position:absolute;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;border:3px solid #ffb60e;opacity:0;transform:scale(.4)}
#rk-ptr.down i{animation:rk-ring .45s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes rk-ring{0%{opacity:1;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}
#rk-cap{position:fixed;left:72px;bottom:64px;z-index:2147483646;pointer-events:none;font-family:Poppins,system-ui,sans-serif;color:#fff}
#rk-cap .k{display:inline-block;padding:6px 12px;background:#ffb60e;color:#0b0b0f;font:800 18px/1 Poppins,system-ui;letter-spacing:.18em;text-transform:uppercase;animation:rk-in .38s cubic-bezier(.2,.8,.2,1) both}
#rk-cap .t{display:block;margin-top:12px;font:800 64px/1.02 Poppins,system-ui;letter-spacing:-.015em;text-shadow:0 6px 30px rgba(0,0,0,.65);animation:rk-in .5s .08s cubic-bezier(.2,.8,.2,1) both}
#rk-cap .t em{font-style:normal;color:#ffb60e}
@keyframes rk-in{0%{opacity:0;transform:translateY(26px)}100%{opacity:1;transform:none}}
#rk-shade{position:fixed;inset:auto 0 0 0;height:360px;background:linear-gradient(0deg,rgba(5,6,9,.92),rgba(5,6,9,0));z-index:2147483645;pointer-events:none}
#root{transform-origin:0 0;will-change:transform}`;

function chrome(page) {
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const api = {
    pos: [960, 760],
    zoom: { s: 1, x: 0, y: 0 },
    async dress() {
      await page.evaluate((css) => {
        if (document.getElementById('rk-css')) return;
        const s = document.createElement('style'); s.id = 'rk-css'; s.textContent = css; document.head.appendChild(s);
        const p = document.createElement('div'); p.id = 'rk-ptr'; p.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 2l17 9-7.5 2L9 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i>'; document.body.appendChild(p);
        const sh = document.createElement('div'); sh.id = 'rk-shade'; sh.style.display = 'none'; document.body.appendChild(sh);
        const c = document.createElement('div'); c.id = 'rk-cap'; document.body.appendChild(c);
      }, CHROME_CSS);
      await this.place();
    },
    /** A kinetic caption: kicker plus a big line (`<em>` for the accent word); null clears. */
    async caption(kicker, line) {
      await page.evaluate(([k, t]) => {
        const c = document.getElementById('rk-cap'), sh = document.getElementById('rk-shade');
        c.innerHTML = k ? `<span class="k">${k}</span><span class="t">${t}</span>` : '';
        sh.style.display = k ? '' : 'none';
      }, [kicker, line]);
    },
    async place() {
      await page.evaluate(([x, y, z]) => {
        const p = document.getElementById('rk-ptr'); if (p) { p.style.left = x + 'px'; p.style.top = y + 'px'; }
        const r = document.getElementById('root'); if (r) r.style.transform = z.s === 1 ? '' : `translate(${z.x}px,${z.y}px) scale(${z.s})`;
      }, [...this.pos, this.zoom]);
    },
    /** Eases the pointer to a locator over `frames` video frames. */
    async point(rec, loc, frames = 10) {
      const b = await loc.boundingBox();
      if (!b) throw new Error('nothing to point at');
      const [x0, y0] = this.pos, x1 = b.x + Math.min(b.width / 2, 70), y1 = b.y + b.height / 2;
      await rec.run(page, frames, async (i) => { const e = ease((i + 1) / frames); this.pos = [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e]; await this.place(); });
    },
    async click(rec, loc, { frames = 10, after = 8 } = {}) {
      await this.point(rec, loc, frames);
      await page.evaluate(() => { const p = document.getElementById('rk-ptr'); p.classList.remove('down'); void p.offsetWidth; p.classList.add('down'); });
      await loc.click();
      await rec.run(page, after);
    },
    async type(rec, loc, text, { per = 2 } = {}) {
      await this.click(rec, loc, { after: 2 });
      for (let i = 1; i <= text.length; i++) { await loc.fill(text.slice(0, i)); await rec.run(page, per); }
    },
    /** Eases a zoom of the app (scale `s` around viewport point x,y) over `frames`. */
    async zoomTo(rec, s, cx, cy, frames = 12) {
      const from = { ...this.zoom }, to = { s, x: s === 1 ? 0 : cx - cx * s, y: s === 1 ? 0 : cy - cy * s };
      await rec.run(page, frames, async (i) => { const e = ease((i + 1) / frames); this.zoom = { s: from.s + (to.s - from.s) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }; await this.place(); });
    },
  };
  return api;
}

/** Encodes the frames to H.264 at 30 fps, then a 9:16 version (the frame centred over a blurred copy of itself). */
function encode(dir, out, { vertical } = {}) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%06d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out]);
  if (vertical) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-filter_complex',
      '[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', String(FPS), '-movflags', '+faststart', vertical]);
  }
}

/** Frozen runs: mpdecimate keeps only frames that differ from the last kept one; a gap longer than `minSecs` between
 *  kept frames is a stretch where the picture did not move. Returns [[start, seconds], …]. */
function frozenRuns(file, minSecs = 0.5) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'mpdecimate=hi=64*4:lo=64*2:frac=0.2,showinfo', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const t = [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const out = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > minSecs) out.push([t[i - 1], +(t[i] - t[i - 1]).toFixed(2)]);
  return out;
}

module.exports = { FPS, DT, BPM, BEAT, prepare, recorder, chrome, encode, frozenRuns };
