// Original vector team emblems for the reels (25 Nov): one per made-up team, drawn here (no stock logos). Each is a
// badge shape (shield, hexagon, crest, roundel, diamond) in the team's colours with a simple motif and the tag.
//   const E = require('./reel-emblems.cjs'); E.svg(i, tag, color) → SVG string; await E.png(page, svg) → PNG buffer
'use strict';

const SHAPES = [
  'M128 14 L226 46 L216 150 Q200 210 128 244 Q56 210 40 150 L30 46 Z',            // shield
  'M128 12 L228 70 L228 186 L128 244 L28 186 L28 70 Z',                           // hexagon
  'M128 16 L240 128 L128 240 L16 128 Z',                                          // diamond
  'M40 24 H216 V140 Q216 214 128 244 Q40 214 40 140 Z',                           // crest
  'M128 14 A114 114 0 1 1 127.9 14 Z',                                            // roundel
  'M60 18 H196 L238 96 L196 238 H60 L18 96 Z',                                    // gem
];
const MOTIFS = [
  // chevrons
  (c) => `<path d="M70 92 L128 132 L186 92 L186 120 L128 160 L70 120 Z" fill="${c}"/><path d="M70 136 L128 176 L186 136 L186 160 L128 200 L70 160 Z" fill="${c}" opacity=".6"/>`,
  // bolt
  (c) => `<path d="M144 52 L88 140 H124 L108 206 L170 108 H134 Z" fill="${c}"/>`,
  // star
  (c) => `<path d="M128 60 L144 108 L194 108 L154 138 L170 188 L128 158 L86 188 L102 138 L62 108 L112 108 Z" fill="${c}"/>`,
  // wings
  (c) => `<path d="M128 176 L118 110 L40 74 L56 112 L40 110 L62 140 L48 142 L80 164 Z" fill="${c}"/><path d="M128 176 L138 110 L216 74 L200 112 L216 110 L194 140 L208 142 L176 164 Z" fill="${c}"/><path d="M128 96 L140 120 L128 190 L116 120 Z" fill="${c}" opacity=".7"/>`,
  // crown
  (c) => `<path d="M72 170 L64 96 L100 128 L128 80 L156 128 L192 96 L184 170 Z" fill="${c}"/><rect x="72" y="178" width="112" height="14" fill="${c}" opacity=".7"/>`,
  // peak
  (c) => `<path d="M48 190 L104 100 L128 136 L156 84 L208 190 Z" fill="${c}"/><path d="M156 84 L176 118 L162 112 L150 124 Z" fill="#fff" opacity=".85"/>`,
  // wave
  (c) => `<path d="M46 150 C70 112 98 112 120 146 S170 184 210 140" fill="none" stroke="${c}" stroke-width="20" stroke-linecap="round"/><path d="M46 110 C70 74 98 74 120 106 S170 142 210 100" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" opacity=".55"/>`,
  // eye / owl
  (c) => `<circle cx="96" cy="120" r="28" fill="${c}"/><circle cx="160" cy="120" r="28" fill="${c}"/><circle cx="96" cy="120" r="11" fill="#0b0d14"/><circle cx="160" cy="120" r="11" fill="#0b0d14"/><path d="M128 140 L116 164 H140 Z" fill="${c}"/>`,
  // fang
  (c) => `<path d="M76 84 H180 L160 120 L148 196 L128 140 L108 196 L96 120 Z" fill="${c}"/>`,
  // target
  (c) => `<circle cx="128" cy="128" r="62" fill="none" stroke="${c}" stroke-width="16"/><circle cx="128" cy="128" r="24" fill="${c}"/>`,
  // flame
  (c) => `<path d="M128 56 Q176 110 160 160 Q150 196 128 200 Q100 196 94 164 Q88 130 112 106 Q114 132 130 138 Q120 100 128 56 Z" fill="${c}"/>`,
  // pine
  (c) => `<path d="M128 52 L176 120 H150 L188 180 H68 L106 120 H80 Z" fill="${c}"/><rect x="120" y="180" width="16" height="22" fill="${c}"/>`,
];

// The motif that suits each made-up team (reel-setup NAMES order): owl, star, pine, flame, fang, wave, chevrons,
// peak, wings, target, crown, peak, bolt, wave, bolt, crown.
const FIT = [7, 2, 11, 10, 8, 6, 0, 5, 3, 9, 4, 5, 1, 6, 1, 4];

/** The emblem for team `i`: a shape and a motif in the team's colour on a dark field (the graphics print the tag beside it). */
function svg(i, tag, color) {
  const shape = SHAPES[i % SHAPES.length], motif = MOTIFS[FIT[i % FIT.length]];
  const id = `g${i}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2130"/><stop offset="1" stop-color="#0b0d14"/></linearGradient>
  <clipPath id="c${id}"><path d="${shape}"/></clipPath></defs>
  <path d="${shape}" fill="url(#${id})" stroke="${color}" stroke-width="10" stroke-linejoin="round"/>
  <g clip-path="url(#c${id})"><path d="M0 0 L256 0 L256 70 L0 120 Z" fill="${color}" opacity=".12"/>${motif(color)}</g>
</svg>`;
}

/** Renders an SVG to a 512×512 transparent PNG with a Playwright page. */
async function png(page, svgText) {
  await page.setContent(`<html><body style="margin:0;background:transparent"><div id="e" style="width:512px;height:512px">${svgText}</div></body></html>`);
  return page.locator('#e').screenshot({ omitBackground: true });
}

module.exports = { svg, png };
