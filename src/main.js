'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fetch = require('node-fetch');
const keytar = require('keytar');

const NodeConfig   = require('./node-config');
const HubClient    = require('./hub-client');
const OfflineQueue = require('./offline-queue');
const matchContext = require('./match-context');
const OBSController  = require('./obs-controller');
const VMixController = require('./vmix-controller');
const { ShowRunner } = require('./show-runner');
const { RulesEngine } = require('./rules-engine');
const EventLogger    = require('./event-logger');
const { fixData }    = require('./fix-data');
const { correctionScope, validateCorrectionScope } = require('./correction-scope');
const OutputRegistry = require('./output-registry');
const { applyRundown: applyPublishedRundown } = require('./rundown-config');
const obsTemplate = require('./obs-template');
const stingerPackage = require('./stinger-package');
const remoteObsAssets = require('./remote-obs-assets');
const { normalizeRundown } = require('./rundown-config');
const { validVersion, publicationDecision, selectedRundown, upcomingDiff } = require('./rundown-publication');
const { selectShowMatch, isProductionActive } = require('./show-selection');
const { TournamentSync, mergeMatchContext, eligibleChoices } = require('./tournament-sync');
let tournamentSync = null;
const { acceptsGep } = require('./gep-route');
const { createGepRouteTracker } = require('./gep-route-tracker');
const { basicScenesForRows } = require('./base-scenes');
const { applyManualAction, manualStateSubset } = require('./manual-controls');
let outputRegistry = null;
const artworkCaches = new Map();
function prepareArtwork(cache) {
  const selected = currentShowConfig;
  const versionKey = selected ? `${selected.source || 'esportra'}:${selected.showId}:${selected.rundownVersion || 0}:${crypto.createHash('sha256').update([...cache.required.keys()].sort().join(',')).digest('hex')}` : null;
  cache.activeSnapshot = null; cache.snapshotError = null;
  return cache.prepare().then(() => {
    if (versionKey && selected === currentShowConfig) {
      try { cache.pinSnapshot(versionKey); } catch (error) { cache.snapshotError = error.message; }
    }
    hudServer?.notifyArtworkReady();
  });
}
function artworkCache() {
  const root = airSession?.store?.root || path.join(app.getPath('userData'), 'legacy-artwork');
  if (!artworkCaches.has(root)) {
    const {ArtworkCache,readCatalog} = require('./artwork-cache');
    const cache = new ArtworkCache(root,{readPrivateAsset:id=>airSession?.store?.root===root?airSession.store.asset(id):null});
    cache.register(readCatalog(getHudRoot()));
    artworkCaches.set(root,cache);
  }
  return artworkCaches.get(root);
}

let configurationState = { applied: false, reason: 'No show configuration received.' };
let pendingRundownConfig = null;
let feedDiagnosticsTimer = null;
const productionFeed = new (require('./production-feed'))();

const { version: APP_VERSION } = require('../package.json');

// ─── Security control C-4: shell.openExternal allowlist ───────────────────────
const ALLOWED_ORIGINS = new Set(['https://esportra.gg', 'https://staging.esportra.gg']);

function isAllowedExternal(href) {
  try {
    const { origin } = new URL(href);
    return ALLOWED_ORIGINS.has(origin);
  } catch (_) { return false; }
}

// ─── IPC command enum — C-3: no dynamic dispatch ──────────────────────────────
const IPC_COMMANDS = Object.freeze({
  PRODUCTION_PROPOSAL_DISCARD:'PRODUCTION_PROPOSAL_DISCARD',PRODUCTION_SAVED_RECORDS:'PRODUCTION_SAVED_RECORDS', PRODUCTION_SAVED_RECORD:'PRODUCTION_SAVED_RECORD', PRODUCTION_SPONSORS: 'PRODUCTION_SPONSORS',
  ARTWORK_STATUS: 'ARTWORK_STATUS', ARTWORK_PREPARE: 'ARTWORK_PREPARE', OBSERVER_PRIMARY_SET:'OBSERVER_PRIMARY_SET', OBSERVER_CONTEXT_ACCEPT:'OBSERVER_CONTEXT_ACCEPT',
  AIR_MATCHES_LIST: 'AIR_MATCHES_LIST', AIR_MATCH_PREPARE: 'AIR_MATCH_PREPARE', AIR_MATCH_ARM: 'AIR_MATCH_ARM', AIR_MATCH_SELECT: 'AIR_MATCH_SELECT', AIR_MATCH_PREVIEW: 'AIR_MATCH_PREVIEW', AIR_MATCH_SESSION: 'AIR_MATCH_SESSION', AIR_MATCH_ROSTER: 'AIR_MATCH_ROSTER',
  PRODUCTION_CREW:'PRODUCTION_CREW', PRODUCTION_CREW_INVITE:'PRODUCTION_CREW_INVITE', PRODUCTION_CREW_REVOKE:'PRODUCTION_CREW_REVOKE',
  PRODUCTION_RESULTS:'PRODUCTION_RESULTS', PRODUCTION_RESULT_PROPOSE:'PRODUCTION_RESULT_PROPOSE', PRODUCTION_RESULT_REVIEW:'PRODUCTION_RESULT_REVIEW',
  PRODUCTION_DETAILS_GET:'PRODUCTION_DETAILS_GET', PRODUCTION_DETAILS_SAVE:'PRODUCTION_DETAILS_SAVE', PRODUCTION_DETAILS_RELOAD:'PRODUCTION_DETAILS_RELOAD', PRODUCTION_ACTIVITY:'PRODUCTION_ACTIVITY', PRODUCTION_INVITATIONS:'PRODUCTION_INVITATIONS', PRODUCTION_INVITATION_ACCEPT:'PRODUCTION_INVITATION_ACCEPT',
  PAUSE_RULES_GET: 'PAUSE_RULES_GET',
  PAUSE_RULES_SET: 'PAUSE_RULES_SET',
  DISPLAY_FIX_GET: 'DISPLAY_FIX_GET',
  DISPLAY_FIX_CHANGE: 'DISPLAY_FIX_CHANGE',
  SHORTCUTS_GET: 'SHORTCUTS_GET',
  SHORTCUTS_SET: 'SHORTCUTS_SET',
  // ── Existing ─────────────────────────────────────────────────────────────
  HUD_STATUS:       'HUD_STATUS',
  HUD_OVERLAY_LIST: 'HUD_OVERLAY_LIST',
  MANUAL_PATCH:     'MANUAL_PATCH',
  MANUAL_GET:       'MANUAL_GET',
  MANUAL_ACTION:    'MANUAL_ACTION',
  PREVIEW_OVERLAY:  'PREVIEW_OVERLAY',
  START_BROADCAST:  'START_BROADCAST',
  CAPTURE_MARKER: 'CAPTURE_MARKER',
  STOP_BROADCAST:   'STOP_BROADCAST',
  BROADCAST_STATUS: 'BROADCAST_STATUS',
  // Observer: pause or resume forwarding game data to production consumers.
  BROADCAST_SEND_SET: 'BROADCAST_SEND_SET',
  // ── P0 additions ─────────────────────────────────────────────────────────
  // Account session commands. The Esportra account is the workstation's
  // connection; pairing codes were retired on 18 October 2026 (PAIR stays
  // registered fail-closed for legacy renderers).
  // Returns: { ok, session? }  — never returns tokens.
  AIR_SIGNUP_OPEN:'AIR_SIGNUP_OPEN',
  AIR_SESSION_GET: 'AIR_SESSION_GET',
  AIR_LOGIN: 'AIR_LOGIN',
  AIR_LOGOUT: 'AIR_LOGOUT',
  AIR_ACCESS_REFRESH: 'AIR_ACCESS_REFRESH',
  AIR_PROJECTS_LIST: 'AIR_PROJECTS_LIST',
  AIR_PROJECT_GET: 'AIR_PROJECT_GET',
  AIR_PROJECT_CREATE: 'AIR_PROJECT_CREATE',
  AIR_PROJECT_SAVE: 'AIR_PROJECT_SAVE',
  AIR_PROJECT_RESOLVE: 'AIR_PROJECT_RESOLVE',
  AIR_SYNC: 'AIR_SYNC',
  AIR_ASSET_UPLOAD: 'AIR_ASSET_UPLOAD',
  AIR_PROJECT_SELECT: 'AIR_PROJECT_SELECT',
  AIR_RESTORE_TOURNAMENT: 'AIR_RESTORE_TOURNAMENT',
  BRACKET_GET:'BRACKET_GET',
  BRACKET_VIEW_SET:'BRACKET_VIEW_SET',
  MATCH_DAY_GET: 'MATCH_DAY_GET',
  PLAYER_PREFERENCE_SET: 'PLAYER_PREFERENCE_SET',
  PACKETS_CLEAR: 'PACKETS_CLEAR',
  OBSERVER_TEST: 'OBSERVER_TEST',
  PAIR:             'PAIR',
  // Full status snapshot for the console UI status bar.
  // Returns: { mode, nodeId, paired, hubConnected, hudOnline, gepActive, lanRelay }
  GET_STATUS:       'GET_STATUS',
  RESTART_AIR:      'RESTART_AIR',
  OUTPUT_ADD:       'OUTPUT_ADD',
  OUTPUT_REMOVE:    'OUTPUT_REMOVE',
  SET_RELAY_TARGETS:'SET_RELAY_TARGETS',
  COPY_RELAY_KEY:   'COPY_RELAY_KEY',
  SHOW_APPLY_PENDING:'SHOW_APPLY_PENDING',
  SHOW_SELECT_MATCH:'SHOW_SELECT_MATCH',
  RUNNER_STOP:      'RUNNER_STOP',
  // Returns the browser-source URL for a named overlay (no secrets in URL).
  // Returns: { ok, url? }
  COPY_OUTPUT_URL:  'COPY_OUTPUT_URL',
  // Persist a mode change. Requires app restart to take effect.
  // Returns: { ok, restartRequired }
  SET_MODE:         'SET_MODE',

  // ── P1 additions — OBS/vMix video switcher control ───────────────────────
  // Connect to OBS/vMix. Args: { host, port, password? }
  // Returns: { ok, error? }
  OBS_CONNECT:        'OBS_CONNECT',

  // Disconnect from video switcher.
  // Returns: { ok }
  OBS_DISCONNECT:     'OBS_DISCONNECT',
  // Current video switcher state snapshot.
  // Returns: { connected, state, studioMode, tally }
  OBS_GET_STATUS:     'OBS_GET_STATUS',
  OBS_GET_SETUP:      'OBS_GET_SETUP',
  OBS_SET_SETUP:      'OBS_SET_SETUP',
  OBS_DISCOVER:       'OBS_DISCOVER',
  RULES_GET: 'RULES_GET',
  RULES_SET: 'RULES_SET',
  GRAPHIC_FIRE: 'GRAPHIC_FIRE',
  HUD_CONTROLS_GET: 'HUD_CONTROLS_GET',
  HUD_CONTROLS_UPDATE: 'HUD_CONTROLS_UPDATE',
  HUD_PRESETS_GET: 'HUD_PRESETS_GET',
  HUD_PRESETS_SAVE: 'HUD_PRESETS_SAVE',
  HUD_PRESETS_DELETE: 'HUD_PRESETS_DELETE',
  OBS_BUILD_COLLECTION: 'OBS_BUILD_COLLECTION',
  OBS_SLOT_STATUS: 'OBS_SLOT_STATUS',
  OBS_SLOT_ASSIGN: 'OBS_SLOT_ASSIGN',
  TEMPLATE_GET: 'TEMPLATE_GET', TEMPLATE_SAVE: 'TEMPLATE_SAVE', TEMPLATE_PUSH: 'TEMPLATE_PUSH',
  PRODUCTION_HISTORY: 'PRODUCTION_HISTORY',
  // Ensure ESA_ scenes exist in OBS with browser sources.
  // Args: { outputUrls: { holding, gameplay, fullscreen, replay, casters } }
  // Returns: { ok, created, existing, error? }
  OBS_BUILD_SCENES:   'OBS_BUILD_SCENES',
  // Transition a scene into program (studio mode-aware, ≤100ms target).
  // Args: { sceneName }
  // Returns: { ok, latencyMs, scene, error? }
  STUDIO_END: 'STUDIO_END', STUDIO_GET: 'STUDIO_GET', STUDIO_SELECT: 'STUDIO_SELECT', STUDIO_TAKE: 'STUDIO_TAKE', STUDIO_MODE: 'STUDIO_MODE',
  OBS_TAKE:           'OBS_TAKE',
  // Save replay buffer → ESA_Replay scene → return after dwell.
  // Args: { dwellMs? }
  // Returns: { ok, savedPath?, error? }
  OBS_TRIGGER_REPLAY: 'OBS_TRIGGER_REPLAY',

  // ── P2 additions — ShowRunner autopilot ──────────────────────────────────
  // Load a segment array into ShowRunner and arm the first segment.
  RUNNER_LOAD_RUNDOWN: 'RUNNER_LOAD_RUNDOWN',
  // Start the rundown (arms first queued segment).
  RUNNER_START:       'RUNNER_START',
  // Enter hold window on a segment.     Args: { segmentId }
  RUNNER_HOLD:        'RUNNER_HOLD',
  // Skip a segment.                     Args: { segmentId }
  RUNNER_SKIP:        'RUNNER_SKIP',
  // Trigger a take.                     Args: { segmentId, commandId? }
  RUNNER_TAKE:        'RUNNER_TAKE',
  // Resume from tech pause.
  RUNNER_RESUME:      'RUNNER_RESUME',
  // Engage tech pause.
  RUNNER_TECH_PAUSE:  'RUNNER_TECH_PAUSE',
  RUNNER_TIMEOUT: 'RUNNER_TIMEOUT',
  // Log a sponsor slot impression start or end.
  // Args: { action: 'start'|'end', sponsorId, slotType, segmentId? }
  // Returns: { ok: true }
  RUNNER_SPONSOR_SLOT: 'RUNNER_SPONSOR_SLOT',
  // Apply an on-air score correction.   Args: correction object
  FIX_DATA:           'FIX_DATA',
  // Packaged, isolated rehearsal controls.
  SIMULATION_START:   'SIMULATION_START',
  SIMULATION_CONTROL: 'SIMULATION_CONTROL',
  SIMULATION_STATUS: 'SIMULATION_STATUS',
  // Import a recorded match (.ndjson) into the rehearsal.
  SIMULATION_IMPORT: 'SIMULATION_IMPORT',
  // Stop simulation.
  SIMULATION_STOP:    'SIMULATION_STOP',

  // P3 additions - lifecycle, veto, diagnostics.
  LIFECYCLE_GET:            'LIFECYCLE_GET',
  LIFECYCLE_SET_AUTOMATION: 'LIFECYCLE_SET_AUTOMATION',
  LIFECYCLE_HOLD:           'LIFECYCLE_HOLD',
  LIFECYCLE_RELEASE:        'LIFECYCLE_RELEASE',
  LIFECYCLE_MANUAL:         'LIFECYCLE_MANUAL',
  LIFECYCLE_RESULT_CONFIRM: 'LIFECYCLE_RESULT_CONFIRM',
  VETO_GET:                 'VETO_GET',
  DIAGNOSTICS_EXPORT:       'DIAGNOSTICS_EXPORT',
});

