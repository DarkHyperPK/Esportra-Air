// The Matches list: when each match is, and how prepared it is (shared so it can be tested).
import type { Match } from './api.ts';
import { onAir, type EventInfo } from './model.ts';

export type WhenGroup = 'Today' | 'This week' | 'Later' | 'No time set' | 'Earlier';
export const WHEN_ORDER: WhenGroup[] = ['Today', 'This week', 'Later', 'No time set', 'Earlier'];

const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Which group a time falls in; "This week" is the next six days after today. */
export function whenGroup(at: string | null, now: number): WhenGroup {
  if (!at) return 'No time set';
  const t = Date.parse(at);
  if (Number.isNaN(t)) return 'No time set';
  const today = dayStart(now);
  const DAY = 86_400_000;
  if (t < today) return 'Earlier';
  if (t < today + DAY) return 'Today';
  if (t < today + 7 * DAY) return 'This week';
  return 'Later';
}

/** Rows grouped in display order; within a group by time (untimed by newest first). */
export function groupByWhen<T extends { at: string | null; createdAt?: number }>(rows: T[], now: number): Array<{ group: WhenGroup; rows: T[] }> {
  const groups = new Map<WhenGroup, T[]>();
  for (const r of rows) {
    const g = whenGroup(r.at, now);
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  return WHEN_ORDER.filter((g) => groups.has(g)).map((group) => ({
    group,
    rows: [...groups.get(group)!].sort((a, b) => (a.at && b.at ? Date.parse(a.at) - Date.parse(b.at) : (b.createdAt ?? 0) - (a.createdAt ?? 0))),
  }));
}

export type PrepState = { label: string; health: 'ok' | 'warn' };

/** A quick view of how prepared a match is, from data alone (OBS and live checks are in Readiness). */
export function prepState(match: Pick<Match, 'players' | 'talentOff' | 'sponsorsOff'>, event: EventInfo | null): PrepState {
  const short = match.players.some((team) => team.filter((p) => p.gameId || p.puuid).length < 5);
  if (short) return { label: 'Lineups missing', health: 'warn' };
  if (!onAir(match, event).talent.length) return { label: 'Nobody on air', health: 'warn' };
  return { label: 'Prepared', health: 'ok' };
}
