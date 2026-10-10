'use strict';
const EventEmitter = require('events');
const { performance } = require('perf_hooks');

// ─── Segment lifecycle states ─────────────────────────────────────────────────
const SEG = Object.freeze({
  QUEUED:  'queued',
  ARMED:   'armed',
  HOLDING: 'holding',
  TAKING:  'taking',
  ON_AIR:  'on_air',
  DONE:    'done',
});

const MAX_CMD_IDS         = 50;
const TALLY_CONFIRM_MS    = 3000;
const HOLD_TICK_MS        = 250;
const DEFAULT_HOLD_WINDOW = 30000;

/**
 * ShowRunner — autopilot segment lifecycle state machine.
 *
 * Pure: all side-effects via injected collaborators (obsController, hudPatch).
 * Wire GEP events via processGepEvent(event).
 *
 * Segment lifecycle: queued → armed → holding → taking → on_air → done
 *
 * Emits:
 *   'stateChange'   { activeSegment, nextSegment, segments, techPaused, holdCountdown }
 *   'holdWindow'    { segment, remaining }
 *   'takeTriggered' { segment }
 *   'segmentDone'   { segment }
 *   'error'         Error
 *
 * T22 safety invariants enforced:
 *   1. take() blocked when techPaused.
 *   2. OBS disconnect → techPause() automatically.
 *   3. OBS reconnect → resume() only when paused by OBS disconnect.
 *   4. Duplicate commandIds rejected (last 50 tracked).
 *   5. Transition violations emit 'error'.
 */
class ShowRunner extends EventEmitter {
  /**
   * @param {object}   opts
   * @param {object}   [opts.obsController]  OBSController / VMixController instance
   * @param {Function} opts.hudPatch         async (matchCode: string, patch: object) => void
   * @param {object}   [opts.offlineQueue]   Reserved — EventLogger handles queuing
   * @param {object}   [opts.logger]
   */
  constructor({ obsController, hudPatch, offlineQueue, logger = console }) {
    super();
    this._obs          = obsController || null;
    this._hudPatch     = hudPatch;
    this._offlineQueue = offlineQueue || null;
    this._logger       = logger;
    this._segments     = [];
    this._techPaused      = false;
    this._techPausedByObs = false;
    this._holdEnd      = null;
    this._holdTimer    = null;
    this._holdTick     = null;
    this._takingTimer  = null;
    this._cmdIds       = [];        // ordered list for eviction
    this._cmdIdSet     = new Set(); // O(1) lookup
    this._rulesEngine  = null;
    this._wireObs();
  }

  // ─── OBS wiring (T22 invariants 2 & 3) ──────────────────────────────────────

  /** Replace the OBS controller after lazy creation in main.js. */
  setObsController(ctrl) {
    this._obs = ctrl;
    this._wireObs();
  }

  _wireObs() {
    if (!this._obs) return;
    this._obs.on('disconnected',  () => this._handleObsDisconnect());
    this._obs.on('connected',     () => this._handleObsReconnect());
    this._obs.on('tally-changed', (t) => this._onTallyChanged(t));
  }

  _handleObsDisconnect() {
    if (!this._techPaused) {
      this._techPausedByObs = true;
      this.techPause();
    }
  }

  _handleObsReconnect() {
    if (this._techPausedByObs) {
      this._techPausedByObs = false;
      this.resume();
    }
  }

  // ─── Rules engine integration ────────────────────────────────────────────────

  setRulesEngine(re) {
    this._rulesEngine = re;
  }

  /** Forward GEP event to the rules engine (called by main.js on each ingest). */
  processGepEvent(gepEvent) {
    if (!this._rulesEngine) return;
    this._rulesEngine.processEvent(gepEvent, this).catch(err => {
      this._logger.error('[show-runner] rules engine error:', err.message);
    });
  }

  // ─── Core public API ─────────────────────────────────────────────────────────

  /**
   * Load (or replace) the rundown. All segments start as queued.
   * @param {Array<{ id, name, scene, autoTake?, holdWindowMs? }>} segments
   */
  loadRundown(segments) {
    this._clearTimers();
    this._segments = segments.map(s => ({ ...s, state: SEG.QUEUED }));
    this.emit('stateChange', this.getState());
  }