const PRODUCTION_COMMANDS = new Set([IPC_COMMANDS.PRODUCTION_PROPOSAL_DISCARD,IPC_COMMANDS.PRODUCTION_SAVED_RECORDS, IPC_COMMANDS.PRODUCTION_SAVED_RECORD, IPC_COMMANDS.PRODUCTION_SPONSORS,
  IPC_COMMANDS.OBSERVER_PRIMARY_SET, IPC_COMMANDS.ARTWORK_PREPARE, IPC_COMMANDS.STUDIO_END, IPC_COMMANDS.STUDIO_GET, IPC_COMMANDS.STUDIO_SELECT, IPC_COMMANDS.STUDIO_TAKE, IPC_COMMANDS.STUDIO_MODE,
  IPC_COMMANDS.AIR_MATCHES_LIST, IPC_COMMANDS.AIR_MATCH_PREPARE, IPC_COMMANDS.AIR_MATCH_ROSTER,
  IPC_COMMANDS.PRODUCTION_CREW, IPC_COMMANDS.PRODUCTION_CREW_INVITE, IPC_COMMANDS.PRODUCTION_CREW_REVOKE,
  IPC_COMMANDS.PRODUCTION_RESULTS, IPC_COMMANDS.PRODUCTION_RESULT_PROPOSE, IPC_COMMANDS.PRODUCTION_RESULT_REVIEW,
  IPC_COMMANDS.PRODUCTION_DETAILS_GET, IPC_COMMANDS.PRODUCTION_DETAILS_SAVE, IPC_COMMANDS.PRODUCTION_DETAILS_RELOAD, IPC_COMMANDS.PRODUCTION_ACTIVITY, IPC_COMMANDS.PRODUCTION_INVITATIONS, IPC_COMMANDS.PRODUCTION_INVITATION_ACCEPT,
  IPC_COMMANDS.BRACKET_GET,IPC_COMMANDS.BRACKET_VIEW_SET,
  IPC_COMMANDS.MATCH_DAY_GET, IPC_COMMANDS.PLAYER_PREFERENCE_SET, IPC_COMMANDS.PACKETS_CLEAR, IPC_COMMANDS.OBSERVER_TEST,
  IPC_COMMANDS.TEMPLATE_GET, IPC_COMMANDS.TEMPLATE_SAVE, IPC_COMMANDS.TEMPLATE_PUSH,
  IPC_COMMANDS.PAUSE_RULES_GET, IPC_COMMANDS.PAUSE_RULES_SET,
  IPC_COMMANDS.DISPLAY_FIX_GET, IPC_COMMANDS.DISPLAY_FIX_CHANGE,
  IPC_COMMANDS.OBS_CONNECT, IPC_COMMANDS.OBS_DISCONNECT, IPC_COMMANDS.OBS_BUILD_SCENES,
  IPC_COMMANDS.OBS_TAKE, IPC_COMMANDS.OBS_TRIGGER_REPLAY, IPC_COMMANDS.OBS_SET_SETUP,
  IPC_COMMANDS.RUNNER_START, IPC_COMMANDS.RUNNER_STOP, IPC_COMMANDS.RUNNER_LOAD_RUNDOWN,
  IPC_COMMANDS.RUNNER_HOLD, IPC_COMMANDS.RUNNER_SKIP, IPC_COMMANDS.RUNNER_TAKE,
  IPC_COMMANDS.RUNNER_RESUME, IPC_COMMANDS.RUNNER_TECH_PAUSE, IPC_COMMANDS.RUNNER_TIMEOUT,
  IPC_COMMANDS.RUNNER_SPONSOR_SLOT, IPC_COMMANDS.RULES_SET, IPC_COMMANDS.FIX_DATA,
  IPC_COMMANDS.MANUAL_PATCH, IPC_COMMANDS.MANUAL_GET, IPC_COMMANDS.MANUAL_ACTION,
  IPC_COMMANDS.GRAPHIC_FIRE, IPC_COMMANDS.HUD_CONTROLS_GET, IPC_COMMANDS.HUD_CONTROLS_UPDATE,
  IPC_COMMANDS.OBS_BUILD_COLLECTION, IPC_COMMANDS.OBS_SLOT_STATUS, IPC_COMMANDS.OBS_SLOT_ASSIGN,
  IPC_COMMANDS.PRODUCTION_HISTORY,
  IPC_COMMANDS.SIMULATION_START, IPC_COMMANDS.SIMULATION_STOP,
  IPC_COMMANDS.SIMULATION_CONTROL, IPC_COMMANDS.SIMULATION_STATUS,
  IPC_COMMANDS.SIMULATION_IMPORT,
  IPC_COMMANDS.LIFECYCLE_SET_AUTOMATION, IPC_COMMANDS.LIFECYCLE_HOLD,
  IPC_COMMANDS.LIFECYCLE_RELEASE, IPC_COMMANDS.LIFECYCLE_MANUAL,
  IPC_COMMANDS.LIFECYCLE_RESULT_CONFIRM,
]);

const KEYTAR_SERVICE = 'esportra-air';
const KEYTAR_ACCOUNT = 'jwt';
const KEYTAR_NODE_TOKEN_ACCOUNT = 'node-token';
const API_BASE = process.env.ESPORTRA_API_URL || 'https://api-staging.esportra.com';

// ─── HUD server state ─────────────────────────────────────────────────────────
let hudServer = null;
let hudControls = null;
let hudStartErrorCode = null;
// Isolated development smoke runs must not bind the operator's live HUD port.
const smokeHudPort = Number(process.env.ESPORTRA_AIR_SMOKE_HUD_PORT);
const HUD_PORT = process.env.ESPORTRA_AIR_SMOKE_TEST === '1' && !app.isPackaged && Number.isInteger(smokeHudPort) && smokeHudPort >= 1024 && smokeHudPort <= 65535 ? smokeHudPort : 5300;
// C-2: per-session write token, generated once at startup, never exposed to renderer or overlays
const HUD_KEY = crypto.randomBytes(32).toString('hex');

// ─── P0 module state (set during boot, before IPC handlers are called) ────────
let nodeConfig = null;
let airSession = null;
let matchSession = require('./match-session').createMatchSession({ getSession: () => airSession });
let standaloneBridge = null;
let packageBridge = null;
let bracketPresentation = null;
function standaloneActive(){return currentShowConfig?.source==='standalone';}
function accountProductionActive(){return standaloneActive() || !!currentShowConfig?.accountPackage;}
function activeNodeId(){return accountProductionActive()?airSession?.deviceId:nodeConfig?.get('nodeId');}
function currentAuthorized(){return accountProductionActive()?!!airSession?.status().authenticated && (!currentShowConfig.accountPackage || currentShowConfig.packageAccountId===airSession.status().userId):!!nodeToken;}
async function standaloneAccess(){if(accountProductionActive()||!nodeToken&&airSession?.status().authenticated)await airSession.assertAccess();}
let standaloneManualScope=null;
async function standaloneTakeAccess(){
  if(!accountProductionActive())return;
  const scope=`${currentShowConfig.packageId || currentShowConfig.projectId}:${currentShowConfig.selectedMatchId}`;
  if(isProductionActive(showRunner)||broadcastGep.getStatus().active||standaloneManualScope===scope)return;
  await standaloneAccess();standaloneManualScope=scope;
}
function idleForWorkspace(){if(isProductionActive(showRunner)||broadcastGep.getStatus().active)throw new Error('Stop production and game capture before changing accounts or matches.');}

let offlineQueue = null;
let hubClient = null;
let hubConnected = false;
// nodeToken is kept in memory for hub/queue operations only — NEVER sent to renderer.
let nodeToken = null;
let lanRelay = null;
let relaySharedKey = null;
const gepRoute = createGepRouteTracker();

// ─── P1 module state — video switcher ─────────────────────────────────────────
let obsController = null;
let obsScreenshotBusy = false;
let obsScreenshotInterval = null;

// ─── P2 module state — autopilot ──────────────────────────────────────────────
let showRunner        = null;
let rulesEngine       = null;
let pauseRules = null;
let eventLogger       = null;
let harness           = null;
let nodeSessionMonitor = null;
let pendingManualTake = null;
let pairingNotice = null;
let pairingMutation = Promise.resolve();
function serializePairing(action) { const pending = pairingMutation.then(action, action); pairingMutation = pending.catch(() => {}); return pending; }
let currentShowConfig = null; // last ShowConfig received from hub, used by fixData
function applyRundown(config, runner, mappings = {}) {
  const applied = ((nodeConfig?.get('obsAppliedTemplates') || {})[`${config.source || 'esportra'}:${config.showId}:${config.selectedMatchId}`] || (config.source!=='standalone'?(nodeConfig?.get('obsAppliedTemplates') || {})[`${config.showId}:${config.selectedMatchId}`]:null));
  return applyPublishedRundown(obsTemplate.templateRundown(config, applied), runner, mappings);
}

function templateSnapshot() {
  if (!currentAuthorized() || !currentShowConfig?.selectedMatchId) throw new Error('Connect your account or tournament workspace, then choose a match.');
  const context = obsTemplate.templateContext(currentShowConfig, activeNodeId());
  const key = obsTemplate.templateKey(context);
  const saved = (nodeConfig.get('obsTemplateDrafts') || {})[key];
  const draft = obsTemplate.defaultTemplate(currentShowConfig, activeNodeId(), saved);
  const applied = (nodeConfig.get('obsAppliedTemplates') || {})[key];
  const obsState = obsController?.getState();
  const collectionKey = `${obsState?.host}:${obsState?.port}:${obsState?.collection || ''}`;
  const prepared = (nodeConfig.get('obsAppliedTemplateCollections') || {})[key] === collectionKey && applied?.context?.nodeId === context.nodeId && applied?.context?.planVersion === context.planVersion && JSON.stringify(applied.items) === JSON.stringify(draft.items) && JSON.stringify(applied.stinger) === JSON.stringify(draft.stinger);
  return { context, key, draft, prepared: prepared === true };
}
let pendingShowConfig = null;
let showConfigTask = Promise.resolve();
let runtimeMode = null;
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('open-url', (event, raw) => { event.preventDefault(); try { const link=new URL(raw); if(link.protocol==='esportra-air:' && link.hostname==='open' && !link.search && !link.hash){mainWindow?.show();mainWindow?.focus();} } catch (_) {} });

// Tracks in-flight sponsor impressions so we can pair start→end.
// key: `${sponsorId}:${slotType}` → { sponsorId, slotType, startedAt, segmentId }
let sponsorLedger = null;
let sponsorAutomation = null;
const roundChapters = new (require('./round-chapters'))();
const incidents = new (require('./production-history').IncidentTracker)({ record: entry => eventLogger?.log(entry) });

// ─── Helper: resolve hud root ─────────────────────────────────────────────────
function getHudRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'esportra-valorant-hud');
  }
  return path.join(__dirname, '..', 'esportra-valorant-hud');
}

// ─── Helper: resolve writable data directory ─────────────────────────────────
function getHudDataDir() {
  return path.join(app.getPath('userData'), 'hud-data');
}

// SignalR requires an HTTP(S) endpoint and chooses WS(S) for its transport.
function deriveHubUrl() {
  return API_BASE
    .replace(/\/$/, '') + '/hubs/broadcast';
}

// ─── Helper: determine runtime mode (CLI > config > default) ─────────────────
function resolveMode(config) {
  const cliArg = process.argv.find(a => a.startsWith('--air-mode='));
  if (cliArg) return cliArg.split('=')[1];
  return config.get('mode');
}

// ─── Helper: current node status for heartbeat payload ────────────────────────
function getNodeStatus() {
  const feed = productionFeed.snapshot(), obs = obsController?.getState();
  return {
    mode: nodeConfig ? nodeConfig.get('mode') : 'production',
    hudOnline: hudServer !== null,
    gepActive: broadcastGep.getStatus().active,
    lanRelayActive: lanRelay !== null,
    appVersion: APP_VERSION,
    runtime: {
      mode: runtimeMode || 'production', hudOnline: hudServer !== null,
      obsConnected: obs?.connected === true,
      feedState: !feed.available ? 'waiting' : feed.stale ? 'stale' : feed.ageMs === null ? 'waiting' : feed.ageMs < 10000 ? 'live' : 'idle',
      automationPaused: showRunner?.isTechPaused() === true,
      timeoutPaused: showRunner?.isTimeoutPaused() === true,
      hudClientsConnected: (hudServer?.clientCount || 0) > 0,
      appVersion: APP_VERSION,
      plan: runtimeMode === 'production' && validVersion(currentShowConfig?.rundownVersion) ? { showId: currentShowConfig.showId, version: currentShowConfig.rundownVersion, pendingVersion: pendingRundownConfig?.rundownVersion || null } : null,
      outputs: (outputRegistry?.list() || []).map(output => {
        const health = hudServer?.getOutputHealth(output.id) || { connectionCount: 0, lastFrameAt: null };
        return { id: output.id, name: output.name, connectionCount: health.connectionCount, lastFrameAt: health.lastFrameAt ? new Date(health.lastFrameAt).toISOString() : null };
      }),
    },
  };
}

// ─── Helper: apply an arbitrary merge patch to the HUD server ─────────────────
// Used by ShowRunner (via hudPatch callback) and RulesEngine.
async function applyHudPatch(matchCode, patch) {
  if (!hudServer) throw new Error('Local HUD is unavailable.');
  if (/^__ESA_SIM_[A-Z0-9]{22}$/i.test(matchCode || '')) return hudServer.writeSimulation(matchCode, patch);
  try {
    const res = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${matchCode || 'MAIN'}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body:    JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Local HUD rejected the graphic update.');
  } catch (_) {
    throw new Error('Could not update the local HUD.');
  }
}

