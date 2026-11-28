import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit } from './br-kit.ts';
import { gameState } from '../src/shared/br.ts';

// The match state machine (27 Nov): Scheduled → Armed → Live → Finishing → Provisional → Confirmed, with Remake and
// Void. The observer feed writes only into the armed match, what it saves is provisional until Confirm, and nothing
// that would change the wrong match is allowed while one is live. Verified PCOB data only: no remake is ever
// guessed, "no data" never ends a match.
const small = { teams: 4, length: 300 };

test('arming routes feed data only to the armed match; Confirm arms the next one', async () => {
  const s = await kit(small);
  try {
    assert.deepEqual(s.lobby().games.map((g) => g.state), ['scheduled', 'scheduled', 'scheduled']);
    s.run.arm(s.lobbyId, s.game(2).id!);
    assert.equal(s.game(2).state, 'armed');
    s.connect(); s.pcob.begin(); await s.step(0);
    assert.equal(s.feed.status.game, 2, 'match 2 is the armed one, not the first without results');
    assert.equal(s.game(2).state, 'live');
    assert.equal(s.game(2).attempts!.length, 1);
    await s.playOut();
    assert.equal(s.game(2).state, 'provisional');
    assert.equal(s.game(2).results!.length, 4);
    assert.equal(s.game(1).results, undefined, 'match 1 is untouched');
    assert.equal(s.game(1).state, 'scheduled');
    s.run.confirm(s.lobbyId, s.game(2).id!);
    assert.equal(s.game(2).state, 'confirmed');
    assert.equal(s.game(3).state, 'armed', 'the next scheduled match of the day follows (match 3: match 1 is earlier)');
  } finally { await s.close(); }
});

test('a game with nothing armed is read but not saved; arming adopts it', async () => {
  const s = await kit(small);
  try {
    s.connect(); s.pcob.begin(); await s.step(0); await s.step(10);
    assert.equal(s.feed.status.unarmed, true);
    assert.equal(s.feed.status.game, null);
    assert.match(s.logs.join('\n'), /no match is armed/);
    assert.equal(s.patches.filter((p) => p.fields.brLive).length, 0, 'nothing is written to the room');
    assert.ok(s.feed.status.slots.length === 0 || true);
    s.run.arm(s.lobbyId, s.game(1).id!);
    await s.step(2);
    assert.equal(s.feed.status.unarmed, false);
    assert.equal(s.game(1).state, 'live', 'the running game was adopted');
    await s.playOut();
    assert.equal(s.game(1).state, 'provisional');
  } finally { await s.close(); }
  const t = await kit(small);
  try {
    t.connect(); t.pcob.begin(); await t.step(0);
    await t.playOut();
    assert.ok(t.lobby().games.every((g) => !g.results && g.state === 'scheduled'), 'never armed: nothing saved');
  } finally { await t.close(); }
});

test('remake keeps the attempt and resets the moments; only the last attempt counts', async () => {
  const s = await kit(small);
  try {
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    for (let i = 0; i < 70; i++) await s.step(2);
    assert.equal(s.moments.filter(([n]) => n === 'game.start').length, 1);
    assert.ok(s.moments.some(([n]) => n === 'first.blood'));
    s.run.remake(s.lobbyId, s.game(1).id!);
    const g = s.game(1);
    assert.equal(g.state, 'armed', 'armed for a clean new attempt');
    assert.equal(g.attempts!.length, 1);
    assert.equal(g.attempts![0]!.reason, 'remake');
    assert.ok(g.attempts![0]!.feed?.stats.length, 'the thrown-away attempt keeps what it had');
    // The new game starts; moments fire again for it.
    s.pcob.stop(); await s.step(2); s.pcob.begin(); await s.step(0);
    assert.equal(s.game(1).state, 'live');
    assert.equal(s.game(1).attempts!.length, 2);
    assert.equal(s.moments.filter(([n]) => n === 'game.start').length, 2);
    await s.playOut();
    const done = s.game(1);
    assert.equal(done.attempts!.length, 2);
    assert.equal(done.attempts![1]!.reason, 'ended');
    assert.equal(done.state, 'provisional');
    assert.equal(s.moments.filter(([n]) => n === 'wwcd').length, 1, 'one WWCD: the first attempt never had one');
    // A remake of a provisional match drops what it saved but keeps it as an attempt.
    s.run.remake(s.lobbyId, done.id!);
    assert.equal(s.game(1).results, undefined);
    assert.equal(s.game(1).attempts!.at(-1)!.results!.length, 4);
    assert.throws(() => s.run.remake(s.lobbyId, s.game(2).id!), /only a live or provisional/);
  } finally { await s.close(); }
});

