// Event files (27 Nov): everything one event needs, in one file the producer can keep, mail or open on another PC.
// `<name>.airevent` is a JSON bundle: the event, its matches and lobbies, the teams and players they use, map records,
// the Rundown and show settings, the journal and the pictures and fonts they show (as base64, from the engine's asset
// store). Opening one first gives a restore check (counts); confirming merges it into this PC's store, with new ids when the
// same event is already here, or replacing it when the producer says so. Nothing is sent anywhere.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LibPlayer, LibTeam, Lobby, Match } from '../shared/api.ts';
import type { EventInfo } from '../shared/model.ts';
import type { EventData, MatchData } from '../shared/match-data.ts';
import type { MapRecord } from '../shared/map-records.ts';
import type { OwnGraphic } from '../shared/own-graphics.ts';
import type { Template } from '../shared/templates.ts';
import type { ShowTemplate } from '../shared/show-templates.ts';
import type { SavedRundown } from './autopilot/rundown.ts';
import type { PostOptions } from './map-records.ts';
import type { Store } from './store.ts';
import { EventJournal, verify, type JournalLine, parseJournal } from './event-journal.ts';
import { writeDurable } from './durable.ts';

export const EVENT_FILE_FORMAT = 'esportra-air-event';
export const EVENT_FILE_VERSION = 1;
export const EVENT_FILE_EXT = '.airevent';
const MAX_FILE = 400_000_000;
const MAX_ASSET = 20_000_000;
const ASSET_REF = /\/air-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

export interface EventBundle {
  format: typeof EVENT_FILE_FORMAT;
  version: number;
  exportedAt: number;
  app: string;
  event: EventInfo;
  matches: Match[];
  lobbies: Lobby[];
  teams: LibTeam[];
  players: LibPlayer[];
  /** Per match id. */
  rundown: Record<string, SavedRundown>;
  matchData: Record<string, MatchData>;
  mapRecords: Record<string, MapRecord[]>;
  recordShown: Record<string, number | 'series'>;
  postOptions: Record<string, PostOptions>;
  showTemplateOf: Record<string, string>;
  eventData: EventData | null;
  /** Looks and designs the show uses (added here only when this PC does not have them). */
  templates: Template[];
  showTemplates: ShowTemplate[];
  ownGraphics: OwnGraphic[];
  journal: JournalLine[];
  /** Pictures and fonts by their /air-assets/<id>. */
  assets: Record<string, { type: string; base64: string }>;
}

export interface EventCounts { matches: number; lobbies: number; results: number; teams: number; players: number; pictures: number }

export interface EventFileSaved { path: string; name: string; counts: EventCounts; bytes: number; missingPictures: number; journalProblems: string[] }

export interface EventFileCheck {
  token: string;
  name: string;
  exportedAt: number;
  counts: EventCounts;
  /** The same event (same id) is already on this PC. */
  exists: boolean;
  existing: EventCounts | null;
  /** Things in the file that do not add up, in plain words (an empty list: nothing found). */
  problems: string[];
}

export type ImportMode = 'copy' | 'replace';

/** The engine's asset store as the event file needs it. */
export interface AssetStore {
  get(id: string): Promise<Buffer | null>;
  put(id: string, bytes: Buffer): Promise<void>;
}

