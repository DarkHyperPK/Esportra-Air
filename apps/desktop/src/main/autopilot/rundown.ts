// The rundown for a match: rows the producer builds from the screens in My show, each with its own
// rule (when, which map, how long, cut or stinger, hold). Rows expand into the steps ShowRunner walks
// through: an "every map" row once per map, a map-number row on that map, an "after the series" row
// at the end. In-round graphics (economy, recap, spike timer, callouts) are the engine's Auto layers
// and are not rows here.

import { BAND_SCREENS } from '../../shared/look.ts';
import { graphicScreen, graphicStyle, type Template } from '../../shared/templates.ts';
import { isOwnScreen } from '../../shared/own-graphics.ts';
import { HUD_ROW, PRESETS, defaultSection, SECTIONS, SECTION_SCREENS, WHEN, takesItself, type Preset, type RowInput, type RundownRow, type Section, type Segment, type SegmentEdit } from '../../shared/autopilot.ts';

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

const FULLSCREEN_IDS = new Set(['match-intro', 'map-veto', 'agent-select', 'map-result', 'series', 'halftime', 'standings', 'player-profile', 'champion', 'cam-grid', 'schedule']);

const TITLE: Record<string, string> = { 'match-intro': 'Match intro', 'map-veto': 'Map veto', 'agent-select': 'Agent select', 'map-result': 'Map result', series: 'Series', halftime: 'Halftime', standings: 'Standings', 'player-profile': 'Player profile', champion: 'Champion', 'cam-grid': 'Player cams', schedule: 'Today\'s schedule' };
export const screenTitle = (id: string | null) => (id === null ? 'Back to the game' : TITLE[id] ?? id);

const row = (r: Partial<RundownRow> & Pick<RundownRow, 'id' | 'show' | 'trigger' | 'map'>): RundownRow => ({
  section: defaultSection(r.show), forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'window', holdSeconds: 3, enabled: true, ...r,
});

/** The in-game HUD row every rundown has (it can be removed, like any row). */
export const hudRow = (): RundownRow => row({ id: 'hud', show: HUD_ROW, trigger: 'manual', map: 'every', holdMode: 'manual', holdSeconds: 0 });

/** Rows in show order: Pre-show, Game, Between maps, Post-show; the producer's order within each. */
export const sortRows = (rows: RundownRow[]): RundownRow[] => SECTIONS.flatMap((sec) => rows.filter((r) => r.section === sec));

/** Standard show: intro, then on every map back to the game, halftime, result and series, then the champion. */
function standard(bestOf: 1 | 3 | 5): RundownRow[] {
  return [
    row({ id: 'intro', show: 'match-intro', trigger: 'manual', map: 1, holdMode: 'manual' }),
    hudRow(),
    row({ id: 'live', show: null, trigger: 'round_live', map: 'every', transition: 'cut' }),
    row({ id: 'half', show: 'halftime', trigger: 'halftime', map: 'every', forSeconds: 15 }),
    row({ id: 'result', show: 'map-result', trigger: 'map_end', map: 'every', holdSeconds: 5 }),
    ...(bestOf > 1 ? [row({ id: 'series', show: 'series', trigger: 'delay', map: 'every' })] : []),
    row({ id: 'champion', show: 'champion', trigger: 'manual', map: 'series', holdMode: 'manual' }),
  ];
}

/** The rows a starting point gives. Results only keeps the map result and the return to the game automatic. */
export function presetRows(preset: Preset, bestOf: 1 | 3 | 5): RundownRow[] {
  if (preset === 'empty') return [hudRow()];
  return standard(bestOf).map((r) => {
    if (!takesItself(r.show)) return r;
    if (preset === 'manual' || (preset === 'minimal' && r.id !== 'result' && r.id !== 'live')) return { ...r, trigger: 'manual', holdMode: 'manual' };
    return r;
  });
}

/**
 * The rows for the screens ticked in New match › Screens: the starting point's rows for the screens it
 * has (with their rules), then each other ticked screen in its usual section, waiting for Take. Back to
 * the game comes along with any full-screen graphic; the HUD row only when the in-game HUD is ticked.
 */
/**
 * The rule a screen gets from a starting point: the built-in screen's own row (Map result: when the map
 * ends), or Take. A design of your own uses the rule of the screen it stands for.
 */
