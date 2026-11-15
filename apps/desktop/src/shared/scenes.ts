// The OBS scene model from PRD picture 9: five scenes Esportra builds, each holding browser sources
// (the graphics) and, where the crew brings their own video, empty "slots" they fill in OBS.

export const SCENE_KEYS = ['holding', 'gameplay', 'fullscreen', 'replay', 'casters'] as const;
export type SceneKey = (typeof SCENE_KEYS)[number];

export type SlotId = 'game' | 'cam1' | 'cam2' | 'break1' | 'break2';

export interface SlotDef {
  id: SlotId;
  label: string;
  /** Nested scene Air creates; the crew adds their own source inside it. */
  scene: string;
  /** Its name before 12 November 2026, renamed in place when Air finds it. */
  formerly: string;
  /** Where it sits inside its parent scene (1920×1080 canvas). */
  frame: { x: number; y: number; width: number; height: number };
}

export interface SceneDef {
  key: SceneKey;
  name: string;
  /** Its name before 12 November 2026, renamed in place when Air finds it. */
  formerly: string;
  label: string;
  note: string;
  slots: SlotDef[];
  /** Only one graphic is visible at a time (full-screen graphics); the first starts visible. */
  exclusive: boolean;
}

/** Every scene and source Air adds to OBS starts with this, so a crew can tell them apart at a glance. */
export const PREFIX = 'ESPORTRA · ';
/** The prefix before 12 November 2026. Air renames its own scenes and sources from it in place. */
export const LEGACY_PREFIX = 'Esportra · ';

export const SCENES: Record<SceneKey, SceneDef> = {
  holding: {
    key: 'holding', name: `${PREFIX}Break`, formerly: `${LEGACY_PREFIX}Holding`, label: 'Break', note: 'Starting soon, breaks, ending, sponsor videos', exclusive: false,
    // The break frame (Look: frame) cuts two 850×480 windows here; a sponsor video and a camera sit behind them.
    slots: [
      { id: 'break1', label: 'Break window 1', scene: `${PREFIX}Break window 1`, formerly: `${LEGACY_PREFIX}Break window 1`, frame: { x: 96, y: 300, width: 850, height: 480 } },
      { id: 'break2', label: 'Break window 2', scene: `${PREFIX}Break window 2`, formerly: `${LEGACY_PREFIX}Break window 2`, frame: { x: 974, y: 300, width: 850, height: 480 } },
    ],
  },
  gameplay: {
    key: 'gameplay', name: `${PREFIX}Gameplay`, formerly: `${LEGACY_PREFIX}Gameplay`, label: 'Gameplay', note: 'Live rounds', exclusive: false,
    slots: [{ id: 'game', label: 'Game feed', scene: `${PREFIX}Game feed`, formerly: `${LEGACY_PREFIX}Game feed`, frame: { x: 0, y: 0, width: 1920, height: 1080 } }],
  },
  fullscreen: { key: 'fullscreen', name: `${PREFIX}Full screen`, formerly: `${LEGACY_PREFIX}Fullscreen`, label: 'Full screen', note: 'Intro, veto, agent select, results (one host source)', slots: [], exclusive: false },
  replay: { key: 'replay', name: `${PREFIX}Replay`, formerly: `${LEGACY_PREFIX}Replay`, label: 'Replay', note: 'Replays', slots: [], exclusive: false },
  casters: {
    key: 'casters', name: `${PREFIX}Desk`, formerly: `${LEGACY_PREFIX}Casters`, label: 'Desk', note: 'Talent on camera', exclusive: false,
    slots: [
      // The desk graphic cuts two 820×462 windows at these positions; the cameras sit behind them.
      { id: 'cam1', label: 'Desk camera 1', scene: `${PREFIX}Desk camera 1`, formerly: `${LEGACY_PREFIX}Caster cam 1`, frame: { x: 120, y: 250, width: 820, height: 462 } },
      { id: 'cam2', label: 'Desk camera 2', scene: `${PREFIX}Desk camera 2`, formerly: `${LEGACY_PREFIX}Caster cam 2`, frame: { x: 980, y: 250, width: 820, height: 462 } },
    ],
  },
};

export const sourceName = (title: string) => `${PREFIX}${title}`;
export const legacySourceName = (title: string) => `${LEGACY_PREFIX}${title}`;
/** Every scene name Air uses. OBS keeps scenes and sources in one list of names, so a source can't share one. */
export const sceneNames = () => SCENE_KEYS.flatMap((k) => [SCENES[k].name, ...SCENES[k].slots.map((slot) => slot.scene)]);
/** A graphic's browser source: its title, or "<title> graphics" where that would be a scene's name (Full screen). */
export const graphicSourceName = (title: string) => (sceneNames().includes(sourceName(title)) ? sourceName(`${title} graphics`) : sourceName(title));
/** True for anything Air named, now or before the rename. */
export const isAirName = (name: string) => name.startsWith(PREFIX) || name.startsWith(LEGACY_PREFIX);
/** The part after the prefix, for labels. */
export const shortName = (name: string) => name.replace(PREFIX, '').replace(LEGACY_PREFIX, '');

/** A page drawn in a preview of a scene; `over` = the full-screen host showing only overlay bar versions. */
export interface ScenePage { overlay: string; over?: boolean }

/**
 * The Air pages that are in an OBS scene, as Air builds it (see `planScenes` in `src/main/scene-plan.ts`),
 * so a preview of OBS program draws only what that scene really shows. `null` for a scene that is not
 * Air's (the crew's own); without OBS (no scene) the sample is the HUD with overlay bars over the game.
 */
export function pagesForScene(sceneName: string | null, screens: Array<{ id: string; overlay: string; scene: SceneKey; enabled: boolean; hosted?: boolean }>): ScenePage[] | null {
  const host = screens.find((x) => x.id === 'fullscreen' && x.enabled);
  if (sceneName === null) return [{ overlay: 'ingame' }, { overlay: 'fullscreen', over: true }];
  const key = SCENE_KEYS.find((k) => SCENES[k].name === sceneName || SCENES[k].formerly === sceneName);
  if (!key) return null;
  const pages: ScenePage[] = screens.filter((x) => x.scene === key && x.enabled && !x.hosted).map((x) => ({ overlay: x.overlay }));
  if (host && (key === 'gameplay' || key === 'casters')) pages.push({ overlay: 'fullscreen', over: true });
  return pages;
}
