'use strict';
const EventEmitter = require('events');
const { OBSWebSocket } = require('obs-websocket-js');

// ─── State enum ────────────────────────────────────────────────────────────────
const STATES = Object.freeze({
  DISCONNECTED:        'disconnected',
  IDENTIFYING:         'identifying',
  READY:               'ready',
  STUDIO_MODE:         'studio_mode_detected',
});

// Reconnect backoff schedule in milliseconds (capped at 10 s after index 4).
const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

// ESA_ scene names built in T10.
const ESA_SCENES = Object.freeze([
  'ESA_Holding',
  'ESA_Gameplay',
  'ESA_Fullscreen',
  'ESA_Replay',
  'ESA_Casters',
]);

/**
 * OBSController — EventEmitter wrapping obs-websocket-js v5.
 *
 * Emits:
 *   'connected'       { studioMode: boolean }
 *   'disconnected'
 *   'error'           Error
 *   'state-changed'   string (new state)
 *   'tally-changed'   { preview: string|null, program: string|null }
 *
 * Methods: connect, disconnect, getState, getTally, getScenes, setScene,
 *          getScreenshot, buildScenes, take, triggerReplay
 */
class OBSController extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._logger  = opts.logger || console;
    this._dwellMs = opts.dwellMs ?? 15000;
    this._obs     = new OBSWebSocket();
    this._state   = STATES.DISCONNECTED;
    this._tally   = { preview: null, program: null };
    this._shouldReconnect  = false;
    this._reconnectAttempt = 0;
    this._reconnectTimer   = null;
    this._connArgs         = null;
    this._connecting       = false; // guard against concurrent connect() calls
    this._setupListeners();
  }

  // ─── Internal listener wiring ───────────────────────────────────────────────

  _setupListeners() {
    this._obs.on('ConnectionOpened', () => this._onConnectionOpened());
    this._obs.on('Identified',       () => this._onIdentified());
    this._obs.on('ConnectionClosed', (err) => this._onConnectionClosed(err));
    this._obs.on('ConnectionError',  (err) => this.emit('error', err));

    this._obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
      this._tally.program = sceneName;
      this.emit('tally-changed', { ...this._tally });
    });

    this._obs.on('CurrentPreviewSceneChanged', ({ sceneName }) => {
      this._tally.preview = sceneName;
      this.emit('tally-changed', { ...this._tally });
    });

    this._obs.on('StudioModeStateChanged', ({ studioModeEnabled }) => {
      if (this._state !== STATES.READY && this._state !== STATES.STUDIO_MODE) return;
      this._setState(studioModeEnabled ? STATES.STUDIO_MODE : STATES.READY);
    });
  }

  _onConnectionOpened() {
    this._reconnectAttempt = 0;
    this._setState(STATES.IDENTIFYING);
    this._logger.info('[obs] WebSocket connected — identifying');
  }

  async _onIdentified() {
    try {
      const { studioModeEnabled } = await this._obs.call('GetStudioModeEnabled');
      this._setState(studioModeEnabled ? STATES.STUDIO_MODE : STATES.READY);
    } catch (_) {
      this._setState(STATES.READY);
    }
    await this._fetchInitialTally();
    this.emit('connected', { studioMode: this._state === STATES.STUDIO_MODE });
  }

  async _fetchInitialTally() {
    try {
      const { currentProgramSceneName } = await this._obs.call('GetCurrentProgramScene');
      this._tally.program = currentProgramSceneName;
    } catch (_) {}
    try {
      const { currentPreviewSceneName } = await this._obs.call('GetCurrentPreviewScene');
      this._tally.preview = currentPreviewSceneName;
    } catch (_) {}
    this.emit('tally-changed', { ...this._tally });
  }

  _onConnectionClosed(err) {
    this._setState(STATES.DISCONNECTED);
    this._tally = { preview: null, program: null };
    this._logger.warn('[obs] Disconnected:', err?.message || '');
    this.emit('disconnected');
    if (this._shouldReconnect && this._connArgs) {
      this._scheduleReconnect();
    }
  }

  // ─── Reconnect ──────────────────────────────────────────────────────────────

  _scheduleReconnect() {
    const delay = BACKOFF_MS[Math.min(this._reconnectAttempt, BACKOFF_MS.length - 1)];
    this._reconnectAttempt += 1;
    this._logger.info(`[obs] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempt})`);
    this._reconnectTimer = setTimeout(() => this._attemptReconnect(), delay);
  }

  async _attemptReconnect() {
    if (!this._shouldReconnect || !this._connArgs) return;
    try {
      await this._doConnect(this._connArgs);
    } catch (err) {
      this._logger.warn('[obs] Reconnect failed:', err.message);
    }
  }

  async _doConnect({ host, port, password }) {
    const url = `ws://${host}:${port}`;
    try {
      await this._obs.connect(url, password || undefined);
    } catch (err) {
      this._logger.warn('[obs] connect() failed:', err.message);
      if (this._shouldReconnect) this._scheduleReconnect();
      throw err;
    }
  }

  // ─── State helpers ──────────────────────────────────────────────────────────

  _setState(state) {
    if (this._state === state) return;
    this._state = state;
    this.emit('state-changed', state);
  }

  _assertReady() {
    if (this._state !== STATES.READY && this._state !== STATES.STUDIO_MODE) {
      throw new Error(`OBS not ready (state: ${this._state})`);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Connect to OBS WebSocket. Enables auto-reconnect.
   * Calling connect() while already connected first disconnects cleanly.
   * Concurrent calls are rejected to prevent state machine races.
   */
  async connect(host, port, password) {
    if (this._connecting) {
      throw new Error('OBS connection already in progress.');
    }
    this._connecting = true;
    try {
      if (this._state !== STATES.DISCONNECTED) await this.disconnect();
      this._connArgs = { host, port: port || 4455, password: password || '' };
      this._shouldReconnect = true;
      this._reconnectAttempt = 0;
      await this._doConnect(this._connArgs);
    } finally {
      this._connecting = false;
    }
  }

  /** Disconnect and disable auto-reconnect. */
  async disconnect() {
    this._shouldReconnect = false;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    if (this._state !== STATES.DISCONNECTED) {
      try { await this._obs.disconnect(); } catch (_) {}
    }
  }

  /** Snapshot of current connection state. */
  getState() {
    return {
      state:       this._state,
      connected:   this._state === STATES.READY || this._state === STATES.STUDIO_MODE,
      studioMode:  this._state === STATES.STUDIO_MODE,
      tally:       { ...this._tally },
      host:        this._connArgs?.host || null,
      port:        this._connArgs?.port || null,
    };
  }

  /** Current tally (preview/program scene names). */
  getTally() {
    return { ...this._tally };
  }

  /** Returns list of scene names. */
  async getScenes() {
    this._assertReady();
    const { scenes } = await this._obs.call('GetSceneList');
    return scenes.map((s) => s.sceneName);
  }

  /** Directly sets the program scene (bypasses studio mode logic). */
  async setScene(sceneName) {
    this._assertReady();
    await this._obs.call('SetCurrentProgramScene', { sceneName });
  }

  /**
   * Captures a JPEG thumbnail of a source/scene.
   * Returns the data URI string, or null on failure.
   */
  async getScreenshot(sourceName, opts = {}) {
    if (this._state !== STATES.READY && this._state !== STATES.STUDIO_MODE) return null;
    try {
      const { imageData } = await this._obs.call('GetSourceScreenshot', {
        sourceName,
        imageFormat: opts.format || 'jpeg',
        imageWidth:  opts.width  || 320,
        imageHeight: opts.height || 180,
        imageCompressionQuality: opts.quality || 70,
      });
      return imageData;
    } catch (_) {
      return null;
    }
  }

  // ─── T10: Scene builder ─────────────────────────────────────────────────────

  /**
   * Ensures every ESA_ scene exists in OBS.
   * If a scene is new, adds a browser source pointing to the matching outputUrl.
   *
   * outputUrls shape: { holding, gameplay, fullscreen, replay, casters }
   *   Keys are scene names lowercased without the ESA_ prefix.
   *
   * Returns { created: string[], existing: string[] }.
   */
  async buildScenes(outputUrls = {}) {
    this._assertReady();
    const { scenes } = await this._obs.call('GetSceneList');
    const existing = new Set(scenes.map((s) => s.sceneName));
    const created  = [];
    const skipped  = [];

    for (const sceneName of ESA_SCENES) {
      if (existing.has(sceneName)) {
        skipped.push(sceneName);
        continue;
      }
      await this._obs.call('CreateScene', { sceneName });
      const key = sceneName.replace('ESA_', '').toLowerCase();
      const url = outputUrls[key] || outputUrls[sceneName] || null;
      if (url) {
        await this._addBrowserSource(sceneName, url);
      }
      created.push(sceneName);
    }

    return { created, existing: skipped };
  }

  async _addBrowserSource(sceneName, url) {
    await this._obs.call('CreateInput', {
      sceneName,
      inputName:     `${sceneName}_source`,
      inputKind:     'browser_source',
      inputSettings: {
        url,
        width:          1920,
        height:         1080,
        fps:            30,
        reroute_audio:  false,
        shutdown:       false,
      },
    });
  }

  // ─── T11: Take flow ─────────────────────────────────────────────────────────

  /**
   * Transitions sceneName into program.
   *
   * Studio mode path: SetCurrentPreviewScene → TriggerStudioModeTransition.
   * Direct path: SetCurrentProgramScene.
   *
   * Warns if round-trip latency exceeds 100 ms.
   * Returns { ok, latencyMs, scene, error? }.
   */
  async take(sceneName) {
    this._assertReady();
    const start = Date.now();
    try {
      if (this._state === STATES.STUDIO_MODE) {
        await this._obs.call('SetCurrentPreviewScene', { sceneName });
        await this._obs.call('TriggerStudioModeTransition');
      } else {
        await this._obs.call('SetCurrentProgramScene', { sceneName });
      }
      const latencyMs = Date.now() - start;
      if (latencyMs > 100) {
        this._logger.warn(`[obs] take() latency ${latencyMs}ms exceeds 100ms target`);
      }
      return { ok: true, latencyMs, scene: sceneName };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, scene: sceneName, error: err.message };
    }
  }

  // ─── T12: Replay flow ───────────────────────────────────────────────────────

  /**
   * Saves the OBS replay buffer, switches to ESA_Replay, then returns to the
   * previous program scene after opts.dwellMs (default: 15 000 ms).
   *
   * Returns { ok, savedPath?, error? }.
   */
  async triggerReplay(opts = {}) {
    this._assertReady();
    const dwellMs = opts.dwellMs ?? this._dwellMs;

    let replayStatus;
    try {
      replayStatus = await this._obs.call('GetReplayBufferStatus');
    } catch (_) {
      return { ok: false, error: 'Could not check replay buffer status.' };
    }

    if (!replayStatus.outputActive) {
      return { ok: false, error: 'Replay buffer is not active in OBS.' };
    }

    const previousScene = this._tally.program;
    const savedPath     = await this._saveReplayBuffer();
    if (savedPath === null) {
      return { ok: false, error: 'Replay save timed out after 5 s.' };
    }

    const takeResult = await this.take('ESA_Replay');
    if (!takeResult.ok) {
      return { ok: true, savedPath, error: 'Replay saved but scene switch failed: ' + takeResult.error };
    }

    if (previousScene && previousScene !== 'ESA_Replay') {
      setTimeout(() => this._returnFromReplay(previousScene), dwellMs);
    }

    return { ok: true, savedPath };
  }

  _saveReplayBuffer() {
    const TIMEOUT_MS = 5000;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      this._obs.once('ReplayBufferSaved', ({ savedReplayPath }) => {
        clearTimeout(timer);
        resolve(savedReplayPath);
      });
      this._obs.call('SaveReplayBuffer').catch((err) => {
        this._logger.warn('[obs] SaveReplayBuffer error:', err.message);
        clearTimeout(timer);
        resolve(null);
      });
    });
  }

  async _returnFromReplay(sceneName) {
    try {
      await this.take(sceneName);
    } catch (err) {
      this._logger.warn('[obs] Return-from-replay failed:', err.message);
    }
  }
}

module.exports = OBSController;