  /** Arm the first queued segment, starting the rundown. */
  start() {
    const first = this._segments.find(s => s.state === SEG.QUEUED);
    if (!first) { this._emitError('start() — no queued segments'); return; }
    first.state = SEG.ARMED;
    this.emit('stateChange', this.getState());
  }

  /**
   * Operator-triggered hold window. Arms segment into holding + starts countdown.
   * @param {string} segmentId
   * @returns {{ ok: boolean, error?: string }}
   */
  hold(segmentId) {
    const seg = this._findById(segmentId);
    if (!seg) return { ok: false, error: 'segment_not_found' };
    if (seg.state !== SEG.ARMED && seg.state !== SEG.QUEUED) {
      this._emitError(`hold() invalid state: ${seg.state}`);
      return { ok: false, error: `invalid_state:${seg.state}` };
    }
    seg.state = SEG.HOLDING;
    this._startHoldCountdown(seg);
    this.emit('holdWindow', {
      segment:   this._safe(seg),
      remaining: seg.holdWindowMs || DEFAULT_HOLD_WINDOW,
    });
    this.emit('stateChange', this.getState());
    return { ok: true };
  }

  /**
   * Skip a segment — marks done and arms the next.
   * @param {string} segmentId
   * @returns {{ ok: boolean, error?: string }}
   */
  skip(segmentId) {
    const seg = this._findById(segmentId);
    if (!seg) return { ok: false, error: 'segment_not_found' };
    const skippable = [SEG.ARMED, SEG.HOLDING, SEG.ON_AIR];
    if (!skippable.includes(seg.state)) {
      this._emitError(`skip() invalid state: ${seg.state}`);
      return { ok: false, error: `invalid_state:${seg.state}` };
    }
    this._clearHoldCountdown();
    seg.state = SEG.DONE;
    this.emit('segmentDone', { segment: this._safe(seg) });
    this._armNext(seg);
    this.emit('stateChange', this.getState());
    return { ok: true };
  }

  /**
   * Trigger a scene take.
   * T22 invariant 1: blocked when techPaused.
   * T22 invariant 4: duplicate commandIds rejected.
   *
   * @param {string} segmentId
   * @param {{ commandId?: string }} [opts]
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async take(segmentId, { commandId } = {}) {
    if (commandId && this._cmdIdSet.has(commandId)) {
      return { ok: false, error: 'duplicate_command' };
    }
    if (this._techPaused) {
      return { ok: false, error: 'tech_pause' };
    }
    const seg = this._findById(segmentId);
    if (!seg) return { ok: false, error: 'segment_not_found' };
    const takeable = [SEG.ARMED, SEG.HOLDING];
    if (!takeable.includes(seg.state)) {
      this._emitError(`take() invalid state: ${seg.state}`);
      return { ok: false, error: `invalid_state:${seg.state}` };
    }
    if (commandId) this._trackCmdId(commandId);
    this._clearHoldCountdown();
    seg.state = SEG.TAKING;
    this.emit('stateChange', this.getState());
    return this._execTake(seg);
  }

  /** Resume autopilot after tech pause. */
  resume() {
    if (!this._techPaused) return;
    this._techPaused = false;
    this.emit('stateChange', this.getState());
  }

  /** Safety pause — blocks all auto-takes until resume() is called. */
  techPause() {
    this._clearHoldCountdown();
    this._techPaused = true;
    this.emit('stateChange', this.getState());
  }

  isTechPaused() { return this._techPaused; }

  /**
   * Renderer-safe state snapshot.
   * @returns {{ activeSegment, nextSegment, segments, techPaused, holdCountdown }}
   */
  getState() {
    const live   = [SEG.ARMED, SEG.HOLDING, SEG.TAKING, SEG.ON_AIR];
    const active = this._segments.find(s => live.includes(s.state)) || null;
    const ai     = active ? this._segments.indexOf(active) : -1;
    const next   = ai >= 0
      ? (this._segments.slice(ai + 1).find(s => s.state === SEG.QUEUED) || null)
      : null;
    const holdCountdown =
      active?.state === SEG.HOLDING && this._holdEnd !== null
        ? Math.max(0, this._holdEnd - performance.now())
        : null;
    return {
      activeSegment: active ? this._safe(active) : null,
      nextSegment:   next   ? this._safe(next)   : null,
      segments:      this._segments.map(s => this._safe(s)),
      techPaused:    this._techPaused,
      holdCountdown,
    };
  }

