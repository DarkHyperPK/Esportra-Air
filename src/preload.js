'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('esportraBroadcast', {
  hud: {
    getStatus: () => ipcRenderer.invoke('HUD_STATUS'),
    getOverlayList: () => ipcRenderer.invoke('HUD_OVERLAY_LIST'),
    previewOverlay: (url) => ipcRenderer.invoke('PREVIEW_OVERLAY', { url }),
    // Event subscriptions (main → renderer push)
    onHudPersistentError: (cb) => ipcRenderer.on('HUD_PERSISTENT_ERROR', (_e, data) => cb(data)),
    onHudRestarted: (cb) => ipcRenderer.on('HUD_RESTARTED', () => cb()),
  },
  ops: {
    login: (email, password) => ipcRenderer.invoke('OPS_LOGIN', { email, password }),
    getMatches: () => ipcRenderer.invoke('OPS_GET_MATCHES'),
    selectMatch: (tournamentSlug, matchId) => ipcRenderer.invoke('OPS_SELECT_MATCH', { tournamentSlug, matchId }),
  },
  manual: {
    patch: (patch) => ipcRenderer.invoke('MANUAL_PATCH', { patch }),
  },
  // Broadcast GEP controls — user must explicitly start broadcast mode
  broadcast: {
    getStatus: () => ipcRenderer.invoke('BROADCAST_STATUS'),
    start: (opts) => ipcRenderer.invoke('START_BROADCAST', opts),
    stop: () => ipcRenderer.invoke('STOP_BROADCAST'),
    onStatusChange: (cb) => ipcRenderer.on('BROADCAST_STATUS_CHANGED', (_e, data) => cb(data)),
  },
  // P0: Air node management surface
  air: {
    // Exchange an organizer-generated pairing code for a node registration.
    // Returns { ok, nodeId?, error? } — the token is NEVER returned.
    pair: (pairingCode) => ipcRenderer.invoke('PAIR', { pairingCode }),
    // Full status snapshot: mode, paired state, hub and HUD online, GEP active.
    getStatus: () => ipcRenderer.invoke('GET_STATUS'),
    // Returns the browser-source URL for a named overlay (no secrets in the URL).
    copyOutputUrl: (overlayName, matchCode) => ipcRenderer.invoke('COPY_OUTPUT_URL', { overlayName, matchCode }),
    // Persist a node mode change. Requires app restart — returns { ok, restartRequired }.
    setMode: (mode) => ipcRenderer.invoke('SET_MODE', { mode }),
    restart: () => ipcRenderer.invoke('RESTART_AIR'),
    addOutput: (input) => ipcRenderer.invoke('OUTPUT_ADD', input),
    removeOutput: (id) => ipcRenderer.invoke('OUTPUT_REMOVE', { id }),
    setRelayTargets: (targets, keys) => ipcRenderer.invoke('SET_RELAY_TARGETS', { targets, keys }),
    copyRelayKey: () => ipcRenderer.invoke('COPY_RELAY_KEY'),
    selectShowMatch: (matchCode) => ipcRenderer.invoke('SHOW_SELECT_MATCH', { matchCode }),
    applyPendingShow: () => ipcRenderer.invoke('SHOW_APPLY_PENDING'),
    // Hub connection lifecycle events (main → renderer push)
    onHubConnected: (cb) => { const handler = () => cb(); ipcRenderer.on('hub-connected', handler); return () => ipcRenderer.removeListener('hub-connected', handler); },
    onHubDisconnected: (cb) => { const handler = () => cb(); ipcRenderer.on('hub-disconnected', handler); return () => ipcRenderer.removeListener('hub-disconnected', handler); },
    // ShowConfig pushed from BroadcastHub (safe to expose — no secrets in payload)
    onShowConfig: (cb) => { const handler = (_e, cfg) => cb(cfg); ipcRenderer.on('show-config', handler); return () => ipcRenderer.removeListener('show-config', handler); },
  },

  // P1: Video switcher (OBS / vMix) control surface
  obs: {
    // Connect to OBS WebSocket. Returns { ok, error? }.
    connect: (host, port, password) =>
      ipcRenderer.invoke('OBS_CONNECT', { host, port, password }),
    // Disconnect. Returns { ok }.
    disconnect: () => ipcRenderer.invoke('OBS_DISCONNECT'),
    // Current state snapshot. Returns { connected, state, studioMode, tally }.
    getStatus: () => ipcRenderer.invoke('OBS_GET_STATUS'),
    // Build ESA_ scenes with browser sources. Returns { ok, created, existing, error? }.
    buildScenes: (outputUrls) =>
      ipcRenderer.invoke('OBS_BUILD_SCENES', { outputUrls }),
    // Studio-mode-aware scene take. Returns { ok, latencyMs, scene, error? }.
    take: (sceneName) => ipcRenderer.invoke('OBS_TAKE', { sceneName }),
    // Trigger replay buffer save + ESA_Replay + return. Returns { ok, savedPath?, error? }.
    triggerReplay: (dwellMs) =>
      ipcRenderer.invoke('OBS_TRIGGER_REPLAY', { dwellMs }),

    // ── Push events (main → renderer) ──────────────────────────────────────
    // Each returns an off-function for clean useEffect cleanup.
    onConnected: (cb) => {
      const fn = (_e, info) => cb(info);
      ipcRenderer.on('obs-connected', fn);
      return () => ipcRenderer.removeListener('obs-connected', fn);
    },
    onDisconnected: (cb) => {
      const fn = () => cb();
      ipcRenderer.on('obs-disconnected', fn);
      return () => ipcRenderer.removeListener('obs-disconnected', fn);
    },
    onTally: (cb) => {
      const fn = (_e, tally) => cb(tally);
      ipcRenderer.on('obs-tally', fn);
      return () => ipcRenderer.removeListener('obs-tally', fn);
    },
    onPreviewFrame: (cb) => {
      const fn = (_e, frames) => cb(frames);
      ipcRenderer.on('obs-preview-frame', fn);
      return () => ipcRenderer.removeListener('obs-preview-frame', fn);
    },
  },

  // P2: ShowRunner autopilot control surface
  runner: {
    // Load a segment array and start the rundown.
    loadRundown: (segments) => ipcRenderer.invoke('RUNNER_LOAD_RUNDOWN', { segments }),
    start:       ()          => ipcRenderer.invoke('RUNNER_START'),
    stop:        ()          => ipcRenderer.invoke('RUNNER_STOP'),
    // Operator commands. Returns { ok, error? }.
    hold:      (segmentId)              => ipcRenderer.invoke('RUNNER_HOLD',       { segmentId }),
    skip:      (segmentId)              => ipcRenderer.invoke('RUNNER_SKIP',       { segmentId }),
    take:      (segmentId, commandId)   => ipcRenderer.invoke('RUNNER_TAKE',       { segmentId, commandId }),
    resume:    ()                       => ipcRenderer.invoke('RUNNER_RESUME'),
    techPause: ()                       => ipcRenderer.invoke('RUNNER_TECH_PAUSE'),
    // Push events (main → renderer). Each returns an off-function.
    onState: (cb) => {
      const fn = (_e, state) => cb(state);
      ipcRenderer.on('runner-state', fn);
      return () => ipcRenderer.removeListener('runner-state', fn);
    },
    onEventLogEntry: (cb) => {
      const fn = (_e, entry) => cb(entry);
      ipcRenderer.on('event-log-entry', fn);
      return () => ipcRenderer.removeListener('event-log-entry', fn);
    },
  },

  // P2: On-air score correction
  fixData: (correction) => ipcRenderer.invoke('FIX_DATA', correction),

  // P2: Simulation harness (NODE_ENV=development only)
  simulation: {
    start: (filePath, speed) => ipcRenderer.invoke('SIMULATION_START', { filePath, speed }),
    stop:  ()                => ipcRenderer.invoke('SIMULATION_STOP'),
  },
});
