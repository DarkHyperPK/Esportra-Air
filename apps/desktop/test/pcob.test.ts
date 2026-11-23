import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalResults, readCircle, readGlobal, readInGame, readKills, readObserving, readPlayers, readTeams, seatTeams, toBrLive } from '../src/shared/pcob.ts';
import { MVP_WEIGHTS, mvpRating, playerTotals, statOf, teamTotals } from '../src/shared/br-stats.ts';

// PCOB responses shaped as the official "PC OB API" document (v3.0.0) shows them, quirks included: numbers as
// strings in the kill feed and circle info, `surviceTime` in the JSON sample, end-of-game stats at 0 mid-game.
const player = (o: Record<string, unknown>) => ({
  uID: 510002331, playerOpenId: '100086', playerName: 'PlayerNo101', picUrl: '', showPicUrl: false, teamId: 1, teamName: 'Team1', character: 'None',
  isFiring: false, posX: -1648, posY: 1054, posZ: 110, health: 100, healthMax: 100, liveState: 0, killNum: 0, playerKey: 1253582361, gotAirDropNum: 0,
  maxKillDistance: 0, damage: 0, inDamage: 0, heal: 0, headShotNum: 0, killNumInVehicle: 0, surviceTime: 0, driveDistance: 0, marchDistance: 100,
  assists: 0, killNumByGrenade: 0, rank: 0, isOutSideBlueCircle: 0, outsideBlueCircleTime: 0, useFragGrenadeNum: 0, useSmokeGrenadeNum: 0,
  curWeaponID: 0, knockouts: 0, rescueTimes: 0, ...o,
});

test('players: the documented fields, both spellings, cm to m, live states', () => {
  const ps = readPlayers({ playerInfoList: [
    player({ playerName: ' ACE ', killNum: 3, damage: 412.6, maxKillDistance: 21450, liveState: 4, surviceTime: 900, isOutSideBlueCircle: 1 }),
    player({ playerName: 'ROOK', uID: 2, survivalTime: '1200', liveState: '5', rank: '7', inDamage: 88 }),
  ] });
  assert.equal(ps.length, 2);
  assert.equal(ps[0]!.name, 'ACE');
  assert.equal(ps[0]!.state, 'knocked');
  assert.equal(ps[0]!.maxKillDistance, 215, 'cm become metres');
  assert.equal(ps[0]!.survival, 900, 'the sample spelling surviceTime');
  assert.equal(ps[0]!.outsideZone, true);
  assert.equal(ps[1]!.survival, 1200, 'the field-list spelling survivalTime, as a string');
  assert.equal(ps[1]!.state, 'dead');
  assert.equal(ps[1]!.rank, 7);
  assert.equal(ps[1]!.damageTaken, 88);
  assert.deepEqual(readPlayers({ TotalPlayerList: [player({})] }).length, 1, 'the other documented list name');
  assert.deepEqual(readPlayers('not json'), []);
  assert.deepEqual(readPlayers({ playerInfoList: [{}] }), [], 'empty rows are dropped');
});

