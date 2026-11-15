// node adapters/test-valorant.js — replays message shapes from Overwolf's Valorant docs through the adapter.
'use strict';
const assert = require('assert'); global.window = {}; require('../core/state.default.js');
const { createValorantAdapter } = require('./valorant-gep');
const A = createValorantAdapter(); let s = JSON.parse(JSON.stringify(window.HUD_DEFAULT)), ev = [];
const feed = (m, t = 1000) => { const o = A.ingest(s, m, t); s = o.state; ev.push(...o.events); };
const sb = (i, o) => ({ feature: 'match_info', category: 'match_info', key: 'scoreboard_' + i, data: JSON.stringify(o) });
feed({ events: [{ name: 'match_start', data: '' }] });
feed({ info: { match_info: { map: 'Jam' } }, feature: 'match_info' });
const names = [['TroyDarion #6170', 'Gumshoe', 0], ['NoobaHooba #8609', 'Hunter', 0], ['Sh4rgaas #EUNE', 'Pandemic', 0], ['SoloMeo #ESP', 'Thorne', 0], ['BreachMain #EUW', 'Vampire', 0],
  ['zayed2 #EUW', 'Wraith', 1], ['maher #7836', 'Wushu', 1], ['Kubix #5713', 'Thorne', 1], ['kot #8059', 'Phoenix', 1], ['ImJOWY #2905', 'Clay', 1]];
