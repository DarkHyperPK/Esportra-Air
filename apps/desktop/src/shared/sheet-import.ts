// Import teams and players from a list (28 Nov, approved mock "Import teams and players"). Pure: reads CSV or pasted
// sheet rows, guesses which column is which from its header words, groups the rows into teams, checks them, and
// matches picture files to teams and players. src/main/sheet-import.ts does the file work and saves.
//
// Nothing here is assumed about the producer's sheet: every column is guessed from its header and can be changed, and
// a row's team falls back to the row above (sheets often name the team once). A UID is only digits (src/shared/uid.ts).
import type { LibPlayer, LibTeam } from './api.ts';
import { isCoach } from './games.ts';
import { normName } from './pcob.ts';
import { cleanUid } from './uid.ts';

export type Field = 'team' | 'tag' | 'group' | 'ign' | 'uid' | 'role' | 'logo' | 'photo';
export const FIELDS: Array<{ id: Field; label: string; optional: boolean }> = [
  { id: 'team', label: 'Team', optional: false },
  { id: 'tag', label: 'Tag', optional: true },
  { id: 'group', label: 'Group', optional: true },
  { id: 'ign', label: 'Player (IGN)', optional: false },
  { id: 'uid', label: 'UID', optional: false },
  { id: 'role', label: 'Role', optional: true },
  { id: 'logo', label: 'Logo file', optional: true },
  { id: 'photo', label: 'Photo file', optional: true },
];
export type Mapping = Record<Field, number | null>;
export const NO_MAPPING: Mapping = { team: null, tag: null, group: null, ign: null, uid: null, role: null, logo: null, photo: null };

// ── reading the list ──

/** Rows of cells from CSV (comma or semicolon) or pasted sheet cells (tab). Quotes may hold the separator and line breaks. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const first = src.split('\n', 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  const sep = count('\t') > 0 ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

const words = (h: string) => h.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Which field a header names, or null. `weakUid` marks a plain "ID" column, used for UID only when nothing says UID. */
function fieldOf(header: string): { field: Field | null; weakUid?: boolean } {
  const w = words(header), flat = w.join('');
  const has = (...x: string[]) => x.some((k) => w.includes(k));
  const idish = has('id') || flat.endsWith('id');
  if (!flat) return { field: null };
  if (/logo|crest|emblem/.test(flat)) return { field: 'logo' };
  if (/photo|picture|avatar|headshot|portrait/.test(flat)) return { field: 'photo' };
  if (has('uid') || /^(character|char)(s)?id$/.test(flat) || (/character|char/.test(flat) && idish)) return { field: 'uid' };
  if (has('tag', 'abbreviation', 'abbr', 'short', 'shortname', 'acronym')) return { field: 'tag' };
  if (has('group', 'pool', 'pod')) return { field: 'group' };
  if (has('role', 'position')) return { field: 'role' };
  // "Team ID", "Squad ID": the sheet's own key for the team, not something Air uses.
  if (has('team', 'squad', 'clan', 'org', 'organisation', 'organization') && idish) return { field: null };
  if (has('ign') || flat === 'ingamename' || flat === 'playername' || flat === 'player' || flat === 'nickname' || flat === 'nick' || flat === 'gamername') return { field: 'ign' };
  if (idish && (has('player', 'member') || flat === 'id')) return { field: null, weakUid: true };
  if (flat === 'team' || flat === 'teamname' || flat === 'squad' || flat === 'squadname' || flat === 'clan' || flat === 'org' || flat === 'organisation' || flat === 'organization' || flat === 'teamnameofficial') return { field: 'team' };
  if (has('team') && has('name')) return { field: 'team' };
  if (has('player') && has('ign', 'name')) return { field: 'ign' };
  return { field: null };
}

/** Columns guessed from header words; each field takes the first column that names it. */
export function guessColumns(headers: string[]): Mapping {
  const out: Mapping = { ...NO_MAPPING };
  let weak: number | null = null;
  headers.forEach((h, i) => {
    const g = fieldOf(h);
    if (g.weakUid && weak === null) weak = i;
    if (g.field && out[g.field] === null) out[g.field] = i;
  });
  if (out.uid === null && weak !== null && !Object.values(out).includes(weak)) out.uid = weak;
  return out;
}

