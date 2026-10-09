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
    // Hub connection lifecycle events (main → renderer push)
    onHubConnected: (cb) => ipcRenderer.on('hub-connected', (_e) => cb()),
    onHubDisconnected: (cb) => ipcRenderer.on('hub-disconnected', (_e) => cb()),
    // ShowConfig pushed from BroadcastHub (safe to expose — no secrets in payload)
    onShowConfig: (cb) => ipcRenderer.on('show-config', (_e, cfg) => cb(cfg)),
  },
});
