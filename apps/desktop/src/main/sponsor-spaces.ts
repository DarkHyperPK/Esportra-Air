// Sponsor spaces (approved mock, 15 Nov): which sponsor each graphic's space shows. Each event picks the
// active sponsor per space and a match can choose its own (or none). Production gives it a small context;
// the rule itself is `spaceSponsors` in src/shared/model.ts.
import type { Match } from '../shared/api.ts';
import { SPONSOR_SPACES, onAir, spaceSponsors, spacesOf, type EventInfo, type SponsorSpace } from '../shared/model.ts';

export interface SponsorSpacesContext {
  match(): Match | null;
  eventOf(match: Match): EventInfo | null;
  requireEvent(id: string): EventInfo;
  putEvent(event: EventInfo): Promise<void>;
  /** Writes fields into the selected match's room. */
  patch(fields: Record<string, unknown>): Promise<void>;
  save(): void;
  changed(): void;
}

const single = (space: SponsorSpace) => {
  if (!SPONSOR_SPACES.includes(space) || space === 'rotator') throw new Error('Choose a sponsor space.');
};

export class SponsorSpaces {
  private readonly ctx: SponsorSpacesContext;

  constructor(ctx: SponsorSpacesContext) {
    this.ctx = ctx;
  }

  /** The sponsor each single space shows for a match (its own choice over the event's). */
  of(match: Match) {
    const event = this.ctx.eventOf(match);
    return spaceSponsors(onAir(match, event).sponsors, event?.spaceActive, match.spaceActive);
  }

  /** The event's active sponsor in a space (null: the first that bought it). */
  async setForEvent(eventId: string, space: SponsorSpace, sponsorId: string | null) {
    const event = this.ctx.requireEvent(eventId);
    single(space);
    if (sponsorId !== null && !event.sponsors.some((x) => x.id === sponsorId && spacesOf(x).includes(space))) throw new Error('That sponsor has not bought this space.');
    const spaceActive = { ...(event.spaceActive ?? {}) };
    if (sponsorId) spaceActive[space] = sponsorId; else delete spaceActive[space];
    await this.ctx.putEvent({ ...event, spaceActive });
  }

  /** This match's own sponsor in a space: a sponsor id, null for none in this match, or undefined to follow the event. */
  async setForMatch(space: SponsorSpace, sponsorId: string | null | undefined) {
    const match = this.ctx.match();
    if (!match) throw new Error('Choose a match first.');
    single(space);
    const event = this.ctx.eventOf(match);
    if (sponsorId && !event?.sponsors.some((x) => x.id === sponsorId && spacesOf(x).includes(space))) throw new Error('That sponsor has not bought this space.');
    const next = { ...(match.spaceActive ?? {}) };
    if (sponsorId === undefined) delete next[space]; else next[space] = sponsorId;
    match.spaceActive = next;
    this.ctx.save();
    await this.ctx.patch({ airSpaces: this.of(match) });
    this.ctx.changed();
  }
}
