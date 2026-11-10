// The console's event log: what the game and the show did, newest first (PRD picture 8, item 8).
// Game events come from the engine (read-only `observe` connection, so it is never counted as an
// on-air viewer); Air adds its own entries for takes and triggers.

import WebSocket from 'ws';
import type { LogEntry } from '../shared/api.ts';

const MAX = 60;

export type NameOf = (team: number, player: number) => string;

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** One line for an engine event, or null for events not worth logging. */
export function describe(event: Record<string, unknown>, nameOf: NameOf): string | null {
  const who = (slot: unknown) => (Array.isArray(slot) && slot.length === 2 ? nameOf(Number(slot[0]), Number(slot[1])) : '?');
  switch (event.type) {
    case 'kill': return `Kill · ${who(event.killer)} ▸ ${who(event.victim)} · ${title(String(event.weapon ?? ''))}${event.hs ? ' · HS' : ''}`;
    case 'spike.planted': return 'Spike planted';
    case 'spike.defused': return 'Spike defused';
    case 'spike.detonated': return 'Spike detonated';
    case 'round.won': return `Round ${event.round ?? ''} · team ${Number(event.team) + 1} wins · ${String(event.how ?? '')}`;
    case 'banner.ace': return `Ace · ${who([event.team, event.player])}`;
    case 'banner.teamace': return `Team ace · team ${Number(event.team) + 1}`;
    case 'match.start': return 'Match started';
    case 'match.end': return 'Match ended';
    default: return null;
  }
}

/** An entry is either text Air wrote, or a game event whose names are resolved when read. */
type Entry = { t: number; text: string } | { t: number; event: Record<string, unknown> };

export class EventLog {
  private entries: Entry[] = [];
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly nameOf: NameOf;
  private readonly onChange: () => void;
  private readonly now: () => number;

  constructor(options: { nameOf: NameOf; onChange: () => void; now?: () => number }) {
    this.nameOf = options.nameOf;
    this.onChange = options.onChange;
    this.now = options.now ?? Date.now;
  }

  list(): LogEntry[] {
    return this.entries.flatMap((e) => {
      const text = 'text' in e ? e.text : describe(e.event, this.nameOf);
      return text ? [{ t: e.t, text }] : [];
    });
  }

  add(text: string) {
    this.push({ t: this.now(), text });
  }

  private push(entry: Entry) {
    this.entries = [entry, ...this.entries].slice(0, MAX);
    this.onChange();
  }

  /** Follows a match room. A different room starts a fresh log. */
  target(url: string | null) {
    if (url === this.url) return;
    this.url = url;
    this.entries = [];
    this.close();
    if (url) this.connect();
    this.onChange();
  }

  private connect() {
    const url = this.url;
    if (!url) return;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.on('message', (raw) => {
      let message: { type?: string; event?: Record<string, unknown> };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.type !== 'event' || !message.event) return;
      // Only events worth logging; names are resolved when the log is read, after the roster has arrived.
      if (describe(message.event, () => '') !== null) this.push({ t: this.now(), event: message.event });
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.retry = setTimeout(() => this.connect(), 1500);
      this.retry.unref?.();
    });
  }

  private close() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  stop() {
    this.url = null;
    this.close();
  }
}
