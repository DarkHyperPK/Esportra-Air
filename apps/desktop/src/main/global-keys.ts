// Keys over the game: F-keys and Ctrl/Alt keys are registered with the operating system, so they work
// while the game (or any app) has focus. A press runs the same call the key makes inside Air.
import type { ApiMethod, Snapshot } from '../shared/api.ts';
import { effectiveKeys, type Keymap } from '../shared/keymap.ts';
import { UI_ACTIONS, globalKey, keyCommand, toAccelerator } from '../shared/key-actions.ts';

/** Electron's globalShortcut in the app; a stand-in in the dev host and tests. */
export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export interface GlobalKeyStatus {
  /** The producer's switch (Settings › Keyboard). */
  on: boolean;
  /** False where keys cannot be registered (no registry). */
  available: boolean;
  /** Keys working over the game now. */
  active: string[];
  /** Keys another app on this PC already holds; they work inside Air only. */
  taken: string[];
}

/** The actions whose key can work over the game. */
export function globalActions(map: Keymap | undefined) {
  return effectiveKeys(map).filter((a) => !UI_ACTIONS.has(a.id) && globalKey(a.key));
}

export class GlobalKeys {
  status: GlobalKeyStatus = { on: false, available: true, active: [], taken: [] };

  private readonly registry: ShortcutRegistry;
  private readonly snapshot: () => Snapshot;
  private readonly call: (method: ApiMethod, args: unknown[]) => Promise<unknown>;
  private readonly failed: (message: string) => void;

  constructor(registry: ShortcutRegistry, snapshot: () => Snapshot, call: (method: ApiMethod, args: unknown[]) => Promise<unknown>, failed: (message: string) => void = () => {}) {
    this.registry = registry;
    this.snapshot = snapshot;
    this.call = call;
    this.failed = failed;
  }

  /** Registers every eligible key afresh (after a rebind, or when the switch changes). */
  apply(map: Keymap | undefined, on: boolean): GlobalKeyStatus {
    this.registry.unregisterAll();
    const active: string[] = [];
    const taken: string[] = [];
    if (on) {
      for (const a of globalActions(map)) {
        const accel = toAccelerator(a.key);
        if (!accel) continue;
        let ok = false;
        try {
          ok = this.registry.register(accel, () => void this.press(a.id));
        } catch {
          ok = false;
        }
        (ok ? active : taken).push(a.key);
      }
    }
    this.status = { on, available: true, active, taken };
    return this.status;
  }

  /** A press over the game: the same call as inside Air; actions that open something in Air do nothing. */
  async press(id: string): Promise<void> {
    const cmd = keyCommand(id, this.snapshot());
    if (!cmd || cmd === 'ui') return;
    try {
      await this.call(cmd.method, cmd.args);
    } catch (e) {
      this.failed((e as Error).message);
    }
  }

  stop() {
    this.registry.unregisterAll();
    this.status = { ...this.status, active: [], taken: [] };
  }
}