export interface EventFilesContext {
  store: Store;
  assets: AssetStore;
  journal: EventJournal | null;
  /** The event the producer is working in (selected match's or lobby's), for the auto-backup. */
  selectedEventId(): string | null;
  /** True while game data or a test round runs: replacing an event is refused then. */
  live(): boolean;
  /** After an import: derived things (own graphic screens, lobby teams, the engine) catch up. */
  imported(): Promise<void> | void;
  version: string;
  now?: () => number;
  /** Auto-backup debounce (default 10 s). */
  debounceMs?: number;
  changed: () => void;
  log: (text: string) => void;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
function assetType(raw: Buffer): string | null {
  const head = raw.subarray(0, 4);
  if (head.equals(PNG)) return 'image/png';
  if (head.equals(Buffer.from('wOF2'))) return 'font/woff2';
  if (head.equals(Buffer.from('wOFF'))) return 'font/woff';
  if (head.equals(Buffer.from([0, 1, 0, 0]))) return 'font/ttf';
  if (head.equals(Buffer.from('OTTO'))) return 'font/otf';
  return null;
}

export const safeName = (name: string) => name.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Event';

function countsOf(b: Pick<EventBundle, 'matches' | 'lobbies' | 'teams' | 'players' | 'mapRecords' | 'assets'>): EventCounts {
  const lobbyResults = b.lobbies.reduce((n, l) => n + l.games.filter((g) => g.results?.length).length, 0);
  const mapResults = Object.values(b.mapRecords).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0);
  return { matches: b.matches.length, lobbies: b.lobbies.length, results: lobbyResults + mapResults, teams: b.teams.length, players: b.players.length, pictures: Object.keys(b.assets).length };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const rec = <T>(v: unknown): Record<string, T> => (isObj(v) ? (v as Record<string, T>) : {});

/** Reads and checks an event file's text. Throws a plain message when it is not one Air can open. */
export function parseEventFile(text: string): EventBundle {
  if (text.length > MAX_FILE) throw new Error('That file is too large to be an event file.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That is not an Esportra Air event file (it cannot be read).'); }
  if (!isObj(raw) || raw.format !== EVENT_FILE_FORMAT) throw new Error('That is not an Esportra Air event file.');
  if (typeof raw.version !== 'number' || raw.version > EVENT_FILE_VERSION) throw new Error('That event file was saved by a newer Esportra Air. Update Air to open it.');
  const event = raw.event as EventInfo;
  if (!isObj(event) || typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(event.id) || typeof event.name !== 'string') throw new Error('The event in that file is damaged.');
  const matches = list<Match>(raw.matches), lobbies = list<Lobby>(raw.lobbies);
  for (const m of matches) if (!isObj(m) || typeof m.id !== 'string' || typeof m.code !== 'string' || m.eventId !== event.id) throw new Error('A match in that file is damaged.');
  for (const l of lobbies) if (!isObj(l) || typeof l.id !== 'string' || typeof l.code !== 'string' || l.eventId !== event.id || !Array.isArray(l.games) || !Array.isArray(l.teams)) throw new Error('A lobby in that file is damaged.');
  const assets: EventBundle['assets'] = {};
  for (const [id, a] of Object.entries(rec<{ type?: string; base64?: string }>(raw.assets))) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !isObj(a) || typeof a.base64 !== 'string') throw new Error('A picture in that file is damaged.');
    const bytes = Buffer.from(a.base64, 'base64');
    const type = assetType(bytes);
    if (!type || bytes.length > MAX_ASSET) throw new Error('A picture in that file is not a picture or font Air can use.');
    assets[id.toLowerCase()] = { type, base64: a.base64 };
  }
  return {
    format: EVENT_FILE_FORMAT, version: raw.version, exportedAt: Number(raw.exportedAt) || 0, app: String(raw.app ?? ''),
    event, matches, lobbies, teams: list<LibTeam>(raw.teams), players: list<LibPlayer>(raw.players),
    rundown: rec(raw.rundown), matchData: rec(raw.matchData), mapRecords: rec(raw.mapRecords), recordShown: rec(raw.recordShown), postOptions: rec(raw.postOptions),
    showTemplateOf: rec(raw.showTemplateOf), eventData: isObj(raw.eventData) ? (raw.eventData as unknown as EventData) : null,
    templates: list<Template>(raw.templates), showTemplates: list<ShowTemplate>(raw.showTemplates), ownGraphics: list<OwnGraphic>(raw.ownGraphics),
    journal: parseJournal(list<JournalLine>(raw.journal).map((l) => JSON.stringify(l)).join('\n')), assets,
  };
}

export class EventFiles {
  private readonly ctx: EventFilesContext;
  private readonly pending = new Map<string, EventBundle>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private auto: { lastAt: number | null; file: string | null; error: string | null } = { lastAt: null, file: null, error: null };

  constructor(ctx: EventFilesContext) {
    this.ctx = ctx;
    ctx.store.onSaved(() => this.touched());
  }

  private get now() { return this.ctx.now ?? Date.now; }
  private get data() { return this.ctx.store.data; }

  // ── export ──

