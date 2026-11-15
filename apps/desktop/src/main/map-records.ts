// Map records (approved mock, 15 Nov): Air counts each map's kill events as they come (first deaths,
// multi-kills, aces, headshots) and, when the map is counted or closed by hand, keeps that map's final
// data. The post-game graphics read the record the producer picks (`airRecord`), so Breakdown can show
// map 1 while map 2 is live. Production gives it a small context; the record itself is src/shared/map-records.ts.
import type { Match } from '../shared/api.ts';
import { MapTallyCounter, buildRecord, seriesRecord, type MapRecord } from '../shared/map-records.ts';
import type { Store } from './store.ts';

export interface MapRecordsContext {
  store: Store;
  match(): Match | null;
  /** Writes fields into the selected match's room. */
  patch(fields: Record<string, unknown>): Promise<void>;
  save(): void;
  log(text: string): void;
  now(): number;
}

/** Which record the post-game graphics show: a map number, or the whole series. */
export type RecordChoice = number | 'series';
/** The post-game graphics' options: the stats ticked, and the players picked ([team, slot]; null: the top fraggers). */
export interface PostOptions { stats: string[]; player: [number, number] | null; matchup: [[number, number], [number, number]] | null }
export const POST_STATS = ['k', 'd', 'a', 'fk', 'fd', 'kd', 'multi', 'hs', 'adr'] as const;
const slot = (v: unknown): [number, number] | null => (Array.isArray(v) && (v[0] === 0 || v[0] === 1) && Number.isInteger(v[1]) && v[1] >= 0 && v[1] < 5 ? [v[0], v[1]] : null);
const MAX_MAPS = 9;

export class MapRecords {
  private readonly ctx: MapRecordsContext;
  private counter: MapTallyCounter | null = null;
  private counterMatch: string | null = null;

  constructor(ctx: MapRecordsContext) {
    this.ctx = ctx;
  }

  /** A game event from the engine. Counting starts at a map's start; joined mid-map it is marked partial. */
  onEvent(e: Record<string, unknown>) {
    const match = this.ctx.match();
    if (!match) return;
    if (e.type === 'match.start') { this.counter = new MapTallyCounter(false); this.counterMatch = match.id; return; }
    if (e.type !== 'kill' && e.type !== 'round.won') return;
    if (!this.counter || this.counterMatch !== match.id) { this.counter = new MapTallyCounter(true); this.counterMatch = match.id; }
    if (e.type === 'kill') this.counter.kill(e.killer, e.victim, e.hs === true);
    else this.counter.roundEnd();
  }

  list(matchId: string): MapRecord[] {
    return this.ctx.store.data.mapRecords?.[matchId] ?? [];
  }

  /** Keeps a map's final data. A map recorded again (a recount) replaces its record. */
  async close(match: Match, state: unknown, map: number, scores: [number, number], winner: 0 | 1 | -1, how: MapRecord['how']) {
    const tally = this.counterMatch === match.id ? this.counter?.tally ?? null : null;
    const record = buildRecord(state, map, scores, winner, how, tally, this.ctx.now());
    const all = (this.ctx.store.data.mapRecords ??= {});
    all[match.id] = [...this.list(match.id).filter((r) => r.map !== map), record].sort((a, b) => a.map - b.map).slice(0, MAX_MAPS);
    (this.ctx.store.data.recordShown ??= {})[match.id] = map;
    this.counter = null;
    this.ctx.save();
    this.ctx.log(`Map ${map} record kept${record.partial ? ' · Air joined mid-map, so multi-kills and first deaths are not shown' : ''}`);
    await this.publish();
    return record;
  }

  /** Keeps the map being played as the room has it, without counting it (the game did not end it properly). */
  async closeCurrent(match: Match, state: any) {
    const wins = [0, 1].map((i) => Number(state?.teams?.[i]?.series) || 0);
    const scores = [0, 1].map((i) => Number(state?.teams?.[i]?.score) || 0) as [number, number];
    const map = Math.min(wins[0]! + wins[1]! + 1, match.bestOf);
    return this.close(match, state, map, scores, scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1, 'closed');
  }