async function seedProductionFeed(config) {
  if (!hudServer || runtimeMode !== 'production') return;
  try {
    const response = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${encodeURIComponent(config.matchCode)}`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) productionFeed.seed(config.matchCode, (await response.json()).state);
  } catch { /* Readiness remains unknown until an actual game packet arrives. */ }
}

// ─── Helper: apply a ShowConfig patch to the HUD server ───────────────────────
async function applyShowConfigToHud(showConfig, sync = false) {
  if (!hudServer) throw new Error('Local HUD is unavailable.');
  const matchCode = showConfig.matchCode || 'MAIN';
  const basePatch = matchContext.buildShowPatch(showConfig), hudPatch = hudControls?.appliedPatch(showConfig) || {};
  const patch = { ...basePatch, ...hudPatch, show:{...basePatch.show,...hudPatch.show}, layout:{...basePatch.layout,...hudPatch.layout}, sync, airContext: { showId: showConfig.showId, matchId: showConfig.selectedMatchId } };
  try {
    const res = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${matchCode}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body: JSON.stringify(patch),
      timeout: 3000,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (_) {}
      throw new Error(`HUD rejected the show configuration (${res.status})${detail ? ': ' + detail : '.'}`);
    }
  } catch (err) {
    throw new Error('Could not apply show configuration: ' + err.message);
  }
}

async function receiveShowConfig(cfg) {
  try {
    if(cfg.accountPackage && (!airSession?.status().authenticated || cfg.packageAccountId!==airSession.status().userId)) throw new Error('Sign in to the account that prepared this broadcast.');
    if(!cfg.accountPackage && cfg.source!=='standalone'){nodeConfig?.set('tournamentShowConfig',cfg);if(accountProductionActive())return {ok:false,error:'Tournament setup saved. Switch to the tournament workspace when ready.'};}
    const decision = publicationDecision(currentShowConfig, cfg);
    if (cfg.showId === pendingRundownConfig?.showId && validVersion(cfg.rundownVersion) && cfg.rundownVersion < pendingRundownConfig.rundownVersion) return { ok: false, error: 'A newer rundown is already waiting.' };
    if (decision === 'older' || decision === 'legacy' && validVersion(currentShowConfig?.rundownVersion)) return { ok: false, error: 'An older or unversioned rundown cannot replace the current published plan.' };
    const selected = selectShowMatch(cfg, cfg.preferredMatchCode || nodeConfig?.get('selectedMatchCode'));
    normalizeRundown(cfg.rundown || []);
    if (isProductionActive(showRunner) || broadcastGep.getStatus().active) {
      pendingShowConfig = cfg;
      nodeConfig.set('pendingShowConfig', cfg);
      const sameMatch = currentShowConfig?.showId === selected.showId && currentShowConfig?.matchCode === selected.matchCode;
      const candidateVersion = pendingRundownConfig?.rundownVersion || currentShowConfig?.rundownVersion || 0;
      if (sameMatch && validVersion(selected.rundownVersion) && selected.rundownVersion > candidateVersion) pendingRundownConfig = selected;
      else if (!sameMatch) pendingRundownConfig = null;
      configurationState = { applied: false, reason: pendingRundownConfig ? `Rundown v${pendingRundownConfig.rundownVersion} waits for the next confirmed Take or Skip. Other setup changes wait until production stops.` : 'New setup waiting. Finish the rundown and stop capture before applying it.' };
      return { ok: false, error: configurationState.reason };
    }
    if (runtimeMode === 'production') {
      const cache = artworkCache(); cache.required.clear(); cache.unsupported.clear(); cache.register(require('./artwork-cache').readCatalog(getHudRoot())); cache.register(selected); void prepareArtwork(cache);
      await applyShowConfigToHud(selected);
    }
    if(selected.accountPackage && selected.packageAccountId!==airSession?.status().userId) throw new Error('Account changed before the broadcast loaded.');
    if(currentShowConfig?.showId!==selected.showId||currentShowConfig?.selectedMatchId!==selected.selectedMatchId||currentShowConfig?.source!==selected.source){pauseRules?.stop();showRunner?.resetForMatch();obsController?.cancelReplay?.();standaloneManualScope=null;}
    if (showRunner && runtimeMode === 'production') configurationState = applyRundown(selected, showRunner, nodeConfig.get('sceneMappings') || {});
    else configurationState = { applied: true, count: 0 };
    if (productionFeed.matchCode !== selected.matchCode || currentShowConfig?.showId !== selected.showId) { productionFeed.reset(selected.matchCode); rulesEngine?.dispose(); }
    currentShowConfig = selected; lanRelay?.updateContext({showId:selected.showId,matchCode:selected.matchCode,label:(selected.teams || []).map(team=>team.name).join(' vs ')}); pendingShowConfig = null; pendingRundownConfig = null;
    nodeConfig.set('pendingShowConfig', null);
    await seedProductionFeed(selected);
    hudServer?.notifyOutputsChanged();
    switchSessionSources();
    nodeConfig.set('showConfig', cfg); nodeConfig.set('selectedMatchCode', selected.matchCode);
    eventLogger?.setShowId(cfg.showId);
    eventLogger?.setOfflineQueue(selected.accountPackage?packageBridge?.eventQueue:selected.source==='standalone'?airSession?.eventQueue:offlineQueue);
    void Promise.resolve(liveLifecycle?.setScope(selected)).catch(() => {});
    if (mainWindow) mainWindow.webContents.send('show-config', selected);
    return { ok: true };
  } catch (error) { configurationState = { applied: false, reason: error.message }; return { ok: false, error: error.message }; }
}

function scheduleRundownBoundary() {
  showConfigTask = showConfigTask.catch(() => {}).then(async () => {
    const pending = pendingRundownConfig;
    if (!pending || !obsController?.getState().connected || showRunner.isTechPaused() || showRunner.isTimeoutPaused()) return;
    const segments = selectedRundown(pending, nodeConfig.get('sceneMappings') || {});
    const inspection = await obsController.inspect();
    if (pending !== pendingRundownConfig || currentShowConfig?.showId !== pending.showId || showRunner.isTechPaused() || showRunner.isTimeoutPaused()) return;
    const missing = require('./scene-mapping').missingScenes(segments, inspection.scenes);
    if (!inspection.connected || inspection.inspectionIncomplete || missing.length) {
      configurationState.reason = `Rundown v${pending.rundownVersion} is waiting. Prepare its OBS scenes before the next Take or Skip${missing.length ? ': ' + missing.join(', ') : '.'}`;
      return;
    }
    const applied = showRunner.replaceUpcoming(segments);
    if (!applied.ok) return;
    currentShowConfig = { ...currentShowConfig, rundown: pending.rundown, rundownVersion: pending.rundownVersion };
    nodeConfig.set('showConfig', currentShowConfig);
    pendingRundownConfig = null;
    eventLogger?.log({ type: 'rundown_version_applied', actor: 'system', data: { version: pending.rundownVersion } });
    configurationState.reason = `Rundown v${pending.rundownVersion} is active for upcoming items. Other setup changes wait until production stops.`;
  }).catch(error => { configurationState.reason = 'Could not activate the pending rundown: ' + error.message; });
}

// ─── Helper: create and wire a HubClient instance ─────────────────────────────
async function recoverPublishedRundown(client, sessionToken) {
  const showId = currentShowConfig?.showId;
  if (!showId || runtimeMode !== 'production') return;
  try {
    const response = await fetch(`${API_BASE}/api/broadcast/nodes/shows/${showId}/publication`, { headers: { Authorization: `Bearer ${sessionToken}` }, timeout: 2500 });
    if (!response.ok) return;
    const snapshot = await response.json();
    if (hubClient !== client || nodeToken !== sessionToken || currentShowConfig?.showId !== showId || !validVersion(snapshot.rundownVersion) || snapshot.rundownVersion <= (currentShowConfig.rundownVersion || 0)) return;
    showConfigTask = showConfigTask.catch(() => {}).then(() => hubClient === client && nodeToken === sessionToken && currentShowConfig?.showId === showId ? receiveShowConfig({ ...snapshot, preferredMatchCode: currentShowConfig.matchCode }) : null);
  } catch (_) { /* Offline and older backends retain the current local plan. */ }
}
function createHubClient(queue) {
  const sessionToken = nodeToken;
  const client = new HubClient({
    hubUrl: deriveHubUrl(),
    apiBase: API_BASE,
    offlineQueue: queue,
    logger: console,
    statusProvider: getNodeStatus,
  });

  nodeSessionMonitor?.stop();
  nodeSessionMonitor = new (require('./node-session-monitor'))({ apiBase: API_BASE, token: nodeToken, fetch,
    onRevoked: () => serializePairing(async () => {
      if (hubClient !== client || nodeToken !== sessionToken) return;
      hubConnected = false; nodeToken = null;
      if(accountProductionActive()){await client.disconnect();await keytar.deletePassword(KEYTAR_SERVICE,KEYTAR_NODE_TOKEN_ACCOUNT);nodeConfig.set('nodeId',null);pairingNotice='Your tournament access was revoked. Your independent workspace remains available. Sign in again once the organizer restores it.';return;}
      showRunner?.techPause(); rulesEngine?.dispose(); harness?.stop(); broadcastGep.stop();
      showRunner?.loadRundown([]);
      currentShowConfig = null; pendingShowConfig = null;
      hudServer?.notifyOutputsChanged();
      nodeConfig.set('showConfig', null); nodeConfig.set('selectedMatchCode', null);
      pendingRundownConfig = null; nodeConfig.set('pendingShowConfig', null);
      productionFeed.reset('MAIN'); eventLogger?.setShowId(null);
      eventLogger?.setOfflineQueue(null);
      void Promise.resolve(liveLifecycle?.clearScope()).catch(() => {});
      await client.disconnect();
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_NODE_TOKEN_ACCOUNT);
      nodeConfig.set('nodeId', null);
      pairingNotice = 'This computer’s legacy pairing was revoked. Capture stopped and automatic production paused. OBS keeps its current program. Sign in with your Esportra account on the next gate to restore production.';
      if (mainWindow) mainWindow.webContents.send('hub-disconnected');
    }),
  });
  nodeSessionMonitor.start();
  tournamentSync?.stop();
  tournamentSync = new TournamentSync({
    getScope: () => !accountProductionActive() && hubClient === client && nodeToken === sessionToken && runtimeMode === 'production' && currentShowConfig?.selectedMatchId ? { token: sessionToken, config: currentShowConfig } : null,
    fetchContext: async ({ token, config }) => {
      const response = await fetch(`${API_BASE}/api/broadcast/nodes/shows/${config.showId}/matches/${config.selectedMatchId}/context`, { headers: { Authorization: `Bearer ${token}` }, timeout: 2500 });
      if (response.status === 409) { const state = await response.json(); if (state.eligible === false) return state; }
      if (!response.ok) throw new Error(response.status === 409 ? 'The selected match is no longer eligible. Current output is retained; choose the next match when ready.' : 'Tournament updates unavailable. Current output is retained.');
      return response.json();
    },
    applyIneligible: (incoming, valid) => {
      showConfigTask = showConfigTask.catch(() => {}).then(async () => {
        if (!valid()) return;
        const config = incoming.match ? mergeMatchContext(currentShowConfig, incoming) : eligibleChoices(currentShowConfig, incoming);
        if (incoming.match) await applyShowConfigToHud(config, true);
        if (valid()) currentShowConfig = config;
      });
      return showConfigTask;
    },
    apply: (incoming, valid) => {
      showConfigTask = showConfigTask.catch(() => {}).then(async () => {
        if (!valid()) return;
        const config = mergeMatchContext(currentShowConfig, incoming);
        await applyShowConfigToHud(config, true);
        if (!valid()) return;
        currentShowConfig = config;
        const saved = nodeConfig.get('showConfig');
        if (saved?.showId === config.showId) nodeConfig.set('showConfig', { ...saved, matches: config.matches, appearance: config.appearance, casters: config.casters, sponsors: config.sponsors, eventLabel: config.eventLabel, mapPool: config.mapPool });
      });
      return showConfigTask;
    },
  });
  tournamentSync.start();
  client.on('revoked', () => { if (hubClient === client && nodeToken === sessionToken) void nodeSessionMonitor?.revoke(); });
  client.on('connected', () => {
    if (hubClient !== client || nodeToken !== sessionToken) return;
    hubConnected = true;
    void recoverPublishedRundown(client, sessionToken);
    if (mainWindow) mainWindow.webContents.send('hub-connected');
  });
  client.on('disconnected', () => {
    if (hubClient !== client || nodeToken !== sessionToken) return;
    void nodeSessionMonitor?.check();
    hubConnected = false;
    if (mainWindow) mainWindow.webContents.send('hub-disconnected');
  });

  client.onShowConfig(cfg => {
    if (hubClient !== client || nodeToken !== sessionToken) return;
    showConfigTask = showConfigTask.then(() => hubClient === client && nodeToken === sessionToken ? receiveShowConfig(cfg) : { ok: false, error: 'Pairing changed before this configuration arrived.' });
  });

  return client;
}

// ─── P1: Video switcher helpers ───────────────────────────────────────────────

/** Start the 2fps screenshot loop that pushes PVW/PGM thumbnails to renderer. */
function startObsScreenshotLoop() {
  stopObsScreenshotLoop();
  obsScreenshotInterval = setInterval(async () => {
    if (obsScreenshotBusy || !obsController || !mainWindow) return;
    obsScreenshotBusy = true;
    try {
      const tally = obsController.getTally();
      const frames = {};
      if (tally.program) {
        const img = await obsController.getScreenshot(tally.program);
        if (img) frames.pgm = img;
      }
      if (tally.preview && tally.preview !== tally.program) {
        const img = await obsController.getScreenshot(tally.preview);
        if (img) frames.pvw = img;
      }
      if (tally.preview && tally.preview === tally.program && frames.pgm) frames.pvw = frames.pgm;
      if (mainWindow && Object.keys(frames).length > 0) {
        mainWindow.webContents.send('obs-preview-frame', frames);
      }
    } catch (_) {} finally {
      obsScreenshotBusy = false;
    }
  }, 500);
}

function stopObsScreenshotLoop() {
  if (obsScreenshotInterval) {
    clearInterval(obsScreenshotInterval);
    obsScreenshotInterval = null;
  }
  obsScreenshotBusy = false;
}

/** Wire event emitter from a newly created video controller to the renderer. */
function wireObsEvents(controller) {
  controller.on('connected', (info) => {
    incidents.update('obs_drop', false, currentShowConfig?.showId);
    if (mainWindow) mainWindow.webContents.send('obs-connected', info ?? {});
    startObsScreenshotLoop();
  });
  controller.on('disconnected', info => {
    incidents.update('obs_drop', true, currentShowConfig?.showId, { actorKind: info?.intentional ? 'operator' : 'system', cause: info?.intentional ? 'manual' : 'connection' });
    if (mainWindow) mainWindow.webContents.send('obs-disconnected');
    stopObsScreenshotLoop();
  });
  controller.on('tally-changed', (tally) => {
    pauseRules?.tally(tally);
    confirmManualTake(tally);
    harness?.acceptTally(tally);
    if (mainWindow) mainWindow.webContents.send('obs-tally', tally);
  });
}

function confirmManualTake(tally) {
  const pending = pendingManualTake;
  if (!pending || pending.expiresAt < Date.now() || tally?.program !== pending.scene) return;
  pendingManualTake = null;
  eventLogger?.log({ type: 'manual_scene_take', actor: 'operator', showId: pending.showId });
}

/**
 * Returns the active video controller, creating it if necessary.
 * Reads obsBackend from node-config ('obs' | 'vmix'); defaults to OBSController.
 */
function getOrCreateVideoController() {
  if (obsController) return obsController;
  const backend = nodeConfig ? nodeConfig.get('obsBackend') : 'obs';
  const ControllerClass = backend === 'vmix' ? VMixController : OBSController;
  obsController = new ControllerClass({ logger: console });
  obsController.canReplayReturn = () => !showRunner?.isTechPaused() && !showRunner?.isTimeoutPaused() && currentAuthorized();
  wireObsEvents(obsController);
  // P2: wire ShowRunner to the newly created controller.
  if (showRunner) showRunner.setObsController(obsController);
  return obsController;
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    show: !(process.env.ESPORTRA_AIR_SMOKE_TEST === '1' && !app.isPackaged),
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#222225',
    icon: path.join(__dirname, '..', 'assets', 'esportra-icon.png'),
    webPreferences: {
      offscreen: process.env.ESPORTRA_AIR_SMOKE_TEST === '1' && !app.isPackaged,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Security control C-4: block non-allowlisted external URLs ────────────────
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (isAllowedExternal(url)) shell.openExternal(url);
  });
});

// ─── IPC handlers — C-3: registered using the enum, never dynamic ─────────────
function registerIpc(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow?.webContents.mainFrame) {
      return { ok: false, error: 'Untrusted application frame.' };
    }
    if (['OBS_TAKE','OBS_TRIGGER_REPLAY','STUDIO_TAKE','STUDIO_SELECT','RUNNER_HOLD','RUNNER_SKIP','RUNNER_TAKE','LIFECYCLE_HOLD','LIFECYCLE_RELEASE','LIFECYCLE_MANUAL'].includes(channel)) return {ok:false,error:'Use OBS for manual scene switching and replay. Air manages HUD graphics and optional scene automation.'};
    if (PRODUCTION_COMMANDS.has(channel) && runtimeMode !== 'production') return { ok: false, error: 'Production controls are unavailable in capture-only mode.' };
    return handler(event, ...args);
  });
}

require('./production-studio').registerProductionStudio({register:registerIpc,commands:IPC_COMMANDS,getShow:()=>currentShowConfig,getNodeId:activeNodeId,getRunner:()=>showRunner,getObs:()=>obsController,authorized:currentAuthorized,access:standaloneTakeAccess,end:async()=>{standaloneManualScope=null;pauseRules?.stop();const screens=showRunner.getState().segments;showRunner.loadRundown(screens);showRunner.resume();showRunner.setTimeoutPaused(false);eventLogger?.log({type:"rundown_stopped",actor:"operator"});}});

const {syncNicknames:syncHudNicknames}=require('./match-day-ipc').registerMatchDay({register:registerIpc,commands:IPC_COMMANDS,config:()=>nodeConfig,getShow:()=>currentShowConfig,getNodeId:activeNodeId,feed:productionFeed,patch:applyHudPatch,onPreference:(...args)=>standaloneBridge?.onPreference(...args)});
registerIpc(IPC_COMMANDS.OBSERVER_TEST,async(_event,input)=>{try{const target=String(input?.host || '')+':'+Number(input?.port);const key=input?.key || await keytar.getPassword(KEYTAR_SERVICE,'relay:'+target);return await require('./observer-probe').testObserver({...input,key});}catch(_){return {ok:false,error:'Could not test the observer. Use a private LAN address and a valid connection key.'};}});

registerIpc(IPC_COMMANDS.ARTWORK_STATUS, () => ({ok:true, appVersion:APP_VERSION, ...artworkCache().status()}));
registerIpc(IPC_COMMANDS.ARTWORK_PREPARE, () => { const cache=artworkCache(); cache.register(currentShowConfig); void prepareArtwork(cache); return {ok:true, ...cache.status()}; });

// P3: live lifecycle (PRD section 10), backend veto stream and support export.
const liveLifecycle = require('./live-lifecycle').registerLiveLifecycle({
  register: registerIpc,
  commands: IPC_COMMANDS,
  send: (channel, payload) => { if (mainWindow) mainWindow.webContents.send(channel, payload); },
  getShow: () => currentShowConfig,
  getRunner: () => showRunner,
  getObs: () => obsController,
  getToken: () => nodeToken || airSession?.session?.accessToken || null,
  log: (entry) => { try { eventLogger?.log(entry); } catch (_) { /* diagnostics only */ } },
  apiBase: API_BASE,
  readPolicy: scope => nodeConfig.get('sceneAutomationPolicies')?.[`${scope.showId}:${scope.matchId}`],
  savePolicy: (scope, policy) => nodeConfig.set('sceneAutomationPolicies', { ...(nodeConfig.get('sceneAutomationPolicies') || {}), [`${scope.showId}:${scope.matchId}`]: policy }),
});

const productionWorkspace=require('./production-workspace').registerProductionWorkspace({register:registerIpc,getSession:()=>airSession,getShow:()=>currentShowConfig,assertIdle:()=>idleForWorkspace()});
packageBridge=require('./broadcast-packages').registerBroadcastPackages({register:registerIpc,commands:IPC_COMMANDS,getSession:()=>airSession,getShow:()=>currentShowConfig,beforePrepare:id=>productionWorkspace.sync(id),activate:receiveShowConfig,assertIdle:async()=>{idleForWorkspace();await obsController?.assertOutputsIdle();idleForWorkspace();},config:()=>nodeConfig,matchSession:()=>matchSession});
registerIpc(IPC_COMMANDS.AIR_SIGNUP_OPEN,()=>{shell.openExternal((API_BASE.includes('staging')?'https://staging.esportra.gg':'https://esportra.gg')+'/auth/signup');return {ok:true};});
standaloneBridge=require('./air-session-ipc').registerStandalone({register:registerIpc,commands:IPC_COMMANDS,getSession:()=>airSession,config:()=>nodeConfig,getShow:()=>currentShowConfig,activate:receiveShowConfig,assertIdle:idleForWorkspace,
  assertAccountIdle:()=>{idleForWorkspace();if(accountProductionActive()&&isBroadcastActive())throw new Error('Close the active HUD outputs before changing accounts. Your on-air scene is retained.');},
  selectAsset:async()=>{const {dialog,nativeImage}=require('electron');const chosen=await dialog.showOpenDialog(mainWindow,{title:'Choose a team or player logo',properties:['openFile'],filters:[{name:'Logos',extensions:['png','jpg','jpeg','webp']}]});if(chosen.canceled)return null;const fs=require('node:fs');const file=chosen.filePaths[0];if(fs.statSync(file).size>5242880)throw new Error('Choose a logo under 5 MB.');const image=nativeImage.createFromBuffer(fs.readFileSync(file));if(image.isEmpty())throw new Error('Choose a valid PNG, JPG or WebP logo.');const size=image.getSize();if(size.width*size.height>24000000)throw new Error('Logo must be under 24 megapixels.');const bytes=(Math.max(size.width,size.height)>1024?image.resize(size.width>=size.height?{width:1024}:{height:1024}):image).toPNG();if(bytes.length>5242880)throw new Error('Choose a smaller logo.');return bytes;},
  clearStandalone:async()=>{lanRelay?.updateContext(null);nodeConfig.set('captureMatchContext',null);currentShowConfig=null;pendingShowConfig=null;showRunner?.loadRundown([]);productionFeed.reset('MAIN');nodeConfig.set('showConfig',null);nodeConfig.set('activeAirProject',null);nodeConfig.set('activeAirMatch',null);nodeConfig.set('activeAirPackage',null);eventLogger?.setShowId(null);eventLogger?.setOfflineQueue(offlineQueue);hudServer?.notifyOutputsChanged();void Promise.resolve(liveLifecycle?.clearScope()).catch(() => {});},
  restoreTournament:async saved=>{if(!nodeToken)throw new Error('Load a tournament match through your Esportra account first; no tournament workspace is stored on this PC.');currentShowConfig=null;const result=await receiveShowConfig(saved);if(!result.ok)throw new Error(result.error);nodeConfig.set('activeAirProject',null);}
});


bracketPresentation=require('./bracket-presentation').registerBracket({register:registerIpc,commands:IPC_COMMANDS,config:()=>nodeConfig,getShow:()=>currentShowConfig,getNodeId:activeNodeId,getToken:()=>nodeToken,fetch,apiBase:API_BASE,patch:applyHudPatch,accountJson:route=>airSession.json(route)});
hudControls=require('./hud-controls').registerHudControls({register:registerIpc,commands:IPC_COMMANDS,getShow:()=>currentShowConfig,getNodeId:activeNodeId,authorized:currentAuthorized,config:()=>nodeConfig,presentAssets:value=>artworkCache().localize(value,`http://localhost:${HUD_PORT}`),previewBase:`http://localhost:${HUD_PORT}`,patch:applyHudPatch,log:event=>eventLogger?.log(event),read:async code=>{const response=await fetch(`http://127.0.0.1:${HUD_PORT}/api/${encodeURIComponent(code)}`,{signal:AbortSignal.timeout(3000)});if(!response.ok)throw new Error('Local HUD is unavailable. Check Connections.');return (await response.json()).state;}});
require('./hud-presets').registerHudPresets({register:registerIpc,commands:IPC_COMMANDS,config:()=>nodeConfig});

registerIpc(IPC_COMMANDS.HUD_STATUS, async () => {
  const online = hudServer !== null;
  const clients = online ? hudServer.clientCount : 0;
  return { online, port: HUD_PORT, clients, errorCode: online ? null : hudStartErrorCode };
});

registerIpc(IPC_COMMANDS.HUD_OVERLAY_LIST, () => {
  const fs = require('fs');
  const overlaysDir = path.join(getHudRoot(), 'overlays');
  try {
    const files = fs.readdirSync(overlaysDir).filter(f => f.endsWith('.html'));
    return files.map(f => ({
      name: f.replace('.html', ''),
      url: `http://localhost:${HUD_PORT}/overlays/${f}?match=MAIN`,
    }));
  } catch (err) {
    return { error: 'Could not read overlay directory: ' + err.message };
  }
});

// ─── Manual HUD data controls ────────────────────────────────────────────────
// Raw patch (legacy state editor) and the validated manual-data actions used by
// the production desk. Both write to the currently selected match only.

function manualTarget() {
  const show = currentShowConfig;
  if (!currentAuthorized() || !hudServer || !show?.selectedMatchId) throw new Error('Sign in and choose a match before editing its HUD data.');
  return show;
}
async function fetchManualState(show) {
  const response = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${encodeURIComponent(show.matchCode)}`, { headers: { 'X-Esportra-Key': HUD_KEY }, timeout: 3000 });
  if (!response.ok) throw new Error('The local HUD did not return this match.');
  const body = await response.json().catch(() => null);
  if (!body?.state) throw new Error('The local HUD did not return this match.');
  return body.state;
}
let manualWeapons = null;
function weaponList() {
  if (manualWeapons) return manualWeapons;
  try {
    const source = require('fs').readFileSync(path.join(getHudRoot(), 'core', 'catalog.js'), 'utf8');
    const data = JSON.parse(source.replace(/^\s*window\.VCAT\s*=\s*/, '').replace(/;\s*$/, ''));
    manualWeapons = Object.entries(data.weapons || {}).map(([key, weapon]) => ({ key, name: weapon.name || key, category: weapon.cat || '' })).slice(0, 128);
  } catch (_) { manualWeapons = []; }
  return manualWeapons;
}

registerIpc(IPC_COMMANDS.MANUAL_GET, async () => {
  let show;
  try { show = manualTarget(); } catch (failure) { return { ok: false, error: failure.message }; }
  try {
    const state = await fetchManualState(show);
    const fixes = await displayFixRequest();
    const overrides = fixes.ok ? (fixes.status.active || []).map(entry => entry.field) : [];
    return { ok: true, context: { showId: show.showId, matchId: show.selectedMatchId, matchCode: show.matchCode, nodeId: activeNodeId() }, state: manualStateSubset(state), weapons: weaponList(), overrides };
  } catch (failure) { return { ok: false, error: failure.message || 'Could not read the live match data.' }; }
});

registerIpc(IPC_COMMANDS.MANUAL_ACTION, async (_event, { context, action } = {}) => {
  const show = currentShowConfig;
  if (!context || !show || context.showId !== show.showId || context.matchId !== show.selectedMatchId || context.matchCode !== show.matchCode || context.nodeId !== activeNodeId()) {
    return { ok: false, error: 'The match or pairing changed. Reload its live data before editing.' };
  }
  if (!currentAuthorized() || !hudServer) return { ok: false, error: 'Sign in and choose a match before editing its HUD data.' };
  try {
    const state = await fetchManualState(show);
    const { patch, next } = applyManualAction(state, action);
    const response = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${encodeURIComponent(show.matchCode)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body: JSON.stringify(patch),
      timeout: 3000,
    });
    if (!response.ok) throw new Error('The local HUD rejected the change.');
    eventLogger?.log({ type: 'manual_data', showId: show.showId, actor: 'operator', data: { action: action.type } });
    return { ok: true, state: manualStateSubset(next) };
  } catch (failure) { return { ok: false, error: failure.message || 'Could not apply the manual change.' }; }
});

registerIpc(IPC_COMMANDS.MANUAL_PATCH, async (_event, { patch } = {}) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'patch must be a JSON object.' };
  }
  let show;
  try { show = manualTarget(); } catch (failure) { return { ok: false, error: failure.message }; }
  try {
    const res = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${encodeURIComponent(show.matchCode)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return { ok: false, error: 'HUD server rejected the patch.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Could not reach HUD server — ' + err.message };
  }
});

registerIpc(IPC_COMMANDS.PREVIEW_OVERLAY, async (_event, { url } = {}) => {
  if (!url || typeof url !== 'string') return { ok: false, error: 'url is required.' };
  if (!url.startsWith(`http://localhost:${HUD_PORT}/`) && !url.startsWith(`http://127.0.0.1:${HUD_PORT}/`)) {
    return { ok: false, error: 'Only HUD overlay URLs can be previewed.' };
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    backgroundColor: '#20242b',
    title: 'Overlay Preview — Sample Data',
    webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true },
  });
  const previewUrl = new URL(url);
  previewUrl.searchParams.set('preview', '1');
  win.loadURL(previewUrl.href);
  return { ok: true };
});

