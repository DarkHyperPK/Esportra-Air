// The product tour's pictures (first run and Help › Take the tour), captured from Air itself.
//   node dev/host.ts            (in another terminal; a fresh dev host)
//   node dev/tour-shots.cjs [outDir]   (default src/renderer/assets/tour)
// Seeds a believable show through the dev host's API: made-up teams that sound real (no real
// organisations), an event with talent and sponsors, a veto, standings, a live test round and a map
// record; then photographs Air's own screens. Riot's art is blocked while capturing (graphics show
// names instead), so no game art is baked into the pictures the installer ships.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const HOST = process.env.AIR_HOST || 'http://127.0.0.1:5320';
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../src/renderer/assets/tour'));
fs.mkdirSync(OUT, { recursive: true });

const call = async (method, ...args) => {
  const res = await fetch(`${HOST}/call/${method}`, { method: 'POST', body: JSON.stringify(args) });
  const body = await res.json();
  if (!res.ok) throw new Error(`${method}: ${body.error}`);
  return body;
};

// Made-up teams (CLAUDE.md: no real organisations), with simple marks drawn here.
const TEAMS = [
  { name: 'Vanguard Esports', tag: 'VGD', color: '#e8b04b', shape: 'shield', players: ['Kestrel', 'Rook', 'Valen', 'Saber', 'Juno'] },
  { name: 'Helix Gaming', tag: 'HLX', color: '#2ec4b6', shape: 'hex', players: ['Drift', 'Pyre', 'Tenzo', 'Mako', 'Lyric'] },
  { name: 'Nova Rising', tag: 'NVR', color: '#8b7cf6', shape: 'star', players: ['Vesper', 'Kaze', 'Orin', 'Bolt', 'Nyra'] },
  { name: 'Ironclad', tag: 'ICD', color: '#e0445e', shape: 'diamond', players: ['Anvil', 'Strix', 'Halo', 'Rune', 'Ember'] },
];
const SHAPES = {
  shield: (c) => `<path d="M128 18 L222 52 V122 C222 176 182 214 128 238 C74 214 34 176 34 122 V52 Z" fill="${c}"/>`,
  hex: (c) => `<path d="M128 16 L225 72 V184 L128 240 L31 184 V72 Z" fill="${c}"/>`,
  star: (c) => `<path d="M128 14 L156 98 L244 98 L172 150 L200 236 L128 184 L56 236 L84 150 L12 98 L100 98 Z" fill="${c}"/>`,
  diamond: (c) => `<path d="M128 12 L244 128 L128 244 L12 128 Z" fill="${c}"/>`,
};
const markSvg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${SHAPES[t.shape](t.color)}<text x="128" y="${t.shape === 'star' ? 160 : 150}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${t.tag.length > 3 ? 54 : 64}" text-anchor="middle" fill="#0b0c0f">${t.tag}</text></svg>`;
const wordSvg = (name, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="140" viewBox="0 0 520 140"><rect x="6" y="38" width="64" height="64" rx="14" fill="${color}"/><text x="88" y="92" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="46" fill="#f4f4f6">${name}</text></svg>`;

/** The current snapshot: the first message of the host's event stream. */
async function snapshot() {
  const res = await fetch(`${HOST}/events`);
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
  reader.cancel().catch(() => {});
  return JSON.parse(text.slice(text.indexOf('data: ') + 6, text.indexOf('\n\n')));
}

async function upload(page, svg, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  return call('uploadImage', `data:image/png;base64,${png.toString('base64')}`);
}

