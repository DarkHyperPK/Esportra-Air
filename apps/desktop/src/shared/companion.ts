// Stream Deck / Companion: what Air sends to Bitfocus Companion and what Companion buttons may ask.
// Only data Air already has. The in-game HUD runs itself (Auto layers and the engine's rules), so no
// action touches it: buttons drive full-screen graphics, lower thirds, toasts, pauses and Cued.

export const CONTROL_MODES = ['air', 'companion', 'both'] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

export const DEFAULT_COMPANION_PORT = 5321;

export interface CompanionView {
  running: boolean;
  port: number;
  /** `address:port` on this PC's local network, to type into Companion. */
  addresses: string[];
  key: string | null;
  connected: number;
  error: string | null;
}

/** Events Air sends; each is a Companion trigger condition. */
export const COMPANION_EVENTS = [
  'map_start', 'round_live', 'round_end', 'halftime', 'map_end',
  'spike_planted', 'spike_defused', 'spike_exploded', 'kill', 'ace', 'team_ace',
  'graphic_on_air', 'graphic_off_air', 'pause_on', 'pause_off', 'data_paused', 'data_back',
] as const;
export type CompanionEvent = (typeof COMPANION_EVENTS)[number];

export const EVENT_LABEL: Record<CompanionEvent, string> = {
  map_start: 'Map starts', round_live: 'Round live', round_end: 'Round ends · winner', halftime: 'Halftime', map_end: 'Map ends',
  spike_planted: 'Spike planted', spike_defused: 'Spike defused', spike_exploded: 'Spike exploded', kill: 'Kill', ace: 'Ace', team_ace: 'Team ace',
  graphic_on_air: 'Graphic on air', graphic_off_air: 'Graphic off air', pause_on: 'Tech pause / timeout on', pause_off: 'Tech pause / timeout off',
  data_paused: 'Game data paused', data_back: 'Game data back',
};

/** Actions Companion buttons may ask for. The autopilot ones only with "Both". */
export const COMPANION_ACTIONS = ['fullscreen', 'talent', 'sponsor', 'toast', 'pause', 'take', 'take_stinger', 'clear', 'autopilot_hold', 'autopilot_skip', 'autopilot_take'] as const;
export type CompanionAction = (typeof COMPANION_ACTIONS)[number];

export const ACTION_LABEL: Record<CompanionAction, string> = {
  fullscreen: 'Show / hide a full-screen graphic', talent: 'Talent lower third', sponsor: 'Sponsor lower third', toast: 'Toast',
  pause: 'Tech pause / timeout', take: 'Take', take_stinger: 'Take behind the stinger', clear: 'Clear Cued',
  autopilot_hold: 'Autopilot: hold', autopilot_skip: 'Autopilot: skip', autopilot_take: 'Autopilot: take',
};

export type Values = Record<string, string | number | boolean>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * The values Companion shows on buttons and checks in triggers: teams, score, round, map, what is on
 * air, and each player (p1–p5 the first team, p6–p10 the second).
 */
export function companionValues(room: any, extra: { onAir: string; cued: number; next: string }): Values {
  const teams: any[] = Array.isArray(room?.teams) ? room.teams : [];
  const players: any[][] = Array.isArray(room?.players) ? room.players : [];
  const out: Values = {
    round: num(room?.round?.number), phase: str(room?.round?.phase), map: num(room?.map?.number) || 1, map_name: str(room?.map?.name),
    on_air: extra.onAir, cued: extra.cued, autopilot_next: extra.next,
  };
  for (const [t, side] of [[0, 'a'], [1, 'b']] as const) {
    const team = teams[t] ?? {};
    const list = players[t] ?? [];
    out[`team_${side}`] = str(team.name);
    out[`tag_${side}`] = str(team.tag);
    out[`score_${side}`] = num(team.score);
    out[`series_${side}`] = num(team.series);
    out[`alive_${side}`] = list.filter((p) => p?.name && p.alive !== false).length;
    out[`credits_${side}`] = list.reduce((sum, p) => sum + num(p?.credits), 0);
    for (let i = 0; i < 5; i++) {
      const p = list[i] ?? {};
      const n = t * 5 + i + 1;
      out[`p${n}_name`] = str(p.name);
      out[`p${n}_agent`] = str(p.agent);
      out[`p${n}_alive`] = p.alive !== false;
      out[`p${n}_kills`] = num(p.k);
      out[`p${n}_deaths`] = num(p.d);
      out[`p${n}_assists`] = num(p.a);
      out[`p${n}_credits`] = num(p.credits);
    }
  }
  return out;
}

/** The Companion events one engine event means (round 12 ending is also halftime). */
export function eventsFor(e: Record<string, unknown>): Array<{ name: CompanionEvent; data: Record<string, unknown> }> {
  const pick = (...keys: string[]) => Object.fromEntries(keys.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));
  switch (e.type) {
    case 'match.start': return [{ name: 'map_start', data: {} }];
    case 'match.end': return [{ name: 'map_end', data: {} }];
    case 'round.phase': return e.phase === 'live' ? [{ name: 'round_live', data: {} }] : [];
    case 'round.won': {
      const out: Array<{ name: CompanionEvent; data: Record<string, unknown> }> = [{ name: 'round_end', data: pick('team', 'how', 'round', 'moment', 'player') }];
      if (Number(e.round) === 12) out.push({ name: 'halftime', data: {} });
      return out;
    }
    case 'spike.planted': return [{ name: 'spike_planted', data: pick('team') }];
    case 'spike.defused': return [{ name: 'spike_defused', data: pick('team') }];
    case 'spike.detonated': return [{ name: 'spike_exploded', data: pick('team') }];
    case 'kill': return [{ name: 'kill', data: pick('killer', 'victim', 'weapon', 'hs') }];
    case 'banner.ace': return [{ name: 'ace', data: pick('team', 'player') }];
    case 'banner.teamace': return [{ name: 'team_ace', data: pick('team') }];
    default: return [];
  }
}

/** Events Air sees in its own state: a graphic going on or off air, pauses, game data. */
export interface WatchState { onAir: string | null; pause: boolean; dataPaused: boolean }
export function stateEvents(before: WatchState | null, now: WatchState): Array<{ name: CompanionEvent; data: Record<string, unknown> }> {
  if (!before) return [];
  const out: Array<{ name: CompanionEvent; data: Record<string, unknown> }> = [];
  if (before.onAir !== now.onAir) {
    if (before.onAir) out.push({ name: 'graphic_off_air', data: { graphic: before.onAir } });
    if (now.onAir) out.push({ name: 'graphic_on_air', data: { graphic: now.onAir } });
  }
  if (before.pause !== now.pause) out.push({ name: now.pause ? 'pause_on' : 'pause_off', data: {} });
  if (before.dataPaused !== now.dataPaused) out.push({ name: now.dataPaused ? 'data_paused' : 'data_back', data: {} });
  return out;
}

/** Whether a connecting address is on this PC or its local network (Companion must be nearby). */
export function isLocalAddress(raw: string | undefined): boolean {
  if (!raw) return false;
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (ip === '::1' || ip.toLowerCase().startsWith('fe80:')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
