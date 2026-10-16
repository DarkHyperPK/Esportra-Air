'use strict';
const EventEmitter = require('events');
const { app } = require('electron');
const fs   = require('fs');
const path = require('path');
const { REMOTE_EVENT_TYPES } = require('./broadcast-events');
const { HistoryWindow, actionMetadata } = require('./production-history');

const MAX_MEMORY = 500;

/**
 * Append-only event log for ShowRunner state transitions and operator commands.
 *
 * Storage: userData/event-log.ndjson (separate from offline-queue.ndjson)
 * Each entry: { ts, type, segmentId?, scene?, actor, data? }
 *
 * Emits 'entry' after each log call — main.js forwards it to the renderer
 * via the 'event-log-entry' IPC channel.
 */
class EventLogger extends EventEmitter {
  /**
   * @param {{ offlineQueue?: object, logger?: object }} opts
   */
  constructor({ offlineQueue, logger = console, now = Date.now }) {
    super();
    this._offlineQueue = offlineQueue || null;
    this._logger       = logger;
    this._filePath     = path.join(app.getPath('userData'), 'event-log.ndjson');
    this._memory       = [];
    this._showId       = null;
    this._now = now; this._timeline = new HistoryWindow({ now });
    this._restoreTimeline();
  }

  setOfflineQueue(queue) { this._offlineQueue = queue; }
  setShowId(showId) { this._showId = showId || null; }

  /**
   * Append one event entry to disk, memory ring-buffer, offline-queue (if set),
   * and emit 'entry' for renderer push.
   *
   * @param {{ type, segmentId?, scene?, actor?, data? }} opts
   * @returns {object} The saved entry
   */
  log({ type, segmentId, scene, actor = 'system', data, showId = this._showId } = {}) {
    const entry = {
      ts:    this._now(),
      type,
      actor,
      showId,
      ...(segmentId !== undefined ? { segmentId } : {}),
      ...(scene     !== undefined ? { scene }     : {}),
      ...(data      !== undefined ? { data }      : {}),
    };

    try {
      fs.appendFileSync(this._filePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      this._logger.warn('[event-logger] write error:', err.message);
    }

    this._memory.push(entry);
    this._timeline.append(entry);
    if (this._memory.length > MAX_MEMORY) this._memory.shift();

    if (this._offlineQueue && REMOTE_EVENT_TYPES.has(type)) {
      try {
        this._offlineQueue.enqueue({ type: 'BroadcastEvent', event: entry });
      } catch (err) {
        this._logger.warn('[event-logger] queue error:', err.message);
      }
    }

    this.emit('entry', entry);
    const metadata = actionMetadata(entry);
    if (metadata) this.log({ ...metadata, actor: entry.actor });
    return entry;
  }

  _restoreTimeline() {
    let descriptor;
    try {
      descriptor = fs.openSync(this._filePath, 'r');
      const size = fs.fstatSync(descriptor).size, start = Math.max(0, size - 8 * 1024 * 1024), buffer = Buffer.alloc(size - start);
      fs.readSync(descriptor, buffer, 0, buffer.length, start);
      const lines = buffer.toString('utf8').split('\n'); if (start) { lines.shift(); this._timeline.truncated = true; }
      for (const line of lines) { try { this._timeline.append(JSON.parse(line)); } catch { /* Partial/corrupt lines cannot enter runtime state. */ } }
      this._memory = this._timeline.items.slice(-MAX_MEMORY);
    } catch { /* A new install has no history yet. */ }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  getTimeline(showId) { return this._timeline.snapshot(showId); }

  /**
   * Returns the last N entries from the in-memory ring-buffer (fast).
   * @param {number} [limit=100]
   * @returns {object[]}
   */
  getLog(limit = 100) {
    return this._memory.slice(-limit);
  }
}

module.exports = EventLogger;