// Riot player ids (puuid) are UUIDs; player-PC data is accepted only from those (player-coverage.js).
const pid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
names.forEach(([n, c, t], i) => feed(sb(i, { name: n, character: c, teammate: t === 0, team: t, alive: true, player_id: pid(i), shield: 2, weapon: 'TX_Hud_Rifles_Volcano', spike: false, ult_points: 3, ult_max: 8, kills: i, deaths: 2, assists: 1, money: 3900 })));
assert.strictEqual(s.map.name, 'LOTUS'); assert.strictEqual(s.players[0][0].agent, 'CYPHER'); assert.strictEqual(s.players[1][1].agent, 'JETT');
assert.strictEqual(s.players[0][0].name, 'TROYDARION'); assert.strictEqual(s.players[0][0].armor, 50); assert.strictEqual(s.players[0][0].weapon, 'VANDAL');
feed({ info: { match_info: { round_number: '1' } }, feature: 'match_info' });
assert.deepStrictEqual(s.teams.map(t => t.side), ['ATK', 'DEF']);
feed({ feature: 'match_info', key: 'match_score', value: '{"team_0":0,"team_1":0}' });
feed({ info: { match_info: { round_phase: 'shopping' } }, feature: 'match_info' }, 2000);
assert.strictEqual(s.round.phase, 'buy'); assert.strictEqual(s.round.endsAt, 32000);
assert.strictEqual(s.prevCredits[0][0], 3900, 'buy phase records the starting credits for the purchase change');
feed({ info: { match_info: { round_phase: 'combat' } }, feature: 'match_info' }, 32000);
feed({ events: [{ name: 'kill_feed', data: '{"attacker":"maher","victim":"TroyDarion","is_attacker_teammate":false,"is_victim_teammate":true,"weapon":"TX_Hud_Operator","ult":"","assist1":"","headshot":true}' }] }, 40000);
assert.strictEqual(s.killfeed.at(-1).weapon, 'OPERATOR'); assert.deepStrictEqual(s.killfeed.at(-1).killer, [1, 1]); assert.strictEqual(s.players[0][0].alive, false); assert.strictEqual(s.killfeed.at(-1).hs, true);
feed({ events: [{ name: 'kill_feed', data: '{"attacker":"kot","victim":"Sh4rgaas","weapon":"TX_KJ_Bees","headshot":false}' }] }, 41000);
assert.strictEqual(s.killfeed.at(-1).weapon, 'NANOSWARM');
feed({ events: [{ name: 'spike_defused', data: '' }] }, 60000);
feed({ feature: 'match_info', key: 'match_score', value: '{"team_0":0,"team_1":1}' }, 60500);
assert.deepStrictEqual(s.rounds.at(-1), { w: 1, how: 'defuse' }); assert.strictEqual(s.teams[1].score, 1); assert.strictEqual(s.banner.type, 'flawless', 'team1 wins with all alive → flawless banner (not round)'); assert.strictEqual(s.teams[0].lossStreak, 1);
feed({ feature: 'match_info', key: 'observing', data: 'kot #8059' }); assert.deepStrictEqual(s.observed, [1, 3]);
feed({ playerId: pid(6), feature: 'me', info: { me: { health: '64', abilities: '{"C":true,"Q":false,"E":true,"X":false}' } } });
// GEP reports each ability as available or not (true/false), not how many charges are left.
assert.strictEqual(s.players[1][1].hp, 64); assert.deepStrictEqual(s.players[1][1].abilityAvailability, [true, false, true]);
assert.strictEqual(s.players[1][1].abilitiesKnown, true, 'GEP ability data marks abilities as known');
assert.strictEqual(s.players[1][1].chargesKnown, false, 'true/false availability is not a charge count');
// a roster message seen before the scoreboard must not pin a player to the wrong team
const B = createValorantAdapter(); let s2 = JSON.parse(JSON.stringify(window.HUD_DEFAULT));
s2 = B.ingest(s2, { info: { match_info: { roster_7: '{"name":"late #1","player_id":"x7","character":"Rift","teammate":true,"locked":true}' } }, feature: 'match_info' }).state;
s2 = B.ingest(s2, sb(7, { name: 'late #1', character: 'Rift', team: 1, alive: true, player_id: 'x7', shield: 0, kills: 0, deaths: 0, assists: 0, money: 800 })).state;
assert.deepStrictEqual(B.ctx.slots.get('x7'), [1, 0]); assert.strictEqual(s2.players[1][0].agent, 'ASTRA');
// Team assignment must work during agent select, before the scoreboard has a valid team ID.
{ const C = createValorantAdapter(); let sx = JSON.parse(JSON.stringify(window.HUD_DEFAULT));
  sx = C.ingest(sx, { info: { match_info: { roster_0: '{"name":"ally#1","player_id":"ally","character":"Wushu","teammate":true,"locked":true}', roster_1: '{"name":"enemy#1","player_id":"enemy","character":"Clay","teammate":false,"locked":true}' } } }).state;
  assert.strictEqual(sx.players[0][0].agent, 'JETT'); assert.strictEqual(sx.players[1][0].agent, 'RAZE');
  sx = C.ingest(sx, sb(1, { name: 'enemy#1', player_id: 'enemy', character: 'Clay', teammate: false, team: 255, alive: true, money: 800 })).state;
  assert.deepStrictEqual(C.ctx.slots.get('enemy'), [1, 0], 'team 255 falls back to teammate flag');
  sx = C.ingest(sx, { feature: 'match_info', key: 'ui_team_order_enemies', value: '{"1":"Pandemic","2":"Hunter"}' }).state;
  assert.strictEqual(sx.players[1][1].agent, 'SOVA', 'team order can fill enemy picks before the roster arrives'); }
// Plant location is an info key in GEP; it must start the timer and count once.
{ const C = createValorantAdapter(); let sx = JSON.parse(JSON.stringify(window.HUD_DEFAULT));
  const ingest = (m, t) => { const result = C.ingest(sx, m, t); sx = result.state; return result.events; };
  ingest({ feature: 'match_info', key: 'match_start', value: '' }, 1000);
  assert.strictEqual(sx.teamStats[0].plants, 0, 'match start resets derived team stats');
  ingest({ info: { match_info: { round_number: '1', round_phase: 'combat' } } }, 2000);
  const events = ingest({ feature: 'match_info', key: 'planted_location', value: 'A' }, 12000);
  assert.strictEqual(sx.round.phase, 'planted'); assert.strictEqual(sx.round.endsAt, 57000);
  assert.strictEqual(sx.teamStats[0].plants, 1); assert.ok(events.some(e => e.type === 'spike.planted'));
  ingest({ feature: 'match_info', key: 'planted_location', value: 'A' }, 13000);
  assert.strictEqual(sx.teamStats[0].plants, 1, 'repeat location does not double count'); }