  /** The record the post-game graphics show. */
  async show(choice: RecordChoice) {
    const match = this.ctx.match();
    if (!match) throw new Error('Choose a match first.');
    if (choice !== 'series' && !this.list(match.id).some((r) => r.map === choice)) throw new Error(`Map ${choice} has no record yet.`);
    if (choice === 'series' && !this.list(match.id).length) throw new Error('No map has a record yet.');
    (this.ctx.store.data.recordShown ??= {})[match.id] = choice;
    this.ctx.save();
    await this.publish();
  }

  /** Removes a map's record (a map closed by mistake). */
  async remove(map: number) {
    const match = this.ctx.match();
    if (!match) throw new Error('Choose a match first.');
    const all = (this.ctx.store.data.mapRecords ??= {});
    all[match.id] = this.list(match.id).filter((r) => r.map !== map);
    const shown = this.ctx.store.data.recordShown?.[match.id];
    if (shown === map) delete this.ctx.store.data.recordShown![match.id];
    this.ctx.save();
    this.ctx.log(`Map ${map} record removed`);
    await this.publish();
  }

  /** The record the post-game graphics show (the latest map when none is chosen). */
  shown(match: Match) {
    const list = this.list(match.id);
    const choice = this.ctx.store.data.recordShown?.[match.id];
    return choice === 'series' ? seriesRecord(list) : list.find((r) => r.map === choice) ?? list[list.length - 1] ?? null;
  }

  options(matchId: string): PostOptions {
    return this.ctx.store.data.postOptions?.[matchId] ?? { stats: ['k', 'd', 'a', 'fk', 'kd'], player: null, matchup: null };
  }

  /** The stats ticked for Post-game player and matchup, and the players they show. */
  async setOptions(input: Partial<PostOptions>) {
    const match = this.ctx.match();
    if (!match) throw new Error('Choose a match first.');
    const now = this.options(match.id);
    const next: PostOptions = {
      stats: input.stats !== undefined ? [...new Set((Array.isArray(input.stats) ? input.stats : []).filter((k) => (POST_STATS as readonly string[]).includes(k)))].slice(0, 6) : now.stats,
      player: input.player !== undefined ? slot(input.player) : now.player,
      matchup: input.matchup !== undefined ? (Array.isArray(input.matchup) && slot(input.matchup[0]) && slot(input.matchup[1]) ? [slot(input.matchup[0])!, slot(input.matchup[1])!] : null) : now.matchup,
    };
    if (input.stats !== undefined && !next.stats.length) throw new Error('Tick at least one stat.');
    (this.ctx.store.data.postOptions ??= {})[match.id] = next;
    this.ctx.save();
    await this.publish();
  }

  /** The room fields: the chosen record, the list of maps kept, and the post-game options. */
  room(): Record<string, unknown> | null {
    const match = this.ctx.match();
    if (!match) return null;
    const list = this.list(match.id);
    const o = this.options(match.id);
    return { airRecord: this.shown(match), airRecords: list.map((r) => ({ map: r.map, name: r.name, score: r.score, winner: r.winner })), airPostStats: o.stats, airPostPlayer: o.player, airMatchup: o.matchup };
  }

  view(match: Match | null) {
    if (!match) return null;
    const list = this.list(match.id);
    return { maps: list.map((r) => ({ map: r.map, name: r.name, score: r.score, winner: r.winner, how: r.how, partial: r.partial })), shown: this.ctx.store.data.recordShown?.[match.id] ?? (list.length ? list[list.length - 1]!.map : null), record: this.shown(match), options: this.options(match.id) };
  }

  async publish() {
    const fields = this.room();
    if (fields) await this.ctx.patch(fields);
  }
}
