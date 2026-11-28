import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit, roster, type Kit } from './br-kit.ts';
import { fakeUid } from '../dev/fake-pcob.ts';
import { gameChecks } from '../src/shared/br-run.ts';
import { matchPlayer, readPlayers, seatTeams, type PcobPlayer, type PcobTeam } from '../src/shared/pcob.ts';
import { rosterCheck } from '../src/shared/br-roster.ts';
import { rosterView } from '../src/main/br-roster-view.ts';
import { validPlayer } from '../src/main/team-library.ts';
import { playerRoles } from '../src/shared/games.ts';
import { replay, verify } from '../src/main/event-journal.ts';
import type { LobbyTeam } from '../src/shared/br.ts';

// The Character ID (PCOB `uID`) places players and seats teams before the name does (28 Nov). Made-up teams.
const pl = (name: string, uid: string, teamId: number, extra: Record<string, unknown> = {}): PcobPlayer => readPlayers({ playerInfoList: [{ playerName: name, uID: uid, teamId, teamName: `Team${teamId}`, ...extra }] })[0]!;
const lt = (id: string, name: string, players: string[], uids: string[] = []): LobbyTeam => ({ id, teamId: id, name, tag: name.slice(0, 3).toUpperCase(), color: '#fff', logo: '', players, uids, playerIds: players.map((p) => `${id}-${p}`) });
const slot = (teamId: number): PcobTeam => ({ teamId, name: `Team${teamId}`, kills: 0, alive: 4, logo: '' });

test('a player is found by UID first, then OpenID, then name', () => {
  const r = [{ name: 'Alpha', uid: '111111' }, { name: 'Bravo', uid: '222222', openId: 'o2' }, { name: 'Charlie' }];
  assert.deepEqual(matchPlayer({ uid: '222222', openId: '', name: 'Alpha' }, r), { index: 1, by: 'uid' }, 'the UID beats a name that matches someone else');
  assert.deepEqual(matchPlayer({ uid: '999999', openId: 'o2', name: 'Alpha' }, r), { index: 1, by: 'openId' });
  assert.deepEqual(matchPlayer({ uid: '', openId: '', name: 'CHARLIE!' }, r), { index: 2, by: 'name' });
  assert.equal(matchPlayer({ uid: '5', openId: '', name: 'Nobody' }, r), null);
});

test('seating: the UIDs a roster lists beat a name that matches another team', () => {
  // The game calls PCOB team 1 "Team1" with players named like team B's roster, but their UIDs are team A's.
  const players = [pl('Mira', '1001', 1), pl('Dax', '1002', 1), pl('Zed', '2001', 2), pl('Ria', '2002', 2)];
  const a = lt('a', 'Alpha Team', ['Juno', 'Kit'], ['1001', '1002']);
  const b = lt('b', 'Beta Team', ['Mira', 'Dax'], ['2001', '2002']);
  const refs = [a, b].map((t) => ({ id: t.id, name: t.name, tag: t.tag, players: t.players, uids: t.uids }));
  const seats = seatTeams([slot(1), slot(2)], players, refs);
  assert.equal(seats.get(1), 'a', 'by UID, although the names say Beta');
  assert.equal(seats.get(2), 'b');
  // Without UIDs on the roster nothing changes: two names still seat a team.
  const noUid = [a, b].map((t) => ({ id: t.id, name: t.name, tag: t.tag, players: t.players }));
  assert.equal(seatTeams([slot(1), slot(2)], players, noUid).get(1), 'b');
  // The producer's own pairing still wins over everything.
  assert.equal(seatTeams([slot(1), slot(2)], players, refs, { '1': 'b' }).get(1), 'b');
});