// ─── P0 IPC: PAIR ─────────────────────────────────────────────────────────────
// Pairing codes were retired 18 October 2026. Workstations reach a workspace by
// signing in with an Esportra account (gateway screen → AIR_LOGIN); crew access
// follows the account. The command stays registered fail-closed for legacy
// renderer calls, mirroring the mixer route behavior.

registerIpc(IPC_COMMANDS.PAIR, () => ({
  ok: false,
  error: 'Pairing codes are retired. Sign in with your Esportra account instead.',
}));

// ─── P0 IPC: GET_STATUS ───────────────────────────────────────────────────────

registerIpc(IPC_COMMANDS.GET_STATUS, () => {
  const relayPort = nodeConfig ? nodeConfig.get('lanRelayPort') : 5301;
  const gepStatus = broadcastGep.getStatus();
  const hudOnline = hudServer !== null;
  const armedMatch = currentShowConfig && (currentShowConfig.accountPackage || currentShowConfig.source === 'standalone') ? {
    matchId: currentShowConfig.selectedMatchId || null,
    matchCode: currentShowConfig.matchCode || null,
    label: (currentShowConfig.teams || []).map(team => team.name).filter(Boolean).join(' vs ') || currentShowConfig.title || currentShowConfig.matchCode || null,
    packageId: currentShowConfig.packageId || null,
  } : null;
  const matchState = matchSession?.status() || { version: 1, selectedMatchId: null, setups: [], queue: [] };
  const selectedMatchId = matchState.selectedMatchId || armedMatch?.matchId || null;
  const selectedSetup = matchState.setups.find(setup => setup.matchId === selectedMatchId) || null;
  const sessionId = activeSessionId();
  const sessionSources = sessionId ? {
    id: sessionId,
    armedMatchId: armedMatch?.matchId || null,
    ingame: `http://localhost:${HUD_PORT}/session/${sessionId}/ingame`,
    graphics: `http://localhost:${HUD_PORT}/session/${sessionId}/graphics`,
    screens: (currentShowConfig.rundown || []).filter(item => item && item.overlay && (!item.matchId || item.matchId === currentShowConfig.selectedMatchId)).slice(0, 50).map(item => ({ id: item.id, title: item.title, overlay: item.overlay, url: `http://localhost:${HUD_PORT}/session/${sessionId}/screen/${encodeURIComponent(item.id || item.overlay)}` })),
  } : null;
  return {
    appVersion:APP_VERSION,
    mode: runtimeMode || (nodeConfig ? nodeConfig.get('mode') : 'production'),
    modeConfigured: nodeConfig ? nodeConfig.get('modeConfigured') === true : false,
    configuredMode: nodeConfig?.get('mode') || 'production',
    restartRequired: !!runtimeMode && runtimeMode !== nodeConfig?.get('mode'),
    nodeName: os.hostname(),
    nodeIp: Object.values(os.networkInterfaces()).flat().find(address => address && !address.internal && address.family === 'IPv4')?.address || null,
    outputs: outputRegistry ? outputRegistry.list().map(output => ({ ...output, ...hudServer?.getOutputHealth(output.id) })) : [],
    outputCatalogue: outputRegistry ? outputRegistry.catalogue() : [],
    lanRelayTargets: nodeConfig ? nodeConfig.get('lanRelayTargets') : [],
    primaryObserver: primaryObserver(),
    captureMatchContext:runtimeMode === 'capture-only' ? nodeConfig?.get('captureMatchContext') || null : null,
    pendingRecords: offlineQueue ? offlineQueue.getPendingCount() : 0,
    obsConnected:obsController?.getState().connected===true,
    show: currentShowConfig ? { crew:(currentShowConfig.crew||[]).map(person=>({name:person.name,role:person.role})), accountPackage:currentShowConfig.accountPackage===true,packageId:currentShowConfig.packageId,packageVersion:currentShowConfig.packageVersion, selectedMatchId:currentShowConfig.selectedMatchId, game:currentShowConfig.game, teams:(currentShowConfig.teams||[]).map(t=>({name:t.name,teamId:t.teamId,roster:t.roster||[]})), rundown:(currentShowConfig.rundown||[]).map(s=>({id:s.id,title:s.title,overlay:s.overlay})), source:currentShowConfig.source || 'esportra', projectId:currentShowConfig.projectId, sponsors: runtimeMode === 'production' ? (currentShowConfig.sponsors || []).map(sponsor => ({ sponsorId: sponsor.sponsorId || null, name: sponsor.name || '', logoUrl: sponsor.logoUrl || '' })) : [], casters: (currentShowConfig.casters || []).map(person => ({ name: person.name || '', handle: person.handle || '', displayName: person.displayName || person.name || '', role: person.role || '' })), requiredHudElements: Array.isArray(currentShowConfig.requiredHudElements) ? currentShowConfig.requiredHudElements : [], id: currentShowConfig.showId, title: currentShowConfig.title, matchCode: currentShowConfig.matchCode, scheduledAt: currentShowConfig.scheduledAt || currentShowConfig.matches?.find(match => match.matchId === currentShowConfig.selectedMatchId)?.scheduledAt || null, registeredRoster: (currentShowConfig.teams || []).map(team => ({ team: team.name, players: team.roster || [] })), matches: (currentShowConfig.matches || []).map(match => ({ matchCode: match.matchCode, label: (match.teams || []).map(team => team.name).join(' vs ') })), screens: (currentShowConfig.rundown || []).filter(item => !item.matchId || item.matchId === currentShowConfig.selectedMatchId).map(item => ({ title: item.title, overlay: item.overlay })) } : null,
    matchSession: {
      ...matchState,
      selectedMatchId,
      selected: selectedSetup,
      armed: armedMatch,
    },
    sessionSources,
    pendingShow: pendingShowConfig ? { title: pendingShowConfig.title } : null,
    configuration: configurationState,
    correctionContext: currentShowConfig && currentAuthorized() ? { showId: currentShowConfig.showId, matchId: currentShowConfig.selectedMatchId, matchCode: currentShowConfig.matchCode, nodeId: activeNodeId() } : null,
    tournamentSync: tournamentSync?.status() || null,
    rundownPublication: { version: currentShowConfig?.rundownVersion || null, pendingVersion: pendingRundownConfig?.rundownVersion || null, diff: pendingRundownConfig ? upcomingDiff(currentShowConfig, pendingRundownConfig) : null },
    obsTemplate: (() => { try { const state = templateSnapshot(); return { prepared: state.prepared, screenCount: state.draft.items.length, planVersion: state.context.planVersion }; } catch (_) { return { prepared: false, screenCount: 0 }; } })(),
    runner: showRunner ? showRunner.getState() : null,
    lifecycle: liveLifecycle ? liveLifecycle.snapshot() : null,
    veto: liveLifecycle ? liveLifecycle.vetoSnapshot() : null,
    gameFeed: productionFeed.snapshot(),
    productionFeed: productionFeed.snapshot(),
    pauseRule: pauseRules?.status() || null,
    displayOverrides: hudServer?.getDisplayFixSummary(currentShowConfig?.matchCode) || { fields: [] },
    productionEvents: (eventLogger?.getLog(100) || []).filter(entry => entry.showId === currentShowConfig?.showId),
    nodeId: nodeConfig ? nodeConfig.get('nodeId') : null,
    paired: nodeToken !== null,
    packageSync:packageBridge?.status(),
    airAccount: airSession?.status() || {authenticated:false},
    standalone:!!airSession?.status().authenticated && (standaloneActive() || !nodeToken),
    accountBroadcast:!!airSession?.status().authenticated,
    package:currentShowConfig?.accountPackage?{id:currentShowConfig.packageId,version:currentShowConfig.packageVersion,game:currentShowConfig.game}:null,
    pairingNotice,
    sponsorPlacements: sponsorLedger ? [...sponsorLedger.active.values()] : [],
    sponsorAutomation: sponsorAutomation ? sponsorAutomation.status() : null,
    hubConnected,
    hudOnline,
    gepActive: gepStatus.active,
    captureRole: gepStatus.active ? gepStatus.captureRole : nodeConfig.get('captureRole') || 'observer',
    lanRelay: lanRelay ? lanRelay.getStatus() : { listening: false, port: relayPort, consumerCount: 0 },
    hudPort: HUD_PORT,
    health: {
      hudServer: {
        state: hudOnline ? 'healthy' : (hudStartErrorCode ? 'error' : 'offline'),
        detail: hudOnline ? `Port ${HUD_PORT}` : (hudStartErrorCode ? `Error: ${hudStartErrorCode}` : 'Not started'),
      },
      obsConnection: (() => {
        if (!obsController) return { state: 'offline', detail: 'Not connected' };
        const obs = obsController.getState();
        if (obs.connected) {
          return { state: 'healthy', detail: `OBS ${obs.version || 'version unavailable'}${obs.studioMode ? ' · Studio Mode' : ''} · Scene collection: ${obs.collection || 'unavailable'}` };
        }
        return { state: 'attention', detail: obs.state };
      })(),
      gepFeed: (() => {
        const mismatched = gepRoute.active();
        const lastAt = hudServer?.getLastGepAt?.(currentShowConfig?.matchCode || 'MAIN');
        const fresh = lastAt && Date.now() - lastAt < 10000;
        return {
          state: mismatched ? 'attention' : (fresh ? 'healthy' : (gepStatus.active ? 'attention' : 'offline')),
          detail: mismatched
            ? `Observer show or match differs from the selected production match; ${gepRoute.rejectedCount()} packet${gepRoute.rejectedCount() === 1 ? '' : 's'} ignored`
            : (fresh ? 'Game-event packets received' : (gepStatus.active ? 'Capture running; waiting for packets' : 'No recent game-event packets')),
        };
      })(),
      apiConnection: {
        state: hubConnected ? 'healthy' : (nodeToken ? 'attention' : 'offline'),
        detail: hubConnected ? 'Hub connected' : (nodeToken ? 'Reconnecting…' : 'Not signed in'),
      },
      overlayRender: {
        state: hudOnline && hudServer.clientCount > 0 ? 'healthy' : 'unknown',
        detail: hudOnline ? `${hudServer.clientCount || 0} HUD client(s) connected; render needs visual verification` : 'HUD offline',
      },
    },
  };
});