  // ─── OBS take execution ───────────────────────────────────────────────────────

  async _execTake(seg) {
    if (this._obs) {
      let result;
      try {
        result = await this._obs.take(seg.scene);
      } catch (err) {
        result = { ok: false, error: err.message };
      }
      if (!result.ok) {
        seg.state = SEG.HOLDING;
        this._emitError(`OBS take failed (${seg.id}): ${result.error}`);
        this.emit('stateChange', this.getState());
        return { ok: false, error: result.error };
      }
    }
    this.emit('takeTriggered', { segment: this._safe(seg) });
    // Tally confirmation fallback (T22 — force on_air after TALLY_CONFIRM_MS).
    this._takingTimer = setTimeout(() => {
      const s = this._findById(seg.id);
      if (s && s.state === SEG.TAKING) {
        this._logger.warn('[show-runner] tally timeout — forcing on_air:', seg.id);
        this._confirmOnAir(s);
      }
    }, TALLY_CONFIRM_MS);
    return { ok: true };
  }

  // ─── Tally confirmation ───────────────────────────────────────────────────────

  _onTallyChanged(tally) {
    const seg = this._segments.find(s => s.state === SEG.TAKING);
    if (!seg || tally.program !== seg.scene) return;
    this._confirmOnAir(seg);
  }

  _confirmOnAir(seg) {
    clearTimeout(this._takingTimer);
    this._takingTimer = null;
    const prev = this._segments.find(s => s !== seg && s.state === SEG.ON_AIR);
    if (prev) {
      prev.state = SEG.DONE;
      this.emit('segmentDone', { segment: this._safe(prev) });
    }
    seg.state = SEG.ON_AIR;
    this._armNext(seg);
    this.emit('stateChange', this.getState());
  }

  // ─── Hold countdown ───────────────────────────────────────────────────────────

  _startHoldCountdown(seg) {
    this._clearHoldCountdown();
    const windowMs    = seg.holdWindowMs || DEFAULT_HOLD_WINDOW;
    this._holdEnd     = performance.now() + windowMs;
    if (seg.autoTake) {
      this._holdTimer = setTimeout(() => {
        if (!this._techPaused) this.take(seg.id).catch(() => {});
      }, windowMs);
    }
    this._holdTick = setInterval(() => {
      const remaining = Math.max(0, this._holdEnd - performance.now());
      this.emit('holdWindow', { segment: this._safe(seg), remaining });
      if (remaining <= 0) this._clearHoldCountdown();
    }, HOLD_TICK_MS);
  }

  _clearHoldCountdown() {
    clearTimeout(this._holdTimer);
    clearInterval(this._holdTick);
    this._holdTimer = null;
    this._holdTick  = null;
    this._holdEnd   = null;
  }

  _clearTimers() {
    this._clearHoldCountdown();
    clearTimeout(this._takingTimer);
    this._takingTimer = null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  _armNext(afterSeg) {
    const idx  = this._segments.indexOf(afterSeg);
    const next = this._segments.slice(idx + 1).find(s => s.state === SEG.QUEUED);
    if (next) next.state = SEG.ARMED;
  }

  _findById(id) {
    return this._segments.find(s => s.id === id) || null;
  }

  _safe(seg) {
    return {
      id:           seg.id,
      name:         seg.name,
      scene:        seg.scene,
      state:        seg.state,
      autoTake:     seg.autoTake     ?? false,
      holdWindowMs: seg.holdWindowMs ?? DEFAULT_HOLD_WINDOW,
    };
  }

  _trackCmdId(id) {
    if (this._cmdIdSet.has(id)) return;
    this._cmdIds.push(id);
    this._cmdIdSet.add(id);
    if (this._cmdIds.length > MAX_CMD_IDS) {
      this._cmdIdSet.delete(this._cmdIds.shift());
    }
  }

  _emitError(msg) {
    this._logger.error('[show-runner]', msg);
    this.emit('error', new Error(msg));
  }
}

module.exports = { ShowRunner, SEG };