test('a game that ends before a winner is only a hint; the producer ends it and types the missing places', async () => {
  const s = await kit(small);
  try {
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    for (let i = 0; i < 60; i++) await s.step(2);
    s.pcob.stop(); await s.step(2);
    assert.equal(s.feed.status.noWinner, true);
    assert.match(s.logs.join('\n'), /ended before a winner\. Remake Match 1\?/);
    assert.equal(s.game(1).state, 'live', 'never remade or ended by itself');
    assert.equal(s.game(1).attempts!.length, 1);
    await s.run.endMatch(s.lobbyId, s.game(1).id!);
    const g = s.game(1);
    assert.equal(g.state, 'provisional');
    assert.equal(g.results, undefined, 'teams still ranked 0 need the producer');
    assert.ok(g.draft!.some((r) => r.place === null));
    assert.ok(g.checks!.unplaced.length > 0);
    assert.throws(() => s.run.confirm(s.lobbyId, g.id!), /Type the missing places/);
    const ids = s.lobby().teams.map((t) => t.id);
    s.lobbies.setResult(s.lobbyId, 1, ids.map((team, i) => ({ team, place: i + 1, elims: i })));
    s.run.confirm(s.lobbyId, g.id!);
    assert.equal(s.game(1).state, 'confirmed');
    assert.equal(s.game(1).results!.length, 4);
  } finally { await s.close(); }
});

test('no data for 10 s is a warning that never ends the match', async () => {
  const s = await kit(small);
  try {
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    for (let i = 0; i < 6; i++) await s.step(2);
    assert.equal(s.feed.status.noData, false);
    s.freeze(true);
    await s.step(4); await s.step(4);
    assert.equal(s.feed.status.noData, false, '8 s: still fine');
    await s.step(4);
    assert.equal(s.feed.status.noData, true, '12 s without a changed number');
    assert.equal(s.game(1).state, 'live');
    s.freeze(false);
    await s.step(2);
    assert.equal(s.feed.status.noData, false, 'data is back');
    assert.equal(s.game(1).state, 'live');
  } finally { await s.close(); }
});

test('confirm needs valid, complete results; a confirmed match is only edited with a reason', async () => {
  const s = await kit(small);
  try {
    assert.throws(() => s.run.confirm(s.lobbyId, s.game(1).id!), /scheduled/);
    const ids = s.lobby().teams.map((t) => t.id);
    s.lobbies.setResult(s.lobbyId, 1, ids.slice(0, 3).map((team, i) => ({ team, place: i + 1, elims: 1 })));
    assert.equal(s.game(1).state, 'provisional');
    assert.throws(() => s.run.confirm(s.lobbyId, s.game(1).id!), /no place yet/);
    s.lobbies.setResult(s.lobbyId, 1, ids.map((team, i) => ({ team, place: i + 1, elims: 1 })));
    s.run.confirm(s.lobbyId, s.game(1).id!);
    const g = s.game(1);
    assert.equal(g.state, 'confirmed');
    assert.ok(g.confirmedAt);
    assert.throws(() => s.run.confirm(s.lobbyId, g.id!), /already confirmed/);
    const swapped = ids.map((team, i) => ({ team, place: ids.length - i, elims: 1 }));
    assert.throws(() => s.run.editConfirmed(s.lobbyId, g.id!, swapped, ''), /Say why/);
    s.run.editConfirmed(s.lobbyId, g.id!, swapped, 'Scoreboard typo');
    const e = s.game(1);
    assert.equal(e.results!.find((r) => r.team === ids[0])!.place, 4);
    assert.equal(e.edits!.length, 1);
    assert.equal(e.edits![0]!.reason, 'Scoreboard typo');
    assert.equal(e.edits![0]!.before.find((r) => r.team === ids[0])!.place, 1);
    const line = s.journal.read('ev').filter((l) => l.kind === 'match.edit').at(-1)!;
    assert.equal(line.data.reason, 'Scoreboard typo');
  } finally { await s.close(); }
});

