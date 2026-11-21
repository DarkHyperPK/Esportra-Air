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
  await p.getByLabel('Lobby name').fill('Group A · Day 2');
  await p.getByRole('button', { name: 'New lobby' }).click();
  await p.getByRole('button', { name: 'Open' }).first().click();
  await p.getByRole('tab', { name: /Teams/ }).click();
  for (const n of NAMES) await p.locator('.lb-team').filter({ hasText: n }).locator('input').check();
  await p.getByRole('button', { name: 'Save teams' }).click();
  await p.getByRole('tab', { name: 'Results' }).click();
  const order = [2, 0, 5, 3, 1, 7, 9, 6, 11, 10, 13, 15, 12, 8, 4, 14];
  const elims = [7, 9, 6, 3, 4, 2, 3, 1, 2, 1, 1, 1, 1, 1, 3, 0];
  for (let place = 1; place <= 16; place++) { const t = NAMES[order[place - 1]]; await p.getByLabel(`${t} place`).fill(String(place)); await p.getByLabel(`${t} elims`).fill(String(elims[place - 1])); }
  // a duplicate blocks Save
  await p.getByLabel(`${NAMES[4]} place`).fill('1');
  if (!(await p.getByText(/is used twice/).isVisible()) || !(await p.getByRole('button', { name: 'Save and put on air' }).isDisabled())) throw new Error('a duplicate place did not block Save');
  await p.getByLabel(`${NAMES[4]} place`).fill('15');
  await p.getByRole('button', { name: 'Save and put on air' }).click();
  await p.getByText('Saved', { exact: true }).first().waitFor();
  const snap = await call('snapshot');
  const l = snap.lobbies[0];
  const room = await (await fetch(`http://127.0.0.1:${ENGINE}/api/${l.code}`)).json().catch((e) => ({ err: String(e) }));
  const st = room.state?.br?.standings ?? room.br?.standings;
  const top = st?.slice(0, 3).map((r) => [l.teams.find((t) => t.id === r.team).name, r.total]);
  if (JSON.stringify(top) !== JSON.stringify([['IRON PINE', 17], ['NIGHT OWLS', 15], ['NORTH TIDE', 11]])) throw new Error('room standings: ' + JSON.stringify(top));
  if (snap.selectedLobbyId !== l.id) throw new Error('the new lobby is not on the graphics');
  if (SHOTS) await p.screenshot({ path: require('node:path').join(SHOTS, 'lobby-results.png') });
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  console.log('Lobby walk complete');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
