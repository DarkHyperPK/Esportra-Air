// How the over-the-game graphics fit this production (approved mock, 13 Nov).

/** Where the game draws its round timer, so the scorebug's window lines up with it (1920×1080 canvas). */
export interface TimerWindow {
  /** Pixels left (−) or right (+) from the centre. */
  dx: number;
  /** Width of the window in pixels. */
  width: number;
  /** The plate's colour, matched to the game's timer box (#rrggbb). */
  plate: string;
}

export interface Look {
  timer: TimerWindow;
  /** Tech pause and timeout: the centred panel, or a box at the top left. */
  pause: 'panel' | 'box';
  /** Starting soon, Break and Ending: the classic screen, or a frame with two see-through windows. */
  break: 'classic' | 'frame';
}

export const DEFAULT_LOOK: Look = { timer: { dx: 0, width: 160, plate: '#17181e' }, pause: 'box', break: 'classic' };

/** Graphics with an over-the-game version (core/bands.js `HUD.BANDS`), by screen id. */
export const BAND_SCREENS = new Set(['match-intro', 'map-veto', 'agent-select', 'map-result', 'series', 'halftime', 'standings', 'player-profile', 'schedule']);
/** The page that previews each one over the game. */
export const bandOverlay = (id: string) => (id === 'schedule' ? 'schedule-band' : `${id}-band`);

export function lookOf(saved: Partial<Look> | undefined): Look {
  return { ...DEFAULT_LOOK, ...(saved ?? {}), timer: { ...DEFAULT_LOOK.timer, ...(saved?.timer ?? {}) } };
}

/** Checks a look from the interface; throws a plain message when it cannot be used. */
export function validLook(input: Partial<Look>, current: Look): Look {
  const next = lookOf({ ...current, ...input, timer: { ...current.timer, ...(input.timer ?? {}) } });
  const t = next.timer;
  if (!Number.isInteger(t.dx) || t.dx < -200 || t.dx > 200) throw new Error('Move the timer window by up to 200 pixels.');
  if (!Number.isInteger(t.width) || t.width < 100 || t.width > 240) throw new Error('Keep the timer window 100–240 pixels wide.');
  if (!/^#[0-9a-f]{6}$/i.test(t.plate)) throw new Error('Choose a colour like #17181e.');
  if (next.pause !== 'panel' && next.pause !== 'box') throw new Error('Choose the pause panel or the box.');
  if (next.break !== 'classic' && next.break !== 'frame') throw new Error('Choose the classic break or the frame.');
  return next;
}
