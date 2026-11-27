// Shared set-up for the run sheet tests (27 Nov): a store, lobbies, the run sheet and the observer feed wired together
// as src/main/production.ts wires them, against the stand-in PCOB (dev/fake-pcob.ts) with a stepped clock.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store.ts';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { BrLiveFeed, type BrMoment } from '../src/main/br-live.ts';
import { BrRun } from '../src/main/br-run.ts';
import { EventJournal } from '../src/main/event-journal.ts';
import { gameState } from '../src/shared/br.ts';
import { targetMatch } from '../src/shared/br-run.ts';
import { FakePcob } from '../dev/fake-pcob.ts';

const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
export const tag = (i: number) => `T${String(i).padStart(2, '0')}`;
export const roster = (i: number) => ['ACE', 'ROOK', 'VEX', 'KAI'].map((p) => `${tag(i)}_${p}`);

export async function kit(opts: { teams?: number; games?: number; length?: number; generic?: boolean; dir?: string } = {}) {
  const n = opts.teams ?? 16;
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'brkit-'));
  const names = NAMES.slice(0, n);
  let now = 1_000_000;
  let frozen: number | null = null;
  const store = new Store(join(dir, 'air.json'));
  store.data.events = [{ id: 'ev', name: 'Cup', stages: [], logo: '', logoLight: '', accent: '#ffb60e', talent: [], sponsors: [], tournamentId: null }];
  store.data.teams = names.map((name, i) => ({ id: `t${i}`, name, tag: tag(i), color: '#ffffff', logo: '' }));
  store.data.players = names.flatMap((_, i) => roster(i).map((p, k) => ({ id: `p${i}-${k}`, name: p, realName: '', gameId: p, photo: '', role: '', teamId: `t${i}` })));
  const patches: Array<{ code: string; fields: any }> = [];
  const logs: string[] = [];
  const journal = new EventJournal(join(dir, 'events'), () => now);
  let busyLive = false;
  const lobbies = new Lobbies({ store, journal, patch: async (code, fields) => void patches.push({ code, fields }), live: () => busyLive, log: (t) => logs.push(t), changed: () => {} });
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', title: 'Group A', games: opts.games ?? 3, maps: ['Erangel', 'Miramar', 'Sanhok'] });
  lobbies.setTeams(l.id, names.map((_, i) => `t${i}`));
  const pcob = await new FakePcob({ teams: names.map((name, i) => ({ name, players: roster(i) })), genericNames: opts.generic ?? false, length: opts.length ?? 900, now: () => frozen ?? now }).listen();
  const moments: Array<[BrMoment, Record<string, unknown>]> = [];
  let run!: BrRun;
  const feed = new BrLiveFeed({
    lobby: () => lobbies.selected, patch: async (code, fields) => void patches.push({ code, fields }),
    save: (id, g, results, f, extra) => lobbies.saveFeed(id, g, results, f, extra), learn: (id, seen) => lobbies.learnOpenIds(id, seen),
    target: (lob) => { const g = targetMatch(lob); return g ? { n: g.n, state: gameState(g) } : null; },
    state: (id, g, to, at) => run.onFeedState(id, g, to, at), checkpoint: (cp) => run.checkpoint(cp),
    event: (name, d) => void moments.push([name, d]), log: (t) => logs.push(t), changed: () => {}, now: () => now, manual: true,
  });
  run = new BrRun({ lobbies, store, feed, journal, pcob: () => feed.status, log: (t) => logs.push(t), changed: () => {}, now: () => now });
  /** Air closed and opened again on the same data: new objects over the saved files, the same PCOB and clock. */
  const restart = () => {
    const store2 = new Store(join(dir, 'air.json'));
    const journal2 = new EventJournal(join(dir, 'events'), () => now);
    const lobbies2 = new Lobbies({ store: store2, journal: journal2, patch: async (code, fields) => void patches.push({ code, fields }), live: () => false, log: (t) => logs.push(t), changed: () => {} });
    const moments2: Array<[BrMoment, Record<string, unknown>]> = [];
    let run2!: BrRun;
    const feed2 = new BrLiveFeed({
      lobby: () => lobbies2.selected, patch: async (code, fields) => void patches.push({ code, fields }),
      save: (id, g, results, f, extra) => lobbies2.saveFeed(id, g, results, f, extra), learn: (id, seen) => lobbies2.learnOpenIds(id, seen),
      target: (lob) => { const g = targetMatch(lob); return g ? { n: g.n, state: gameState(g) } : null; },
      state: (id, g, to, at) => run2.onFeedState(id, g, to, at), checkpoint: (cp) => run2.checkpoint(cp),
      event: (name, d) => void moments2.push([name, d]), log: (t) => logs.push(t), changed: () => {}, now: () => now, manual: true,
    });
    run2 = new BrRun({ lobbies: lobbies2, store: store2, feed: feed2, journal: journal2, pcob: () => feed2.status, log: (t) => logs.push(t), changed: () => {}, now: () => now });
    return {
      store: store2, lobbies: lobbies2, run: run2, feed: feed2, moments: moments2, game: (k: number) => lobbies2.find(l.id).games.find((g) => g.n === k)!,
      step: async (seconds: number) => { now += seconds * 1000; await feed2.tick(); },
      connect: () => feed2.connect(`127.0.0.1:${pcob.port}`, true),
    };
  };
  const lobby = () => lobbies.find(l.id);
  const game = (k: number) => lobby().games.find((g) => g.n === k)!;
  const step = async (seconds: number) => { now += seconds * 1000; await feed.tick(); };
  /** Plays the stand-in game to its end (and past the settle time). */
  const playOut = async () => { for (let t = 0; t < pcob.gameEnd + 40; t += 2) await step(2); };
  const connect = () => feed.connect(`127.0.0.1:${pcob.port}`, true);
  return { restart, store, lobbies, run, feed, pcob, journal, patches, logs, moments, lobbyId: l.id, lobby, game, step, playOut, connect, names, dir, clock: () => now, advance: (sec: number) => { now += sec * 1000; }, freeze: (v: boolean) => { frozen = v ? now : null; }, setBusy: (v: boolean) => { busyLive = v; }, close: () => pcob.close() };
}
export type Kit = Awaited<ReturnType<typeof kit>>;
