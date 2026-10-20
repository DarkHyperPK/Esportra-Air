'use strict';
const EventEmitter = require('events');
const http = require('http');

const STATES = Object.freeze({
  DISCONNECTED: 'disconnected',
  IDENTIFYING:  'identifying',
  READY:        'ready',
});

const POLL_MS       = 1500;
const API_TIMEOUT   = 3000;
const CONNECT_TIMEOUT = 5000;

// ─── HTTP client ─────────────────────────────────────────────────────────────

class VmixHttp {
  constructor(host, port) { this.host = host; this.port = port; }

  get(path, timeoutMs = API_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: this.host, port: this.port, path, timeout: timeoutMs }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('vMix API request timed out.')); });
    });
  }

  async fn(name, input = null) {
    const qs = input != null
      ? `Function=${encodeURIComponent(name)}&Input=${encodeURIComponent(input)}`
      : `Function=${encodeURIComponent(name)}`;
    await this.get(`/api?${qs}`);
  }
}

// ─── XML parser (vMix API response) ─────────────────────────────────────────

function parseVmixXml(xml) {
  const inputs = [];
  const re = /<input\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const a = m[1];
    const key    = (a.match(/\bkey="([^"]*)"/)    || [])[1] || null;
    const number = parseInt((a.match(/\bnumber="(\d+)"/) || [])[1] || '0', 10);
    const title  = (a.match(/\btitle="([^"]*)"/)  || [])[1] || null;
    const type   = (a.match(/\btype="([^"]*)"/)   || [])[1] || null;
    if (key && title) inputs.push({ id: key, name: title, number, type });
  }
  const activeNum  = parseInt((xml.match(/<active>(\d+)<\/active>/)  || [])[1] || '0', 10);
  const previewNum = parseInt((xml.match(/<preview>(\d+)<\/preview>/) || [])[1] || '0', 10);
  const byNumber   = n => inputs.find(i => i.number === n)?.name || null;

  const transitions = [];
  const tr = /<transition\b([^>]*)>/g;
  while ((m = tr.exec(xml)) !== null) {
    const a      = m[1];
    const num    = parseInt((a.match(/\bnumber="(\d+)"/) || [])[1] || '0', 10);
    const effect = (a.match(/\beffect="([^"]*)"/)        || [])[1] || null;
    if (num) transitions.push({ number: num, name: effect ? `${effect} (${num})` : `Transition ${num}`, effect });
  }

  return {
    inputs,
    program:    byNumber(activeNum),
    preview:    byNumber(previewNum),
    transitions,
    streaming:  /<streaming>1<\/streaming>/.test(xml),
    recording:  /<recording>1<\/recording>/.test(xml),
  };
}

// ─── OBS WebSocket bridge ────────────────────────────────────────────────────
// Translates enough OBS WS v5 calls to vMix HTTP so that OBSInventory and
// OBSConsole can drive basic scene switching. Unsupported calls throw clearly.

class VmixOBSBridge extends EventEmitter {
  constructor(vmixHttp) { super(); this._http = vmixHttp; }

  async call(method, params = {}) {
    switch (method) {
      case 'GetSceneCollectionList':
        return { currentSceneCollectionName: 'vMix' };

      case 'GetSceneList': {
        const xml = await this._http.get('/api');
        const { inputs, program, preview } = parseVmixXml(xml);
        return {
          currentProgramSceneName:  program,
          currentPreviewSceneName:  preview,
          scenes: inputs.map(i => ({ sceneName: i.name, sceneUuid: i.id })),
        };
      }

      case 'GetInputList':
        return { inputs: [] };

      case 'GetSceneTransitionList': {
        const xml = await this._http.get('/api');
        const { transitions } = parseVmixXml(xml);
        return {
          currentSceneTransitionName: transitions[0]?.name || '',
          transitions: transitions.map(t => ({
            transitionName: t.name,
            transitionKind: /stinger/i.test(t.effect || '')
              ? 'obs_stinger_transition'
              : 'fade_transition',
          })),
        };
      }

      case 'GetStreamStatus': {
        const xml = await this._http.get('/api');
        return { outputActive: parseVmixXml(xml).streaming };
      }

      case 'GetRecordStatus': {
        const xml = await this._http.get('/api');
        return { outputActive: parseVmixXml(xml).recording };
      }

      case 'SetCurrentProgramScene':
        await this._http.fn('Cut', params.sceneName);
        return {};

      case 'SetCurrentPreviewScene':
        await this._http.fn('PreviewInput', params.sceneName);
        return {};

      case 'TriggerStudioModeTransition':
        await this._http.fn('Transition1');
        return {};

      default:
        throw new Error(`vMix: ${method} is not available on vMix. Use OBS WebSocket for this feature.`);
    }
  }
}

// ─── VMixController ──────────────────────────────────────────────────────────

