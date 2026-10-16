'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('esportraBroadcast', {
  shortcuts: {
    get: () => ipcRenderer.invoke('SHORTCUTS_GET'),
    set: (bindings) => ipcRenderer.invoke('SHORTCUTS_SET', bindings),
  },
  rules: { get: () => ipcRenderer.invoke('RULES_GET'), set: (durations) => ipcRenderer.invoke('RULES_SET', durations) },
  graphics: { fire: (kind, input) => ipcRenderer.invoke('GRAPHIC_FIRE', { kind, input }) },
  hudControls: { get:()=>ipcRenderer.invoke('HUD_CONTROLS_GET'), update:input=>ipcRenderer.invoke('HUD_CONTROLS_UPDATE',input) },
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
  displayFixes: {
    get: () => ipcRenderer.invoke('DISPLAY_FIX_GET'),
    change: input => ipcRenderer.invoke('DISPLAY_FIX_CHANGE', input),
  },
  pauseRules: { get: () => ipcRenderer.invoke('PAUSE_RULES_GET'), set: input => ipcRenderer.invoke('PAUSE_RULES_SET', input) },
  // Broadcast GEP controls — user must explicitly start broadcast mode
  broadcast: {
    getStatus: () => ipcRenderer.invoke('BROADCAST_STATUS'),
    start: (opts) => ipcRenderer.invoke('START_BROADCAST', opts),
    stop: () => ipcRenderer.invoke('STOP_BROADCAST'),
    marker: (kind) => ipcRenderer.invoke('CAPTURE_MARKER', kind),
    onStatusChange: (cb) => ipcRenderer.on('BROADCAST_STATUS_CHANGED', (_e, data) => cb(data)),
  },
  // P0: Air node management surface
  projects: {
    openSignup:()=>ipcRenderer.invoke('AIR_SIGNUP_OPEN'),
    session:()=>ipcRenderer.invoke('AIR_SESSION_GET'),
    login:(email,password)=>ipcRenderer.invoke('AIR_LOGIN',{email,password}),
    logout:()=>ipcRenderer.invoke('AIR_LOGOUT'),
    checkAccess:()=>ipcRenderer.invoke('AIR_ACCESS_REFRESH'),
    list:workspaceId=>ipcRenderer.invoke('AIR_PROJECTS_LIST',{workspaceId}),
    get:id=>ipcRenderer.invoke('AIR_PROJECT_GET',{id}),
    create:(workspaceId,title)=>ipcRenderer.invoke('AIR_PROJECT_CREATE',{workspaceId,title}),
    save:project=>ipcRenderer.invoke('AIR_PROJECT_SAVE',project),
    resolve:(id,choice)=>ipcRenderer.invoke('AIR_PROJECT_RESOLVE',{id,choice}),
    sync:()=>ipcRenderer.invoke('AIR_SYNC'),
    select:(projectId,matchId)=>ipcRenderer.invoke('AIR_PROJECT_SELECT',{projectId,matchId}),
    upload:workspaceId=>ipcRenderer.invoke('AIR_ASSET_UPLOAD',{workspaceId}),
    tournament:()=>ipcRenderer.invoke('AIR_RESTORE_TOURNAMENT'),
  },
  air: {
    getBracket:()=>ipcRenderer.invoke('BRACKET_GET'),
    setBracketView:input=>ipcRenderer.invoke('BRACKET_VIEW_SET',input),
    getMatchDay: () => ipcRenderer.invoke('MATCH_DAY_GET'),
    setPlayerPreference: input => ipcRenderer.invoke('PLAYER_PREFERENCE_SET', input),
    clearPackets: () => ipcRenderer.invoke('PACKETS_CLEAR'),
    testObserver: input => ipcRenderer.invoke('OBSERVER_TEST', input),
    // Exchange an organizer-generated pairing code for a node registration.
    // Returns { ok, nodeId?, error? } — the token is NEVER returned.
    pair: (pairingCode) => ipcRenderer.invoke('PAIR', { pairingCode }),
    // Full status snapshot: mode, paired state, hub and HUD online, GEP active.
    getStatus: () => ipcRenderer.invoke('GET_STATUS'),
    getHistory: () => ipcRenderer.invoke('PRODUCTION_HISTORY'),
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
    connect: (host, port, password, allowRemote) =>
      ipcRenderer.invoke('OBS_CONNECT', { host, port, password, allowRemote }),
    discover: () => ipcRenderer.invoke('OBS_DISCOVER'),
    // Disconnect. Returns { ok }.
    disconnect: () => ipcRenderer.invoke('OBS_DISCONNECT'),
    // Current state snapshot. Returns { connected, state, studioMode, tally }.
    getStatus: () => ipcRenderer.invoke('OBS_GET_STATUS'),
    getSetup: () => ipcRenderer.invoke('OBS_GET_SETUP'),
    getTemplate: () => ipcRenderer.invoke('TEMPLATE_GET'),
    saveTemplate: draft => ipcRenderer.invoke('TEMPLATE_SAVE', draft),
    pushTemplate: draft => ipcRenderer.invoke('TEMPLATE_PUSH', draft),
    buildCollection: () => ipcRenderer.invoke('OBS_BUILD_COLLECTION'),
    getSlots: () => ipcRenderer.invoke('OBS_SLOT_STATUS'),
    assignSlot: (slotId, sourceName) => ipcRenderer.invoke('OBS_SLOT_ASSIGN', { slotId, sourceName }),
    setSetup: (rows) => ipcRenderer.invoke('OBS_SET_SETUP', rows),
    // Build ESA_ scenes with browser sources. Returns { ok, created, existing, error? }.
    buildScenes: (outputUrls) =>
      ipcRenderer.invoke('OBS_BUILD_SCENES', { outputUrls }),
    // Studio-mode-aware scene take. Returns { ok, latencyMs, scene, error? }.
    take: (sceneName, transition) => ipcRenderer.invoke('OBS_TAKE', { sceneName, transition }),
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
    timeout: (active) => ipcRenderer.invoke('RUNNER_TIMEOUT', active),
    sponsorSlot: (input) => ipcRenderer.invoke('RUNNER_SPONSOR_SLOT', input),
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

  // Isolated operator rehearsal; packaged sample only, no arbitrary file access.
  simulation: {
    start: () => ipcRenderer.invoke('SIMULATION_START'),
    getStatus: () => ipcRenderer.invoke('SIMULATION_STATUS'),
    control: (input) => ipcRenderer.invoke('SIMULATION_CONTROL', input),
    stop:  ()                => ipcRenderer.invoke('SIMULATION_STOP'),
  },
});
