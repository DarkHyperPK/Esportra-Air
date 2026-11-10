// Esportra Player's small saved settings: where the producer is and which role this PC has.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LinkSaved } from '../../../../packages/capture/src/link.ts';

export interface PlayerSaved {
  version: 1;
  link: LinkSaved | null;
}

export class PlayerStore {
  data: PlayerSaved = { version: 1, link: null };
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<PlayerSaved>;
      if (saved.version === 1) this.data = { version: 1, link: saved.link ?? null };
    } catch {
      // First run, or an unreadable file: start empty.
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    renameSync(tmp, this.file);
  }
}
