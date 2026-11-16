// Match data (15 Nov): what a producer prepares or edits in Air before and during the show: the map
// veto and the maps it makes, Starting soon / Break / Ending text, the champion, the event's standings,
// ticker and bracket, and what each player has done before (Player profile, pre-match matchup).
// Production gives it a small context; the model, checks and room fields are in src/shared/match-data.ts.
import type { Match } from '../shared/api.ts';
import {
  emptyEventData, emptyMatchData, emptyPrep, nextVetoStep, roomFields, validEventData, validMatchData, validPrep, validVeto,
  type EventData, type MatchData, type PlayerPrep, type VetoOrderStep, type VetoStep,
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

  /** The next veto step, entered as the teams make it: it goes on air at once. The veto is then this PC's own. */
  async vetoStep(input: { map: string; side?: 'ATK' | 'DEF' }) {
    const match = this.requireMatch();
    const data = this.of(match);
    const next = nextVetoStep(data.veto, match.bestOf, data.vetoOrder, data.vetoFirst);
    if (!next) throw new Error('The veto is complete.');
    const step = { team: next.team, action: next.action, map: input?.map, ...(input?.side ? { side: input.side } : {}) };
    const veto = validVeto([...data.veto, step], match.bestOf, data.mapPool, data.vetoOrder);
    await this.save({ ...data, veto, vetoSource: 'air' });
    const last = veto.at(-1)!;
    this.ctx.log(`Veto · ${last.action === 'decider' ? 'Decider' : `${match.teams[last.team as 0 | 1]?.tag ?? 'Team'} ${last.action}s`} ${last.map}`);
  }

  /** Who acts first in the usual order. With steps entered already, the teams of every step swap with it. */
  async vetoFirst(team: 0 | 1) {
    const match = this.requireMatch();
    const data = this.of(match);
    if (team !== 0 && team !== 1) throw new Error('Choose the team that starts the veto.');
    if (data.vetoFirst === team && !data.veto.length) return;
    const flip = data.veto.length && (data.veto[0]!.team === 0 || data.veto[0]!.team === 1) && data.veto[0]!.team !== team;
    const other = (t: number) => (t === 0 ? 1 : t === 1 ? 0 : t);
    const veto = flip ? data.veto.map((v) => ({ ...v, team: other(v.team) as VetoStep['team'], ...(v.sideTeam !== undefined ? { sideTeam: other(v.sideTeam) as 0 | 1 } : {}) })) : data.veto;
    await this.save({ ...data, veto, vetoFirst: team, vetoSource: 'air' });
    this.ctx.log(`Veto · ${match.teams[team]?.tag || match.teams[team]?.name || 'Team'} starts`);
  }

  /** A coin toss for who starts the veto. */
  async vetoToss(random: () => number = Math.random): Promise<0 | 1> {
    const team = (random() < 0.5 ? 0 : 1) as 0 | 1;
    const match = this.requireMatch();
    this.ctx.log(`Coin toss · ${match.teams[team]?.tag || match.teams[team]?.name || 'Team'} wins`);
    await this.vetoFirst(team);
    return team;
  }

  /** Changes one step already entered: its map, side, and which team chose the side. */
  async vetoEdit(index: number, input: { map?: string; side?: 'ATK' | 'DEF' | null; sideTeam?: 0 | 1 | null }) {
    const match = this.requireMatch();
    const data = this.of(match);
    const step = data.veto[index];
    if (!Number.isInteger(index) || !step) throw new Error('That step is not in the veto yet.');
    const next: Record<string, unknown> = { ...step, ...(input?.map ? { map: input.map } : {}) };
    if (input?.side !== undefined) { if (input.side) next.side = input.side; else { delete next.side; delete next.sideTeam; } }
    if (input?.sideTeam !== undefined) { if (input.sideTeam === null) delete next.sideTeam; else next.sideTeam = input.sideTeam; }
    const veto = validVeto(data.veto.map((v, i) => (i === index ? next : v)), match.bestOf, data.mapPool, data.vetoOrder);
    await this.save({ ...data, veto, vetoSource: 'air' });
  }

  async vetoUndo() {
    const match = this.requireMatch();
    const data = this.of(match);
    if (!data.veto.length) throw new Error('The veto is empty.');
    await this.save({ ...data, veto: data.veto.slice(0, -1), vetoSource: 'air' });
  }

  /** The match's veto as Esportra has it, replacing what is here (the caller decides whether it may). */
  async setVeto(veto: VetoStep[], mapPool?: string[], vetoOrder?: VetoOrderStep[] | null) {
    const match = this.requireMatch();
    const data = this.of(match);
    await this.save({ ...data, ...(mapPool?.length ? { mapPool } : {}), ...(vetoOrder !== undefined ? { vetoOrder } : {}), veto, vetoSource: 'esportra' });
  }

  /** Hands the veto back to Esportra: the next poll replaces what was entered here. */
  async followEsportra() {
    const match = this.requireMatch();
    if (!match.source?.matchId) throw new Error('This match is not from Esportra.');
    const data = this.of(match);
    (this.ctx.store.data.matchData ??= {})[match.id] = { ...data, vetoSource: 'esportra' };
    this.ctx.save();
    this.ctx.log('Veto · following Esportra again');
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
