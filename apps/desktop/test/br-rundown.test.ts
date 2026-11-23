import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHOW, patchShow, presetRows, showOf, stepsFor, validRows } from '../src/shared/br-rundown.ts';
import { BrAutopilot } from '../src/main/br-autopilot.ts';
import { Lobbies } from '../src/main/br-lobbies.ts';
import type { Lobby } from '../src/shared/api.ts';
import type { PlayerGameStat } from '../src/shared/br-stats.ts';

// A battle royale lobby's show (24 Nov): Standard by default with autopilot on; the plane runs the drop map, a
// saved match runs WWCD, results, MVP and standings, then Starting soon, and the last match ends on Champions.
const screens = (rows: Array<{ screen: string }>) => rows.map((r) => r.screen);

test('a lobby without a show runs Standard with autopilot and every moment on', () => {
  const s = showOf({});
  assert.equal(s.autopilot, true);
  assert.equal(s.startedFrom, 'standard');
  assert.ok(Object.values(s.moments).every(Boolean));
  assert.equal(s.ltf, false, 'the top fraggers band stays off until asked for');
});

test('Standard: plane, after each match, after the last', () => {
  const rows = presetRows('standard');
  assert.deepEqual(screens(stepsFor(rows, 'plane', 1, 6)), ['br-drop']);
  assert.deepEqual(screens(stepsFor(rows, 'game.end', 2, 6)), ['br-wwcd', 'br-rankings', 'br-mvp', 'br-overall', 'br-lobby']);
  assert.deepEqual(screens(stepsFor(rows, 'game.end', 6, 6)), ['br-wwcd', 'br-rankings', 'br-mvp', 'br-overall'], 'no Starting soon after the last match');
  assert.deepEqual(screens(stepsFor(rows, 'day.end', 6, 6)), ['br-champion']);
  assert.deepEqual(screens(stepsFor(rows, 'day.end', 3, 6)), []);
  assert.deepEqual(screens(stepsFor(presetRows('results'), 'plane', 1, 6)), []);
  assert.ok(screens(presetRows('everything')).includes('br-mstats'));
});

test('a switched-off row is skipped but the rows after it still run', () => {
  const rows = presetRows('standard').map((r) => (r.id === 'wwcd' ? { ...r, enabled: false } : r));
  assert.deepEqual(screens(stepsFor(rows, 'game.end', 1, 6)).slice(0, 2), ['br-rankings', 'br-mvp']);
});

test('changes are checked', () => {
  assert.throws(() => validRows([{ screen: 'br-nope', when: 'plane' }]), /lobby graphics/);
  assert.throws(() => validRows([{ screen: 'br-wwcd', when: 'soon' }]), /when/);
  const rows = validRows([{ id: 'a', screen: 'br-wwcd', when: 'game.end', hold: 9999 }, { id: 'a', screen: 'br-mvp', when: 'after' }]);
  assert.equal(rows[0]!.hold, 600);
  assert.notEqual(rows[0]!.id, rows[1]!.id, 'ids stay unique');
  const next = patchShow(DEFAULT_SHOW, { moments: { zone: false, nope: true }, pick: { scope: 'day', game: 99, player: ' ACE ' }, autopilot: false }, 6);
  assert.equal(next.moments.zone, false);
  assert.equal(next.autopilot, false);
  assert.deepEqual(next.pick, { scope: 'day', player: 'ACE' }, 'a match that is not in the lobby is dropped');
  assert.throws(() => patchShow(DEFAULT_SHOW, { preset: 'loud' }, 6), /Standard/);
});

function lobby(over: Partial<Lobby> = {}): Lobby {
  return { id: 'l1', code: 'LX', eventId: 'e', game: 'pubgm', title: 'Group A', stage: '', teams: [], games: Array.from({ length: 3 }, (_, i) => ({ n: i + 1, map: 'Erangel' })), scoring: { placement: [10, 6, 5], perElim: 1, tiebreak: ['wins'] }, createdAt: 0, ...over };
}

