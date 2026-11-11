// Rehearse: a short scripted show in a private engine room (`__ESA_SIM_REH_<code>`, never saved, never
// an OBS output). The room is seeded with the match's teams, players, photos and banner style; the
// sample game's players are mapped to the match's own players, so every graphic shows the real names.
// The match's autopilot steps run against it, so the producer sees what will fire and when.

import { EventEmitter } from 'node:events';
import type { Match, Screen } from '../shared/api.ts';
import { BEATS, SAMPLE_GAME_NAMES, SPEEDS, type RehearsalOptions, type RehearsalSpeed, type RehearsalView } from '../shared/rehearsal.ts';
import { Autopilot } from './autopilot/autopilot.ts';
import type { Clock, RunnerLog } from './autopilot/show-runner.ts';
import type { EngineClient } from './engine-client.ts';
import { EventLog } from './event-log.ts';
import type { Store } from './store.ts';

export interface RehearsalDeps {
  client(): EngineClient;
  store: Store;
  match(): Match | null;
  screens(): Screen[];
  /** Puts the sample match, dressed as this match, into the room. */
  seed(room: string): Promise<void>;
  /** True while real game data is flowing: rehearsing then would only confuse. */
  feedLive(): boolean;
  changed(): void;
}

type Msg = Record<string, unknown>;
const info = (key: string, value: string): Msg => ({ info: { match_info: { [key]: value } }, feature: 'match_info' });
const event = (name: string): Msg => ({ events: [{ name, data: '' }] });
const score = (a: number, b: number) => info('match_score', JSON.stringify({ team_0: a, team_1: b }));

/** The sample game's players, known by the match's own names and photos. */
export function rehearsalRoster(match: Match) {
  return SAMPLE_GAME_NAMES.map((names, t) => names.map((gameName, i) => {
    const p = match.players[t]?.[i];
    return { gameId: gameName.replace(/\s+/g, ''), name: p?.name ?? '', photo: p?.photo ?? '' };
  }));
}

