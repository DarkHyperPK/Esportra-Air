import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit } from './br-kit.ts';
import { BrAutopilot } from '../src/main/br-autopilot.ts';
import { showOf } from '../src/shared/br-rundown.ts';

// Live checkpoints (27 Nov): the live match's state is saved every 2 s, so an Air restart mid-match offers to resume
// the same match. Resume re-arms it, moments already shown do not fire again, and game data still needs the
// producer's consent (nothing flows until they connect again).
const small = { teams: 4, length: 300 };

test('a restart mid-match offers Resume; the match resumes without re-firing moments, and consent is still needed', async () => {
  const s = await kit(small);
  try {
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    for (let i = 0; i < 80; i++) await s.step(2);
    const shownBefore = s.moments.map(([n]) => n);
    assert.ok(shownBefore.includes('plane') && shownBefore.includes('first.blood'), 'moments fired in the first run');
    const saved = s.store.data.brCheckpoint!;
    assert.equal(saved.n, 1);
    assert.equal(saved.matchId, s.game(1).id);
    assert.ok(saved.moments.includes('fb') && saved.moments.includes('plane'));
    assert.ok(saved.savedAt > 0 && saved.lastDataAt);

    // Air closes and opens again.
    const r = s.restart();
    assert.equal(r.game(1).state, 'live', 'the match is still live in the saved data');
    assert.deepEqual(r.run.resumeOffer(), { lobbyId: s.lobbyId, matchId: s.game(1).id, n: 1, title: 'Group A', placed: saved.placed.length, kills: saved.kills, moments: saved.moments.length, savedAt: saved.savedAt, autopilot: [] });
    // Nothing flows before consent: the new feed is not connected, so it has read nothing.
    await r.step(2);
    assert.equal(r.feed.status.state, 'off');
    assert.equal(r.moments.length, 0);

    await r.lobbies.select(s.lobbyId);
    await r.run.resume();
    assert.equal(r.run.resumeOffer(), null, 'the prompt is answered');
    r.connect();                       // the producer's consent, again
    await r.step(2);
    assert.equal(r.feed.status.game, 1);
    assert.equal(r.game(1).attempts!.length, 1, 'the same attempt, not a new one');
    for (let i = 0; i < 20; i++) await r.step(2);
    const again = r.moments.map(([n]) => n);
    for (const once of ['game.start', 'plane', 'first.blood']) assert.ok(!again.includes(once as never), `${once} does not fire again`);
    await (async () => { for (let t = 0; t < s.pcob.gameEnd + 40; t += 2) await r.step(2); })();
    assert.equal(r.game(1).state, 'provisional');
    assert.equal(r.moments.filter(([n]) => n === 'wwcd').length, 1, 'the rest of the match still happens, once');
    assert.equal(r.store.data.brCheckpoint, null, 'the checkpoint is cleared once the match is saved');
  } finally { await s.close(); }
});

test('Not now leaves the match live (end or remake it) and a new game without resume is only a hint', async () => {
  const s = await kit(small);
  try {
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    for (let i = 0; i < 20; i++) await s.step(2);
    const r = s.restart();
    assert.ok(r.run.resumeOffer());
    r.run.dismissResume();
    assert.equal(r.run.resumeOffer(), null);
    assert.equal(r.game(1).state, 'live');
    await r.lobbies.select(s.lobbyId);
    r.connect(); await r.step(2);
    assert.equal(r.feed.status.restarted, true, 'attached to a live match without Resume: Air asks, never decides');
    await r.run.endMatch(s.lobbyId, r.game(1).id!);
    assert.equal(r.game(1).state, 'provisional');
  } finally { await s.close(); }
});

test('a checkpoint for a match that is no longer live is ignored', async () => {
  const s = await kit(small);
  try {
    s.run.arm(s.lobbyId, s.game(1).id!);
    s.connect(); s.pcob.begin(); await s.step(0);
    for (let i = 0; i < 10; i++) await s.step(2);
    s.run.voidMatch(s.lobbyId, s.game(1).id!, 'Wrong lobby');
    const r = s.restart();
    assert.equal(r.run.resumeOffer(), null);
  } finally { await s.close(); }
});

test('autopilot progress is saved per lobby and offered again after a restart', async () => {
  const saved: Record<string, unknown> = {};
  const taken: string[] = [];
  const s = await kit(small);
  try {
    const l = s.lobby();
    const mk = () => new BrAutopilot({
      lobby: () => s.lobby(), take: async (_l, screen) => void taken.push(String(screen)), log: () => {}, changed: () => {},
      wait: () => new Promise<void>((res) => setTimeout(res, 5)),
      persist: (id, p) => { if (p) saved[id] = p; else delete saved[id]; },
    });
    const a = mk();
    s.lobbies.setShow(l.id, { autopilot: true });
    assert.ok(showOf(s.lobby()).rows.length);
    a.onMoment('game.end', { game: 1, results: true });
    await new Promise((r) => setTimeout(r, 1));
    assert.ok(saved[l.id], 'the run in progress is saved');
    const b = mk();
    b.load(saved[l.id] as never);
    assert.ok(b.pending);
    const before = taken.length;
    b.discard();
    assert.equal(b.pending, null);
    assert.equal(saved[l.id], undefined, 'dropped when the producer says Not now');
    assert.ok(taken.length >= before);
  } finally { await s.close(); }
});
