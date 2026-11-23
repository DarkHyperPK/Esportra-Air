// A battle royale lobby's show (24 Nov, approved mock 9): what runs by itself once Game data is connected.
//  · Moments over the HUD (`brLive.moment`, raised by src/main/br-live.ts): First blood, Kill leader, Zone closing,
//    Final teams, Match point; Team eliminated is the HUD's own `lastOut`. Each is a switch; all on by default.
//    The live top fraggers band is a switch too, off by default (it stays on screen).
//  · The Rundown: full screens that follow the game (plane takes off, match ends, after the previous one, after the
//    last match), run by src/main/br-autopilot.ts. A new lobby gets Standard, and autopilot is on, so a producer who
//    connects Game data has a whole show without setting anything up. Pure.
import { BR_SCREENS, type BrScreen } from './br-screens.ts';

export const BR_MOMENTS = ['first.blood', 'team.out', 'kill.leader', 'zone', 'final.teams', 'match.point'] as const;
export type BrMomentKind = (typeof BR_MOMENTS)[number];
export const BR_MOMENT_NAME: Record<BrMomentKind, string> = {
  'first.blood': 'First blood', 'team.out': 'Team eliminated', 'kill.leader': 'Kill leader', zone: 'Zone closing', 'final.teams': 'Final teams', 'match.point': 'Match point',
};
export const BR_MOMENT_WHAT: Record<BrMomentKind, string> = {
  'first.blood': 'The first elimination of the match: who, whom and how far.',
  'team.out': 'Each team as it is wiped out: its place, points and the teams left.',
  'kill.leader': 'A new kill leader (five eliminations or more), at most once a minute.',
  zone: 'When a zone starts to close, from the third zone on: the zone and its time.',
  'final.teams': 'When four teams are left, with their tags.',
  'match.point': 'At the start of a match, when a team is on match point.',
};
/** How long a moment stays on the HUD (seconds); the next one waits its turn. */
export const MOMENT_SECONDS = 6;

/** The moment the HUD draws (room field `brLive.moment`). */
export interface BrMomentShown {
  kind: Exclude<BrMomentKind, 'team.out'>;
  at: number; for: number;
  team?: string; causer?: string; victim?: string; distance?: number; name?: string; kills?: number; teams?: string[];
}

/** What a post-game graphic shows: the player (Player profile), the day or one match (Top fraggers, Match stats…). */
export interface BrPick { player?: string; scope: 'match' | 'day'; game?: number }

export const BR_WHEN = ['take', 'plane', 'game.end', 'after', 'day.end'] as const;
export type BrWhen = (typeof BR_WHEN)[number];
export const BR_WHEN_NAME: Record<BrWhen, string> = {
  take: 'When you take it', plane: 'Plane takes off', 'game.end': 'Match ends', after: 'After the previous one', 'day.end': 'After the last match',
};
/** Which matches a row runs on: every one, every one but the last, or only the last. */
export type BrScope = 'every' | 'between' | 'last';
export const BR_SCOPE_NAME: Record<BrScope, string> = { every: 'Every match', between: 'Not after the last', last: 'Only the last' };

export interface BrRow {
  id: string;
  screen: BrScreen;
  when: BrWhen;
  scope: BrScope;
  /** Seconds on screen; 0 stays until the next graphic or a Take. */
  hold: number;
  enabled: boolean;
}
export const BR_PRESETS = ['standard', 'results', 'everything'] as const;
export type BrPreset = (typeof BR_PRESETS)[number];
export const BR_PRESET_NAME: Record<BrPreset, [string, string]> = {
  standard: ['Standard', 'Drop map as the plane takes off; after each match WWCD, results, MVP and standings, then Starting soon for the next.'],
  results: ['Results only', 'After each match WWCD, results and standings. Nothing during the match.'],
  everything: ['Everything', 'Standard plus top fraggers, team of the match and match stats.'],
};

export interface BrShow {
  rows: BrRow[];
  startedFrom: BrPreset;
  /** Off: nothing runs by itself; Live still takes graphics. */
  autopilot: boolean;
  moments: Record<BrMomentKind, boolean>;
  /** The live top fraggers band over the HUD. */
  ltf: boolean;
  pick: BrPick;
}

const row = (id: string, screen: BrScreen, when: BrWhen, hold: number, scope: BrScope = 'every'): BrRow => ({ id, screen, when, scope, hold, enabled: true });

