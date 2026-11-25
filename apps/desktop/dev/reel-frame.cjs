// Esportra AIR loop reel v2: the design system's Node side (spec 1, 2, 5 and 7). reel-frame.css is the look; this
// module builds every frame scene's page from it (the camera with three parallax layers, the grid, the persistent
// chrome from reel/frame-chrome.js, the grain), finds the fonts, places talent photos by their faces and eases AIR's
// virtual camera. Nothing here is copied into the repo from outside it: fonts and photos are read from where they are.
'use strict';
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const CHROME_JS = fs.readFileSync(path.join(__dirname, 'reel/frame-chrome.js'), 'utf8');
// (the package is ESM, so the browser file is run in a sandbox here to reuse its html())
const sandbox = {}; sandbox.window = sandbox; require('node:vm').runInNewContext(CHROME_JS, sandbox);
const Chrome = sandbox.ReelChrome;
const FRAME_CSS = fs.readFileSync(path.join(__dirname, 'reel-frame.css'), 'utf8');

/** Where Inter and JetBrains Mono are: design/implemented/assets/fonts (when present), else the Esportra site's copies beside this repo. */
function fontFiles() {
  const dirs = [process.env.REEL_FONTS, path.join(__dirname, '../../../design/implemented/assets/fonts'), path.join(__dirname, '../../../../esportra/design/source/fonts')].filter(Boolean);
  const find = (...names) => { for (const d of dirs) for (const n of names) { const f = path.join(d, n); if (fs.existsSync(f)) return f; } throw new Error(`font ${names[0]} not found in ${dirs.join(', ')}`); };
  return [
    ...[400, 500, 600, 700].map((w) => ({ family: 'Inter', weight: w, file: find(`inter-latin-${w}-normal.woff2`) })),
    { family: "'JetBrains Mono'", weight: 500, file: find('JetBrainsMono.ttf', 'jetbrains-mono-latin-500-normal.woff2') },
  ];
}
const FMT = { '.woff2': 'woff2', '.ttf': 'truetype' };
/** @font-face rules whose files the reel serves at http://reel.local/font-<n>.<ext> (serve(name, body, type) from the caller). */
function fontCss(serve) {
  return fontFiles().map((f, k) => {
    const ext = path.extname(f.file), url = serve(`font-${k}${ext}`, fs.readFileSync(f.file), ext === '.ttf' ? 'font/ttf' : 'font/woff2');
    return `@font-face{font-family:${f.family};font-weight:${f.weight};src:url(${url}) format("${FMT[ext]}")}`;
  }).join('');
}

const GRID = [...Array(12).keys()].map((i) => `<div class="vl" style="left:${96 + i * 146}px"></div>`).join('') + '<div class="vl" style="left:1824px"></div><div class="hl"></div>';

/**
 * One scene's page. `ui` is the layer at x1, `fg` the foreground accents (x1.3); the grid drifts at x0.4. `cross` says a
 * frame is leaving over the first 600 ms, so elements start 150 ms before that ends (--b = .45 s). `over` is for full
 * bleed pictures (the chrome gets plates), `sub` a mono tag under the chapter tag.
 */
function pageHtml({ fonts = '', css = '', ui = '', fg = '', dur = 6, dz = 0.035, over = false, sub = '', outgoing = '', cross = true, drift = true, reveal = false }) {
  const dr = drift ? ' dr' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}${FRAME_CSS}