/** True when the first line looks like headers (at least two fields recognised) and not like data. */
export const looksLikeHeader = (row: string[]) => Object.values(guessColumns(row)).filter((v) => v !== null).length >= 2 && !row.some((c) => /^\d{5,}$/.test(c));

export interface Sheet { headers: string[]; rows: string[][]; hasHeader: boolean }
export function readSheet(text: string, hasHeader?: boolean): Sheet {
  const all = parseDelimited(text);
  const header = hasHeader ?? (all[0] ? looksLikeHeader(all[0]) : true);
  const width = Math.max(0, ...all.map((r) => r.length));
  const headers = header && all[0] ? Array.from({ length: width }, (_, i) => all[0]![i] ?? '') : Array.from({ length: width }, (_, i) => `Column ${String.fromCharCode(65 + (i % 26))}`);
  return { headers, rows: header ? all.slice(1) : all, hasHeader: header };
}

// ── teams and players ──

export const SQUAD = ['IGL', 'Player', 'Sub', 'Coach'] as const;
/** The squad role a sheet's word means, '' when it says none and null when Air does not know it. */
export function roleOf(raw: string): string | null {
  const r = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!r) return '';
  if (['igl', 'captain', 'capt', 'cap', 'leader', 'ingameleader', 'shotcaller'].includes(r)) return 'IGL';
  if (['player', 'main', 'member', 'fragger', 'assaulter', 'scout', 'sniper', 'support', 'flex'].includes(r)) return 'Player';
  if (['sub', 'substitute', 'reserve', 'bench', 'backup'].includes(r)) return 'Sub';
  if (['coach', 'manager', 'analyst', 'headcoach'].includes(r)) return 'Coach';
  return null;
}

export interface PlayerCheck { id: 'uid-missing' | 'uid-invalid' | 'uid-duplicate' | 'ign-duplicate' | 'role-unknown'; text: string }
export interface ImportPlayer {
  key: string; line: number; ign: string; uid: string; role: string; photoHint: string;
  checks: PlayerCheck[];
}
export interface TeamCheck { id: 'few-players' | 'ign-duplicate' | 'uid-missing' | 'uid-problem'; text: string }
export interface ImportTeam {
  key: string; name: string; tag: string; group: string; logoHint: string;
  players: ImportPlayer[];
  /** Players in the game: coaches are kept in the team but not counted. */
  counted: number;
  status: 'new' | 'update';
  libraryId: string | null;
  checks: TeamCheck[];
}
export interface ImportPreview {
  teams: ImportTeam[];
  players: number;
  skipped: Array<{ line: number; reason: string }>;
  /** Why nothing can be imported yet (a column missing), or null. */
  blocked: string | null;
  counts: { all: number; needs: number; added: number; updates: number };
}

/** The squad size a team is expected to have (PUBG MOBILE and Free Fire squads are four). */
export const SQUAD_SIZE = 4;
const tagOf = (name: string) => {
  const w = name.toUpperCase().match(/[A-Z0-9]+/g) ?? ['TEAM'];
  return (w.length > 1 ? w.map((x) => x[0]).join('') : w[0]!).slice(0, 3);
};

/** The Teams/Players team a sheet team is: by name, then by tag. */
export function findLibraryTeam(lib: { teams: LibTeam[] }, name: string, tag: string): LibTeam | null {
  const n = normName(name), t = normName(tag);
  return lib.teams.find((x) => normName(x.name) === n) ?? (t ? lib.teams.find((x) => normName(x.tag) === t) : undefined) ?? null;
}
/** The Teams/Players player a sheet player is: by UID, then by in-game name within the team. */
export function findLibraryPlayer(lib: { players: LibPlayer[] }, teamId: string | null, p: { ign: string; uid: string }): LibPlayer | null {
  if (p.uid) { const hit = lib.players.find((x) => x.uid === p.uid); if (hit) return hit; }
  const n = normName(p.ign);
  return teamId ? lib.players.find((x) => x.teamId === teamId && (normName(x.gameId) === n || normName(x.name) === n)) ?? null : null;
}

const cell = (row: string[], i: number | null) => (i === null ? '' : (row[i] ?? '').trim());

