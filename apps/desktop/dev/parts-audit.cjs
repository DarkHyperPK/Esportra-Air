// Parts audit (17 Nov): every graphic Graphics studio edits must let the producer select each thing they can see.
// Loads each graphic's preview page (and each HUD/holding sample) from a running dev host's engine and lists the
// visible texts, pictures and filled shapes that no part reaches on its own: a part must match the element itself,
// or a wrapper around nothing else that is visible. Prints a report; exits 1 when anything is uncovered.
//   node dev/host.ts &   then   node dev/parts-audit.cjs [host url] [--json file]
'use strict';
const { chromium } = require('playwright');

const HOST = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:5320';
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

const PAGE = (g) => (g === 'hud' ? 'ingame' : (() => { const [screen, style] = g.split('|'); return style === 'band' ? (screen === 'holding' ? 'break-frame' : `${screen}-band`) : screen; })());
const SAMPLES = {
  hud: ['', 'spike', 'pause', 'timeout', 'banner', 'poll', 'scoreboard', 'economy', 'recap', 'duel', 'compare', 'lowerthird', 'sponsor'],
  'holding|full': ['starting', 'brb', 'ending'],
};

async function audit(page, graphic) {
  return page.evaluate((g) => {
    const T = window.AirTemplates;
    const parts = T.partsOf(g);
    const shown = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const visible = (el) => { for (let x = el; x && x !== document.body; x = x.parentElement) if (!shown(x)) return false; return true; };
    const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const filled = (el) => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      return cs.backgroundImage !== 'none' || (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg));
    };
    const root = document.getElementById('hud') || document.body;
    // What a viewer sees: texts, pictures, and filled shapes (backgrounds, bars, lines).
    const leaves = [...root.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'svg', 'path', 'g'].includes(el.tagName) && visible(el) && (ownText(el) || el.tagName === 'IMG' || el.tagName === 'svg' || filled(el)));
    const leafSet = new Set(leaves);
    const matched = new Set();
    for (const [, , sel] of parts) { try { root.querySelectorAll(sel).forEach((el) => matched.add(el)); } catch {} }
    // A leaf is reachable when a part matches it, or a wrapper whose only visible content is this leaf.
    const reach = (el) => {
      if (matched.has(el)) return true;
      for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
        if (!matched.has(a)) continue;
        const inside = [...a.querySelectorAll('*')].filter((x) => leafSet.has(x));
        return inside.length === 1 && inside[0] === el;
      }
      return false;
    };
    const path = (el) => { const bits = []; for (let x = el; x && x !== root && bits.length < 4; x = x.parentElement) bits.unshift(x.tagName.toLowerCase() + (x.className && typeof x.className === 'string' ? '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return bits.join(' > '); };
    const what = (el) => (el.tagName === 'IMG' ? 'picture' : ownText(el) ? `text "${[...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 24)}"` : 'fill');
    const missing = new Map();
    for (const el of leaves) if (!reach(el)) { const k = path(el); const m = missing.get(k) || { path: k, what: what(el), n: 0 }; m.n++; missing.set(k, m); }
    return { leaves: leaves.length, covered: leaves.length - [...missing.values()].reduce((a, m) => a + m.n, 0), missing: [...missing.values()] };
  }, graphic);
}

(async () => {
  const state = await (await fetch(`${HOST}/dev/state`)).json();
  const port = state.enginePort;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(/media\.valorant-api\.com|vdo\.ninja/, (r) => r.abort('internetdisconnected'));
  await page.goto(`http://127.0.0.1:${port}/overlays/ingame.html?preview=1&screen=1`);
  const graphics = await page.evaluate(() => Object.keys(window.AirTemplates.GRAPHICS));
  const report = {};
  let gaps = 0;
  for (const g of graphics) {
    for (const sample of SAMPLES[g] || ['']) {
      const q = new URLSearchParams({ preview: '1', screen: '1', ...(sample && g === 'hud' ? { sample } : {}), ...(sample && g !== 'hud' ? { mode: sample } : {}) });
      await page.goto(`http://127.0.0.1:${port}/overlays/${PAGE(g)}.html?${q}`);
      await page.waitForFunction(() => window.HUD_READY, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1600);
      const r = await audit(page, g);
      const key = sample ? `${g} (${sample})` : g;
      report[key] = r;
      gaps += r.missing.length;
      console.log(`${r.missing.length ? '✗' : '✓'} ${key.padEnd(34)} ${r.covered}/${r.leaves} reachable`);
      for (const m of r.missing) console.log(`    · ${m.what.padEnd(30)} ×${String(m.n).padEnd(3)} ${m.path}`);
    }
  }
  await browser.close();
  if (jsonOut) require('node:fs').writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(gaps ? `\n${gaps} kinds of things can't be selected on their own.` : '\nEvery visible thing has its own part.');
  process.exit(gaps ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
