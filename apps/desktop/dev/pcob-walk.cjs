// PUBG MOBILE observer feed walk (24 Nov): on a fresh dev host, a 16-team lobby, the stand-in PCOB (dev/fake-pcob.ts,
// fast), Live › Game data: consent, connect, a whole game read live and saved by itself. Exits 1 on any problem.
//   node dev/host.ts --port 5334 --engine-port 5396 &   then   node dev/pcob-walk.cjs [host] [engine port] [shot dir]
'use strict';
const { chromium } = require('playwright');
const path = require('node:path');
const H = process.argv[2] || 'http://127.0.0.1:5334';
const ENGINE = process.argv[3] || '5396';
const SHOTS = process.argv[4] || null;
const call = async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
const dev = async (q) => (await fetch(`${H}/dev/pcob?${q}`, { method: 'POST' })).json();
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
const TAGS = ['NOW', 'CF5', 'IRP', 'DUNE', 'SFX', 'NTD', 'BHB', 'STW', 'RKS', 'LOB', 'WCD', 'GRM', 'FR6', 'ECV', 'QST', 'HGD'];
(async () => {
  await call('chooseGame', ['pubgm']); await call('finishOnboarding');
  await call('createEvent', ['Air Showcase Cup']);
  let snap = await call('snapshot');
  for (const [i, n] of NAMES.entries()) await call('saveTeam', [{ name: n, tag: TAGS[i], color: ['#22d3ee', '#f43f5e', '#ffb60e', '#a78bfa'][i % 4], logo: '' }]);
  snap = await call('snapshot');
  for (const t of snap.library.teams) { const i = NAMES.indexOf(t.name); for (const p of ['ACE', 'ROOK', 'VEX', 'KAI']) await call('savePlayer', [{ name: `${TAGS[i]}_${p}`, realName: '', gameId: `${TAGS[i]}_${p}`, photo: '', role: '', teamId: t.id }]); }
  await call('lobbyCreate', [{ eventId: snap.events[0].id, game: 'pubgm', title: 'Group A · Day 2', games: 6, maps: ['Erangel', 'Miramar', 'Sanhok', 'Erangel', 'Vikendi', 'Rondo'] }]);
  snap = await call('snapshot');
  const l = snap.lobbies[0];
  await call('lobbyTeams', [l.id, NAMES.map((n) => snap.library.teams.find((t) => t.name === n).id)]);
  const fake = await dev('do=start&speed=40&length=900');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${H}/?host=${H}`); await p.locator('nav.rail').waitFor();
  await p.locator('nav.rail').getByRole('button', { name: 'Live' }).click();
  await p.getByRole('button', { name: /Game data · Off/ }).click();
  const dlg = p.getByRole('dialog', { name: 'Game data' });
  await dlg.getByLabel('Observer PC address').fill(`127.0.0.1:${fake.port}`);
  if (!(await dlg.getByRole('button', { name: 'Connect' }).isDisabled())) throw new Error('Connect works without consent');
  await dlg.getByRole('checkbox').check();
  await dlg.getByRole('button', { name: 'Connect' }).click();
  await p.locator('.pcob-state.waiting').waitFor({ timeout: 15000 });
  await dev('do=begin');
  await p.locator('.pcob-state.live').waitFor({ timeout: 15000 });
  await p.waitForTimeout(6000);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'pcob-panel.png') });
  await dlg.locator('.pcob-slot').nth(15).waitFor({ timeout: 8000 });
  if ((await dlg.locator('.pcob-slot.open').count()) !== 0) throw new Error('not every team was seated');
  await p.keyboard.press('Escape');
  // The HUD on the lobby room reads the feed.
  const hud = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await hud.goto(`http://127.0.0.1:${ENGINE}/overlays/br-hud.html?match=${l.code}`);
  await hud.waitForTimeout(3000);
  if (SHOTS) await hud.screenshot({ path: path.join(SHOTS, 'pcob-hud.png') });
  // Wait for the game to end and save itself (40× speed: about 25 s), then the 5 s settle.
  for (let i = 0; i < 90; i++) { snap = await call('snapshot'); if (snap.lobbies[0].games[0].results?.length) break; await p.waitForTimeout(1000); }
  const g = snap.lobbies[0].games[0];
  if (g.source !== 'pcob' || g.results.length !== 16 || g.feed.stats.length !== 64) throw new Error('match 1 was not saved from the game: ' + JSON.stringify({ source: g.source, n: g.results?.length }));
  await p.getByRole('button', { name: 'Results', exact: true }).click();
  await p.getByRole('dialog', { name: 'Results' }).getByRole('tab', { name: /Match 1/ }).click();
  await p.getByText('From the game · edit to correct').waitFor();
  if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: path.join(SHOTS, 'pcob-results.png') }); }
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  console.log('PCOB walk complete');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
