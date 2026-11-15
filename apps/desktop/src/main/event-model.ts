// Events, talent and sponsors: validation, the migration from per-match casters and sponsor names,
// and what a match puts on air from its event.

import { randomBytes, randomUUID } from 'node:crypto';
import type { Match } from '../shared/api.ts';
import {
  NO_CAMERA, SPACE_NAME, SPONSOR_SPACES, SPONSOR_TIERS, onAir, spacesOf, TALENT_ROLES, TIER_WEIGHT, type SponsorSpace,
  type Camera, type EventInfo, type EventPatch, type Sponsor, type SponsorInput, type Talent, type TalentInput,
} from '../shared/model.ts';
import { HEX, UUID, image, optionalText, text } from './validate.ts';

export const DEFAULT_ACCENT = '#8b7cf6';
const MAX_TALENT = 12;
const MAX_SPONSORS = 12;
const MAX_STAGES = 12;

export function newEvent(name: string, tournamentId: string | null = null): EventInfo {
  return { id: randomUUID(), name, stages: [], logo: '', logoLight: '', accent: DEFAULT_ACCENT, talent: [], sponsors: [], tournamentId };
}

/** A browser camera link id (the same form as player camera links). */
export const newLinkId = () => randomBytes(9).toString('base64url');

export function applyEventPatch(event: EventInfo, patch: EventPatch): EventInfo {
  const next = { ...event };
  if (patch.name !== undefined) next.name = text(patch.name, 60, 'Event name');
  if (patch.stages !== undefined) {
    if (!Array.isArray(patch.stages) || patch.stages.length > MAX_STAGES) throw new Error(`Add up to ${MAX_STAGES} stages.`);
    next.stages = [...new Set(patch.stages.map((s, i) => text(s, 40, `Stage ${i + 1}`)))];
  }
  if (patch.logo !== undefined) next.logo = image(patch.logo, 'Event logo');
  if (patch.logoLight !== undefined) next.logoLight = image(patch.logoLight, 'Event logo on light');
  if (patch.accent !== undefined) {
    if (typeof patch.accent !== 'string' || !HEX.test(patch.accent)) throw new Error('Choose the accent colour again.');
    next.accent = patch.accent.toLowerCase();
  }
  return next;
}

function validCamera(input: unknown, previous: Camera, label: string): Camera {
  const c = (input ?? {}) as Partial<Camera>;
  switch (c.kind) {
    case undefined: return previous;
    case 'none': return { ...NO_CAMERA };
    // A link keeps its id, so the person does not need a new one when other details change.
    case 'link': return { kind: 'link', linkId: previous.kind === 'link' && previous.linkId ? previous.linkId : newLinkId(), obsSource: null };
    case 'obs': return { kind: 'obs', linkId: null, obsSource: text(c.obsSource, 120, `${label}: OBS source`) };
    default: throw new Error(`${label}: choose the camera again.`);
  }
}