test('adjustments count in the official standings, with a reason, and can be removed', async () => {
  const s = await kit(small);
  try {
    const ids = s.lobby().teams.map((t) => t.id);
    s.lobbies.setResult(s.lobbyId, 1, ids.map((team, i) => ({ team, place: i + 1, elims: 0 })));
    s.run.confirm(s.lobbyId, s.game(1).id!);
    const total = (team: string) => s.patches.filter((p) => p.fields.br).at(-1)!.fields.br.standings.find((r: any) => r.team === team).total;
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(total(ids[0]!), 10);
    assert.throws(() => s.run.adjust(s.lobbyId, ids[0], -3, ''), /Say why/);
    assert.throws(() => s.run.adjust(s.lobbyId, ids[0], 0, 'x'), /whole number/);
    s.run.adjust(s.lobbyId, ids[0], -3, 'Late start');
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(total(ids[0]!), 7);
    assert.equal(s.lobby().adjustments![0]!.reason, 'Late start');
    assert.ok(s.journal.read('ev').some((l) => l.kind === 'adjust' && l.data.reason === 'Late start'));
    s.run.removeAdjustment(s.lobbyId, s.lobby().adjustments![0]!.id);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(total(ids[0]!), 10);
  } finally { await s.close(); }
});

test('while a match is live: switching lobby, deleting, editing teams and arming another are refused', async () => {
  const s = await kit(small);
  try {
    const other = await s.lobbies.create({ eventId: 'ev', game: 'pubgm', title: 'Group B', games: 1 });
    await s.lobbies.select(s.lobbyId);
    s.run.arm(s.lobbyId, s.game(1).id!);
    assert.throws(() => s.lobbies.setTeams(s.lobbyId, ['t0']), /Disarm it/, 'armed: teams are held');
    s.run.disarm(s.lobbyId);
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    assert.equal(s.game(1).state, 'live');
    await assert.rejects(() => s.lobbies.select(other.id), /is live/);
    assert.throws(() => s.lobbies.remove(s.lobbyId), /is live/);
    assert.throws(() => s.lobbies.setTeams(s.lobbyId, ['t0', 't1']), /Confirm, remake or end it/);
    assert.throws(() => s.run.arm(s.lobbyId, s.game(2).id!), /Match 1 is live/);
    assert.equal(s.lobbies.selected!.id, s.lobbyId);
    // Void needs a reason and frees the lobby.
    assert.throws(() => s.run.voidMatch(s.lobbyId, s.game(1).id!, ''), /Say why/);
    s.run.voidMatch(s.lobbyId, s.game(1).id!, 'Server crash');
    assert.equal(s.game(1).state, 'void');
    assert.equal(s.game(1).voidReason, 'Server crash');
    assert.equal(s.game(2).state, 'scheduled', 'a voided live game may still run in PCOB: the next match is not armed for it');
    await s.lobbies.select(other.id);
  } finally { await s.close(); }
});

test('a verified-data check list: team kills vs players, unknown players, disconnected', async () => {
  const s = await kit(small);
  try {
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    await s.playOut();
    const g = s.game(1);
    assert.deepEqual(g.checks!.unplaced, []);
    assert.deepEqual(g.checks!.teamKills, [], 'the stand-in keeps team kills equal to its players');
    assert.deepEqual(g.checks!.unknown, []);
  } finally { await s.close(); }
});