test('the checks at the end of a match know a player by UID', () => {
  const players = [pl('Renamed', '1001', 1, { killNum: 1, rank: 2 }), pl('Dax', '1002', 1, { rank: 2 })];
  const team = lt('a', 'Alpha Team', ['Juno', 'Dax'], ['1001', '1002']);
  const checks = gameChecks(players, { teams: [{ teamId: 1, name: 'Team1', kills: 1, alive: 0, logo: '' }], gameTime: null, fightingStart: null, finishedStart: null, gameId: '', currentTime: null }, new Map([[1, 'a']]), [team]);
  assert.deepEqual(checks.unknown, [], 'Renamed is Juno: same UID');
});

test('the roster check: placed by UID, a suggestion for each other, and where the name says nothing', () => {
  const a = lt('a', 'Alpha Team', ['Juno', 'Karn', 'Mira', 'Riku'], ['5031945047', '', '5034599482', '5039908352']);
  const players = [
    pl('Juno', '5031945047', 1), pl('Karn_AT', '5018704501', 1), pl('Mira', '5034599482', 1), pl('Riku', '5039908325', 1),
    pl('Stray', '7000000001', 9),
  ];
  const c = rosterCheck(players, [slot(1), slot(9)], [a]);
  assert.equal(c.total, 5);
  assert.equal(c.placed, 2, 'Juno and Mira');
  assert.deepEqual([c.teamsPaired, c.teamsTotal], [1, 2]);
  const by = (n: string) => c.rows.find((r) => r.name === n)!;
  assert.equal(by('Karn_AT').suggestion?.name, 'Karn', 'similar name, and Karn has no UID yet');
  assert.match(by('Karn_AT').suggestion!.detail, /No UID saved for Karn/);
  assert.equal(by('Riku').suggestion?.name, 'Riku', 'same name');
  assert.match(by('Riku').suggestion!.detail, /differs by 2 digits: yours 5039908352/);
  assert.equal(by('Riku').suggestion?.savedUid, '5039908352');
  assert.equal(by('Stray').suggestion, null);
  assert.match(by('Stray').note, /not paired/);
  // A UID that is another team's player's is said, not moved.
  const b = lt('b', 'Beta Team', ['Zed'], ['7000000001']);
  const c2 = rosterCheck(players, [slot(1), slot(9)], [a, b], { '9': 'a' });
  assert.match(c2.rows.find((r) => r.name === 'Stray')!.note, /Zed’s on Beta Team/);
});

test('the roster check with the stand-in observer: placed by UID although the names differ, and fixed by Use this UID', async () => {
  const s = await kit({ teams: 4, length: 300, games: 2 });
  try {
    const lib = s.store.data.players!;
    // The roster has every player's UID as the game sends it, except one who has none and one whose name is spelled differently.
    lib.forEach((p, i) => { p.uid = String(fakeUid(i)); });
    const karn = lib[1]!; delete karn.uid;
    lib[2]!.gameId = 'Somebody Else'; // same UID, another name: still placed
    s.lobbies.refresh();
    s.pcob.begin();
    s.connect();
    await s.step(2);
    const view = () => rosterView(s.lobbies.selected, s.feed.gameNow())!;
    assert.equal(view().blocked, null);
    const c = view().check!;
    assert.equal(c.total, 16);
    assert.equal(c.placed, 15, 'the player with the other name is placed by UID; only the one with no UID is not');
    assert.equal(c.rows.length, 1);
    assert.equal(c.rows[0]!.name, roster(0)[1], 'the game’s name for that player');
    const sg = c.rows[0]!.suggestion!;
    assert.equal(sg.playerId, karn.id);
    assert.match(sg.detail, /No UID saved/);
    // Use this UID: writes the UID to the library player and journals it.
    s.lobbies.setPlayerUid(s.lobbyId, sg.playerId, c.rows[0]!.uid);
    assert.equal(s.store.data.players!.find((p) => p.id === karn.id)!.uid, c.rows[0]!.uid);
    assert.equal(view().check!.placed, 16);
    assert.deepEqual(view().check!.rows, []);
    const lines = s.journal.read('ev').filter((l) => l.kind === 'roster.change' && l.data.uid);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.data.lobbyId, s.lobbyId);
    assert.deepEqual(verify(s.journal.read('ev'), s.lobbies.list()).problems, [], 'the journal still agrees with the lobby');
    // A UID that belongs to someone else is refused.
    assert.throws(() => s.lobbies.setPlayerUid(s.lobbyId, karn.id, String(fakeUid(0))), /already/);
    assert.throws(() => s.lobbies.setPlayerUid(s.lobbyId, karn.id, '12ab'), /only digits/);
  } finally { await s.close(); }
});

