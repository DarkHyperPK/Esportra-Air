import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit } from './br-kit.ts';
import { BrFormat } from '../src/main/br-format.ts';
import { verify } from '../src/main/event-journal.ts';
import { matchesOfDay } from '../src/shared/br-run.ts';

// The format of a lobby (28 Nov): the match generator on a day, Copy this lobby, and the producer's points tables.
const small = { teams: 4, length: 300, games: 2 };
const wire = (s: Awaited<ReturnType<typeof kit>>) => new BrFormat({ lobbies: s.lobbies, store: s.store, changed: () => {} });
const spec = { count: 6, start: '16:00', gap: 30, maps: ['Erangel', 'Miramar', 'Rondo'] };

test('Fill the list: six matches with times and the map rotation, ids kept, journalled so the journal still agrees', async () => {
  const s = await kit(small);
  try {
    const f = wire(s);
    const before = s.lobby().games.map((g) => g.id);
    const day = s.lobby().days![0]!;
    f.generate(s.lobbyId, day.id, spec);
    const l = s.lobby();
    assert.equal(l.games.length, 6);
    assert.deepEqual(l.games.map((g) => `${g.scheduledAt} ${g.map}`), ['16:00 Erangel', '16:30 Miramar', '17:00 Rondo', '17:30 Erangel', '18:00 Miramar', '18:30 Rondo']);
    assert.deepEqual(l.games.slice(0, 2).map((g) => g.id), before, 'matches that were there keep their ids');
    assert.deepEqual(l.games.map((g) => g.n), [1, 2, 3, 4, 5, 6]);
    assert.equal(matchesOfDay(l, l.days![0]!).length, 6);
    assert.ok(l.games.every((g) => g.state === 'scheduled' && g.dayId === day.id));
    assert.deepEqual(verify(s.journal.read('ev'), s.lobbies.list()).problems, []);
    // Each match stays editable afterwards, and filling again rewrites the unplayed ones.
    s.lobbies.update(s.lobbyId, { games: l.games.map((g, i) => ({ map: i === 5 ? '' : g.map, startsAt: g.startsAt })) });
    assert.equal(s.lobby().games[5]!.map, '');
    f.generate(s.lobbyId, day.id, { ...spec, count: 4, start: '15:00', gap: 20 });
    assert.deepEqual(s.lobby().games.map((g) => g.scheduledAt), ['15:00', '15:20', '15:40', '16:00'], 'two extra unplayed matches at the end are removed');
    assert.deepEqual(verify(s.journal.read('ev'), s.lobbies.list()).problems, []);
  } finally { await s.close(); }
});

test('Fill the list never touches a match that is armed, live or played, and refuses while one is live', async () => {
  const s = await kit(small);
  try {
    const f = wire(s);
    const day = s.lobby().days![0]!;
    f.generate(s.lobbyId, day.id, spec);
    const ids = s.lobby().games.map((g) => g.id!);
    s.run.arm(s.lobbyId, ids[0]!);
    f.generate(s.lobbyId, day.id, { ...spec, count: 6, start: '20:00', gap: 10 });
    assert.equal(s.lobby().games[0]!.scheduledAt, '16:00', 'the armed match keeps its time');
    assert.equal(s.lobby().games[1]!.scheduledAt, '20:10');
    assert.throws(() => f.generate(s.lobbyId, day.id, { ...spec, count: 0 }), /1 to 24/);
    // Fewer matches than the day has played or armed ones is refused.
    s.lobbies.setResult(s.lobbyId, 2, s.lobby().teams.map((t, i) => ({ team: t.id, place: i + 1, elims: 1 })));
    assert.throws(() => f.generate(s.lobbyId, day.id, { ...spec, count: 1 }), /played or armed matches beyond 1/);
    assert.equal(s.lobby().games.length, 6);
    // A live match blocks it altogether.
    s.pcob.begin(); s.connect(); await s.step(2);
    assert.equal(s.game(1).state, 'live');
    assert.throws(() => f.generate(s.lobbyId, day.id, spec), /A match is live/);
  } finally { await s.close(); }
});

