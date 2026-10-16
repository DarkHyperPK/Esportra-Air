'use strict';
const { EventEmitter } = require('events');
const crypto = require('crypto');
const signalR = require('@microsoft/signalr');
const fetch = require('node-fetch');
const { REMOTE_EVENT_TYPES } = require('./broadcast-events');

// Reconnect delays: 1 s, 2 s, 4 s, 8 s, then cap at 10 s.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 10000];
const HEARTBEAT_INTERVAL_MS = 2000;
const DRAIN_INTERVAL_MS = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validSponsorProof(payload) {
  const impression = payload?.impression;
  return payload?.type === 'SponsorProof' && UUID.test(payload.showId || '') && impression &&
    UUID.test(impression.sponsorId || '') && (!impression.segmentId || UUID.test(impression.segmentId)) &&
    ['lower_third', 'scorebug', 'break_fullscreen', 'custom'].includes(impression.slotType) &&
    Number.isFinite(Date.parse(impression.startedAt)) && (!impression.endedAt || Number.isFinite(Date.parse(impression.endedAt)) && Date.parse(impression.endedAt) >= Date.parse(impression.startedAt));
}

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
 * Outbound:  Durable records use acknowledged HTTP drains while connected.
 * Heartbeat: Direct NodeHeartbeat invoke every 2 s — NOT queued.
 *
 * Emits: 'connected', 'disconnected', 'reconnecting', 'error'
 */