// ─── P0 IPC: SET_MODE ─────────────────────────────────────────────────────────

registerIpc(IPC_COMMANDS.SHORTCUTS_GET, () => {
  const { DEFAULTS, validateBindings } = require('./shortcuts');
  const result = validateBindings(nodeConfig?.get('shortcuts') || DEFAULTS);
  return result.ok ? result : { ok: true, bindings: { ...DEFAULTS } };
});
// Global HUD shortcuts keep the console map working while the Air window is
// minimised. Only modified keys and function keys are registered globally:
// plain letters and digits stay window-focused so they never steal typing from
// OBS or the operator's other tools. Ticker, sponsors, banner and countdown
// carry a modifier fallback when the operator's own binding is a plain key.
const GLOBAL_SHORTCUT_FALLBACKS = Object.freeze({ hudTicker: 'Ctrl+Alt+T', hudSponsors: 'Ctrl+Alt+S', hudHideBanner: 'Ctrl+Alt+9', hudStopCountdown: 'Ctrl+Alt+0' });
function globalAccelerator(binding) {
  return typeof binding === 'string' && (binding.includes('+') || /^F(?:[1-9]|1[0-2])$/.test(binding)) ? binding : null;
}
async function runGlobalHudShortcut(id) {
  try {
    const action = require('./shortcuts').ACTIONS.find(item => item.id === id);
    if (!action || !hudControls || !currentAuthorized() || !currentShowConfig?.selectedMatchId) return;
    if (action.action === 'hud-layer') {
      const live = await hudControls.liveSettings();
      const enabled = live.layers[action.layer] === true ? 'auto' : live.layers[action.layer] === 'auto' ? false : true;
      await hudControls.setLayer(action.layer, enabled, 'shortcut');
      eventLogger?.log({ type: 'shortcut_used', actor: 'shortcut', data: { id, layer: action.layer, enabled } });
    } else if (action.action === 'hud-command') {
      await hudControls.runCommand(action.command, 'shortcut');
      eventLogger?.log({ type: 'shortcut_used', actor: 'shortcut', data: { id, command: action.command } });
    }
  } catch (error) {
    eventLogger?.log({ type: 'shortcut_failed', actor: 'shortcut', data: { id, message: error.message } });
  }
}
function syncGlobalShortcuts() {
  if (!app.isReady()) return;
  try { globalShortcut.unregisterAll(); } catch (_) { return; }
  if (!hudControls) return;
  const { DEFAULTS, validateBindings, ACTIONS } = require('./shortcuts');
  const result = validateBindings(nodeConfig?.get('shortcuts') || DEFAULTS);
  if (!result.ok) return;
  const used = new Set();
  for (const action of ACTIONS) {
    if (action.action !== 'hud-layer' && action.action !== 'hud-command') continue;
    const binding = globalAccelerator(result.bindings[action.id]) || GLOBAL_SHORTCUT_FALLBACKS[action.id];
    if (!binding || used.has(binding)) continue;
    try { if (globalShortcut.register(binding, () => { void runGlobalHudShortcut(action.id); })) used.add(binding); }
    catch (_) { /* Reserved by another app; the window-focused binding still works. */ }
  }
}
registerIpc(IPC_COMMANDS.SHORTCUTS_SET, (_event, bindings) => {
  const result = require('./shortcuts').validateBindings(bindings);
  if (!result.ok) return result;
  if (!nodeConfig) return { ok: false, error: 'Workstation settings are not ready.' };
  try { nodeConfig.set('shortcuts', result.bindings); syncGlobalShortcuts(); return result; }
  catch (_) { return { ok: false, error: 'Could not save shortcuts. Check workstation storage and retry.' }; }
});
registerIpc(IPC_COMMANDS.SET_MODE, (_event, { mode: newMode } = {}) => {
  const VALID_MODES = new Set(['production', 'capture-only']);
  if (!newMode || !VALID_MODES.has(newMode)) {
    return { ok: false, error: 'Invalid mode. Use "production" or "capture-only".' };
  }
  if (!nodeConfig) return { ok: false, error: 'Node config not ready.' };
  const restartRequired = (runtimeMode || nodeConfig.get('mode')) !== newMode;
  if (restartRequired && (isBroadcastActive() || isProductionActive(showRunner))) return { ok: false, error: 'Stop the show flow and game capture, then close HUD previews and browser sources before changing the PC role.' };
  nodeConfig.set('mode', newMode);
  nodeConfig.set('modeConfigured', true);
  return { ok: true, restartRequired };
});

registerIpc(IPC_COMMANDS.RESTART_AIR, () => {
  if (isBroadcastActive() || isProductionActive(showRunner)) return { ok: false, error: 'Stop the rundown and capture, then close active HUD consumers before restarting.' };
  app.relaunch(); app.exit(0); return { ok: true };
});
registerIpc(IPC_COMMANDS.OUTPUT_ADD, (_event, input) => {
  try { return { ok: true, output: outputRegistry.add(input) }; }
  catch (error) { return { ok: false, error: error.message }; }
});
registerIpc(IPC_COMMANDS.OUTPUT_REMOVE, (_event, { id } = {}) => {
  try { outputRegistry.remove(id); hudServer?.notifyOutputsChanged(); return { ok: true }; }
  catch (error) { return { ok: false, error: error.message }; }
});
registerIpc(IPC_COMMANDS.COPY_RELAY_KEY, () => {
  if (runtimeMode !== 'capture-only' || !relaySharedKey) return { ok: false, error: 'Observer mode is required.' };
  require('electron').clipboard.writeText(relaySharedKey);
  return { ok: true };
});
function primaryObserver() {
  const targets = nodeConfig?.get('lanRelayTargets') || [];
  const saved = nodeConfig?.get('primaryObserver');
  return require('./observer-routing').primaryTarget(targets,saved);
}
registerIpc(IPC_COMMANDS.OBSERVER_CONTEXT_ACCEPT, (_event,{id}={}) => {
  if (runtimeMode !== 'capture-only' || !lanRelay) return {ok:false,error:'Open this control on the capture-only PC.'};
  if (broadcastGep.getStatus().active) return {ok:false,error:'Stop capture before linking another match.'};
  const context = lanRelay.requestedContext(id);
  if (!context) return {ok:false,error:'The production match request changed or disconnected. Refresh and retry.'};
  nodeConfig.set('captureMatchContext',context); return {ok:true};
});
registerIpc(IPC_COMMANDS.OBSERVER_PRIMARY_SET, async (_event,{target}={}) => {
  if (target !== 'local' && !(nodeConfig?.get('lanRelayTargets') || []).includes(target)) return {ok:false,error:'Choose a saved observer PC or this PC.'};
  if (isProductionActive(showRunner) || broadcastGep.getStatus().active) return {ok:false,error:'Stop Air production and capture before changing the HUD data source.'};
  try {await obsController?.assertOutputsIdle();}catch(_){return {ok:false,error:'Stop OBS streaming and recording before changing the HUD data source.'};}
  if (isProductionActive(showRunner) || broadcastGep.getStatus().active) return {ok:false,error:'Stop Air production and capture before changing the HUD data source.'};
  nodeConfig.set('primaryObserver',target);
  return {ok:true};
});
registerIpc(IPC_COMMANDS.SET_RELAY_TARGETS, async (_event, { targets, keys = {} } = {}) => {
  if (!Array.isArray(targets) || targets.length > 8 || targets.some(target => typeof target !== 'string' || !/^[a-zA-Z0-9.-]+:[0-9]{1,5}$/.test(target) || Number(target.split(':')[1]) < 1 || Number(target.split(':')[1]) > 65535)) return { ok: false, error: 'Use observer host:port addresses, up to 8 machines.' };
  if (!keys || typeof keys !== 'object' || Array.isArray(keys) || Object.entries(keys).some(([target, value]) => !targets.includes(target) || typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value))) return { ok: false, error: 'Use the observer’s 64-character pairing key.' };
  if (isBroadcastActive() || isProductionActive(showRunner)) return { ok: false, error: 'Stop the rundown and capture, then close HUD consumers before changing relay settings.' };
  for (const target of targets) {
    const key = keys[target] || await keytar.getPassword(KEYTAR_SERVICE, 'relay:' + target);
    if (!key) return { ok: false, error: 'Add the pairing key copied from each observer.' };
  }
  for (const [target, value] of Object.entries(keys)) await keytar.setPassword(KEYTAR_SERVICE, 'relay:' + target, value);
  nodeConfig.set('lanRelayTargets', [...new Set(targets)]);
  return { ok: true, restartRequired: true };
});

// ─── P0 IPC: COPY_OUTPUT_URL ──────────────────────────────────────────────────
// Returns the browser-source URL for an overlay. No secrets in the URL per arch §8.

registerIpc(IPC_COMMANDS.COPY_OUTPUT_URL, (_event, { overlayName, matchCode } = {}) => {
  if (!overlayName || typeof overlayName !== 'string') {
    return { ok: false, error: 'overlayName is required.' };
  }
  // Sanitise: allow only filesystem-safe overlay name chars.
  const safeName = overlayName.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) return { ok: false, error: 'overlayName contains no valid characters.' };
  const safeCode = (matchCode && typeof matchCode === 'string')
    ? matchCode.replace(/[^A-Z0-9_-]/gi, '') || 'MAIN'
    : 'MAIN';
  return { ok: true, url: `http://localhost:${HUD_PORT}/overlays/${safeName}.html?match=${safeCode}` };
});

// ─── P1 IPC: OBS_CONNECT ─────────────────────────────────────────────────────
// Creates (or reuses) the video controller and initiates a connection.
// host/port/password validated; controller type determined by obsBackend config.

// Security: OBS WebSocket must be on loopback. Remote OBS requires explicit
// config-level allowlisting in a future version; for P1 local operation only.
const { allowedOBSHost, discoverOBS } = require('./obs-discovery');

registerIpc(IPC_COMMANDS.OBS_DISCOVER, () => discoverOBS());
registerIpc(IPC_COMMANDS.OBS_CONNECT, async (_event, { host, port, password, allowRemote } = {}) => {
  if (runtimeMode !== 'production') return { ok: false, error: 'OBS controls require production mode.' };
  if (!host || typeof host !== 'string') {
    return { ok: false, error: 'host is required.' };
  }
  const target = allowedOBSHost(host);
  if (!target.valid || (target.remote && allowRemote !== true)) {
    return { ok: false, error: 'Use this PC or explicitly allow a private LAN OBS address.' };
  }
  const safePort = port === undefined || port === '' ? 4455 : Number(port);
  if (!Number.isInteger(safePort) || safePort < 1 || safePort > 65535) {
    return { ok: false, error: 'port must be between 1 and 65535.' };
  }
  if (password !== undefined && (typeof password !== 'string' || password.length > 4096)) return { ok: false, error: 'Enter a valid OBS password.' };
  const controller = getOrCreateVideoController();
  try {
    const account = `obs:${host}:${safePort}`;
    const credential = password || await keytar.getPassword(KEYTAR_SERVICE, account) || '';
    await controller.connect(host, safePort, credential);
    await keytar.setPassword(KEYTAR_SERVICE, account, credential);
    nodeConfig.set('obsConnection', { host, port: safePort, allowRemote: target.remote });
    return { ok: true };
  } catch (failure) {
    if (typeof failure?.message === 'string' && failure.message.startsWith('vMix is not supported')) return { ok: false, error: failure.message };
    return { ok: false, error: 'Could not connect and save OBS credentials. Check the address, password and OS credential store.' };
  }
});

registerIpc(IPC_COMMANDS.RULES_GET, () => ({ ok: true, durations: rulesEngine.getDurations() }));
registerIpc(IPC_COMMANDS.PAUSE_RULES_GET, async () => {
  const inspection = obsController?.getState().connected && obsController.inspect ? await obsController.inspect() : null;
  return { ok: true, config: pauseRules?.config || require('./pause-rules').DEFAULTS, scenes: inspection?.scenes || [] };
});
registerIpc(IPC_COMMANDS.PAUSE_RULES_SET, (_event, input) => {
  if (!pauseRules || isProductionActive(showRunner) || showRunner.isTechPaused() || showRunner.isTimeoutPaused()) return { ok: false, error: 'Stop the rundown and end pauses before changing pause behavior.' };
  try { const config = require('./pause-rules').validatePauseRules(input); nodeConfig.set('pauseRules', config); pauseRules.configure(config); return { ok: true, config }; }
  catch (failure) { return { ok: false, error: failure.message }; }
});
registerIpc(IPC_COMMANDS.PRODUCTION_HISTORY, () => ({ ok: true, history: currentAuthorized() && currentShowConfig ? eventLogger?.getTimeline(currentShowConfig.showId) : { items: [] } }));
registerIpc(IPC_COMMANDS.GRAPHIC_FIRE, async (_event, { kind, input } = {}) => {
  if (!currentShowConfig?.showId) return { ok: false, error: 'Select a show match before firing a graphic.' };
  try {
    const patch = require('./graphic-actions').graphicPatch(kind, input);
    await applyHudPatch(currentShowConfig.matchCode, patch);
    eventLogger?.log({ type: 'manual_graphic', actor: 'operator', data: { kind } });
    return { ok: true };
  } catch (failure) { return { ok: false, error: failure.message || 'Could not show this graphic.' }; }
});
registerIpc(IPC_COMMANDS.RULES_SET, (_event, input) => {
  if (runtimeMode !== 'production' || isProductionActive(showRunner)) return { ok: false, error: 'Stop the active rundown before changing graphic timings.' };
  try {
    const durations = require('./rules-engine').validateDurations(input);
    nodeConfig.set('graphicsDurations', durations); rulesEngine.setDurations(durations);
    return { ok: true, durations };
  } catch (failure) { return { ok: false, error: failure.message }; }
});

// ─── P1 IPC: OBS_DISCONNECT ──────────────────────────────────────────────────

registerIpc(IPC_COMMANDS.OBS_DISCONNECT, async () => {
  if (!obsController) return { ok: true };
  await obsController.disconnect();
  return { ok: true };
});

// ─── P1 IPC: OBS_GET_STATUS ──────────────────────────────────────────────────

registerIpc(IPC_COMMANDS.OBS_GET_STATUS, async () => {
  if (!obsController) {
    const saved = nodeConfig.get('obsConnection');
    return { connected: false, state: 'disconnected', studioMode: false, host: saved?.host, port: saved?.port, allowRemote: saved?.allowRemote === true, tally: { preview: null, program: null } };
  }
  const state = obsController.inspect ? await obsController.inspect() : obsController.getState();
  return { ...state, allowRemote: nodeConfig.get('obsConnection')?.allowRemote === true };
});

registerIpc(IPC_COMMANDS.OBS_GET_SETUP, async () => {
  if (runtimeMode !== 'production' || !obsController?.inspect) return { ok: false, error: 'Connect OBS in production mode first.' };
  const inspection = await obsController.inspect();
  const items = (currentShowConfig?.rundown || []).filter(item => !item.matchId || item.matchId === currentShowConfig.selectedMatchId);
  return { ok: true, ...inspection, segments: normalizeRundown(items, nodeConfig.get('sceneMappings') || {}), defaults: normalizeRundown(items) };
});

registerIpc(IPC_COMMANDS.OBS_SET_SETUP, (_event, input) => {
  showConfigTask = showConfigTask.catch(() => {}).then(async () => {
    if (runtimeMode !== 'production' || !obsController?.inspect || !currentShowConfig) return { ok: false, error: 'Connect OBS and receive a show first.' };
    try {
      const inspection = await obsController.inspect();
      if (isProductionActive(showRunner)) return { ok: false, error: 'Stop the active rundown before changing scene mappings.' };
      const items = (currentShowConfig.rundown || []).filter(item => !item.matchId || item.matchId === currentShowConfig.selectedMatchId);
      const mappings = require('./scene-mapping').validateSceneMappings(input, normalizeRundown(items), inspection);
      const saved = nodeConfig.get('sceneMappings') || {};
      const currentIds = new Set((currentShowConfig.rundown || []).map(item => item.id));
      const retained = Object.fromEntries(Object.entries(saved).filter(([id]) => currentIds.has(id)));
      nodeConfig.set('sceneMappings', { ...retained, ...mappings });
      configurationState = applyRundown(currentShowConfig, showRunner, nodeConfig.get('sceneMappings'));
      eventLogger?.log({ type: 'scene_mappings_saved', actor: 'operator', data: { count: input.length } });
      return { ok: true };
    } catch (failure) { return { ok: false, error: failure.message || 'Could not save scene mappings.' }; }
  });
  return showConfigTask;
});

// ─── P1 IPC: OBS_BUILD_SCENES ────────────────────────────────────────────────
// Creates ESA_ scenes in OBS with browser sources for each named overlay URL.
// Security: all provided URLs must target the local HUD server only.


