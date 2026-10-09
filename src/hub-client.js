'use strict';
const { EventEmitter } = require('events');
const signalR = require('@microsoft/signalr');

// Reconnect delays: 1 s, 2 s, 4 s, 8 s, then cap at 10 s.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 10000];
const HEARTBEAT_INTERVAL_MS = 2000;

// Custom IRetryPolicy — returns null to stop retrying, a number (ms) to keep going.
// This policy retries indefinitely, capping at 10 s.
const RETRY_POLICY = {
  nextRetryDelayInMilliseconds(retryContext) {
    const idx = Math.min(retryContext.previousRetryCount, RETRY_DELAYS_MS.length - 1);
    return RETRY_DELAYS_MS[idx];
  },
};

/**
 * SignalR client for the Esportra Air BroadcastHub (/hubs/broadcast).
 *
 * Auth:      Authorization: Bearer <nodeToken> on the WebSocket upgrade request.
 * Transport: WebSockets only (skipNegotiation: true — no HTTP negotiate step).
 * Outbound:  All events queued via OfflineQueue, drained when connected.
 * Heartbeat: Direct NodeHeartbeat invoke every 2 s — NOT queued.
 *
 * Emits: 'connected', 'disconnected', 'reconnecting', 'error'
 */
class HubClient extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.hubUrl - Full WSS URL of BroadcastHub (e.g. wss://esportra.gg/hubs/broadcast).
   * @param {object} opts.offlineQueue - OfflineQueue instance (required).
   * @param {{ info: fn, warn: fn, error: fn }} [opts.logger]
   * @param {() => object} [opts.statusProvider]
   *   Optional callback invoked every 2 s for the heartbeat payload.
   *   Expected shape: { mode, hudOnline, gepActive, lanRelayActive, appVersion }
   */
  constructor({ hubUrl, offlineQueue, logger = console, statusProvider = null }) {
    super();
    this._hubUrl = hubUrl;
    this._offlineQueue = offlineQueue;
    this._logger = logger;
    this._statusProvider = statusProvider;
    this._connection = null;
    this._nodeToken = null;
    this._heartbeatTimer = null;
    this._connected = false;
    this._commandHandlers = [];
    this._showConfigHandlers = [];
    this._matchContextHandlers = [];
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Build the SignalR connection and start it asynchronously.
   * Emits 'connected' on success, 'error' on initial failure.
   * Automatic reconnect runs in the background on any subsequent drop.
   *
   * @param {string} nodeToken
   */
  connect(nodeToken) {
    this._nodeToken = nodeToken;
    this._connection = this._buildConnection(nodeToken);
    this._startConnection();
  }

  /**
   * Graceful disconnect. Stops heartbeat. Does not clear the offline queue.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._stopHeartbeat();
    if (this._connection) {
      await this._connection.stop();
      this._connection = null;
    }
    this._connected = false;
  }

  /**
   * Enqueue an event in the offline queue, then drain immediately if connected.
   * Ordering and durability are guaranteed by always queuing first.
   * Heartbeats are exempt from this path — they are sent directly.
   *
   * @param {object} event - JSON-serialisable event payload.
   */
  send(event) {
    this._offlineQueue.enqueue(event);
    if (this._connected) {
      this._drainQueue();
    }
  }

  /** Register a handler for Command pushes from the hub. */
  onCommand(handler) { this._commandHandlers.push(handler); }

  /** Register a handler for ShowConfig pushes from the hub. */
  onShowConfig(handler) { this._showConfigHandlers.push(handler); }

  /** Register a handler for MatchContext pushes from the hub. */
  onMatchContext(handler) { this._matchContextHandlers.push(handler); }

  // ── Private: connection setup ───────────────────────────────────────────────

  _buildConnection(nodeToken) {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(this._hubUrl, {
        // Authorization: Bearer sent in the WebSocket upgrade request.
        // skipNegotiation: true requires WebSockets-only transport.
        headers: { Authorization: `Bearer ${nodeToken}` },
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect(RETRY_POLICY)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Inbound hub events (server → node)
    conn.on('ShowConfig', cfg => this._showConfigHandlers.forEach(h => h(cfg)));
    conn.on('MatchContext', ctx => this._matchContextHandlers.forEach(h => h(ctx)));
    conn.on('Command', cmd => this._commandHandlers.forEach(h => h(cmd)));

    // Lifecycle: reconnecting (automatic reconnect is running)
    conn.onreconnecting(err => {
      this._connected = false;
      this._stopHeartbeat();
      this.emit('reconnecting', err);
      this._logger.warn('[hub-client] Reconnecting...', err?.message ?? '');
    });

    // Lifecycle: successfully reconnected
    conn.onreconnected(() => this._onConnected());

    // Lifecycle: permanently closed (stop() called or all retries exhausted)
    conn.onclose(err => {
      this._connected = false;
      this._stopHeartbeat();
      this.emit('disconnected', err);
      this._logger.warn('[hub-client] Connection closed.', err?.message ?? '');
    });

    return conn;
  }

  _startConnection() {
    this._connection.start()
      .then(() => this._onConnected())
      .catch(err => {
        this._connected = false;
        this.emit('error', err);
        this._logger.error('[hub-client] Initial connection failed:', err.message);
      });
  }

  /** Shared logic executed on both initial connect and each automatic reconnect. */
  _onConnected() {
    this._connected = true;
    this._startHeartbeat();
    this.emit('connected');
    this._logger.info('[hub-client] Connected to BroadcastHub.');
    // Drain any events that queued up while disconnected.
    this._drainQueue();
  }

  // ── Private: heartbeat ──────────────────────────────────────────────────────

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _sendHeartbeat() {
    if (!this._connected || !this._connection) return;
    const s = this._statusProvider ? this._statusProvider() : {};
    // HeartbeatPayload accepted by BroadcastHub.cs includes Timestamp + Status.
    // Extra fields are ignored by the server but useful for future telemetry.
    const payload = {
      timestamp: new Date().toISOString(),
      status: 'online',
      mode: s.mode || 'production',
      hudOnline: s.hudOnline ?? false,
      gepActive: s.gepActive ?? false,
      lanRelayActive: s.lanRelayActive ?? false,
      appVersion: s.appVersion || '',
      ts: Date.now(),
    };
    this._connection.invoke('NodeHeartbeat', payload).catch(err => {
      // Non-fatal — the next heartbeat fires in 2 s.
      this._logger.warn('[hub-client] Heartbeat invoke failed:', err.message);
    });
  }

  // ── Private: queue drain ────────────────────────────────────────────────────

  _drainQueue() {
    const conn = this._connection;
    if (!conn) return;
    // Each dequeued payload is sent as a NodeEvent to the hub.
    // If invoke throws (hub disconnected), drain stops; events stay on disk.
    this._offlineQueue.drain(async (payload) => {
      await conn.invoke('NodeEvent', {
        eventType: payload.type || 'unknown',
        data: payload,
      });
    }).catch(err => {
      this._logger.warn('[hub-client] Queue drain error:', err.message);
    });
  }
}

module.exports = HubClient;