/** Timers run `speed` times faster, so hold windows and timed graphics keep pace with the script. */
const scaledClock = (speed: number): Clock => ({
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const h = setTimeout(fn, ms / speed);
    h.unref?.();
    return h;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

export class Rehearsal extends EventEmitter {
  private readonly deps: RehearsalDeps;
  private running = false;
  private beat = -1;
  private epoch = 0;
  private room: string | null = null;
  private options: RehearsalOptions = { speed: 2, autopilot: true, handsFree: true };
  private autopilot: Autopilot | null = null;
  private showing: string | null = null;
  private handsFreeTimer: ReturnType<typeof setTimeout> | null = null;
  private lines: RehearsalView['log'] = [];
  private error: string | null = null;
  private readonly events: EventLog;

  constructor(deps: RehearsalDeps) {
    super();
    this.deps = deps;
    this.events = new EventLog({ nameOf: () => '', onChange: () => {}, onEvent: (e) => this.autopilot?.onGameEvent(e) });
  }

  view(): RehearsalView {
    return {
      running: this.running, beat: this.beat, speed: this.options.speed, autopilotOn: this.options.autopilot, handsFree: this.options.handsFree,
      room: this.room, autopilot: this.autopilot ? this.autopilot.view() : null, log: this.lines.slice(0, 40), error: this.error,
    };
  }

  private add(text: string) {
    this.lines = [{ t: Date.now(), beat: this.beat, text }, ...this.lines].slice(0, 80);
    this.deps.changed();
  }

  async start(input: Partial<RehearsalOptions> = {}) {
    const match = this.deps.match();
    if (!match) throw new Error('Choose a match first.');
    if (this.deps.feedLive()) throw new Error('Game data is live. Rehearse before the match, or stop capture first.');
    const speed = (SPEEDS as readonly number[]).includes(Number(input.speed)) ? (Number(input.speed) as RehearsalSpeed) : this.options.speed;
    this.stop();
    const epoch = ++this.epoch;
    this.options = { speed, autopilot: input.autopilot ?? this.options.autopilot, handsFree: input.handsFree ?? this.options.handsFree };
    this.room = `__ESA_SIM_REH_${match.code}`;
    this.running = true;
    this.beat = -1;
    this.lines = [];
    this.error = null;
    this.showing = null;
    const client = this.deps.client();
    await this.deps.seed(this.room);
    await client.patch(`/api/${this.room}`, { airRoster: rehearsalRoster(match), airFullscreen: null });
    this.events.target(client.observeUrl(this.room));
    if (this.options.autopilot) this.startAutopilot(this.room, speed);
    this.deps.changed();
    void this.script(epoch).catch((e) => {
      if (epoch !== this.epoch) return;
      this.error = (e as Error).message;
      this.finish();
    });
  }

  private startAutopilot(room: string, speed: RehearsalSpeed) {
    const client = this.deps.client();
    const act = (name: string, args: Record<string, unknown>) => client.post('/control/action', { match: room, name, args });
    const ap = new Autopilot({
      store: this.deps.store, match: () => this.deps.match(), screens: () => this.deps.screens(), clock: scaledClock(speed), persist: false,
      showGraphic: async (id, transition) => {
        if (transition === 'stinger') {
          await act('stinger.play', {});
          await new Promise((r) => setTimeout(r, 450 / speed));
        }
        await act('fullscreen.show', { screen: id });
        this.showing = id;
      },
      showing: () => this.showing,
      log: (line) => this.add(line),
      changed: () => this.deps.changed(),
    });
    // Hands-free: a step that waits for Take is taken after three (scaled) seconds.
    ap.runner.on('log', (entry: RunnerLog) => {
      const seg = entry.segment;
      if (entry.kind !== 'armed' || !seg || !this.options.handsFree) return;
      if (seg.mode !== 'manual' && seg.trigger !== 'manual') return;
      if (this.handsFreeTimer) clearTimeout(this.handsFreeTimer);
      this.handsFreeTimer = setTimeout(() => {
        this.handsFreeTimer = null;
        if (this.autopilot === ap && ap.view().next?.id === seg.id) void ap.take().catch(() => {});
      }, 3000 / speed);
      this.handsFreeTimer.unref?.();
    });
    ap.loadForMatch();
    ap.start();
    this.autopilot = ap;
  }

  /** Takes the step autopilot is waiting on (the rehearsal's own Take). */
  async take() {
    if (!this.autopilot) throw new Error('Autopilot is not part of this rehearsal.');
    await this.autopilot.take();
  }

  stop() {
    const wasRunning = this.running;
    this.epoch++;
    if (this.room && wasRunning) void this.deps.client().post('/control/test-round', { match: this.room, action: 'stop' }).catch(() => {});
    this.finish();
    if (wasRunning) this.add('Rehearsal stopped');
  }

  private finish() {
    this.running = false;
    if (this.handsFreeTimer) clearTimeout(this.handsFreeTimer);
    this.handsFreeTimer = null;
    this.autopilot?.stopAll();
    this.events.target(null);
    this.deps.changed();
  }

  // ── the show ──

  private async script(epoch: number) {
    const match = this.deps.match()!;
    const room = this.room!;
    const client = this.deps.client();
    const speed = this.options.speed;
    const live = () => epoch === this.epoch;
    const wait = async (ms: number) => {
      await new Promise((r) => setTimeout(r, ms / speed));
      if (!live()) throw new Error('stopped');
    };
    const ingest = (messages: Msg[]) => client.post(`/api/${room}/ingest/valorant`, messages);
    const beat = (i: number) => {
      this.beat = i;
      this.add(BEATS[i]!.label);
    };
    try {
      // The observe connection must be open before the first event.
      await wait(600 * speed);
      beat(0);
      await ingest([event('match_start'), score(0, 0), info('round_number', '1')]);
      await wait(7000);

      beat(1);
      await client.post('/control/test-round', { match: room, action: 'start', speed });
      const until = Date.now() + 120_000;
      await wait(1000);
      while (Date.now() < until) {
        const status = await client.get<{ rooms?: Array<{ match: string; testRound?: { running?: boolean } }> }>('/control/status');
        if (!status.rooms?.find((r) => r.match === room)?.testRound?.running) break;
        await wait(500 * speed);
      }

      // The test round restores the room afterwards; the rest of the map is played as scores.
      beat(2);
      for (let r = 1; r <= 12; r++) {
        await ingest([info('round_number', String(r)), score(Math.ceil(r / 2), Math.floor(r / 2))]);
        await wait(250);
      }
      await wait(22_000);

      beat(3);
      await ingest([info('round_number', '13'), info('round_phase', 'shopping')]);
      await wait(1500);
      await ingest([info('round_phase', 'combat')]);
      const second = [0, 1, 0, 0, 1, 0, 1, 0, 0, 0];
      let a = 6;
      let b = 6;
      for (const [i, winner] of second.entries()) {
        if (winner === 0) a++;
        else b++;
        await ingest([info('round_number', String(13 + i)), score(a, b)]);
        await wait(400);
      }
      await wait(2000);

      beat(4);
      await ingest([event('match_end')]);
      await wait(14_000);

      beat(5);
      await wait(match.bestOf > 1 ? 20_000 : 9_000);
      this.beat = BEATS.length;
      this.add('Rehearsal finished');
    } catch (e) {
      if ((e as Error).message === 'stopped' || !live()) return;
      throw e;
    }
    this.finish();
  }
}
