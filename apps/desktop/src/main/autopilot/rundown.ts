// The rundown for a match: rows the producer builds from the screens in My show, each with its own
// rule (when, which map, how long, cut or stinger, hold). Rows expand into the steps ShowRunner walks
// through: an "every map" row once per map, a map-number row on that map, an "after the series" row
// at the end. In-round graphics (economy, recap, spike timer, callouts) are the engine's Auto layers
// and are not rows here.

import { PRESETS, WHEN, type Preset, type RowInput, type RundownRow, type Segment, type SegmentEdit } from '../../shared/autopilot.ts';

export interface SavedRundown {
  rows: RundownRow[];
  /** The starting point last chosen (Standard, Results only, Manual or Empty). */
  startedFrom: Preset;
}

/** Saves from before rows existed: the old template with per-step edits and order. */
interface LegacyEdits {
  order?: string[];
  edits?: Record<string, SegmentEdit>;
  preset?: Exclude<Preset, 'empty'>;
}

const FULLSCREEN_IDS = new Set(['match-intro', 'map-veto', 'agent-select', 'map-result', 'series', 'halftime', 'standings', 'player-profile', 'champion', 'cam-grid']);

const TITLE: Record<string, string> = { 'match-intro': 'Match intro', 'map-veto': 'Map veto', 'agent-select': 'Agent select', 'map-result': 'Map result', series: 'Series', halftime: 'Halftime', standings: 'Standings', 'player-profile': 'Player profile', champion: 'Champion', 'cam-grid': 'Player cams' };
export const screenTitle = (id: string | null) => (id === null ? 'Back to the game' : TITLE[id] ?? id);

const row = (r: Partial<RundownRow> & Pick<RundownRow, 'id' | 'show' | 'trigger' | 'map'>): RundownRow => ({
  forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'window', holdSeconds: 3, enabled: true, ...r,
});

/** Standard show: intro, then on every map back to the game, halftime, result and series, then the champion. */
function standard(bestOf: 1 | 3 | 5): RundownRow[] {
  return [
    row({ id: 'intro', show: 'match-intro', trigger: 'manual', map: 1, holdMode: 'manual' }),
    row({ id: 'live', show: null, trigger: 'round_live', map: 'every', transition: 'cut' }),
    row({ id: 'half', show: 'halftime', trigger: 'halftime', map: 'every', forSeconds: 15 }),
    row({ id: 'result', show: 'map-result', trigger: 'map_end', map: 'every', holdSeconds: 5 }),
    ...(bestOf > 1 ? [row({ id: 'series', show: 'series', trigger: 'delay', map: 'every' })] : []),
    row({ id: 'champion', show: 'champion', trigger: 'manual', map: 'series', holdMode: 'manual' }),
  ];
}

/** The rows a starting point gives. Results only keeps the map result and the return to the game automatic. */
export function presetRows(preset: Preset, bestOf: 1 | 3 | 5): RundownRow[] {
  if (preset === 'empty') return [];
  return standard(bestOf).map((r) => {
    if (preset === 'manual' || (preset === 'minimal' && r.id !== 'result' && r.id !== 'live')) return { ...r, trigger: 'manual', holdMode: 'manual' };
    return r;
  });
}

export const validPreset = (p: unknown): Preset => {
  if (!(PRESETS as readonly unknown[]).includes(p)) throw new Error('Choose Standard, Results only, Manual or Empty.');
  return p as Preset;
};

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/**
 * Checks a row from the interface; throws a plain message when it cannot be used. `screens` are the
 * full-screen graphics in My show.
 */