  /** The event as a bundle. The journal first gets a baseline for any lobby it has not met, so it can rebuild them. */
  async bundle(eventId: string): Promise<{ bundle: EventBundle; missing: number }> {
    const d = this.data;
    const event = d.events.find((e) => e.id === eventId);
    if (!event) throw new Error('That event is gone.');
    const matches = d.matches.filter((m) => m.eventId === eventId);
    const lobbies = (d.lobbies ?? []).filter((l) => l.eventId === eventId);
    const j = this.ctx.journal;
    if (j) {
      for (const l of lobbies) {
        if (j.knows(eventId, l.id)) continue;
        const results: Record<number, unknown> = {};
        for (const g of l.games) if (g.results?.length) results[g.n] = g.results;
        j.append(eventId, 'lobby.baseline', { lobbyId: l.id, title: l.title, game: l.game, teams: l.teams.map((t) => t.id), games: l.games.length, results });
      }
    }
    const teamIds = new Set<string>(), playerIds = new Set<string>();
    for (const m of matches) {
      for (const t of m.teamIds ?? []) if (t) teamIds.add(t);
      for (const side of m.players ?? []) for (const p of side) if (p.libraryId) playerIds.add(p.libraryId);
    }
    for (const l of lobbies) for (const t of l.teams) if (t.teamId) teamIds.add(t.teamId);
    const players = (d.players ?? []).filter((p) => playerIds.has(p.id) || (p.teamId !== null && teamIds.has(p.teamId)));
    const pick = <T>(from: Record<string, T> | undefined) => Object.fromEntries(matches.filter((m) => from?.[m.id] !== undefined).map((m) => [m.id, structuredClone(from![m.id]!)]));
    const base = {
      format: EVENT_FILE_FORMAT, version: EVENT_FILE_VERSION, exportedAt: this.now(), app: this.ctx.version,
      event: structuredClone(event), matches: structuredClone(matches), lobbies: structuredClone(lobbies),
      teams: structuredClone((d.teams ?? []).filter((t) => teamIds.has(t.id))), players: structuredClone(players),
      rundown: pick(d.rundown), matchData: pick(d.matchData), mapRecords: pick(d.mapRecords), recordShown: pick(d.recordShown), postOptions: pick(d.postOptions), showTemplateOf: pick(d.showTemplateOf),
      eventData: d.eventData?.[eventId] ? structuredClone(d.eventData[eventId]!) : null,
      templates: [] as Template[], showTemplates: [] as ShowTemplate[], ownGraphics: [] as OwnGraphic[],
      journal: j ? j.read(eventId) : [], assets: {} as EventBundle['assets'],
    } satisfies EventBundle;
    // Looks, show templates and designs this show mentions (anything its Rundown rows or lobbies name by id).
    const mentioned = JSON.stringify([base.rundown, base.lobbies, base.showTemplateOf, base.matches]);
    base.templates = structuredClone((d.templates ?? []).filter((t) => mentioned.includes(t.id)));
    base.showTemplates = structuredClone((d.showTemplates ?? []).filter((t) => mentioned.includes(t.id)));
    base.ownGraphics = structuredClone((d.ownGraphics ?? []).filter((g) => mentioned.includes(g.id)));
    const refs = new Set<string>();
    for (const m of JSON.stringify(base).matchAll(ASSET_REF)) refs.add(m[1]!.toLowerCase());
    let missing = 0;
    for (const id of refs) {
      const bytes = await this.ctx.assets.get(id).catch(() => null);
      const type = bytes ? assetType(bytes) : null;
      if (!bytes || !type) { missing += 1; continue; }
      base.assets[id] = { type, base64: bytes.toString('base64') };
    }
    return { bundle: base, missing };
  }

  /** The text of the event's file and what is in it. */
  async render(eventId: string) {
    const { bundle, missing } = await this.bundle(eventId);
    const lobbies = bundle.lobbies;
    const check = verify(bundle.journal, lobbies);
    return { text: JSON.stringify(bundle), bundle, counts: countsOf(bundle), missing, problems: check.problems };
  }

  async save(eventId: string, path: string): Promise<EventFileSaved> {
    const r = await this.render(eventId);
    writeDurable(path, r.text);
    this.ctx.log(`Saved the event file for ${r.bundle.event.name}`);
    return { path, name: r.bundle.event.name, counts: r.counts, bytes: Buffer.byteLength(r.text), missingPictures: r.missing, journalProblems: r.problems };
  }

  defaultFileName(eventId: string) {
    const e = this.data.events.find((x) => x.id === eventId);
    return `${safeName(e?.name ?? 'Event')}${EVENT_FILE_EXT}`;
  }

  // ── import ──

