// Match data (15 Nov): what a producer prepares or edits in Air before and during the show: the map
// veto and the maps it makes, Starting soon / Break / Ending text, the champion, the event's standings,
// ticker and bracket, and what each player has done before (Player profile, pre-match matchup).
// Production gives it a small context; the model, checks and room fields are in src/shared/match-data.ts.
import type { Match } from '../shared/api.ts';
import {
  emptyEventData, emptyMatchData, emptyPrep, nextVetoStep, roomFields, validEventData, validMatchData, validPrep, validVeto,
  type EventData, type MatchData, type PlayerPrep, type VetoStep,
} from '../shared/match-data.ts';
import type { Store } from './store.ts';

export interface MatchDataContext {
  store: Store;
  match(): Match | null;
  /** The selected match's event id, or null. */
  eventId(): string | null;
  /** How far the series is in the room: maps played and whether a team has won it. */
  progress(): { mapsPlayed: number; seriesWon: boolean };
  save(): void;
  /** Writes fields into the selected match's room. */
  patch(fields: Record<string, unknown>): Promise<void>;
  log(text: string): void;
}

export class MatchDataService {
  private readonly ctx: MatchDataContext;

  constructor(ctx: MatchDataContext) {
    this.ctx = ctx;
  }

  /** A match's data; a match without any yet gets the defaults (and a veto that no longer fits its best-of is dropped). */
  of(match: Match): MatchData {
    const saved = this.ctx.store.data.matchData?.[match.id];
    if (!saved) return emptyMatchData();
    try {
      return validMatchData(saved, match.bestOf);
    } catch {
      return { ...emptyMatchData(), ...saved, veto: [] } as MatchData;
    }
  }

  eventData(eventId: string | null): EventData {
    const saved = eventId ? this.ctx.store.data.eventData?.[eventId] : undefined;
    if (!saved) return emptyEventData();
    try { return validEventData(saved); } catch { return emptyEventData(); }
  }

  prep(playerId: string): PlayerPrep {
    return this.ctx.store.data.playerPrep?.[playerId] ?? emptyPrep();
  }

  /** The room fields of the selected match. */
  room(): Record<string, unknown> | null {
    const match = this.ctx.match();
    return match ? roomFields(this.of(match), this.eventData(this.ctx.eventId()), this.ctx.progress()) : null;
  }

  /** Sends the selected match's data to its room. */
  async publish() {
    const fields = this.room();
    if (fields) await this.ctx.patch(fields);
  }

  private requireMatch() {
    const match = this.ctx.match();
    if (!match) throw new Error('Choose a match first.');
    return match;
  }

  async save(input: unknown) {
    const match = this.requireMatch();
    const data = validMatchData(input, match.bestOf);
    (this.ctx.store.data.matchData ??= {})[match.id] = data;
    this.ctx.save();
    await this.publish();
  }

  /** The next veto step, entered as the teams make it: it goes on air at once. */
  async vetoStep(input: { map: string; side?: 'ATK' | 'DEF' }) {
    const match = this.requireMatch();
    const data = this.of(match);
    const next = nextVetoStep(data.veto, match.bestOf);
    if (!next) throw new Error('The veto is complete.');
    const step = { team: next.team, action: next.action, map: input?.map, ...(input?.side ? { side: input.side } : {}) };
    const veto = validVeto([...data.veto, step], match.bestOf, data.mapPool);
    await this.save({ ...data, veto });
    const last = veto.at(-1)!;
    this.ctx.log(`Veto · ${last.action === 'decider' ? 'Decider' : `${match.teams[last.team as 0 | 1]?.tag ?? 'Team'} ${last.action}s`} ${last.map}`);
  }

  async vetoUndo() {
    const match = this.requireMatch();
    const data = this.of(match);
    if (!data.veto.length) throw new Error('The veto is empty.');
    await this.save({ ...data, veto: data.veto.slice(0, -1) });
  }

  /** The match's veto from elsewhere (Esportra), replacing what was entered here. */
  async setVeto(veto: VetoStep[], mapPool?: string[]) {
    const match = this.requireMatch();
    const data = this.of(match);
    await this.save({ ...data, ...(mapPool?.length ? { mapPool } : {}), veto });
  }

  async saveEvent(eventId: string, input: unknown) {
    if (!this.ctx.store.data.events.some((e) => e.id === eventId)) throw new Error('That event is no longer available.');
    (this.ctx.store.data.eventData ??= {})[eventId] = validEventData(input);
    this.ctx.save();
    if (this.ctx.eventId() === eventId) await this.publish();
  }

  async savePrep(playerId: string, input: unknown) {
    if (!(this.ctx.store.data.players ?? []).some((p) => p.id === playerId)) throw new Error('That player is no longer in Teams/Players.');
    (this.ctx.store.data.playerPrep ??= {})[playerId] = validPrep(input);
    this.ctx.save();
  }

  /** A best-of change: the veto is kept only while it still fits. */
  bestOfChanged(match: Match) {
    const saved = this.ctx.store.data.matchData?.[match.id];
    if (!saved) return;
    try {
      validMatchData(saved, match.bestOf);
    } catch {
      saved.veto = [];
      this.ctx.log('Veto cleared · it no longer fits the best-of');
    }
  }

  /** What Player profile shows for a lineup player: their prep, as the HUD reads it (`spotlight.season`, `quote`). */
  spotlightFields(libraryId: string | undefined) {
    const p = libraryId ? this.prep(libraryId) : emptyPrep();
    const dash = (v: unknown) => (v === null || v === '' ? '—' : v);
    return { season: { maps: dash(p.maps), rating: dash(p.rating), kpr: dash(p.kpr), acs: dash(p.acs), hs: dash(p.hs), clutches: dash(p.clutches) }, quote: p.quote };
  }
}
