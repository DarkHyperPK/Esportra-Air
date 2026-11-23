import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store.ts';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { BrLiveFeed, type BrMoment } from '../src/main/br-live.ts';
import { FakePcob } from '../dev/fake-pcob.ts';

// The PUBG MOBILE observer feed end to end (24 Nov): Air reads the stand-in PCOB (the official API's routes and
// shapes) only after consent and only on the local network, writes `brLive` while the game runs, and saves the
// match by itself when it ends: places and team kills as the results, every player's numbers as the game's feed.
// The producer's typed results win, the game's copy is kept, and a dropped connection recovers.
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
const tag = (i: number) => `T${String(i).padStart(2, '0')}`;
const roster = (i: number) => ['ACE', 'ROOK', 'VEX', 'KAI'].map((p) => `${tag(i)}_${p}`);

async function setup(opts: { generic?: boolean } = {}) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'pcob-')), 'air.json'));
  store.data.events = [{ id: 'ev', name: 'Cup', stages: [], logo: '', logoLight: '', accent: '#ffb60e', talent: [], sponsors: [], tournamentId: null }];
  store.data.teams = NAMES.map((name, i) => ({ id: `t${i}`, name, tag: tag(i), color: '#ffffff', logo: '' }));
  store.data.players = NAMES.flatMap((_, i) => roster(i).map((n, k) => ({ id: `p${i}-${k}`, name: n, realName: '', gameId: n, photo: '', role: '', teamId: `t${i}` })));
  const patches: Array<{ code: string; fields: any }> = [];
  const lobbies = new Lobbies({ store, patch: async (code, fields) => void patches.push({ code, fields }), live: () => false, log: () => {}, changed: () => {} });
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', title: 'Group A', games: 3, maps: ['Erangel', 'Miramar', 'Sanhok'] });
  lobbies.setTeams(l.id, NAMES.map((_, i) => `t${i}`));
  let now = 1_000_000;
  const pcob = await new FakePcob({ teams: NAMES.map((name, i) => ({ name, players: roster(i) })), genericNames: opts.generic ?? false, length: 900, now: () => now }).listen();
  const moments: Array<[BrMoment, Record<string, unknown>]> = [];
  const logs: string[] = [];
  const feed = new BrLiveFeed({
    lobby: () => lobbies.selected, patch: async (code, fields) => void patches.push({ code, fields }),
    save: (id, n, results, f) => lobbies.saveFeed(id, n, results, f), learn: (id, seen) => lobbies.learnOpenIds(id, seen),
    event: (n, d) => void moments.push([n, d]), log: (t) => logs.push(t), changed: () => {}, now: () => now, manual: true,
  });
  const step = async (seconds: number) => { now += seconds * 1000; await feed.tick(); };
  return { store, lobbies, lobby: () => lobbies.find(l.id), patches, pcob, feed, step, moments, logs, close: () => pcob.close() };
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
    s.pcob.begin();
    await s.step(0);
    assert.equal(s.feed.status.state, 'live');
    assert.equal(s.feed.status.game, 1, 'the first match without results');
    let sawLive = false, sawOut = false;
    for (let t = 0; t < s.pcob.gameEnd + 40; t += 10) {
      await s.step(10);
      const live = s.patches.filter((p) => p.fields.brLive).at(-1)?.fields.brLive;
      if (live && live.teamsAlive < 16) sawLive = true;
      if (live?.lastOut) { sawOut = true; assert.ok(live.lastOut.place > 1 && live.lastOut.place <= 16); }
    }
    assert.ok(sawLive && sawOut, 'teams fall and Team eliminated is set');
    assert.equal(s.feed.status.slots.filter((x) => x.seat).length, 16, 'every PCOB team seated by name');
    const g = s.lobby().games[0]!;
    assert.equal(g.source, 'pcob');
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
    // The next game fills match 2.
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
