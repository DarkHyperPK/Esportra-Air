import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type BrMoment } from '../src/main/br-live.ts';
import { kit } from './br-kit.ts';

// The PUBG MOBILE observer feed end to end (24 Nov): Air reads the stand-in PCOB (the official API's routes and
// shapes) only after consent and only on the local network, writes `brLive` while the game runs, and saves the
// match by itself when it ends: places and team kills as the results, every player's numbers as the game's feed.
// The producer's typed results win, the game's copy is kept, and a dropped connection recovers.
async function setup(opts: { generic?: boolean } = {}) {
  const k = await kit(opts);
  return { ...k, pcob: k.pcob, close: k.close, arm: (n: number) => k.run.arm(k.lobbyId, k.game(n).id!) };
}

test('consent first, local network only', async () => {
  const s = await setup();
  try {
    assert.throws(() => s.feed.connect(`127.0.0.1:${s.pcob.port}`, false), /Tick the box/);
    assert.throws(() => s.feed.connect('8.8.8.8:10086', true), /your network/);
    assert.throws(() => s.feed.connect('pcob.example.com', true), /your network/);
    assert.equal(s.pcob.requests.length, 0, 'nothing was read');
    s.feed.connect(`127.0.0.1:${s.pcob.port}`, true);
    await s.step(0);
    assert.equal(s.feed.status.state, 'waiting', 'PCOB answers; no game yet');
  } finally { await s.close(); }
});

test('a whole game: live brLive, moments, then results and every player saved by themselves', async () => {
  const s = await setup();
  try {
    s.feed.connect(`127.0.0.1:${s.pcob.port}`, true);
    s.arm(1);
    s.pcob.begin();
    await s.step(0);
    assert.equal(s.feed.status.state, 'live');
    assert.equal(s.feed.status.game, 1, 'the armed match');
    assert.equal(s.game(1).state, 'live');
    let sawLive = false, sawOut = false;
    const shown = new Map<string, any>();
    for (let t = 0; t < s.pcob.gameEnd + 40; t += 2) {
      await s.step(2);
      const live = s.patches.filter((p) => p.fields.brLive).at(-1)?.fields.brLive;
      if (live && live.teamsAlive < 16) sawLive = true;
      if (live?.lastOut) { sawOut = true; assert.ok(live.lastOut.place > 1 && live.lastOut.place <= 16); }
      if (live?.moment && !shown.has(live.moment.kind)) shown.set(live.moment.kind, live.moment);
    }
    assert.ok(sawLive && sawOut, 'teams fall and Team eliminated is set');
    // Moments over the HUD, one at a time, from the feed.
    const fb = shown.get('first.blood');
    assert.ok(fb && fb.causer && fb.victim && fb.team, 'First blood names the player, the victim and the team');
    assert.equal(fb.for, 6);
    assert.ok(shown.has('final.teams') && shown.get('final.teams').teams.length === 4, 'Final 4 with the four teams');
    // brStats reaches the room once the match is saved.
    const stats = s.patches.filter((p) => p.fields.brStats).at(-1)?.fields.brStats;
    assert.ok(stats && stats.games.length === 1 && stats.games[0].players.length === 64 && stats.day.length === 64, 'brStats: the match and the day');
    assert.equal(s.feed.status.slots.filter((x) => x.seat).length, 16, 'every PCOB team seated by name');
    const g = s.lobby().games[0]!;
    assert.equal(g.source, 'pcob');
    assert.equal(g.state, 'provisional', 'what the game gave is provisional, never official');
    assert.equal(s.lobbies.find(s.lobbyId).games[0]!.results!.length, 16);
    assert.equal(g.results!.length, 16);
    assert.deepEqual(g.results!.map((r) => r.place), Array.from({ length: 16 }, (_, i) => i + 1));
    const kills = g.results!.reduce((n, r) => n + r.elims, 0);
    assert.ok(kills >= 60, `team kills saved (${kills})`);
    assert.equal(g.feed!.stats.length, 64, 'every player');
    assert.ok(g.feed!.stats.some((x) => x.survival > 0 && x.damageTaken > 0), 'end-of-game numbers were waited for');
    assert.ok(g.feed!.kills.length > 0 && g.feed!.circles.length > 0 && g.feed!.plane, 'kill feed, circles and plane kept');
    const names = s.moments.map(([n]) => n);
    for (const m of ['game.start', 'plane', 'first.blood', 'team.out', 'final.teams', 'wwcd', 'game.end'] as BrMoment[]) assert.ok(names.includes(m), `moment ${m}`);
    assert.equal(names.filter((n) => n === 'wwcd').length, 1, 'WWCD once');
    assert.ok((s.store.data.players ?? []).every((p) => p.openId), 'Teams/Players learned every OpenID');
    // Confirm makes it official and arms match 2, which the next game fills.
    s.run.confirm(s.lobbyId, g.id!);
    assert.equal(s.game(2).state, 'armed');
    s.pcob.stop(); await s.step(1);
    s.pcob.begin(); await s.step(0);
    assert.equal(s.feed.status.game, 2);
  } finally { await s.close(); }
});

test('generic PCOB names seat by players; the producer pairs the rest; typed results win and the game’s copy stays', async () => {
  const s = await setup({ generic: true });
  try {
    // Two teams' players are renamed in Teams/Players so they can't be matched: the producer pairs them by hand.
    s.store.data.players!.filter((p) => p.teamId === 't0' || p.teamId === 't1').forEach((p) => { p.gameId = `${p.gameId}X`; });
    s.lobbies.refresh();
    s.feed.connect(`127.0.0.1:${s.pcob.port}`, true);
    s.arm(1);
    s.pcob.begin(); await s.step(100);
    const slots = s.feed.status.slots;
    assert.equal(slots.length, 16);
    assert.equal(slots.filter((x) => x.seat).length, 14, 'seated by in-game names');
    const lobby = s.lobby();
    const team = (i: number) => lobby.teams.find((t) => t.teamId === `t${i}`)!.id;
    s.lobbies.setSeat(lobby.id, 1, team(0));
    s.lobbies.setSeat(lobby.id, 2, team(1));
    await s.step(1);
    assert.equal(s.feed.status.slots.filter((x) => x.seat).length, 16);
    // The producer types match 1 before it ends: the feed keeps the typed results and stores its own beside them.
    s.lobbies.setResult(lobby.id, 1, lobby.teams.map((t, i) => ({ team: t.id, place: i + 1, elims: 0 })));
    for (let t = 0; t < s.pcob.gameEnd + 40; t += 10) await s.step(10);
    const g = s.lobby().games[0]!;
    assert.equal(g.source, 'producer');
    assert.equal(g.results![0]!.team, team(0), 'typed results kept');
    assert.equal(g.gameResults!.length, 16, 'the game’s own copy kept');
    assert.equal(g.feed!.stats.length, 64);
  } finally { await s.close(); }
});

test('a dropped connection shows as no answer and recovers', async () => {
  const s = await setup();
  try {
    s.feed.connect(`127.0.0.1:${s.pcob.port}`, true);
    await s.step(0);
    const port = s.pcob.port;
    await s.pcob.close();
    await s.step(1);
    assert.equal(s.feed.status.state, 'error');
    assert.ok(s.feed.status.error);
    await s.pcob.listen(port);
    await s.step(3);
    assert.equal(s.feed.status.state, 'waiting');
    s.feed.disconnect();
    assert.equal(s.feed.status.state, 'off');
  } finally { await s.close(); }
});
