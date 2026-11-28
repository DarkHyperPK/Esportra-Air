// A lobby's format (28 Nov, approved mock "Format"): the match generator (how many matches, when the first starts, the
// gap, the map rotation), the points table and its tiebreak order. Pure; src/main/br-format.ts applies it to a lobby.
import { SCORING_PRESETS, type SavedPointsTable, type Scoring } from './br.ts';

export interface FormatSpec { count: number; /** HH:MM of the first match. */ start: string; /** Minutes between the starts of two matches. */ gap: number; /** The maps in rotation order (they repeat). May be empty: no map yet. */ maps: string[] }
export interface Slot { time: string; map: string }

const hhmm = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;
export const parseTime = (t: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim()); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null; };

export function validSpec(input: unknown): FormatSpec {
  const s = (input ?? {}) as Record<string, unknown>;
  const count = Number(s.count), gap = Number(s.gap);
  if (!Number.isInteger(count) || count < 1 || count > 24) throw new Error('A day has 1 to 24 matches.');
  if (parseTime(String(s.start ?? '')) === null) throw new Error('Write the first match’s start as a time, like 16:00.');
  if (!Number.isInteger(gap) || gap < 0 || gap > 600) throw new Error('The gap between matches is 0 to 600 minutes.');
  const maps = Array.isArray(s.maps) ? s.maps.map((m) => String(m).replace(/[<>]/g, '').trim().slice(0, 30)).filter(Boolean) : [];
  if (maps.length > 12) throw new Error('A rotation has up to 12 maps.');
  return { count, start: hhmm(parseTime(String(s.start))!), gap, maps };
}

/** The start time and map of each match: times step by the gap, maps repeat in rotation order. */
export function slotsOf(spec: FormatSpec): Slot[] {
  const t0 = parseTime(spec.start) ?? 0;
  return Array.from({ length: spec.count }, (_, i) => ({ time: hhmm(t0 + i * spec.gap), map: spec.maps.length ? spec.maps[i % spec.maps.length]! : '' }));
}

/** "Group A" → "Group B", "Group 1 · Day 2" → "Group 2 · Day 2"; otherwise "… (copy)". */
export function nextTitle(title: string): string {
  const t = title.trim();
  const m = /^(.*?\b(?:group|lobby|pool|pod)\s+)([A-Ya-y]|\d{1,2})\b(.*)$/i.exec(t);
  if (m) {
    const c = m[2]!;
    const next = /\d/.test(c) ? String(Number(c) + 1) : String.fromCharCode(c.charCodeAt(0) + 1);
    return `${m[1]}${next}${m[3]}`.slice(0, 60);
  }
  return `${t} (copy)`.slice(0, 60);
}

// ── points tables ──

/** Places that have no points set, up to the number of teams: 9 to 16 when 16 teams play and the table lists 8. */
export function tableGap(s: Scoring, teams: number): { from: number; to: number } | null {
  return teams > s.placement.length ? { from: s.placement.length + 1, to: teams } : null;
}
/** A table's name for people: the saved one or the preset it equals, else its numbers. */
export function tableName(s: Scoring, saved: SavedPointsTable[] = []): string {
  const same = (a: Scoring, b: Scoring) => JSON.stringify([a.placement, a.perElim, a.elimCap ?? null, a.matchPoint ?? null, a.tiebreak]) === JSON.stringify([b.placement, b.perElim, b.elimCap ?? null, b.matchPoint ?? null, b.tiebreak]);
  const mine = saved.find((t) => same(t.scoring, s));
  if (mine) return mine.name;
  const preset = Object.values(SCORING_PRESETS).find((p) => same(p.scoring, s));
  if (preset) return preset.name;
  return `${s.placement.slice(0, 3).join('-')}… + ${s.perElim}/kill`;
}
export function validTableName(v: unknown, saved: SavedPointsTable[], keepId?: string): string {
  const name = typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, 40) : '';
  if (!name) throw new Error('Name the points table.');
  if (saved.some((t) => t.id !== keepId && t.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is already a points table called ${name}.`);
  return name;
}
