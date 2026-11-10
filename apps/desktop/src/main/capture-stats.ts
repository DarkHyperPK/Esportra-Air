// What the capture is delivering, for the Capture page (PRD picture 10): per-feature freshness, a
// 60-second sparkline each, messages per second and silent gaps. Fed with every game message that
// is sent to the engine; nothing here is stored or sent anywhere.

import type { CaptureView, FeatureStat } from '../shared/api.ts';

interface Def {
  id: string;
  label: string;
  detail: string;
  kind: 'stream' | 'event';
  /** Player-PC capture only: the observer's GEP does not carry it. */
  playerPc?: boolean;
}

/** The Valorant GEP features Air reads, in the order the page lists them. */
export const FEATURES: Def[] = [
  { id: 'match_info.scoreboard', label: 'Scoreboard', detail: 'Players, agents, credits, alive, weapons', kind: 'stream' },
  { id: 'match_info.round_phase', label: 'Round phase', detail: 'Buy, live, end', kind: 'stream' },
  { id: 'match_info.round_number', label: 'Round number', detail: 'Current round', kind: 'stream' },
  { id: 'match_info.match_score', label: 'Match score', detail: 'Rounds won', kind: 'stream' },
  { id: 'match_info.map', label: 'Map', detail: 'Map name', kind: 'stream' },
  { id: 'match_info.observing', label: 'Observed player', detail: 'Who the observer camera is on', kind: 'stream' },
  { id: 'event.kill_feed', label: 'Kill feed', detail: 'Kills with weapon and headshot', kind: 'event' },
  { id: 'event.spike', label: 'Spike', detail: 'Planted, defused, detonated', kind: 'event' },
  { id: 'event.match', label: 'Match start and end', detail: 'Starts a fresh match, ends the map', kind: 'event' },
  { id: 'me', label: 'Local player health and abilities', detail: 'Only from a player PC; the observer’s GEP does not carry it', kind: 'stream', playerPc: true },
];

const BUCKETS = 60;
const FRESH_MS = 10_000;
const GAP_MS = 5_000;
const RATE_WINDOW_MS = 5_000;

/** The feature ids a raw GEP message carries. Heartbeats and unknown shapes carry none. */
export function featuresOf(message: unknown): string[] {
  const m = message as Record<string, any> | null;
  if (!m || typeof m !== 'object') return [];
  const out = new Set<string>();
  const key = (feature: unknown, name: unknown) => {
    const f = String(feature);
    const k = String(name).replace(/_?\d+$/, '');
    if (f === 'me') out.add('me');
    else if (f === 'match_info') out.add(`match_info.${k}`);
  };
  if (Array.isArray(m.events)) {
    for (const e of m.events) {
      const n = String(e?.name ?? '');
      if (n === 'kill_feed') out.add('event.kill_feed');
      else if (['planted_location', 'spike_planted', 'spike_defused', 'spike_detonated'].includes(n)) out.add('event.spike');
      else if (n === 'match_start' || n === 'match_end') out.add('event.match');
    }
  }
  const info = m.info && typeof m.info === 'object' ? m.info : null;
  if (info) for (const feature of Object.keys(info)) for (const name of Object.keys(info[feature] ?? {})) key(feature, name);
  if (m.feature && m.key) key(m.feature, m.key);
  else if (m.feature === 'me') out.add('me');
  return [...out];
}

interface Track {
  lastAt: number | null;
  counts: number[];
  /** The second (since epoch / 1000) the last bucket belongs to. */
  second: number;
}

export class CaptureStats {
  private tracks = new Map<string, Track>();
  private recent: number[] = [];
  private lastAny: number | null = null;
  private gaps = 0;
  private total = 0;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  reset() {
    this.tracks.clear();
    this.recent = [];
    this.lastAny = null;
    this.gaps = 0;
    this.total = 0;
  }

  record(message: unknown) {
    const ids = featuresOf(message);
    if (!ids.length) return;
    const at = this.now();
    if (this.lastAny !== null && at - this.lastAny >= GAP_MS) this.gaps += 1;
    this.lastAny = at;
    this.total += 1;
    this.recent.push(at);
    for (const id of ids) {
      const t = this.track(id, at);
      t.lastAt = at;
      t.counts[BUCKETS - 1]! += 1;
    }
  }

  /** Slides a feature's buckets forward to the current second. */
  private track(id: string, at: number): Track {
    const second = Math.floor(at / 1000);
    let t = this.tracks.get(id);
    if (!t) {
      t = { lastAt: null, counts: new Array(BUCKETS).fill(0), second };
      this.tracks.set(id, t);
    }
    const shift = Math.min(BUCKETS, second - t.second);
    if (shift > 0) {
      t.counts.splice(0, shift);
      t.counts.push(...new Array(shift).fill(0));
      t.second = second;
    }
    return t;
  }

  view(): CaptureView {
    const at = this.now();
    this.recent = this.recent.filter((x) => at - x <= RATE_WINDOW_MS);
    const features: FeatureStat[] = FEATURES.map((def) => {
      const t = this.tracks.get(def.id);
      if (t) this.track(def.id, at);
      const ageMs = t?.lastAt != null ? at - t.lastAt : null;
      const status: FeatureStat['status'] = def.playerPc && ageMs === null ? 'player-pc' : ageMs === null ? 'waiting' : def.kind === 'event' || ageMs <= FRESH_MS ? 'live' : 'quiet';
      return { id: def.id, label: def.label, detail: def.detail, kind: def.kind, status, ageMs, spark: t ? [...t.counts] : new Array(BUCKETS).fill(0) };
    });
    return { messagesPerSec: Math.round((this.recent.length / (RATE_WINDOW_MS / 1000)) * 10) / 10, total: this.total, gaps: this.gaps, lastAgeMs: this.lastAny === null ? null : at - this.lastAny, features };
  }
}
