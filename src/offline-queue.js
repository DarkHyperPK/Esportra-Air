'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

/**
 * Disk-persisted NDJSON event queue with HMAC integrity.
 * See P0 architecture §5 for the full spec.
 *
 * Storage: userData/offline-queue.ndjson
 * Each line: { id, ts, payload, hmac }
 *
 * Usage:
 *   const OfflineQueue = require('./offline-queue');
 *   const queue = new OfflineQueue({ nodeToken: 'xxx', logger: console });
 *   queue.enqueue({ type: 'MatchResultSubmitted', ... });
 *   await queue.drain(async (payload) => { await hub.send(payload); });
 *   queue.clear();
 */
class OfflineQueue extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.nodeToken - Secret token used to derive the HMAC key.
   *   Never stored in the queue file.
   * @param {{ info: fn, warn: fn, error: fn }} [opts.logger]
   */
  constructor({ nodeToken, logger = console }) {
    super();
    this._nodeToken = nodeToken;
    this._logger = logger;
    this._filePath = path.join(app.getPath('userData'), 'offline-queue.ndjson');
    // Lazy — computed on first use so the constructor never touches crypto.
    this._hmacKey = null;
    this._drainPromise = null;
  }

  /**
   * Append one event to disk synchronously.
   * Throws only on I/O error, not on schema issues.
   *
   * @param {object} payload - Event body (arbitrary JSON-serialisable object).
   */
  enqueue(payload) {
    const id = this._generateId();
    const ts = Date.now();
    const hmac = this._signEntry({ id, ts, payload });
    const entry = { id, ts, payload, hmac };
    fs.appendFileSync(this._filePath, JSON.stringify(entry) + '\n', 'utf8');
    this.emit('enqueue');
    return id;
  }

  /**
   * Read all queued lines, verify HMAC integrity, and call sendFn for each
   * valid entry in FIFO order.
   *
   * - Lines with bad HMAC are skipped and warned but kept on disk for
   *   manual inspection (they do NOT stop the drain).
   * - If sendFn throws, the drain stops immediately; the failed event and all
   *   subsequent events remain on disk for the next drain attempt.
   * - After processing, the file is rewritten to contain only undelivered lines.
   *
   * @param {(payload: object, metadata: {id: string, ts: number}) => Promise<void|boolean>} sendFn
   *   Throw to stop on network failure. Return false to retain an unacknowledged
   *   record without blocking later eligible records. Concurrent drains coalesce.
   */
  drain(sendFn) {
    return this.drainBatches(records => sendFn(records[0].payload, { id: records[0].id, ts: records[0].ts }), { batchSize: 1 });
  }

  drainBatches(sendFn, { batchSize = 100, key = () => 'default' } = {}) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Batch size must be 1–100.');
    if (this._drainPromise) return this._drainPromise;
    // Set the lock before a sender can synchronously enqueue another record.
    this._drainPromise = Promise.resolve().then(() => this._drain(sendFn, batchSize, key)).finally(() => { this._drainPromise = null; });
    return this._drainPromise;
  }

  async _drain(sendFn, batchSize, key) {
    let raw;
    try {
      raw = fs.readFileSync(this._filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return; // queue file not yet created
      throw err;
    }

    const lines = raw.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return;

    const hmacKey = this._getHmacKey();
    const keepLines = [];
    let batch = [], batchKey = null, stopped = false;
    const flush = async () => {
      if (!batch.length) return;
      try { if (await sendFn(batch.map(item => item.entry)) === false) keepLines.push(...batch.map(item => item.line)); }
      catch { stopped = true; keepLines.push(...batch.map(item => item.line)); }
      batch = []; batchKey = null;
    };

    for (const line of lines) {
      if (stopped) {
        keepLines.push(line);
        continue;
      }

      // Parse
      let entry;
      try {
        entry = JSON.parse(line);
      } catch (_) {
        this._logger.warn('[offline-queue] unparseable record retained for inspection');
        keepLines.push(line);
        continue;
      }

      const { id, ts, payload, hmac } = entry;

      // Verify HMAC
      if (!this._verifyHmac({ id, ts, payload }, hmac, hmacKey)) {
        this._logger.warn('[offline-queue] HMAC mismatch, keeping line for inspection — id:', id);
        keepLines.push(line);
        continue;
      }

      const group = key(payload);
      if (batch.length && (batchKey !== group || batch.length >= batchSize)) await flush();
      if (stopped) { keepLines.push(line); continue; }
      batchKey = group; batch.push({ line, entry: { id, ts, payload } });
      if (batch.length >= batchSize) await flush();
    }
    await flush();

    if (keepLines.length === lines.length) return;
    // enqueue() may have appended while sendFn awaited the network. Preserve
    // that suffix; refuse to overwrite a file another writer has replaced.
    const current = fs.readFileSync(this._filePath, 'utf8');
    if (!current.startsWith(raw)) throw new Error('Offline queue changed during drain; retaining records');
    const content = (keepLines.length ? keepLines.join('\n') + '\n' : '') + current.slice(raw.length);
    const temporary = this._filePath + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, this._filePath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  /**
   * Truncate the queue file. Call only after confirmed server-side acknowledgement
   * of all events (e.g. after the server returns an ack for the full batch).
   */
  clear() {
    if (this._drainPromise) throw new Error('Cannot clear the offline queue during delivery');
    try {
      fs.writeFileSync(this._filePath, '', 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  getPendingCount() {
    try { return fs.readFileSync(this._filePath, 'utf8').split('\n').filter(line => line.trim()).length; }
    catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  _getHmacKey() {
    if (!this._hmacKey) {
      // Key derivation: HMAC of the derivation label, keyed with nodeToken.
      // Result is a 32-byte Buffer — never stored, derived fresh on first use.
      this._hmacKey = crypto
        .createHmac('sha256', this._nodeToken)
        .update('esportra-air-offline-queue-v1')
        .digest();
    }
    return this._hmacKey;
  }

  _signEntry({ id, ts, payload }) {
    const hmacKey = this._getHmacKey();
    return crypto
      .createHmac('sha256', hmacKey)
      .update(JSON.stringify({ id, ts, payload }))
      .digest('hex');
  }

  _verifyHmac({ id, ts, payload }, hmac, hmacKey) {
    try {
      const expected = crypto
        .createHmac('sha256', hmacKey)
        .update(JSON.stringify({ id, ts, payload }))
        .digest('hex');
      // Use timingSafeEqual to prevent timing-based inference of HMAC value.
      const expectedBuf = Buffer.from(expected, 'hex');
      const actualBuf = Buffer.from(hmac, 'hex');
      return (
        expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf)
      );
    } catch (_) {
      return false;
    }
  }

  _generateId() {
    return crypto.randomUUID();
  }
}

module.exports = OfflineQueue;
