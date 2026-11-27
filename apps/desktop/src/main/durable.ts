// Writes that survive a crash or a power cut (27 Nov): the bytes reach the disk before the new file replaces the old one,
// and the folder entry is flushed where the system allows it (Windows does not, and does not need it).

import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Flushes a folder's entries (a new or renamed file) to disk. Not every system can; nothing is lost when it cannot. */
export function fsyncDir(dir: string) {
  try {
    const fd = openSync(dir, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
  } catch { /* Windows cannot open a folder this way */ }
}

/** Temp file, fsync, rename over the target, fsync the folder: the target is always the old file or the whole new one. */
export function writeDurable(file: string, data: string | Buffer) {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  fsyncDir(dir);
}

/** Appends one block to a file (created when missing) and fsyncs it before returning. */
export function appendDurable(file: string, data: string) {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  const fd = openSync(file, 'a');
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