  /** Reads an event file and says what is in it. Nothing changes until `confirm`. */
  check(text: string): EventFileCheck {
    const bundle = parseEventFile(text);
    const token = randomUUID();
    this.pending.clear();
    this.pending.set(token, bundle);
    const here = this.data.events.some((e) => e.id === bundle.event.id);
    let existing: EventCounts | null = null;
    if (here) {
      const d = this.data;
      const matches = d.matches.filter((m) => m.eventId === bundle.event.id);
      const lobbies = (d.lobbies ?? []).filter((l) => l.eventId === bundle.event.id);
      existing = countsOf({ matches, lobbies, teams: [], players: [], mapRecords: Object.fromEntries(matches.map((m) => [m.id, d.mapRecords?.[m.id] ?? []])), assets: {} });
      existing.teams = bundle.teams.length; existing.players = bundle.players.length;
    }
    const problems = verify(bundle.journal, bundle.lobbies).problems;
    const missing = [...new Set([...JSON.stringify({ ...bundle, assets: {} }).matchAll(ASSET_REF)].map((m) => m[1]!.toLowerCase()))].filter((id) => !bundle.assets[id]).length;
    if (missing) problems.push(`${missing} picture${missing === 1 ? '' : 's'} used by the event ${missing === 1 ? 'is' : 'are'} not in the file.`);
    return { token, name: bundle.event.name, exportedAt: bundle.exportedAt, counts: countsOf(bundle), exists: here, existing, problems };
  }

