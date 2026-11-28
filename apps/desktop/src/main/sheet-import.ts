// Import teams and players from a list (28 Nov): the file side. src/shared/sheet-import.ts reads and checks the list;
// this folder scan finds the pictures, and Confirm saves into Teams/Players (and optionally into lobbies).
//
// Pictures: the producer chooses a folder; Air looks in it and the folders inside it for PNG and JPEG files, reads each
// once to know whether two names point at the same picture, and keeps the list in memory only until the import is done
// (no paths are saved anywhere). Only the pictures that belong to a team or player are copied into the engine's asset
// store, through the same path as every other uploaded picture (JPEG becomes PNG there).
//
// Reading .xlsx is not built: a spreadsheet file is a zip of XML, and a zip reader for files the producer drops in is not
// worth a new dependency or the risk. The producer saves the sheet as CSV (or pastes the cells), and the screen says so.
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { LibPlayer, LibTeam } from '../shared/api.ts';
import type { GameId } from '../shared/games.ts';
import { playerRoles } from '../shared/games.ts';
import { normName } from '../shared/pcob.ts';
import { findLibraryPlayer, findLibraryTeam, matchPictures, type PicFile, type PicMatch, type PicWanted } from '../shared/sheet-import.ts';
import { cleanUid } from '../shared/uid.ts';
import type { Lobbies } from './br-lobbies.ts';
import { tagOf } from './team-library.ts';
import type { Store } from './store.ts';

const MAX_TEAMS = 200, MAX_PLAYERS = 24, MAX_FILES = 4000, MAX_DEPTH = 4, MAX_BYTES = 6_000_000;
const COLOURS = ['#22d3ee', '#f43f5e', '#f59e0b', '#22c55e', '#a78bfa', '#38bdf8', '#fb7185', '#facc15', '#34d399', '#c084fc', '#60a5fa', '#f97316'];
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');
const isImage = (name: string) => /\.(png|jpe?g)$/i.test(name);

export interface ImportPlayerInput { key: string; ign: string; uid?: string; role?: string; photoHint?: string }
export interface ImportTeamInput { key: string; name: string; tag?: string; group?: string; logoHint?: string; players: ImportPlayerInput[] }
export interface ImportInput {
  teams: ImportTeamInput[];
  /** After saving: nothing, add the teams to one lobby, or make a lobby for each group in the list. */
  target?: { kind: 'none' } | { kind: 'lobby'; id: string } | { kind: 'groups'; eventId: string };
  pictures?: { token: string; picks?: Record<string, string>; useShared?: boolean } | null;
}
export interface PictureInput { token?: string | null; folder?: string | null; wanted: PicWanted; picks?: Record<string, string>; useShared?: boolean }
export interface PictureScan {
  token: string; folder: string; files: number;
  logos: { found: number; of: number }; photos: { found: number; of: number };
  /** key → file path inside the folder, for what was matched. */
  logoFiles: Record<string, string>; photoFiles: Record<string, string>;
  shared: Array<{ file: string; keys: string[] }>;
  unmatchedLogos: Array<{ key: string; closest: string | null; closestId: string | null }>;
  unmatchedPhotos: string[];
  /** Files left out (too large, unreadable). */
  skipped: string[];
}
export interface ImportResult {
  teams: { created: number; updated: number }; players: { created: number; updated: number };
  pictures: { logos: number; photos: number };
  lobbies: string[];
  /** Plain sentences about what was not done (a UID another player has, a lobby that could not take the teams, a picture that failed). */
  problems: string[];
}

interface Scan { folder: string; files: Map<string, { abs: string; type: string }>; list: PicFile[]; skipped: string[] }

export interface SheetImportContext {
  store: Store;
  /** Stores image bytes in the engine and returns their URL (JPEG and WebP are converted to PNG). */
  storeImage: (raw: Buffer, type: string) => Promise<string>;
  /** Teams/Players changed: matches and lobbies follow. */
  libraryChanged: () => Promise<void>;
  lobbies: Lobbies;
  game: () => GameId | null;
  log: (t: string) => void;
}

export class SheetImporter {
  private scans = new Map<string, Scan>();
  private readonly ctx: SheetImportContext;
  constructor(ctx: SheetImportContext) { this.ctx = ctx; }
  private get data() { return this.ctx.store.data; }

