#!/usr/bin/env node
// Records golden parity fixtures from the existing JavaScript HUD pipeline.
//
//   node engine/fixtures/record.cjs           (re-record)
//   node engine/fixtures/record.cjs --check   (CI: fail if the JS pipeline no longer gives the committed fixtures)
//
// Each fixture is NDJSON: a header line {fixture, initial}, then one line per step
// {step, kind, t, input, events, state}. `state` is the full match state after the step,
// exactly as the JS adapter + server merge logic produce it. The Rust engine must reproduce
// every line. Inputs run on a virtual clock, so output is deterministic.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const HUD = path.resolve(__dirname, '../../esportra-valorant-hud');
const OUT = __dirname;
const CHECK = process.argv.includes('--check');
const drift = [];
/** Writes a fixture, or with --check compares it with the committed file (a JS change not re-recorded fails CI). */
function out(file, content) {
  if (!CHECK) return fs.writeFileSync(file, content);
  // Line endings are ignored: a Windows checkout may turn them into CRLF.
  const had = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (had !== content) drift.push(path.relative(path.resolve(__dirname, '../..'), file));
}
process.on('exit', (code) => {
  if (!CHECK || code !== 0) return;
  if (drift.length) { console.error(`Fixtures differ from the JS pipeline (run node engine/fixtures/record.cjs and commit):\n  ${drift.join('\n  ')}`); process.exitCode = 1; }
  else console.error('Fixtures match the JS pipeline.');
});
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Same merge as server/server.js
const merge = (a, p) => { if (!isObj(p)) return p; a = isObj(a) ? a : {}; for (const k in p) { if (p[k] === null) delete a[k]; else a[k] = merge(a[k], p[k]); } return a; };

global.window = {};
require(path.join(HUD, 'core/state.default.js'));
require(path.join(HUD, 'core/state.clean.js'));
const DEFAULT = global.window.HUD_DEFAULT;
const CLEAN = global.window.HUD_CLEAN;
const adapterModule = require(path.join(HUD, 'adapters/valorant-gep.js'));
const { createValorantAdapter } = adapterModule;

function writeFixture(name, initial, steps) {
  const lines = [JSON.stringify({ fixture: name, initial })];
  for (const step of steps) lines.push(JSON.stringify(step));
  out(path.join(OUT, name + '.ndjson'), lines.join('\n') + '\n');
  console.log(`${name}: ${steps.length} steps`);
}

// ── Fixture 1: full simulated match through the server's ingest/patch semantics ──
async function recordSimulator() {
  let clock = 1_700_000_000_000;
  const realNow = Date.now, realSetTimeout = global.setTimeout, realLog = console.log;
  Date.now = () => clock;
  global.setTimeout = (fn, ms) => { clock += Math.max(0, ms | 0); return realSetTimeout(fn, 0); };
  console.log = () => {};

  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ t: clock, method: init.method, path: new URL(url).pathname, body: JSON.parse(init.body) });
    return { json: async () => ({}) };
  };
  const argv = process.argv;
  process.argv = [argv[0], 'simulate-valorant.js', 'FIXTURE', '--slow'];
  await new Promise((resolve, reject) => {
    const exit = process.exit;
    process.exit = (code) => { process.exit = exit; reject(new Error('simulator exited ' + code)); };
    require(path.join(HUD, 'tools/simulate-valorant.js'));
    // The simulator is a self-running async IIFE; wait until it stops issuing calls.
    let last = -1;
    const poll = () => { if (calls.length === last) { process.exit = exit; resolve(); } else { last = calls.length; realSetTimeout(poll, 50); } };
    realSetTimeout(poll, 50);
  });
  process.argv = argv; Date.now = realNow; global.setTimeout = realSetTimeout; console.log = realLog;

  exportTestRound(calls);
  const adapter = createValorantAdapter();
  let state = clone(CLEAN);
  const initial = clone(state);
  const steps = [];
  calls.forEach((call, step) => {
    let events = [];
    if (call.path.endsWith('/ingest/valorant')) {
      const msgs = Array.isArray(call.body) ? call.body : [call.body];
      let s = clone(state);
      for (const m of msgs) { const out = adapter.ingest(s, m, call.t); s = out.state; events.push(...out.events); }
      state = s;
      steps.push({ step, kind: 'ingest', t: call.t, input: msgs, events, state: clone(state) });
    } else if (call.method === 'PATCH') {
      state = merge(clone(state), call.body);
      steps.push({ step, kind: 'patch', t: call.t, input: call.body, events, state: clone(state) });
    } else if (call.method === 'PUT') {
      state = merge(clone(DEFAULT), call.body);
      steps.push({ step, kind: 'put', t: call.t, input: call.body, events, state: clone(state) });
    } else {
      steps.push({ step, kind: 'event', t: call.t, input: call.body, events, state: clone(state) });
    }
  });
  writeFixture('simulated-match', initial, steps);
}

