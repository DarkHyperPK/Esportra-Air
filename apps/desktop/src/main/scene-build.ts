// Builds Air's scenes in OBS (PRD picture 9) and reads back which slots the crew has filled.
//
// Air only ever creates and updates what it owns: its five scenes, the browser sources in them, and
// the empty slot scenes the crew puts their own video into. It never switches, streams or records.
// Ported and extended from src/obs-template-push.js (collision and live-output checks).

import type { SlotId } from '../shared/scenes.ts';
import type { ObsSocket } from './obs-types.ts';

export interface BuildSource {
  /** Stable key (the screen id). */
  id: string;
  inputName: string;
  /** The input's name before a rename; Air renames its own input in place. */
  formerly?: string;
  /** A graphic page (browser source, the default) or a video file on this PC (media source, looping). */
  kind?: 'browser' | 'media';
  /** browser: the page; media: the file path. */
  url: string;
  frame: { x: number; y: number; width: number; height: number };
  enabled: boolean;
}

export interface BuildSlot {
  id: SlotId;
  sceneName: string;
  formerly?: string;
  /** What Air puts in the slot (a talent camera): a camera link page, or an OBS source the crew has. */
  fill?: { kind: 'link'; inputName: string; url: string } | { kind: 'source'; sourceName: string };
  frame: { x: number; y: number; width: number; height: number };
}

export interface BuildScene {
  name: string;
  formerly?: string;
  exclusive: boolean;
  sources: BuildSource[];
  slots: BuildSlot[];
}

/** What Air has created in OBS, so re-installing only touches its own things. */
export interface Owned {
  scenes: Record<string, { items: Record<string, { sceneItemId: number; geometry: string }> }>;
}

export const emptyOwned = (): Owned => ({ scenes: {} });

const geometry = (f: { x: number; y: number; width: number; height: number }) => JSON.stringify([f.x, f.y, f.width, f.height]);
const transform = (f: { x: number; y: number; width: number; height: number }, bounds: string) => ({
  positionX: f.x, positionY: f.y, alignment: 5, boundsAlignment: 5, boundsType: bounds, boundsWidth: f.width, boundsHeight: f.height,
});

const kindOf = (source: BuildSource) => (source.kind === 'media' ? 'ffmpeg_source' : 'browser_source');
const settingsOf = (source: BuildSource) => (source.kind === 'media'
  // A sponsor loop: plays from the start whenever the producer shows it, and loops until hidden.
  ? { local_file: source.url, looping: true, restart_on_activate: true, close_when_inactive: true }
  : { url: source.url, width: 1920, height: 1080, fps: 60, reroute_audio: false, shutdown: false });

/**
 * Puts a talent camera in its slot scene: a camera link as a browser source Air owns, or the crew's own
 * OBS source added as an item. Anything else in the slot is left as it is.
 */
async function fillSlot(call: (name: string, data?: Record<string, unknown>) => Promise<any>, slot: BuildSlot, inputs: Map<string, { inputKind: string }>, own: (scene: string) => Owned['scenes'][string]) {
  const fill = slot.fill!;
  const items: Array<{ sourceName: string; sceneItemId: number }> = (await call('GetSceneItemList', { sceneName: slot.sceneName })).sceneItems ?? [];
  const full = { x: 0, y: 0, width: 1920, height: 1080 };
  if (fill.kind === 'source') {
    if (!inputs.has(fill.sourceName)) throw new Error(`OBS has no source called “${fill.sourceName}”. Choose the camera again in Event.`);
    if (!items.some((i) => i.sourceName === fill.sourceName)) await call('CreateSceneItem', { sceneName: slot.sceneName, sourceName: fill.sourceName, sceneItemEnabled: true });
    return;
  }
  const input = inputs.get(fill.inputName);
  if (input && input.inputKind !== 'browser_source') throw new Error(`The OBS source “${fill.inputName}” already exists. Rename it in OBS.`);
  if (!input) {
    const made = await call('CreateInput', { sceneName: slot.sceneName, inputName: fill.inputName, inputKind: 'browser_source', inputSettings: { url: fill.url, width: 1920, height: 1080, fps: 30, reroute_audio: false, shutdown: false }, sceneItemEnabled: true });
    await call('SetSceneItemTransform', { sceneName: slot.sceneName, sceneItemId: made.sceneItemId, sceneItemTransform: transform(full, 'OBS_BOUNDS_SCALE_INNER') });
    inputs.set(fill.inputName, { inputKind: 'browser_source' });
    own(slot.sceneName).items[`fill:${fill.inputName}`] = { sceneItemId: made.sceneItemId, geometry: geometry(full) };
    return;
  }
  const settings = await call('GetInputSettings', { inputName: fill.inputName });
  if (settings.inputSettings?.url !== fill.url) await call('SetInputSettings', { inputName: fill.inputName, inputSettings: { url: fill.url }, overlay: true });
  if (!items.some((i) => i.sourceName === fill.inputName)) await call('CreateSceneItem', { sceneName: slot.sceneName, sourceName: fill.inputName, sceneItemEnabled: true });
}