export function buildImport(sheet: Sheet, map: Mapping, lib: { teams: LibTeam[]; players: LibPlayer[] }): ImportPreview {
  const empty: ImportPreview = { teams: [], players: 0, skipped: [], blocked: null, counts: { all: 0, needs: 0, added: 0, updates: 0 } };
  if (map.team === null) return { ...empty, blocked: 'Choose the column with the team names.' };
  if (map.ign === null) return { ...empty, blocked: 'Choose the column with the players’ in-game names.' };
  const teams = new Map<string, ImportTeam>();
  const skipped: ImportPreview['skipped'] = [];
  const offset = sheet.hasHeader ? 2 : 1;
  let last = '';
  sheet.rows.forEach((row, i) => {
    const line = i + offset;
    const teamName = (cell(row, map.team) || last).replace(/[<>]/g, '').slice(0, 40);
    const ign = cell(row, map.ign).replace(/[<>]/g, '');
    if (!teamName && !ign) return;
    if (!teamName) { skipped.push({ line, reason: 'No team name' }); return; }
    last = teamName;
    if (!ign) { skipped.push({ line, reason: `No player name for ${teamName}` }); return; }
    const key = normName(teamName);
    let t = teams.get(key);
    if (!t) { t = { key, name: teamName, tag: '', group: '', logoHint: '', players: [], counted: 0, status: 'new', libraryId: null, checks: [] }; teams.set(key, t); }
    t.tag ||= cell(row, map.tag).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    t.group ||= cell(row, map.group).slice(0, 40);
    t.logoHint ||= cell(row, map.logo);
    const roleRaw = cell(row, map.role), role = roleOf(roleRaw);
    const { uid, problem } = cleanUid(cell(row, map.uid));
    const checks: PlayerCheck[] = [];
    if (role === null) checks.push({ id: 'role-unknown', text: `Role “${roleRaw}” is not one Air knows (IGL, Player, Sub, Coach)` });
    t.players.push({ key: `${key}|${normName(ign)}|${line}`, line, ign: ign.slice(0, 32), uid, role: role ?? '', photoHint: cell(row, map.photo), checks: problem ? [...checks, { id: 'uid-invalid', text: problem }] : checks });
  });
  const list = [...teams.values()];
  // Check each team and each player.
  const owners = new Map<string, ImportPlayer[]>(), uids = new Map<string, ImportPlayer[]>();
  const teamOf = new Map<ImportPlayer, ImportTeam>();
  for (const t of list) {
    t.tag ||= tagOf(t.name);
    const hit = findLibraryTeam(lib, t.name, t.tag);
    if (hit) { t.status = 'update'; t.libraryId = hit.id; }
    for (const p of t.players) {
      teamOf.set(p, t);
      const n = normName(p.ign);
      owners.set(n, [...(owners.get(n) ?? []), p]);
      if (p.uid) uids.set(p.uid, [...(uids.get(p.uid) ?? []), p]);
    }
  }
  for (const t of list) {
    t.counted = t.players.filter((p) => !isCoach(p.role)).length;
    if (t.counted < SQUAD_SIZE) t.checks.push({ id: 'few-players', text: `${t.counted} player${t.counted === 1 ? '' : 's'}` });
    for (const p of t.players) {
      const same = owners.get(normName(p.ign))!.filter((x) => x !== p);
      if (same.length) { const other = same.map((x) => teamOf.get(x)!.name).filter((x, i, a) => a.indexOf(x) === i); p.checks.push({ id: 'ign-duplicate', text: `Same name as in ${other.join(', ')}${other.length === 1 && other[0] === t.name ? ' (twice in this team)' : ''}` }); }
      if (p.uid && uids.get(p.uid)!.length > 1) p.checks.push({ id: 'uid-duplicate', text: `The same UID is on ${uids.get(p.uid)!.filter((x) => x !== p).map((x) => x.ign).join(', ')}` });
      // A UID Teams/Players already gives to someone else.
      if (p.uid) {
        const mine = findLibraryPlayer(lib, t.libraryId, p);
        const owner = lib.players.find((x) => x.uid === p.uid);
        if (owner && mine && owner.id !== mine.id) p.checks.push({ id: 'uid-duplicate', text: `This UID is already ${owner.name}’s in Teams/Players` });
      }
      if (!p.uid && !p.checks.some((c) => c.id === 'uid-invalid') && !isCoach(p.role)) p.checks.push({ id: 'uid-missing', text: 'UID missing' });
    }
    const missing = t.players.filter((p) => p.checks.some((c) => c.id === 'uid-missing')).length;
    if (missing) t.checks.push({ id: 'uid-missing', text: `${missing} UID missing` });
    const bad = t.players.filter((p) => p.checks.some((c) => c.id === 'uid-invalid' || c.id === 'uid-duplicate')).length;
    if (bad) t.checks.push({ id: 'uid-problem', text: `${bad} UID to fix` });
    if (t.players.some((p) => p.checks.some((c) => c.id === 'ign-duplicate'))) t.checks.push({ id: 'ign-duplicate', text: 'Duplicate name' });
  }
  const needs = list.filter((t) => t.checks.length || t.players.some((p) => p.checks.length)).length;
  return { teams: list, players: list.reduce((n, t) => n + t.players.length, 0), skipped, blocked: list.length ? null : 'No team and player rows found.', counts: { all: list.length, needs, added: list.filter((t) => t.status === 'new').length, updates: list.filter((t) => t.status === 'update').length } };
}

