// Rolling backups of air.json (27 Nov). Every save may leave a copy in userData/backups/ as air-<timestamp>.json, at most one per
// 30 s. Kept: the newest 20, plus the newest of each calendar day for 30 days.

import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { writeDurable } from './durable.ts';

export const BACKUP_EVERY_MS = 30_000;
export const KEEP_RECENT = 20;
export const KEEP_DAYS = 30;
const DAY_MS = 86_400_000;
const NAME = /^air-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.json$/;

export interface BackupInfo { name: string; at: number; bytes: number }

/** Compact UTC stamp that sorts like time: 20261127T101530123Z. */
export const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:.]/g, '');
export const backupName = (ms: number) => `air-${stamp(ms)}.json`;
export const isBackupName = (name: string) => NAME.test(name);

export function backupTime(name: string): number | null {
  const m = NAME.exec(name);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!, +m[7]!) : null;
}

/** Newest first. */
export function listBackups(dir: string): BackupInfo[] {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  const out: BackupInfo[] = [];
  for (const name of names) {
    const at = backupTime(name);
    if (at === null) continue;
    let bytes = 0;
    try { bytes = statSync(join(dir, name)).size; } catch { continue; }
    out.push({ name, at, bytes });
  }
  return out.sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1));
}

export function readBackup(dir: string, name: string): string {
  if (!isBackupName(name)) throw new Error('That is not one of Air’s backups.');
  return readFileSync(join(dir, name), 'utf8');
}

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** Which backups stay: the newest 20, and the newest of each day inside the last 30 days. */
export function keepSet(list: BackupInfo[], now: number): Set<string> {
  const keep = new Set(list.slice(0, KEEP_RECENT).map((b) => b.name));
  const seen = new Set<string>();
  for (const b of list) {
    if (b.at < now - KEEP_DAYS * DAY_MS) continue;
    const day = dayKey(b.at);
    if (seen.has(day)) continue;
    seen.add(day);
    keep.add(b.name);
  }
  return keep;
}

export function rotate(dir: string, now: number) {
  const list = listBackups(dir);
  const keep = keepSet(list, now);
  for (const b of list) if (!keep.has(b.name)) { try { unlinkSync(join(dir, b.name)); } catch { /* next time */ } }
}

/** Writes a backup of `text` (the whole air.json) and rotates. Returns its name. */
export function writeBackup(dir: string, text: string, now: number): string {
  let at = now;
  const have = new Set(listBackups(dir).map((b) => b.name));
  while (have.has(backupName(at))) at += 1;
  const name = backupName(at);
  writeDurable(join(dir, name), text);
  rotate(dir, now);
  return name;
}