/** Adds or updates one person. A camera of kind `link` gets its link id here. */
export function upsertTalent(event: EventInfo, input: TalentInput): EventInfo {
  const existing = input.id ? event.talent.find((t) => t.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('That person is no longer in this event.');
  if (!existing && event.talent.length >= MAX_TALENT) throw new Error(`An event has up to ${MAX_TALENT} people on air.`);
  const base: Talent = existing ?? { id: randomUUID(), name: '', handle: '', role: 'play-by-play', photo: '', camera: { ...NO_CAMERA } };
  const role = input.role ?? base.role;
  if (!TALENT_ROLES.includes(role)) throw new Error('Choose the role again.');
  const label = existing?.name || 'New person';
  const person: Talent = {
    id: base.id,
    name: input.name !== undefined ? text(input.name, 40, 'Name') : text(base.name, 40, 'Name'),
    handle: input.handle !== undefined ? optionalText(input.handle, 40, 'Handle') : base.handle,
    role,
    photo: input.photo !== undefined ? image(input.photo, 'Photo') : base.photo,
    camera: validCamera(input.camera, base.camera, label),
  };
  const talent = existing ? event.talent.map((t) => (t.id === person.id ? person : t)) : [...event.talent, person];
  return { ...event, talent };
}

/** A fresh link id: the old link stops working. */
export function renewTalentLink(event: EventInfo, id: string): EventInfo {
  const person = event.talent.find((t) => t.id === id);
  if (!person) throw new Error('That person is no longer in this event.');
  if (person.camera.kind !== 'link') throw new Error(`${person.name} does not use a camera link.`);
  return { ...event, talent: event.talent.map((t) => (t.id === id ? { ...t, camera: { ...t.camera, linkId: newLinkId() } } : t)) };
}

export function upsertSponsor(event: EventInfo, input: SponsorInput): EventInfo {
  const existing = input.id ? event.sponsors.find((s) => s.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('That sponsor is no longer in this event.');
  if (!existing && event.sponsors.length >= MAX_SPONSORS) throw new Error(`An event has up to ${MAX_SPONSORS} sponsors.`);
  const base: Sponsor = existing ?? { id: randomUUID(), name: '', logo: '', logoLight: '', tier: 'partner', video: '', read: '' };
  const tier = input.tier ?? base.tier;
  if (!SPONSOR_TIERS.includes(tier)) throw new Error('Choose the sponsor tier again.');
  const sponsor: Sponsor = {
    id: base.id,
    name: input.name !== undefined ? text(input.name, 40, 'Sponsor name') : text(base.name, 40, 'Sponsor name'),
    logo: input.logo !== undefined ? image(input.logo, 'Sponsor logo') : base.logo,
    logoLight: input.logoLight !== undefined ? image(input.logoLight, 'Sponsor logo on light') : base.logoLight,
    tier,
    video: input.video !== undefined ? optionalText(input.video, 400, 'Sponsor video') : base.video,
    read: input.read !== undefined ? optionalText(input.read, 120, 'Sponsor read') : base.read,
    ...(input.spaces !== undefined ? { spaces: validSpaces(input.spaces) } : base.spaces ? { spaces: base.spaces } : {}),
  };
  const sponsors = existing ? event.sponsors.map((s) => (s.id === sponsor.id ? sponsor : s)) : [...event.sponsors, sponsor];
  return { ...event, sponsors };
}

/** The spaces a sponsor bought, each with an image Air can serve or '' for the main logo. */
export function validSpaces(input: unknown): NonNullable<Sponsor['spaces']> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose the sponsor\'s spaces again.');
  const out: NonNullable<Sponsor['spaces']> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(SPONSOR_SPACES as readonly string[]).includes(k)) throw new Error('Choose the sponsor\'s spaces again.');
    if (v === null || v === undefined || v === false) continue;
    out[k as SponsorSpace] = { logo: image((v as { logo?: unknown }).logo ?? '', `${SPACE_NAME[k as SponsorSpace]} logo`) };
  }
  return out;
}

/** Switch lists for a match: ids that are off. Unknown ids are dropped. */
export function validOff(ids: unknown, known: Array<{ id: string }>, label: string): string[] {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string' || !UUID.test(x))) throw new Error(`${label}: choose again.`);
  const set = new Set(known.map((k) => k.id));
  return [...new Set(ids as string[])].filter((id) => set.has(id));
}

// ── what a match puts on air ──

export { onAir };

const ROLE_ORDER = new Map(TALENT_ROLES.map((r, i) => [r, i]));
/**
 * The HUD rotates evenly through `sponsors`; a tier's share comes from repeating it.
 * Title sponsors appear three times as often as supporters, spread out rather than back to back.
 */
export function sponsorRotation(sponsors: Sponsor[]): Array<{ name: string; logo: string; line: string }> {
  const slots: Array<{ s: Sponsor; at: number }> = [];
  for (const s of sponsors) {
    const n = TIER_WEIGHT[s.tier];
    for (let k = 0; k < n; k++) slots.push({ s, at: (k + 0.5) / n });
  }
  slots.sort((a, b) => a.at - b.at || TIER_WEIGHT[b.s.tier] - TIER_WEIGHT[a.s.tier]);
  return slots.map(({ s }) => ({ name: s.name.toUpperCase(), logo: s.logo, line: s.read }));
}

