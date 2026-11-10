// The rundown for a match: the graphic steps autopilot walks through, built from the best-of, a
// preset and the producer's saved edits. Each step shows a full-screen graphic (or goes back to the
// game) when its trigger fires. In-round graphics (economy, recap, spike timer, callouts) are the
// engine's Auto layers and are not steps here.

import { PRESETS, TRIGGERS, type Preset, type Segment, type SegmentEdit, type Trigger } from '../../shared/autopilot.ts';

export interface RundownEdits {
  /** Segment ids in the producer's order (unknown ids are ignored; new template ids go last). */
  order: string[];
  edits: Record<string, SegmentEdit>;
  preset?: Preset;
}

export const emptyEdits = (): RundownEdits => ({ order: [], edits: {}, preset: 'standard' });

type Template = Omit<Segment, 'state' | 'heldBy'>;

const step = (t: Partial<Template> & Pick<Template, 'id' | 'name'>): Template => ({
  show: null, forSeconds: 0, trigger: 'manual', delaySeconds: 10, mode: 'manual', holdMode: 'manual', holdSeconds: 5, transition: 'stinger', mapNumber: null, ...t,
});

const FULLSCREEN_IDS = new Set(['match-intro', 'map-veto', 'agent-select', 'map-result', 'series', 'halftime', 'standings', 'player-profile', 'champion', 'cam-grid']);

/** The standard show for a best-of: intro, then per map: back to the game, halftime, result, series. */
export function template(bestOf: 1 | 3 | 5): Template[] {
  const out: Template[] = [step({ id: 'intro', name: 'Match intro', show: 'match-intro' })];
  for (let n = 1; n <= bestOf; n++) {
    out.push(
      step({ id: `map${n}-live`, name: `Map ${n} · back to the game`, trigger: 'round_live', mode: 'automatic', holdMode: 'window', holdSeconds: 3, transition: 'cut', mapNumber: n }),
      step({ id: `map${n}-half`, name: `Map ${n} · halftime`, show: 'halftime', forSeconds: 15, trigger: 'halftime', mode: 'automatic', holdMode: 'window', holdSeconds: 3, mapNumber: n }),
      step({ id: `map${n}-result`, name: `Map ${n} · result`, show: 'map-result', trigger: 'map_end', mode: 'automatic', holdMode: 'window', holdSeconds: 5, mapNumber: n }),
    );
    if (bestOf > 1) out.push(step({ id: `map${n}-series`, name: `Map ${n} · series`, show: 'series', trigger: 'delay', delaySeconds: 12, mode: 'automatic', holdMode: 'window', holdSeconds: 3, mapNumber: n }));
  }
  out.push(step({ id: 'champion', name: 'Winner', show: 'champion' }));
  return out;
}

/** What a preset leaves automatic. */
function applyPreset(t: Template, preset: Preset): Template {
  if (preset === 'manual') return { ...t, mode: 'manual' };
  if (preset === 'minimal') return { ...t, mode: t.id.endsWith('-result') || t.id.endsWith('-live') ? t.mode : 'manual' };
  return t;
}

const sane = (edit: SegmentEdit): SegmentEdit => {
  const out: SegmentEdit = {};
  if (edit.show === null || (typeof edit.show === 'string' && FULLSCREEN_IDS.has(edit.show))) out.show = edit.show;
  if (Number.isInteger(edit.forSeconds) && edit.forSeconds! >= 0 && edit.forSeconds! <= 600) out.forSeconds = edit.forSeconds;
  if (edit.trigger && (TRIGGERS as readonly string[]).includes(edit.trigger)) out.trigger = edit.trigger as Trigger;
  if (Number.isInteger(edit.delaySeconds) && edit.delaySeconds! >= 1 && edit.delaySeconds! <= 600) out.delaySeconds = edit.delaySeconds;
  if (edit.mode === 'automatic' || edit.mode === 'manual') out.mode = edit.mode;
  if (edit.holdMode === 'window' || edit.holdMode === 'manual') out.holdMode = edit.holdMode;
  if (Number.isInteger(edit.holdSeconds) && edit.holdSeconds! >= 0 && edit.holdSeconds! <= 60) out.holdSeconds = edit.holdSeconds;
  if (edit.transition === 'cut' || edit.transition === 'stinger') out.transition = edit.transition;
  return out;
};

/** Checks an edit from the interface; throws a plain message when it cannot be used. */
export function validateEdit(edit: SegmentEdit): SegmentEdit {
  const clean = sane(edit);
  if (Object.keys(clean).length !== Object.keys(edit).length) throw new Error('Choose a valid graphic, trigger, hold window and transition.');
  if (clean.holdMode === 'window' && clean.holdSeconds === 0) throw new Error('A hold window is 1–60 seconds. Choose Manual to wait for Take.');
  return clean;
}

export const validPreset = (p: unknown): Preset => {
  if (!(PRESETS as readonly unknown[]).includes(p)) throw new Error('Choose Standard, Minimal or Manual.');
  return p as Preset;
};

/** An automatic step needs a trigger that can fire by itself. */
const settle = (t: Template): Template => (t.mode === 'automatic' && t.trigger === 'manual' ? { ...t, mode: 'manual' } : t);

export function buildRundown(bestOf: 1 | 3 | 5, saved: RundownEdits = emptyEdits()): Segment[] {
  const preset = saved.preset ?? 'standard';
  const templates = template(bestOf).map((t) => settle({ ...applyPreset(t, preset), ...sane(saved.edits[t.id] ?? {}) }));
  const rank = new Map(saved.order.map((id, i) => [id, i]));
  const ordered = templates
    .map((t, i) => ({ t, key: rank.has(t.id) ? rank.get(t.id)! : saved.order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.t);
  return ordered.map((t) => ({ ...t, state: 'queued', heldBy: null }));
}
