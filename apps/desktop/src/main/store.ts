// Air's saved settings: the tournament setup, matches, OBS address and which OBS scenes Air owns.
// Secrets (engine key, OBS password) are kept separately, encrypted by the OS (see secrets.ts).

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Match, Screen, Setup } from '../shared/api.ts';
import { emptyOwned, type Owned } from './scene-build.ts';
import type { SceneKey } from '../shared/scenes.ts';
import type { RundownEdits } from './autopilot/rundown.ts';
import type { SavedEsportra } from './esportra.ts';

export interface Saved {
  version: 1;
  setup: Setup;
  matches: Match[];
  selectedMatchId: string | null;
  owned: Owned;
  enginePort: number;
  /** The producer's rundown edits, per match. Whether autopilot is on is never saved. */
  rundown?: Record<string, RundownEdits>;
  /** The signed-in Esportra account (tokens are kept separately, encrypted). */
  esportra?: SavedEsportra;
  /** This PC's id with Esportra (stable across sign-ins). */
  deviceId?: string;
  /** What this PC does: run the show, or only capture the game and send it to a producer's Air. */
  mode?: 'production' | 'capture';
  /** Producer side: allow other PCs on the network to join. The code itself is kept encrypted. */
  join?: { enabled: boolean; port: number };
  /** Capture-only side: the producer's address and this PC's role. The code is kept encrypted. */
  link?: { address: string; role: 'observer' | 'player' };
  /** Player camera links (VDO.Ninja ids) per player slot, and how the cameras are laid out. */
  cams?: { layout: 'ingame' | 'grid5' | 'grid10'; delayMs: number; ids: Array<Array<string | null>> };
}

const full = { x: 0, y: 0, width: 1920, height: 1080 };
const screen = (id: string, overlay: string, title: string, scene: SceneKey, primary = false): Screen => ({ id, outputId: '', scene, primary, overlay, title, enabled: true, frame: { ...full } });

/** Every graphic Air puts in OBS, grouped by the scene it lives in (PRD picture 9). */
export const DEFAULT_SCREENS: Screen[] = [
  screen('holding', 'holding', 'Holding', 'holding', true),
  screen('ticker', 'ticker', 'Ticker', 'holding'),
  screen('in-game', 'ingame', 'In-game HUD', 'gameplay', true),
  screen('stinger', 'stinger', 'Stinger (live)', 'gameplay'),
  screen('match-intro', 'match-intro', 'Match intro', 'fullscreen', true),
  screen('map-veto', 'map-veto', 'Map veto', 'fullscreen'),
  screen('agent-select', 'agent-select', 'Agent select', 'fullscreen'),
  screen('map-result', 'map-result', 'Map result', 'fullscreen'),
  screen('series', 'series', 'Series', 'fullscreen'),
  screen('halftime', 'halftime', 'Halftime', 'fullscreen'),
  screen('standings', 'standings', 'Standings', 'fullscreen'),
  screen('player-profile', 'player-profile', 'Player profile', 'fullscreen'),
  screen('champion', 'champion', 'Champion', 'fullscreen'),
  screen('cam-grid', 'cam-grid', 'Player cams', 'fullscreen'),
  screen('replay-bug', 'replay', 'Replay bug', 'replay', true),
  screen('casters', 'casters', 'Casters', 'casters', true),
];

/** HUD elements the producer can switch, with the HUD's own defaults (core/state.clean.js `show`). */
export const DEFAULT_HUD: Record<string, boolean> = {
  scorebug: true, players: true, killfeed: true, observed: true, minimap: false, spikeTimer: true,
  winProb: false, roundHistory: false, moments: true, sponsor: true, eventBug: true, ticker: true,
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
    obs: { host: '127.0.0.1', port: 4455, stinger: null },
  };
}

export function defaults(): Saved {
  return { version: 1, setup: defaultSetup(), matches: [], selectedMatchId: null, owned: emptyOwned(), enginePort: 5300 };
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
      this.migrate();
    } catch {
      // First run, or an unreadable file: start from defaults (the old file is overwritten on save).
    }
  }

  /** Brings an older save up to the current scene model, keeping what the producer chose. */
  private migrate() {
    const setup = this.data.setup;
    const known = new Map((setup.screens ?? []).map((x) => [x.id, x]));
    setup.screens = DEFAULT_SCREENS.map((def) => {
      const old = known.get(def.id);
      return { ...def, outputId: /^[0-9a-f-]{36}$/i.test(old?.outputId ?? '') ? old!.outputId : randomUUID(), enabled: old?.enabled ?? def.enabled, frame: old?.frame ?? { ...def.frame }, title: old?.title ?? def.title };
    });
    setup.obs = { host: setup.obs?.host ?? '127.0.0.1', port: setup.obs?.port ?? 4455, stinger: setup.obs?.stinger ?? null };
    if (!this.data.owned || typeof this.data.owned !== 'object' || !('scenes' in this.data.owned)) this.data.owned = emptyOwned();
    // Match v2: game, lineups, event and sponsors live on the match (they used to be production-wide).
    for (const m of this.data.matches ?? []) {
      const old = m as Partial<Match> & Match;
      old.game ??= 'valorant';
      old.event ??= { name: old.source?.tournament || setup.brand?.eventName || '', stage: setup.brand?.stage ?? '' };
      old.sponsors ??= [...(setup.sponsors ?? [])];
      old.players ??= [0, 1].map((t) => (old.source?.lineups?.[t] ?? []).map((name) => ({ id: randomUUID(), name, realName: '', gameId: '', photo: '' }))) as Match['players'];
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    renameSync(tmp, this.file);
  }
}
