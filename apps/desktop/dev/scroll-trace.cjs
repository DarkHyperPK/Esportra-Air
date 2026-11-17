// Records a Chrome trace of a fast Rundown scroll (after dev/scroll-perf.cjs seeded the host) and sums where the time went.
'use strict';
const { chromium } = require('playwright');
const HOST = process.argv[2] || 'http://127.0.0.1:5330';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.route(/media\.valorant-api\.com|vdo\.ninja/, (r) => r.abort('internetdisconnected'));
  await page.goto(`${HOST}/?host=${HOST}`);
  await page.locator('nav.rail').waitFor();
  await page.locator('nav.rail').getByRole('button', { name: 'Events' }).click();
  await page.locator('.ev-card, .ev-match').first().waitFor();
  if (await page.locator('.ev-card').count()) await page.locator('.ev-card').first().click();
  await page.locator('.ev-match').first().getByRole('button', { name: 'Open' }).click();
  await page.getByRole('navigation', { name: 'Match steps' }).getByRole('button', { name: process.argv[3] || 'Rundown', exact: true }).click();
  await page.waitForTimeout(3000);
  // Load every preview first, so the trace shows scrolling alone.
  await page.evaluate(async () => { const el = document.querySelector('main.page'); for (let y = 0; y < el.scrollHeight; y += 300) { el.scrollTo(0, y); await new Promise((r) => setTimeout(r, 400)); } el.scrollTo(0, 0); });
  await page.waitForTimeout(2000);
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu'] });
  await page.evaluate(async () => {
    const el = document.querySelector('main.page');
    for (let pass = 0; pass < 2; pass++) for (const dir of [1, -1]) for (let i = 0; i < 60; i++) { el.scrollBy(0, dir * 40); await new Promise((r) => setTimeout(r, 8)); }
  });
  const buf = await browser.stopTracing();
  const ev = JSON.parse(buf.toString()).traceEvents;
  const sums = {};
  const main = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  for (const e of ev) if (e.ph === 'X' && e.dur > 0 && main.has(`${e.pid}:${e.tid}`)) sums[e.name] = (sums[e.name] || 0) + e.dur / 1000;
  const pids = new Set([...main].map((k) => k.split(':')[0]));
  console.log('renderer main threads:', main.size, 'processes:', pids.size);
  console.log(Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n'));
  // Long tasks on the main thread with their top child.
  await browser.close();
})();