// ── pictures ──

export interface PicFile { id: string; /** Path inside the chosen folder, for showing. */ path: string; name: string; /** SHA-256 of the bytes. */ hash: string }
export interface PicWanted {
  teams: Array<{ key: string; name: string; tag: string; hint: string }>;
  players: Array<{ key: string; team: string; ign: string; hint: string }>;
}
export interface PicMatch {
  /** key → file id. */
  logos: Record<string, string>; photos: Record<string, string>;
  /** Players that point at one picture (same bytes): they get no photo unless the producer keeps it. */
  shared: Array<{ fileId: string; file: string; keys: string[] }>;
  unmatchedLogos: Array<{ key: string; closest: string | null; closestId: string | null }>;
  unmatchedPhotos: string[];
}

/** The part of a file name or address that names the picture, normalised: no folders, query or extension; case and symbols gone. */
export function stemOf(nameOrUrl: string): string {
  let s = nameOrUrl.split(/[?#]/, 1)[0]!.split(/[\\/]/).pop() ?? '';
  try { s = decodeURIComponent(s); } catch { /* keep as is */ }
  return normName(s.replace(/\.(png|jpe?g|webp|gif|svg)$/i, ''));
}

export function matchPictures(files: PicFile[], want: PicWanted, picks: Record<string, string> = {}, useShared = false): PicMatch {
  const sorted = [...files].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
  const byStem = new Map<string, PicFile>();
  for (const f of sorted) { const k = stemOf(f.name); if (!byStem.has(k)) byStem.set(k, f); }
  const byId = new Map(files.map((f) => [f.id, f]));
  const logos: Record<string, string> = {}, photos: Record<string, string> = {};
  const unmatchedLogos: PicMatch['unmatchedLogos'] = [];
  for (const t of want.teams) {
    const pick = picks[t.key] ? byId.get(picks[t.key]!) : undefined;
    const hit = pick || (t.hint ? byStem.get(stemOf(t.hint)) : undefined) || byStem.get(normName(t.name)) || (t.tag ? byStem.get(normName(t.tag)) : undefined);
    if (hit) { logos[t.key] = hit.id; continue; }
    const n = normName(t.name), tg = normName(t.tag);
    const close = sorted.find((f) => { const s = stemOf(f.name); return s.length >= 3 && ((n.length >= 3 && (s.includes(n) || n.includes(s))) || (tg.length >= 3 && s.includes(tg))); });
    unmatchedLogos.push({ key: t.key, closest: close?.path ?? null, closestId: close?.id ?? null });
  }
  const found = new Map<string, PicFile>();
  const unmatchedPhotos: string[] = [];
  for (const p of want.players) {
    const hit = (p.hint && byStem.get(stemOf(p.hint))) || byStem.get(normName(p.ign));
    if (hit) found.set(p.key, hit); else unmatchedPhotos.push(p.key);
  }
  // One picture for several players (the same file, or the same bytes under other names) is not a photo of anyone.
  const groups = new Map<string, string[]>();
  for (const [key, f] of found) groups.set(f.hash, [...(groups.get(f.hash) ?? []), key]);
  const shared: PicMatch['shared'] = [];
  for (const [hash, keys] of groups) {
    const f = found.get(keys[0]!)!;
    if (keys.length > 1) { shared.push({ fileId: f.id, file: f.name, keys }); if (!useShared) continue; }
    for (const k of keys) photos[k] = found.get(k)!.id;
  }
  return { logos, photos, shared, unmatchedLogos, unmatchedPhotos };
}