/** The event and talent fields of the engine's match config. */
export function engineConfig(match: Match, event: EventInfo | null, fallbackName: string) {
  const air = onAir(match, event);
  const casters = [...air.talent]
    .sort((a, b) => ROLE_ORDER.get(a.role)! - ROLE_ORDER.get(b.role)!)
    .map((t) => ({ name: t.name, handle: t.handle, role: t.role, photo: t.photo }));
  while (casters.length < 2) casters.push({ name: '', handle: '', role: 'play-by-play', photo: '' });
  return {
    event: { name: event?.name || match.source?.tournament || fallbackName, stage: match.stage, bestOf: match.bestOf, logo: event?.logo ?? '', accent: event?.accent ?? DEFAULT_ACCENT },
    casters,
    sponsors: sponsorRotation(air.sponsors.filter((s) => spacesOf(s).includes('rotator'))),
  };
}

// ── migration from match v2 (casters, event name and sponsor names on each match) ──

interface LegacyMatch {
  casters?: Array<{ name: string; handle: string }>;
  event?: { name: string; stage: string };
  sponsors?: string[];
}

/**
 * Builds events from older matches: one event per tournament, or per event name for quick matches.
 * Each person and sponsor a match used becomes part of its event; the match switches off the event's
 * others, so every match keeps exactly what it had.
 */
export function migrateToEvents(matches: Array<Match & LegacyMatch>, events: EventInfo[], defaultName: string): EventInfo[] {
  const out = [...events];
  const keyOf = (m: Match & LegacyMatch) => (m.source?.tournamentId ? `t:${m.source.tournamentId}` : `n:${(m.event?.name || defaultName).toLowerCase()}`);
  const byKey = new Map<string, EventInfo>();
  for (const e of out) byKey.set(e.tournamentId ? `t:${e.tournamentId}` : `n:${e.name.toLowerCase()}`, e);
  const pending = matches.filter((m) => !m.eventId || !out.some((e) => e.id === m.eventId));
  // First pass: every event gets every person and sponsor any of its matches used.
  for (const m of pending) {
    const key = keyOf(m);
    let event = byKey.get(key);
    if (!event) {
      event = newEvent(m.event?.name || m.source?.tournament || defaultName, m.source?.tournamentId ?? null);
      byKey.set(key, event);
      out.push(event);
    }
    const ev = event;
    for (const c of m.casters ?? []) {
      if (c?.name && !ev.talent.some((t) => t.name.toLowerCase() === c.name.toLowerCase()) && ev.talent.length < MAX_TALENT) {
        ev.talent.push({ id: randomUUID(), name: c.name, handle: c.handle ?? '', role: ev.talent.length ? 'analyst' : 'play-by-play', photo: '', camera: { ...NO_CAMERA } });
      }
    }
    for (const name of m.sponsors ?? []) {
      if (name && !ev.sponsors.some((s) => s.name.toLowerCase() === name.toLowerCase()) && ev.sponsors.length < MAX_SPONSORS) {
        ev.sponsors.push({ id: randomUUID(), name, logo: '', logoLight: '', tier: 'partner', video: '', read: '' });
      }
    }
    if (m.event?.stage && !ev.stages.includes(m.event.stage) && ev.stages.length < MAX_STAGES) ev.stages.push(m.event.stage);
    m.eventId = ev.id;
  }
  // Second pass: each match switches off what it did not use.
  for (const m of pending) {
    const ev = out.find((e) => e.id === m.eventId)!;
    const used = new Set((m.casters ?? []).map((c) => c.name.toLowerCase()));
    const sponsorsUsed = new Set((m.sponsors ?? []).map((s) => s.toLowerCase()));
    m.stage = m.event?.stage ?? '';
    m.talentOff = ev.talent.filter((t) => !used.has(t.name.toLowerCase())).map((t) => t.id);
    m.sponsorsOff = ev.sponsors.filter((s) => !sponsorsUsed.has(s.name.toLowerCase())).map((s) => s.id);
    delete m.casters;
    delete m.event;
    delete m.sponsors;
  }
  return out;
}
