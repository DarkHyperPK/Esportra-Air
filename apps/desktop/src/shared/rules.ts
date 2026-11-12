// Moment rules (approved rule builder mock): "When [moment] and [conditions], show [graphic] for [time]
// via [cut / stinger]. [Hold]." Rules sit beside the rundown: the rundown is the show's order, rules react
// to moments that can happen any number of times (an ace, a clutch, match point). Pure, so it is tested
// on its own and the interface can write the sentence.
import type { TransitionPick } from './autopilot.ts';
import type { Screen } from './api.ts';

export const MOMENTS = ['ace', 'team_ace', 'clutch', 'flawless', 'thrifty', 'match_point', 'overtime', 'spike_planted', 'round_won'] as const;
export type Moment = (typeof MOMENTS)[number];

/** The moment as the sentence starts: "When a player gets an ace". */
export const MOMENT_TEXT: Record<Moment, string> = {
  ace: 'a player gets an ace',
  team_ace: 'every player on a team gets a kill in one round',
  clutch: 'a player wins a clutch',
  flawless: 'a team wins a round without losing a player',
  thrifty: 'a team wins on a cheaper buy',
  match_point: 'a team reaches match point',
  overtime: 'the map goes to overtime',
  spike_planted: 'the spike is planted',
  round_won: 'a team wins a round',
};
/** Moments that name one player, so a player spotlight can follow them. */
export const PLAYER_MOMENTS: Moment[] = ['ace', 'clutch'];

export type RoundRange = 'any' | 'first' | 'second' | 'overtime';
export type RuleShow = { kind: 'spotlight' } | { kind: 'fullscreen'; screen: string } | { kind: 'toast'; text: string };
export type RuleHold = 'none' | 'window' | 'wait';

export interface Rule {
  id: string;
  when: Moment;
  /** Only on this map (1–5), or any. */
  map: number | null;
  /** Only for this team (0 or 1), or either. */
  team: 0 | 1 | null;
  rounds: RoundRange;
  show: RuleShow;
  /** How long it stays up; 0 = until you clear it. */
  forSeconds: number;
  via: TransitionPick;
  hold: RuleHold;
  holdSeconds: number;
  enabled: boolean;
}

export type RuleInput = Omit<Rule, 'id' | 'enabled'> & { id?: string; enabled?: boolean };

/** What a match told the rule: who, and which round. */
export interface RuleHit { team: number | null; player: number | null; round: number | null }
/** What Air knows when an event arrives. */
export interface RuleContext { map: number; round: number | null }

/** Each game event as the moment it means (null: not a moment). */
export function hitOf(when: Moment, event: Record<string, unknown>, ctx: RuleContext): RuleHit | null {
  const team = typeof event.team === 'number' ? event.team : null;
  const player = typeof event.player === 'number' ? event.player : null;
  const round = typeof event.round === 'number' ? event.round : ctx.round;
  const moment = event.moment;
  switch (when) {
    case 'ace': return event.type === 'banner.ace' ? { team, player, round } : null;
    case 'team_ace': return event.type === 'banner.teamace' ? { team, player: null, round } : null;
    case 'clutch': return event.type === 'round.won' && moment === 'clutch' ? { team, player, round } : null;
    case 'flawless': return event.type === 'round.won' && moment === 'flawless' ? { team, player: null, round } : null;
    case 'thrifty': return event.type === 'round.won' && moment === 'thrifty' ? { team, player: null, round } : null;
    case 'match_point': return event.type === 'round.won' && moment === 'matchpoint' ? { team, player: null, round } : null;
    case 'overtime': return event.type === 'round.won' && moment === 'overtime' ? { team: null, player: null, round } : null;
    case 'spike_planted': return event.type === 'spike.planted' ? { team, player: null, round } : null;
    case 'round_won': return event.type === 'round.won' ? { team, player: null, round } : null;
  }
}

