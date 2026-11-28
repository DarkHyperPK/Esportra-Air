// Battle royale scoring: points, standings with tiebreaks, the match-point champion and result checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORING_PRESETS, champion, gamePoints, liveTable, standings, validResults, validScoring, type LobbyCore, type LobbyTeam } from '../src/shared/br.ts';

const team = (id: string): LobbyTeam => ({ id, teamId: null, name: id.toUpperCase(), tag: id.toUpperCase(), color: '#ffffff', logo: '', players: [] });
const lobby = (ids: string[], games: Array<Array<[string, number, number]>>, scoring = SCORING_PRESETS.pmgc.scoring): LobbyCore => ({
  teams: ids.map(team), scoring,
  games: games.map((rows, i) => ({ n: i + 1, map: 'Erangel', results: rows.map(([t, place, elims]) => ({ team: t, place, elims })) })),
});

test('PMGC and FFWS points on worked examples', () => {
  assert.deepEqual(gamePoints({ team: 'a', place: 1, elims: 7 }, SCORING_PRESETS.pmgc.scoring), { placementPts: 10, elimPts: 7, total: 17 });
  assert.equal(gamePoints({ team: 'a', place: 8, elims: 2 }, SCORING_PRESETS.pmgc.scoring).total, 3);
  assert.equal(gamePoints({ team: 'a', place: 9, elims: 0 }, SCORING_PRESETS.pmgc.scoring).total, 0);
  assert.equal(gamePoints({ team: 'a', place: 1, elims: 5 }, SCORING_PRESETS.ffws.scoring).total, 17);
  assert.equal(gamePoints({ team: 'a', place: 10, elims: 0 }, SCORING_PRESETS.ffws.scoring).total, 1);
  assert.equal(gamePoints({ team: 'a', place: 1, elims: 12 }, { ...SCORING_PRESETS.pmgc.scoring, elimCap: 6 }).elimPts, 6);
});

test('standings add the games and break ties by wins, then placement points, then elims, then the last game', () => {
  // a: 10+1, 1+4 = 16 (1 win). b: 6+5, 4+1 = 16 (0 wins) → a ahead on wins.
  const l = lobby(['a', 'b', 'c', 'd'], [[['a', 1, 1], ['b', 2, 5], ['c', 3, 0], ['d', 4, 0]], [['c', 1, 0], ['b', 4, 1], ['d', 2, 0], ['a', 8, 4]]]);
  const st = standings(l);
  assert.deepEqual(st.map((r) => [r.team, r.total, r.rank]), [['a', 16, 1], ['b', 16, 2], ['c', 15, 3], ['d', 10, 4]]);
  assert.equal(st[0]!.wins, 1);
  // Clearing a game's results takes it out again.
  const cleared = { ...l, games: [l.games[0]!, { ...l.games[1]!, results: undefined }] };
  assert.deepEqual(standings(cleared).map((r) => [r.team, r.total]), [['a', 11], ['b', 11], ['c', 5], ['d', 4]]);
  assert.deepEqual(standings(cleared).slice(0, 2).map((r) => r.rank), [1, 2], 'a wins the tie on wins');
  // Fully level teams share a rank.
  const level = lobby(['a', 'b'], [[['a', 1, 0], ['b', 2, 4]]], { placement: [5, 1], perElim: 1, tiebreak: [] });
  assert.deepEqual(standings(level).map((r) => r.rank), [1, 1]);
});

test('match point: a team already over the threshold must win a game; reaching it by winning is not enough', () => {
  const s = { ...SCORING_PRESETS.pmgc.scoring, matchPoint: 20 };
  // Game 1: a wins with 12 (22 → at match point, but the title needs a win after that).
  const g1: Array<[string, number, number]> = [['a', 1, 12], ['b', 2, 3], ['c', 3, 0]];
  assert.equal(champion(lobby(['a', 'b', 'c'], [g1], s)), null);
  assert.equal(standings(lobby(['a', 'b', 'c'], [g1], s))[0]!.matchPoint, true);
  // Game 2: b wins but is not at match point; game 3: a wins again → champion.
  const g2: Array<[string, number, number]> = [['b', 1, 9], ['a', 2, 0], ['c', 3, 0]];
  assert.equal(champion(lobby(['a', 'b', 'c'], [g1, g2], s)), null);
  const g3: Array<[string, number, number]> = [['a', 1, 0], ['b', 2, 0], ['c', 3, 0]];
  assert.deepEqual(champion(lobby(['a', 'b', 'c'], [g1, g2, g3], s)), { team: 'a', game: 3 });
  assert.equal(champion(lobby(['a', 'b', 'c'], [g1, g2, g3])), null, 'no threshold, no early champion');
});

test('live table: total so far plus this game', () => {
  const l = lobby(['a', 'b'], [[['a', 1, 2], ['b', 2, 0]]]);
  assert.deepEqual(liveTable(l, [{ team: 'a', elims: 1 }, { team: 'b', elims: 6, place: 2 }]).map((r) => [r.team, r.before, r.game, r.total]), [['b', 6, 12, 18], ['a', 12, 1, 13]]);
});

test('results are checked: teams in the lobby, each once, each place once', () => {
  const teams = ['a', 'b', 'c'].map(team);
  assert.deepEqual(validResults([{ team: 'b', place: 2, elims: 1 }, { team: 'a', place: 1, elims: 0 }], teams).map((r) => r.team), ['a', 'b']);
  assert.throws(() => validResults([{ team: 'a', place: 1 }, { team: 'b', place: 1 }], teams), /both in place 1/);
  assert.throws(() => validResults([{ team: 'a', place: 1 }, { team: 'a', place: 2 }], teams), /two results/);
  assert.throws(() => validResults([{ team: 'z', place: 1 }], teams), /not in this lobby/);
  assert.throws(() => validResults([{ team: 'a', place: 4 }], teams), /place must be a whole number from 1 to 3/);
  assert.throws(() => validScoring({ placement: [] }), /first place/);
  assert.deepEqual(validScoring({ placement: [10, 6], perElim: 1, matchPoint: 60 }).tiebreak, ['wins', 'placementPts', 'elims', 'lastGame']);
});
