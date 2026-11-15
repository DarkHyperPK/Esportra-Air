// The HUD library: every graphic Air ships for a game, what it is for and when it appears.

import type { GameId } from './games.ts';
import type { Setup } from './api.ts';

export type LibraryGroup = 'ingame' | 'between' | 'fullscreen' | 'show';

export interface LibraryItem {
  overlay: string;
  title: string;
  group: LibraryGroup;
  /** What it shows, in one line. */
  what: string;
  /** When it is on screen. */
  when: string;
  /** Where it lives in OBS. */
  scene: string;
}

export const LIBRARY_GROUPS: Array<[LibraryGroup, string]> = [
  ['ingame', 'In-game'],
  ['between', 'Between rounds'],
  ['fullscreen', 'Full screen'],
  ['show', 'Holding, breaks and talent'],
];

/** The sample room the library previews play in (ephemeral: never saved). */
export const LIBRARY_ROOM = '__ESA_SIM_LIB';

export const LIBRARY: Record<GameId, LibraryItem[]> = {
  valorant: [
    { overlay: 'ingame', title: 'In-game HUD (all-in-one)', group: 'ingame', what: 'Scorebug, player cards and every in-round graphic in one source.', when: 'During live rounds.', scene: 'Gameplay' },
    { overlay: 'scorebug', title: 'Scorebug', group: 'ingame', what: 'Teams, logos, score and map wins around the game’s own round timer; the spike countdown when planted.', when: 'Always during play.', scene: 'Gameplay (in the HUD)' },
    { overlay: 'player-cards', title: 'Player cards', group: 'ingame', what: 'Agents, credits, weapons, ultimate; health and abilities from player PCs.', when: 'Always during play.', scene: 'Gameplay (in the HUD)' },
    { overlay: 'banners', title: 'Round banners', group: 'ingame', what: 'Ace, clutch, flawless, thrifty and round-win banners in your banner style.', when: 'Automatically on the moment.', scene: 'Gameplay (in the HUD)' },
    { overlay: 'lower-third', title: 'Lower third', group: 'ingame', what: 'Caster names, a player spotlight or a sponsor read.', when: 'When you trigger it (F5, F8) or on a 3+ kill callout.', scene: 'Gameplay (in the HUD)' },
    { overlay: 'toast', title: 'Toast', group: 'ingame', what: 'A short line of news over the game.', when: 'When you send one (F4).', scene: 'Gameplay (in the HUD)' },
    { overlay: 'poll', title: 'Poll', group: 'ingame', what: 'A question with two options and a split.', when: 'When you run one (F6).', scene: 'Gameplay (in the HUD)' },
    { overlay: 'win-probability', title: 'Win probability', group: 'ingame', what: 'A simple estimate from alive players, health and credits. Off by default.', when: 'During live rounds, if switched on.', scene: 'Gameplay (in the HUD)' },
    { overlay: 'economy', title: 'Economy board', group: 'between', what: 'Both teams’ credits, loadouts and loss bonus.', when: 'Buy phase (Auto).', scene: 'Gameplay (in the HUD)' },
    { overlay: 'round-recap', title: 'Round recap', group: 'between', what: 'How the round was won, damage and the round’s top player.', when: 'Round end (Auto).', scene: 'Gameplay (in the HUD)' },
    { overlay: 'scoreboard', title: 'Scoreboard', group: 'between', what: 'Full K/D/A, ACS and economy for all ten players.', when: 'When you call it (E).', scene: 'Gameplay (in the HUD)' },
    { overlay: 'duel', title: 'Duel', group: 'between', what: 'Two players side by side.', when: 'When you call it (R).', scene: 'Gameplay (in the HUD)' },
    { overlay: 'team-compare', title: 'Team compare', group: 'between', what: 'Team stats head to head.', when: 'When you call it (T).', scene: 'Gameplay (in the HUD)' },
    { overlay: 'ticker', title: 'Ticker', group: 'between', what: 'Scrolling headlines and results.', when: 'Holding screens and between maps.', scene: 'Holding' },
    { overlay: 'match-intro', title: 'Match intro', group: 'fullscreen', what: 'Both teams, logos and the format.', when: 'Before the match.', scene: 'Fullscreen' },
    { overlay: 'map-veto', title: 'Map veto', group: 'fullscreen', what: 'Bans, picks and sides.', when: 'After the veto.', scene: 'Fullscreen' },
    { overlay: 'agent-select', title: 'Agent select', group: 'fullscreen', what: 'Both lineups with their agents.', when: 'During agent select.', scene: 'Fullscreen' },
    { overlay: 'map-result', title: 'Map result', group: 'fullscreen', what: 'Final score and the map MVP.', when: 'When a map ends.', scene: 'Fullscreen' },
    { overlay: 'series', title: 'Series', group: 'fullscreen', what: 'Every map of the series and who won it.', when: 'Between maps.', scene: 'Fullscreen' },
    { overlay: 'halftime', title: 'Halftime', group: 'fullscreen', what: 'The first half in numbers.', when: 'After round 12.', scene: 'Fullscreen' },
    { overlay: 'player-profile', title: 'Player profile', group: 'fullscreen', what: 'One player: photo, agent and stats.', when: 'When you spotlight a player.', scene: 'Fullscreen' },
    { overlay: 'standings', title: 'Standings', group: 'fullscreen', what: 'The table.', when: 'Between matches.', scene: 'Fullscreen' },
    { overlay: 'bracket', title: 'Bracket', group: 'fullscreen', what: 'The playoff bracket: quarter-finals, semi-finals and the grand final.', when: 'Before and between matches.', scene: 'Fullscreen' },
    { overlay: 'schedule', title: 'Today’s schedule', group: 'fullscreen', what: 'The event’s matches today, with results.', when: 'Before and between matches.', scene: 'Fullscreen' },
    { overlay: 'champion', title: 'Champion', group: 'fullscreen', what: 'The winning team.', when: 'After the final.', scene: 'Fullscreen' },
    { overlay: 'cam-grid', title: 'Player cams', group: 'fullscreen', what: 'Five or ten player cameras.', when: 'When you show the cam wall (K).', scene: 'Fullscreen' },
    { overlay: 'holding', title: 'Holding', group: 'show', what: 'Starting soon, break and ending, with the next match. Or a frame with two see-through windows (Look in the Rundown).', when: 'Before, between and after.', scene: 'Holding' },
    { overlay: 'casters', title: 'Casters', group: 'show', what: 'Two caster camera windows with names.', when: 'Desk segments.', scene: 'Casters' },
    { overlay: 'replay', title: 'Replay bug', group: 'show', what: 'A “Replay” mark over replays.', when: 'While a replay plays.', scene: 'Replay' },
  ],
  cs2: [],
  lol: [],
  dota2: [],
};

