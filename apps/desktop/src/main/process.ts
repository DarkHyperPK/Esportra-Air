// Real process helpers for the engine supervisor (kept separate so the supervisor is testable).
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type { ChildHandle, SupervisorOptions } from './engine-supervisor.ts';

/** Spawns detached with output to a log file: a pipe would break when Air exits, and the engine would crash writing to it. */
export function spawnDetached(command: string, args: string[], options: { detached: boolean; env: NodeJS.ProcessEnv; logFile: string }): ChildHandle {
  const log = openSync(options.logFile, 'a');
  try {
    return spawn(command, args, { detached: options.detached, env: options.env, stdio: ['ignore', log, log], windowsHide: true });
  } finally {
    closeSync(log);
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function kill(pid: number) {
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
}

/** Minimal environment for the engine: no inherited credentials or tokens. */
export function engineEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'HOME', 'LANG'];
  return Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
}

export const realProcess: Pick<SupervisorOptions, 'spawn' | 'readFile' | 'writeFile' | 'isAlive' | 'kill'> = {
  spawn: spawnDetached,
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: (path, data) => writeFile(path, data, 'utf8'),
  isAlive,
  kill,
};
