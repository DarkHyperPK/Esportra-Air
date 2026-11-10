// Small secrets (engine key, OBS password) encrypted by the operating system (DPAPI on Windows).
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
}

export class Secrets {
  private readonly file: string;
  private readonly cipher: Cipher;
  private values: Record<string, string> = {};
  /** Set when the OS cannot encrypt: secrets then live only for this session. */
  readonly volatile: boolean;

  constructor(file: string, cipher: Cipher) {
    this.file = file;
    this.cipher = cipher;
    this.volatile = !cipher.isEncryptionAvailable();
    if (this.volatile) return;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
      for (const [k, v] of Object.entries(saved)) this.values[k] = cipher.decryptString(Buffer.from(v, 'base64'));
    } catch {
      this.values = {};
    }
  }

  get(name: string): string | null {
    return this.values[name] ?? null;
  }

  set(name: string, value: string | null) {
    if (value === null) delete this.values[name];
    else this.values[name] = value;
    if (this.volatile) return;
    const out = Object.fromEntries(Object.entries(this.values).map(([k, v]) => [k, this.cipher.encryptString(v).toString('base64')]));
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(out));
    renameSync(`${this.file}.tmp`, this.file);
  }
}