export async function buildScenes(options: { socket: ObsSocket; scenes: BuildScene[]; owned: Owned; saveOwned: (owned: Owned) => void }) {
  const { socket, saveOwned } = options;
  const call = (name: string, data?: Record<string, unknown>) => socket.call(name, data);
  const [stream, record, sceneList, inputList] = await Promise.all(['GetStreamStatus', 'GetRecordStatus', 'GetSceneList', 'GetInputList'].map((n) => call(n)));
  if (stream.outputActive !== false || record.outputActive !== false) {
    throw new Error('Stop streaming and recording in OBS before adding or updating Esportra scenes, so nothing on air reloads.');
  }
  const existing = new Set<string>((sceneList.scenes ?? []).map((s: { sceneName: string }) => s.sceneName));
  const inputs = new Map<string, { inputKind: string }>((inputList.inputs ?? []).map((i: { inputName: string; inputKind: string }) => [i.inputName, i]));
  const owned: Owned = { scenes: { ...options.owned.scenes } };

  // Names Air used before: rename its own scenes and inputs in place, so nothing is duplicated and
  // anything the crew placed inside them stays. Only things Air created are touched.
  for (const scene of options.scenes) {
    for (const [now, before] of [[scene.name, scene.formerly], ...scene.slots.map((x) => [x.sceneName, x.formerly])] as Array<[string, string | undefined]>) {
      if (!before || existing.has(now) || !existing.has(before) || !owned.scenes[before]) continue;
      await call('SetSceneName', { sceneName: before, newSceneName: now });
      existing.delete(before);
      existing.add(now);
      owned.scenes[now] = owned.scenes[before]!;
      delete owned.scenes[before];
      options.saveOwned({ scenes: { ...owned.scenes } });
    }
    for (const source of scene.sources) {
      const before = source.formerly;
      if (!before || inputs.has(source.inputName) || !inputs.has(before) || !owned.scenes[scene.name]?.items[`src:${source.id}`]) continue;
      await call('SetInputName', { inputName: before, newInputName: source.inputName });
      inputs.set(source.inputName, inputs.get(before)!);
      inputs.delete(before);
    }
  }

  // Preflight every collision before creating anything.
  for (const scene of options.scenes) {
    if (existing.has(scene.name) && !owned.scenes[scene.name]) throw new Error(`OBS already has a scene called “${scene.name}” that Air did not create. Rename it in OBS.`);
    for (const slot of scene.slots) {
      if (existing.has(slot.sceneName) && !owned.scenes[slot.sceneName]) throw new Error(`OBS already has a scene called “${slot.sceneName}” that Air did not create. Rename it in OBS.`);
    }
    for (const source of scene.sources) {
      const input = inputs.get(source.inputName);
      if (input && (!owned.scenes[scene.name] || input.inputKind !== kindOf(source))) throw new Error(`The OBS source “${source.inputName}” already exists. Rename it in OBS.`);
    }
  }

  const created: string[] = [];
  const own = (sceneName: string) => (owned.scenes[sceneName] ??= { items: {} });
  const save = () => saveOwned({ scenes: { ...owned.scenes } });

  for (const scene of options.scenes) {
    if (!existing.has(scene.name)) {
      await call('CreateScene', { sceneName: scene.name });
      created.push(scene.name);
    }
    own(scene.name);
    save();

    for (const source of scene.sources) {
      const key = `src:${source.id}`;
      const mine = own(scene.name).items[key];
      let sceneItemId: number | undefined = mine?.sceneItemId;
      const items = (await call('GetSceneItemList', { sceneName: scene.name })).sceneItems ?? [];
      const present = items.find((i: { sourceName: string }) => i.sourceName === source.inputName);
      // A scene or item created now has no transform yet, whatever Air recorded before.
      const fresh = !inputs.has(source.inputName) || present === undefined;
      if (!inputs.has(source.inputName)) {
        const made = await call('CreateInput', {
          sceneName: scene.name, inputName: source.inputName, inputKind: kindOf(source), inputSettings: settingsOf(source),
          // Exclusive scenes (full-screen graphics) start with only the first graphic visible.
          sceneItemEnabled: scene.exclusive ? source === scene.sources.find((s) => s.enabled) : source.enabled,
        });
        sceneItemId = made.sceneItemId;
      } else {
        const settings = await call('GetInputSettings', { inputName: source.inputName });
        const field = source.kind === 'media' ? 'local_file' : 'url';
        if (settings.inputSettings?.[field] !== source.url) await call('SetInputSettings', { inputName: source.inputName, inputSettings: { [field]: source.url }, overlay: true });
        sceneItemId = present?.sceneItemId ?? (await call('CreateSceneItem', { sceneName: scene.name, sourceName: source.inputName, sceneItemEnabled: source.enabled })).sceneItemId;
      }
      if (!Number.isInteger(sceneItemId)) throw new Error('OBS did not confirm the graphics source. Try again.');
      // Re-installing keeps layout edits made directly in OBS unless Air's own layout changed.
      if (fresh || mine?.geometry !== geometry(source.frame)) {
        await call('SetSceneItemTransform', { sceneName: scene.name, sceneItemId, sceneItemTransform: transform(source.frame, 'OBS_BOUNDS_STRETCH') });
      }
      own(scene.name).items[key] = { sceneItemId: sceneItemId as number, geometry: geometry(source.frame) };
      save();
    }

    // Graphics Air placed earlier that this build no longer has (e.g. one source per full-screen
    // graphic, now one full-screen host): remove only Air's own scene items.
    const wanted = new Set(scene.sources.map((s) => `src:${s.id}`));
    for (const [key, item] of Object.entries(own(scene.name).items)) {
      if (!key.startsWith('src:') || wanted.has(key)) continue;
      await call('RemoveSceneItem', { sceneName: scene.name, sceneItemId: item.sceneItemId }).catch(() => {});
      delete own(scene.name).items[key];
      save();
    }

    for (const slot of scene.slots) {
      const key = `slot:${slot.id}`;
      const mine = own(scene.name).items[key];
      if (!existing.has(slot.sceneName)) {
        await call('CreateScene', { sceneName: slot.sceneName });
        created.push(slot.sceneName);
      }
      own(slot.sceneName);
      const items = (await call('GetSceneItemList', { sceneName: scene.name })).sceneItems ?? [];
      let sceneItemId: number | undefined = items.find((i: { sourceName: string }) => i.sourceName === slot.sceneName)?.sceneItemId;
      const fresh = sceneItemId === undefined;
      if (sceneItemId === undefined) {
        sceneItemId = (await call('CreateSceneItem', { sceneName: scene.name, sourceName: slot.sceneName, sceneItemEnabled: true })).sceneItemId;
        // Video stays below the graphics.
        await call('SetSceneItemIndex', { sceneName: scene.name, sceneItemId, sceneItemIndex: 0 });
      }
      if (fresh || mine?.geometry !== geometry(slot.frame)) {
        await call('SetSceneItemTransform', { sceneName: scene.name, sceneItemId, sceneItemTransform: transform(slot.frame, 'OBS_BOUNDS_SCALE_INNER') });
      }
      own(scene.name).items[key] = { sceneItemId: sceneItemId as number, geometry: geometry(slot.frame) };
      save();
      // A camera Air put in this slot for someone no longer there leaves it (only Air's own item).
      const keep = slot.fill?.kind === 'link' ? `fill:${slot.fill.inputName}` : null;
      for (const [k, item] of Object.entries(own(slot.sceneName).items)) {
        if (!k.startsWith('fill:') || k === keep) continue;
        await call('RemoveSceneItem', { sceneName: slot.sceneName, sceneItemId: item.sceneItemId }).catch(() => {});
        delete own(slot.sceneName).items[k];
      }
      if (slot.fill) await fillSlot(call, slot, inputs, own);
      save();
    }
  }
  return { created, owned };
}

/** For each slot scene: the first source the crew has added to it, or null. Missing scenes read as empty. */
export async function readSlots(socket: ObsSocket, slotScenes: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    slotScenes.map(async (name) => {
      try {
        const { sceneItems = [] } = await socket.call('GetSceneItemList', { sceneName: name });
        out[name] = (sceneItems as Array<{ sourceName: string }>)[0]?.sourceName ?? null;
      } catch {
        out[name] = null;
      }
    }),
  );
  return out;
}