  /** Looks through a folder (the caller asks for it), then matches its pictures to the teams and players named. */
  async pictures(input: PictureInput): Promise<PictureScan | null> {
    let scan = input.token ? this.scans.get(input.token) : undefined;
    let token = input.token ?? '';
    if (!scan) {
      const folder = input.folder;
      if (!folder) return null;
      scan = await this.read(folder);
      token = randomUUID();
      this.scans.set(token, scan);
      for (const k of [...this.scans.keys()].slice(0, -3)) this.scans.delete(k);
    }
    const want = this.wanted(input.wanted);
    const m = matchPictures(scan.list, want, input.picks ?? {}, input.useShared === true);
    const path = (id: string) => scan!.list.find((f) => f.id === id)?.path ?? '';
    return {
      token, folder: scan.folder, files: scan.list.length,
      logos: { found: Object.keys(m.logos).length, of: want.teams.length },
      photos: { found: Object.keys(m.photos).length, of: want.players.length },
      logoFiles: Object.fromEntries(Object.entries(m.logos).map(([k, id]) => [k, path(id)])),
      photoFiles: Object.fromEntries(Object.entries(m.photos).map(([k, id]) => [k, path(id)])),
      shared: m.shared.map((x) => ({ file: x.file, keys: x.keys })),
      unmatchedLogos: m.unmatchedLogos, unmatchedPhotos: m.unmatchedPhotos, skipped: scan.skipped,
    };
  }

  private wanted(w: PicWanted): PicWanted {
    if (!w || !Array.isArray(w.teams) || !Array.isArray(w.players) || w.teams.length > MAX_TEAMS || w.players.length > MAX_TEAMS * MAX_PLAYERS) throw new Error('That list is too large to look up pictures for.');
    return {
      teams: w.teams.map((t) => ({ key: text(t.key, 120), name: text(t.name, 40), tag: text(t.tag, 5), hint: text(t.hint, 300) })),
      players: w.players.map((p) => ({ key: text(p.key, 160), team: text(p.team, 40), ign: text(p.ign, 32), hint: text(p.hint, 300) })),
    };
  }