class VMixController extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._logger   = opts.logger || console;
    this._schedule = opts.setTimeout  || setTimeout;
    this._cancel   = opts.clearTimeout || clearTimeout;
    this._state    = STATES.DISCONNECTED;
    this._tally    = { preview: null, program: null };
    this._host     = null;
    this._port     = 8088;
    this._http     = null;
    this._obs      = null;
    this._timer    = null;
    this._epoch    = 0;
  }

  async connect(host = '127.0.0.1', port = 8088) {
    if (this._state !== STATES.DISCONNECTED) throw new Error('Already connecting or connected to vMix.');
    this._host = host; this._port = port;
    this._state = STATES.IDENTIFYING;
    this.emit('state-changed', this._state);
    const vmixHttp = new VmixHttp(host, port);
    try {
      const xml = await vmixHttp.get('/api', CONNECT_TIMEOUT);
      if (!xml.includes('<vmix>')) throw new Error('No vMix API found at this address. Check the port and enable the Web Controller in vMix.');
      this._http = vmixHttp;
      this._obs  = new VmixOBSBridge(vmixHttp);
      this._epoch++;
      this._state = STATES.READY;
      const { program, preview } = parseVmixXml(xml);
      this._tally = { program, preview };
      this.emit('connected', { studioMode: true });
      this.emit('state-changed', this._state);
      this.emit('tally-changed', { ...this._tally });
      this._schedulePoll();
    } catch (error) {
      this._http = null; this._obs = null;
      this._state = STATES.DISCONNECTED;
      this.emit('state-changed', this._state);
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect() {
    this._cancelPoll();
    const wasConnected = this._state === STATES.READY;
    this._state = STATES.DISCONNECTED;
    this._http = null;
    if (this._obs) { this._obs.removeAllListeners(); this._obs = null; }
    this._tally = { preview: null, program: null };
    if (wasConnected) this.emit('disconnected', { intentional: true });
    this.emit('state-changed', this._state);
  }

  getState() {
    return {
      state:            this._state,
      connected:        this._state === STATES.READY,
      studioMode:       this._state === STATES.READY,
      transitionActive: false,
      tally:            { ...this._tally },
      host:             this._host,
      connectionEpoch:  this._epoch,
    };
  }

  getTally() { return { ...this._tally }; }

  async preview(sceneName, valid) {
    if (!this._http) throw new Error('vMix is not connected.');
    if (valid && !valid()) throw new Error('State changed during vMix operation.');
    await this._http.fn('PreviewInput', sceneName);
  }

  async take(sceneName, transition = {}, opts = {}) {
    if (!this._http) return { ok: false, error: 'vMix is not connected.', latencyMs: 0, scene: sceneName };
    const t0 = Date.now();
    try {
      await this._http.fn(this._transitionFn(transition), sceneName);
      return { ok: true, latencyMs: Date.now() - t0, scene: sceneName };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - t0, scene: sceneName, error: error.message };
    }
  }

  async inspect() {
    const base = this.getState();
    if (!this._http) return base;
    try {
      const xml = await this._http.get('/api');
      const { inputs, transitions } = parseVmixXml(xml);
      return {
        ...base,
        version: null,
        collection: 'vMix',
        scenes: inputs.map(i => i.name),
        transitions,
        replayBufferActive: null,
        replayStatusAvailable: false,
        inspectionIncomplete: false,
      };
    } catch { return { ...base, inspectionIncomplete: true }; }
  }

  async getScenes() {
    if (!this._http) return [];
    try { return parseVmixXml(await this._http.get('/api')).inputs; }
    catch { return []; }
  }

  async setScene(sceneName) {
    if (!this._http) throw new Error('vMix is not connected.');
    await this._http.fn('Cut', sceneName);
  }

  async getScreenshot() { return null; }

  async buildScenes() {
    return { created: [], existing: [], error: 'vMix scene creation is not supported. Add inputs in vMix directly.' };
  }

  async triggerReplay() {
    if (!this._http) return { ok: false, error: 'vMix is not connected.' };
    try { await this._http.fn('ReplayPlayToOutput'); return { ok: true }; }
    catch (error) { return { ok: false, error: error.message }; }
  }

  cancelReplay() {}

  // ─── Private ────────────────────────────────────────────────────────────────

  _transitionFn(t = {}) {
    if (!t || t.mode === 'cut')    return 'Cut';
    if (t.mode === 'fade')         return 'Fade';
    if (t.mode === 'stinger')      return /2$/.test(t.name || '') ? 'Stinger2' : 'Stinger1';
    return 'Transition1';
  }

  _schedulePoll() {
    this._cancelPoll();
    const epoch = this._epoch;
    this._timer = this._schedule(async () => {
      if (this._epoch !== epoch || this._state !== STATES.READY) return;
      try {
        const xml = await this._http.get('/api');
        if (this._epoch !== epoch) return;
        const { program, preview } = parseVmixXml(xml);
        const changed = program !== this._tally.program || preview !== this._tally.preview;
        this._tally = { program, preview };
        if (changed) this.emit('tally-changed', { ...this._tally });
      } catch {
        if (this._epoch === epoch && this._state === STATES.READY) {
          this._state = STATES.DISCONNECTED;
          this._epoch++;
          this._tally = { preview: null, program: null };
          this.emit('disconnected', { intentional: false });
          this.emit('state-changed', this._state);
          return;
        }
      }
      if (this._epoch === epoch) this._schedulePoll();
    }, POLL_MS);
  }

  _cancelPoll() {
    if (this._timer != null) { this._cancel(this._timer); this._timer = null; }
  }
}

module.exports = VMixController;
