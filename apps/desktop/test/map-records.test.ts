import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapTallyCounter, buildRecord, seriesRecord, sideOf } from '../src/shared/map-records.ts';

const player = (name: string, k: number, d: number, a: number, fk = 0) => ({ name, agent: 'JETT', k, d, a, fk, puuid: `id-${name}`, adr: null });
const state = (rounds: number[]) => ({
  map: { name: 'LOTUS' },
  firstSide: ['ATK', 'DEF'],
  teams: [{ name: 'Night Owls', tag: 'NWL', color: '#4fd3ea', logo: '' }, { name: 'Crimson Five', tag: 'CRF', color: '#e0445e', logo: '' }],
  players: [['A', 'B', 'C', 'D', 'E'].map((n, i) => player(n, 20 - i, 10 + i, 3, i ? 0 : 6)), ['V', 'W', 'X', 'Y', 'Z'].map((n, i) => player(n, 15 - i, 14, 4))],
  teamStats: [{ firstKills: 13, plants: 9, defuses: 3, clutches: 3 }, { firstKills: 9, plants: 7, defuses: 2, clutches: 1 }],
  rounds: rounds.map((w) => ({ w, how: 'elim' })),
});

test('sides: first half, second half, then overtime alternating', () => {
  assert.deepEqual([1, 12, 13, 24, 25, 26, 27].map((r) => sideOf(['ATK', 'DEF'], 0, r)), ['ATK', 'ATK', 'DEF', 'DEF', 'ATK', 'DEF', 'ATK']);
  assert.equal(sideOf(['ATK', 'DEF'], 1, 1), 'DEF');
});

test('kills counted into first deaths, multi-kills, aces and headshots; team kills count for nobody', () => {
  const c = new MapTallyCounter(false);
  c.kill([0, 0], [1, 0], true); // first death: team 2 player 1
  c.kill([0, 0], [1, 1], false);
  c.kill([0, 0], [1, 2], true);
  c.kill([0, 0], [1, 3], false);
  c.kill([0, 0], [1, 4], false); // an ace
  c.roundEnd();
  c.kill([1, 0], [0, 1], false);
  c.kill([0, 2], [0, 3], false); // team kill
  c.roundEnd();
  const a = c.tally.players[0][0]!;
  assert.deepEqual([a.kills, a.hs, a.multi, a.aces], [5, 2, 1, 1]);
  assert.equal(c.tally.players[1][0]!.fd, 1);
  assert.equal(c.tally.players[0][1]!.fd, 1, 'the first death of round 2');
  assert.equal(c.tally.players[0][2]!.kills, 0, 'a team kill is not a kill');
});

test('a map record: score, winner, players, rounds won on attack and defence, pistols; partial hides what Air did not see', () => {
  // 13–9: team 1 wins rounds 1–7 and 13–18 (pistols both), team 2 the rest.
  const rounds = [...Array(7).fill(0), ...Array(5).fill(1), ...Array(6).fill(0), ...Array(4).fill(1)];
  const c = new MapTallyCounter(false);
  for (let i = 0; i < 3; i++) c.kill([0, 0], [1, i], true);
  c.roundEnd();
  const r = buildRecord(state(rounds), 1, [13, 9], 0, 'game', c.tally, 1000);
  assert.deepEqual([r.name, r.score, r.winner, r.how, r.partial], ['LOTUS', [13, 9], 0, 'game', false]);
  assert.deepEqual(r.perf[0].attack, [7, 12], 'team 1 attacked the first half');
  assert.deepEqual(r.perf[0].defence, [6, 10]);
  assert.deepEqual(r.perf[1].attack, [4, 10]);
  assert.deepEqual(r.perf[0].pistols, [2, 2]);
  assert.deepEqual([r.perf[0].firstKills, r.perf[0].plants, r.perf[0].multi], [13, 9, 1]);
  assert.deepEqual([r.players[0][0]!.k, r.players[0][0]!.fk, r.players[0][0]!.hsPct, r.players[0][0]!.multi], [20, 6, 100, 1]);
  assert.equal(r.players[0][0]!.adr, null, 'ADR only with player PCs');
  const partial = buildRecord(state(rounds), 1, [13, 9], 0, 'game', new MapTallyCounter(true).tally, 1000);
  assert.deepEqual([partial.partial, partial.players[0][0]!.multi, partial.perf[0].aces, partial.players[0][0]!.k], [true, null, null, 20], 'K/D/A are the game\'s own; Air\'s counts hide when it joined mid-map');
});

test('the whole series adds each player up by Riot id', () => {
  const m1 = buildRecord(state([...Array(13).fill(0), ...Array(9).fill(1)]), 1, [13, 9], 0, 'game', new MapTallyCounter(false).tally, 1);
  const m2 = buildRecord(state([...Array(8).fill(0), ...Array(13).fill(1)]), 2, [8, 13], 1, 'game', new MapTallyCounter(false).tally, 2);
  const s = seriesRecord([m1, m2])!;
  assert.deepEqual([s.name, s.score, s.winner], ['SERIES', [1, 1], -1]);
  assert.equal(s.players[0][0]!.k, 40);
  assert.equal(s.perf[0].plants, 18);
  assert.equal(seriesRecord([]), null);
});
