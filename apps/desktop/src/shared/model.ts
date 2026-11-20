// The production model (docs/SPEC.md section 3): an event owns the people on air and the sponsors;
// each match takes them from its event and can switch individual ones off.

import type { Match } from './api.ts';

/** How a person's camera reaches OBS. */
export type CameraKind = 'none' | 'link' | 'obs';

export interface Camera {
  kind: CameraKind;
  /** `link`: the id of the browser camera link the person opens. */
  linkId: string | null;
  /** `obs`: the name of an OBS source the producer already has (capture card, NDI). */
  obsSource: string | null;
}

export const NO_CAMERA: Camera = { kind: 'none', linkId: null, obsSource: null };

export const TALENT_ROLES = ['host', 'play-by-play', 'analyst', 'interviewer', 'guest'] as const;
export type TalentRole = (typeof TALENT_ROLES)[number];
export const ROLE_NAME: Record<TalentRole, string> = { host: 'Host', 'play-by-play': 'Play-by-play', analyst: 'Analyst', interviewer: 'Interviewer', guest: 'Guest' };

/** A person on air who is not a player: host, caster, analyst. */
export interface Talent {
  id: string;
  name: string;
  handle: string;
  role: TalentRole;
  /** Image URL from the engine's asset store, or ''. */
  photo: string;
  camera: Camera;
}

export const SPONSOR_TIERS = ['title', 'partner', 'supporter'] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];
export const TIER_NAME: Record<SponsorTier, string> = { title: 'Title sponsor', partner: 'Partner', supporter: 'Supporter' };
/** How many slots of the HUD's sponsor rotation each tier gets, relative to the others. */
export const TIER_WEIGHT: Record<SponsorTier, number> = { title: 3, partner: 2, supporter: 1 };

/** Where a sponsor can appear (approved mock 15 Nov). The rotator rotates every sponsor that bought it; each other space shows one sponsor. */
export const SPONSOR_SPACES = ['rotator', 'event-bug', 'map-veto', 'agent-select', 'breakdown', 'victory', 'timeout', 'toast'] as const;
export type SponsorSpace = (typeof SPONSOR_SPACES)[number];
export const SPACE_NAME: Record<SponsorSpace, string> = { rotator: 'Rotator', 'event-bug': 'Event bug', 'map-veto': 'Map veto', 'agent-select': 'Agent select', breakdown: 'Breakdown', victory: 'Victory', timeout: 'Timeout', toast: 'Toast' };

export interface Sponsor {
  id: string;
  /** The spaces this sponsor bought, each with its own logo or '' for the main one. Absent: the rotator only (sponsors from before spaces). */
  spaces?: Partial<Record<SponsorSpace, { logo: string }>>;
  name: string;
  /** Logo for dark backgrounds (the default), and an optional version for light ones. */
  logo: string;
  logoLight: string;
  tier: SponsorTier;
  /** A short video loop Air adds to OBS for breaks, or ''. */
  video: string;
  /** The line under the logo, and the read for the "presented by" lower third. */
  read: string;
}

/** The spaces a sponsor shows in: the ones it bought, or the rotator for a sponsor from before spaces. */
export const spacesOf = (s: Sponsor): SponsorSpace[] => (s.spaces ? SPONSOR_SPACES.filter((k) => s.spaces![k]) : ['rotator']);

/**
 * The sponsor shown in each single space: the match's choice, else the event's, else the first sponsor on air
 * that bought it. A space nobody bought shows nothing. Logos: the space's own, else the sponsor's main one.
 */
export function spaceSponsors(sponsors: Sponsor[], eventActive: Partial<Record<SponsorSpace, string>> | undefined, matchActive: Partial<Record<SponsorSpace, string | null>> | undefined) {
  const out: Partial<Record<SponsorSpace, { name: string; logo: string } | null>> = {};
  for (const space of SPONSOR_SPACES) {
    if (space === 'rotator') continue;
    const bought = sponsors.filter((s) => spacesOf(s).includes(space));
    const want = matchActive && space in matchActive ? matchActive[space] : eventActive?.[space];
    const pick = want === null ? null : bought.find((s) => s.id === want) ?? bought[0] ?? null;
    out[space] = pick ? { name: pick.name.toUpperCase(), logo: pick.spaces?.[space]?.logo || pick.logo } : null;
  }
  return out;
}

/** A tournament or show series. Matches take their branding, talent and sponsors from it. */
export interface EventInfo {
  id: string;
  /** The active sponsor of each single space (sponsor id). */
  spaceActive?: Partial<Record<SponsorSpace, string>>;
  name: string;
  /** Stage names offered to its matches, e.g. "Groups", "Playoffs". */
  stages: string[];
  logo: string;
  logoLight: string;
  /** The event's own colour for its graphics (#rrggbb); Primary in its brand kit. */
  accent: string;
  /** The rest of the brand kit (Graphics templates and the scorebug's side colours); absent: the defaults. */
  brand?: Partial<Omit<import('./templates.ts').BrandKit, 'primary'>>;
  talent: Talent[];
  sponsors: Sponsor[];
  /** Set for events that come from an Esportra tournament. */
  tournamentId: string | null;
  /** Game packs that need a tournament licence (PUBG MOBILE): confirmed by the producer for this event (20 Nov). */
  gameLicence?: Partial<Record<string, { confirmedAt: number; number?: string }>>;
}

export type EventPatch = Partial<Pick<EventInfo, 'name' | 'stages' | 'logo' | 'logoLight' | 'accent'>>;
export type TalentInput = Partial<Omit<Talent, 'id'>> & { id?: string };
export type SponsorInput = Partial<Omit<Sponsor, 'id'>> & { id?: string };

export interface OnAir {
  talent: Talent[];
  sponsors: Sponsor[];
}

/** The event's people and sponsors this match has switched on. */
export function onAir(match: Pick<Match, 'talentOff' | 'sponsorsOff'>, event: EventInfo | null): OnAir {
  if (!event) return { talent: [], sponsors: [] };
  const talentOff = new Set(match.talentOff);
  const sponsorsOff = new Set(match.sponsorsOff);
  return {
    talent: event.talent.filter((t) => !talentOff.has(t.id)),
    sponsors: event.sponsors.filter((s) => !sponsorsOff.has(s.id)),
  };
}

/** The browser link a person opens to send their camera (nothing to install; nothing is recorded). */
export function cameraLinkUrl(id: string, label: string): string {
  return `https://vdo.ninja/?push=${encodeURIComponent(id)}&webcam&autostart&quality=0&label=${encodeURIComponent(label)}`;
}

/** Each sponsor's share of the HUD's rotation (0..1), from the tier weights. */
export function rotationShare(sponsors: Sponsor[]): Record<string, number> {
  const total = sponsors.reduce((n, s) => n + TIER_WEIGHT[s.tier], 0);
  return Object.fromEntries(sponsors.map((s) => [s.id, total ? TIER_WEIGHT[s.tier] / total : 0]));
}

/** What OBS shows for a camera link: the picture only (sound comes from the talent's own mic setup). */
export function cameraViewUrl(id: string): string {
  return `https://vdo.ninja/?view=${encodeURIComponent(id)}&solo&noaudio&cleanoutput&api=esportra-air`;
}