test('autopilot runs the chain, clears after the last hold, and the producer’s Take stops it', async () => {
  const taken: Array<string | null> = [] as Array<string | null>;
  let release: () => void = () => {};
  const waits: number[] = [];
  let l = lobby();
  const ap = new BrAutopilot({ lobby: () => l, take: async (_l, s) => void taken.push(s), log: () => {}, changed: () => {}, wait: async (ms) => { waits.push(ms); } });
  ap.onMoment('game.end', { game: 3, results: true });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([...taken], ['br-wwcd', 'br-rankings', 'br-mvp', 'br-overall', 'br-champion'], 'last match: the chain, then Champions, which stays');
  assert.deepEqual(waits, [10_000, 14_000, 10_000, 14_000]);
  assert.equal(ap.status().running, null);
  // A match that ended without every place runs nothing.
  taken.length = 0;
  ap.onMoment('game.end', { game: 1, results: false });
  await new Promise((r) => setImmediate(r));
  assert.equal(taken.length, 0);
  // A Take mid-chain stops it.
  const ap2 = new BrAutopilot({ lobby: () => l, take: async (_l, s) => void taken.push(s), log: () => {}, changed: () => {}, wait: () => new Promise<void>((r) => { release = r; }) });
  ap2.onMoment('plane', { game: 1 });
  ap2.onMoment('game.end', { game: 1, results: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(ap2.status().running, 'WWCD', 'the newer chain replaces the drop map');
  assert.deepEqual(ap2.status().next, ['Match results', 'Match MVP', 'Overall standings', 'Starting soon']);
  ap2.stop();
  release();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([...taken], ['br-drop', 'br-wwcd'], 'nothing more after the stop, and no clear over the producer’s graphic');
  // Switched off: nothing runs.
  l = lobby({ show: { autopilot: false } });
  taken.length = 0;
  ap.onMoment('plane', { game: 1 });
  await new Promise((r) => setImmediate(r));
  assert.equal(taken.length, 0);
});

test('brStats: each saved match and the day, with points and MVP ratings', () => {
  const stat = (name: string, team: string, kills: number, damage: number, place: number): PlayerGameStat => ({ name, openId: `o-${name}`, uid: name, team, place, kills, knockouts: kills, assists: 0, damage, damageTaken: 0, heal: 0, headshots: 0, rescues: 0, survival: 600, maxKillDistance: 50, airdrops: 0, vehicleKills: 0, grenadeKills: 0, driveDistance: 0, walkDistance: 0, outsideZoneTime: 0 });
  const feed = (stats: PlayerGameStat[]) => ({ source: 'pcob' as const, gameId: 'g', stats, kills: [], circles: [], plane: null, savedAt: 0 });
  const l = lobby({
    games: [
      { n: 1, map: 'Erangel', results: [{ team: 'a', place: 1, elims: 5 }, { team: 'b', place: 2, elims: 2 }], feed: feed([stat('ACE', 'a', 5, 600, 1), stat('ROOK', 'b', 2, 300, 2)]) },
      { n: 2, map: 'Miramar', results: [{ team: 'b', place: 1, elims: 4 }, { team: 'a', place: 2, elims: 1 }], feed: feed([stat('ACE', 'a', 1, 200, 2), stat('ROOK', 'b', 4, 500, 1)]) },
      { n: 3, map: 'Sanhok' },
    ],
  });
  assert.equal(Lobbies.stats(lobby()), null, 'nothing before a saved match');
  const st = Lobbies.stats(l)!;
  assert.equal(st.games.length, 2);
  assert.deepEqual(st.games[0]!.results.map((r) => r.pts), [15, 8]);
  assert.equal(st.games[0]!.players[0]!.name, 'ACE');
  assert.ok(st.games[0]!.players[0]!.rating > 0);
  const ace = st.day.find((p) => p.name === 'ACE')!;
  assert.equal(ace.kills, 6);
  assert.equal(ace.games, 2);
  assert.equal(ace.wins, 1);
  const room = Lobbies.roomField(l);
  assert.ok(room.brStats && room.brPick && room.brLtf === false);
});
