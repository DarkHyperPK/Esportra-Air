// The OBS scene model from PRD picture 9: five scenes Esportra builds, each holding browser sources
// (the graphics) and, where the crew brings their own video, empty "slots" they fill in OBS.

export const SCENE_KEYS = ['holding', 'gameplay', 'fullscreen', 'replay', 'casters'] as const;
export type SceneKey = (typeof SCENE_KEYS)[number];

export type SlotId = 'game' | 'cam1' | 'cam2';

export interface SlotDef {
  id: SlotId;
  label: string;
  /** Nested scene Air creates; the crew adds their own source inside it. */
  scene: string;
  /** Where it sits inside its parent scene (1920×1080 canvas). */
  frame: { x: number; y: number; width: number; height: number };
}

export interface SceneDef {
  key: SceneKey;
  name: string;
  label: string;
  note: string;
  slots: SlotDef[];
  /** Only one graphic is visible at a time (full-screen graphics); the first starts visible. */
  exclusive: boolean;
}

export const PREFIX = 'Esportra · ';

export const SCENES: Record<SceneKey, SceneDef> = {
  holding: { key: 'holding', name: `${PREFIX}Holding`, label: 'Holding', note: 'Starting soon, break, ending', slots: [], exclusive: false },
  gameplay: {
    key: 'gameplay', name: `${PREFIX}Gameplay`, label: 'Gameplay', note: 'Live rounds', exclusive: false,
    slots: [{ id: 'game', label: 'Game feed', scene: `${PREFIX}Game feed`, frame: { x: 0, y: 0, width: 1920, height: 1080 } }],
  },
  fullscreen: { key: 'fullscreen', name: `${PREFIX}Fullscreen`, label: 'Fullscreen', note: 'Intro, veto, agent select, results (one host source)', slots: [], exclusive: false },
  replay: { key: 'replay', name: `${PREFIX}Replay`, label: 'Replay', note: 'Replays', slots: [], exclusive: false },
  casters: {
    key: 'casters', name: `${PREFIX}Casters`, label: 'Casters', note: 'Desk segments', exclusive: false,
    slots: [
      // The casters graphic cuts two 820×462 windows at these positions; the cameras sit behind them.
      { id: 'cam1', label: 'Caster cam 1', scene: `${PREFIX}Caster cam 1`, frame: { x: 120, y: 250, width: 820, height: 462 } },
      { id: 'cam2', label: 'Caster cam 2', scene: `${PREFIX}Caster cam 2`, frame: { x: 980, y: 250, width: 820, height: 462 } },
    ],
  },
};

export const sourceName = (title: string) => `${PREFIX}${title}`;