export function ruleOf(purpose: string, preset: Preset, bestOf: 1 | 3 | 5): Pick<RundownRow, 'trigger' | 'map' | 'forSeconds' | 'delaySeconds' | 'transition' | 'holdMode' | 'holdSeconds'> {
  const r = presetRows(preset === 'empty' ? 'standard' : preset, bestOf).find((x) => x.show === purpose);
  if (r) return { trigger: r.trigger, map: r.map, forSeconds: r.forSeconds, delaySeconds: r.delaySeconds, transition: r.transition, holdMode: r.holdMode, holdSeconds: r.holdSeconds };
  return { trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 };
}

export function rowsForScreens(screens: string[], preset: Preset, bestOf: 1 | 3 | 5, sectionOf: (show: string) => Section = defaultSection, purposeOf: (show: string) => string | null = () => null): RundownRow[] {
  const want = new Set(screens);
  const base = presetRows(preset === 'empty' ? 'standard' : preset, bestOf);
  const anyFull = screens.some((x) => FULLSCREEN_IDS.has(x) || isOwnScreen(x));
  const rows = base.filter((r) => (r.show === null ? anyFull : want.has(r.show)));
  for (const show of screens) {
    if (rows.some((r) => r.show === show)) continue;
    if (show === HUD_ROW) { rows.push(hudRow()); continue; }
    // Your own design for Map result comes up when the map ends, like Map result; anything else waits for Take.
    const purpose = purposeOf(show);
    const rule = purpose ? ruleOf(purpose, preset, bestOf) : ruleOf('', preset, bestOf);
    rows.push(row({ id: `pick-${show.replace(/[^a-z0-9-]/gi, '-')}`, show, section: sectionOf(show), ...rule }));
  }
  return sortRows(rows);
}

export const validPreset = (p: unknown): Preset => {
  if (!(PRESETS as readonly unknown[]).includes(p)) throw new Error('Choose Standard, Results only, Manual or Empty.');
  return p as Preset;
};

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/**
 * Checks a row from the interface; throws a plain message when it cannot be used. `screens` are the
 * screens Air has (`setup.screens` ids). Scene rows and the HUD row have no trigger.
 */
export function validRow(input: RowInput, id: string, bestOf: 1 | 3 | 5, screens: string[], templates: Template[] = []): RundownRow {
  if (!input || typeof input !== 'object') throw new Error('Choose a screen and its rule.');
  const section = input.section;
  if (!(SECTIONS as readonly unknown[]).includes(section)) throw new Error('Choose Pre-show, Game, Between maps or Post-show.');
  if (input.show !== null && !(typeof input.show === 'string' && screens.includes(input.show))) throw new Error('Choose one of the screens.');
  // Your own graphics go before, between or after the maps (never in the game section).
  if (isOwnScreen(input.show) ? section === 'game' : !SECTION_SCREENS[section].includes(input.show)) throw new Error('That screen does not go in this part of the show.');
  // A saved look: for this screen, or for the in-game HUD on the HUD row. Its graphic says full screen or over the game.
  let template: Template | undefined;
  if (input.template !== undefined && input.template !== null && input.template !== '') {
    template = templates.find((t) => t.id === input.template);
    const fits = template && (input.show === HUD_ROW ? template.graphic === 'hud' : input.show !== null && graphicScreen(template.graphic) === input.show);
    if (!fits) throw new Error('That template is for a different graphic. Choose another look.');
  }
  // The HUD row and scene rows (Break, Desk) have no rule, only a look. For Break, over the game is the frame.
  if (!takesItself(input.show)) {
    const frame = input.show === 'holding' && (template ? graphicStyle(template.graphic) === 'band' : input.style === 'band');
    return { ...row({ id, show: input.show, trigger: 'manual', map: 'every', holdMode: 'manual', holdSeconds: 0 }), section, enabled: input.enabled !== false, ...(input.show === 'holding' ? { style: frame ? 'band' as const : 'full' as const } : {}), ...(template ? { template: template.id } : {}) };
  }
  if (!(WHEN as readonly unknown[]).includes(input.trigger)) throw new Error('Choose when it comes up.');
  const map = input.map;
  if (!(map === 'every' || map === 'series' || int(map, 1, bestOf))) throw new Error(`Choose every map, map 1 to ${bestOf}, or after the series.`);
  if (!int(input.forSeconds, 0, 600)) throw new Error('Choose how long it stays on screen.');
  if (input.trigger === 'delay' && !int(input.delaySeconds, 1, 600)) throw new Error('Choose how long after the previous screen.');
  if (input.transition !== 'cut' && input.transition !== 'stinger') throw new Error('Choose cut or stinger.');
  if (input.holdMode !== 'window' && input.holdMode !== 'manual') throw new Error('Choose the hold.');
  if (input.holdMode === 'window' && !int(input.holdSeconds, 0, 60)) throw new Error('A hold is 0–60 seconds.');
  const manual = input.trigger === 'manual';
  if (input.style !== undefined && input.style !== 'full' && input.style !== 'band') throw new Error('Choose full screen or over the game.');
  const style = template ? graphicStyle(template.graphic) : input.style === 'band' && input.show && BAND_SCREENS.has(input.show) ? 'band' as const : 'full' as const;
  return {
    id, section, show: input.show, style, ...(template ? { template: template.id } : {}), trigger: input.trigger, map, forSeconds: input.show === null ? 0 : input.forSeconds,
    delaySeconds: input.trigger === 'delay' ? input.delaySeconds : 12, transition: input.transition,
    // "I press Take" always waits for the Take.
    holdMode: manual ? 'manual' : input.holdMode, holdSeconds: manual || input.holdMode === 'manual' ? 0 : input.holdSeconds,
    enabled: input.enabled !== false,
  };
}

