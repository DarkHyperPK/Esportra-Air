'use strict';

// lan-relay.js — LAN WebSocket relay: bridges ow-electron GEP capture (observer
// node) to production node consumers over a trusted operator LAN.
//
// Observer mode:  opens ws.Server on 0.0.0.0:{port}
//   Loopback connections (127.0.0.1 / ::1) → GEP source (ow-electron)
//   Non-loopback connections                → production node consumers
//
// Production mode: connects ws.WebSocket to each target observer
//   Receives gep_state packets, calls onGepState(payload) callback

const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');

const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 5_000;
const GEP_WINDOW_SEC = 5;
const GEP_WINDOW_MS = GEP_WINDOW_SEC * 1_000;

/** Returns true for all IPv4/IPv6 loopback representations. */
function isLoopback(addr) {
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr.startsWith('::ffff:127.')
  );
}

class LanRelay {
  /**
   * @param {object} opts
   * @param {'observer'|'production'} opts.mode
   * @param {number}   [opts.port=5301]           Observer mode only
   * @param {string[]} [opts.targets=[]]           Production mode only
   * @param {object}   [opts.logger=console]
   * @param {Function} [opts.onGepState]           Production mode only
   */
  constructor(opts = {}) {
    const { mode, port = 5301, targets = [], logger = console, onGepState, sharedKey, targetKeys = {} } = opts;

    if (mode !== 'observer' && mode !== 'production') {
      throw new Error(`LanRelay: mode must be 'observer' or 'production', got '${mode}'`);
    }

    this._mode = mode;
    this._port = port;
    this._targets = targets;
    this._sharedKey = sharedKey || '';
    this._targetKeys = targetKeys;
    this._logger = logger;
    this._onGepState = typeof onGepState === 'function' ? onGepState : () => {};
    this._stopped = false;

    // Observer-mode state
    this._wss = null;
    this._listening = false;
    this._pingInterval = null;
    this._gepTimestamps = []; // epoch-ms timestamps in the sliding GEP window

    // Production-mode state — one entry per target
    // { target, ws, connected, reconnectTimer, pingInterval }
    this._clients = [];
    this._lastReceivedAt = null;
    this._streamId = crypto.randomUUID(); this._sequence = 0;
    this._buffer = new (require('./capture-window'))();
    this._onMarker = typeof opts.onMarker === 'function' ? opts.onMarker : () => {};
    this._ackTimes = [];
  }

  /** Open the server (observer) or connect to observers (production). */
  start() {
    if (this._mode === 'observer') {
      this._startObserver();
    } else {
      this._startProduction();
    }
  }

  /** Gracefully close all connections and timers. */
  stop() {
    this._stopped = true;
    this._listening = false;
    if (this._mode === 'observer') {
      this._stopObserver();
    } else {
      this._stopProduction();
    }
  }

  /**
   * Observer: { listening, port, consumerCount, gepMessagesPerSec }
   * Production: { targetCount, connectedCount, lastReceivedAt }
   */
  getStatus() {
    if (this._mode === 'observer') {
      return {
        listening: this._listening,
        port: this._port,
        consumerCount: this._consumerCount(),
        gepMessagesPerSec: this._gepMessagesPerSec(),
        ...this._buffer.status(),
        buffering: this._consumerCount() === 0 && this._buffer.status().retainedMessages > 0,
        ackLatencyMs: this._medianAckLatency(),
      };
    }
    return {
      targetCount: this._targets.length,
      connectedCount: this._clients.filter(c => c.connected).length,
      lastReceivedAt: this._lastReceivedAt,
    };
  }

  // ── Observer mode ─────────────────────────────────────────────────────────────

  _startObserver() {
    const wss = new WebSocketServer({ host: '0.0.0.0', port: this._port, maxPayload: 512 * 1024,
      verifyClient: ({ req }) => this._authorize(req) });
    this._wss = wss;

    wss.on('listening', () => {
      this._port = wss.address().port;
      this._listening = true;
      this._logger.info(`[LanRelay] Observer listening on 0.0.0.0:${this._port}`);
    });

    wss.on('error', (err) => {
      this._listening = false;
      this._logger.error('[LanRelay] Server error:', err.message);
    });

    wss.on('connection', (ws, req) => {
      const remoteAddr = req.socket.remoteAddress || '';
      const gepSource = isLoopback(remoteAddr) && !req.headers['x-esportra-relay-key'];
      ws.isAlive = true;
      ws._isGepSource = gepSource;

      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('error', (err) => {
        this._logger.warn(`[LanRelay] WS error (${gepSource ? 'gep' : 'consumer'}):`, err.message);
      });

      if (gepSource) {
        this._logger.info('[LanRelay] GEP source connected (loopback)');
        ws.on('message', (raw) => this._handleGepMessage(raw));
        ws.on('close', () => this._logger.info('[LanRelay] GEP source disconnected'));
      } else {
        ws.on('message', raw => {
          let hello; try { hello = JSON.parse(String(raw)); } catch (_) { return; }
          if (hello.type === 'relay_ack' && hello.streamId === this._streamId) {
            if (!Number.isInteger(hello.sequence) || hello.sequence < 0 || hello.sequence > this._sequence) return;
            this._buffer.acknowledge(hello.sequence);
            const capturedAt = this._buffer.capturedAt(hello.sequence);
            if (capturedAt !== null && hello.recovered !== true) this._ackTimes.push({ at: Date.now(), ms: Math.max(0, Date.now() - capturedAt) });
            return;
          }
          if (hello.type !== 'consumer_hello') return;
          const after = Number.isInteger(hello.lastSequence) ? hello.lastSequence : 0;
          for (const packet of this._buffer.since(after, hello.streamId)) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(packet));
          ws._consumerReady = true;
        });
        this._logger.info(`[LanRelay] Production node consumer connected from ${remoteAddr}`);
        ws.on('close', () => {
          this._logger.info(`[LanRelay] Consumer disconnected (${remoteAddr})`);
        });
      }
    });