test('the roster check is off, and changing the roster refused, while a match is live', async () => {
  const s = await kit({ teams: 4, length: 300, games: 2 });
  try {
    s.store.data.players!.forEach((p, i) => { p.uid = String(fakeUid(i)); });
    s.lobbies.refresh();
    const first = s.lobby().games[0]!;
    s.run.arm(s.lobbyId, first.id!);
    s.pcob.begin();
    s.connect();
    await s.step(2);
    assert.equal(s.game(1).state, 'live');
    const v = rosterView(s.lobbies.selected, s.feed.gameNow())!;
    assert.match(v.blocked ?? '', /Match 1 is live/);
    assert.equal(v.check, null);
    assert.throws(() => s.lobbies.setPlayerUid(s.lobbyId, s.store.data.players![0]!.id, '5000000001'), /Match 1 is live/);
  } finally { await s.close(); }
});

test('players: a UID is digits and one player’s own; roles follow the game', () => {
  const lib = { teams: [], players: [{ id: 'p1', name: 'Juno', realName: '', gameId: 'Juno', photo: '', role: '', teamId: null, uid: '5031945047' }] };
  assert.equal(validPlayer({ name: 'Mira', gameId: 'Mira', uid: ' 5034599482 ' }, lib, 'pubgm').uid, '5034599482');
  assert.equal(validPlayer({ name: 'Mira', gameId: 'Mira' }, lib, 'pubgm').uid, undefined);
  assert.throws(() => validPlayer({ name: 'Mira', uid: '5031945047' }, lib, 'pubgm'), /already Juno’s UID/);
  assert.throws(() => validPlayer({ name: 'Mira', uid: 'abc123' }, lib, 'pubgm'), /only digits/);
  assert.equal(validPlayer({ id: 'p1', name: 'Juno', gameId: 'Juno', uid: '5031945047' }, lib, 'pubgm').uid, '5031945047', 'a player keeps their own UID when saved again');
  assert.equal(validPlayer({ name: 'A', role: 'IGL' }, lib, 'pubgm').role, 'IGL');
  assert.equal(validPlayer({ name: 'A', role: 'Coach' }, lib, 'freefire').role, 'Coach');
  assert.equal(validPlayer({ name: 'A', role: 'Duelist' }, lib, 'pubgm').role, '', 'a Valorant role is not a PUBG MOBILE role');
  assert.equal(validPlayer({ name: 'A', gameId: 'Rook#EU1', role: 'Duelist' }, lib, 'valorant').role, 'Duelist', 'Valorant is unchanged');
  assert.deepEqual([...playerRoles('pubgm')], ['', 'IGL', 'Player', 'Sub', 'Coach']);
});

test('a coach is kept in the team but is not on the squad the game is matched against', async () => {
  const s = await kit({ teams: 2, length: 300, games: 1 });
  try {
    const lib = s.store.data.players!;
    lib.push({ id: 'coach', name: 'Coach Made-up', realName: '', gameId: 'Coach Made-up', photo: '', role: 'Coach', teamId: 't0', uid: '5099999999' });
    s.lobbies.refresh();
    const team = s.lobby().teams[0]!;
    assert.equal(team.players.length, 4);
    assert.ok(!team.players.includes('Coach Made-up'));
    assert.equal(team.playerIds!.length, 4);
  } finally { await s.close(); }
});