registerIpc(IPC_COMMANDS.OBS_BUILD_SCENES, async (_event, { outputUrls } = {}) => {
  if (!obsController) return { ok: false, error: 'OBS is not connected.' };
  if (isProductionActive(showRunner) || harness?.getStatus().allowObs) return { ok: false, error: 'Stop the show flow and OBS rehearsal before preparing screens.' };
  try {
    const safeUrls = require('./screen-scenes').validateSceneUrls(outputUrls || {}, HUD_PORT);
    const result = await obsController.buildScenes(safeUrls);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

function productionSetup() {
  if (!obsController?.getState().connected || !obsController.productionSetup) throw new Error('Connect OBS before preparing source slots.');
  return obsController.productionSetup(name => nodeConfig.set('ownedObsCollection', name));
}
registerIpc(IPC_COMMANDS.TEMPLATE_GET, async () => {
  try {
    let inputs = [], transitions = [], inputError = null;
    if (obsController?.getState().connected) { try { transitions = (await obsController.inspect()).transitions || []; inputs = await obsController.getVideoInputs(); } catch (_) { inputError = 'Could not read OBS video inputs. Reconnect OBS and reload.'; } }
    const current = templateSnapshot();
    const stingerStatus = (nodeConfig.get('obsStingerStatus') || {})[current.key];
    const obsState = obsController?.getState();
    const stingerCurrent = stingerStatus?.collectionKey === `${obsState?.host}:${obsState?.port}:${obsState?.collection || ''}` && stingerStatus?.planVersion === current.context.planVersion;
    let verifiedStinger = stingerCurrent ? stingerStatus : null;
    if (verifiedStinger?.state === 'configured') {
      try {
        const confirmed = await obsController._obs.call('GetCurrentSceneTransition');
        await require('node:fs/promises').access(verifiedStinger.path);
        if (confirmed.transitionName !== verifiedStinger.transitionName || confirmed.transitionSettings?.path !== verifiedStinger.path) throw new Error('OBS transition or media path changed.');
      } catch (_) { verifiedStinger = { state: 'unavailable', reason: 'Stinger needs verification. Check the media path in OBS, then resend the package.' }; }
    }
    return { ok: true, ...current, previewBase:`http://localhost:${HUD_PORT}`, teams:artworkCache().localize(currentShowConfig?.teams||[],`http://localhost:${HUD_PORT}`), inputs, transitions, inputError, hudSettings:hudControls.draftSettings(), available:obsTemplate.defaultTemplate(currentShowConfig,activeNodeId()).items, overlays: outputRegistry.catalogue().map(item => item.name), stingers: stingerPackage.STINGERS, stingerStatus:verifiedStinger, obsConnected: obsState?.connected === true };
  }
  catch (failure) { return { ok: false, error: failure.message }; }
});
registerIpc(IPC_COMMANDS.TEMPLATE_SAVE, (_event, input) => {
  try {
    const current = templateSnapshot();
    const draft = obsTemplate.validateTemplate(input, currentShowConfig, activeNodeId(), current.draft);
    nodeConfig.set('obsTemplateDrafts', { ...(nodeConfig.get('obsTemplateDrafts') || {}), [current.key]: draft });
    return { ok: true, draft, prepared: templateSnapshot().prepared };
  } catch (failure) { return { ok: false, error: failure.message }; }
});
registerIpc(IPC_COMMANDS.TEMPLATE_PUSH, (_event, input) => {
  showConfigTask = showConfigTask.catch(() => {}).then(async () => {
    try {
      await standaloneAccess();
      const current = templateSnapshot(), token = accountProductionActive()?airSession?.status().userId:nodeToken;
      const draft = obsTemplate.validateTemplate(input, currentShowConfig, activeNodeId(), current.draft);
      if (!obsController?.getState().connected) throw new Error('Connect OBS in Connections, then return here to send your screens.');
      const remoteObs = !remoteObsAssets.isLocalObsHost(obsController.getState().host);
      if (remoteObs && !draft.stinger.remoteShare) throw new Error('Remote OBS needs a shared stinger folder. Enter a UNC folder in Broadcast screens and retry.');
      const allowed = () => (accountProductionActive()?airSession?.status().userId:nodeToken) === token && !isProductionActive(showRunner) && !harness?.getStatus().allowObs && (() => { try { const context = templateSnapshot().context; return context.planVersion === draft.context.planVersion && context.showId === draft.context.showId && context.matchId === draft.context.matchId && context.nodeId === draft.context.nodeId; } catch (_) { return false; } })();
      if (!allowed()) throw new Error('Stop the show flow and OBS rehearsal before sending screens.');
      const inspection = await obsController.inspect();
      if (!allowed()) throw new Error('The selected match changed. Reload its template.');
      if (inspection.inspectionIncomplete || !inspection.collection) throw new Error('Could not confirm the OBS scene collection. Reconnect OBS and try sending again.');
      const collectionKey = `${obsController.getState().host}:${obsController.getState().port}:${inspection.collection || ''}`;
      const ownership = nodeConfig.get('obsTemplateScenes') || {};
      const rows = obsTemplate.templateRows(draft, outputRegistry);
      // Basic ESA_ scenes are created only for concepts the prepared screens do
      // not cover; ESA_Replay always exists because the replay flow targets it.
      const baseUrls = {}, baseScenes = [];
      for (const concept of basicScenesForRows(rows)) {
        let output = outputRegistry.list().find(item => item.overlay === concept.overlay && item.followMatch);
        if (!output) { outputRegistry.add({ name: concept.overlay.replaceAll('-', ' '), overlay: concept.overlay, followMatch: true }); output = outputRegistry.list().find(item => item.overlay === concept.overlay && item.followMatch); }
        baseUrls[concept.key] = output.url;
        baseScenes.push(concept.scene);
      }
      if (remoteObs) {
        const lanAddress = await remoteObsAssets.localAddressFor(obsController.getState().host, obsController.getState().port);
        for (const row of rows) row.url = remoteObsAssets.reachableHudUrl(row.url, lanAddress);
        for (const key of Object.keys(baseUrls)) baseUrls[key] = remoteObsAssets.reachableHudUrl(baseUrls[key], lanAddress);
        const probe = await fetch(`http://${lanAddress}:${HUD_PORT}/health`, { signal: AbortSignal.timeout(3000) });
        if (!probe.ok) throw new Error('The local HUD is not reachable on this PC’s LAN address. Check the network and firewall.');
      }
      const result = await obsController.pushTemplate(rows, ownership[collectionKey] || {}, owned => nodeConfig.set('obsTemplateScenes', { ...(nodeConfig.get('obsTemplateScenes') || {}), [collectionKey]: owned }), allowed, baseUrls, baseScenes);
      if (!allowed()) throw new Error('Setup changed during the send. OBS keeps its current scene; reload and retry.');
      const [streamState, recordState] = await Promise.all(['GetStreamStatus', 'GetRecordStatus'].map(name => obsController._obs.call(name)));
      if (streamState.outputActive || recordState.outputActive) throw new Error('OBS started output during setup. Stop streaming and recording, then resend.');
      const asset = await stingerPackage.provisionStinger({ sourceRoot: getHudRoot(), targetRoot: remoteObs ? draft.stinger.remoteShare : path.join(app.getPath('userData'), 'stingers'), id: draft.stinger.id });
      const stinger = await stingerPackage.configureStinger(obsController._obs, draft.stinger, asset);
      if (!allowed()) throw new Error('Setup changed during stinger configuration. Reopen the template.');
      nodeConfig.set('obsStingerStatus', { ...(nodeConfig.get('obsStingerStatus') || {}), [current.key]: { ...stinger, remoteObs, collectionKey, planVersion: draft.context.planVersion } });
      const mappings = { ...(nodeConfig.get('sceneMappings') || {}) };
      const defaults = new Map(normalizeRundown(currentShowConfig.rundown || []).map(item => [item.id, item]));
      for (const row of rows) mappings[row.id] = { scene: row.sceneName, transition: stinger.state === 'configured' ? { mode: 'stinger', name: stinger.transitionName } : mappings[row.id]?.transition || defaults.get(row.id)?.transition || undefined };
      await hudControls.applyDraft();
      configurationState = applyPublishedRundown(obsTemplate.templateRundown(currentShowConfig, draft), showRunner, mappings);
      if (!configurationState.applied) throw new Error(configurationState.reason || 'Stop the show flow, then send the screens again.');
      nodeConfig.set('sceneMappings', mappings);
      nodeConfig.set('obsTemplateDrafts', { ...(nodeConfig.get('obsTemplateDrafts') || {}), [current.key]: draft });
      nodeConfig.set('obsAppliedTemplates', { ...(nodeConfig.get('obsAppliedTemplates') || {}), [current.key]: draft });
      nodeConfig.set('obsAppliedTemplateCollections', { ...(nodeConfig.get('obsAppliedTemplateCollections') || {}), [current.key]: collectionKey });
      eventLogger?.log({ type: 'obs_template_sent', actor: 'operator', data: { screenCount: rows.length } });
      return { ok: true, draft, prepared: true, stinger, ...result };
    } catch (failure) { return { ok: false, error: failure.message || 'Could not send screens to OBS. Review setup and retry.' }; }
  });
  return showConfigTask;
});
registerIpc(IPC_COMMANDS.OBS_BUILD_COLLECTION, async () => {
  if (isProductionActive(showRunner) || harness?.getStatus().allowObs) return { ok: false, error: 'Stop the show flow and OBS rehearsal before switching collections.' };
  try {
    const outputUrls = {};
    for (const [key, overlay] of Object.entries(currentShowConfig.accountPackage ? {} : { holding: 'holding', gameplay: 'ingame', fullscreen: 'scoreboard', replay: 'replay', casters: 'casters' })) {
      let output = outputRegistry.list().find(item => item.overlay === overlay && item.followMatch);
      if (!output) { outputRegistry.add({ name: overlay.replaceAll('-', ' '), overlay, followMatch: true }); output = outputRegistry.list().find(item => item.overlay === overlay && item.followMatch); }
      outputUrls[key] = output.url;
    }
    const result = await productionSetup().build({ name: `Esportra · ${os.hostname().slice(0, 32)} · ${nodeConfig.get('nodeId')?.slice(0, 8) || 'Local'}`, ownedCollection: nodeConfig.get('ownedObsCollection'), outputUrls });
    await obsController.inspect();
    return { ok: true, ...result };
  } catch (failure) { return { ok: false, error: failure.message || 'Could not prepare broadcast collection.' }; }
});
registerIpc(IPC_COMMANDS.OBS_SLOT_STATUS, async () => {
  try { return { ok: true, ...(await productionSetup().inspect(nodeConfig.get('ownedObsCollection'))) }; }
  catch (failure) { return { ok: false, error: failure.message }; }
});
registerIpc(IPC_COMMANDS.OBS_SLOT_ASSIGN, async (_event, { slotId, sourceName } = {}) => {
  if (isProductionActive(showRunner) || harness?.getStatus().allowObs) return { ok: false, error: 'Stop the show flow and OBS rehearsal before changing source slots.' };
  try { return { ok: true, ...(await productionSetup().assign(nodeConfig.get('ownedObsCollection'), slotId, sourceName)) }; }
  catch (failure) { return { ok: false, error: failure.message || 'Could not assign this OBS input.' }; }
});

// ─── P1 IPC: OBS_TAKE ────────────────────────────────────────────────────────
// Studio-mode-aware scene transition targeting ≤100ms.

registerIpc(IPC_COMMANDS.OBS_TAKE, async (_event, { sceneName, transition } = {}) => {
  try{await standaloneTakeAccess();}catch(error){return {ok:false,error:error.message};}
  if (!obsController) return { ok: false, error: 'OBS is not connected.' };
  if (!sceneName || typeof sceneName !== 'string') {
    return { ok: false, error: 'sceneName is required.' };
  }
  if (sceneName.length > 256) {
    return { ok: false, error: 'sceneName must be 256 characters or fewer.' };
  }
  if (showRunner?.isTechPaused() || showRunner?.isTimeoutPaused()) return { ok: false, error: showRunner.isTechPaused() ? 'tech_pause' : 'timeout' };
  if (pendingManualTake && pendingManualTake.expiresAt > Date.now()) return { ok: false, error: 'Wait for OBS to confirm the previous take.' };
  const pending = { scene: sceneName, showId: currentShowConfig?.showId, expiresAt: Date.now() + 5000 };
  pendingManualTake = pending;
  try {
    const result = await obsController.take(sceneName, transition);
    if (result.ok) confirmManualTake(obsController.getTally());
    else if (pendingManualTake === pending) pendingManualTake = null;
    return result;
  } catch (failure) { if (pendingManualTake === pending) pendingManualTake = null; return { ok: false, error: failure.message || 'OBS take failed.' }; }
});

// ─── P1 IPC: OBS_TRIGGER_REPLAY ──────────────────────────────────────────────
// Save replay buffer → ESA_Replay → return to previous scene after dwell.

registerIpc(IPC_COMMANDS.OBS_TRIGGER_REPLAY, async (_event, opts = {}) => {
  if (!obsController) return { ok: false, error: 'OBS is not connected.' };
  if (showRunner?.isTechPaused() || showRunner?.isTimeoutPaused()) return { ok: false, error: showRunner.isTechPaused() ? 'tech_pause' : 'timeout' };
  let dwellMs;
  if (opts.dwellMs !== undefined) {
    const d = Number(opts.dwellMs);
    if (!Number.isFinite(d) || d < 0 || d > 60000) {
      return { ok: false, error: 'dwellMs must be a number between 0 and 60000.' };
    }
    dwellMs = d;
  }
  return obsController.triggerReplay({ dwellMs });
});

// ─── P2 IPC: ShowRunner autopilot ─────────────────────────────────────────────

registerIpc(IPC_COMMANDS.SHOW_APPLY_PENDING, () => {
  showConfigTask = showConfigTask.then(() => {
    const saved = pendingShowConfig || nodeConfig.get('showConfig');
    return saved ? receiveShowConfig(saved) : { ok: false, error: 'No saved show configuration.' };
  });
  return showConfigTask;
});
registerIpc(IPC_COMMANDS.SHOW_SELECT_MATCH, (_event, { matchCode } = {}) => {
  showConfigTask = showConfigTask.catch(()=>{}).then(async () => {
    try{await standaloneAccess();}catch(error){return {ok:false,error:error.message};}
    if (!currentShowConfig?.matches?.some(match => match.matchCode === matchCode)) return { ok: false, error: 'Choose a configured match.' };
    if (isProductionActive(showRunner) || broadcastGep.getStatus().active) return { ok: false, error: 'Finish the rundown and stop capture before changing matches.' };
    try {
      const selected = selectShowMatch({ ...currentShowConfig, preferredMatchCode: matchCode }, matchCode);
      if (runtimeMode === 'production') {
      const cache = artworkCache(); cache.required.clear(); cache.unsupported.clear(); cache.register(require('./artwork-cache').readCatalog(getHudRoot())); cache.register(selected); void prepareArtwork(cache);
      await applyShowConfigToHud(selected);
    }
      if(currentShowConfig?.selectedMatchId!==selected.selectedMatchId){pauseRules?.stop();showRunner?.resetForMatch();obsController?.cancelReplay?.();standaloneManualScope=null;}
      if (showRunner && runtimeMode === 'production') configurationState = applyRundown(selected, showRunner, nodeConfig.get('sceneMappings') || {});
      if (productionFeed.matchCode !== selected.matchCode || currentShowConfig?.showId !== selected.showId) { productionFeed.reset(selected.matchCode); rulesEngine?.dispose(); }
      gepRoute.reset();
      currentShowConfig = selected; lanRelay?.updateContext({showId:selected.showId,matchCode:selected.matchCode,label:(selected.teams || []).map(team=>team.name).join(' vs ')}); nodeConfig.set('selectedMatchCode', matchCode); nodeConfig.set('showConfig', selected);
      await seedProductionFeed(selected);
      hudServer?.notifyOutputsChanged();
      switchSessionSources();
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  return showConfigTask;
});
registerIpc(IPC_COMMANDS.RUNNER_STOP, () => {
  standaloneManualScope=null;
  if (showRunner?.getState().segments.some(segment => segment.state === 'taking')) return { ok: false, error: 'Wait for the current transition to finish.' };
  showRunner?.loadRundown([]); eventLogger?.log({ type: 'rundown_stopped', actor: 'operator' });
  return { ok: true };
});
registerIpc(IPC_COMMANDS.RUNNER_LOAD_RUNDOWN, (_event, { segments } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!Array.isArray(segments)) return { ok: false, error: 'segments must be an array.' };
  if (isProductionActive(showRunner)) return { ok: false, error: 'Finish the active rundown before replacing it.' };
  try { showRunner.loadRundown(normalizeRundown(segments)); } catch (error) { return { ok: false, error: error.message }; }
  if (eventLogger) eventLogger.log({ type: 'rundown_loaded', actor: 'operator', data: { count: segments.length } });
  return { ok: true };
});

registerIpc(IPC_COMMANDS.RUNNER_START, async () => {
  try {await standaloneAccess();}catch(error){return {ok:false,error:error.message};}
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!obsController?.getState().connected) return { ok: false, error: 'Connect OBS before starting the rundown.' };
  if (showRunner.getState().activeSegment) return { ok: false, error: 'The rundown is already active.' };
  if (!showRunner.getState().segments.some(segment => segment.state === 'queued')) return { ok: false, error: 'No queued segments. Send your show configuration from the website.' };
  if (!obsController.inspect) return { ok: false, error: 'This switcher does not support rundown readiness checks.' };
  const inspection = await obsController.inspect();
  if (!inspection.connected || inspection.inspectionIncomplete) return { ok: false, error: 'Could not verify OBS readiness. Reconnect OBS and retry.' };
  const missing = require('./scene-mapping').missingScenes(showRunner.getState().segments, inspection.scenes);
  if (missing.length) return { ok: false, error: `Prepare or map these missing scenes before starting: ${missing.join(', ')}` };
  if (showRunner.getState().activeSegment) return { ok: false, error: 'The rundown is already active.' };
  showRunner.start();
  if (eventLogger) eventLogger.log({ type: 'rundown_started', actor: 'operator' });
  return { ok: true };
});

registerIpc(IPC_COMMANDS.RUNNER_HOLD, (_event, { segmentId } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!segmentId)  return { ok: false, error: 'segmentId required.' };
  const result = showRunner.hold(segmentId);
  if (result.ok && eventLogger) eventLogger.log({ type: 'cmd_hold', segmentId, actor: 'operator' });
  return result;
});

registerIpc(IPC_COMMANDS.RUNNER_SKIP, (_event, { segmentId } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!segmentId)  return { ok: false, error: 'segmentId required.' };
  const result = showRunner.skip(segmentId);
  if (result.ok) scheduleRundownBoundary();
  if (result.ok && eventLogger) eventLogger.log({ type: 'cmd_skip', segmentId, actor: 'operator' });
  return result;
});

registerIpc(IPC_COMMANDS.RUNNER_TAKE, async (_event, { segmentId, commandId } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!segmentId)  return { ok: false, error: 'segmentId required.' };
  const result = await showRunner.take(segmentId, { commandId });
  if (result.ok && eventLogger) eventLogger.log({ type: 'cmd_take', segmentId, actor: 'operator' });
  return result;
});

registerIpc(IPC_COMMANDS.RUNNER_RESUME, () => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  showRunner.resume();
  if (eventLogger) eventLogger.log({ type: 'cmd_resume', actor: 'operator' });
  return { ok: true };
});

