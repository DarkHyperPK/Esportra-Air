// What Live shows about the PUBG MOBILE observer feed (src/main/br-live.ts).
export interface PcobSlot { teamId: number; name: string; players: string[]; seat: string | null; manual: boolean }
export interface PcobStatus {
  /** off: not connected; connecting: no answer yet; waiting: PCOB answers, no game; live: a game is on; error: no answer. */
  state: 'off' | 'connecting' | 'waiting' | 'live' | 'error';
  host: string;
  lastAt: number | null;
  error: string | null;
  /** The lobby match the feed is filling, while a game is on. */
  game: number | null;
  /** PCOB's team slots in this game and the lobby team each is paired with. */
  slots: PcobSlot[];
  /** The last game the feed saved: its match number and when. */
  saved: { game: number; at: number } | null;
  /** A game is on but no match is armed: the data is read and kept in memory, nothing is saved until the producer arms one. */
  unarmed: boolean;
  /** When any PCOB number last changed while a game was on, and whether that was 10 s or more ago (PCOB pushes every 2 s). */
  lastChangeAt: number | null;
  noData: boolean;
  /** PCOB left the game with no winner (FinishedStartTime never set): Air only asks whether to remake; the producer decides. */
  noWinner: boolean;
  /** A new PCOB game started while the match was still live and not remade. */
  restarted: boolean;
}
export const PCOB_OFF: PcobStatus = { state: 'off', host: '', lastAt: null, error: null, game: null, slots: [], saved: null, unarmed: false, lastChangeAt: null, noData: false, noWinner: false, restarted: false };
/** PCOB updates every 2 s; this long without a changed number while in game is worth a warning (never an end). */
export const NO_DATA_MS = 10_000;
/** Only addresses on this PC or the local network (Air never sends game data elsewhere, nor reads it from elsewhere). */
export function localHost(input: string, defaultPort = 10086): { host: string; port: number } | null {
  const m = /^\s*([a-z0-9.-]+)(?::(\d{1,5}))?\s*$/i.exec(input || '');
  if (!m) return null;
  const host = m[1]!.toLowerCase(), port = m[2] ? Number(m[2]) : defaultPort;
  if (port < 1 || port > 65535) return null;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (host === 'localhost') return { host, port };
  // A PC's name on the network (OBSERVER-1, or observer-1.local); never a public domain.
  if (!ip) return /^[a-z0-9-]+(\.local)?$/.test(host) ? { host, port } : null;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  if ([ip[1], ip[2], ip[3], ip[4]].some((x) => Number(x) > 255)) return null;
  const ok = a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  return ok ? { host, port } : null;
}
