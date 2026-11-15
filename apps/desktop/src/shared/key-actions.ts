// What a key does, in one place: Live (keys inside Air) and the main process (keys over the game)
// both ask here, then run the same API call, so Cued and autopilot behave the same either way.
import type { ApiMethod, Snapshot } from './api.ts';
import { nextMode } from './layers.ts';
import { onAir } from './model.ts';

export type KeyCommand = { method: ApiMethod; args: unknown[] } | 'ui' | null;

/** Actions that open something inside Air; over the game they do nothing. */
export const UI_ACTIONS = new Set(['all', 'fix', 'toast', 'poll']);

export const sponsorsOn = (s: Snapshot) => (s.match ? onAir(s.match, s.event).sponsors : []);

/** The sponsor after the one on screen (or the first). */
export function nextSponsor(s: Snapshot) {
  const list = sponsorsOn(s);
  if (!list.length) return null;
  const i = s.triggers.sponsor ? list.findIndex((x) => x.id === s.triggers.sponsor) : -1;
  return list[(i + 1) % list.length] ?? null;
}

const call = (method: ApiMethod, ...args: unknown[]) => ({ method, args });

function moment(id: string, s: Snapshot): KeyCommand {
  switch (id) {
    case 'pause': return call('pause', s.triggers.pause === 'technical' ? null : 'technical');
    case 'timeout': return call('pause', s.triggers.pause === 'timeout' ? null : 'timeout');
    case 'replay': return s.obs.state === 'connected' ? call('replay') : null;
    case 'talent': return s.match && onAir(s.match, s.event).talent.length ? call('casterStrap', !s.triggers.strap) : 'ui';
    case 'sponsor': return sponsorsOn(s).length ? call('sponsorRead', s.triggers.sponsor ? null : nextSponsor(s)?.id ?? null) : null;
    case 'spotlight': return s.triggers.player || s.readout?.observed ? call('lowerThird', s.triggers.player ? null : { kind: 'player' }) : null;
    default: return null;
  }
}

/** The call a key action makes now, 'ui' when it opens something in Air, or null when there is nothing to do. */
export function keyCommand(id: string, s: Snapshot): KeyCommand {
  if (UI_ACTIONS.has(id)) return 'ui';
  const ap = s.autopilot;
  if (id === 'take') {
    // What the operator cued is what they mean; autopilot's next step fires on its own anyway.
    if (s.cue.pending.length) return call('cueTake', 'take');
    return ap.enabled && ap.next && ap.next.state !== 'taking' ? call('autopilotTake') : null;
  }
  if (id === 'stinger') return s.cue.pending.length ? call('cueTake', 'stinger') : call('stingerPlay');
  if (id === 'hold' || id === 'skip') return ap.enabled && ap.next ? call(id === 'hold' ? 'autopilotHold' : 'autopilotSkip') : null;
  if (!s.match) return null;
  if (id.startsWith('layer:')) {
    const row = s.layers.find((l) => l.id === id.slice(6));
    if (!row?.available) return null;
    // Steps on from the cued mode, so pressing twice while cueing moves two steps.
    const from = row.cued ?? row.mode;
    return call('setLayer', row.id, row.id.startsWith('fs:') ? (from === 'on' ? 'off' : 'on') : nextMode(row.id, from));
  }
  return moment(id, s);
}

/** Whether a key can work over the game: an F-key, or any key with Ctrl or Alt. Shift+letter never does. */
export function globalKey(key: string): boolean {
  if (!key) return false;
  const parts = key.split('+');
  const base = parts.at(-1)!;
  return /^F([1-9]|1\d|2[0-4])$/.test(base) || parts.includes('Ctrl') || parts.includes('Alt');
}

const ACCEL_NAMES: Record<string, string> = {
  Ctrl: 'Control', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space',
  Escape: 'Esc', '+': 'Plus',
};

/** The key in Electron's accelerator form ("Ctrl+Shift+G" → "Control+Shift+G"), or null. */
export function toAccelerator(key: string): string | null {
  if (!key) return null;
  const parts = key === '+' ? ['+'] : key.split('+').filter(Boolean);
  if (!parts.length) return null;
  return parts.map((p) => ACCEL_NAMES[p] ?? p).join('+');
}