    this._pingInterval = setInterval(() => this._pingObserverClients(), PING_INTERVAL_MS);
  }

  _authorize(req) {
    // Browser origins cannot masquerade as the loopback capture child.
    if (req.headers.origin) return false;
    if (isLoopback(req.socket.remoteAddress || '') && !req.headers['x-esportra-relay-key']) return true;
    const provided = req.headers['x-esportra-relay-key'];
    if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/i.test(this._sharedKey) || !/^[a-f0-9]{64}$/i.test(provided)) return false;
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(this._sharedKey, 'hex'));
  }

  _pingObserverClients() {
    if (!this._wss) return;
    for (const ws of this._wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }

  _stopObserver() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
    if (this._wss) {
      this._wss.clients.forEach(ws => ws.terminate());
      this._wss.close(() => {});
      this._wss = null;
    }
  }

  /**
   * Parse an incoming GEP source message in HUD WS protocol format:
   *   { type: 'valorant', message: { ...raw GEP state... } }
   * Extract `message` and broadcast to all production node consumers.
   */
  _handleGepMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      this._logger.debug?.('[LanRelay] GEP source sent non-JSON, skipping');
      return;
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.type !== 'valorant' ||
      !parsed.message
    ) {
      this._logger.debug?.('[LanRelay] GEP message not in HUD protocol format, skipping');
      return;
    }

    // Track for sliding-window rate
    this._gepTimestamps.push(Date.now());

    const packet = {
      type: 'gep_state',
      payload: parsed.message,
      matchCode: typeof parsed.match === 'string' ? parsed.match.toUpperCase() : 'MAIN',
      showId: typeof parsed.showId === 'string' ? parsed.showId : null,
      ts: Date.now() - (Number.isFinite(parsed.bufferedAgeMs) ? Math.max(0, Math.min(60000, parsed.bufferedAgeMs)) : 0),
      recovered: parsed.recovered === true,
      bufferedAgeMs: Number.isFinite(parsed.bufferedAgeMs) ? Math.max(0, Math.min(60000, parsed.bufferedAgeMs)) : 0,
      streamId: this._streamId, sequence: ++this._sequence,
    };

    this._buffer.push(packet); this._broadcastToConsumers(JSON.stringify(packet));
  }

  sendMarker(kind, context) {
    if (this._mode !== 'observer' || !['replay', 'flag'].includes(kind)) throw new Error('Choose a supported observer marker.');
    const packet = { type: 'observer_marker', kind, matchCode: context.matchCode || 'MAIN', showId: context.showId || null, ts: Date.now(), streamId: this._streamId, sequence: ++this._sequence };
    this._buffer.push(packet); this._broadcastToConsumers(JSON.stringify(packet)); return packet;
  }

  _broadcastToConsumers(envelope) {
    if (!this._wss) return;
    for (const ws of this._wss.clients) {
      if (!ws._isGepSource && ws._consumerReady && ws.readyState === WebSocket.OPEN) {
        ws.send(envelope);
      }
    }
  }

  _consumerCount() {
    if (!this._wss) return 0;
    let n = 0;
    for (const ws of this._wss.clients) {
      if (!ws._isGepSource && ws._consumerReady && ws.readyState === WebSocket.OPEN) n++;
    }
    return n;
  }

  /**
   * Sliding 5-second average: count messages in the last 5s divided by 5.
   * Prunes stale timestamps on every read.
   */
  _gepMessagesPerSec() {
    const cutoff = Date.now() - GEP_WINDOW_MS;
    while (this._gepTimestamps.length > 0 && this._gepTimestamps[0] < cutoff) {
      this._gepTimestamps.shift();
    }
    return this._gepTimestamps.length / GEP_WINDOW_SEC;
  }
  _medianAckLatency() {
    this._ackTimes = this._ackTimes.filter(sample => Date.now() - sample.at < 60000).slice(-1000);
    const values = this._ackTimes.map(sample => sample.ms).sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  }

  // ── Production mode ───────────────────────────────────────────────────────────

  _startProduction() {
    for (const target of this._targets) {
      const entry = {
        target,
        ws: null,
        connected: false,
        reconnectTimer: null,
        pingInterval: null,
        lastSequence: 0, streamId: null, dispatch: Promise.resolve(),
      };
      this._clients.push(entry);
      this._connectToObserver(entry);
    }
  }

  _stopProduction() {
    for (const entry of this._clients) {
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
        entry.reconnectTimer = null;
      }
      if (entry.pingInterval) {
        clearInterval(entry.pingInterval);
        entry.pingInterval = null;
      }
      if (entry.ws) {
        try { entry.ws.terminate(); } catch (_) {}
        entry.ws = null;
      }
      entry.connected = false;
    }
  }

  _connectToObserver(entry) {
    if (this._stopped) return;

    const url = `ws://${entry.target}`;
    this._logger.info(`[LanRelay] Connecting to observer at ${url}`);

    let ws;
    try {
      ws = new WebSocket(url, { headers: { 'X-Esportra-Relay-Key': this._targetKeys[entry.target] || '' }, maxPayload: 512 * 1024 });
    } catch (err) {
      this._logger.error(`[LanRelay] Failed to create WebSocket for ${url}:`, err.message);
      this._scheduleReconnect(entry);
      return;
    }

    entry.ws = ws;

    ws.on('open', () => {
      entry.connected = true;
      this._logger.info(`[LanRelay] Connected to observer at ${entry.target}`);
      ws.send(JSON.stringify({ type: 'consumer_hello', mode: 'production', streamId: entry.streamId, lastSequence: entry.lastSequence }));
      ws.isAlive = true;
      entry.pingInterval = setInterval(
        () => this._pingProductionClient(ws, entry),
        PING_INTERVAL_MS,
      );
    });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => { entry.dispatch = entry.dispatch.catch(() => {}).then(() => this._handleObserverMessage(raw, entry)).catch(() => ws.terminate()); });

    ws.on('close', (code) => {
      this._logger.warn(`[LanRelay] Observer ${entry.target} disconnected (${code})`);
      this._clearProductionEntry(entry);
      this._scheduleReconnect(entry);
    });

    ws.on('error', (err) => {
      // 'close' fires after 'error'; reconnect is handled there
      this._logger.error(`[LanRelay] Observer ${entry.target} error:`, err.message);
    });
  }

  _pingProductionClient(ws, entry) {
    if (!ws.isAlive) {
      this._logger.warn(`[LanRelay] Observer ${entry.target} missed pong, terminating`);
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }

  _clearProductionEntry(entry) {
    entry.connected = false;
    if (entry.pingInterval) {
      clearInterval(entry.pingInterval);
      entry.pingInterval = null;
    }
    entry.ws = null;
  }

  _scheduleReconnect(entry) {
    if (this._stopped) return;
    this._logger.info(
      `[LanRelay] Reconnecting to ${entry.target} in ${RECONNECT_DELAY_MS / 1000}s`,
    );
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      this._connectToObserver(entry);
    }, RECONNECT_DELAY_MS);
  }

  /**
   * Handle a message from an observer:
   *   { type: 'gep_state', payload: <raw GEP object>, ts: epoch_ms }
   */
  async _handleObserverMessage(raw, entry = {}) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      this._logger.debug?.('[LanRelay] Non-JSON from observer, skipping');
      return;
    }

    if (!parsed || !['gep_state', 'observer_marker'].includes(parsed.type) || (parsed.type === 'gep_state' && !parsed.payload)) {
      this._logger.debug?.('[LanRelay] Unexpected message from observer, skipping');
      return;
    }
    if (parsed.streamId === entry.streamId && Number.isInteger(parsed.sequence) && parsed.sequence <= entry.lastSequence) return;

    this._lastReceivedAt = Date.now();
    try {
      const context = { matchCode: parsed.matchCode || 'MAIN', showId: parsed.showId || null, recovered: parsed.recovered === true, bufferedAgeMs: Number.isFinite(parsed.bufferedAgeMs) ? Math.max(0, Math.min(60000, parsed.bufferedAgeMs)) : 0 };
      if (parsed.type === 'observer_marker') await this._onMarker(parsed, context);
      else await this._onGepState(parsed.payload, context);
      if (Number.isInteger(parsed.sequence)) { entry.lastSequence = parsed.sequence; entry.streamId = parsed.streamId; }
      if (entry.ws?.readyState === WebSocket.OPEN && Number.isInteger(parsed.sequence)) entry.ws.send(JSON.stringify({ type: 'relay_ack', sequence: parsed.sequence, streamId: parsed.streamId, recovered: parsed.recovered === true }));
    } catch (err) {
      this._logger.error('[LanRelay] onGepState callback threw:', err.message);
      throw err;
    }
  }
}

module.exports = LanRelay;
