'use strict';
const EventEmitter = require('events');
const { app } = require('electron');
const fs   = require('fs');
const path = require('path');

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
  constructor({ offlineQueue, logger = console }) {
    super();
    this._offlineQueue = offlineQueue || null;
    this._logger       = logger;
    this._filePath     = path.join(app.getPath('userData'), 'event-log.ndjson');
    this._memory       = [];
  }

  setOfflineQueue(queue) { this._offlineQueue = queue; }

  /**
   * Append one event entry to disk, memory ring-buffer, offline-queue (if set),
   * and emit 'entry' for renderer push.
   *
   * @param {{ type, segmentId?, scene?, actor?, data? }} opts
   * @returns {object} The saved entry
   */
  log({ type, segmentId, scene, actor = 'system', data } = {}) {
    const entry = {
      ts:    Date.now(),
      type,
      actor,
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
    if (this._memory.length > MAX_MEMORY) this._memory.shift();

    if (this._offlineQueue) {
      try {
        this._offlineQueue.enqueue({ type: 'BroadcastEvent', event: entry });
      } catch (err) {
        this._logger.warn('[event-logger] queue error:', err.message);
      }
    }

    this.emit('entry', entry);
    return entry;
  }

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
