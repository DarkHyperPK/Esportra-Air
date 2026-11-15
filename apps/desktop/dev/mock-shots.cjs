// Developer tool, never shipped: pictures of Air's broadcast graphics for design mocks.
//   node dev/host.ts                       (another terminal)
//   node dev/mock-shots.cjs <outDir>
// Seeds a private sample room with made-up teams (no real organisations) and photographs the graphics
// viewers see. Riot's art is fetched from its public art server for the mock only; the app itself
// draws art from each PC's own download.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');

const HOST = process.env.AIR_HOST || 'http://127.0.0.1:5320';
const ENGINE = process.env.AIR_ENGINE || 'http://127.0.0.1:5399';
const KEY = 'dev-host-key-0123456789abcdef';
const ROOM = '__ESA_SIM_TOUR';
const OUT = path.resolve(process.argv[2] || 'mock-shots');
fs.mkdirSync(OUT, { recursive: true });

const call = async (method, ...args) => {
  const res = await fetch(`${HOST}/call/${method}`, { method: 'POST', body: JSON.stringify(args) });
  const body = await res.json();
  if (!res.ok) throw new Error(`${method}: ${body.error}`);
  return body;
};

const TEAMS = [
  { name: 'VANGUARD ESPORTS', tag: 'VGD', color: '#e8b04b', shape: 'shield', players: ['KESTREL', 'ROOK', 'VALEN', 'SABER', 'JUNO'], agents: ['JETT', 'SOVA', 'OMEN', 'KILLJOY', 'SKYE'] },
  { name: 'HELIX GAMING', tag: 'HLX', color: '#2ec4b6', shape: 'hex', players: ['DRIFT', 'PYRE', 'TENZO', 'MAKO', 'LYRIC'], agents: ['RAZE', 'FADE', 'VIPER', 'CYPHER', 'NEON'] },
];
const SHAPES = {
  shield: (c) => `<path d="M128 18 L222 52 V122 C222 176 182 214 128 238 C74 214 34 176 34 122 V52 Z" fill="${c}"/>`,
  hex: (c) => `<path d="M128 16 L225 72 V184 L128 240 L31 184 V72 Z" fill="${c}"/>`,
};
const mark = (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${SHAPES[t.shape](t.color)}<text x="128" y="150" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="62" text-anchor="middle" fill="#0b0c0f">${t.tag}</text></svg>`;

async function upload(browser, svg) {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return call('uploadImage', `data:image/png;base64,${png.toString('base64')}`);
}

/** The HUD's own sample (core/state.default.js), with the tour teams and event. */
function sampleState(marks) {
  global.window = {};
  require(path.join(__dirname, '../../../esportra-valorant-hud/core/state.default.js'));
  const s = JSON.parse(JSON.stringify(global.window.HUD_DEFAULT));
  const STATS = [[[21, 13, 4, 5], [16, 14, 7, 3], [14, 15, 6, 2], [12, 14, 3, 1], [9, 15, 11, 1]], [[19, 15, 3, 4], [15, 16, 6, 2], [14, 16, 5, 2], [11, 15, 4, 1], [10, 15, 9, 1]]];
  s.event = { ...s.event, name: 'NORTHSTAR CHAMPIONSHIP', stage: 'GRAND FINAL', bestOf: 3, accent: '#8b7cf6' };
  s.teams = s.teams.map((t, i) => ({ ...t, name: TEAMS[i].name, tag: TEAMS[i].tag, color: TEAMS[i].color, logo: marks[i], score: [11, 9][i], series: [1, 0][i] }));
  s.players = s.players.map((ps, t) => ps.map((p, i) => ({ ...p, name: TEAMS[t].players[i], agent: TEAMS[t].agents[i], k: STATS[t][i][0], d: STATS[t][i][1], a: STATS[t][i][2], fk: STATS[t][i][3], locked: true })));
  s.map = { name: 'LOTUS', number: 2 };
  // Twenty rounds played (11–9), so the round history agrees with the score.
  const W = [0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0], HOW = ['elim', 'defuse', 'elim', 'boom', 'elim', 'time'];
  s.rounds = W.map((w, i) => ({ w, how: HOW[i % HOW.length] }));
  s.series = [{ map: 'HAVEN', pick: 1, score: [13, 10], winner: 0 }, { map: 'LOTUS', pick: 0, score: [0, 0], winner: null }, { map: 'SUNSET', pick: -1, score: [0, 0], winner: null }];
  s.veto = [{ team: 0, action: 'ban', map: 'BIND' }, { team: 1, action: 'ban', map: 'ABYSS' }, { team: 0, action: 'pick', map: 'LOTUS', side: 'DEF', sideTeam: 1 }, { team: 1, action: 'pick', map: 'HAVEN', side: 'ATK', sideTeam: 0 }, { team: 0, action: 'ban', map: 'SPLIT' }];
  s.mapPool = ['ABYSS', 'BIND', 'CORRODE', 'HAVEN', 'LOTUS', 'SPLIT', 'SUNSET'];
  s.vetoTurn = { team: 1, action: 'ban', endsAt: Date.now() + 23000 };
  s.round = { ...s.round, number: 21, phase: 'live', endsAt: Date.now() + 61000, remaining: 61 };
  const rec = (t) => s.players[t].map((p) => ({ name: p.name, agent: p.agent, gameId: '', k: p.k, d: p.d, a: p.a, fk: p.fk, fd: 2, multi: 1, aces: 0, hsPct: 24, adr: null }));
  s.airRecord = { map: 1, name: 'HAVEN', score: [13, 10], winner: 0, teams: s.teams.map((t) => ({ name: t.name, tag: t.tag, color: t.color, logo: t.logo })), players: [rec(0), rec(1)],
    perf: [{ firstKills: 13, multi: 6, aces: 1, clutches: 3, plants: 9, defuses: 3, attack: [7, 12], defence: [6, 11], pistols: [2, 2] }, { firstKills: 10, multi: 4, aces: 0, clutches: 1, plants: 7, defuses: 2, attack: [5, 11], defence: [5, 12], pistols: [0, 2] }], how: 'game', closedAt: Date.now(), partial: false };
  s.airSpaces = { breakdown: { name: 'NORTHWIND ENERGY', logo: '' }, victory: { name: 'NORTHWIND ENERGY', logo: '' }, timeout: { name: 'NORTHWIND ENERGY', logo: '' }, 'map-veto': { name: 'NORTHWIND ENERGY', logo: '' } };
  s.layout = { ...s.layout, pauseStyle: 'bar' };
  s.sponsors = [{ name: 'NORTHWIND ENERGY', logo: '', line: 'POWERING THE GRAND FINAL' }];
  return s;
}

(async () => {
  const browser = await chromium.launch();
  const marks = [await upload(browser, mark(TEAMS[0])), await upload(browser, mark(TEAMS[1]))];
  const room = `${ENGINE}/api/${ROOM}`;
  const headers = { 'X-Esportra-Key': KEY, 'Content-Type': 'application/json' };
  await fetch(room, { headers });
  const base = sampleState(marks);
  const put = async (extra) => { const r = await fetch(room, { method: 'PUT', headers, body: JSON.stringify({ ...base, ...extra }) }); if (!r.ok) throw new Error(`room ${r.status} ${await r.text()}`); };

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  // Art for the mock from Riot's public art server, fetched once with curl (it follows this machine's proxy
  // settings) and kept in a folder; the app itself uses each PC's own download.
  const artDir = path.join(OUT, '.art');
  await page.route(/\/art\/(maps|agents|weapons|abilities|gear)\//, async (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/art\//, '');
    const file = path.join(artDir, p);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { execFileSync('curl', ['-sfL', '--max-time', '20', '-o', file, `https://media.valorant-api.com/${p}`]); } catch { return route.abort(); }
    }
    route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(file) });
  });
  const shot = async (name, overlay, extra = {}, backdrop = false, clear = false) => {
    await put(extra);
    await page.goto(`${ENGINE}/overlays/${overlay}.html?match=${ROOM}`);
    await page.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 });
    if (backdrop) await page.evaluate(() => { const M = window.HUD.mapA('LOTUS'); document.body.style.background = M ? `center/cover url('${M.splash}')` : '#223'; });
    await page.waitForTimeout(2500);
    const png = await page.screenshot({ omitBackground: clear });
    const webp = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.84).split(',')[1];
    }, png.toString('base64'));
    fs.writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(webp, 'base64'));
    console.log(`${name}.webp ${(Buffer.from(webp, 'base64').length / 1024).toFixed(0)} KB`);
  };
  await shot('hud', 'ingame', {}, true);
  await shot('hud-clear', 'ingame', {}, false, true);
  await shot('veto', 'map-veto');
  await shot('agents', 'agent-select', { round: { ...base.round, phase: 'buy' } });
  await shot('breakdown', 'breakdown');
  await shot('performance', 'team-performance');
  await shot('victory', 'victory-map');
  await shot('timeout', 'ingame', { airPause: { id: '00000000-0000-4000-8000-000000000000', kind: 'timeout', team: 1, seconds: 60, startedAt: Date.now() - 23000 }, round: { ...base.round, phase: 'buy' } }, true);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