/** A save from before rows existed becomes rows: the standard rows, or the old steps one map at a time. */
export function migrate(saved: SavedRundown | LegacyEdits | undefined, bestOf: 1 | 3 | 5, myShow: string[] = []): SavedRundown {
  if (saved && 'rows' in saved && Array.isArray(saved.rows)) {
    const done = saved as SavedRundown;
    if (done.rows.every((r) => r.section)) return done;
    // Rows from before sections (12 Nov): each goes in its usual section; the HUD row and the full-screen
    // graphics switched on in the old My show are added, so nothing that was in the show goes missing.
    const rows = done.rows.map((r) => ({ ...r, section: r.section ?? defaultSection(r.show) }));
    if (!rows.some((r) => r.show === HUD_ROW)) rows.push(hudRow());
    for (const show of myShow) if (!rows.some((r) => r.show === show)) rows.push(row({ id: `add-${show}`, show, trigger: 'manual', map: 'every', holdMode: 'manual', holdSeconds: 0 }));
    return { rows: sortRows(rows), startedFrom: done.startedFrom };
  }
  const legacy = (saved ?? {}) as LegacyEdits;
  const preset = legacy.preset ?? 'standard';
  const edited = Object.keys(legacy.edits ?? {}).length > 0 || (legacy.order?.length ?? 0) > 0;
  if (!edited) return migrate({ rows: presetRows(preset, bestOf).map(({ section: _s, ...r }) => r as RundownRow), startedFrom: preset }, bestOf, myShow);
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
  return migrate({ rows: rows.map(({ section: _s, ...r }) => r as RundownRow), startedFrom: preset }, bestOf, myShow);
}

/**
 * The steps autopilot walks through: for map 1…N every row that is "every map" or that map, in list
 * order, then the "after the series" rows. Switched-off rows are left out. Ids stay stable across
 * restarts (an every-map row on map 2 is `map2-<id>`), so saved progress still matches.
 */
export function buildRundown(bestOf: 1 | 3 | 5, rows: RundownRow[] = presetRows('standard', bestOf), title: (id: string | null) => string = screenTitle): Segment[] {
  // Only full-screen rows and back to the game are steps; the HUD and scene rows are switched in OBS.
  const on = sortRows(rows).filter((r) => r.enabled && takesItself(r.show));
  const step = (r: RundownRow, id: string, name: string, mapNumber: number | null): Segment => ({
    id, name, show: r.show, forSeconds: r.forSeconds, trigger: r.trigger, delaySeconds: r.delaySeconds,
    mode: r.trigger === 'manual' ? 'manual' : 'automatic', holdMode: r.holdMode, holdSeconds: r.holdSeconds, transition: r.transition,
    mapNumber, afterSeries: r.map === 'series', state: 'queued', heldBy: null, style: r.style === 'band' && r.show && BAND_SCREENS.has(r.show) ? 'band' : 'full',
    ...(r.template ? { template: r.template } : {}),
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

/** The screens a rundown puts in OBS: its rows, plus what every show needs (HUD, stinger, the
 *  full-screen host, the replay bug) and the ticker with Starting soon / Break. */
export function rundownScreens(rows: RundownRow[]): Set<string> {
  const out = new Set(['in-game', 'stinger', 'fullscreen', 'replay-bug']);
  for (const r of rows) if (r.enabled && r.show) out.add(r.show);
  if (out.has('holding')) out.add('ticker');
  return out;
}

export { defaultSection };