registerIpc(IPC_COMMANDS.RUNNER_TECH_PAUSE, () => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  showRunner.techPause();
  if (eventLogger) eventLogger.log({ type: 'cmd_tech_pause', actor: 'operator' });
  return { ok: true };
});
registerIpc(IPC_COMMANDS.RUNNER_TIMEOUT, (_event, active) => {
  if (runtimeMode !== 'production' || typeof active !== 'boolean') return { ok: false, error: 'Choose a valid timeout state in production mode.' };
  showRunner.setTimeoutPaused(active);
  eventLogger?.log({ type: active ? 'cmd_timeout_started' : 'cmd_timeout_ended', actor: 'operator' });
  return { ok: true };
});

// Sponsor proof is durably queued with its original show and placement identity.
function recordSponsorSlot(input, actor) {
  const result = sponsorLedger.record(currentShowConfig, input);
  eventLogger?.log({ type: input.action === 'start' ? 'SponsorImpressionStarted' : 'SponsorImpressionEnded', actor, showId: result.showId, segmentId: result.impression.segmentId, data: { sponsorId: result.impression.sponsorId, slotType: result.impression.slotType, wallClockMs: Date.now() } });
  return result;
}
registerIpc(IPC_COMMANDS.RUNNER_SPONSOR_SLOT, (_event, input) => {
  try { return recordSponsorSlot(input, 'operator'); }
  catch (failure) { return { ok: false, error: failure.message || 'Could not record sponsor placement.' }; }
});

// ─── P2 IPC: FIX_DATA ────────────────────────────────────────────────────────
async function displayFixRequest(input) {
  const show = currentShowConfig;
  if (!currentAuthorized() || !hudServer || !show?.selectedMatchId) return { ok: false, error: 'Sign in and choose a match before fixing its on-air data.' };
  try {
    const response = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${show.matchCode}/display-fixes`, { method: input ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY }, ...(input ? { body: JSON.stringify(input) } : {}), timeout: 3000 });
    const status = await response.json();
    if (!response.ok) return { ok: false, error: status.error || 'Could not update the local HUD.' };
    if (input) eventLogger?.log({ type: 'fix_data', showId: show.showId, actor: 'operator', data: { kind: 'display_override', action: status.action.action, field: status.action.field, onAirApplied: true } });
    if (currentShowConfig?.showId !== show.showId || currentShowConfig?.selectedMatchId !== show.selectedMatchId) return { ok: false, error: 'The selected match changed. Reopen data fixes to review it.' };
    return { ok: true, status, context: { showId: show.showId, matchId: show.selectedMatchId, matchCode: show.matchCode, nodeId: activeNodeId() }, officialResultChanged: false };
  } catch (_) { return { ok: false, error: 'Could not reach the local HUD. Check Readiness and retry.' }; }
}
registerIpc(IPC_COMMANDS.DISPLAY_FIX_GET, () => displayFixRequest());
registerIpc(IPC_COMMANDS.DISPLAY_FIX_CHANGE, (_event, { input, context } = {}) => {
  if (!context || context.showId !== currentShowConfig?.showId || context.matchId !== currentShowConfig?.selectedMatchId || context.matchCode !== currentShowConfig?.matchCode || context.nodeId !== activeNodeId()) return { ok: false, error: 'The match or pairing changed. Reload its on-air data before applying a fix.' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Choose an on-air fix.' };
  return displayFixRequest(input);
});

registerIpc(IPC_COMMANDS.FIX_DATA, async (_event, correction = {}) => {
  if (standaloneActive()) return {ok:false,error:'Official tournament result submission is unavailable for independent projects. Edit the independent match result in its project instead.'};
  if (!currentAuthorized()) return { ok: false, error: 'Sign in to Air before correcting a map result.' };
  const config = currentShowConfig, token = nodeToken;
  let scope;
  try {
    scope = correctionScope(config, activeNodeId());
    validateCorrectionScope(correction.context, scope);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (correction.matchCode !== scope.matchCode) return { ok: false, error: 'The selected match changed. Reopen the correction.' };
  const result = await fixData({ ...correction, matchCode: scope.matchCode }, {
    showConfig: config,
    hudPort:     HUD_PORT,
    hudKey:      HUD_KEY,
    offlineQueue: currentShowConfig?.accountPackage ? null : offlineQueue,
  });
  if ((result.ok || result.queued) && eventLogger) {
    eventLogger.log({ showId: scope.showId, type: 'fix_data', actor: 'operator', data: { matchCode: scope.matchCode, mapIndex: correction.mapIndex, teamAScore: correction.teamAScore, teamBScore: correction.teamBScore, onAirApplied: result.ok === true } });
  }
  return { ...result, scopeChanged: token !== nodeToken || currentShowConfig?.showId !== scope.showId || currentShowConfig?.selectedMatchId !== scope.matchId };
});

// Rehearsal never invokes the live runner, event logger or result submission.
async function controlRehearsal(input) {
  if (!harness || !hudServer) return { ok: false, error: 'Local HUD is unavailable.' };
  const sampleMatch = input?.action === 'load' && currentShowConfig?.teams?.length === 2 ? { title: currentShowConfig.title || 'Practice broadcast', teams: currentShowConfig.teams.slice(0, 2).map(team => ({ name: String(team.name || 'Team').slice(0, 80), tag: String(team.tag || '').slice(0, 12), logo: team.logoUrl || team.logo || '' })) } : null;
  try {
    const selectedSettings = input?.action === 'load' && currentShowConfig?.selectedMatchId ? hudControls?.draftSettings() || null : null;
    const sampleHudSettings = selectedSettings ? { ...selectedSettings, layers: require('./hud-elements').withMandates(selectedSettings.layers || {}, currentShowConfig.requiredHudElements || []) } : null;
    return { ok: true, status: await harness.control({ ...input, ...(input?.action === 'load' ? { sampleMatch, sampleHudSettings } : {}) }) };
  }
  catch (failure) { return { ok: false, error: failure.message || 'Rehearsal failed.' }; }
}
registerIpc(IPC_COMMANDS.SIMULATION_START, () => controlRehearsal({ action: 'load' }));
registerIpc(IPC_COMMANDS.SIMULATION_CONTROL, (_event, input) => controlRehearsal(input));
registerIpc(IPC_COMMANDS.SIMULATION_STATUS, () => ({ ok: true, status: harness?.getStatus() || null }));
registerIpc(IPC_COMMANDS.SIMULATION_STOP, () => controlRehearsal({ action: 'pause' }));
// Import a recorded match (.ndjson) from the HUD server's event log. The file
// is chosen in the main process; the renderer never reads arbitrary paths.
registerIpc(IPC_COMMANDS.SIMULATION_IMPORT, async () => {
  if (!harness) return { ok: false, error: 'Rehearsal runs on the production PC.' };
  const { dialog } = require('electron');
  const { parseRecording } = require('./simulation/ndjson');
  const chosen = await dialog.showOpenDialog(mainWindow, {
    title: 'Import a recorded match',
    properties: ['openFile'],
    filters: [{ name: 'Recorded match', extensions: ['ndjson'] }],
  });
  if (chosen.canceled || !chosen.filePaths?.length) return { ok: false, canceled: true, error: 'No recording chosen.' };
  const file = chosen.filePaths[0];
  let text;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('Choose a recorded match file.');
    if (stat.size > 20 * 1024 * 1024) throw new Error('This recording is larger than 20 MB. Record a shorter match.');
    text = fs.readFileSync(file, 'utf8');
  } catch (failure) { return { ok: false, error: failure.message || 'Could not read the recording.' }; }
  try {
    const { events, durationMs } = parseRecording(text);
    const status = await harness.loadRecording(events, path.basename(file));
    eventLogger?.log({ type: 'rehearsal_import', actor: 'operator', data: { file: path.basename(file), events: events.length, durationMs } });
    return { ok: true, status, durationMs };
  } catch (failure) { return { ok: false, error: failure.message || 'Could not import the recording.' }; }
});

// ─── Broadcast GEP controls ───────────────────────────────────────────────────
const broadcastGep = require('./broadcast-gep');
broadcastGep.setStatusCallback(status => {
  if (mainWindow) mainWindow.webContents.send('BROADCAST_STATUS_CHANGED', status);
});

registerIpc(IPC_COMMANDS.BROADCAST_STATUS, () => broadcastGep.getStatus());

registerIpc(IPC_COMMANDS.BROADCAST_SEND_SET, (_event, { sending } = {}) => {
  if (typeof sending !== 'boolean') return { ok: false, error: 'Choose whether this observer sends game data.' };
  if (runtimeMode !== 'capture-only' || !lanRelay) return { ok: false, error: 'Sending is controlled on the observer PC.' };
  try { return { ok: true, status: lanRelay.setSending(sending) }; }
  catch (failure) { return { ok: false, error: failure.message || 'Could not change sending.' }; }
});

registerIpc(IPC_COMMANDS.START_BROADCAST, async (_event, { matchCode, captureRole, playerId } = {}) => {
  try {await standaloneAccess();}catch(error){return {ok:false,error:error.message};}
  if (matchCode !== undefined && (typeof matchCode !== 'string' || !/^[A-Z0-9_-]{1,64}$/i.test(matchCode))) return { ok: false, error: 'Invalid match code.' };
  const mode = runtimeMode || (nodeConfig ? nodeConfig.get('mode') : 'production');
  const gepTargetUrl = mode === 'capture-only'
    ? `ws://127.0.0.1:${nodeConfig.get('lanRelayPort')}`
    : undefined;
  if (runtimeMode === 'production' && (captureRole || 'observer') === 'observer' && primaryObserver() !== 'local') return {ok:false,error:'Another observer supplies the HUD. Select This PC in Connections before starting local observer capture.'};
  const linked = mode === 'capture-only' ? require('./observer-routing').matchContext(nodeConfig.get('captureMatchContext')) : null;
  if (linked && matchCode && matchCode.toUpperCase() !== linked.matchCode) return {ok:false,error:'Match code differs from the accepted production match. Use its match code or accept the new request first.'};
  const result = await broadcastGep.start({ hudKey: HUD_KEY, hudPort: HUD_PORT, matchCode: linked?.matchCode || matchCode || currentShowConfig?.matchCode || 'MAIN', gepTargetUrl, showId: linked?.showId || currentShowConfig?.showId, captureRole, playerId });
  if (result.ok) nodeConfig.set('captureRole', captureRole || 'observer');
  return result;
});

registerIpc(IPC_COMMANDS.STOP_BROADCAST, () => broadcastGep.stop());
registerIpc(IPC_COMMANDS.CAPTURE_MARKER, (_event, kind) => {
  if (runtimeMode !== 'capture-only' || !lanRelay || !['replay', 'flag'].includes(kind)) return { ok: false, error: 'Observer markers require capture mode.' };
  const capture = broadcastGep.getStatus();
  lanRelay.sendMarker(kind, { matchCode: capture.active ? capture.matchCode : currentShowConfig?.matchCode || 'MAIN', showId: capture.active ? capture.showId : currentShowConfig?.showId });
  return { ok: true };
});

// P3: support diagnostics export (deep-redacted JSON).
registerIpc(IPC_COMMANDS.DIAGNOSTICS_EXPORT, async () => {
  const { dialog } = require('electron');
  const fs = require('node:fs');
  return require('./diagnostics').exportReport({
    dialog,
    mainWindow,
    fs,
    collect: () => ({
      appVersion: APP_VERSION,
      mode: runtimeMode,
      node: { nodeId: nodeConfig?.get('nodeId') || null, paired: nodeToken !== null, nodeName: os.hostname() },
      show: currentShowConfig ? { showId: currentShowConfig.showId || null, matchId: currentShowConfig.selectedMatchId || null, matchCode: currentShowConfig.matchCode || null, source: currentShowConfig.source || null, rundownVersion: currentShowConfig.rundownVersion || null } : null,
      lifecycle: liveLifecycle ? liveLifecycle.snapshot() : null,
      veto: liveLifecycle ? liveLifecycle.vetoSnapshot() : null,
      events: eventLogger?.getLog(250) || [],
      extras: { hudOnline: hudServer !== null, hubConnected, gepActive: broadcastGep.getStatus().active, pendingRecords: offlineQueue ? offlineQueue.getPendingCount() : 0, outputs: (outputRegistry?.list() || []).map(output => ({ id: output.id, overlay: output.overlay, type: output.type })) },
    }),
  });
});

// ─── Update guard ─────────────────────────────────────────────────────────────
function isBroadcastActive() {
  const hudActive = hudServer !== null && hudServer.clientCount > 0;
  const gepActive = broadcastGep.getStatus().active;
  return hudActive || gepActive;
}
// When electron-updater is added: before autoUpdater.downloadUpdate(), check !isBroadcastActive()

