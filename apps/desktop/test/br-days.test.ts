import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit } from './br-kit.ts';
import { standings } from '../src/shared/br.ts';
import { daySummary, normalizeLobby, standingsView } from '../src/shared/br-run.ts';
import type { Lobby } from '../src/shared/api.ts';

// Days on a lobby (27 Nov): migration of older lobbies, adding and editing days, Start day (the checklist and
// arming the first match), Close day (refused while a match is open) and the summary.
const small = { teams: 4, length: 300, games: 4 };
const results = (ids: string[], flip = false) => ids.map((team, i) => ({ team, place: flip ? ids.length - i : i + 1, elims: i + 1 }));

test('an older lobby becomes one day with every match; matches with results are confirmed, the rest scheduled', async () => {
  const s = await kit(small);
  try {
    const ids = s.lobby().teams.map((t) => t.id);
    // The lobby as it was saved before days and states existed.
    const old: Lobby = JSON.parse(JSON.stringify(s.lobby()));
    delete old.days; delete old.adjustments;
    old.createdAt = Date.UTC(2026, 10, 20, 12);
    old.games = old.games.map(({ n, map }, i) => (i < 2 ? { n, map, results: results(ids, i === 1), finishedAt: 5 } : { n, map }));
    s.store.data.lobbies = [old];
    const l = s.lobbies.find(old.id);
    assert.equal(l.days!.length, 1);
    assert.equal(l.days![0]!.date, '2026-11-20');
    assert.equal(l.days![0]!.matchIds.length, 4);
    assert.deepEqual(l.games.map((g) => g.state), ['confirmed', 'confirmed', 'scheduled', 'scheduled']);
    assert.ok(l.games.every((g) => g.id && g.dayId === l.days![0]!.id && Array.isArray(g.attempts)));
    // Ids are stable: reading again does not change them.
    assert.deepEqual(s.lobbies.find(old.id).games.map((g) => g.id), l.games.map((g) => g.id));
    // Standings are what they were.
    const before = standings({ teams: old.teams, scoring: old.scoring, games: old.games.map((g) => ({ ...g })) });
    assert.deepEqual(standings(l).map((r) => [r.team, r.total]), before.map((r) => [r.team, r.total]));
    assert.equal(normalizeLobby(l), l, 'normalising an up-to-date lobby changes nothing');
  } finally { await s.close(); }
});

test('days can be added and edited, and matches move between them', async () => {
  const s = await kit(small);
  try {
    const day1 = s.lobby().days![0]!;
    const id2 = s.run.dayAdd(s.lobbyId, { date: '2026-12-07', title: 'Day 2', opensAt: '15:30' });
    const ids = s.lobby().games.map((g) => g.id!);
    s.run.dayEdit(s.lobbyId, id2, { matchIds: [ids[2]!, ids[3]!] });
    const l = s.lobby();
    assert.deepEqual(l.days!.find((d) => d.id === day1.id)!.matchIds, [ids[0], ids[1]]);
    assert.deepEqual(l.days!.find((d) => d.id === id2)!.matchIds, [ids[2], ids[3]]);
    assert.equal(l.games[3]!.dayId, id2);
    assert.throws(() => s.run.dayEdit(s.lobbyId, id2, { date: 'tomorrow' }), /looks like/);
    assert.throws(() => s.run.dayEdit(s.lobbyId, id2, { opensAt: 'late' }), /like 15:30/);
    s.run.dayEdit(s.lobbyId, id2, { title: 'Finals day', opensAt: '16:00' });
    assert.equal(s.lobby().days![1]!.title, 'Finals day');
    assert.ok(s.journal.read('ev').some((x) => x.kind === 'day.add') && s.journal.read('ev').some((x) => x.kind === 'day.edit'));
    // A day's matches arm and auto-arm within the day.
    s.run.arm(s.lobbyId, ids[0]!);
    s.run.voidMatch(s.lobbyId, ids[0]!, 'Test');
    assert.equal(s.game(2).state, 'armed', 'the next match of the same day');
    s.run.voidMatch(s.lobbyId, ids[1]!, 'Test');
    assert.equal(s.game(3).state, 'scheduled', 'a match of the next day is not auto-armed');
  } finally { await s.close(); }
});