test('a second day gets its own matches, numbered after the first', async () => {
  const s = await kit(small);
  try {
    const f = wire(s);
    const day1 = s.lobby().days![0]!;
    f.generate(s.lobbyId, day1.id, { ...spec, count: 3 });
    const d2 = s.run.dayAdd(s.lobbyId, {});
    f.generate(s.lobbyId, d2, { ...spec, count: 3, start: '14:00' });
    const l = s.lobby();
    assert.equal(l.games.length, 6);
    assert.deepEqual(matchesOfDay(l, l.days![1]!).map((g) => [g.n, g.scheduledAt]), [[4, '14:00'], [5, '14:30'], [6, '15:00']]);
    assert.deepEqual(verify(s.journal.read('ev'), s.lobbies.list()).problems, []);
  } finally { await s.close(); }
});

test('Copy this lobby: the same format and points for Group B, no teams, no results', async () => {
  const s = await kit(small);
  try {
    const f = wire(s);
    const day = s.lobby().days![0]!;
    f.generate(s.lobbyId, day.id, { ...spec, count: 3 });
    s.lobbies.update(s.lobbyId, { title: 'Group A', stage: 'Qualifiers', scoring: { placement: [15, 12, 10, 8], perElim: 2, matchPoint: 60, tiebreak: ['wins', 'elims'] } });
    s.lobbies.setResult(s.lobbyId, 1, s.lobby().teams.map((t, i) => ({ team: t.id, place: i + 1, elims: 3 })));
    const copy = await f.copy(s.lobbyId);
    assert.equal(copy.title, 'Group B');
    assert.equal(copy.stage, 'Qualifiers');
    assert.notEqual(copy.id, s.lobbyId);
    assert.notEqual(copy.code, s.lobby().code);
    assert.deepEqual(copy.teams, []);
    assert.deepEqual(copy.scoring, s.lobby().scoring);
    assert.notEqual(copy.scoring, s.lobby().scoring, 'the points are a copy, not shared');
    assert.deepEqual(copy.games.map((g) => `${g.scheduledAt} ${g.map} ${g.state}`), ['16:00 Erangel scheduled', '16:30 Miramar scheduled', '17:00 Rondo scheduled']);
    assert.ok(copy.games.every((g) => !g.results && !g.feed && !g.attempts?.length && !s.lobby().games.some((o) => o.id === g.id)));
    assert.equal(copy.days!.length, 1);
    assert.equal(copy.days![0]!.matchIds.length, 3);
    assert.notEqual(copy.days![0]!.id, day.id);
    assert.deepEqual(copy.adjustments, []);
    assert.equal(s.lobby().games[0]!.state, 'provisional', 'the first lobby is untouched');
    assert.equal((await f.copy(copy.id, 'Finals Day')).title, 'Finals Day');
    assert.deepEqual(verify(s.journal.read('ev'), s.lobbies.list()).problems, []);
  } finally { await s.close(); }
});

test('saved points tables: kept on this PC, named once, deleted by the producer', async () => {
  const s = await kit(small);
  try {
    const f = wire(s);
    const scoring = { placement: [15, 12, 10], perElim: 1, tiebreak: ['wins', 'placementPts'] };
    const t = f.saveTable({ name: 'Nexus 15-12-10', scoring });
    assert.deepEqual(f.tables().map((x) => x.name), ['Nexus 15-12-10']);
    assert.throws(() => f.saveTable({ name: 'nexus 15-12-10', scoring }), /already a points table/);
    assert.throws(() => f.saveTable({ name: ' ', scoring }), /Name the points table/);
    assert.throws(() => f.saveTable({ name: 'Bad', scoring: { placement: [] } }), /first place/);
    assert.equal(f.saveTable({ id: t.id, name: 'Nexus', scoring: { ...scoring, perElim: 2 } }).id, t.id, 'saving again changes it');
    assert.equal(f.tables()[0]!.scoring.perElim, 2);
    f.deleteTable(t.id);
    assert.deepEqual(f.tables(), []);
    assert.throws(() => f.deleteTable(t.id), /already gone/);
  } finally { await s.close(); }
});
