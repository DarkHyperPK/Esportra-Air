// What a battle royale lobby keeps from the observer feed and works out from it (24 Nov): every player's final
// numbers per game (as PCOB reports them at the end), the MVP rating, and the totals Insights and the post-game
// graphics show (per player and per team, for one game or the whole lobby). Pure.
import type { PcobKill, PcobPlayer } from './pcob.ts';

/** One player's final numbers in one game, kept as the game gave them. */
export interface PlayerGameStat {
  name: string; openId: string; uid: string;
  /** The lobby team, or null when the producer never paired that PCOB team. */
  team: string | null;
  place: number;
  kills: number; knockouts: number; assists: number; damage: number; damageTaken: number; heal: number;
  headshots: number; rescues: number; survival: number; maxKillDistance: number; airdrops: number;
  vehicleKills: number; grenadeKills: number; driveDistance: number; walkDistance: number; outsideZoneTime: number;
}

/** What a game keeps from the feed besides the results. */
export interface GameFeed {
  source: 'pcob';
  gameId: string;
  stats: PlayerGameStat[];
  kills: PcobKill[];
  circles: Array<{ x: number; y: number; size: number }>;
  plane: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  savedAt: number;
  /** When Update from game last refilled the after-match numbers (the producer's button, until Confirm). */
  updatedAt?: number;
}

export function statOf(p: PcobPlayer, team: string | null): PlayerGameStat {
  return {
    name: p.name, openId: p.openId, uid: p.uid, team, place: p.rank,
    kills: p.kills, knockouts: p.knockouts, assists: p.assists, damage: Math.round(p.damage), damageTaken: Math.round(p.damageTaken),
    heal: Math.round(p.heal), headshots: p.headshots, rescues: p.rescues, survival: Math.round(p.survival), maxKillDistance: p.maxKillDistance,
    airdrops: p.airdrops, vehicleKills: p.vehicleKills, grenadeKills: p.grenadeKills, driveDistance: Math.round(p.driveDistance),
    walkDistance: Math.round(p.walkDistance), outsideZoneTime: Math.round(p.outsideZoneTime),
  };
}

/**
 * MVP rating, as PUBG MOBILE's own MVP graphic ranks players (eliminations, damage, survival time), plus the
 * team play the feed reports. Each weight is per unit: a kill, 100 damage, a knock, an assist, a minute alive.
 */
export interface MvpWeights { kill: number; damage100: number; knock: number; assist: number; minute: number }
export const MVP_WEIGHTS: MvpWeights = { kill: 2, damage100: 1, knock: 0.5, assist: 1, minute: 0.1 };
export function mvpRating(s: { kills: number; damage: number; knockouts: number; assists: number; survival: number }, w: MvpWeights = MVP_WEIGHTS) {
  return Math.round((s.kills * w.kill + (s.damage / 100) * w.damage100 + s.knockouts * w.knock + s.assists * w.assist + (s.survival / 60) * w.minute) * 10) / 10;
}

/** A player's totals over several games (matched by OpenID, else by name). */
export interface PlayerTotals extends Omit<PlayerGameStat, 'place' | 'maxKillDistance'> { games: number; wins: number; maxKillDistance: number; rating: number; avgPlace: number }

const key = (s: { openId: string; name: string }) => s.openId || `name:${s.name.toLowerCase()}`;

export function playerTotals(games: Array<{ stats: PlayerGameStat[] }>, w: MvpWeights = MVP_WEIGHTS): PlayerTotals[] {
  const by = new Map<string, PlayerTotals & { placeSum: number }>();
  for (const g of games) for (const s of g.stats) {
    const k = key(s);
    const t = by.get(k) ?? { ...s, kills: 0, knockouts: 0, assists: 0, damage: 0, damageTaken: 0, heal: 0, headshots: 0, rescues: 0, survival: 0, airdrops: 0, vehicleKills: 0, grenadeKills: 0, driveDistance: 0, walkDistance: 0, outsideZoneTime: 0, games: 0, wins: 0, maxKillDistance: 0, rating: 0, avgPlace: 0, placeSum: 0 };
    t.name = s.name; t.team = s.team ?? t.team;
    for (const f of ['kills', 'knockouts', 'assists', 'damage', 'damageTaken', 'heal', 'headshots', 'rescues', 'survival', 'airdrops', 'vehicleKills', 'grenadeKills', 'driveDistance', 'walkDistance', 'outsideZoneTime'] as const) t[f] += s[f];
    t.games++; if (s.place === 1) t.wins++; t.placeSum += s.place;
    t.maxKillDistance = Math.max(t.maxKillDistance, s.maxKillDistance);
    by.set(k, t);
  }
  return [...by.values()].map(({ placeSum, ...t }) => ({ ...t, avgPlace: t.games ? Math.round((placeSum / t.games) * 10) / 10 : 0, rating: mvpRating(t, w) }))
    .sort((a, b) => b.rating - a.rating || b.kills - a.kills);
}