const inRounds = (range: RoundRange, round: number | null) => {
  if (range === 'any' || round === null) return range === 'any';
  if (range === 'first') return round <= 12;
  if (range === 'second') return round > 12 && round <= 24;
  return round > 24;
};

/** Whether a rule fires for this event, and for whom. */
export function matchRule(rule: Rule, event: Record<string, unknown>, ctx: RuleContext): RuleHit | null {
  if (!rule.enabled) return null;
  const hit = hitOf(rule.when, event, ctx);
  if (!hit) return null;
  if (rule.map !== null && rule.map !== ctx.map) return null;
  if (rule.team !== null && hit.team !== null && hit.team !== rule.team) return null;
  if (rule.team !== null && hit.team === null) return null;
  if (!inRounds(rule.rounds, hit.round)) return null;
  if (rule.show.kind === 'spotlight' && (hit.team === null || hit.player === null)) return null;
  return hit;
}

/** A toast's words with {team} and {player} filled in. */
export function fillText(text: string, hit: RuleHit, names: { teams: string[]; players: string[][] }): string {
  const team = hit.team !== null ? names.teams[hit.team] ?? '' : '';
  const player = hit.team !== null && hit.player !== null ? names.players[hit.team]?.[hit.player] ?? '' : '';
  return text.replace(/\{team\}/g, team).replace(/\{player\}/g, player).replace(/\s+/g, ' ').trim();
}

export const HOLD_TEXT = (r: Pick<Rule, 'hold' | 'holdSeconds'>) => (r.hold === 'none' ? 'No hold.' : r.hold === 'wait' ? 'Waits in Cued for you.' : `${r.holdSeconds} s hold.`);

/** The rule as one sentence, the way the Autopilot tab and the builder show it. */
export function ruleSentence(r: Rule | RuleInput, names: { teams: string[]; graphic: (id: string) => string }): { when: string; rest: string } {
  const conditions = [
    r.team !== null ? `for ${names.teams[r.team] ?? 'that team'}` : '',
    r.map !== null ? `on map ${r.map}` : '',
    r.rounds === 'first' ? 'in the first half' : r.rounds === 'second' ? 'in the second half' : r.rounds === 'overtime' ? 'in overtime' : '',
  ].filter(Boolean).join(' ');
  const what = r.show.kind === 'spotlight' ? 'Player spotlight' : r.show.kind === 'fullscreen' ? names.graphic(r.show.screen) : `the toast “${r.show.text}”`;
  const time = r.forSeconds ? ` for ${r.forSeconds} s` : ' until you clear it';
  const via = r.via === 'stinger' ? ' via the stinger' : '';
  return { when: `When ${MOMENT_TEXT[r.when]}${conditions ? ` ${conditions}` : ''}`, rest: `, show ${what}${time}${via}. ${HOLD_TEXT(r)}` };
}

/** Checks a rule from the interface; throws a plain message when it cannot be used. */
export function validRule(input: RuleInput, id: string, screens: string[]): Rule {
  if (!(MOMENTS as readonly string[]).includes(input?.when)) throw new Error('Choose when the rule fires.');
  if (input.map !== null && !(Number.isInteger(input.map) && input.map >= 1 && input.map <= 5)) throw new Error('Choose any map, or map 1 to 5.');
  if (input.team !== null && input.team !== 0 && input.team !== 1) throw new Error('Choose either team, or one of them.');
  if (!['any', 'first', 'second', 'overtime'].includes(input.rounds)) throw new Error('Choose which rounds.');
  const show = input.show;
  if (show?.kind === 'spotlight') {
    if (!PLAYER_MOMENTS.includes(input.when)) throw new Error('A player spotlight needs a moment with one player: an ace or a clutch.');
  } else if (show?.kind === 'fullscreen') {
    if (!screens.includes(show.screen)) throw new Error('Choose a full-screen graphic that is in My show.');
  } else if (show?.kind === 'toast') {
    if (typeof show.text !== 'string' || !show.text.trim() || show.text.length > 120 || /[<>]/.test(show.text)) throw new Error('Write the toast in plain text, 1–120 characters.');
  } else throw new Error('Choose what the rule shows.');
  if (![0, 5, 8, 12, 20, 30].includes(input.forSeconds)) throw new Error('Choose how long it stays up.');
  if (input.via !== 'cut' && input.via !== 'stinger') throw new Error('Choose cut or stinger.');
  if (!['none', 'window', 'wait'].includes(input.hold)) throw new Error('Choose the hold.');
  if (input.hold === 'window' && !(Number.isInteger(input.holdSeconds) && input.holdSeconds >= 1 && input.holdSeconds <= 30)) throw new Error('A hold window is 1–30 seconds.');
  return {
    id, when: input.when, map: input.map, team: input.team, rounds: input.rounds,
    show: show.kind === 'toast' ? { kind: 'toast', text: show.text.trim() } : show,
    forSeconds: input.forSeconds, via: input.via, hold: input.hold, holdSeconds: input.hold === 'window' ? input.holdSeconds : 0, enabled: input.enabled !== false,
  };
}