class HubClient extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.hubUrl - HTTP(S) BroadcastHub endpoint; legacy WS(S) is normalized.
   * @param {string} [opts.apiBase] - Platform API origin/base path.
   * @param {object} opts.offlineQueue - OfflineQueue instance (required).
   * @param {{ info: fn, warn: fn, error: fn }} [opts.logger]
   * @param {() => object} [opts.statusProvider]
   *   Optional callback invoked every 2 s for the heartbeat payload.
   *   Expected shape: { mode, hudOnline, gepActive, lanRelayActive, appVersion }
   */
  constructor({ hubUrl, apiBase, offlineQueue, logger = console, statusProvider = null }) {
    super();
    this._hubUrl = hubUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    this._apiBase = (apiBase || this._hubUrl.replace(/\/hubs\/broadcast\/?$/, '')).replace(/\/$/, '');
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
    this._initialRetryTimer = null;
    this._initialRetryCount = 0;
    this._drainTimer = null;
    this._stopped = false;
    this._retainedTypes = new Set();
    this._queueListener = () => { if (this._connected) this._drainQueue(); };
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
    this._stopped = false;
    this._offlineQueue.on?.('enqueue', this._queueListener);
    this._nodeToken = nodeToken;
    this._connection = this._buildConnection(nodeToken);
    this._startConnection();
  }

  /**
   * Graceful disconnect. Stops heartbeat. Does not clear the offline queue.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._stopped = true;
    clearTimeout(this._initialRetryTimer);
    this._initialRetryTimer = null;
    this._offlineQueue.removeListener?.('enqueue', this._queueListener);
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
    conn.on('NodeRevoked', () => { if (!this._stopped) this.emit('revoked'); });

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
    const connection = this._connection;
    if (this._stopped || !connection) return;
    connection.start()
      .then(() => { if (this._connection === connection) this._onConnected(); })
      .catch(err => {
        if (this._stopped || this._connection !== connection) return;
        this._connected = false;
        this.emit('disconnected', err);
        if (this.listenerCount('error')) this.emit('error', err);
        this._logger.error('[hub-client] Initial connection failed:', err.message);
        const delay = RETRY_DELAYS_MS[Math.min(this._initialRetryCount++, RETRY_DELAYS_MS.length - 1)];
        this._initialRetryTimer = setTimeout(() => {
          this._initialRetryTimer = null;
          this._startConnection();
        }, delay);
      });
  }

  /** Shared logic executed on both initial connect and each automatic reconnect. */
  _onConnected() {
    if (this._stopped) return;
    this._initialRetryCount = 0;
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
    this._drainTimer = setInterval(() => this._drainQueue(), DRAIN_INTERVAL_MS);
  }

  _stopHeartbeat() {
    clearInterval(this._drainTimer);
    this._drainTimer = null;
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
      runtime: s.runtime || null,
      ts: Date.now(),
    };
    this._connection.invoke('NodeHeartbeat', payload).catch(err => {
      // Non-fatal — the next heartbeat fires in 2 s.
      this._logger.warn('[hub-client] Heartbeat invoke failed:', err.message);
    });
  }

  // ── Private: queue drain ────────────────────────────────────────────────────

  _drainQueue() {
    if (!this._connected || !this._nodeToken) return Promise.resolve();
    const token = this._nodeToken;
    if (typeof this._offlineQueue.drainBatches === 'function') {
      return this._offlineQueue.drainBatches(records => this._sendQueueBatch(records, token), { key: payload => {
        if (validSponsorProof(payload)) return 'sponsor:' + payload.showId;
        if (payload.type === 'ResultProposal') return 'proposal:' + payload.showId;
        if (payload.type === 'BroadcastCorrection' && UUID.test(payload.showId || '') && UUID.test(payload.idempotencyKey || '')) return 'correction:' + payload.showId;
        const entry = payload.type === 'BroadcastEvent' ? payload.event || {} : payload;
        return REMOTE_EVENT_TYPES.has(entry.type) && UUID.test(entry.showId || '') ? 'event:' + entry.showId + (['ProductionAction','ProductionIncident','RoundStarted','RoundEnded'].includes(entry.type) ? ':metadata:' + entry.type : ':legacy') : 'retain';
      } }).catch(error => this._logger.warn('[hub-client] Batch delivery failed:', error.message));
    }
    return this._offlineQueue.drain(async (payload, metadata = {}) => {
      if (!this._connected || this._nodeToken !== token) throw new Error('Platform connection changed');
      if (payload.type === 'SponsorProof') {
        if (!validSponsorProof(payload)) return false;
        const response = await this._post(`/api/broadcast/shows/${payload.showId}/sponsor-impressions`, { impressions: [payload.impression] }, token);
        return response.acknowledged === 1 || response.accepted === 1;
      }
      if (payload.type === 'BroadcastCorrection') {
        // Older records lack showId: keep them rather than assign a later show.
        if (!UUID.test(payload.showId || '') || !UUID.test(payload.idempotencyKey || '')) return false;
        const correction = {
          matchCode: payload.matchCode, mapIndex: payload.mapIndex,
          teamAScore: payload.teamAScore, teamBScore: payload.teamBScore,
          reason: payload.reason, idempotencyKey: payload.idempotencyKey,
          ts: new Date(payload.ts ?? metadata.ts).toISOString(),
        };
        const response = await this._post(`/api/broadcast/shows/${payload.showId}/corrections`, { corrections: [correction] }, token);
        return response.inserted === 1;
      }
      if (payload.type === 'ResultProposal') return this._deliverResultProposal(payload, token);
      const isBroadcastEvent = payload.type === 'BroadcastEvent';
      const entry = isBroadcastEvent ? (payload.event || {}) : payload;
      if (!REMOTE_EVENT_TYPES.has(entry.type)) {
        if (!this._retainedTypes.has(entry.type)) {
          this._retainedTypes.add(entry.type);
          this._logger.warn('[hub-client] Unsupported event retained locally:', entry.type);
        }
        return false;
      }
      if (!metadata.id) return false;
      // Legacy events without original-show context cannot be safely reassigned.
      if (!UUID.test(entry.showId || '')) return false;
      const eventId = UUID.test(metadata.id) ? metadata.id : this._legacyEventId(metadata.id);
      const response = await this._post(`/api/broadcast/shows/${entry.showId}/events/drain`, { events: [{
        eventId, eventType: entry.type, payload: entry.data || {},
        ts: new Date(entry.ts ?? metadata.ts).toISOString(),
      }] }, token);
      return response.accepted === 1 && response.rejected === 0;
    }).catch(err => {
      this._logger.warn('[hub-client] Queue drain error:', err.message);
    });
  }

  async _sendQueueBatch(records, token) {
    if (!this._connected || this._nodeToken !== token) throw new Error('Platform connection changed');
    const first = records[0].payload;
    if (first.type === 'ResultProposal') {
      for (const { payload } of records) if (!await this._deliverResultProposal(payload, token)) return false;
      return true;
    }
    if (first.type === 'SponsorProof') {
      if (!records.every(({ payload }) => validSponsorProof(payload) && payload.showId === first.showId)) return false;
      // Proof API accepts at most 50 records; keep the queue's original batch identities.
      for (let index = 0; index < records.length; index += 50) {
        const impressions = records.slice(index, index + 50).map(({ payload }) => payload.impression);
        const result = await this._post(`/api/broadcast/shows/${first.showId}/sponsor-impressions`, { impressions }, token);
        if (result.acknowledged !== impressions.length && result.accepted !== impressions.length) return false;
      }
      return true;
    }
    if (first.type === 'BroadcastCorrection') {
      if (!UUID.test(first.showId || '') || !records.every(({ payload }) => UUID.test(payload.idempotencyKey || ''))) return false;
      const corrections = records.map(({ payload, ts }) => ({ matchCode: payload.matchCode, mapIndex: payload.mapIndex, teamAScore: payload.teamAScore, teamBScore: payload.teamBScore, reason: payload.reason, idempotencyKey: payload.idempotencyKey, ts: new Date(payload.ts ?? ts).toISOString() }));
      const result = await this._post(`/api/broadcast/shows/${first.showId}/corrections`, { corrections }, token);
      return result.inserted === corrections.length;
    }
    const entry = first.type === 'BroadcastEvent' ? first.event || {} : first;
    if (!UUID.test(entry.showId || '') || !REMOTE_EVENT_TYPES.has(entry.type)) return false;
    const events = records.map(({ payload, id, ts }) => {
      const event = payload.type === 'BroadcastEvent' ? payload.event : payload;
      return { eventId: UUID.test(id) ? id : this._legacyEventId(id), eventType: event.type, payload: event.data || {}, ts: new Date(event.ts ?? ts).toISOString() };
    });
    const result = await this._post(`/api/broadcast/shows/${entry.showId}/events/drain`, { events }, token);
    return result.accepted === events.length && result.rejected === 0;
  }

  async _deliverResultProposal(payload, token) {
    if (!UUID.test(payload.showId || '') || !UUID.test(payload.matchId || '') || !UUID.test(payload.idempotencyKey || '') ||
        !UUID.test(payload.team1Id || '') || !UUID.test(payload.team2Id || '')) return false;
    const result = await this._post(`/api/broadcast/nodes/shows/${payload.showId}/result-proposals`, {
      clientKey: payload.idempotencyKey, nodeId: payload.nodeId, matchId: payload.matchId, matchCode: payload.matchCode,
      team1Id: payload.team1Id, team2Id: payload.team2Id, bestOf: payload.bestOf,
      mapNumber: payload.mapIndex, teamAScore: payload.teamAScore, teamBScore: payload.teamBScore, reason: payload.reason.trim(),
    }, token);
    return UUID.test(result.proposalId || '') && ['pending', 'applied', 'rejected'].includes(result.status);
  }

  async _post(route, body, token) {
    const response = await fetch(this._apiBase + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), timeout: 10000, redirect: 'error',
    });
    if (!response.ok) throw new Error(`Queue delivery failed (HTTP ${response.status})`);
    return response.json();
  }

  _legacyEventId(id) {
    // Stable custom UUID for old HMAC-protected non-UUID queue identities.
    const bytes = crypto.createHash('sha256').update(id).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

module.exports = HubClient;
