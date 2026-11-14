// What Air builds in OBS, as plain data (PRD picture 9): its five scenes, the browser source of each
// graphic in its scene, the slot scenes the crew fills, the desk cameras and the hidden sponsor loops.
// A pure function of the setup and the match's people, so it can be checked without OBS.
import { SCENE_KEYS, SCENES, graphicSourceName, legacySourceName, sourceName } from '../shared/scenes.ts';
import { cameraViewUrl, type OnAir } from '../shared/model.ts';
import type { Screen } from '../shared/api.ts';
import type { BuildScene, BuildSlot } from './scene-build.ts';

export interface PlanInput {
  /** The graphics engine's port (sources load http://127.0.0.1:<port>/o/<output>). */
  port: number;
  screens: Screen[];
  talent: OnAir['talent'];
  sponsors: OnAir['sponsors'];
  /** Whether a slot scene is wanted (Break's two windows only with the frame look). */
  slotWanted(id: string): boolean;
}

export function planScenes({ port, screens, talent, sponsors, slotWanted }: PlanInput): BuildScene[] {
  const full = { x: 0, y: 0, width: 1920, height: 1080 };
  // Sponsor loops of the match's sponsors, hidden until shown (a break, or by autopilot).
  const sponsorVideos = sponsors.filter((x) => x.video);
  // The desk's two camera windows: the first two people on air with a camera, in the event's order.
  const cams = talent.filter((t) => t.camera.kind !== 'none').slice(0, 2);
  const deskFill = (slot: string): BuildSlot['fill'] | null => {
    const t = cams[slot === 'cam1' ? 0 : slot === 'cam2' ? 1 : 2];
    if (!t) return null;
    if (t.camera.kind === 'obs' && t.camera.obsSource) return { kind: 'source', sourceName: t.camera.obsSource };
    if (t.camera.kind === 'link' && t.camera.linkId) return { kind: 'link', inputName: sourceName(`Camera · ${t.name}`), url: cameraViewUrl(t.camera.linkId) };
    return null;
  };
  const page = (x: Screen) => `http://127.0.0.1:${port}/o/${x.outputId}`;
  const host = screens.filter((x) => x.id === 'fullscreen' && x.enabled);
  return SCENE_KEYS.map((key) => {
    const def = SCENES[key];
    return {
      name: def.name,
      formerly: def.formerly,
      exclusive: def.exclusive,
      // Break's two windows exist only when Break uses the frame look.
      slots: def.slots.filter((slot) => slotWanted(slot.id)).map((slot) => ({ id: slot.id, sceneName: slot.scene, formerly: slot.formerly, frame: slot.frame, ...(deskFill(slot.id) ? { fill: deskFill(slot.id)! } : {}) })),
      sources: [
        ...screens
          .filter((x) => x.scene === key && x.enabled && !x.hosted)
          .map((x) => ({ id: x.id, inputName: graphicSourceName(x.title), formerly: legacySourceName(x.title), url: page(x), frame: x.frame, enabled: true })),
        // Full-screen graphics also cover the game: Take shows them without switching OBS scenes.
        ...(key === 'gameplay' ? host.map((x) => ({ id: 'fullscreen-over-game', inputName: sourceName('Full screen over game'), formerly: legacySourceName('Full screen over game'), url: page(x), frame: x.frame, enabled: true })) : []),
        // Over-the-game graphics also sit over the desk cameras (as bands over a stage shot).
        ...(key === 'casters' ? host.map((x) => ({ id: 'fullscreen-over-desk', inputName: sourceName('Full screen over desk'), formerly: legacySourceName('Full screen over desk'), url: page(x), frame: x.frame, enabled: true })) : []),
        ...(key === 'holding' ? sponsorVideos.map((x) => ({ id: `sponsor:${x.id}`, inputName: sourceName(`Sponsor video · ${x.name}`), kind: 'media' as const, url: x.video, frame: full, enabled: false })) : []),
      ],
    };
  });
}

/** Drift: what Air put in its own scenes that is no longer there (deleted or renamed in OBS since). Scenes not in OBS are left to the missing-scenes check. */
export function sourcesMissing(plan: BuildScene[], items: Record<string, string[]>): string[] {
  return plan.flatMap((scene) => {
    const have = items[scene.name];
    if (!have) return [];
    return [...scene.sources.map((x) => x.inputName), ...scene.slots.map((x) => x.sceneName)].filter((n) => !have.includes(n));
  });
}
