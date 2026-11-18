// Scroll smoothness (17 Nov): seeds a match with every graphic in its Rundown, then fast-scrolls the long pages
// (Rundown, HUD library's preview window, Teams/Players, Live) and reports frame times from requestAnimationFrame.
//   node dev/host.ts --port 5330 &   then   node dev/scroll-perf.cjs [host url]
'use strict';
const { chromium } = require('playwright');

const HOST = process.argv[2] || 'http://127.0.0.1:5330';
const call = async (m, args = []) => {
  const r = await fetch(`${HOST}/call/${m}`, { method: 'POST', body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${m}: ${await r.text()}`);
  return r.json();
};

async function measure(page, label, scroller) {
  if (process.env.PERF_IDLE) await page.evaluate(() => { window.__idle = true; });
  const result = await page.evaluate(async (sel) => {
    const el = document.querySelector(sel) || document.scrollingElement;
    const frames = [];
    let last = performance.now();
    let run = true;
    const tick = (t) => { frames.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    // Fast wheel-like scrolling: down and up three times, 40 px every 8 ms (PERF_IDLE: no scrolling, 3 s).
    if (window.__idle) await new Promise((r) => setTimeout(r, 3000));
    else for (let pass = 0; pass < 3; pass++) {
      for (const dir of [1, -1]) {
        for (let i = 0; i < 60; i++) { el.scrollBy(0, dir * 40); await new Promise((r) => setTimeout(r, 8)); }
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    run = false;
    const f = frames.slice(1);
    f.sort((a, b) => a - b);
    const over = (ms) => f.filter((x) => x > ms).length;
    return { frames: f.length, p50: f[Math.floor(f.length / 2)], p95: f[Math.floor(f.length * 0.95)], worst: f.at(-1), long: over(33), dropped: over(20), height: el.scrollHeight };
  }, scroller);
  console.log(`${label.padEnd(22)} frames ${String(result.frames).padStart(4)} · p50 ${result.p50.toFixed(1)} ms · p95 ${result.p95.toFixed(1)} ms · worst ${result.worst.toFixed(0)} ms · >20ms ${result.dropped} · >33ms ${result.long} (scroll height ${result.height})`);
  return result;
}

(async () => {
  await call('chooseGame', ['valorant']);
  await call('finishOnboarding');
  await call('createEvent', ['Perf Cup']);
  const team = (name, tag, color) => ({ name, tag, color, logo: '' });
  const players = (tag) => ['One', 'Two', 'Three', 'Four', 'Five'].map((p) => ({ name: `${tag}${p}`, realName: '', gameId: `${tag}${p}#${tag}`, photo: '' }));
  const snap = await call('snapshot');
  const screens = snap.setup.screens.filter((x) => x.scene === 'fullscreen' && x.hosted).map((x) => x.id);
  await call('createMatch', [{ bestOf: 3, teams: [team('Night Owls', 'NOW', '#22d3ee'), team('Crimson Five', 'CRF', '#f43f5e')], players: [players('NOW'), players('CRF')], template: 'standard', screens }]);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  // A busy production PC (OBS and the game running): 4× slower CPU unless PERF_CPU says otherwise.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PERF_CPU || 4) });
  if (process.env.PERF_NO_PREVIEWS) await page.route(/\/overlays\//, (r) => r.abort());
  await page.route(/media\.valorant-api\.com|vdo\.ninja/, (r) => r.abort('internetdisconnected'));
  await page.goto(`${HOST}/?host=${HOST}`);
  await page.locator('nav.rail').waitFor();
  const rail = (name) => page.locator('nav.rail').getByRole('button', { name }).click();
  const out = {};
  // Rundown: one preview per row.
  await rail('Events');
  await page.locator('.ev-card, .ev-match').first().waitFor();
  if (await page.locator('.ev-card').count()) await page.locator('.ev-card').first().click();
  await page.locator('.ev-match').first().getByRole('button', { name: 'Open' }).click();
  await page.getByRole('navigation', { name: 'Match steps' }).getByRole('button', { name: 'Rundown', exact: true }).click();
  await page.waitForTimeout(2500);
  out.rundown = await measure(page, 'Rundown', 'main.page, .page');
  await page.waitForTimeout(2000);
  out.rundownAgain = await measure(page, 'Rundown, again', 'main.page, .page');
  // HUD library › ESPORTRA HUD: every graphic.
  await rail('HUD library');
  await page.waitForTimeout(1500);
  out.library = await measure(page, 'HUD library', 'main.page, .page');
  await rail('Graphics studio');
  await page.waitForTimeout(3000);
  out.studio = await measure(page, 'Graphics studio', 'main.page, .page');
  await page.waitForTimeout(1500);
  out.studioAgain = await measure(page, 'Graphics studio, again', 'main.page, .page');
  await rail('Teams/Players');
  await page.waitForTimeout(1500);
  out.teams = await measure(page, 'Teams/Players', 'main.page, .page');
  await rail('Live');
  await page.waitForTimeout(2500);
  out.live = await measure(page, 'Live', 'main.page, .page');
  await browser.close();
  if (process.env.PERF_JSON) require('node:fs').writeFileSync(process.env.PERF_JSON, JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
