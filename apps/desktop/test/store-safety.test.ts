// Safe saves (27 Nov): a crash mid-write leaves the last good file, an unreadable file never starts Air from defaults
// silently, and backups rotate as promised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store.ts';
import { BACKUP_EVERY_MS, backupName, backupTime, listBackups } from '../src/main/store-backups.ts';

const DAY = 86_400_000;
const tmp = () => mkdtempSync(join(tmpdir(), 'air-safe-'));
const clock = (start = Date.UTC(2026, 10, 1, 10, 0, 0)) => { let t = start; return { now: () => t, advance: (ms: number) => { t += ms; } }; };

test('a crash half way through a write leaves the previous good file, and the next start reads it', () => {
  const dir = tmp(), file = join(dir, 'air.json');
  const store = new Store(file);
  store.data.setup.name = 'Before the crash';
  store.save();
  const good = readFileSync(file, 'utf8');
  // The write dies after half the bytes reached the temp file (power cut, killed process, full disk).
  const crashing = new Store(file, { write: (f, text) => { writeFileSync(`${f}.tmp`, text.slice(0, Math.floor(text.length / 2))); throw new Error('disk full'); } });
  crashing.data.setup.name = 'Lost change';
  assert.throws(() => crashing.save(), /disk full/);
  assert.equal(readFileSync(file, 'utf8'), good, 'air.json is untouched');
  assert.ok(existsSync(`${file}.tmp`), 'the half-written temp file is left behind');
  const reopened = new Store(file);
  assert.equal(reopened.data.setup.name, 'Before the crash');
  assert.equal(reopened.recovered, null, 'a stale temp file is not a damaged save');
  reopened.data.setup.name = 'After';
  reopened.save();
  assert.equal(new Store(file).data.setup.name, 'After', 'the next save replaces the temp file');
});

test('an unreadable air.json loads the newest backup that reads, keeps the bad file and says so', () => {
  const dir = tmp(), file = join(dir, 'air.json');
  const c = clock();
  const store = new Store(file, { now: c.now });
  for (const name of ['One', 'Two', 'Three']) { store.data.setup.name = name; store.save(); c.advance(BACKUP_EVERY_MS + 1000); }
  assert.equal(store.backups().length, 3);
  const newest = store.backups()[0]!;
  const second = store.backups()[1]!;
  // Damage the file, and the newest backup too.
  writeFileSync(file, '{"version":1,"setup":{"name":"Cut off');
  writeFileSync(join(dir, 'backups', newest.name), '');
  const reopened = new Store(file, { now: c.now });
  assert.equal(reopened.data.setup.name, 'Two', 'the newest backup that reads');
  assert.equal(reopened.recovered?.from, second.name);
  assert.equal(reopened.recovered?.fromAt, second.at);
  const broken = reopened.recovered!.brokenFile;
  assert.match(broken, /air\.json\.broken-\d{8}T\d{9}Z$/);
  assert.equal(readFileSync(broken, 'utf8'), '{"version":1,"setup":{"name":"Cut off', 'the damaged file is kept as it was');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).setup.name, 'Two', 'air.json is the recovered data again');
  assert.equal(new Store(file).recovered, null, 'the notice belongs to this start only');
});

test('no valid backup: Air starts empty but keeps the broken file and says so; a missing file is just a first run', () => {
  const dir = tmp(), file = join(dir, 'air.json');
  const first = new Store(file);
  assert.equal(first.recovered, null, 'no file is a first run, not a recovery');
  writeFileSync(file, 'not json at all');
  const store = new Store(file);
  assert.equal(store.recovered?.from, null);
  assert.equal(store.data.setup.name, 'My production');
  assert.equal(readFileSync(store.recovered!.brokenFile, 'utf8'), 'not json at all');
  store.save();
  assert.ok(readdirSync(dir).some((f) => f.startsWith('air.json.broken-')), 'saving does not overwrite the broken copy');
  // A readable file of another version counts as unreadable too (it is not Air's data).
  const other = join(tmp(), 'air.json');
  writeFileSync(other, JSON.stringify({ version: 2, setup: {} }));
  assert.ok(new Store(other).recovered, 'version 2 is kept aside, not replaced with defaults');
});

test('backups are one per 30 s at most, 20 recent, and the newest of each day for 30 days', () => {
  const dir = tmp(), file = join(dir, 'air.json');
  const c = clock();
  const store = new Store(file, { now: c.now });
  store.save(); c.advance(10_000); store.save(); c.advance(10_000); store.save();
  assert.equal(store.backups().length, 1, 'three saves in 20 s make one backup');
  c.advance(BACKUP_EVERY_MS); store.save();
  assert.equal(store.backups().length, 2);
  // 40 saves 31 s apart: 20 are kept.
  for (let i = 0; i < 40; i++) { c.advance(BACKUP_EVERY_MS + 1000); store.save(); }
  assert.equal(store.backups().length, 20);
  assert.ok(store.backups().every((b) => backupName(b.at) === b.name && backupTime(b.name) === b.at));
  // 45 days, one save a day: the newest 20 plus every day within 30 days = 31 (days 14 to 44).
  const dir2 = tmp();
  const c2 = clock();
  const daily = new Store(join(dir2, 'air.json'), { now: c2.now });
  for (let d = 0; d < 45; d++) { daily.save(); if (d < 44) c2.advance(DAY); }
  const kept = listBackups(join(dir2, 'backups'));
  assert.equal(kept.length, 31);
  assert.ok(kept.every((b) => b.at >= c2.now() - 30 * DAY));
});

test('restoring a backup loads it, backs up what was there first, and refuses names that are not backups', () => {
  const dir = tmp(), file = join(dir, 'air.json');
  const c = clock();
  const store = new Store(file, { now: c.now });
  store.data.setup.name = 'Old show'; store.save(); c.advance(BACKUP_EVERY_MS + 1000);
  store.data.setup.name = 'New show'; store.save(); c.advance(BACKUP_EVERY_MS + 1000);
  const old = store.backups().at(-1)!;
  store.restoreBackup(old.name);
  assert.equal(store.data.setup.name, 'Old show');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).setup.name, 'Old show');
  assert.ok(store.backups().length >= 2);
  assert.ok(listBackups(join(dir, 'backups')).some((b) => JSON.parse(readFileSync(join(dir, 'backups', b.name), 'utf8')).setup.name === 'New show'), 'the show before the restore is still a backup');
  assert.throws(() => store.restoreBackup('../air.json'), /not one of Air/);
  writeFileSync(join(dir, 'backups', old.name), 'garbage');
  assert.throws(() => store.restoreBackup(old.name), /cannot be read/);
  assert.equal(store.data.setup.name, 'Old show', 'a failed restore changes nothing');
});
