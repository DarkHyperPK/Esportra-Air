'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
class OfflineQueue {
  /**
   * @param {object} opts
   * @param {string} opts.nodeToken - Secret token used to derive the HMAC key.
   *   Never stored in the queue file.
   * @param {{ info: fn, warn: fn, error: fn }} [opts.logger]
   */
  constructor({ nodeToken, logger = console }) {
    this._nodeToken = nodeToken;
    this._logger = logger;
    this._filePath = path.join(app.getPath('userData'), 'offline-queue.ndjson');
    // Lazy — computed on first use so the constructor never touches crypto.
    this._hmacKey = null;
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
   * @param {(payload: object) => Promise<void>} sendFn
   *   Must throw on failure (e.g. hub disconnected).
   */
  async drain(sendFn) {
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
    let stopped = false;

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
        this._logger.warn('[offline-queue] unparseable line, keeping for inspection:', line.slice(0, 80));
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

      // Send
      try {
        await sendFn(payload);
        // Success: do NOT add to keepLines — this line is delivered.
      } catch (err) {
        // Stop drain; this line and all subsequent remain on disk.
        stopped = true;
        keepLines.push(line);
      }
    }

    // Rewrite file with only undelivered + integrity-failed lines.
    const content = keepLines.length > 0 ? (keepLines.join('\n') + '\n') : '';
    fs.writeFileSync(this._filePath, content, 'utf8');
  }

  /**
   * Truncate the queue file. Call only after confirmed server-side acknowledgement
   * of all events (e.g. after the server returns an ack for the full batch).
   */
  clear() {
    try {
      fs.writeFileSync(this._filePath, '', 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
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
    // nodePrefix: first 8 hex chars of sha256(nodeToken) — ensures IDs are
    // globally unique per node even under clock collision between nodes.
    const nodePrefix = crypto
      .createHash('sha256')
      .update(this._nodeToken)
      .digest('hex')
      .slice(0, 8);
    const randomHex6 = Math.random().toString(36).slice(2, 8);
    return `${nodePrefix}-${Date.now()}-${randomHex6}`;
  }
}

module.exports = OfflineQueue;