// The Check screen's test round: the simulator's first three rounds, replayed by the engine at
// real pace through the real parser. Absolute timestamps inside patches become {"$at": offset}.
function exportTestRound(calls) {
  const t0 = calls[0].t;
  const end = calls.findIndex((c) => JSON.stringify(c.body).includes('"round_number":"4"'));
  const rebase = (v) => {
    if (typeof v === 'number' && v >= t0 - 60_000 && v <= t0 + 100_000_000) return { $at: v - t0 };
    if (Array.isArray(v)) return v.map(rebase);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebase(x)]));
    return v;
  };
  const steps = calls.slice(0, end > 0 ? end : calls.length).map((c) => ({
    at: c.t - t0,
    kind: c.path.endsWith('/ingest/valorant') ? 'ingest' : 'patch',
    body: c.path.endsWith('/ingest/valorant') ? c.body : rebase(c.body),
  }));
  const file = path.resolve(__dirname, '../crates/air-engine/test-round.json');
  out(file, JSON.stringify({ source: 'esportra-valorant-hud/tools/simulate-valorant.js --slow, rounds 1-3', steps }) + '\n');
  console.log(`test round: ${steps.length} steps, ${(steps.at(-1).at / 1000).toFixed(0)} s`);
}

// ── Fixture 2: Overwolf message shapes from adapters/test-valorant.js ──
function recordAdapterShapes() {
  const recorded = [];
  let initial = null;
  let instances = 0;
  adapterModule.createValorantAdapter = (opts) => {
    const inner = createValorantAdapter(opts), adapter = instances++;
    return { ...inner, ingest(state, msg, now) {
      // Some calls omit `now` (the adapter would use the wall clock); pin it for determinism.
      if (now === undefined) now = 100_000;
      if (initial === null) initial = clone(state);
      // The script runs several adapters on separate states, so record each step's input state.
      const input = clone(msg), before = clone(state);
      const out = inner.ingest(state, msg, now);
      recorded.push({ step: recorded.length, kind: 'ingest', adapter, before, t: now, input: [input], events: out.events, state: clone(out.state) });
      return out;
    } };
  };
  const warn = console.warn; console.warn = () => {};
  // test-valorant.js resets global.window and re-requires the defaults, so clear the cache.
  delete require.cache[require.resolve(path.join(HUD, 'core/state.default.js'))];
  // Record current adapter behaviour, not the script's expectations: some of its assertions are
  // stale (player-PC coverage now requires Riot UUID player IDs), so they are disabled here.
  const assert = require('assert'), saved = {};
  for (const name of ['strictEqual', 'deepStrictEqual', 'ok', 'equal', 'deepEqual', 'notStrictEqual']) { saved[name] = assert[name]; assert[name] = () => {}; }
  try { require(path.join(HUD, 'adapters/test-valorant.js')); }
  finally { Object.assign(assert, saved); global.window.HUD_CLEAN = CLEAN; }
  console.warn = warn;
  adapterModule.createValorantAdapter = createValorantAdapter;
  writeFixture('adapter-shapes', initial ?? clone(DEFAULT), recorded);
}

