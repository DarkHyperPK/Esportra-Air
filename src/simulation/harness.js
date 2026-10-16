'use strict';
const { performance } = require('node:perf_hooks');

// Seeking rebuilds a snapshot without firing past actions.
class Harness {
  constructor({ onEvent, onSeek, onClock, now = () => performance.now(), schedule = setInterval, cancel = clearInterval }) {
    this.onEvent = onEvent; this.onSeek = onSeek; this.now = now; this.schedule = schedule; this.cancel = cancel;
    this.events = []; this.positionMs = 0; this.speed = 1; this.playing = false; this.cursor = 0;
    this.timer = null; this.lastTick = 0; this.busy = false; this.error = null;
    this.onClock = onClock;
  }
  async load(events) {
    this.stop();
    if (!Array.isArray(events) || !events.length || events.length > 10000 || events.some((event, i) => !Number.isFinite(event.ts) || event.ts < 0 || (i && event.ts < events[i - 1].ts))) throw new Error('Invalid rehearsal recording.');
    this.events = events; this.error = null; await this.seek(0);
  }
  setSpeed(speed) {
    if (![0.5, 1, 2, 4, 10].includes(speed)) throw new Error('Choose 0.5x, 1x, 2x, 4x or 10x.');
    this.speed = speed; this.lastTick = this.now();
  }
  pause() { this.playing = false; this.cancel(this.timer); this.timer = null; }
  resume() {
    if (!this.events.length || this.busy) throw new Error('Load a rehearsal first.');
    if (this.positionMs >= this.durationMs) throw new Error('Rehearsal ended. Rewind to play again.');
    if (this.playing) return;
    this.playing = true; this.lastTick = this.now(); this.timer = this.schedule(() => void this.tick(), 40);
  }
  async seek(ms) {
    if (!Number.isFinite(ms) || ms < 0 || ms > this.durationMs) throw new Error('Choose a position inside the rehearsal.');
    if (this.busy) throw new Error('Wait for the current rehearsal event.');
    this.pause(); this.busy = true;
    try { this.positionMs = ms; this.cursor = this.events.findIndex(event => event.ts > ms); if (this.cursor < 0) this.cursor = this.events.length; await this.onSeek?.(ms, this.events.filter(event => event.ts <= ms)); }
    finally { this.busy = false; }
  }
  async tick() {
    if (!this.playing || this.busy) return;
    this.busy = true;
    const clock = this.now(); this.positionMs = Math.min(this.durationMs, this.positionMs + Math.max(0, clock - this.lastTick) * this.speed); this.lastTick = clock;
    try { while (this.playing && this.cursor < this.events.length && this.events[this.cursor].ts <= this.positionMs) await this.onEvent(this.events[this.cursor++]); if (this.cursor >= this.events.length) this.pause(); await this.onClock?.(); }
    catch (failure) { this.error = failure.message || 'Rehearsal could not continue.'; this.pause(); }
    finally { this.busy = false; }
  }
  stop() { this.pause(); }
  isPlaying() { return this.playing; }
  get durationMs() { return this.events.at(-1)?.ts || 0; }
  getStatus() { return { loaded: !!this.events.length, playing: this.playing, positionMs: this.positionMs, durationMs: this.durationMs, speed: this.speed, busy: this.busy, error: this.error }; }
}
module.exports = Harness;