.g{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;background:transparent}${css}</style></head><body>
<div id="st" style="--dur:${dur}s;--dz:${dz};--b:${cross ? '.45s' : '0s'}">
<div class="layer${dr}" style="--k:.4">${GRID}</div><div class="layer${dr}" style="--k:1">${ui}</div><div class="layer${dr}" style="--k:1.3">${fg}</div>
${Chrome.html({ over, sub, reveal })}${outgoing ? `<img class="out" src="${outgoing}">` : ''}<div class="grain"></div></div>
<script>${CHROME_JS}</script></body></html>`;
}

/** Display words, one span per word with a 40 ms stagger (starting at `d0` s after the scene's own start). */
function wordsHtml(lines, cls, d0 = 0, style = '') {
  let k = 0;
  return `<div class="${cls}" style="white-space:nowrap;${style}">${lines.map((ln) => `<div>${ln.split(' ').map((w) => `<span class="wd rv" style="--d:${(d0 + 0.04 * k++).toFixed(2)}s">${w}</span>`).join(' ')}</div>`).join('')}</div>`;
}

// ───── talent photos (spec 5) ─────
/** Face boxes by OpenCV (dev/reel-faces.py); a photo without a found face gets an estimate, with a warning. */
function faceBoxes(files, py) {
  try {
    const out = JSON.parse(execFileSync(py || 'python3', [path.join(__dirname, 'reel-faces.py'), ...files], { encoding: 'utf8', maxBuffer: 1 << 24 }));
    return files.map((f) => out[f]);
  } catch (e) { console.warn('faces: python failed (' + String(e.message).split('\n')[0] + '); photos framed by estimate'); return files.map(() => null); }
}
/**
 * Places a photo (iw x ih) in a W x H window by its face: face 42 % of the window's height, eyes 40 % from the top, the
 * face horizontally centred; scaled up just enough to cover when it cannot at that scale. Returns CSS for the window.
 */
function placeFace(info, iw, ih, W, H) {
  const face = info?.face || [0.18 * iw, 0.12 * ih, 0.5 * iw, 0.6 * ih];
  const [fx, fy, fw, fh] = face;
  const cx = fx + fw / 2, ey = info?.face ? fy + 0.4 * fh : 0.25 * ih;
  const s = Math.max((0.42 * H) / fh, W / iw, H / ih, (0.4 * H) / ey, (0.6 * H) / (ih - ey));
  // the face is centred as far as the photo still covers the window; the eyes sit at 40 % exactly
  const ox = Math.min(0, Math.max(W - iw * s, W / 2 - cx * s)), oy = 0.4 * H - ey * s;
  return { css: `background-size:${(iw * s).toFixed(1)}px ${(ih * s).toFixed(1)}px;background-position:${ox.toFixed(1)}px ${oy.toFixed(1)}px;background-repeat:no-repeat`, scale: s, faceShare: (fh * s) / H, eyeAt: (oy + ey * s) / H };
}

// ───── AIR's virtual camera (spec 7) ─────
/** cubic-bezier(0.16, 1, 0.3, 1) as a function of progress */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 30; i++) { t = (lo + hi) / 2; if (X(t) < x) lo = t; else hi = t; } return Y(t); };
}
const EASE_IN = bezier(0.16, 1, 0.3, 1);
const MOVE = 21; // 0.7 s of 30 fps
/**
 * The crop rectangle {x, y, w} of Air's 1280x720 picture at video frame n. `keys` are framings [{at, x, y, w}] (frame
 * of the capture at which the camera starts to move to it). Each move takes 0.7 s on the entrance curve and
 * interpolates the rectangle from where the camera is; between moves it drifts in slowly (3.5 % over 6 s).
 */
function rectAt(keys, n) {
  let j = 0;
  for (let i = 0; i < keys.length; i++) if (keys[i].at <= n) j = i;
  const k = keys[j], since = n - k.at;
  const d = Math.max(0, since - MOVE) / 180 * 0.035;
  const w2 = k.w * (1 - d), h = k.w * 9 / 16, h2 = w2 * 9 / 16;
  let r = { x: k.x + (k.w - w2) / 2, y: k.y + (h - h2) / 2, w: w2 };
  if (j > 0 && since < MOVE) {
    const a = rectAt(keys.slice(0, j), k.at), u = EASE_IN(since / MOVE);
    r = { x: a.x + (k.x - a.x) * u, y: a.y + (k.y - a.y) * u, w: a.w + (k.w - a.w) * u };
  }
  return r;
}
const clampRect = ({ x, y, w }) => { w = Math.min(1280, w); const h = (w * 9) / 16; return { x: Math.min(1280 - w, Math.max(0, x)), y: Math.min(720 - h, Math.max(0, y)), w }; };
/** The CSS transform that shows crop `r` of the 2560x1440 picture in a window `winW` wide. */
const cropTransform = (r, winW) => { const s = winW / (r.w * 2); return `translate(${(-r.x * 2 * s).toFixed(2)}px,${(-r.y * 2 * s).toFixed(2)}px) scale(${s.toFixed(5)})`; };

module.exports = { fontCss, pageHtml, wordsHtml, faceBoxes, placeFace, rectAt, clampRect, cropTransform, Chrome, FRAME_CSS, EASE_IN, MOVE };