test('teams, in game, kill feed, circle, global info, observed player', () => {
  const t = readTeams({ teamInfoList: [{ teamId: 1, teamName: 'Team1', isShowLogo: false, logoPicUrl: '', killNum: 1, liveMemberNum: 3 }], GameStartTime: '512', FightingStartTime: '60', FinishedStartTime: '', GameID: 'G1', CurrentTime: 1732400000 });
  assert.deepEqual(t.teams, [{ teamId: 1, name: 'Team1', kills: 1, alive: 3, logo: '' }]);
  assert.equal(t.fightingStart, 60);
  assert.equal(t.finishedStart, null, 'empty means not yet');
  assert.equal(t.gameId, 'G1');
  assert.equal(readInGame({ isInGame: true }), true);
  assert.equal(readInGame({}), false);
  assert.deepEqual(readKills({ killInfo: [{ CauserName: 'PlayerNo101', VictimName: 'PlayerNo102', ResultHealthStatus: '1', CurGameTime: '236', Distance: 18 }, { CauserName: 'A', VictimName: 'B', ResultHealthStatus: '2', CurGameTime: 240, DIstance: 5 }] }),
    [{ causer: 'PlayerNo101', victim: 'PlayerNo102', kind: 'knock', time: 236, distance: 18 }, { causer: 'A', victim: 'B', kind: 'kill', time: 240, distance: 5 }]);
  assert.deepEqual(readCircle({ GameTime: '161', CircleStatus: '2', CircleIndex: '1', Counter: '44', MaxTime: '300' }), { time: 161, status: 'move', index: 1, counter: 44, max: 300 });
  assert.equal(readCircle({}), null);
  const g = readGlobal({ gameGlobalInfo: { CircleArray: [{ X: '514059.687500', Y: '279024.843750', Size: '254520.000000' }], PlaneStartLocX: '679895.125000', PlaneStartLocY: '896956.812500', PlaneStopLocX: '181640.078125', PlaneStopLocY: '-117633.250000' } })!;
  assert.equal(g.circles[0]!.size, 254520);
  assert.deepEqual(g.plane, { from: { x: 679895.125, y: 896956.8125 }, to: { x: 181640.078125, y: -117633.25 } });
  assert.equal(readObserving({ observingPlayer: { "WinOB's ID": '510002331' } }), '510002331');
});

const lobby = [
  { id: 'L1', name: 'Night Owls', tag: 'NOW', players: ['NOW_ACE', 'NOW_ROOK', 'NOW_VEX', 'NOW_KAI'] },
  { id: 'L2', name: 'Iron Pine', tag: 'IRP', players: ['IRP_ACE', 'IRP_ROOK', 'IRP_VEX', 'IRP_KAI'] },
  { id: 'L3', name: 'Crimson Five', tag: 'CF5', players: ['CF5_ACE', 'CF5_ROOK', 'CF5_VEX', 'CF5_KAI'] },
];

test('seating: the producer’s pairs, then team name or tag, then most players by in-game name', () => {
  const players = readPlayers({ playerInfoList: [
    player({ teamId: 1, teamName: 'NIGHT OWLS', playerName: 'x1' }),
    player({ teamId: 2, teamName: 'Team2', playerName: 'IRP_ACE' }), player({ teamId: 2, teamName: 'Team2', playerName: 'IRP_ROOK' }),
    player({ teamId: 3, teamName: 'Team3', playerName: 'CF5_ACE' }),
    player({ teamId: 4, teamName: 'cf5', playerName: 'z' }),
  ] });
  const seats = seatTeams([], players, lobby);
  assert.equal(seats.get(1), 'L1', 'by name');
  assert.equal(seats.get(2), 'L2', 'by two or more players');
  assert.equal(seats.get(4), 'L3', 'by tag');
  assert.equal(seats.has(3), false, 'one player is not enough, and L3 is taken');
  const manual = seatTeams([], players, lobby, { 3: 'L3' });
  assert.equal(manual.get(3), 'L3', 'the producer’s pair wins');
  assert.equal(manual.has(4), false, 'each lobby team once');
});

test('brLive: marks, places, alive counts, the live MVP order, the feed with teams', () => {
  const players = readPlayers({ playerInfoList: [
    player({ teamId: 1, playerName: 'NOW_ACE', killNum: 4, damage: 600, liveState: 0 }), player({ teamId: 1, playerName: 'NOW_ROOK', killNum: 1, damage: 200, liveState: 4 }),
    player({ teamId: 2, playerName: 'IRP_ACE', killNum: 2, damage: 300, liveState: 5, rank: 16 }), player({ teamId: 2, playerName: 'IRP_ROOK', liveState: 5, rank: 16 }),
  ] });
  const teams = readTeams({ teamInfoList: [{ teamId: 1, killNum: 5, liveMemberNum: 2 }, { teamId: 2, killNum: 2, liveMemberNum: 0 }], FightingStartTime: 30 });
  const seats = new Map([[1, 'L1'], [2, 'L2']]);
  const live = toBrLive({ game: 3, players, teams, kills: readKills({ killInfo: [{ CauserName: 'NOW_ACE', VictimName: 'IRP_ROOK', ResultHealthStatus: 2, CurGameTime: 300, Distance: 40 }] }), circle: null, global: null, seats, lastOut: { team: 'L2', place: 16, at: 1 }, rate: (p) => mvpRating(p) });
  assert.deepEqual(live.teams.L1, { players: 'ak', elims: 5, place: null, damage: 800 });
  assert.deepEqual(live.teams.L2, { players: 'dd', elims: 2, place: 16, damage: 300 });
  assert.equal(live.teamsAlive, 1);
  assert.equal(live.playersAlive, 2);
  assert.equal(live.mvp[0]!.name, 'NOW_ACE');
  assert.equal(live.kills[0]!.causerTeam, 'L1');
  assert.equal(live.kills[0]!.victimTeam, 'L2');
  assert.equal(live.phase, 'fighting');
});