async function seed(browser) {
  const page = await browser.newPage();
  await call('chooseGame', 'valorant').catch(() => {});
  await call('chooseProfile', 'observer').catch(() => {});
  await call('finishOnboarding').catch(() => {});
  for (const t of TEAMS) t.logo = await upload(page, markSvg(t), 256, 256);
  const eventLogo = await upload(page, markSvg({ shape: 'hex', color: '#8b7cf6', tag: 'APS' }), 256, 256);
  const sponsors = [['Northwind Energy', '#4fd3ea', 'title'], ['Pixelforge', '#f2a24f', 'partner'], ['Lumen Bank', '#9fd38a', 'supporter']];
  for (const s of sponsors) s.push(await upload(page, wordSvg(s[0].toUpperCase(), s[1]), 520, 140));
  await page.close();

  await call('createEvent', 'Ascend Pro Series 2026');
  const event = (await snapshot()).events.find((e) => e.name === 'Ascend Pro Series 2026');
  await call('updateEvent', event.id, { logo: eventLogo, accent: '#8b7cf6', stages: ['Groups', 'Playoffs', 'Grand final'] });
  for (const [name, role] of [['Maya Chen', 'host'], ['Leo Hart', 'play-by-play'], ['Sam Okafor', 'analyst']]) await call('saveTalent', event.id, { name, role });
  for (const [name, , tier, logo] of sponsors) await call('saveSponsor', event.id, { name, tier, logo, spaces: { rotator: { logo: '' }, 'map-veto': { logo: '' }, timeout: { logo: '' }, breakdown: { logo: '' } } });

  const team = (t) => ({ name: t.name, tag: t.tag, color: t.color, logo: t.logo });
  const lineup = (t) => t.players.map((p) => ({ name: p, realName: '', gameId: `${p}#${t.tag}`, photo: '' }));
  const screens = ['in-game', 'match-intro', 'map-veto', 'agent-select', 'halftime', 'map-result', 'victory-map', 'breakdown', 'team-performance', 'postgame-matchup', 'series', 'standings', 'bracket', 'champion', 'casters', 'holding'];
  // Two other matches of the event first, so the grand final opens last.
  await call('createMatch', { bestOf: 3, teams: [team(TEAMS[2]), team(TEAMS[3])], players: [lineup(TEAMS[2]), lineup(TEAMS[3])], eventId: event.id, stage: 'Playoffs', screens: ['in-game', 'map-result'] });
  await call('createMatch', { bestOf: 3, teams: [team(TEAMS[0]), team(TEAMS[2])], players: [lineup(TEAMS[0]), lineup(TEAMS[2])], eventId: event.id, stage: 'Playoffs', screens: ['in-game', 'map-result'] });
  await call('createMatch', { bestOf: 3, teams: [team(TEAMS[0]), team(TEAMS[1])], players: [lineup(TEAMS[0]), lineup(TEAMS[1])], eventId: event.id, stage: 'Grand final', screens });
  // The veto so far, the event's table and bracket, the show text.
  for (const [map, side] of [['BIND'], ['ABYSS'], ['LOTUS', 'DEF'], ['HAVEN', 'ATK'], ['ASCENT']]) await call('vetoStep', side ? { map, side } : { map });
  await call('eventDataSave', event.id, {
    standings: [['VANGUARD ESPORTS', '5–1', '11–4', '+38'], ['HELIX GAMING', '4–2', '9–6', '+21'], ['NOVA RISING', '3–3', '7–7', '+2'], ['IRONCLAD', '2–4', '5–9', '-17']],
    ticker: ['Vanguard Esports reach the grand final without dropping a map', 'Helix Gaming come through the lower bracket'],
    bracket: { qf: [], sf: [['VANGUARD ESPORTS', 2, 'NOVA RISING', 0], ['HELIX GAMING', 2, 'IRONCLAD', 1]], gf: [['VANGUARD ESPORTS', 0, 'HELIX GAMING', 0]] },
    handle: '@ascendpro', site: 'ascendpro.gg',
  });
  // OBS connected (the dev host's stand-in, test/fake-obs.ts, password 'secret') with Air's scenes added.
  await call('connectObs', { host: '127.0.0.1', port: 4455, password: 'secret' }).catch((e) => console.warn('obs', e.message));
  await call('installGraphics').catch((e) => console.warn('install', e.message));
  // Esportra: signed in, tonight's matches listed.
  // The dev host's stand-in Esportra (dev/fake-esportra.ts) has fixed sign-in details.
  await call('esportraSignIn', 'producer@example.com', 'correct horse battery').catch((e) => console.warn('sign-in', e.message));
  return event;
}

