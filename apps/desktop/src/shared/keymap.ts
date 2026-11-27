// Every keyboard action in Air, with its default key. The producer can rebind any of them on this PC
// (Settings › Keyboard); Live, the keyboard help and the manual all read the keys from here.
import { LAYER_DEFS } from './layers.ts';

export type ActionGroup = 'show' | 'moment' | 'layer';

export interface KeyAction {
  id: string;
  label: string;
  group: ActionGroup;
  /** Normalised key: modifiers then key, e.g. "Space", "F7", "H", "Ctrl+G", "Shift+A". */
  key: string;
}

const SHOW: KeyAction[] = [
  { id: 'take', label: 'Take what is waiting (next step, or what is cued)', group: 'show', key: 'Space' },
  { id: 'stinger', label: 'Take the cue behind the stinger', group: 'show', key: 'F7' },
  { id: 'hold', label: 'Hold the next autopilot step', group: 'show', key: 'H' },
  { id: 'skip', label: 'Skip the next autopilot step', group: 'show', key: 'S' },
  { id: 'all', label: 'All graphics', group: 'show', key: 'Ctrl+G' },
  { id: 'fix', label: 'Fix data', group: 'show', key: 'Ctrl+D' },
  { id: 'match', label: 'Match: veto, show text, event data', group: 'show', key: 'Ctrl+M' },
  { id: 'confirm', label: 'Confirm the provisional match (battle royale)', group: 'show', key: 'Ctrl+Enter' },
];

/** Moments: one press for what happens during a show. Up to six are on Live. */
const MOMENTS: KeyAction[] = [
  { id: 'pause', label: 'Tech pause', group: 'moment', key: 'F1' },
  { id: 'timeout', label: 'Timeout', group: 'moment', key: 'F2' },
  { id: 'replay', label: 'Replay', group: 'moment', key: 'F3' },
  { id: 'toast', label: 'Toast', group: 'moment', key: 'F4' },
  { id: 'talent', label: 'Talent lower third', group: 'moment', key: 'F5' },
  { id: 'poll', label: 'Poll', group: 'moment', key: 'F6' },
  { id: 'sponsor', label: 'Sponsor read', group: 'moment', key: 'F8' },
  { id: 'spotlight', label: 'Player spotlight', group: 'moment', key: 'F9' },
];

const LAYERS: KeyAction[] = LAYER_DEFS.map((d) => ({ id: `layer:${d.id}`, label: d.label, group: 'layer' as const, key: d.hotkey }));

export const ACTIONS: KeyAction[] = [...SHOW, ...MOMENTS, ...LAYERS];
export const MOMENT_IDS = MOMENTS.map((m) => m.id);
export const DEFAULT_MOMENTS = ['pause', 'timeout', 'replay', 'talent', 'sponsor', 'spotlight'];
/** Keys Air keeps for itself, and keys every app on the PC needs (copy, paste, close, switch). */
export const RESERVED = ['Escape', 'Ctrl+K', 'Shift+?', '?', 'Tab', 'Enter', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+A', 'Alt+F4', 'Alt+Tab'];

export type Keymap = Record<string, string>;

/** The key for an action: the producer's choice on this PC, else the default. */
export function keyOf(map: Keymap | undefined, id: string): string {
  return map?.[id] ?? ACTIONS.find((a) => a.id === id)?.key ?? '';
}

/** Every action with its effective key. */
export function effectiveKeys(map: Keymap | undefined): Array<KeyAction & { key: string }> {
  return ACTIONS.map((a) => ({ ...a, key: keyOf(map, a.id) }));
}

/** A key press in the same form as the table ("Ctrl+G", "Shift+A", "Space", "F7"). */
export function keyFromEvent(e: { key: string; ctrlKey: boolean; metaKey?: boolean; shiftKey: boolean; altKey?: boolean }): string {
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return '';
  // Shift on a symbol or digit changes the character itself; only letters and named keys carry "Shift+".
  const shift = e.shiftKey && (/^[A-Z]$/.test(key) || key.length > 1) ? 'Shift+' : '';
  return `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${shift}${key}`;
}

/** The action a key press means, or null. */
export function actionFor(map: Keymap | undefined, e: Parameters<typeof keyFromEvent>[0]): string | null {
  const pressed = keyFromEvent(e);
  if (!pressed) return null;
  return effectiveKeys(map).find((a) => a.key === pressed)?.id ?? null;
}

/** How a key reads on screen: "Ctrl G", "Shift A". */
export const keyLabel = (key: string) => key.replace(/\+/g, ' ');

/** True while the producer is typing in a field: keys then belong to the field. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!el && (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName ?? '') || el.isContentEditable === true);
}

/**
 * Binds `id` to `key` (null resets it). A key another action uses is refused unless `swap`, which
 * gives that action this one's old key. Returns the new overrides (only keys that differ from the default).
 */
export function rebind(map: Keymap | undefined, id: string, key: string | null, swap = false): Keymap {
  const action = ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error('That action no longer exists.');
  const next: Keymap = { ...(map ?? {}) };
  if (key === null) {
    delete next[id];
  } else {
    if (!key || RESERVED.includes(key)) throw new Error(`${keyLabel(key) || 'That key'} is kept for Air or for every app on this PC. Pick another key.`);
    const other = effectiveKeys(map).find((a) => a.key === key && a.id !== id);
    if (other && !swap) throw new Error(`${keyLabel(key)} is already ${other.label}. Swap them, or pick another key.`);
    if (other) next[other.id] = keyOf(map, id);
    next[id] = key;
  }
  for (const a of ACTIONS) if (next[a.id] === a.key) delete next[a.id];
  const keys = effectiveKeys(next).map((a) => a.key);
  if (new Set(keys).size !== keys.length) throw new Error('Two actions would share a key. Pick another key.');
  return next;
}

export function validMoments(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 6) throw new Error('Choose one to six moments for Live.');
  const list = [...new Set(ids.map(String))];
  if (list.some((id) => !MOMENT_IDS.includes(id))) throw new Error('Choose moments from the list.');
  return list;
}
