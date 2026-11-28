import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/main/store.ts';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { EsportraAccount } from '../src/main/esportra.ts';
import { EsportraStages } from '../src/main/esportra-stages.ts';
import { EventJournal, verify } from '../src/main/event-journal.ts';
import { FakeEsportra, fakeStage } from '../dev/fake-esportra.ts';
import { gameState } from '../src/shared/br.ts';
import { mapScoring, planDays, planGroup, readStage } from '../src/shared/esportra-stage.ts';

// Use a stage from Esportra (28 Nov, read only): the mapping, following, what a re-read never touches, offline, 404/403.
async function setup() {
  const backend = await new FakeEsportra().start();
  const dir = mkdtempSync(join(tmpdir(), 'air-stage-'));
  const store = new Store(join(dir, 'air.json'));
  const values = new Map<string, string>();
  const account = new EsportraAccount({ apiBase: backend.url, store, secrets: { get: (k) => values.get(k) ?? null, set: (k, v) => void (v === null ? values.delete(k) : values.set(k, v)) }, deviceId: randomUUID(), deviceName: 'TEST-PC' });
  await account.login(backend.email, backend.password);
  let now = Date.now();
  const logs: string[] = [];
  const stored: Buffer[] = [];
  const journal = new EventJournal(join(dir, 'events'), () => now);
  const lobbies = new Lobbies({ store, journal, patch: async () => {}, live: () => false, log: (t) => logs.push(t), changed: () => {} });
  const stages = new EsportraStages({
    account: () => account, store, lobbies, game: () => 'pubgm', eventOpen: () => lobbies.selected?.eventId ?? null,
    storeImage: async (bytes) => { stored.push(bytes); return `/air-assets/${randomUUID()}`; },
    libraryChanged: async () => lobbies.refresh(), save: () => store.save(), log: (t) => logs.push(t), changed: () => {}, now: () => now,
  });
  const id = backend.brStage.stage.stageId;
  const group = (n: string) => lobbies.list().find((l) => l.title === n)!;
  return { backend, store, lobbies, stages, account, id, group, logs, stored, journal, advance: (ms: number) => { now += ms; }, close: () => backend.stop() };
}

