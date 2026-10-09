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
});