/** A team's numbers from its players' stats (damage, survival, knocks…), per game or summed. */
export interface TeamFeedTotals { team: string; games: number; kills: number; knockouts: number; assists: number; damage: number; damageTaken: number; heal: number; rescues: number; survival: number; headshots: number }
export function teamTotals(games: Array<{ stats: PlayerGameStat[] }>): TeamFeedTotals[] {
  const by = new Map<string, TeamFeedTotals & { seen: Set<number> }>();
  games.forEach((g, gi) => {
    for (const s of g.stats) {
      if (!s.team) continue;
      const t = by.get(s.team) ?? { team: s.team, games: 0, kills: 0, knockouts: 0, assists: 0, damage: 0, damageTaken: 0, heal: 0, rescues: 0, survival: 0, headshots: 0, seen: new Set<number>() };
      if (!t.seen.has(gi)) { t.seen.add(gi); t.games++; }
      t.kills += s.kills; t.knockouts += s.knockouts; t.assists += s.assists; t.damage += s.damage; t.damageTaken += s.damageTaken;
      t.heal += s.heal; t.rescues += s.rescues; t.survival += s.survival; t.headshots += s.headshots;
      by.set(s.team, t);
    }
  });
  return [...by.values()].map(({ seen: _seen, ...t }) => t).sort((a, b) => b.damage - a.damage);
}

/** The single best player of a set of games (the MVP card); null without stats. */
export const mvpOf = (games: Array<{ stats: PlayerGameStat[] }>, w: MvpWeights = MVP_WEIGHTS) => playerTotals(games, w)[0] ?? null;


/**
 * The numbers PCOB leaves at 0 until the game is over (28 Nov, open question 9). Update from game refills only these, never
 * a place or a kill count, and never with a 0 (a blank or early reading cannot take a saved number away).
 */
export const AFTER_MATCH_FIELDS = ['knockouts', 'assists', 'damageTaken', 'heal', 'headshots', 'rescues', 'survival', 'vehicleKills', 'grenadeKills', 'driveDistance', 'walkDistance', 'outsideZoneTime'] as const;
export type RefillResult = { feed: GameFeed; players: number; filled: number } | { problem: string };
export function refillAfterMatch(feed: GameFeed, players: PcobPlayer[], gameId: string, at: number): RefillResult {
  if (!players.length) return { problem: 'The game does not list any players now, so there is nothing to read. The numbers saved with the match stay as they are.' };
  if (feed.gameId && gameId && feed.gameId !== gameId) return { problem: 'The game on now is a different game (its GameID differs). Nothing was changed.' };
  const find = (s: PlayerGameStat) => players.find((p) => (s.uid && p.uid === s.uid) || (s.openId && p.openId === s.openId)) ?? players.find((p) => p.name.toLowerCase() === s.name.toLowerCase());
  const hits = feed.stats.map((s) => ({ s, p: find(s) }));
  if (hits.filter((h) => h.p).length * 2 < feed.stats.length) return { problem: 'Most of the players now in the game are not the ones saved with this match. Nothing was changed.' };
  let filled = 0, touched = 0;
  const stats = hits.map(({ s, p }) => {
    if (!p) return s;
    const fresh = statOf(p, s.team);
    const next = { ...s };
    let any = false;
    for (const f of AFTER_MATCH_FIELDS) if (fresh[f] > 0 && fresh[f] !== s[f]) { next[f] = fresh[f]; filled++; any = true; }
    if (any) touched++;
    return next;
  });
  return { feed: { ...feed, stats, updatedAt: at }, players: touched, filled };
}
