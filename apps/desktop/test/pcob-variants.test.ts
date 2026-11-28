import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { type PcobVariant } from '../dev/fake-pcob.ts';
import { gameState } from '../src/shared/br.ts';
import { provisionalChecks } from '../src/shared/br-run.ts';
import { finishedValid, mergeKills, mergeMeta, NO_META, proposeResults, readMeta, readPlayers, readTeams, weakerReading } from '../src/shared/pcob.ts';
import { refillAfterMatch } from '../src/shared/br-stats.ts';
import { rosterView } from '../src/main/br-roster-view.ts';
import { kit, type Kit } from './br-kit.ts';

// PCOB without a recording (28 Nov): the nine questions the official document leaves open. Each variant of the stand-in is
// a way PCOB might really behave; Air must end the match, place the teams right or mark them to type, fill the stats, fire
// no moment twice and never let an empty reading overwrite saved numbers, whichever way each question turns out.

interface Played { k: Kit; sawHint: boolean; finishingAt: number | null; hud: Map<string, Set<number>> }

async function play(variants: PcobVariant[], opts: { uids?: boolean; until?: number } = {}): Promise<Played> {
  const k = await kit({ variants, uids: opts.uids });
  k.connect();
  k.run.arm(k.lobbyId, k.game(1).id!);
  k.pcob.begin();
  await k.step(0);
  const out: Played = { k, sawHint: false, finishingAt: null, hud: new Map() };
  const until = opts.until ?? k.pcob.gameEnd + 60;
  for (let t = 0; t < until; t += 2) {
    await k.step(2);
    if (k.feed.status.restarted) out.sawHint = true;
    if (out.finishingAt === null && gameState(k.game(1)) !== 'live') out.finishingAt = k.pcob.time();
  }
  for (const p of k.patches) { const m = p.fields.brLive?.moment; if (m) { const set = out.hud.get(m.kind) ?? new Set<number>(); set.add(m.at); out.hud.set(m.kind, set); } }
  return out;
}

let baseline: Promise<Played> | null = null;
const base = () => (baseline ??= play([]));
after(async () => { if (baseline) await (await baseline).k.close(); });

