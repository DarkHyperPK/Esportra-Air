'use strict';
const EventEmitter = require('events');

// ─── State enum — mirrors OBSController shape for interface compatibility ──────
const STATES = Object.freeze({
  DISCONNECTED: 'disconnected',
  READY:        'ready',
});

/**
 * VMixController — P1 stub with the same interface as OBSController.
 *
 * All HTTP calls to the vMix v24+ XML API are stubbed with console.warn.
 * The full implementation ships in P2.
 *
 * obsBackend config field set to 'vmix' routes traffic here instead of OBS.
 *
 * Interface (must remain identical to OBSController):
 *   connect(host, port)
 *   disconnect()
 *   getState()
 *   getTally()
 *   getScenes()
 *   setScene(sceneName)
 *   getScreenshot(sourceName, opts)
 *   buildScenes(outputUrls)
 *   take(sceneName)
 *   triggerReplay(opts)
 *
 * Emits: 'connected', 'disconnected', 'error', 'state-changed', 'tally-changed'
 */
class VMixController extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._logger = opts.logger || console;
    this._state  = STATES.DISCONNECTED;
    this._tally  = { preview: null, program: null };
    this._host   = null;
    this._port   = 8088;
  }

  _setState(state) {
    if (this._state === state) return;
    this._state = state;
    this.emit('state-changed', state);
  }

  // ─── Public API (all P1 stubs) ───────────────────────────────────────────────

  /**
   * Stub connect — marks state as ready.
   * P2: open TCP connection to vMix XML API (default port 8088).
   */
  async connect(host, port) {
    console.warn('[vmix] P1 stub — connect() called, not yet implemented');
    this._host = host;
    this._port = port || 8088;
    this._setState(STATES.READY);
    this.emit('connected', { studioMode: false });
    return;
  }

  /**
   * Stub disconnect.
   */
  async disconnect() {
    console.warn('[vmix] P1 stub — disconnect() called, not yet implemented');
    this._setState(STATES.DISCONNECTED);
    this._tally = { preview: null, program: null };
    this.emit('disconnected');
  }

  getState() {
    return {
      state:      this._state,
      connected:  this._state === STATES.READY,
      studioMode: false,
      tally:      { ...this._tally },
    };
  }

  getTally() {
    return { ...this._tally };
  }

  /**
   * Stub — P2: GET http://{host}:{port}/api/?Function=GetInputs
   */
  async getScenes() {
    console.warn('[vmix] P1 stub — getScenes() not yet implemented');
    return [];
  }

  /**
   * Stub — P2: GET http://{host}:{port}/api/?Function=ActiveInput&Input={sceneName}
   */
  async setScene(sceneName) {
    console.warn('[vmix] P1 stub — setScene() not yet implemented', sceneName);
  }

  /**
   * Stub — P2: GET http://{host}:{port}/api/?Function=Snapshot&DestinationIndex=...
   */
  async getScreenshot(_sourceName, _opts = {}) {
    console.warn('[vmix] P1 stub — getScreenshot() not yet implemented');
    return null;
  }

  /**
   * Stub — P2: create named inputs in vMix if they do not exist.
   */
  async buildScenes(_outputUrls = {}) {
    console.warn('[vmix] P1 stub — buildScenes() not yet implemented');
    return { created: [], existing: [] };
  }

  /**
   * Stub — P2: GET http://{host}:{port}/api/?Function=ActiveInput&Input={sceneName}
   * with Preview→Program transition logic (vMix "MultiView" equivalent).
   */
  async take(sceneName) {
    console.warn('[vmix] P1 stub — take() not yet implemented', sceneName);
    return { ok: false, latencyMs: 0, scene: sceneName, error: 'P1 stub — vMix not yet implemented' };
  }

  /**
   * Stub — P2: trigger vMix replay.
   */
  async triggerReplay(_opts = {}) {
    console.warn('[vmix] P1 stub — triggerReplay() not yet implemented');
    return { ok: false, error: 'P1 stub — vMix not yet implemented' };
  }
}

module.exports = VMixController;