  /** Every PNG and JPEG in the folder and the folders inside it, with a hash of its bytes. */
  private async read(folder: string): Promise<Scan> {
    const root = text(folder, 1000).replace(/^<|>$/g, '');
    const info = await stat(root).catch(() => null);
    if (!info?.isDirectory()) throw new Error('That folder cannot be opened.');
    const files = new Map<string, { abs: string; type: string }>(), list: PicFile[] = [], skipped: string[] = [];
    const walk = async (dir: string, depth: number) => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
        const abs = join(dir, e.name);
        if (e.isDirectory()) { if (depth < MAX_DEPTH) await walk(abs, depth + 1); continue; }
        if (!e.isFile() || !isImage(e.name)) continue;
        if (list.length >= MAX_FILES) { if (!skipped.includes('More than 4000 pictures: the rest were not looked at.')) skipped.push('More than 4000 pictures: the rest were not looked at.'); continue; }
        const rel = relative(root, abs);
        try {
          const size = (await stat(abs)).size;
          if (size > MAX_BYTES) { skipped.push(`${rel} is larger than 6 MB`); continue; }
          const bytes = await readFile(abs);
          const id = String(list.length);
          list.push({ id, path: rel, name: e.name, hash: createHash('sha256').update(bytes).digest('hex') });
          files.set(id, { abs, type: /\.png$/i.test(e.name) ? 'image/png' : 'image/jpeg' });
        } catch { skipped.push(`${rel} could not be read`); }
      }
    };
    await walk(root, 0);
    return { folder: root, files, list, skipped };
  }

  /** Saves the list: teams and players into Teams/Players (new ones added, saved ones updated), pictures, and the lobbies. */
  async import(input: ImportInput): Promise<ImportResult> {
    if (!input || !Array.isArray(input.teams) || !input.teams.length || input.teams.length > MAX_TEAMS) throw new Error('There is nothing to import.');
    const game = this.ctx.game() ?? 'pubgm';
    const roles = playerRoles(game);
    const out: ImportResult = { teams: { created: 0, updated: 0 }, players: { created: 0, updated: 0 }, pictures: { logos: 0, photos: 0 }, lobbies: [], problems: [] };
    const teams = input.teams.map((t) => {
      if (!Array.isArray(t.players) || t.players.length > MAX_PLAYERS) throw new Error(`${text(t.name, 40) || 'A team'} has more than ${MAX_PLAYERS} players.`);
      const name = text(t.name, 40);
      if (!name) throw new Error('A team has no name.');
      return { ...t, name, tag: text(t.tag, 5).toUpperCase(), group: text(t.group, 40), players: t.players.map((p) => ({ ...p, ign: text(p.ign, 32), photoHint: text(p.photoHint, 300) })).filter((p) => p.ign) };
    });
    // Pictures first: a stopped engine fails here, before anything in Teams/Players changes.
    const urls = new Map<string, string>();
    let match: PicMatch | null = null;
    if (input.pictures) {
      const scan = this.scans.get(input.pictures.token);
      if (!scan) throw new Error('Choose the pictures folder again.');
      match = matchPictures(scan.list, this.wanted({ teams: teams.map((t) => ({ key: t.key, name: t.name, tag: t.tag ?? '', hint: text(t.logoHint, 300) })), players: teams.flatMap((t) => t.players.map((p) => ({ key: p.key, team: t.name, ign: p.ign, hint: p.photoHint }))) }), input.pictures.picks ?? {}, input.pictures.useShared === true);
      const need = new Set([...Object.values(match.logos), ...Object.values(match.photos)]);
      for (const id of need) {
        const f = scan.files.get(id);
        if (!f) continue;
        try { urls.set(id, await this.ctx.storeImage(await readFile(f.abs), f.type)); } catch (e) { out.problems.push(`${scan.list.find((x) => x.id === id)?.path ?? 'A picture'}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    const lib = { teams: this.data.teams ?? (this.data.teams = []), players: this.data.players ?? (this.data.players = []) };
    const seatIds: Array<{ group: string; id: string }> = [];
    for (const t of teams) {
      const logo = match?.logos[t.key] ? urls.get(match.logos[t.key]!) ?? '' : '';
      let team: LibTeam | null = findLibraryTeam(lib, t.name, t.tag ?? '');
      if (team) {
        out.teams.updated++;
        if (logo) team.logo = logo;
      } else {
        const tag = t.tag || tagOf(t.name);
        team = { id: randomUUID(), name: t.name, tag, color: COLOURS[lib.teams.length % COLOURS.length]!, logo };
        lib.teams.push(team);
        out.teams.created++;
      }
      if (logo) out.pictures.logos++;
      seatIds.push({ group: t.group || '', id: team.id });
      for (const p of t.players) {
        const { uid, problem } = cleanUid(p.uid);
        if (problem) out.problems.push(`${p.ign}: ${problem}`);
        const photo = match?.photos[p.key] ? urls.get(match.photos[p.key]!) ?? '' : '';
        let row = findLibraryPlayer(lib, team.id, { ign: p.ign, uid });
        const role = typeof p.role === 'string' && roles.includes(p.role) ? p.role : '';
        // The UID is the player's identity: a saved player who has it is this player, whatever the sheet calls them or
        // whichever team they were on. Say so, so a typo in the sheet's UID is not silent.
        if (row && uid && row.uid === uid && (normName(row.gameId || row.name) !== normName(p.ign) || row.teamId !== team.id)) out.problems.push(`${p.ign}: UID ${uid} was already ${row.gameId || row.name} in Teams/Players, so that player is now ${p.ign} on ${team.name}.`);
        const useUid = uid;
        if (row) {
          out.players.updated++;
          const next: LibPlayer = { ...row, gameId: p.ign, teamId: team.id, ...(useUid ? { uid: useUid } : {}), ...(role ? { role } : {}), ...(photo ? { photo } : {}) };
          Object.assign(row, next);
        } else {
          row = { id: randomUUID(), name: p.ign, realName: '', gameId: p.ign, photo, role, teamId: team.id, ...(useUid ? { uid: useUid } : {}) };
          lib.players.push(row);
          out.players.created++;
        }
        if (photo) out.pictures.photos++;
      }
    }
    this.ctx.store.save();
    await this.ctx.libraryChanged();
    await this.place(input.target, seatIds, out);
    this.ctx.log(`Import: ${out.teams.created} new and ${out.teams.updated} updated teams, ${out.players.created} new and ${out.players.updated} updated players${out.lobbies.length ? `, in ${out.lobbies.join(', ')}` : ''}`);
    if (input.pictures) this.scans.delete(input.pictures.token);
    return out;
  }

  /** Puts the imported teams in a lobby, or in one lobby per group. A lobby that cannot take them (a match is live) says why; the teams are saved anyway. */
  private async place(target: ImportInput['target'], seats: Array<{ group: string; id: string }>, out: ImportResult) {
    if (!target || target.kind === 'none') return;
    const add = (lobbyId: string, ids: string[]) => {
      const l = this.ctx.lobbies.find(lobbyId);
      const have = l.teams.map((t) => t.teamId).filter((x): x is string => !!x);
      this.ctx.lobbies.setTeams(lobbyId, [...have, ...ids.filter((x) => !have.includes(x))]);
      out.lobbies.push(l.title);
    };
    try {
      if (target.kind === 'lobby') { add(target.id, seats.map((s) => s.id)); return; }
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const byGroup = new Map<string, string[]>();
      for (const s of seats) byGroup.set(s.group || 'Lobby', [...(byGroup.get(s.group || 'Lobby') ?? []), s.id]);
      for (const [group, ids] of byGroup) {
        try {
          const game = this.ctx.game();
          if (!game) throw new Error('Choose a game first.');
          const found = this.ctx.lobbies.list().find((l) => l.eventId === target.eventId && norm(l.title) === norm(group));
          const lobby = found ?? await this.ctx.lobbies.create({ eventId: target.eventId, game, title: group, games: 6, maps: [] });
          add(lobby.id, ids);
        } catch (e) { out.problems.push(`${group}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    } catch (e) { out.problems.push(e instanceof Error ? e.message : String(e)); }
  }
}
