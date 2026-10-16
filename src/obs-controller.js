'use strict';
const EventEmitter = require('events');
const { OBSWebSocket } = require('obs-websocket-js');
const { validateTransition, transitionMatches } = require('./obs-transitions');
const OBSReplay = require('./obs-replay');
const { ProductionSetup } = require('./obs-production-setup');

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
    this._schedule = opts.setTimeout || setTimeout;
    this._cancel = opts.clearTimeout || clearTimeout;
    this._dwellMs = opts.dwellMs ?? 15000;
    this._obs     = opts.websocket || new OBSWebSocket();
    this._replay  = new OBSReplay(this);
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
      if (sceneName !== 'ESA_Replay' && this._replay.session) this._replay.cancel();
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
    this._obs.on('MediaInputPlaybackEnded', ({ inputName }) => {
      void this._replay.ended(inputName).catch(() => this.emit('replay-error', { error: 'Replay ended. Return to your program scene manually.' }));
    });
    this._obs.on('SceneTransitionStarted', () => { this._transitionActive = true; });
    this._obs.on('SceneTransitionEnded', () => { this._transitionActive = false; });
  }

  _onConnectionOpened() {
    this._setState(STATES.IDENTIFYING);
    this._logger.info('[obs] WebSocket connected — identifying');
  }

  async _onIdentified() {
    this._reconnectAttempt = 0;
    this._cancel(this._reconnectTimer); this._reconnectTimer = null;
    try {
      const { studioModeEnabled } = await this._obs.call('GetStudioModeEnabled');
      this._setState(studioModeEnabled ? STATES.STUDIO_MODE : STATES.READY);
    } catch (_) {
      this._setState(STATES.READY);
    }
    await this._fetchInitialTally();
    await this.inspect();
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
    this._replay.cancel();
    this._inspection = null;
    this._transitionActive = false;
    this._setState(STATES.DISCONNECTED);
    this._tally = { preview: null, program: null };
    this._logger.warn('[obs] Disconnected:', err?.message || '');
    this.emit('disconnected', { intentional: !this._shouldReconnect });
    if (this._shouldReconnect && this._connArgs) {
      this._scheduleReconnect();
    }
  }

  // ─── Reconnect ──────────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    const delay = BACKOFF_MS[Math.min(this._reconnectAttempt, BACKOFF_MS.length - 1)];
    this._reconnectAttempt += 1;
    this._logger.info(`[obs] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempt})`);
    this._reconnectTimer = this._schedule(() => this._attemptReconnect(), delay);
  }

  async _attemptReconnect() {
    this._reconnectTimer = null;
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
      this._cancel(this._reconnectTimer); this._reconnectTimer = null;
      this._shouldReconnect = false;
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
    this._replay.cancel();
    this._shouldReconnect = false;
    this._cancel(this._reconnectTimer);
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
      replayBusy: this._replay.saving || !!this._replay.session,
      transitionActive: this._transitionActive === true,
      version: this._inspection?.version || null,
      collection: this._inspection?.collection || null,
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

  async inspect() {
    const state = this.getState();
    if (!state.connected) return state;
    const results = await Promise.allSettled(['GetVersion', 'GetSceneCollectionList', 'GetSceneList', 'GetSceneTransitionList', 'GetReplayBufferStatus'].map(request => this._obs.call(request)));
    const value = index => results[index].status === 'fulfilled' ? results[index].value : {};
    const inspection = {
      ...this.getState(), version: value(0).obsVersion || null,
      collection: value(1).currentSceneCollectionName || null,
      scenes: (value(2).scenes || []).map(scene => scene.sceneName),
      transitions: value(3).transitions || [],
      replayBufferActive: value(4).outputActive ?? null,
      replayStatusAvailable: results[4].status === 'fulfilled',
      // Replay is optional. OBS returns 604 when its replay buffer is not configured.
      inspectionIncomplete: results.slice(0, 4).some(result => result.status === 'rejected'),
    };
    this._inspection = { version: inspection.version, collection: inspection.collection };
    return inspection;
  }

  productionSetup(saveOwned) {
    this._assertReady();
    if (!this._productionSetup) this._productionSetup = new ProductionSetup({ socket: this._obs, buildScenes: urls => this.buildScenes(urls), saveOwned });
    return this._productionSetup;
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
  async buildScenes(outputUrls = {}, { stillAllowed = () => true } = {}) {
    this._assertReady();
    const call = async (name, input) => { if (!stillAllowed()) throw new Error('Setup changed. Reopen the broadcast template.'); const result = await this._obs.call(name, input); if (!stillAllowed()) throw new Error('Setup changed. Reopen the broadcast template.'); return result; };
    const { scenes } = await call('GetSceneList');
    const existing = new Set(scenes.map((s) => s.sceneName));
    const created  = [];
    const skipped  = [];

    const planned = Object.keys(outputUrls).filter(key => key.startsWith('ESA_Screen_') || key === 'ESA_Gameplay');
    const inputs = planned.length ? (await call('GetInputList')).inputs || [] : [];
    for (const sceneName of new Set([...ESA_SCENES, ...planned])) {
      if (existing.has(sceneName)) {
        // Only our explicitly named planned sources are updated. Existing operator scenes stay intact.
        if (planned.includes(sceneName)) {
          const inputName = `${sceneName}_source`;
          const input = inputs.find(item => item.inputName === inputName);
          if (input && input.inputKind !== 'browser_source') throw new Error(`${inputName} belongs to another input type. Rename it in OBS before preparing this screen.`);
          if (input) await call('SetInputSettings', { inputName, inputSettings: { url: outputUrls[sceneName] }, overlay: true });
          else await this._addBrowserSource(sceneName, outputUrls[sceneName], call);
        }
        skipped.push(sceneName);
        continue;
      }
      await call('CreateScene', { sceneName });
      const key = sceneName.replace('ESA_', '').toLowerCase();
      const url = outputUrls[key] || outputUrls[sceneName] || null;
      if (url) {
        await this._addBrowserSource(sceneName, url, call);
      }
      created.push(sceneName);
    }

    return { created, existing: skipped };
  }

  async _addBrowserSource(sceneName, url, call = (name, input) => this._obs.call(name, input)) {
    await call('CreateInput', {
      sceneName,
      inputName:     `${sceneName}_source`,
      inputKind:     'browser_source',
      inputSettings: {
        url,
        width:          1920,
        height:         1080,
        fps:            60,
        reroute_audio:  false,
        shutdown:       false,
      },
    });
  }

  async pushTemplate(rows, owned, saveOwned, stillAllowed, baseUrls) {
    this._assertReady();
    if (this._templateBusy) throw new Error('Wait for the current template to finish sending.');
    this._templateBusy = true;
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    const cancelLive = event => { if (event.outputActive) cancelled = true; };
    this._obs.on?.('CurrentSceneCollectionChanging', cancel);
    this._obs.on?.('StreamStateChanged', cancelLive); this._obs.on?.('RecordStateChanged', cancelLive);
    const valid = () => !cancelled && this.getState().connected && stillAllowed();
    try { const result = await require('./obs-template-push').pushTemplate({ socket: this._obs, rows, owned, saveOwned, stillAllowed: valid }); if (baseUrls) await this.buildScenes(baseUrls, { stillAllowed: valid }); return result; }
    finally { this._obs.off?.('CurrentSceneCollectionChanging', cancel); this._obs.off?.('StreamStateChanged', cancelLive); this._obs.off?.('RecordStateChanged', cancelLive); this._templateBusy = false; }
  }

  async getVideoInputs() {
    this._assertReady();
    const result = await this._obs.call('GetInputList');
    return (result.inputs || []).filter(input => !input.inputName.startsWith('Air · ') && !/audio|wasapi|pulse|alsa|browser_source/i.test(input.inputKind)).map(input => ({ name: input.inputName, kind: input.inputKind }));
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
  async take(sceneName, transition, { stillAllowed = () => true } = {}) {
    this._assertReady();
    if (this._takeBusy || this._transitionActive) return { ok: false, error: 'Wait for the current OBS transition to finish.' };
    this._takeBusy = true;
    const start = Date.now();
    try {
      const choice = validateTransition(transition);
      if (choice) {
        if (this._state !== STATES.STUDIO_MODE && choice.mode !== 'cut') return { ok: false, error: 'Enable Studio Mode in OBS to use Fade or Stinger.' };
        const { transitions } = await this._obs.call('GetSceneTransitionList');
        if (!transitions.some(item => transitionMatches(choice, item))) return { ok: false, error: 'Selected transition is no longer available in OBS.' };
        await this._obs.call('SetCurrentSceneTransition', { transitionName: choice.name });
        if (choice.mode === 'fade') await this._obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: choice.durationMs });
      }
      if (!stillAllowed()) return { ok: false, error: 'Take cancelled because production changed.' };
      if (this._state === STATES.STUDIO_MODE) {
        await this._obs.call('SetCurrentPreviewScene', { sceneName });
        if (!stillAllowed()) return { ok: false, error: 'Take cancelled because production changed.' };
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
    } finally { this._takeBusy = false; }
  }

  async triggerReplay() {
    this._assertReady();
    return this._replay.play();
  }

  cancelReplay() { this._replay.cancel(); }
}

module.exports = OBSController;
