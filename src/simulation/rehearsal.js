'use strict';
const Harness = require('./harness');
const sample = require('./sample');
const { RulesEngine } = require('../rules-engine');
const { ShowRunner } = require('../show-runner');
const ROOM = '__ESA_SIM_';
class Rehearsal {
  constructor({ previewBase = "http://localhost:5300", writeSnapshot, hudPatch, takeScene, canUseObs, getTally = () => null, now = Date.now, harnessOptions = {} }) {
    this.previewBase = previewBase;
    this.writeSnapshot = writeSnapshot; this.patch = hudPatch; this.takeScene = takeScene; this.canUseObs = canUseObs; this.now = now;
    this.room = ROOM + require('node:crypto').randomBytes(11).toString('hex');
    this.allowObs = false; this.scene = ''; this.epoch = now(); this.history = [];
    this.lastTakeError = null; this.getTally = getTally;
    this.runner = new ShowRunner({ hudPatch: (_code, patch) => this.patch(this.room, patch), obsController: { on() {}, take: async scene => {
      if (!this.allowObs) return { ok: true };
      if (!this.canUseObs()) { this.allowObs = false; return { ok: false, error: 'OBS rehearsal stopped: production or capture is active.' }; }
      return this.takeScene(scene);
    } } });
    this.runner.on('error', error => { this.lastTakeError = error.message; });
    this.virtualTimers = new (require('./virtual-timers'))({ position: () => this.harness?.positionMs || 0 });
    this.rules = new RulesEngine({ hudPatch: (_code, patch) => this.patch(this.room, patch), setTimeout: (callback, delay) => this.virtualTimers.schedule(callback, delay), clearTimeout: id => this.virtualTimers.cancel(id) });
    this.lastClockAt = 0;
    this.harness = new Harness({ ...harnessOptions, onClock: async () => {
      await this.virtualTimers.advance();
      if (!this.harness.playing || this.now() - this.lastClockAt >= 250) { this.lastClockAt = this.now(); await this.patch(this.room, this.clock()); }
    }, onSeek: async (position, history) => {
      this.rules.dispose(); this.history = [...history];
      this.runner.loadRundown([]); this.lastTakeError = null;
      await this.writeSnapshot(this.room, this.snapshot(position));
    }, onEvent: async event => {
      this.history.push(event);
      const next = this.snapshot();
      await this.patch(this.room, { ...event.patch, ...(event.patch?.round ? { round: next.round } : {}), ...(event.patch?.spike ? { spike: next.spike } : {}), ...this.clock() });
      await this.rules.processEvent({ ...event, state: this.snapshot() }, { isTechPaused: () => false }, this.room);
      if (event.type === 'round.phase' && event.phase === 'live') {
        const scene = this.scene || 'ESA_Gameplay', id = `rehearsal:${next.round.number}`;
        this.runner.loadRundown([{ id, name: `Sample round ${next.round.number}`, scene, autoTake: true }]); this.runner.start();
        const result = await this.runner.take(id);
        if (!result?.ok) throw new Error(result?.error || 'OBS rehearsal scene change failed.');
        // Simulated tally is confined to the rehearsal runner. Real takes need OBS tally.
        if (!this.allowObs) this.runner._onTallyChanged({ program: scene });
        else this.acceptTally(this.getTally());
      }
    } });
  }
  clock(position = this.harness.positionMs) { return { simulation: { epoch: this.epoch, positionMs: position, wallAt: this.now(), playing: this.harness.playing, speed: this.harness.speed } }; }
  snapshot(position = this.harness.positionMs) {
    const state = sample.snapshot(this.history, this.epoch);
    const phase = this.history.findLast(event => event.patch?.round?.phase);
    const plant = this.history.findLast(event => event.patch?.spike?.planted === true);
    state.round.startedAt = this.epoch + (phase?.ts || 0);
    state.round.endsAt = state.round.phase === 'end' ? 0 : state.round.startedAt + (state.round.duration || 30) * 1000;
    state.round.remaining = state.round.phase === 'end' ? 0 : Math.max(0, (state.round.endsAt - this.epoch - position) / 1000);
    state.spike.plantedAt = state.spike.planted ? this.epoch + (plant?.ts || 0) : null;
    return { ...state, ...this.clock(position) };
  }
  async control({ action, value, allowObs, scene } = {}) {
    if (action === 'load') { this.allowObs = false; this.scene = ''; this.epoch = this.now(); await this.harness.load(sample.events); }
    else if (action === 'play') this.harness.resume();
    else if (action === 'pause') this.harness.pause();
    else if (action === 'seek') await this.harness.seek(value);
    else if (action === 'speed') this.harness.setSpeed(value);
    else if (action === 'obs') {
      if (typeof allowObs !== 'boolean') throw new Error('Choose whether to allow OBS scene changes.');
      if (allowObs && (!this.canUseObs() || typeof scene !== 'string' || !scene || scene.length > 256)) throw new Error('Stop production and capture, connect OBS, then choose a scene.');
      this.allowObs = allowObs; this.scene = allowObs ? scene : '';
    } else throw new Error('Unknown rehearsal action.');
    if (this.harness.events.length) await this.patch(this.room, this.clock());
    return this.getStatus();
  }
  acceptTally(tally) { if (this.allowObs && tally) this.runner._onTallyChanged(tally); }
  getStatus() { return { ...this.harness.getStatus(), allowObs: this.allowObs, scene: this.scene, rundown: this.runner.getState(), takeError: this.lastTakeError, url: this.previewBase + '/overlays/ingame.html?match=' + this.room }; }
  stop() { this.harness.stop(); this.allowObs = false; this.rules.dispose(); this.runner.loadRundown([]); }
}
module.exports = { Rehearsal, ROOM };