// ─── HUD server lifecycle ─────────────────────────────────────────────────────
// The HUD binds 0.0.0.0 so OBS on other PCs can read it, but Windows still lets
// a second HUD bind 127.0.0.1:5300 — and loopback then prefers that process, so
// every local write reaches a HUD started with a different key. Probe an
// authenticated no-op route: our HUD answers 404, a foreign key answers 401.
async function hudIdentity() {
  try {
    const res = await fetch(`http://127.0.0.1:${HUD_PORT}/api/MAIN/__air_identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body: '{}',
      signal: AbortSignal.timeout(1500),
    });
    if (res.status === 404) return 'ours';
    if (res.status === 401) return 'foreign';
    return 'unknown';
  } catch (_) {
    return 'down';
  }
}

function activeSessionId() {
  if (!currentShowConfig) return null;
  if (currentShowConfig.source === 'standalone') return currentShowConfig.showId || null;
  if (!currentShowConfig.accountPackage) return null;
  return airSession?.status()?.workspaces?.[0]?.id || nodeConfig?.get('airSessionId') || null;
}
function resolveSessionSource(id, kind, screenId) {
  if (!currentShowConfig || !id || id !== activeSessionId()) return null;
  if (!currentShowConfig.accountPackage && currentShowConfig.source !== 'standalone') return null;
  if (kind === 'ingame') return { matchCode: currentShowConfig.matchCode || 'MAIN', overlay: 'ingame' };
  if (kind === 'graphics') return { matchCode: currentShowConfig.matchCode || 'MAIN', overlay: 'graphics' };
  if (kind === 'screen') {
    const rows = Array.isArray(currentShowConfig.rundown) ? currentShowConfig.rundown : [];
    const row = rows.find(item => String(item.id) === String(screenId)) || rows.find(item => String(item.overlay) === String(screenId));
    if (!row || !/^[\w-]+$/.test(row.overlay || '')) return null;
    return { matchCode: currentShowConfig.matchCode || 'MAIN', overlay: row.overlay };
  }
  return null;
}
function switchSessionSources() {
  const id = activeSessionId();
  if (!id) return;
  try { hudServer?.switchSession(id); } catch (_) { /* The next status poll and output resync recover. */ }
}

async function startHudServer() {
  const { start: startHud } = require('../esportra-valorant-hud/server/server');
  const hudRoot = getHudRoot();
  const hudDataDir = getHudDataDir();
  try {
    hudServer = await startHud({ port: HUD_PORT, host: '0.0.0.0', key: HUD_KEY, root: hudRoot, dataDir: hudDataDir, resolveOutput: id => outputRegistry?.resolve(id), resolveSession: resolveSessionSource, resolveAsset:id=>airSession?.store?.asset(id), artwork:()=>artworkCache(), onState: (code, state) => productionFeed.update(code, state), onGep: (code, state, events, reported, metadata) => {
      const selected = currentShowConfig?.matchCode || 'MAIN';
      if (productionFeed.matchCode !== selected) productionFeed.reset(selected);
      if (!productionFeed.accept(code, state, events, reported, metadata?.captureAt)) return;
      productionFeed.recordPackets(code, metadata?.messages || []);
      void syncHudNicknames().catch(() => {});
      for (const event of events) {
        const chapter = roundChapters.record(event, state, currentShowConfig, metadata?.captureAt);
        if (chapter) eventLogger?.log(chapter);
        eventLogger?.log({ type: `Game_${event.type}`, actor: 'game-feed', data: { round: state.round?.number, ...(Number.isInteger(event.team) ? { team: event.team } : {}) } });
        const recent = !metadata?.captureAt || Date.now()-metadata.captureAt <= 3000 && metadata.captureAt <= Date.now()+3000;
        if (!metadata?.recovered && recent) liveLifecycle?.onGepEvent(event);
        if (!metadata?.recovered) showRunner?.processGepEvent({ ...event, state, nativeHud: true }, code);
      }
    } });
    if (await hudIdentity() !== 'ours') {
      hudServer.stop();
      hudServer = null;
      hudStartErrorCode = 'PORT_IN_USE_BY_OTHER_APP';
      console.error(`[broadcast] Port ${HUD_PORT} is answered by another HUD with a different key. Close the other Esportra HUD (for example the test.bat window) and restart Esportra Air.`);
      return false;
    }
    console.log(`[broadcast] HUD outputs available on the local network, port ${HUD_PORT}`);
    hudStartErrorCode = null;
    persistentError = false;
    return true;
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`[broadcast] Port ${HUD_PORT} is in use — close other Esportra tools and restart.`);
      hudStartErrorCode = 'EADDRINUSE';
    } else {
      console.error('[broadcast] HUD server failed to start:', err.message);
      hudStartErrorCode = err.code || 'START_FAILED';
    }
    hudServer = null;
    return false;
  }
}

// ─── Health-check + crash recovery ────────────────────────────────────────────
const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS = 3;
let restartCount = 0;
let restartWindowStart = Date.now();
let healthCheckInterval = null;
let persistentError = false;

function startHealthCheck() {
  healthCheckInterval = setInterval(async () => {
    if (persistentError) return;
    try {
      const identity = await hudIdentity();
      if (identity === 'ours') { hudStartErrorCode = null; return; }
      if (identity === 'foreign') {
        if (hudStartErrorCode !== 'PORT_IN_USE_BY_OTHER_APP') console.warn(`[broadcast] Another HUD is answering 127.0.0.1:${HUD_PORT} with a different key. Close it so local graphics reach Esportra Air.`);
        hudStartErrorCode = 'PORT_IN_USE_BY_OTHER_APP';
        return;
      }
    } catch (_) {}

    console.warn('[broadcast] HUD health check failed — attempting restart');
    hudServer = null;

    const now = Date.now();
    if (now - restartWindowStart > RESTART_WINDOW_MS) {
      restartCount = 0;
      restartWindowStart = now;
    }
    restartCount++;

    if (restartCount > MAX_RESTARTS) {
      console.error('[broadcast] HUD server restart limit reached — manual restart required');
      persistentError = true;
      if (mainWindow) mainWindow.webContents.send('HUD_PERSISTENT_ERROR', { message: 'HUD server failed repeatedly. Restart Esportra Broadcast.' });
      return;
    }

    const ok = await startHudServer();
    if (ok && mainWindow) mainWindow.webContents.send('HUD_RESTARTED');
  }, 5000);
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
if (isPrimaryInstance) app.whenReady().then(async () => {
  // 1. Load node config — must be first (mode determines which modules start).
  nodeConfig = new NodeConfig();
  sponsorLedger = new (require('./sponsor-ledger'))({ config: nodeConfig, queue: () => currentShowConfig?.accountPackage?packageBridge?.eventQueue:standaloneActive()?airSession?.eventQueue:offlineQueue });
  // Sponsor bug automation: every five minutes for ten seconds while a live
  // show is on air. Main-process timers keep the cycle running while the Air
  // window is minimised, and proofs use the same ledger as a manual read.
  sponsorAutomation = new (require('./sponsor-automation')).SponsorAutomation({
    context: () => {
      if (runtimeMode !== 'production' || !isProductionActive(showRunner)) return null;
      const show = currentShowConfig;
      if (!show || !show.selectedMatchId || (!show.accountPackage && show.source !== 'standalone')) return null;
      const sponsors = (show.sponsors || []).map(sponsor => sponsor.sponsorId || sponsor.id).filter(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
      return sponsors.length ? { sponsors } : null;
    },
    start: async sponsorId => {
      await hudControls.setLayer('sponsor', true, 'automation');
      try { recordSponsorSlot({ action: 'start', sponsorId, slotType: 'scorebug' }, 'system'); }
      catch (error) {
        try { await hudControls.setLayer('sponsor', false, 'automation'); } catch (_) { /* HUD already gone. */ }
        throw error;
      }
    },
    end: async sponsorId => {
      let ledgerError = null;
      try { recordSponsorSlot({ action: 'end', sponsorId, slotType: 'scorebug' }, 'system'); }
      catch (error) { ledgerError = error; }
      try { await hudControls.setLayer('sponsor', false, 'automation'); }
      catch (error) { eventLogger?.log({ type: 'sponsor_automation_layer_failed', actor: 'system', data: { message: error.message } }); }
      if (ledgerError) throw ledgerError;
    },
    log: entry => eventLogger?.log(entry),
  });
  sponsorAutomation.run();
  syncGlobalShortcuts();
  outputRegistry = new OutputRegistry({ config: nodeConfig, hudRoot: getHudRoot(), port: HUD_PORT, currentMatch: () => currentShowConfig?.matchCode || 'MAIN' });
  const mode = resolveMode(nodeConfig);
  runtimeMode = mode;
  if(!nodeConfig.get('airDeviceId'))nodeConfig.set('airDeviceId',crypto.randomUUID());
  airSession=new (require('./air-session').AirSession)({apiBase:API_BASE,fetch,keytar,service:KEYTAR_SERVICE,root:path.join(app.getPath('userData'),'air-workspaces'),deviceId:nodeConfig.get('airDeviceId'),deviceName:os.hostname(),mode});

  // P2: Initialize ShowRunner, EventLogger, and RulesEngine.
  // OBS controller wired lazily in getOrCreateVideoController(); offlineQueue
  // wired after pairing succeeds.
  showRunner  = new ShowRunner({ obsController: null, hudPatch: applyHudPatch, logger: console });
  eventLogger = new EventLogger({ offlineQueue: null, logger: console });
  rulesEngine = new RulesEngine({ hudPatch: applyHudPatch, logger: console });
  try { rulesEngine.setDurations(nodeConfig.get('graphicsDurations') || {}); } catch (_) { console.warn('[rules] Invalid saved durations. Using defaults.'); }
  showRunner.setRulesEngine(rulesEngine);
  if (mode === 'production') {
    const { PauseRules } = require('./pause-rules');
    let config;
    try { config = require('./pause-rules').validatePauseRules(nodeConfig.get('pauseRules') || {}); } catch (_) { config = {}; }
    pauseRules = new PauseRules({ config, getScope: () => currentAuthorized() && currentShowConfig?.selectedMatchId ? { showId: currentShowConfig.showId, matchId: currentShowConfig.selectedMatchId, matchCode: currentShowConfig.matchCode, nodeId: activeNodeId() } : null, getObs: () => obsController, patch: async (code, input) => {
      const response = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${code}/pause-panel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY }, body: JSON.stringify(input), timeout: 3000 });
      if (!response.ok) throw new Error('Could not apply the pause panel.');
    }, record: entry => eventLogger.log(entry) });
  }
  if (mode === 'production') {
    let lastFeedPaused = null;
    feedDiagnosticsTimer = setInterval(() => {
      pauseRules?.update(showRunner.getState());
      for (const output of outputRegistry?.list() || []) {
        const health = hudServer?.getOutputHealth(output.id);
        if (health?.connectionCount > 0) incidents.update('output_drop', false, currentShowConfig?.showId, { outputId: output.id });
        else if (incidents.states.has(`${currentShowConfig?.showId}:output_drop:${output.id}`)) incidents.update('output_drop', true, currentShowConfig?.showId, { outputId: output.id });
      }
      const snapshot = productionFeed.snapshot();
      const key = `${snapshot.matchCode}:${snapshot.stale}`;
      // Rejected observer packets surface as their own incident so a misrouted
      // observer is visible instead of looking like a dead feed.
      incidents.update('gep_route_mismatch', gepRoute.active(), currentShowConfig?.showId, { cause: 'misconfigured_observer' });
      if (!hudServer || !snapshot.available || lastFeedPaused === key) return;
      lastFeedPaused = key;
      incidents.update('stale_feed', snapshot.stale, currentShowConfig?.showId, { cause: 'missing_events' });
      void applyHudPatch(snapshot.matchCode, { airDiagnostics: { feedPaused: snapshot.stale } }).catch(() => { lastFeedPaused = null; });
    }, 500);
  }

  // Forward ShowRunner events to renderer.
  showRunner.on('stateChange', (state) => {
    pauseRules?.update(state);
    if (mainWindow) mainWindow.webContents.send('runner-state', state);
  });
  showRunner.on('takeConfirmed', ({ segment, actor, cause }) => {
    scheduleRundownBoundary();
    if (eventLogger) eventLogger.log({
      type:      'SegmentTake',
      actor:     actor || 'operator',
      segmentId: segment.id,
      scene:     segment.scene,
      data: {
        segmentId:   segment.id,
        segmentName: segment.name,
        segmentType: segment.type,
        scene:       segment.scene,
        wallClockMs: Date.now(),
        actorKind: actor || 'operator', cause: cause || 'manual',
      },
    });
  });
  showRunner.on('segmentDone', ({ segment }) => {
    if (eventLogger) eventLogger.log({
      type:      'SegmentDone',
      actor:     'show-runner',
      segmentId: segment.id,
      scene:     segment.scene,
      data: {
        segmentId:   segment.id,
        segmentName: segment.name,
        segmentType: segment.type,
        scene:       segment.scene,
        wallClockMs: Date.now(),
      },
    });
  });
  showRunner.on('error', (err) => {
    if (eventLogger) eventLogger.log({ type: 'runner_error', actor: 'runner', data: { message: err.message } });
  });

  // Forward EventLogger entries to renderer.
  eventLogger.on('entry', (entry) => {
    if (mainWindow) mainWindow.webContents.send('event-log-entry', entry);
  });

  if (mode === 'production') {
    const { Rehearsal } = require('./simulation/rehearsal');
    harness = new Rehearsal({ previewBase:`http://localhost:${HUD_PORT}`, hudPatch: applyHudPatch,
      writeSnapshot: async (code, state) => {
        if (!hudServer) throw new Error('Local HUD is unavailable.');
        hudServer.writeSimulation(code, state, true);
      },
      canUseObs: () => false, // Practice must never switch the real Program output.
      takeScene: async () => {throw new Error('Practice is isolated from OBS.');},
      getTally: () => obsController?.getTally(),
    });
  }

  // 2. Mode-specific boot.
  if (mode === 'production') {
    // a. Start HUD server and health monitor.
    await startHudServer();
    startHealthCheck();

    // b. If this node was previously paired, restore the hub connection.
    const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_NODE_TOKEN_ACCOUNT);
    if (stored) {
      nodeToken = stored;
      offlineQueue = new OfflineQueue({ nodeToken, logger: console });
      hubClient = createHubClient(offlineQueue);
      hubClient.connect(nodeToken);
    }

    // c. LAN relay for production mode — connects to observer PC(s) if configured.
    const relayTargets = nodeConfig.get('lanRelayTargets');
    if (Array.isArray(relayTargets) && relayTargets.length > 0) {
      const LanRelay = require('./lan-relay');
      const targetKeys = {};
      for (const target of relayTargets) targetKeys[target] = await keytar.getPassword(KEYTAR_SERVICE, 'relay:' + target) || '';
      lanRelay = new LanRelay({
        mode: 'production',
        context:currentShowConfig ? {showId:currentShowConfig.showId,matchCode:currentShowConfig.matchCode,label:(currentShowConfig.teams||[]).map(team=>team.name).join(' vs ')} : null,
        targets: relayTargets,
        targetKeys,
        logger: console,
        onMarker: (marker, context) => {
          if (!currentShowConfig || !acceptsGep(context, currentShowConfig)) return;
          eventLogger?.log({ type: marker.kind === 'replay' ? 'ObserverReplayMarker' : 'ObserverProducerFlag', actor: 'observer' });
          if (marker.kind === 'flag' && !context.recovered && context.bufferedAgeMs <= 1000) showRunner?.processGepEvent({ type: 'observer.flag', state: productionFeed.state }, currentShowConfig.matchCode);
        },
        onGepState: async (gepMessage, context) => {
          if (!hudServer) throw new Error('Local HUD is unavailable.');
          gepMessage = require('./observer-routing').routedPacket(gepMessage,context.target,primaryObserver());
          if (!gepMessage) return;
          if (!currentShowConfig || !acceptsGep(context, currentShowConfig)) { gepRoute.reject(); return; }
          gepRoute.accept();
          const code = currentShowConfig.matchCode || 'MAIN';
          const result = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${encodeURIComponent(code)}/ingest/valorant?ageMs=${context.bufferedAgeMs || 0}&recovered=${context.recovered ? 1 : 0}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
            body: JSON.stringify([gepMessage]),
            signal: AbortSignal.timeout(5000),
          });
          if (!result.ok) throw new Error('The local HUD did not accept this observer update.');
        },
      });
      lanRelay.start();
    }
  } else if (mode === 'capture-only') {
    // LAN relay observer mode — open WS server; ow-electron sends GEP to it.
    const LanRelay = require('./lan-relay');
    relaySharedKey = await keytar.getPassword(KEYTAR_SERVICE, 'lan-relay-key');
    if (!relaySharedKey) { relaySharedKey = crypto.randomBytes(32).toString('hex'); await keytar.setPassword(KEYTAR_SERVICE, 'lan-relay-key', relaySharedKey); }
    lanRelay = new LanRelay({
      mode: 'observer',
      port: nodeConfig.get('lanRelayPort'),
      sharedKey: relaySharedKey,
      logger: console,
    });
    lanRelay.start();
  }

  // Capture-only nodes restore the same registration and platform connection.
  if (!nodeToken) {
    const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_NODE_TOKEN_ACCOUNT);
    if (stored) { nodeToken = stored; offlineQueue = new OfflineQueue({ nodeToken, logger: console }); hubClient = createHubClient(offlineQueue); hubClient.connect(nodeToken); }
  }
  if (offlineQueue) eventLogger.setOfflineQueue(standaloneActive()?airSession.eventQueue:offlineQueue);
  const cachedShow = nodeConfig.get('pendingShowConfig') || nodeConfig.get('showConfig');
  if (cachedShow && cachedShow.source!=='standalone' && (cachedShow.accountPackage ? cachedShow.packageAccountId===airSession?.status().userId : !!nodeToken)) await receiveShowConfig(cachedShow);
  if (hubConnected && hubClient && nodeToken) void recoverPublishedRundown(hubClient, nodeToken);

  // 3. Create main window and register activate handler.
  createWindow();
  void airSession.initialize().then(()=>standaloneBridge?.restore()).catch(()=>{});
  const bracketTimer=setInterval(()=>{if(currentShowConfig?.rundown?.some(item=>item.overlay==='bracket'))void bracketPresentation?.refresh().catch(()=>{});},5000);bracketTimer.unref();
  const airTimer=setInterval(()=>{if(!airSession?.status().authenticated)return;void airSession.sync().catch(()=>{});void airSession.heartbeat({appVersion:APP_VERSION,obsConnected:obsController?.getState().connected===true,captureActive:broadcastGep.getStatus().active,productionActive:isProductionActive(showRunner),feedState:productionFeed.snapshot().stale?'stale':productionFeed.snapshot().ageMs!=null?'live':'waiting',projectId:standaloneActive()?currentShowConfig.projectId:null});if(!airSession.access?.checkedAt || Date.now()-airSession.access.checkedAt>300000)void airSession.checkAccess().catch(()=>{});},30000);airTimer.unref();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) { /* The app is closing. */ }
  if (sponsorAutomation) void sponsorAutomation.stop().catch(() => {});
});
app.on('window-all-closed', async () => {
  tournamentSync?.stop();
  pauseRules?.stop();
  nodeSessionMonitor?.stop();
  harness?.stop();
  clearInterval(feedDiagnosticsTimer);
  rulesEngine?.dispose();
  broadcastGep.stop();
  clearInterval(healthCheckInterval);
  stopObsScreenshotLoop();
  if (obsController) {
    await obsController.disconnect();
    obsController = null;
  }
  if (hubClient) {
    await hubClient.disconnect();
    hubClient = null;
  }
  if (lanRelay) {
    lanRelay.stop();
    lanRelay = null;
  }
  if (hudServer) {
    hudServer.stop();
    hudServer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
