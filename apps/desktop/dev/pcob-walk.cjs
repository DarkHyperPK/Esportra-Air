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
  // Moments come up by themselves: listed as AUTO in In-game.
  await p.getByRole('tab', { name: /In-game/ }).click();
  for (const m of ['First blood', 'Team eliminated', 'Kill leader', 'Zone closing', 'Final teams', 'Match point']) await p.locator('.cp-gi', { hasText: m }).locator('.cp-state.auto').waitFor({ timeout: 4000 });
  await p.getByRole('button', { name: /Game data · Off/ }).click();
  const dlg = p.getByRole('dialog', { name: 'Game data' });
  await dlg.getByLabel('Observer PC address').fill(`127.0.0.1:${fake.port}`);
  if (!(await dlg.getByRole('button', { name: 'Connect' }).isDisabled())) throw new Error('Connect works without consent');
  await dlg.getByRole('checkbox').check();
  await dlg.getByRole('button', { name: 'Connect' }).click();
  await p.locator('.pcob-state.waiting').waitFor({ timeout: 15000 }).catch(async (e) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fail.png') }); throw e; });
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
  // Live › Insights › Now: the match as the observer PC reads it.
  await p.getByRole('button', { name: /^Insights/ }).click();
  await p.locator('.ins-kpis').waitFor({ timeout: 8000 });
  await p.locator('.ins-tsr').nth(15).waitFor();
  if (SHOTS) { await p.waitForTimeout(400); await p.screenshot({ path: path.join(SHOTS, 'ins-now.png') }); }
  await p.getByRole('button', { name: 'Control', exact: true }).click();
  // Wait for the game to end and save itself (40× speed: about 25 s), then the 5 s settle.
  for (let i = 0; i < 90; i++) { snap = await call('snapshot'); if (snap.lobbies[0].games[0].results?.length) break; await p.waitForTimeout(1000); }
  const g = snap.lobbies[0].games[0];
  if (g.source !== 'pcob' || g.results.length !== 16 || g.feed.stats.length !== 64) throw new Error('match 1 was not saved from the game: ' + JSON.stringify({ source: g.source, n: g.results?.length }));
  // Autopilot: the Standard Rundown runs the post-game set by itself.
  for (let i = 0; i < 20 && !snap.lobbyOnAir; i++) { await p.waitForTimeout(250); snap = await call('snapshot'); }
  if (!['br-wwcd', 'br-rankings'].includes(snap.lobbyOnAir)) throw new Error('autopilot did not take WWCD: ' + snap.lobbyOnAir);
  if (!snap.brAuto.next.includes('Match MVP')) throw new Error('autopilot chain: ' + JSON.stringify(snap.brAuto));
  await p.locator('.notice', { hasText: 'Autopilot' }).waitFor();
  if (SHOTS) {
    const fs = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await fs.goto(`http://127.0.0.1:${ENGINE}/overlays/fullscreen.html?match=${l.code}`); await fs.waitForTimeout(2500);
    await fs.screenshot({ path: path.join(SHOTS, 'pcob-auto-wwcd.png') }); await fs.close();
    await p.screenshot({ path: path.join(SHOTS, 'pcob-auto-live.png') });
  }
  // The producer's Take stops it; Player profile picks a player from the saved numbers.
  await p.getByRole('tab', { name: /Post-game/ }).click();
  await p.locator('.cp-gi', { hasText: 'Player profile' }).click();
  await p.getByLabel('Which player').selectOption({ index: 2 });
  await p.getByRole('button', { name: 'Put on air' }).click();
  await p.waitForTimeout(800);
  snap = await call('snapshot');
  if (snap.lobbyOnAir !== 'br-profile' || snap.brAuto.running) throw new Error('Take did not stop autopilot: ' + JSON.stringify([snap.lobbyOnAir, snap.brAuto]));
  if (!snap.lobbies[0].show?.pick?.player) throw new Error('pick not saved');
  if (SHOTS) {
    const fs = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await fs.goto(`http://127.0.0.1:${ENGINE}/overlays/fullscreen.html?match=${l.code}`); await fs.waitForTimeout(2500);
    await fs.screenshot({ path: path.join(SHOTS, 'pcob-profile.png') }); await fs.close();
  }
  // Insights for the saved match: every player and team, one click to air.
  await p.getByRole('button', { name: /^Insights/ }).click();
  await p.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Match 1' }).click();
  await p.locator('.ins-tbl tbody tr').nth(63).waitFor();
  if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, 'ins-match.png') }); }
  await p.getByRole('button', { name: 'On air · Team of the match' }).click();
  await p.waitForTimeout(600);
  snap = await call('snapshot');
  if (snap.lobbyOnAir !== 'br-tom' || snap.lobbies[0].show.pick.game !== 1) throw new Error('Insights did not take Team of the match: ' + JSON.stringify([snap.lobbyOnAir, snap.lobbies[0].show.pick]));
  await p.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Whole day' }).click();
  if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, 'ins-day.png'), fullPage: true }); }
  await p.getByRole('button', { name: 'Control', exact: true }).click();
  await p.getByRole('button', { name: 'Results', exact: true }).click();
  await p.getByRole('dialog', { name: 'Results' }).getByRole('tab', { name: /Match 1/ }).click();
  await p.getByText('From the game · edit to correct').waitFor();
  if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: path.join(SHOTS, 'pcob-results.png') }); }
  await p.keyboard.press('Escape');
  // Events › lobby › Rundown: Standard, autopilot on.
  await p.locator('nav.rail').getByRole('button', { name: 'Events' }).click();
  await p.locator('.ev-card').first().click();
  await p.getByRole('tab', { name: 'Lobbies' }).waitFor();
  await p.getByRole('button', { name: 'Open' }).first().click();
  await p.getByRole('tab', { name: 'Rundown' }).click();
  await p.getByRole('button', { name: 'Standard', pressed: true }).waitFor();
  if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, 'pcob-rundown.png'), fullPage: true }); }
  // The same Insights, read-only, from Events › lobby.
  await p.getByRole('button', { name: 'Insights', exact: true }).click();
  const ins = p.getByRole('dialog', { name: 'Insights' });
  await ins.locator('.ins-tbl').first().waitFor();
  if ((await ins.getByRole('button', { name: /On air/ }).count()) !== 0) throw new Error('Events Insights should be read-only');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'ins-events.png') });
  await p.keyboard.press('Escape');
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  console.log('PCOB walk complete');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