// ── My show: which graphics this production uses (one list for every match) ──

/** How a library graphic joins My show. */
export type ShowLink = { kind: 'screen'; overlay: string } | { kind: 'hud'; key: string } | { kind: 'always' };

/** Graphics that are their own OBS source (matched to `Setup.screens` by overlay). */
const SCREEN_OVERLAYS = new Set(['holding', 'ticker', 'match-intro', 'map-veto', 'agent-select', 'map-result', 'series', 'halftime', 'player-profile', 'standings', 'schedule', 'bracket', 'champion', 'cam-grid', 'replay', 'casters']);
/** Elements inside the in-game HUD that can be switched off (`Setup.hud` keys). */
const HUD_KEYS: Record<string, string> = { scorebug: 'scorebug', 'player-cards': 'players', 'win-probability': 'winProb' };

export function showLink(item: Pick<LibraryItem, 'overlay'>): ShowLink {
  if (SCREEN_OVERLAYS.has(item.overlay)) return { kind: 'screen', overlay: item.overlay };
  const key = HUD_KEYS[item.overlay];
  if (key) return { kind: 'hud', key };
  // The in-game HUD itself, and what lives inside it (banners, lower third, toast, poll…).
  return { kind: 'always' };
}

type ShowSetup = Pick<Setup, 'screens' | 'hud'>;

export function inShow(setup: ShowSetup, item: Pick<LibraryItem, 'overlay'>): boolean {
  const link = showLink(item);
  if (link.kind === 'screen') return setup.screens.some((x) => x.overlay === link.overlay && x.enabled);
  if (link.kind === 'hud') return setup.hud[link.key] !== false;
  return true;
}

/** The setup change that adds or removes a graphic; null when it cannot change (always in the HUD). */
export function showPatch(setup: ShowSetup, item: Pick<LibraryItem, 'overlay'>, on: boolean): Partial<Setup> | null {
  const link = showLink(item);
  if (link.kind === 'screen') return { screens: setup.screens.map((x) => (x.overlay === link.overlay ? { ...x, enabled: on } : x)) };
  if (link.kind === 'hud') return { hud: { ...setup.hud, [link.key]: on } };
  return null;
}