/** The rows a preset starts with, in running order. */
export function presetRows(p: BrPreset): BrRow[] {
  const end = [row('wwcd', 'br-wwcd', 'game.end', 10), row('results', 'br-rankings', 'after', 14)];
  const tail = [row('overall', 'br-overall', 'after', 14), row('next', 'br-lobby', 'after', 0, 'between'), row('champion', 'br-champion', 'day.end', 0, 'last')];
  if (p === 'results') return [...end, row('overall', 'br-overall', 'after', 14)];
  const mid = p === 'everything'
    ? [row('mvp', 'br-mvp', 'after', 10), row('fraggers', 'br-fraggers', 'after', 10), row('tom', 'br-tom', 'after', 10), row('mstats', 'br-mstats', 'after', 12)]
    : [row('mvp', 'br-mvp', 'after', 10)];
  return [row('drop', 'br-drop', 'plane', 12), ...end, ...mid, ...tail];
}

export const ALL_MOMENTS: Record<BrMomentKind, boolean> = Object.fromEntries(BR_MOMENTS.map((k) => [k, true])) as Record<BrMomentKind, boolean>;
export const DEFAULT_SHOW: BrShow = { rows: presetRows('standard'), startedFrom: 'standard', autopilot: true, moments: ALL_MOMENTS, ltf: false, pick: { scope: 'match' } };

/** The lobby's show, with defaults for anything it never set. */
export function showOf(l: { show?: Partial<BrShow> }): BrShow {
  const s = l.show ?? {};
  return {
    rows: s.rows ?? DEFAULT_SHOW.rows, startedFrom: s.startedFrom ?? 'standard', autopilot: s.autopilot ?? true,
    moments: { ...ALL_MOMENTS, ...(s.moments ?? {}) }, ltf: s.ltf ?? false, pick: s.pick ?? DEFAULT_SHOW.pick,
  };
}

const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export function validRows(v: unknown): BrRow[] {
  if (!Array.isArray(v) || v.length > 40) throw new Error('A lobby Rundown has up to 40 rows.');
  const seen = new Set<string>();
  return v.map((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    if (!BR_SCREENS.includes(r.screen as BrScreen)) throw new Error('A Rundown row needs one of the lobby graphics.');
    if (!BR_WHEN.includes(r.when as BrWhen)) throw new Error('Choose when the graphic comes up.');
    let id = typeof r.id === 'string' && /^[a-z0-9-]{1,24}$/.test(r.id) ? r.id : `row-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const scope: BrScope = r.scope === 'between' || r.scope === 'last' ? r.scope : 'every';
    return { id, screen: r.screen as BrScreen, when: r.when as BrWhen, scope, hold: int(r.hold, 0, 600, 10), enabled: r.enabled !== false };
  });
}

export function validPick(v: unknown, games: number): BrPick {
  const x = (v ?? {}) as Record<string, unknown>;
  const pick: BrPick = { scope: x.scope === 'day' ? 'day' : 'match' };
  if (typeof x.player === 'string' && x.player.trim()) pick.player = x.player.trim().slice(0, 40);
  const g = Number(x.game);
  if (Number.isInteger(g) && g >= 1 && g <= games) pick.game = g;
  return pick;
}

/** A partial change to the show from Live or Events; anything not given stays. */
export function patchShow(cur: BrShow, p: Record<string, unknown>, games: number): BrShow {
  const next: BrShow = { ...cur, moments: { ...cur.moments } };
  if (p.preset !== undefined) {
    if (!BR_PRESETS.includes(p.preset as BrPreset)) throw new Error('Choose Standard, Results only or Everything.');
    next.rows = presetRows(p.preset as BrPreset); next.startedFrom = p.preset as BrPreset;
  }
  if (p.rows !== undefined) next.rows = validRows(p.rows);
  if (p.autopilot !== undefined) next.autopilot = p.autopilot === true;
  if (p.ltf !== undefined) next.ltf = p.ltf === true;
  if (p.moments !== undefined) {
    const m = (p.moments ?? {}) as Record<string, unknown>;
    for (const [k, on] of Object.entries(m)) if (BR_MOMENTS.includes(k as BrMomentKind)) next.moments[k as BrMomentKind] = on === true;
  }
  if (p.pick !== undefined) next.pick = validPick(p.pick, games);
  return next;
}

/** What Live shows of the autopilot: the graphic on now and the ones after it. */
export interface BrAutoStatus { running: string | null; next: string[] }

/** Does a row run after match `n` of `total`? */
export const rowRuns = (r: BrRow, n: number, total: number) => r.enabled && (r.scope === 'every' || (r.scope === 'between' ? n < total : n === total));

/**
 * The full screens to run, in order, for a trigger: the rows with that `when`, each followed by the `after` rows
 * below it (until the next row with another `when`). `day.end` runs after the match-end chain of the last match.
 */
export function stepsFor(rows: BrRow[], trigger: Exclude<BrWhen, 'take' | 'after'>, n: number, total: number): BrRow[] {
  const out: BrRow[] = [];
  let on = false;
  for (const r of rows) {
    // A switched-off head row still leads its chain: the rows after it run.
    if (r.when !== 'after') on = r.when === trigger;
    if (on && rowRuns(r, n, total)) out.push(r);
  }
  return out;
}
