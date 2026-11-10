// The rundown for a match: the segments autopilot walks through (PRD §5.3), built from the best-of
// and the producer's saved edits. Scenes default to the five Esportra scenes; the producer can map
// any segment to another OBS scene.

import { SCENES } from '../../shared/scenes.ts';
import { TRIGGERS, type Segment, type SegmentEdit, type Trigger } from '../../shared/autopilot.ts';

export interface RundownEdits {
  /** Segment ids in the producer's order (unknown ids are ignored; new template ids go last). */
  order: string[];
  edits: Record<string, SegmentEdit>;
}

export const emptyEdits = (): RundownEdits => ({ order: [], edits: {} });

type Template = Omit<Segment, 'state' | 'heldBy'>;

const base = (t: Partial<Template> & Pick<Template, 'id' | 'name' | 'scene'>): Template => ({
  graphic: null, trigger: 'manual', delaySeconds: 10, mode: 'manual', holdMode: 'manual', holdSeconds: 5, transition: 'default', mapNumber: null, ...t,
});

/** Starting soon → intro → each map (live, result, break) → series → casters → ending. */
export function template(bestOf: 1 | 3 | 5): Template[] {
  const out: Template[] = [
    base({ id: 'starting-soon', name: 'Starting soon', scene: SCENES.holding.name }),
    base({ id: 'intro', name: 'Match intro', scene: SCENES.fullscreen.name, graphic: 'match-intro', transition: 'stinger' }),
  ];
  for (let n = 1; n <= bestOf; n++) {
    out.push(
      base({ id: `map${n}-live`, name: `Map ${n} live`, scene: SCENES.gameplay.name, trigger: 'round_live', mode: 'automatic', holdMode: 'window', holdSeconds: 5, transition: 'stinger', mapNumber: n }),
      base({ id: `map${n}-result`, name: `Map ${n} result`, scene: SCENES.fullscreen.name, graphic: 'map-result', trigger: 'map_end', mode: 'automatic', holdMode: 'window', holdSeconds: 5, transition: 'stinger', mapNumber: n }),
    );
    if (n < bestOf) out.push(base({ id: `break${n}`, name: 'Break', scene: SCENES.holding.name }));
  }
  out.push(
    base({ id: 'series', name: 'Series result', scene: SCENES.fullscreen.name, graphic: 'series' }),
    base({ id: 'casters', name: 'Casters desk', scene: SCENES.casters.name }),
    base({ id: 'ending', name: 'Ending', scene: SCENES.holding.name }),
  );
  return out;
}

const sane = (edit: SegmentEdit): SegmentEdit => {
  const out: SegmentEdit = {};
  if (typeof edit.scene === 'string' && edit.scene.trim() && edit.scene.length <= 256 && !/[\x00-\x1f\x7f]/.test(edit.scene)) out.scene = edit.scene;
  if (edit.graphic === null || (typeof edit.graphic === 'string' && /^[a-z-]{1,40}$/.test(edit.graphic))) out.graphic = edit.graphic;
  if (edit.trigger && (TRIGGERS as readonly string[]).includes(edit.trigger)) out.trigger = edit.trigger as Trigger;
  if (Number.isInteger(edit.delaySeconds) && edit.delaySeconds! >= 1 && edit.delaySeconds! <= 600) out.delaySeconds = edit.delaySeconds;
  if (edit.mode === 'automatic' || edit.mode === 'manual') out.mode = edit.mode;
  if (edit.holdMode === 'window' || edit.holdMode === 'manual') out.holdMode = edit.holdMode;
  if (Number.isInteger(edit.holdSeconds) && edit.holdSeconds! >= 0 && edit.holdSeconds! <= 60) out.holdSeconds = edit.holdSeconds;
  if (edit.transition === 'default' || edit.transition === 'cut' || edit.transition === 'stinger') out.transition = edit.transition;
  return out;
};

/** Checks an edit from the interface; throws a plain message when it cannot be used. */
export function validateEdit(edit: SegmentEdit): SegmentEdit {
  const clean = sane(edit);
  if (Object.keys(clean).length !== Object.keys(edit).length) throw new Error('Choose a valid scene, trigger, hold window and transition.');
  if (clean.holdMode === 'window' && clean.holdSeconds === 0) throw new Error('A hold window is 1–60 seconds. Choose Manual to wait for Take.');
  return clean;
}

/** An automatic segment needs a trigger that can fire by itself. */
const settle = (t: Template): Template => (t.mode === 'automatic' && t.trigger === 'manual' ? { ...t, mode: 'manual' } : t);

export function buildRundown(bestOf: 1 | 3 | 5, saved: RundownEdits = emptyEdits()): Segment[] {
  const templates = template(bestOf).map((t) => settle({ ...t, ...sane(saved.edits[t.id] ?? {}) }));
  const rank = new Map(saved.order.map((id, i) => [id, i]));
  const ordered = templates
    .map((t, i) => ({ t, key: rank.has(t.id) ? rank.get(t.id)! : saved.order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.t);
  return ordered.map((t) => ({ ...t, state: 'queued', heldBy: null }));
}
