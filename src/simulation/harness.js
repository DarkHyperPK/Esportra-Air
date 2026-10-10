'use strict';
const fs       = require('fs');
const readline = require('readline');

/**
 * .ndjson simulation harness — replays a recorded event file through ShowRunner.
 *
 * Each line in the file: { ts, type, ...data }  (ts = epoch ms)
 * Events fire at recorded inter-event deltas, scaled by speed multiplier.
 *
 * Usage: activated via SIMULATION_START IPC in NODE_ENV=development.
 */
class Harness {
  /**
   * @param {{ showRunner: object, logger?: object }} opts
   */
  constructor({ showRunner, logger = console }) {
    this._runner  = showRunner;
    this._logger  = logger;
    this._lines   = [];
    this._playing = false;
    this._paused  = false;
    this._seekTs  = null;
    this._timer   = null;
  }

  /**
   * Parse and replay a .ndjson event file.
   * @param {string} filePath  Absolute path to the fixture file.
   * @param {{ speed?: number }} [opts]  speed = 1.0 = real-time; 10.0 = 10× fast
   */
  async play(filePath, { speed = 1.0 } = {}) {
    this.stop();
    this._lines   = await this._readLines(filePath);
    this._playing = true;
    this._paused  = false;
    this._seekTs  = null;
    this._dispatch(0, speed);
  }

  /** Pause inter-event delays (events resume from where they stopped). */
  pause()        { this._paused = true; }

  /** Resume after pause(). */
  resume()       { this._paused = false; }

  /**
   * Seek: skip all events with ts < seekTs.
   * @param {number} ts  Epoch ms
   */
  seek(ts)       { this._seekTs = ts; }

  isPlaying()    { return this._playing; }

  /** Stop playback and clear timers. */
  stop() {
    clearTimeout(this._timer);
    this._timer   = null;
    this._playing = false;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  _dispatch(idx, speed) {
    if (idx >= this._lines.length || !this._playing) {
      this._playing = false;
      return;
    }
    if (this._paused) {
      this._timer = setTimeout(() => this._dispatch(idx, speed), 100);
      return;
    }
    const curr  = this._lines[idx];
    const next  = this._lines[idx + 1];
    const delay = next ? Math.max(0, (next.ts - curr.ts) / Math.max(speed, 0.01)) : 0;

    if (!this._seekTs || curr.ts >= this._seekTs) {
      this._fire(curr);
    }

    this._timer = setTimeout(() => this._dispatch(idx + 1, speed), delay);
  }

  _fire(event) {
    try {
      this._runner.processGepEvent(event);
    } catch (err) {
      this._logger.warn('[harness] processGepEvent error:', err.message);
    }
  }

  async _readLines(filePath) {
    return new Promise((resolve, reject) => {
      const lines = [];
      const rl    = readline.createInterface({
        input:     fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        try { lines.push(JSON.parse(line)); } catch (_) {}
      });
      rl.on('close', () => resolve(lines));
      rl.on('error', reject);
    });
  }
}

module.exports = Harness;
