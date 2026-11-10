// Rehearse: the match plays privately inside Air (an ephemeral engine room), with its own teams,
// players and photos, through the chosen graphics, with autopilot firing. Nothing reaches OBS.

import type { AutopilotView } from './autopilot.ts';

/**
 * The players in the sample game data (the engine's test round, `test-round.json`), in scoreboard
 * order per team. During a rehearsal each is mapped by position to the match's own player.
 */
export const SAMPLE_GAME_NAMES: [string[], string[]] = [
  ['JUNO #PRX', 'MIRA #PRX', 'DAX #PRX', 'RIKU #PRX', 'ECHO #PRX'],
  ['KAIRO #FNC', 'SOL #FNC', 'VEX #FNC', 'NYX #FNC', 'ZEN #FNC'],
];

export const BEATS = [
  { id: 'start', label: 'Match starts' },
  { id: 'rounds', label: 'Rounds 1–3' },
  { id: 'halftime', label: 'Halftime' },
  { id: 'second', label: 'Second half' },
  { id: 'mapend', label: 'Map ends' },
  { id: 'series', label: 'Series and winner' },
] as const;

export const SPEEDS = [1, 2, 4] as const;
export type RehearsalSpeed = (typeof SPEEDS)[number];

export interface RehearsalOptions {
  speed: RehearsalSpeed;
  /** Autopilot runs the match's own steps against the rehearsal. */
  autopilot: boolean;
  /** Manual steps (intro, winner) are taken after three seconds, so the show plays by itself. */
  handsFree: boolean;
}

export interface RehearsalView {
  running: boolean;
  /** Index into BEATS: -1 before the first beat, BEATS.length once finished. */
  beat: number;
  speed: RehearsalSpeed;
  autopilotOn: boolean;
  handsFree: boolean;
  /** The engine room the rehearsal preview shows (null before the first rehearsal). */
  room: string | null;
  autopilot: AutopilotView | null;
  /** What happened, newest first, with the beat it happened in. */
  log: Array<{ t: number; beat: number; text: string }>;
  error: string | null;
}