test('mapping: one lobby per group, teams and players with roles and logos, matches with maps and times, days, points table', async () => {
  const t = await setup();
  try {
    const list = await t.stages.list();
    assert.deepEqual(list.stages.map((s) => s.stageName), ['Qualifiers', 'Finals'], 'a Valorant stage is left out');
    assert.equal(list.hidden, 1);
    const detail = await t.stages.detail(t.id);
    assert.equal(detail.players, 2 * (16 * 4 + 4), 'every player, subs included');
    assert.equal(detail.uidMissing, detail.players, 'Esportra sends no UIDs');
    await t.stages.use(t.id, null);
    const event = t.store.data.events.find((e) => e.tournamentId === t.backend.brStage.stage.tournamentId)!;
    assert.equal(event.name, 'Spring Clash', 'the event was made for the tournament');
    assert.deepEqual(t.lobbies.list().map((l) => l.title), ['Group A', 'Group B']);
    const a = t.group('Group A');
    assert.equal(a.eventId, event.id);
    assert.equal(a.teams.length, 16);
    assert.equal(a.games.length, 6);
    assert.deepEqual(a.games.map((g) => g.map), ['Erangel', 'Miramar', 'Rondo', 'Erangel', 'Miramar', 'Rondo']);
    assert.ok(a.games.every((g) => g.scheduledAt && g.esportraId && gameState(g) === 'scheduled'));
    assert.deepEqual(a.source?.esportra.groupId, t.backend.brStage.groups[0]!.id);
    assert.equal(a.days!.length, 2);
    assert.deepEqual(a.days!.map((d) => d.matchIds.length), [3, 3]);
    assert.deepEqual(a.days!.map((d) => d.title), ['Day 1', 'Day 2']);
    assert.deepEqual(a.scoring.placement, [15, 12, 10, 8, 6, 4, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    assert.equal(a.scoring.perElim, 1);
    assert.deepEqual(a.scoring.tiebreak, ['wins', 'elims', 'placementPts'], 'wins, kills, then the closest to average placement');
    assert.match(detail.notes.join(' '), /average placement/);
    // Library: teams by Esportra id, logos fetched into the engine, roles mapped.
    const lib = t.store.data.teams!;
    assert.equal(lib.length, 32);
    assert.ok(lib.every((x) => x.esportraId && x.logo.startsWith('/air-assets/') && x.esportraLogo));
    assert.equal(t.stored.length, 32);
    const players = t.store.data.players!;
    assert.equal(players.length, detail.players);
    assert.equal(players.filter((p) => p.role === 'Sub').length, 8);
    assert.equal(players.filter((p) => p.role === 'Player').length, 2 * 16 * 4);
    const first = t.backend.brStage.groups[0]!.teams[0]!;
    const row = players.find((p) => p.esportraId === first.players[0]!.id)!;
    assert.equal(row.gameId, first.players[0]!.ign);
    assert.equal(players.find((p) => p.esportraId === first.players[3]!.id)!.gameId, '', 'no in-game name from Esportra: left for the producer');
    // The journal alone still agrees with the store.
    assert.deepEqual(verify(t.journal.read(event.id), t.lobbies.list().filter((l) => l.eventId === event.id)).problems, []);
    // Nothing was written to Esportra.
    assert.ok(t.backend.calls.every((c) => c.startsWith('GET') || c.startsWith('POST /api/auth') || c.startsWith('POST /api/air/auth') || c.startsWith('POST /api/air/session') || c.startsWith('POST /api/air/devices') || c.startsWith('POST /api/air/access')), `only reads: ${t.backend.calls.filter((c) => !c.startsWith('GET')).join(', ')}`);
    // Using it again changes nothing (and does not fetch logos again).
    const before = JSON.stringify(t.lobbies.list());
    await t.stages.use(t.id, event.id);
    const afterUse = t.lobbies.list();
    const was = JSON.parse(before) as typeof afterUse;
    for (const [i, l] of afterUse.entries()) for (const k of Object.keys(l) as Array<keyof typeof l>) assert.equal(JSON.stringify(l[k]), JSON.stringify(was[i]![k]), `lobby ${l.title} ${k}`);
    assert.equal(t.stored.length, 32);
  } finally { await t.close(); }
});

test('an event linked to another tournament is refused', async () => {
  const t = await setup();
  try {
    t.store.data.events = [{ id: 'other', name: 'Other', stages: [], logo: '', logoLight: '', accent: '#fff', talent: [], sponsors: [], tournamentId: randomUUID() }];
    await assert.rejects(() => t.stages.use(t.id, 'other'), /linked to another Esportra tournament/);
    assert.equal(t.lobbies.list().length, 0);
  } finally { await t.close(); }
});

test('following updates the parts the producer has not edited, and only those', async () => {
  const t = await setup();
  try {
    await t.stages.use(t.id, null);
    const a0 = t.group('Group A').games.map((g) => g.scheduledAt);
    const b0 = t.group('Group B').games.map((g) => g.scheduledAt);
    // Esportra moves Group A's games by 30 minutes and Group B's third map.
    t.backend.editStage({ shift: { group: 0, minutes: 30 }, map: { group: 1, game: 3, name: 'Sanhok' } });
    await t.stages.refresh(t.id);
    const a1 = t.group('Group A');
    assert.deepEqual(a1.games.map((g) => Date.parse(g.scheduledAt!) - Date.parse(a0[a1.games.indexOf(g)]!)), Array(6).fill(30 * 60_000));
    assert.equal(t.group('Group B').games[2]!.map, 'Sanhok');
    assert.deepEqual(a1.games.map((g) => g.n), [1, 2, 3, 4, 5, 6]);
    assert.equal(a1.days!.reduce((n, d) => n + d.matchIds.length, 0), 6);
    // The producer edits Group B's schedule (a map): that part is Air's now.
    t.lobbies.update(t.group('Group B').id, { games: t.group('Group B').games.map((g, i) => ({ map: i === 0 ? 'Vikendi' : g.map, startsAt: g.startsAt })) });
    assert.deepEqual(t.stages.view().followed[0]!.lobbies.find((l) => l.title === 'Group B')!.edited, { schedule: true });
    t.backend.editStage({ shift: { group: 1, minutes: 45 }, map: { group: 1, game: 1, name: 'Erangel' } });
    await t.stages.refresh(t.id);
    assert.equal(t.group('Group B').games[0]!.map, 'Vikendi', 'the producer’s map stays');
    assert.deepEqual(t.group('Group B').games.map((g) => g.scheduledAt), b0.map((x, i) => (i === 2 ? x : x)).map((x, i) => t.group('Group B').games[i]!.scheduledAt), 'times stay as they were');
    const bTimes = t.group('Group B').games.map((g) => g.scheduledAt);
    await t.stages.refresh(t.id);
    assert.deepEqual(t.group('Group B').games.map((g) => g.scheduledAt), bTimes);
    // Group A still follows.
    t.backend.editStage({ shift: { group: 0, minutes: 10 } });
    await t.stages.refresh(t.id);
    assert.equal(Date.parse(t.group('Group A').games[0]!.scheduledAt!) - Date.parse(a0[0]!), 40 * 60_000);
    // Follow Esportra again takes the schedule back.
    await t.stages.follow(t.id, 'schedule');
    assert.equal(t.group('Group B').games[0]!.map, 'Erangel');
    assert.ok(Date.parse(t.group('Group B').games[0]!.scheduledAt!) - Date.parse(b0[0]!) >= 45 * 60_000);
    assert.deepEqual(t.stages.view().followed[0]!.lobbies.find((l) => l.title === 'Group B')!.edited, {});
  } finally { await t.close(); }
});

test('the roster follows Esportra until the producer picks the teams; Teams/Players edits are kept', async () => {
  const t = await setup();
  try {
    await t.stages.use(t.id, null);
    // The producer adds a UID and Esportra adds a team to each group.
    const p = t.store.data.players![0]!;
    p.uid = '5123456789';
    t.backend.editStage({ addTeam: { group: 0, name: 'Late Entry' } });
    t.backend.editStage({ addTeam: { group: 1, name: 'Late Entry B' } });
    await t.stages.refresh(t.id);
    assert.equal(t.group('Group A').teams.length, 17);
    assert.equal(t.group('Group A').teams.at(-1)!.name, 'Late Entry');
    assert.equal(t.store.data.players!.find((x) => x.id === p.id)!.uid, '5123456789', 'a UID typed in Air is kept');
    assert.equal(t.stored.length, 32, 'logos already fetched are not fetched again');
    // The producer takes Group B's teams over.
    const b = t.group('Group B');
    t.lobbies.setTeams(b.id, b.teams.slice(0, 10).map((x) => x.teamId));
    t.backend.editStage({ addTeam: { group: 1, name: 'Later Entry B' } });
    await t.stages.refresh(t.id);
    assert.equal(t.group('Group B').teams.length, 10, 'edited in Air: left alone');
    assert.deepEqual(t.stages.view().followed[0]!.lobbies.find((l) => l.title === 'Group B')!.edited, { roster: true });
  } finally { await t.close(); }
});

test('a re-read never touches results, states or confirmed matches, nor a live match’s lobby', async () => {
  const t = await setup();
  try {
    await t.stages.use(t.id, null);
    const a = t.group('Group A');
    const rows = a.teams.map((x, i) => ({ team: x.id, place: i + 1, elims: 1 }));
    // Match 1 is confirmed with results; match 2 is armed.
    t.lobbies.setResult(a.id, 1, rows);
    t.lobbies.commit({ ...t.group('Group A'), games: t.group('Group A').games.map((g) => (g.n === 1 ? { ...g, state: 'confirmed' as const } : g.n === 2 ? { ...g, state: 'armed' as const } : g)) });
    const g1 = JSON.stringify(t.group('Group A').games[0]);
    const g2 = JSON.stringify(t.group('Group A').games[1]);
    t.backend.editStage({ shift: { group: 0, minutes: 30 }, map: { group: 0, game: 1, name: 'Sanhok' }, placements: [20, 15, 10, 5] });
    await t.stages.refresh(t.id);
    const after = t.group('Group A');
    assert.equal(JSON.stringify(after.games[0]), g1, 'the confirmed match is exactly as it was');
    assert.equal(JSON.stringify(after.games[1]), g2, 'the armed match is untouched');
    assert.equal(gameState(after.games[0]!), 'confirmed');
    assert.deepEqual(after.games[0]!.results, rows);
    assert.notEqual(after.games[2]!.scheduledAt, a.games[2]!.scheduledAt, 'later matches follow');
    assert.deepEqual(after.scoring.placement, a.scoring.placement, 'matches are saved: Air keeps its points table');
    assert.match(t.stages.view().followed[0]!.held.join(' '), /points table/);
    assert.deepEqual(after.teams.map((x) => x.id), a.teams.map((x) => x.id));
    // A live match: its lobby is not touched at all.
    t.lobbies.commit({ ...t.group('Group A'), games: t.group('Group A').games.map((g) => (g.n === 2 ? { ...g, state: 'live' as const } : g)) });
    const frozen = JSON.stringify(t.group('Group A'));
    t.backend.editStage({ shift: { group: 0, minutes: 30 }, addTeam: { group: 0, name: 'Too Late' } });
    await t.stages.refresh(t.id);
    assert.equal(JSON.stringify(t.group('Group A')), frozen);
    assert.match(t.stages.view().followed[0]!.held.join(' '), /Group A: a match is live/);
    assert.equal(t.group('Group B').games.length, 6, 'the other group still follows');
  } finally { await t.close(); }
});

test('a schedule change that would move a played match is held, not applied', async () => {
  const t = await setup();
  try {
    await t.stages.use(t.id, null);
    const a = t.group('Group A');
    t.lobbies.commit({ ...a, games: a.games.map((g) => (g.n === 3 ? { ...g, state: 'armed' as const } : g)) });
    // Esportra drops its first game: every later game would move up a place, and Match 3 is armed.
    t.backend.brStage.lobbies[0]!.games.shift();
    const before = JSON.stringify(t.group('Group A').games);
    await t.stages.refresh(t.id);
    assert.equal(JSON.stringify(t.group('Group A').games), before);
    assert.match(t.stages.view().followed[0]!.held.join(' '), /would move Match 3/);
  } finally { await t.close(); }
});

test('offline keeps the last read, then catches up on the next 60 s read', async () => {
  const t = await setup();
  try {
    await t.stages.use(t.id, null);
    const before = JSON.stringify(t.lobbies.list());
    t.backend.down = true;
    await assert.rejects(() => t.stages.refresh(t.id), /not reachable/);
    const f = t.stages.view().followed[0]!;
    assert.ok(f.unreachableSince, 'says since when');
    assert.match(f.error ?? '', /last read/);
    assert.equal(JSON.stringify(t.lobbies.list()), before, 'the last read is kept');
    t.backend.down = false;
    t.backend.editStage({ shift: { group: 0, minutes: 30 } });
    // The loop: nothing before 60 s, a read after.
    await t.stages.tick();
    t.advance(30_000);
    await t.stages.tick();
    assert.equal(JSON.stringify(t.lobbies.list()), before, 'not due yet');
    t.advance(61_000);
    await t.stages.tick();
    const g = t.stages.view().followed[0]!;
    assert.equal(g.unreachableSince, null);
    assert.equal(g.error, null);
    assert.notEqual(JSON.stringify(t.lobbies.list()), before, 'followed after the minute');
  } finally { await t.close(); }
});

test('404 and 403: a stage that is gone is kept and no longer followed; no access says why', async () => {
  const t = await setup();
  try {
    await assert.rejects(() => t.stages.detail('00000000-0000-4000-8000-000000000999'), /no longer lists/);
    await t.stages.use(t.id, null);
    const before = JSON.stringify(t.lobbies.list());
    t.backend.stageGone = true;
    await assert.rejects(() => t.stages.refresh(t.id), /no longer lists/);
    const f = t.stages.view().followed[0]!;
    assert.equal(f.following, false);
    assert.match(f.error ?? '', /keeps what it read/);
    assert.equal(JSON.stringify(t.lobbies.list()), before);
    t.backend.stageGone = false;
    t.backend.brAllowed = false;
    await assert.rejects(() => t.stages.list(), /cannot produce stages/);
    assert.equal(JSON.stringify(t.lobbies.list()), before);
  } finally { await t.close(); }
});

test('mapScoring: kill cap, tiebreaks and what Air has no setting for are said, never dropped quietly', () => {
  const r = mapScoring({ placements: [10, 6, 5], killPoints: 1, killCap: 8, tiebreakers: ['points', 'kills', 'avg_placement', 'fastest'], gamesPerLobby: 6, format: 'groups' });
  assert.equal(r.scoring.elimCap, 8);
  assert.deepEqual(r.scoring.tiebreak, ['elims', 'placementPts']);
  assert.equal(r.notes.length, 3, 'cap, average placement, unknown tiebreak');
  const odd = mapScoring({ placements: [], killPoints: 1.5, killCap: null, tiebreakers: [], gamesPerLobby: null, format: '' });
  assert.deepEqual(odd.scoring.placement, [10, 6, 5, 4, 3, 2, 1, 1]);
  assert.equal(odd.scoring.perElim, 2);
});

test('days and games: dates make days, a game without a time joins the one before, no times is one day; wave, index, number order', () => {
  const day = (d: number, h: number) => new Date(2026, 11, d, h, 0).toISOString();
  const days = planDays([{ id: 'a', map: '', scheduledAt: day(6, 12) }, { id: 'b', map: '', scheduledAt: null }, { id: 'c', map: '', scheduledAt: day(7, 12) }, { id: 'd', map: '', scheduledAt: day(6, 18) }]);
  assert.deepEqual(days.map((d) => [d.title, d.games.map((g) => g.id)]), [['Day 1', ['a', 'b', 'd']], ['Day 2', ['c']]]);
  assert.deepEqual(planDays([{ id: 'x', map: '', scheduledAt: null }]).map((d) => [d.date, d.games.length]), [['', 1]]);
  const read = readStage(JSON.parse(JSON.stringify(fakeStage()).replaceAll('__LOGO__', 'https://example.com')));
  read.lobbies[0]!.wave = 2; read.lobbies[0]!.groupIds = [read.groups[1]!.id];
  read.lobbies[1]!.wave = 1; read.lobbies[1]!.groupIds = [read.groups[1]!.id];
  const plan = planGroup(read, read.groups[1]!);
  assert.equal(plan.games.length, 12, 'both lobbies belong to the group');
  assert.equal(plan.games[0]!.id, read.lobbies[1]!.games[0]!.id, 'wave 1 first');
  assert.equal(readStage(JSON.parse(JSON.stringify(fakeStage()).replaceAll('__LOGO__', 'https://example.com'))).groups[0]!.teams[0]!.logoUrl, 'https://example.com/fake-logo/0.png');
});
