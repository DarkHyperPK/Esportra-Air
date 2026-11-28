// Battle royale lobby walk (21 Nov): on a fresh dev host, a PUBG MOBILE event, a 16-team lobby, one match typed
// and saved; checks the duplicate-place warning and the standings the room gets. Exits 1 on any problem.
//   node dev/host.ts --port 5334 --engine-port 5396 &   then   node dev/lobby-walk.cjs [host] [engine port] [shot dir]
'use strict';
const { chromium } = require('playwright');
const H = process.argv[2] || 'http://127.0.0.1:5334';
const ENGINE = process.argv[3] || '5396';
const SHOTS = process.argv[4] || null;
const call = async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
const NAMES = ['NIGHT OWLS','CRIMSON FIVE','IRON PINE','DUNE RUNNERS','SILVER FOX','NORTH TIDE','BLUE HARBOR','STONE WOLVES','RED KESTREL','LOW ORBIT','WILD CARD','GREY MOUNTAIN','FERAL SIX','ECHO VALLEY','QUIET STORM','HIGH GROUND'];
(async () => {
  await call('chooseGame', ['pubgm']); await call('finishOnboarding');
  await call('createEvent', ['Air Showcase Cup']);
  for (const [i, n] of NAMES.entries()) await call('saveTeam', [{ name: n, tag: n.split(' ').map((w) => w[0]).join('') + String(i).padStart(1), color: `hsl(${i * 22} 70% 60%)`.replace(/hsl.*/, ['#22d3ee','#f43f5e','#ffb60e','#a78bfa'][i % 4]), logo: '' }]);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${H}/?host=${H}`); await p.locator('nav.rail').waitFor();
  await p.locator('nav.rail').getByRole('button', { name: 'Events' }).click();
  await p.locator('.ev-card').first().click();
  await p.getByRole('tab', { name: 'Lobbies' }).waitFor();
  // 28 Nov: an event without lobbies opens a start screen (Use a stage, Paste a list, Pick teams, Start empty); Lobby name and New lobby
  // are on the list once a lobby exists. Start empty, then rename and add the teams as before.
  await p.getByRole('button', { name: 'Choose' }).last().click();
  await p.getByLabel('Lobby name').fill('Group A · Day 2');
  await p.getByLabel('Lobby name').blur();
  await p.getByRole('tab', { name: /Teams/ }).click();
  for (const n of NAMES) await p.locator('.lb-team').filter({ hasText: n }).locator('input').check();
  await p.getByRole('button', { name: 'Save teams' }).click();
  await p.getByRole('tab', { name: 'Results' }).click();
  const order = [2, 0, 5, 3, 1, 7, 9, 6, 11, 10, 13, 15, 12, 8, 4, 14];
  const elims = [7, 9, 6, 3, 4, 2, 3, 1, 2, 1, 1, 1, 1, 1, 3, 0];
  for (let place = 1; place <= 16; place++) { const t = NAMES[order[place - 1]]; await p.getByLabel(`${t} place`).fill(String(place)); await p.getByLabel(`${t} elims`).fill(String(elims[place - 1])); }
  // a duplicate blocks Save
  await p.getByLabel(`${NAMES[4]} place`).fill('1');
  if (!(await p.getByText(/is used twice/).isVisible()) || !(await p.getByRole('button', { name: 'Save results' }).isDisabled())) throw new Error('a duplicate place did not block Save');
  await p.getByLabel(`${NAMES[4]} place`).fill('15');
  await p.getByRole('button', { name: 'Save results' }).click();
  // Typed results are provisional (27 Nov): Confirm makes them official and puts the standings on the graphics.
  await p.getByText('Provisional', { exact: true }).first().waitFor();
  await p.getByRole('button', { name: 'Confirm match 1' }).click();
  await p.getByText('Confirmed', { exact: true }).first().waitFor();
  const snap = await call('snapshot');
  const l = snap.lobbies[0];
  const room = await (await fetch(`http://127.0.0.1:${ENGINE}/api/${l.code}`)).json().catch((e) => ({ err: String(e) }));
  const st = room.state?.br?.standings ?? room.br?.standings;
  const top = st?.slice(0, 3).map((r) => [l.teams.find((t) => t.id === r.team).name, r.total]);
  if (JSON.stringify(top) !== JSON.stringify([['IRON PINE', 17], ['NIGHT OWLS', 15], ['NORTH TIDE', 11]])) throw new Error('room standings: ' + JSON.stringify(top));
  if (snap.selectedLobbyId !== l.id) throw new Error('the new lobby is not on the graphics');
  if (SHOTS) await p.screenshot({ path: require('node:path').join(SHOTS, 'lobby-results.png') });
  // Same flow as a match (23 Nov): the lobby page is structure only; the HUD's layout is chosen in HUD library;
  // graphics go on air from Live. The room follows each step.
  const roomNow = async () => { const r = await (await fetch(`http://127.0.0.1:${ENGINE}/api/${l.code}`)).json(); return r.state ?? r; };
  if (await p.getByRole('tab', { name: 'Graphics' }).count()) throw new Error('the lobby page still has a Graphics tab');
  await p.locator('nav.rail').getByRole('button', { name: /HUD library/ }).click();
  await p.locator('.pack-card').first().click();
  // 28 Nov: three ready-made HUD templates; Preview a card, then Use for this lobby.
  await p.getByRole('button', { name: 'Preview Broadcast Grid' }).click();
  await p.getByRole('button', { name: 'Use for this lobby' }).click();
  for (let i = 0; i < 20 && (await roomNow()).layout?.brHud !== 'grid'; i++) await p.waitForTimeout(150);
  if ((await roomNow()).layout?.brHud !== 'grid') throw new Error('the HUD layout chosen in HUD library did not reach the room');
  if (SHOTS) { await p.waitForTimeout(1200); await p.screenshot({ path: require('node:path').join(SHOTS, 'lobby-library.png') }); }
  await p.keyboard.press('Escape');
  // Graphics studio › Event theme: Jungle, own highlight colour, parachutes off; Save puts it on the lobby room.
  await p.locator('nav.rail').getByRole('button', { name: /Graphics studio/ }).click();
  await p.getByRole('tab', { name: 'Event theme' }).click();
  await p.locator('.bt-preset').filter({ hasText: 'Jungle' }).click();
  await p.getByLabel('Highlight').fill('#33ccaa');
  await p.getByLabel('Parachutes').uncheck();
  if (SHOTS) { await p.waitForTimeout(1500); await p.screenshot({ path: require('node:path').join(SHOTS, 'lobby-theme.png') }); }
  await p.locator('.bt-actions').getByRole('button', { name: /^Save/ }).click();
  for (let i = 0; i < 20 && (await roomNow()).airBrTheme?.preset !== 'jungle'; i++) await p.waitForTimeout(150);
  const th = (await roomNow()).airBrTheme;
  if (th?.preset !== 'jungle' || th.colors?.acc !== '#33ccaa' || th.props?.chutes !== false) throw new Error('the theme did not reach the room: ' + JSON.stringify(th));
  await p.locator('nav.rail').getByRole('button', { name: 'Live' }).click();
  await p.getByRole('tab', { name: /Post-game/ }).click();
  await p.locator('.cp-gi').filter({ hasText: 'Overall standings' }).click();
  await p.getByRole('button', { name: 'Put on air' }).click();
  await p.locator('.cp-gi').filter({ hasText: 'Overall standings' }).getByText('ON AIR').waitFor();
  if ((await roomNow()).airFullscreen !== 'br-overall') throw new Error('Live did not put it on air: ' + (await roomNow()).airFullscreen);
  // The full-screen host on the lobby's room draws the lobby's real standings.
  const fs = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await fs.goto(`http://127.0.0.1:${ENGINE}/overlays/fullscreen.html?match=${l.code}`);
  await fs.locator('.brf-overall .b6-tr .nm').first().waitFor({ timeout: 8000 });
  const leader = await fs.locator('.brf-overall .b6-tr .nm').first().evaluate((e) => e.firstChild.textContent.trim());
  if ((await fs.locator('[data-theme]').first().getAttribute('data-theme')) !== 'jungle') throw new Error('the host is not in the lobby theme');
  if (leader !== 'IRON PINE') throw new Error('the host shows ' + leader);
  if (SHOTS) { await fs.waitForTimeout(1500); await fs.screenshot({ path: require('node:path').join(SHOTS, 'lobby-overall-on-air.png') }); await p.waitForTimeout(1200); await p.screenshot({ path: require('node:path').join(SHOTS, 'lobby-live.png') }); }
  await fs.close();
  await p.getByRole('button', { name: 'Take off' }).click();
  for (let i = 0; i < 20 && (await roomNow()).airFullscreen; i++) await p.waitForTimeout(150);
  if ((await roomNow()).airFullscreen) throw new Error('Take off did not reach the room');
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  console.log('Lobby walk complete');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
