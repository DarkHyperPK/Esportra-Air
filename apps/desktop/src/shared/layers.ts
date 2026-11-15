// The console's graphic layers (PRD picture 8): In-game 1–8, Between rounds Q–I, Full screen A–J.
// Engine layers map to the HUD's show flags; full-screen rows pick which graphic the Fullscreen
// OBS scene shows.

export type LayerGroup = 'ingame' | 'between' | 'fullscreen';
export type LayerMode = 'on' | 'off' | 'auto';

export interface LayerDef {
  /** Engine layer key, or `fs:<screen id>` for a full-screen graphic. */
  id: string;
  label: string;
  group: LayerGroup;
  hotkey: string;
}

export const LAYER_DEFS: LayerDef[] = [
  { id: 'scorebug', label: 'Scorebug', group: 'ingame', hotkey: '1' },
  { id: 'players', label: 'Player cards', group: 'ingame', hotkey: '2' },
  { id: 'winProb', label: 'Win probability (est.)', group: 'ingame', hotkey: '3' },
  { id: 'spikeTimer', label: 'Spike timer', group: 'ingame', hotkey: '4' },
  { id: 'sponsor', label: 'Sponsor bug', group: 'ingame', hotkey: '5' },
  { id: 'economy', label: 'Economy board', group: 'between', hotkey: 'Q' },
  { id: 'roundRecap', label: 'Round recap', group: 'between', hotkey: 'W' },
  { id: 'scoreboard', label: 'Scoreboard', group: 'between', hotkey: 'E' },
  { id: 'duel', label: 'Duel', group: 'between', hotkey: 'R' },
  { id: 'teamCompare', label: 'Team compare', group: 'between', hotkey: 'T' },
  { id: 'lowerThird', label: 'Lower third', group: 'between', hotkey: 'Y' },
  { id: 'ticker', label: 'Ticker', group: 'between', hotkey: 'U' },
  { id: 'poll', label: 'Poll', group: 'between', hotkey: 'I' },
  { id: 'fs:map-result', label: 'Map result', group: 'fullscreen', hotkey: 'A' },
  { id: 'fs:series', label: 'Series', group: 'fullscreen', hotkey: 'Shift+S' },
  { id: 'fs:halftime', label: 'Halftime', group: 'fullscreen', hotkey: 'D' },
  { id: 'fs:player-profile', label: 'Player profile', group: 'fullscreen', hotkey: 'F' },
  { id: 'fs:standings', label: 'Standings', group: 'fullscreen', hotkey: 'G' },
  { id: 'fs:agent-select', label: 'Agent select', group: 'fullscreen', hotkey: 'Shift+H' },
  { id: 'fs:champion', label: 'Champion', group: 'fullscreen', hotkey: 'J' },
  { id: 'fs:cam-grid', label: 'Player cams', group: 'fullscreen', hotkey: 'K' },
  // Before the match, and the post-game set (15 Nov).
  { id: 'fs:match-intro', label: 'Match intro', group: 'fullscreen', hotkey: 'M' },
  { id: 'fs:map-veto', label: 'Map veto', group: 'fullscreen', hotkey: 'V' },
  { id: 'fs:schedule', label: 'Today’s schedule', group: 'fullscreen', hotkey: 'O' },
  { id: 'fs:bracket', label: 'Bracket', group: 'fullscreen', hotkey: 'B' },
  { id: 'fs:map-breakdown', label: 'Map breakdown', group: 'fullscreen', hotkey: 'N' },
  { id: 'fs:postgame-player', label: 'Player of the map', group: 'fullscreen', hotkey: 'L' },
  { id: 'fs:postgame-matchup', label: 'Matchup', group: 'fullscreen', hotkey: 'X' },
];

/** Layers where Auto means something (rules or the HUD decide until the producer overrides). */
export const AUTO_LAYERS = new Set(['spikeTimer', 'sponsor', 'economy', 'roundRecap', 'lowerThird']);

/** Setup's "In-game HUD" switches that are console layers; the rest stay plain HUD flags. */
export const SETUP_LAYER_KEYS = ['scorebug', 'players', 'winProb', 'spikeTimer', 'sponsor', 'ticker'] as const;

/** Valorant's own observer UI already shows these, so Air keeps them off (decision R2). */
export const GAME_DRAWS = ['killfeed', 'observed', 'minimap'] as const;

/** The mode a layer starts in when Setup has it switched on. */
export const defaultMode = (id: string): LayerMode => (AUTO_LAYERS.has(id) ? 'auto' : 'on');

/** Next mode when the producer clicks a row: Auto → On → Off → Auto, or On ↔ Off. */
export function nextMode(id: string, current: LayerMode): LayerMode {
  if (AUTO_LAYERS.has(id)) return current === 'auto' ? 'on' : current === 'on' ? 'off' : 'auto';
  return current === 'on' ? 'off' : 'on';
}

/** Whether a key press is this layer hotkey. Plain letters never match a Shift+ hotkey (H and S belong to autopilot). */
export function hotkeyMatches(hotkey: string, event: { key: string; shiftKey: boolean }): boolean {
  if (hotkey.startsWith('Shift+')) return event.shiftKey && event.key.toUpperCase() === hotkey.slice(6);
  return !event.shiftKey && event.key.toLowerCase() === hotkey.toLowerCase();
}

/** The label on a hotkey badge. */
export const hotkeyLabel = (hotkey: string) => (hotkey.startsWith('Shift+') ? `Sh+${hotkey.slice(6)}` : hotkey);
