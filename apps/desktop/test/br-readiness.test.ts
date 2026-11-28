import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readiness } from '../src/shared/br-readiness.ts';
import { normalizeLobby } from '../src/shared/br-run.ts';
import { SCORING_PRESETS, type SavedPointsTable } from '../src/shared/br.ts';
import { nextTitle, slotsOf, tableGap, tableName, validSpec } from '../src/shared/br-format.ts';
import type { LibPlayer, Lobby } from '../src/shared/api.ts';

// Readiness (28 Nov): what needs the producer and what is in place. Made-up teams.
const player = (id: string, team: string, name: string, extra: Partial<LibPlayer> = {}): LibPlayer => ({ id, name, realName: '', gameId: name, photo: '', role: 'Player', teamId: team, uid: `50${id.replace(/\D/g, '').padStart(8, '0')}`, ...extra });
const lobby = (over: Partial<Lobby> = {}): Lobby => normalizeLobby({
  id: 'l', code: 'LABC', eventId: 'ev', game: 'pubgm', title: 'Group A', stage: '', createdAt: Date.UTC(2026, 10, 28),
  teams: [{ id: 'a', teamId: 'ta', name: 'Night Owls', tag: 'NWL', color: '#fff', logo: '/air-assets/x', players: [] }, { id: 'b', teamId: 'tb', name: 'Pale Horse', tag: 'PHS', color: '#fff', logo: '', players: [] }],
  games: [{ n: 1, map: 'Erangel' }, { n: 2, map: '' }],
  scoring: { placement: [10, 6], perElim: 1, tiebreak: ['wins'] },
  ...over,
});
const squad = (team: string, names: string[], first = 1) => names.map((n, i) => player(String(first + i), team, n));

test('needs you: players without a UID, teams under four, matches without a map, a points table with gaps, duplicate names', () => {
  const lib = [...squad('ta', ['Juno', 'Mira', 'Dax', 'Riku']), ...squad('tb', ['Mortis', 'Pestis', 'Bellum'], 10), player('99', 'tb', 'Karn', { uid: undefined }), player('98', 'ta', 'Coach Ward', { role: 'Coach', uid: undefined })];
  lib.push(player('77', 'ta', 'Zeno'), player('78', 'tb', 'zeno'));
  const r = readiness(lobby({ scoring: { placement: [10], perElim: 1, tiebreak: ['wins'] } }), lib);
  const ids = r.needs.map((n) => n.id);
  assert.deepEqual(ids, ['no-uid', 'no-map', 'table-gap', 'dup-ign']);
  assert.match(r.needs[0]!.title, /^1 player without a UID$/);
  assert.match(r.needs[0]!.detail, /Karn \(Pale Horse\)/, 'a coach needs no UID');
  assert.match(r.needs[1]!.title, /Match 2 has no map/);
  assert.match(r.needs[2]!.detail, /Place 2 has no points set/);
  assert.match(r.needs[3]!.detail, /Zeno/);
});

test('needs you: a team with fewer than four players, and an empty lobby', () => {
  const lib = [...squad('ta', ['Juno', 'Mira', 'Dax', 'Riku']), ...squad('tb', ['Mortis', 'Pestis', 'Bellum'], 10)];
  const few = readiness(lobby({ scoring: { placement: [10, 6], perElim: 1, tiebreak: ['wins'] } }), lib).needs.find((n) => n.id === 'few-players')!;
  assert.match(few.title, /1 team with fewer than 4 players/);
  assert.match(few.detail, /Pale Horse \(3\)/);
  assert.deepEqual(readiness(lobby({ teams: [] }), lib).needs.map((n) => n.id), ['no-teams', 'no-map']);
});

test('ready: logos and photos as counts, the points table by its name; nothing needs you when all is well', () => {
  const lib = [...squad('ta', ['Juno', 'Mira', 'Dax', 'Riku']), ...squad('tb', ['Mortis', 'Pestis', 'Bellum', 'Cade'], 10)].map((p, i) => (i < 6 ? { ...p, photo: '/air-assets/p' } : p));
  const saved: SavedPointsTable[] = [{ id: 't', name: 'Nexus 15-12-10', scoring: { placement: [15, 12], perElim: 1, tiebreak: ['wins'] } }];
  const r = readiness(lobby({ games: [{ n: 1, map: 'Erangel' }, { n: 2, map: 'Miramar' }], scoring: { placement: [15, 12], perElim: 1, tiebreak: ['wins'] } }), lib, saved);
  assert.deepEqual(r.needs, []);
  assert.deepEqual(r.ready.map((x) => x.title), ['1 of 2 logos', '6 of 8 photos', 'Points table complete']);
  assert.ok(r.ready[0]!.partial && r.ready[1]!.partial, 'partial counts are amber, never Needs you');
  assert.equal(r.ready[2]!.detail, 'Nexus 15-12-10');
});

test('the generator: times step by the gap, maps repeat in rotation; a wrong spec is refused', () => {
  const slots = slotsOf(validSpec({ count: 6, start: '16:00', gap: 30, maps: ['Erangel', 'Miramar', 'Rondo'] }));
  assert.deepEqual(slots.map((s) => `${s.time} ${s.map}`), ['16:00 Erangel', '16:30 Miramar', '17:00 Rondo', '17:30 Erangel', '18:00 Miramar', '18:30 Rondo']);
  assert.equal(slotsOf(validSpec({ count: 2, start: '23:30', gap: 45, maps: [] }))[1]!.time, '00:15', 'past midnight wraps');
  assert.equal(slotsOf(validSpec({ count: 1, start: '9:05', gap: 0, maps: [] }))[0]!.time, '09:05');
  assert.throws(() => validSpec({ count: 0, start: '16:00', gap: 30 }), /1 to 24/);
  assert.throws(() => validSpec({ count: 3, start: '4pm', gap: 30 }), /time, like 16:00/);
  assert.throws(() => validSpec({ count: 3, start: '16:00', gap: -5 }), /0 to 600/);
});

test('points tables: names, gaps, the next group’s title', () => {
  assert.equal(tableName(SCORING_PRESETS.pmgc.scoring), SCORING_PRESETS.pmgc.name);
  assert.equal(tableName({ placement: [15, 12, 10], perElim: 1, tiebreak: ['wins'] }, [{ id: 'x', name: 'Mine', scoring: { placement: [15, 12, 10], perElim: 1, tiebreak: ['wins'] } }]), 'Mine');
  assert.deepEqual(tableGap({ placement: [1, 2], perElim: 1, tiebreak: [] }, 4), { from: 3, to: 4 });
  assert.equal(tableGap({ placement: [1, 2], perElim: 1, tiebreak: [] }, 2), null);
  assert.deepEqual(['Group A', 'Group B · Day 1', 'Lobby 3', 'Finals'].map(nextTitle), ['Group B', 'Group C · Day 1', 'Lobby 4', 'Finals (copy)']);
});
