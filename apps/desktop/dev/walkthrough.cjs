// Walks the whole producer journey in Chromium against dev/host.ts and saves screenshots.
//   node dev/walkthrough.cjs <out dir> [host url]
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(process.argv[2] || 'walkthrough');
const HOST = process.argv[3] || 'http://127.0.0.1:5320';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  let n = 0;
  const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
  const click = (name, opts) => page.getByRole('button', { name, ...opts }).first().click();

  await page.goto(`${HOST}/?host=${HOST}`);
  await page.getByRole('heading', { name: 'Which match are you producing?' }).waitFor();
  await shot('first-run-match');

  await page.getByLabel('Team A').fill('Team Alpha');
  await page.getByLabel('Team B').fill('Team Bravo');
  await click('Bo3');
  await click('Create match');
  await page.getByRole('heading', { name: 'Team Alpha vs Team Bravo' }).waitFor();
  await click('Add casters');
  await page.getByLabel('Play-by-play').fill('Caster One');
  await page.getByLabel('Analyst').fill('Caster Two');
  await click('Save casters');
  await page.getByText('Caster One').waitFor();
  await shot('match-selected');

  await page.getByRole('button', { name: /Production setup/ }).click();
  await shot('setup-graphics');
  await page.getByRole('tab', { name: 'Brand' }).click();
  await page.getByLabel('Event name (on the event bug)').fill('Community Cup');
  await click('Save');
  await page.getByPlaceholder('Sponsor name').fill('Acme Energy');
  await click('Add sponsor');
  await page.getByText('Acme Energy').waitFor();
  await shot('setup-brand');
  await page.getByRole('tab', { name: 'Layout' }).click();
  await shot('setup-layout');
  await page.getByRole('tab', { name: 'OBS' }).click();
  await page.getByLabel('Password').fill('secret');
  await click('Connect');
  await page.getByText(/Connected to OBS/).waitFor();
  await page.getByLabel(/Gameplay source/).selectOption('Game Capture');
  await click('Install graphics in OBS');
  await page.getByRole('button', { name: 'Update graphics in OBS' }).waitFor();
  await shot('setup-obs-installed');

  // OBS loads its browser sources: open the in-game and starting-soon outputs like OBS would.
  // Load every installed output, exactly by the URL OBS was given.
  const snap = await (await fetch(`${HOST}/call/snapshot`, { method: 'POST', body: '[]' })).json();
  const obsPages = [];
  for (const output of snap.outputs) {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    p.on('pageerror', (e) => errors.push(`${output.title}: ${e.message}`));
    await p.goto(output.url);
    obsPages.push(p);
  }
  await page.waitForTimeout(2500);

  await click('Back to match day →');
  await click('Check');
  await page.getByText('Game capture is off on this PC.').waitFor();
  await shot('check');
  await click('Start game capture');
  await page.getByRole('dialog', { name: 'Start game capture on this PC?' }).waitFor();
  await shot('consent');
  await click('Allow and start capture');
  await click('Play test round');
  await page.getByText(/Playing ·/).waitFor();
  await shot('check-test-round');
  await click('Stop test round');

  await click('Go to Live');
  await page.getByLabel('Score').waitFor({ timeout: 20000 });
  await page.waitForTimeout(6000);
  await shot('live');
  await page.keyboard.press('F7');
  await page.getByText('On screen · press again to hide').waitFor();
  await page.keyboard.press('F6');
  await page.waitForTimeout(1500);
  await shot('live-triggers');
  const ingame = obsPages[snap.outputs.findIndex((o) => o.screenId === 'in-game')];
  await ingame.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-obs-in-game-output.png`) });
  const loading = (await (await fetch(`${HOST}/call/snapshot`, { method: 'POST', body: '[]' })).json()).outputs.filter((o) => o.connections > 0).length;
  if (loading !== snap.outputs.length) errors.push(`only ${loading} of ${snap.outputs.length} outputs connected through their alias`);
  await page.keyboard.press('F6');
  await page.keyboard.press('F9');
  await page.getByText('Correct the score viewers see').waitFor();
  await shot('live-correction');
  await click('Cancel');
  await page.getByRole('button', { name: /Graphics/ }).last().click();
  await page.getByRole('dialog').waitFor();
  await shot('status-drawer');

  await browser.close();
  if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
  console.log(`Walkthrough complete: ${n} screenshots in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