// ─── T2: SUMMIT map + BANDIT / WARDEN codes ──────────────────────────────────
{ const { MAPS, LOADOUT, KILL } = require('./valorant-gep');
  assert.strictEqual(MAPS['Summit'], 'SUMMIT', 'Summit → SUMMIT');
  assert.strictEqual(LOADOUT['TX_Hud_Pistol_Bandit'], 'BANDIT', 'Bandit loadout code');
  assert.strictEqual(LOADOUT['TX_Hud_Rifles_Warden'], 'WARDEN', 'Warden loadout code');
  assert.strictEqual(KILL['tx_hud_pistol_bandit'], 'BANDIT', 'Bandit kill-feed code');
  assert.strictEqual(KILL['tx_hud_rifles_warden'], 'WARDEN', 'Warden kill-feed code'); }

// ─── T1: Miks and Veto codenames (confirmed: Iris → MIKS, Pine → VETO) ───────
{ const { AGENTS } = require('./valorant-gep');
  assert.strictEqual(AGENTS['Iris'], 'MIKS', 'Iris → MIKS');
  assert.strictEqual(AGENTS['Pine'], 'VETO', 'Veto → VETO'); }

// ─── T1: unknown agent codename warns exactly once ────────────────────────────
{ const warns = []; const orig = console.warn; console.warn = (...a) => warns.push(a);
  const C = createValorantAdapter(); let sx = JSON.parse(JSON.stringify(window.HUD_DEFAULT));
  const sbUnk = o => ({ feature: 'match_info', key: 'scoreboard_' + o, data: JSON.stringify({ name: 'TestPlayer#001' + o, character: 'CrypticAgent_PC_C', teammate: true, team: 0, alive: true, player_id: 'unk-' + o, shield: 0, kills: 0, deaths: 0, assists: 0, money: 0 }) });
  sx = C.ingest(sx, sbUnk(0)).state;
  sx = C.ingest(sx, sbUnk(0)).state; // second time with same codename — must not warn again
  console.warn = orig;
  assert.strictEqual(warns.length, 1, 'Unknown agent warns once, not twice');
  assert.strictEqual(warns[0][1], 'CrypticAgent', 'Warn logs the stripped raw codename'); }

// ─── T3: deferred kill queue resolves after scoreboard arrives ────────────────
{ const D = createValorantAdapter(); let sd = JSON.parse(JSON.stringify(window.HUD_DEFAULT));
  sd.killfeed = []; // isolate: HUD_DEFAULT ships with demo entries
  const earlyKill = { events: [{ name: 'kill_feed', data: JSON.stringify({ attacker: 'attacker#0001', victim: 'victim#0002', weapon: 'TX_Hud_Rifles_Volcano', headshot: false }) }] };
  sd = D.ingest(sd, earlyKill, 1000).state;
  assert.strictEqual(D.ctx.pendingKills.length, 1, 'Kill queued when roster not ready');
  assert.strictEqual(sd.killfeed.length, 0, 'Kill not yet in killfeed');
  const mkSb = (idx, name, char, team) => ({ feature: 'match_info', key: 'scoreboard_' + idx, data: JSON.stringify({ name, character: char, teammate: team === 0, team, alive: true, player_id: 'qp-' + idx, shield: 0, kills: 0, deaths: 0, assists: 0, money: 0 }) });
  sd = D.ingest(sd, mkSb(0, 'attacker#0001', 'Wushu', 0), 2000).state;
  sd = D.ingest(sd, mkSb(1, 'victim#0002', 'Clay', 1), 2000).state;
  assert.strictEqual(D.ctx.pendingKills.length, 0, 'Pending kill replayed after both players registered');
  assert.strictEqual(sd.killfeed.length, 1, 'Kill appears in killfeed after replay');
  assert.strictEqual(sd.killfeed[0].weapon, 'VANDAL', 'Replayed kill weapon resolved correctly');
  assert.strictEqual(sd.killfeed[0].ts, 1000, 'Replayed kill preserves original timestamp'); }

console.log('valorant adapter: all checks passed;', ev.length, 'events emitted:', [...new Set(ev.map(e => e.type))].join(', '));
