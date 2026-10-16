'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Default config shape — must match the arch doc §2 node-config structure.
function makeDefaults() {
  return {
    mode: 'production',      // 'production' | 'capture-only'
    modeConfigured: false,
    outputs: [],
    lanRelayPort: 5301,
    lanRelayTargets: [],     // string[] — IPs of observer PCs in production mode
    nodeId: null,            // UUID, set after first successful pairing
    obsBackend: 'obs',       // 'obs' | 'vmix' — video switcher backend (P1+)
  };
}

/**
 * Reads and writes userData/node-config.json.
 * Creates the file with defaults if absent.
 *
 * Usage:
 *   const NodeConfig = require('./node-config');
 *   const config = new NodeConfig();
 *   config.get('mode')              // → 'production'
 *   config.set('nodeId', uuid)
 *   config.getAll()                 // → shallow copy of entire config
 *   config.reset()                  // → resets to defaults and writes
 */
class NodeConfig {
  constructor() {
    this._filePath = path.join(app.getPath('userData'), 'node-config.json');
    this._data = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._filePath, 'utf8');
      // Merge over defaults so new keys added in future versions are present.
      return { ...makeDefaults(), ...JSON.parse(raw) };
    } catch (_) {
      // File absent or corrupt — start from defaults and persist.
      const data = makeDefaults();
      this._write(data);
      return data;
    }
  }

  _write(data) {
    const temporary = `${this._filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, this._filePath);
  }

  /** Returns the current value for key. */
  get(key) {
    return this._data[key];
  }

  /** Writes a single key synchronously to disk. */
  set(key, value) {
    const next = { ...this._data, [key]: value };
    this._write(next);
    this._data = next;
  }

  /** Returns a shallow copy of the full config. Callers must not mutate it. */
  getAll() {
    return { ...this._data };
  }

  /** Resets every field to its default and writes to disk. */
  reset() {
    this._data = makeDefaults();
    this._write(this._data);
  }
}

module.exports = NodeConfig;
