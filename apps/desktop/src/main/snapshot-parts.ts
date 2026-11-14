// Pure parts of the snapshot Air's interface reads: the game readout from the room, and what Air's
// OBS scenes look like against its plan. No state of their own, so each can be tested alone.
import { SCENE_KEYS, SCENES } from '../shared/scenes.ts';
import type { SceneStatus, Snapshot } from '../shared/api.ts';
import type { ObsStatus } from './obs.ts';
import type { BuildScene } from './scene-build.ts';
import { sourcesMissing } from './scene-plan.ts';

/** The match as the game reports it: map, round, score, players found, sides, alive, credits, clock. */
type Readout = NonNullable<Snapshot['readout']>;

export function roomReadout(room: any, observed: Readout['observed']): Readout {
  const named = (t: number) => (room?.players?.[t] ?? []).filter((p: { name?: string }) => p?.name).length;
  return {
    map: room.map?.name ?? null,
    round: Number.isFinite(room.round?.number) ? room.round.number : null,
    phase: room.round?.phase ?? null,
    score: [room.teams?.[0]?.score ?? null, room.teams?.[1]?.score ?? null] as [number | null, number | null],
    playersFound: [named(0), named(1)] as [number, number],
    sides: [room.teams?.[0]?.side ?? null, room.teams?.[1]?.side ?? null] as [string | null, string | null],
    alive: [0, 1].map((t) => (room.players?.[t] ?? []).filter((p: { alive?: boolean }) => p?.alive).length) as [number, number],
    bank: [0, 1].map((t) => (room.players?.[t] ?? []).reduce((sum: number, p: { credits?: number }) => sum + (Number(p?.credits) || 0), 0)) as [number, number],
    clockEndsAt: Number(room.round?.endsAt) > 0 ? Number(room.round.endsAt) : null,
    spikePlanted: room.round?.phase === 'planted',
    observed,
    roster: [0, 1].map((t) => (room.players?.[t] ?? []).map((p: { name?: string; inGameName?: string }) => ({ name: p?.name ?? '', inGameName: p?.inGameName ?? '' }))),
  };
}

/** Air's scenes in OBS: which are missing, which of its sources are gone (drift), and each scene's slots. */
export function obsSceneView(status: ObsStatus, plan: BuildScene[], slotWanted: (id: string) => boolean) {
  const wanted = SCENE_KEYS.flatMap((k) => [SCENES[k].name, ...SCENES[k].slots.filter((slot) => slotWanted(slot.id)).map((slot) => slot.scene)]);
  const missingScenes = wanted.filter((n) => !status.scenes.includes(n));
  // Drift: a source Air put in one of its scenes that is no longer there (deleted or renamed in OBS).
  const missingSources = status.state === 'connected' ? sourcesMissing(plan, status.items ?? {}) : [];
  const installed = status.state === 'connected' && missingScenes.length === 0 && missingSources.length === 0;
  const sceneStatus: SceneStatus[] = SCENE_KEYS.map((k) => ({
    key: k,
    name: SCENES[k].name,
    inObs: status.scenes.includes(SCENES[k].name),
    // The Break windows only need a source with the frame style.
    slots: SCENES[k].slots.filter((slot) => slotWanted(slot.id)).map((slot) => ({ id: slot.id, label: slot.label, scene: slot.scene, source: status.slots[slot.scene] ?? null })),
  }));
  return { missingScenes, missingSources, installed, sceneStatus };
}