// ── Fixture 3: parser paths the other two fixtures do not reach ──
function recordEdgeCases() {
  const adapter = createValorantAdapter();
  let state = clone(CLEAN);
  const initial = clone(state), steps = [];
  const uuid = (i) => `00000000-0000-4000-8000-00000000000${i}`;
  const sb = (i, extra = {}) => ({ feature: 'match_info', key: 'scoreboard_' + i, data: JSON.stringify({
    player_id: uuid(i), name: `P${i} #TAG`, character: i === 4 ? 'Unknown_Codename_PC_C' : ['Clay', 'Sarge', 'Rift', 'Iris'][i % 4] + '_PC_C',
    team: i < 5 ? '0' : '1', alive: true, ult_points: '2', ult_max: '7', kills: 0, deaths: 0, assists: 0, money: 800, shield: i % 5, weapon: 'TX_Hud_Pistol_Classic', spike: i === 0, ...extra }) });
  const info = (k, v) => ({ info: { match_info: { [k]: typeof v === 'string' ? v : JSON.stringify(v) } }, feature: 'match_info' });
  const ev = (name, data = '') => ({ events: [{ name, data: typeof data === 'string' ? data : JSON.stringify(data) }] });
  const script = [
    [0, ev('match_start')],
    [10, info('map', 'Infinity')],
    // roster before scoreboard, picks by team order (string and object forms)
    [20, info('roster_0', { name: 'P0 #TAG', player_id: uuid(0), character: 'Clay', teammate: true, locked: false })],
    [30, info('ui_team_order_allies', '{"0":"Wushu","1":"Sarge"}')],
    [40, { feature: 'match_info', key: 'ui_team_order_enemies', data: { a: 'Hunter', b: 'Rift' } }],
    // kill before the names are known → queued, replayed once scoreboard arrives
    [50, ev('kill_feed', { attacker: 'P0 #TAG', victim: 'P5 #TAG', weapon: 'TX_Hud_Rifles_Volcano', headshot: true })],
    ...Array.from({ length: 10 }, (_, i) => [60 + i, sb(i)]),
    [100, info('round_number', '1')],
    [110, info('round_phase', 'shopping')],
    [120, info('match_score', { team_0: 0, team_1: 0 })],
    [130, info('round_phase', 'combat')],
    // player-PC data with valid UUIDs: health, boolean and numeric abilities, heartbeat
    [140, { playerId: uuid(2), feature: 'me', info: { me: { health: '73', abilities: '{"C":true,"Q":false,"E":true}' } } }],
    [150, { playerId: uuid(3), feature: 'me', info: { me: { abilities: { C: 2, Q: 0, E: 1 } } } }],
    [160, { playerId: uuid(1), captureHeartbeat: true }],
    // spike plant inferred from +300 credits during combat (needs a baseline after buy phase)
    [165, sb(0)],
    [166, sb(5)],
    [170, sb(0, { money: 1100 })],
    [180, sb(5, { money: 1100 })],
    [190, ev('kill_feed', { attacker: 'P6 #TAG', victim: 'P1 #TAG', weapon: 'tx_kj_bees', headshot: false })],
    [200, ev('kill_feed', { attacker: 'nobody #X', victim: 'P2 #TAG', weapon: 'knife' })],
    [210, { feature: 'match_info', key: 'observing', data: 'P3 #TAG' }],
    [220, ev('spike_detonated')],
    [230, info('match_score', { team_0: 1, team_1: 0 })],
    [240, info('round_phase', 'end')],
    // next round: health from the previous round must be invalidated
    [6000, info('round_number', '2')],
    [6010, info('round_phase', 'shopping')],
    [6020, { playerId: uuid(2), feature: 'me', info: { me: { health: '' } } }],
    [6030, info('round_phase', 'combat')],
    [6040, ev('planted_location', 'B')],
    [6050, ev('spike_defused')],
    [6060, info('match_score', { team_0: 1, team_1: 1 })],
    // jump to 12-12 for overtime then 13-12; side swaps after round 12 and in OT
    [7000, info('round_number', '13')],
    [7010, info('match_score', { team_0: 12, team_1: 11 })],
    [7020, info('round_number', '25')],
    [7030, info('match_score', { team_0: 12, team_1: 12 })],
    [7040, info('round_number', '26')],
    [7050, info('match_score', { team_0: 13, team_1: 12 })],
    [7060, { name: 'match_end', data: '' }],
    [7070, { garbage: true }],
    [7080, info('map', 'NotAMap')],
  ];
  const warn = console.warn; console.warn = () => {};
  script.forEach(([t, msg], step) => {
    const out = adapter.ingest(clone(state), clone(msg), t);
    state = out.state;
    steps.push({ step, kind: 'ingest', t, input: [msg], events: out.events, state: clone(state) });
  });
  console.warn = warn;
  writeFixture('edge-cases', initial, steps);
}

// The engine embeds the HUD's default states; they are JavaScript files, so export them as JSON.
function exportDefaults() {
  const file = path.resolve(__dirname, '../crates/air-engine/defaults.json');
  out(file, JSON.stringify({ default: DEFAULT, clean: CLEAN }, null, 1) + '\n');
  console.log('defaults: crates/air-engine/defaults.json');
}

(async () => {
  exportDefaults();
  recordAdapterShapes();
  recordEdgeCases();
  await recordSimulator();
})().catch((error) => { console.error(error); process.exit(1); });