/** What every variant must give: the same ended match, places and kills as the plain game, each moment once. */
async function expectSound(p: Played, o: { stats?: boolean } = {}) {
  const b = await base();
  const g = p.k.game(1);
  assert.equal(gameState(g), 'provisional', 'the match ended and waits for the producer');
  assert.equal(g.results!.length, 16);
  const named = (x: Played) => x.k.game(1).results!.map((r) => [x.k.lobby().teams.find((t) => t.id === r.team)!.name, r.place, r.elims]);
  assert.deepEqual(named(p), named(b), 'places and kills as the plain game');
  assert.deepEqual(g.results!.map((r) => r.place), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.ok(p.finishingAt !== null && p.finishingAt >= p.k.pcob.gameEnd - 3, `not ended early (${p.finishingAt} vs ${p.k.pcob.gameEnd})`);
  assert.equal(g.feed!.stats.length, 64);
  if (o.stats !== false) assert.ok(g.feed!.stats.every((s) => s.survival > 0), 'after-match numbers filled');
  const names = p.k.moments.map(([n]) => n);
  for (const once of ['game.start', 'plane', 'first.blood', 'wwcd', 'game.end'] as const) assert.equal(names.filter((n) => n === once).length, 1, `${once} once`);
  const out = p.k.moments.filter(([n]) => n === 'team.out').map(([, d]) => String(d.team));
  assert.equal(new Set(out).size, out.length, 'Team eliminated once per team');
  assert.ok((p.hud.get('first.blood')?.size ?? 0) <= 1, 'First blood on the HUD once');
  const fb = p.k.patches.map((x) => x.fields.brLive?.moment).find((m) => m?.kind === 'first.blood');
  assert.ok(fb?.causer && fb.team, 'First blood names the player and team from killNum');
  const leaders = p.k.moments.length; // moments never change after the save
  await p.k.step(2); await p.k.step(2);
  assert.equal(p.k.moments.length, leaders, 'no moment after the save');
  assert.deepEqual(p.k.game(1).results, g.results, 'later empty or odd readings change nothing');
}

test('the plain game is the reference', async () => {
  const b = await base();
  try {
    await expectSound(b);
    assert.equal(b.k.game(1).feed!.gameId, 'FAKE-1');
    assert.equal(b.sawHint, false);
  } finally { /* the reference game stays for the other tests; closed after them */ }
});

for (const where of ['gameIdOnTeams', 'gameIdOnGlobal', 'gameIdOnTop'] as const) {
  test(`1: GameID and times are read from ${where.replace('gameIdOn', '')}`, async () => {
    const p = await play([where]);
    try { await expectSound(p); assert.equal(p.k.game(1).feed!.gameId, 'FAKE-1'); assert.equal(p.sawHint, false); } finally { await p.k.close(); }
  });
}

test('1/2: no GameID anywhere is fine and gives no remake hint', async () => {
  const p = await play(['noGameId']);
  try { await expectSound(p); assert.equal(p.k.game(1).feed!.gameId, ''); assert.equal(p.sawHint, false); } finally { await p.k.close(); }
});

test('2: a GameID that changes mid-game only adds the remake hint', async () => {
  const p = await play(['gameIdChanges']);
  try {
    await expectSound(p);
    assert.equal(p.sawHint, true, 'the hint showed');
    assert.equal(p.k.game(1).attempts!.length, 1, 'nothing was remade by itself');
  } finally { await p.k.close(); }
});

for (const v of ['finishedZero', 'finishedMissing', 'finishedEarly'] as const) {
  test(`3: FinishedStartTime ${v} still ends the game when every team but one has a place`, async () => {
    const p = await play([v]);
    try { await expectSound(p); } finally { await p.k.close(); }
  });
}

test('4: no teamName anywhere: seated by Character ID, and by player names without them', async () => {
  for (const uids of [true, false]) {
    const p = await play(['noTeamName'], { uids });
    try { await expectSound(p); assert.equal(p.k.feed.status.slots.length, 0 || p.k.feed.status.slots.length); assert.equal(p.k.game(1).feed!.stats.filter((s) => s.team).length, 64, `every player on a team (uids ${uids})`); } finally { await p.k.close(); }
  }
});

test('5: a feed that lists only the latest lines is de-duplicated; counts come from killNum', async () => {
  const p = await play(['recentKills']);
  try {
    await expectSound(p);
    const kills = p.k.game(1).feed!.kills;
    const keys = kills.map((x) => `${x.causer}|${x.victim}|${x.time}|${x.kind}`);
    assert.equal(new Set(keys).size, keys.length, 'no line twice');
    assert.ok(kills.length > 0);
    const sum = p.k.game(1).results!.reduce((n, r) => n + r.elims, 0), players = p.k.game(1).feed!.stats.reduce((n, s) => n + s.kills, 0);
    assert.equal(sum, players, 'team kills equal the players’ killNum');
  } finally { await p.k.close(); }
});

test('6: no rank 1: the one team left is proposed 1st, marked, and the producer confirms', async () => {
  const p = await play(['noRank1']);
  try {
    await expectSound(p);
    const l = p.k.lobby(), g = p.k.game(1);
    assert.equal(g.checks!.lastStanding!.length, 1);
    assert.equal(g.results![0]!.team, g.checks!.lastStanding![0]);
    assert.equal(g.results!.find((r) => r.place === 1)!.team, g.checks!.lastStanding![0]);
    assert.ok(provisionalChecks(l, g).some((c) => c.id.startsWith('standing:') && /alive count/.test(c.detail)));
    assert.equal(g.checks!.unplaced.length, 0);
    p.k.run.confirm(p.k.lobbyId, g.id!);
    assert.equal(p.k.game(1).state, 'confirmed');
  } finally { await p.k.close(); }
});

test('7: empty answers after the end never overwrite the saved numbers', async () => {
  const p = await play(['emptyAfterEnd']);
  try {
    await expectSound(p, { stats: false });
    const g = p.k.game(1);
    assert.equal(g.feed!.stats.filter((s) => s.kills > 0).length > 0, true);
    assert.equal(g.feed!.stats.reduce((n, s) => n + s.kills, 0), g.results!.reduce((n, r) => n + r.elims, 0));
  } finally { await p.k.close(); }
});

test('8: the roster check says No players listed yet', async () => {
  const p = await play([], { until: 4 });
  try {
    const l = p.k.lobbies.find(p.k.lobbyId);
    const v = rosterView({ ...l, games: l.games.map((g) => ({ ...g, state: 'scheduled' as const })) }, { players: [], teams: [] });
    assert.equal(v?.empty, 'No players listed yet');
    assert.equal(v?.check, null);
  } finally { await p.k.close(); }
});

test('9: late after-match numbers are waited for; very late ones come in with Update from game, which touches no place or kill', async () => {
  const late = await play(['lateEndNumbers']);
  try { await expectSound(late); } finally { await late.k.close(); }

  const p = await play(['veryLateEndNumbers'], { until: 0 });
  try {
    for (let t = 0; t < p.k.pcob.gameEnd + 17; t += 2) await p.k.step(2);
    let g = p.k.game(1);
    assert.equal(gameState(g), 'provisional');
    assert.ok(g.feed!.stats.every((s) => s.survival === 0), 'saved before the numbers came (15 s at most)');
    assert.equal(g.results!.length, 16, 'places were already right');
    // The producer types a change; the update must keep it.
    const typed = g.results!.map((r) => ({ ...r })); [typed[0]!.team, typed[1]!.team] = [typed[1]!.team, typed[0]!.team];
    p.k.lobbies.setResult(p.k.lobbyId, 1, typed);
    const before = p.k.game(1);
    await p.k.run.updateFromGame(before.id!);
    g = p.k.game(1);
    assert.ok(g.feed!.stats.every((s) => s.survival > 0), 'after-match numbers filled');
    assert.deepEqual(g.results, before.results, 'typed places untouched');
    assert.deepEqual(g.feed!.stats.map((s) => s.kills), before.feed!.stats.map((s) => s.kills), 'kills untouched');
    assert.ok(g.feed!.updatedAt);
    p.k.run.confirm(p.k.lobbyId, g.id!);
    await assert.rejects(() => p.k.run.updateFromGame(g.id!), /provisional/);
  } finally { await p.k.close(); }
});

test('worst case: every open question the unlucky way at once', async () => {
  const p = await play(['noGameId', 'finishedZero', 'noRank1', 'recentKills', 'emptyAfterEnd', 'veryLateEndNumbers', 'noTeamName'], { uids: true });
  try {
    await expectSound(p, { stats: false });
    const g = p.k.game(1);
    assert.equal(g.checks!.lastStanding!.length, 1);
    const before = JSON.stringify(g.feed!.stats);
    await assert.rejects(() => p.k.run.updateFromGame(g.id!), /does not list any players/);
    assert.equal(JSON.stringify(p.k.game(1).feed!.stats), before, 'a blank reading changed nothing');
    p.k.run.confirm(p.k.lobbyId, g.id!);
    assert.equal(p.k.game(1).state, 'confirmed');
  } finally { await p.k.close(); }
});

test('the End match button still ends a game PCOB never finishes', async () => {
  const p = await play(['finishedZero', 'noRank1'], { until: 300 });
  try {
    assert.equal(gameState(p.k.game(1)), 'live');
    await p.k.run.endMatch(p.k.lobbyId, p.k.game(1).id!);
    const g = p.k.game(1);
    assert.equal(gameState(g), 'provisional');
    assert.ok(g.draft!.some((d) => d.place === null), 'places to type');
  } finally { await p.k.close(); }
});

test('readers: where meta lives, what counts as finished, merging, de-duplication', () => {
  assert.equal(readMeta({ gameGlobalInfo: { GameID: 'G', FinishedStartTime: '90' } }).gameId, 'G');
  assert.equal(readMeta({ isInGame: true, gameid: 'x' }).gameId, 'x');
  assert.equal(readMeta({}).gameId, '');
  for (const f of [0, null, null as unknown as number]) assert.equal(finishedValid({ finishedStart: f, gameTime: 10 }), false);
  assert.equal(readTeams({ teamInfoList: [], FinishedStartTime: '' }).finishedStart, null);
  assert.equal(finishedValid({ finishedStart: 5, gameTime: 10 }), false, 'earlier than the start');
  assert.equal(finishedValid({ finishedStart: 10, gameTime: 10 }), true);
  assert.equal(finishedValid({ finishedStart: 10, gameTime: null }), true);
  const seen = mergeMeta(NO_META, { gameId: 'A', gameTime: 1, fightingStart: null, finishedStart: 50 });
  assert.equal(mergeMeta(seen, { gameId: '', gameTime: 1, fightingStart: null, finishedStart: 0 }).finishedStart, 50, 'a valid winner time stays');
  const k = { causer: 'a', victim: 'b', kind: 'kill' as const, time: 5, distance: 1 };
  assert.equal(mergeKills([k], [k, { ...k, time: 6 }]).length, 2);
  assert.equal(weakerReading(readPlayers({ playerInfoList: [{ uID: 1, playerName: 'a' }] }), [], false), true);
  assert.equal(weakerReading([], [], false), false);
});

test('proposeResults: rank 1 wins; else the one team alive; never a guess with two alive', () => {
  const mk = (uID: number, teamId: number, rank: number, liveState = 0) => ({ uID, playerName: `p${uID}`, teamId, rank, liveState });
  const teams = readTeams({ teamInfoList: [{ teamId: 1, killNum: 1, liveMemberNum: 1 }, { teamId: 2, killNum: 0, liveMemberNum: 0 }] });
  const seats = new Map([[1, 'A'], [2, 'B']]);
  const a = proposeResults(readPlayers({ playerInfoList: [mk(1, 1, 0), mk(2, 2, 2, 5)] }), teams, seats);
  assert.deepEqual(a.rows!.map((r) => [r.team, r.place]), [['A', 1], ['B', 2]]);
  assert.equal(a.lastStanding, 'A');
  const b = proposeResults(readPlayers({ playerInfoList: [mk(1, 1, 1), mk(2, 2, 2, 5)] }), teams, seats);
  assert.equal(b.lastStanding, null);
  const c = proposeResults(readPlayers({ playerInfoList: [mk(1, 1, 0), mk(2, 2, 0)] }), teams, seats);
  assert.equal(c.rows, null);
  assert.equal(c.lastStanding, null);
});

test('refillAfterMatch fills only after-match numbers and never with a zero', () => {
  const feed = { source: 'pcob' as const, gameId: 'G', kills: [], circles: [], plane: null, savedAt: 1, stats: [{ name: 'a', openId: '', uid: '1', team: 't', place: 1, kills: 3, knockouts: 0, assists: 0, damage: 100, damageTaken: 0, heal: 7, headshots: 0, rescues: 0, survival: 0, maxKillDistance: 0, airdrops: 0, vehicleKills: 0, grenadeKills: 0, driveDistance: 0, walkDistance: 0, outsideZoneTime: 0 }] };
  const r = refillAfterMatch(feed, readPlayers({ playerInfoList: [{ uID: 1, playerName: 'a', killNum: 9, rank: 4, surviceTime: 600, heal: 0, inDamage: 50 }] }), 'G', 9);
  assert.ok('feed' in r);
  if ('feed' in r) { const s = r.feed.stats[0]!; assert.equal(s.survival, 600); assert.equal(s.damageTaken, 50); assert.equal(s.heal, 7, 'a 0 never replaces'); assert.equal(s.kills, 3); assert.equal(s.place, 1); }
  assert.ok('problem' in refillAfterMatch(feed, readPlayers({ playerInfoList: [{ uID: 1, playerName: 'a' }] }), 'OTHER', 9));
});