// The dev host's engine (dev/host.ts: port 5399, key below).
const ENGINE = process.env.AIR_ENGINE || 'http://127.0.0.1:5399';
const ENGINE_KEY = 'dev-host-key-0123456789abcdef';
const AGENTS = [['JETT', 'SOVA', 'OMEN', 'KILLJOY', 'SKYE'], ['RAZE', 'FADE', 'VIPER', 'CYPHER', 'NEON']];
const STATS = [[[19, 11, 4, 4], [14, 12, 7, 2], [12, 13, 6, 1], [11, 12, 3, 1], [8, 13, 10, 1]], [[17, 13, 3, 3], [13, 14, 6, 2], [12, 14, 5, 1], [10, 13, 4, 1], [9, 13, 8, 0]]];
async function midMap() {
  const code = (await snapshot()).match.code;
  const url = `${ENGINE}/api/${encodeURIComponent(code)}`;
  const headers = { 'X-Esportra-Key': ENGINE_KEY, 'Content-Type': 'application/json' };
  const { state } = await (await fetch(url, { headers })).json();
  const rounds = [0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0].map((w) => ({ w, how: 'elim' }));
  state.teams = state.teams.map((t, i) => ({ ...t, score: [9, 7][i], side: ['DEF', 'ATK'][i] }));
  state.players = [0, 1].map((t) => state.players[t].map((p, i) => ({ ...p, name: TEAMS[t].players[i].toUpperCase(), agent: AGENTS[t][i], k: STATS[t][i][0], d: STATS[t][i][1], a: STATS[t][i][2], fk: STATS[t][i][3], alive: true, hp: 100 })));
  state.rounds = rounds;
  state.firstSide = ['ATK', 'DEF'];
  state.round = { ...state.round, number: 17, phase: 'buy' };
  state.map = { ...state.map, name: 'LOTUS', number: 1 };
  state.teamStats = [{ ...state.teamStats[0], firstKills: 9, plants: 6, defuses: 2, clutches: 2 }, { ...state.teamStats[1], firstKills: 7, plants: 5, defuses: 3, clutches: 1 }];
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(state) });
  if (!res.ok) console.warn('mid-map state', res.status, await res.text());
  await new Promise((r) => setTimeout(r, 1500));
}

(async () => {
  const browser = await chromium.launch();
  const event = await seed(browser);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  // Riot's art stays out of the pictures (graphics show names instead).
  await page.route(/media\.valorant-api\.com|\/art\//, (route) => route.abort());
  const shot = async (name) => {
    await page.waitForTimeout(1200);
    const png = await page.screenshot();
    // WebP through Chromium's canvas (no image library needed).
    const conv = await browser.newPage();
    const webp = await conv.evaluate(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.82).split(',')[1];
    }, png.toString('base64'));
    await conv.close();
    fs.writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(webp, 'base64'));
    console.log(`${name}.webp ${(Buffer.from(webp, 'base64').length / 1024).toFixed(0)} KB`);
  };
  const rail = (name) => page.getByRole('navigation').getByRole('button', { name, exact: true }).first().click();
  // Events home (the rail opens the last event; its back link leads home).
  const eventsHome = async () => { await rail('Events'); const back = page.getByRole('button', { name: /← Events/ }); if (await back.count()) await back.first().click(); await page.waitForTimeout(600); };
  const step = async (name) => { await page.getByRole('navigation', { name: 'Match steps' }).getByRole('button', { name, exact: true }).click(); };

  await page.goto(`${HOST}/?host=${HOST}`);
  await page.locator('.rail, nav').first().waitFor();
  // 1 · Events home.
  await eventsHome();
  await page.getByText('Ascend Pro Series 2026').first().waitFor();
  await shot('events');
  // 2 · The event's matches, then the grand final's Overview.
  await page.getByText('Ascend Pro Series 2026').first().click();
  await page.locator('.ev-match').first().waitFor();
  await shot('event-matches');
  await page.locator('.ev-match').filter({ hasText: 'Helix Gaming' }).first().getByRole('button', { name: 'Open' }).click();
  await page.getByRole('navigation', { name: 'Match steps' }).waitFor();
  await step('Overview');
  await shot('overview');
  // 3 · Match data: the veto entered live.
  await step('Match data');
  await page.getByRole('group', { name: 'Map pool' }).waitFor();
  await shot('match-data');
  // 4 · Rundown.
  await step('Rundown');
  await shot('rundown');
  // 5 · Live: a test round, a map record, Breakdown selected.
  // A map well under way (round 17, 9–7 on Lotus), written straight into the dev host's engine room with
  // the tour's player names, agents and numbers; then the producer closes map 1 so Breakdown has a record.
  await midMap();
  await call('closeMap').catch((e) => console.warn('close map', e.message));
  await rail('Live');
  await page.getByRole('tablist', { name: 'Phase' }).getByRole('tab', { name: /Post-game/ }).click();
  await page.locator('.cp-gi').filter({ hasText: /^Breakdown/ }).first().click();
  await shot('control-panel');
  // 6 · OBS.
  await rail('Events');
  await page.getByText('Ascend Pro Series 2026').first().click();
  await page.locator('.ev-match').filter({ hasText: 'Helix Gaming' }).first().getByRole('button', { name: 'Open' }).click();
  await step('OBS');
  await shot('obs');
  // 7 · Esportra: tonight's matches from the tournament, on Events home.
  await eventsHome();
  await page.waitForTimeout(800);
  await shot('esportra');
  void event;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
