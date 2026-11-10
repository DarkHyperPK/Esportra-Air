// Air's saved settings: the tournament setup, matches, OBS address and which OBS scenes Air owns.
// Secrets (engine key, OBS password) are kept separately, encrypted by the OS (see secrets.ts).

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Match, Screen, Setup } from '../shared/api.ts';
import type { Owned } from './obs.ts';

export interface Saved {
  version: 1;
  setup: Setup;
  matches: Match[];
  selectedMatchId: string | null;
  owned: Owned;
  enginePort: number;
}

const full = { x: 0, y: 0, width: 1920, height: 1080 };
const screen = (id: string, overlay: string, title: string, gameplay = false): Screen => ({ id, outputId: '', overlay, title, enabled: true, frame: { ...full }, gameplay });

export const DEFAULT_SCREENS: Screen[] = [
  screen('starting-soon', 'starting-soon', 'Starting soon'),
  screen('match-intro', 'match-intro', 'Match intro'),
  screen('map-veto', 'map-veto', 'Map veto'),
  screen('in-game', 'ingame', 'In-game', true),
  screen('map-result', 'map-result', 'Map result'),
  screen('series', 'series', 'Series score'),
  screen('break', 'break-clock', 'Break'),
  screen('casters', 'casters', 'Casters'),
  screen('ending', 'ending', 'Ending'),
];

/** HUD elements the producer can switch, with the HUD's own defaults (core/state.clean.js `show`). */
export const DEFAULT_HUD: Record<string, boolean> = {
  scorebug: true, players: true, killfeed: true, observed: true, minimap: false, spikeTimer: true,
  winProb: true, roundHistory: false, moments: true, sponsor: true, eventBug: true, ticker: true,
};

export function defaultSetup(): Setup {
  return {
    id: randomUUID(),
    name: 'My production',
    package: 'broadcast',
    brand: { eventName: '', stage: '' },
    sponsors: [],
    screens: DEFAULT_SCREENS.map((s) => ({ ...s, outputId: randomUUID(), frame: { ...s.frame } })),
    hud: { ...DEFAULT_HUD },
    minimap: { x: 24, y: 24, size: 400 },
    obs: { host: '127.0.0.1', port: 4455, gameplaySource: null },
  };
}

export function defaults(): Saved {
  return { version: 1, setup: defaultSetup(), matches: [], selectedMatchId: null, owned: {}, enginePort: 5300 };
}

export class Store {
  data: Saved;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.data = defaults();
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<Saved>;
      if (saved.version === 1) this.data = { ...defaults(), ...saved, setup: { ...defaultSetup(), ...saved.setup } as Setup };
      // Every screen needs a UUID output alias (older saves may lack one).
      for (const screen of this.data.setup.screens) if (!/^[0-9a-f-]{36}$/i.test(screen.outputId ?? '')) screen.outputId = randomUUID();
    } catch {
      // First run, or an unreadable file: start from defaults (the old file is overwritten on save).
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    renameSync(tmp, this.file);
  }
}