test('final results: once every seated team has a place; ties and gaps renumbered in order', () => {
  const seats = new Map([[1, 'L1'], [2, 'L2'], [3, 'L3']]);
  const teams = readTeams({ teamInfoList: [{ teamId: 1, killNum: 9 }, { teamId: 2, killNum: 3 }, { teamId: 3, killNum: 1 }] });
  const mid = readPlayers({ playerInfoList: [player({ teamId: 1, rank: 0 }), player({ teamId: 2, rank: 2 }), player({ teamId: 3, rank: 3 })] });
  assert.equal(finalResults(mid, teams, seats), null, 'the winner has no place yet');
  const end = readPlayers({ playerInfoList: [player({ teamId: 1, rank: 1 }), player({ teamId: 2, rank: 2 }), player({ teamId: 3, rank: 3 })] });
  assert.deepEqual(finalResults(end, teams, seats), [{ team: 'L1', place: 1, elims: 9 }, { team: 'L2', place: 2, elims: 3 }, { team: 'L3', place: 3, elims: 1 }]);
  const gaps = readPlayers({ playerInfoList: [player({ teamId: 1, rank: 1 }), player({ teamId: 2, rank: 5 }), player({ teamId: 3, rank: 9 })] });
  assert.deepEqual(finalResults(gaps, teams, seats)!.map((r) => r.place), [1, 2, 3], 'a team not seated left a gap');
});

test('stats: kept per game, totals by OpenID, MVP rating and team totals', () => {
  const g1 = readPlayers({ playerInfoList: [player({ playerOpenId: 'a', playerName: 'ACE', killNum: 5, damage: 700, knockouts: 4, assists: 1, surviceTime: 1500, rank: 1, maxKillDistance: 30000 }), player({ playerOpenId: 'b', playerName: 'ROOK', killNum: 1, damage: 150, surviceTime: 900, rank: 1 })] });
  const g2 = readPlayers({ playerInfoList: [player({ playerOpenId: 'a', playerName: 'ACE_renamed', killNum: 2, damage: 300, surviceTime: 600, rank: 6, maxKillDistance: 12000 })] });
  const games = [{ stats: g1.map((p) => statOf(p, 'L1')) }, { stats: g2.map((p) => statOf(p, 'L1')) }];
  const totals = playerTotals(games);
  assert.equal(totals[0]!.name, 'ACE_renamed', 'matched by OpenID across a rename');
  assert.equal(totals[0]!.kills, 7);
  assert.equal(totals[0]!.games, 2);
  assert.equal(totals[0]!.wins, 1);
  assert.equal(totals[0]!.avgPlace, 3.5);
  assert.equal(totals[0]!.maxKillDistance, 300);
  assert.equal(mvpRating({ kills: 5, damage: 700, knockouts: 4, assists: 1, survival: 1500 }), Math.round((5 * MVP_WEIGHTS.kill + 7 + 2 + 1 + 2.5) * 10) / 10);
  assert.deepEqual(teamTotals(games).map((t) => [t.team, t.games, t.kills, t.damage]), [['L1', 2, 8, 1150]]);
});
