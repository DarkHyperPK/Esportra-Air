// A stand-in for Electron's globalShortcut (dev host and tests): keeps what is registered, refuses
// keys "another app" holds, and can press a key as if the game had focus.
import type { ShortcutRegistry } from '../src/main/global-keys.ts';

export class FakeShortcuts implements ShortcutRegistry {
  readonly keys = new Map<string, () => void>();
  readonly held: Set<string>;
  constructor(held = new Set<string>()) {
    this.held = held;
  }
  register(accelerator: string, callback: () => void): boolean {
    if (this.held.has(accelerator) || this.keys.has(accelerator)) return false;
    this.keys.set(accelerator, callback);
    return true;
  }
  unregisterAll(): void {
    this.keys.clear();
  }
  /** Presses a registered key; false when nothing is registered for it. */
  press(accelerator: string): boolean {
    const fn = this.keys.get(accelerator);
    fn?.();
    return !!fn;
  }
}