export function validRow(input: RowInput, id: string, bestOf: 1 | 3 | 5, screens: string[]): RundownRow {
  if (!input || typeof input !== 'object') throw new Error('Choose a screen and its rule.');
  if (input.show !== null && !(typeof input.show === 'string' && FULLSCREEN_IDS.has(input.show) && screens.includes(input.show))) throw new Error('Choose a screen that is in My show.');
  if (!(WHEN as readonly unknown[]).includes(input.trigger)) throw new Error('Choose when it comes up.');
  const map = input.map;
  if (!(map === 'every' || map === 'series' || int(map, 1, bestOf))) throw new Error(`Choose every map, map 1 to ${bestOf}, or after the series.`);
  if (!int(input.forSeconds, 0, 600)) throw new Error('Choose how long it stays on screen.');
  if (input.trigger === 'delay' && !int(input.delaySeconds, 1, 600)) throw new Error('Choose how long after the previous screen.');
  if (input.transition !== 'cut' && input.transition !== 'stinger') throw new Error('Choose cut or stinger.');
  if (input.holdMode !== 'window' && input.holdMode !== 'manual') throw new Error('Choose the hold.');
  if (input.holdMode === 'window' && !int(input.holdSeconds, 0, 60)) throw new Error('A hold is 0–60 seconds.');
  const manual = input.trigger === 'manual';
  return {
    id, show: input.show, trigger: input.trigger, map, forSeconds: input.show === null ? 0 : input.forSeconds,
    delaySeconds: input.trigger === 'delay' ? input.delaySeconds : 12, transition: input.transition,
    // "I press Take" always waits for the Take.
    holdMode: manual ? 'manual' : input.holdMode, holdSeconds: manual || input.holdMode === 'manual' ? 0 : input.holdSeconds,
    enabled: input.enabled !== false,
  };
}

/** A save from before rows existed becomes rows: the standard rows, or the old steps one map at a time. */
export function migrate(saved: SavedRundown | LegacyEdits | undefined, bestOf: 1 | 3 | 5): SavedRundown {
  if (saved && 'rows' in saved && Array.isArray(saved.rows)) return saved as SavedRundown;
  const legacy = (saved ?? {}) as LegacyEdits;
  const preset = legacy.preset ?? 'standard';
  const edited = Object.keys(legacy.edits ?? {}).length > 0 || (legacy.order?.length ?? 0) > 0;
  if (!edited) return { rows: presetRows(preset, bestOf), startedFrom: preset };
  // Each old step becomes its own row on its map, with the producer's edits and order.
  const steps = buildRundown(bestOf, presetRows(preset, bestOf));
  const rank = new Map((legacy.order ?? []).map((id, i) => [id, i]));
  const ordered = steps.map((s, i) => ({ s, key: rank.has(s.id) ? rank.get(s.id)! : 1000 + i })).sort((a, b) => a.key - b.key).map((x) => x.s);
  const rows = ordered.map((s) => {
    const e = legacy.edits?.[s.id] ?? {};
    const trigger = (e.mode === 'manual' ? 'manual' : e.trigger ?? s.trigger) as RundownRow['trigger'];
    return row({
      id: s.id, show: e.show !== undefined ? e.show : s.show, trigger: (WHEN as readonly string[]).includes(trigger) ? trigger : 'manual',
      map: s.id === 'champion' ? 'series' : s.mapNumber ?? 1, forSeconds: e.forSeconds ?? s.forSeconds, delaySeconds: e.delaySeconds ?? s.delaySeconds,
      transition: e.transition ?? s.transition, holdMode: e.holdMode ?? s.holdMode, holdSeconds: e.holdSeconds ?? s.holdSeconds,
    });
  });
  return { rows, startedFrom: preset };
}

/**
 * The steps autopilot walks through: for map 1…N every row that is "every map" or that map, in list
 * order, then the "after the series" rows. Switched-off rows are left out. Ids stay stable across
 * restarts (an every-map row on map 2 is `map2-<id>`), so saved progress still matches.
 */
export function buildRundown(bestOf: 1 | 3 | 5, rows: RundownRow[] = presetRows('standard', bestOf), title: (id: string | null) => string = screenTitle): Segment[] {
  const on = rows.filter((r) => r.enabled);
  const step = (r: RundownRow, id: string, name: string, mapNumber: number | null): Segment => ({
    id, name, show: r.show, forSeconds: r.forSeconds, trigger: r.trigger, delaySeconds: r.delaySeconds,
    mode: r.trigger === 'manual' ? 'manual' : 'automatic', holdMode: r.holdMode, holdSeconds: r.holdSeconds, transition: r.transition,
    mapNumber, afterSeries: r.map === 'series', state: 'queued', heldBy: null,
  });
  const out: Segment[] = [];
  for (let n = 1; n <= bestOf; n++) {
    for (const r of on) {
      if (r.map === 'every') out.push(step(r, `map${n}-${r.id}`, bestOf > 1 ? `Map ${n} · ${title(r.show)}` : title(r.show), n));
      else if (r.map === n) out.push(step(r, r.id, title(r.show), n));
    }
  }
  for (const r of on) if (r.map === 'series') out.push(step(r, r.id, title(r.show), null));
  return out;
}