/** The rule every new production starts with. */
export const STARTER_RULES: Rule[] = [
  { id: 'starter-ace', when: 'ace', map: null, team: null, rounds: 'any', show: { kind: 'spotlight' }, forSeconds: 8, via: 'stinger', hold: 'window', holdSeconds: 3, enabled: true },
];

/** A moment from the last rehearsal, with what Air knew when it happened. */
export interface RecordedEvent { event: Record<string, unknown>; ctx: RuleContext }

/** How often a rule would have fired over recorded events, and for which rounds and players. */
export function countMatches(rule: Rule, recorded: RecordedEvent[], names: { players: string[][] }): { n: number; examples: string[] } {
  const hits = recorded.map((r) => matchRule({ ...rule, enabled: true }, r.event, r.ctx)).filter((h): h is RuleHit => !!h);
  const examples = hits.slice(0, 3).map((h) => {
    const who = h.team !== null && h.player !== null ? names.players[h.team]?.[h.player] : null;
    return `${h.round !== null ? `round ${h.round}` : 'a round'}${who ? ` (${who})` : ''}`;
  });
  return { n: hits.length, examples };
}

export type RuleAction = { name: string; args: Record<string, unknown> };
export interface RuleNames { teams: string[]; players: string[][]; graphic: (id: string) => string }

/** What a rule puts on air for this hit, its label for the log and Cued, and how it comes off again. */
export function ruleActions(rule: Rule, hit: RuleHit, names: RuleNames): { label: string; on: RuleAction[]; off: RuleAction[] | null } | null {
  const show = rule.show;
  if (show.kind === 'spotlight') {
    if (hit.team === null || hit.player === null) return null;
    const who = names.players[hit.team]?.[hit.player] || `Player ${hit.player + 1}`;
    return { label: `Spotlight · ${who}`, on: [{ name: 'lowerthird.player', args: { team: hit.team, player: hit.player } }], off: [{ name: 'lowerthird.hide', args: {} }] };
  }
  if (show.kind === 'fullscreen') {
    return { label: names.graphic(show.screen), on: [{ name: 'fullscreen.show', args: { screen: show.screen } }], off: [{ name: 'fullscreen.show', args: { screen: null } }] };
  }
  const text = fillText(show.text, hit, names);
  if (!text) return null;
  // A toast leaves by itself.
  return { label: `Toast · ${text}`, on: [{ name: 'toast.show', args: { text } }], off: null };
}

/** Only the events that are some moment: what a rehearsal keeps for the builder's count. */
export function isMoment(event: Record<string, unknown>, ctx: RuleContext): boolean {
  return MOMENTS.some((m) => hitOf(m, event, ctx) !== null);
}

/** Full-screen graphics a rule may show: those in My show, except the two that need a choice made first. */
export function ruleScreens(screens: Screen[]): Screen[] {
  return screens.filter((x) => x.enabled && x.scene === 'fullscreen' && x.id !== 'cam-grid' && x.id !== 'player-profile');
}