test('Start day: roster changes since the last day, standings carried in, the first match armed; refused while an earlier day is open', async () => {
  const s = await kit(small);
  try {
    const ids = s.lobby().games.map((g) => g.id!);
    const teamIds = s.lobby().teams.map((t) => t.id);
    const day1 = s.lobby().days![0]!.id;
    const day2 = s.run.dayAdd(s.lobbyId, { date: '2026-12-07' });
    s.run.dayEdit(s.lobbyId, day2, { matchIds: [ids[2]!, ids[3]!] });
    // Day 2 cannot start while day 1 has an unconfirmed match.
    assert.throws(() => s.run.dayStart(s.lobbyId, day2, true), /Day 1 still has matches/);
    s.run.dayStart(s.lobbyId, day1, true);
    assert.equal(s.game(1).state, 'armed');
    for (const n of [1, 2]) {
      s.lobbies.setResult(s.lobbyId, n, results(teamIds, n === 2));
      s.run.confirm(s.lobbyId, s.game(n).id!);
    }
    s.advance(60);
    s.run.dayClose(s.lobbyId, day1);
    s.advance(3600);
    // A sub swap after day 1 closed.
    s.store.data.players!.find((p) => p.teamId === 't0' && p.gameId.endsWith('KAI'))!.gameId = 'NEW_KID';
    s.lobbies.refresh();
    const start = s.run.dayStart(s.lobbyId, day2);
    assert.equal(start.started, false, 'the checklist alone does not start the day');
    assert.equal(start.roster.length, 1);
    assert.deepEqual(start.roster[0]!.added, ['NEW_KID']);
    assert.deepEqual(start.roster[0]!.removed, ['T00_KAI']);
    assert.equal(start.standingsIn.length, 4);
    assert.ok(start.standingsIn[0]!.total > 0, 'points are carried in');
    assert.deepEqual(start.matches.map((m) => m.n), [3, 4]);
    assert.equal(start.data.pcob, 'off');
    const went = s.run.dayStart(s.lobbyId, day2, true);
    assert.equal(went.started, true);
    assert.ok(s.lobby().days![1]!.startedAt);
    assert.equal(s.game(3).state, 'armed', 'the first match of the day is armed');
  } finally { await s.close(); }
});

test('Close day is refused while a match is open; the summary has the standings, the day’s points, adjustments and edits', async () => {
  const s = await kit(small);
  try {
    const teamIds = s.lobby().teams.map((t) => t.id);
    const day = s.lobby().days![0]!.id;
    s.run.dayStart(s.lobbyId, day, true);
    s.lobbies.setResult(s.lobbyId, 1, results(teamIds));
    s.run.confirm(s.lobbyId, s.game(1).id!);
    assert.throws(() => s.run.dayClose(s.lobbyId, day), /Match 2 is armed\. Confirm it or void it first/);
    assert.deepEqual(s.run.dayCloseCheck(s.lobbyId, day).problems.length, 3, 'matches 2, 3 and 4');
    s.run.voidMatch(s.lobbyId, s.game(2).id!, 'Cancelled');
    s.lobbies.setResult(s.lobbyId, 3, results(teamIds, true));
    s.run.confirm(s.lobbyId, s.game(3).id!);
    s.run.voidMatch(s.lobbyId, s.game(4).id!, 'Out of time');
    s.run.adjust(s.lobbyId, teamIds[3]!, -2, 'Rule breach');
    s.run.editConfirmed(s.lobbyId, s.game(1).id!, results(teamIds, true), 'Wrong place typed');
    const sum = s.run.dayClose(s.lobbyId, day);
    assert.ok(s.lobby().days![0]!.closedAt);
    assert.equal(sum.matches.length, 4);
    assert.deepEqual(sum.matches.map((m) => m.state), ['confirmed', 'void', 'confirmed', 'void']);
    assert.equal(sum.adjustments.length, 1);
    assert.equal(sum.edits[0]!.reason, 'Wrong place typed');
    const top = sum.table[0]!;
    assert.equal(sum.table.reduce((n, r) => n + r.today, 0) > 0, true);
    assert.equal(sum.table.find((r) => r.team === teamIds[3])!.adjusted, -2);
    assert.deepEqual(daySummary(s.lobby(), day).table.map((r) => r.team), standings(s.lobby()).map((r) => r.team));
    // A closed day does not take new arming until reopened.
    assert.throws(() => s.run.arm(s.lobbyId, s.game(2).id!), /closed/);
    s.run.dayEdit(s.lobbyId, day, { reopen: true });
    s.run.arm(s.lobbyId, s.game(2).id!);
    assert.equal(s.game(2).state, 'armed', 'a void match can be armed again');
  } finally { await s.close(); }
});

test('provisional standings are marked and compared with the official ones', async () => {
  const s = await kit(small);
  try {
    const teamIds = s.lobby().teams.map((t) => t.id);
    s.lobbies.setResult(s.lobbyId, 1, results(teamIds));
    s.run.confirm(s.lobbyId, s.game(1).id!);
    s.lobbies.setResult(s.lobbyId, 2, results(teamIds, true));
    const v = standingsView(s.lobby());
    assert.deepEqual(v.provisionalGames, [2]);
    assert.notDeepEqual(v.provisional!.map((r) => r.total), v.official.map((r) => r.total));
    assert.ok(Object.values(v.move).some((m) => m !== 0));
    assert.equal(standingsView(s.lobby()).official.reduce((n, r) => n + r.played, 0), 4, 'only match 1 is official');
  } finally { await s.close(); }
});