  /** Merges the checked file into this PC's store. Returns the event's id here. */
  async confirm(token: string, mode: ImportMode): Promise<{ eventId: string; name: string }> {
    const b = this.pending.get(token);
    if (!b) throw new Error('Open the event file again.');
    const d = this.data;
    const here = d.events.some((e) => e.id === b.event.id);
    if (here && mode === 'replace' && this.ctx.live()) throw new Error('A show is live on this PC. Stop game data or the test before replacing an event.');
    // Pictures first: if the engine cannot take them, nothing in the store has changed yet.
    for (const [id, a] of Object.entries(b.assets)) await this.ctx.assets.put(id, Buffer.from(a.base64, 'base64'));
    const clash = d.matches.some((m) => b.matches.some((x) => x.id === m.id && m.eventId !== b.event.id)) || (d.lobbies ?? []).some((l) => b.lobbies.some((x) => x.id === l.id && l.eventId !== b.event.id));
    const copy = (here && mode === 'copy') || clash;
    const bundle = structuredClone(b);
    const eventId = copy ? randomUUID() : b.event.id;
    const lobbyMap = new Map<string, string>(), matchMap = new Map<string, string>();
    if (copy) {
      bundle.event = { ...bundle.event, id: eventId, tournamentId: null };
      bundle.matches = bundle.matches.map((m) => {
        const id = randomUUID();
        matchMap.set(m.id, id);
        const next: Match = { ...m, id, code: `Q${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, eventId, kind: 'quick' };
        // A copy is no longer the Esportra match: it must not sync or send results for it.
        delete next.source;
        return next;
      });
      bundle.lobbies = bundle.lobbies.map((l) => {
        const id = randomUUID();
        lobbyMap.set(l.id, id);
        return { ...l, id, code: `L${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, eventId };
      });
      const rekey = <T>(from: Record<string, T>) => Object.fromEntries(Object.entries(from).filter(([k]) => matchMap.has(k)).map(([k, v]) => [matchMap.get(k)!, v]));
      bundle.rundown = rekey(bundle.rundown); bundle.matchData = rekey(bundle.matchData); bundle.mapRecords = rekey(bundle.mapRecords);
      bundle.recordShown = rekey(bundle.recordShown); bundle.postOptions = rekey(bundle.postOptions); bundle.showTemplateOf = rekey(bundle.showTemplateOf);
      bundle.journal = bundle.journal.map((l) => ({ ...l, eventId, data: typeof l.data.lobbyId === 'string' && lobbyMap.has(l.data.lobbyId) ? { ...l.data, lobbyId: lobbyMap.get(l.data.lobbyId)! } : l.data }));
      bundle.event.name = `${bundle.event.name} (copy)`;
    } else if (here) {
      this.dropEvent(eventId);
    }
    // Teams and players the library does not have yet are added; the ones it has stay as this PC has them.
    d.teams = [...(d.teams ?? []), ...bundle.teams.filter((t) => !(d.teams ?? []).some((x) => x.id === t.id))];
    d.players = [...(d.players ?? []), ...bundle.players.filter((p) => !(d.players ?? []).some((x) => x.id === p.id))];
    d.templates = [...(d.templates ?? []), ...bundle.templates.filter((t) => !(d.templates ?? []).some((x) => x.id === t.id))];
    d.showTemplates = [...(d.showTemplates ?? []), ...bundle.showTemplates.filter((t) => !(d.showTemplates ?? []).some((x) => x.id === t.id))];
    d.ownGraphics = [...(d.ownGraphics ?? []), ...bundle.ownGraphics.filter((g) => !(d.ownGraphics ?? []).some((x) => x.id === g.id))];
    d.events = [...d.events, bundle.event];
    d.matches = [...d.matches, ...bundle.matches];
    d.lobbies = [...(d.lobbies ?? []), ...bundle.lobbies];
    const into = <K extends 'rundown' | 'matchData' | 'mapRecords' | 'recordShown' | 'postOptions' | 'showTemplateOf'>(key: K) => { d[key] = { ...(d[key] ?? {}), ...bundle[key] } as never; };
    for (const k of ['rundown', 'matchData', 'mapRecords', 'recordShown', 'postOptions', 'showTemplateOf'] as const) into(k);
    if (bundle.eventData) d.eventData = { ...(d.eventData ?? {}), [eventId]: bundle.eventData };
    this.ctx.store.save();
    if (this.ctx.journal) {
      try {
        this.ctx.journal.replaceWith(eventId, bundle.journal);
        this.ctx.journal.append(eventId, 'event.import', { mode: copy ? 'copy' : here ? 'replace' : 'new', fileSavedAt: b.exportedAt });
      } catch (e) { this.ctx.log(`Could not write the event journal: ${e instanceof Error ? e.message : String(e)}`); }
    }
    this.pending.delete(token);
    this.ctx.log(`Opened the event file for ${bundle.event.name}${copy ? ' as a copy' : here ? ', replacing the event' : ''}`);
    await this.ctx.imported();
    this.ctx.changed();
    return { eventId, name: bundle.event.name };
  }

  /** Removes an event with its matches, lobbies and what is kept per match (used when a file replaces it). */
  private dropEvent(eventId: string) {
    const d = this.data;
    const gone = new Set(d.matches.filter((m) => m.eventId === eventId).map((m) => m.id));
    d.matches = d.matches.filter((m) => m.eventId !== eventId);
    d.lobbies = (d.lobbies ?? []).filter((l) => l.eventId !== eventId);
    d.events = d.events.filter((e) => e.id !== eventId);
    for (const key of ['rundown', 'matchData', 'mapRecords', 'recordShown', 'postOptions', 'showTemplateOf', 'autopilotProgress', 'esportraResults', 'esportraVetoOutbox'] as const) {
      const m = d[key] as Record<string, unknown> | undefined;
      if (m) for (const id of gone) delete m[id];
    }
    if (d.eventData) delete d.eventData[eventId];
  }

  // ── auto-backup folder ──

  view() {
    const folder = this.data.autoBackup?.folder ?? null;
    return { folder, lastAt: this.auto.lastAt, file: this.auto.file, error: this.auto.error };
  }

  setFolder(folder: string | null) {
    if (folder === null) delete this.data.autoBackup;
    else {
      mkdirSync(folder, { recursive: true });
      this.data.autoBackup = { folder };
    }
    this.auto = { lastAt: null, file: null, error: null };
    this.ctx.store.save();
    if (folder) this.touched();
    this.ctx.changed();
  }

  /** A change was saved: write the selected event's file once things settle (10 s). */
  private touched() {
    if (!this.data.autoBackup?.folder) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.backupNow().catch(() => {}), this.ctx.debounceMs ?? 10_000);
    this.timer.unref?.();
  }

  async backupNow(): Promise<string | null> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const folder = this.data.autoBackup?.folder;
    const id = this.ctx.selectedEventId();
    if (!folder || !id || !this.data.events.some((e) => e.id === id)) return null;
    try {
      if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
      const r = await this.render(id);
      const file = join(folder, `${safeName(r.bundle.event.name)} ${id.slice(0, 6)}${EVENT_FILE_EXT}`);
      writeDurable(file, r.text);
      this.auto = { lastAt: this.now(), file, error: null };
      this.ctx.changed();
      return file;
    } catch (e) {
      this.auto = { ...this.auto, error: e instanceof Error ? e.message : String(e) };
      this.ctx.changed();
      return null;
    }
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
