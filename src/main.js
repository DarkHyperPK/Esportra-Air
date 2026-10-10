'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
  // ── Existing ─────────────────────────────────────────────────────────────
  HUD_STATUS:       'HUD_STATUS',
  HUD_OVERLAY_LIST: 'HUD_OVERLAY_LIST',
  OPS_LOGIN:        'OPS_LOGIN',
  OPS_GET_MATCHES:  'OPS_GET_MATCHES',
  OPS_SELECT_MATCH: 'OPS_SELECT_MATCH',
  MANUAL_PATCH:     'MANUAL_PATCH',
  PREVIEW_OVERLAY:  'PREVIEW_OVERLAY',
  START_BROADCAST:  'START_BROADCAST',
  STOP_BROADCAST:   'STOP_BROADCAST',
  BROADCAST_STATUS: 'BROADCAST_STATUS',
  // ── P0 additions ─────────────────────────────────────────────────────────
  // Pair this node with an organizer account using a short-lived code.
  // Returns: { ok, nodeId?, error? }  — never returns the token.
  PAIR:             'PAIR',
  // Full status snapshot for the console UI status bar.
  // Returns: { mode, nodeId, paired, hubConnected, hudOnline, gepActive, lanRelay }
  GET_STATUS:       'GET_STATUS',
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
  // Ensure ESA_ scenes exist in OBS with browser sources.
  // Args: { outputUrls: { holding, gameplay, fullscreen, replay, casters } }
  // Returns: { ok, created, existing, error? }
  OBS_BUILD_SCENES:   'OBS_BUILD_SCENES',
  // Transition a scene into program (studio mode-aware, ≤100ms target).
  // Args: { sceneName }
  // Returns: { ok, latencyMs, scene, error? }
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
  // Apply an on-air score correction.   Args: correction object
  FIX_DATA:           'FIX_DATA',
  // Start simulation (dev only).        Args: { filePath, speed? }
  SIMULATION_START:   'SIMULATION_START',
  // Stop simulation.
  SIMULATION_STOP:    'SIMULATION_STOP',
});

const KEYTAR_SERVICE = 'esportra-air';
const KEYTAR_ACCOUNT = 'jwt';
const KEYTAR_NODE_TOKEN_ACCOUNT = 'node-token';
const API_BASE = process.env.ESPORTRA_API_URL || 'https://esportra.gg';

// ─── HUD server state ─────────────────────────────────────────────────────────
let hudServer = null;
let hudStartErrorCode = null;
const HUD_PORT = 5300;
// C-2: per-session write token, generated once at startup, never exposed to renderer or overlays
const HUD_KEY = crypto.randomBytes(32).toString('hex');

// ─── P0 module state (set during boot, before IPC handlers are called) ────────
let nodeConfig = null;
let offlineQueue = null;
let hubClient = null;
let hubConnected = false;
// nodeToken is kept in memory for hub/queue operations only — NEVER sent to renderer.
let nodeToken = null;
let lanRelay = null;

// ─── P1 module state — video switcher ─────────────────────────────────────────
let obsController = null;
let obsScreenshotBusy = false;
let obsScreenshotInterval = null;

// ─── P2 module state — autopilot ──────────────────────────────────────────────
let showRunner        = null;
let rulesEngine       = null;
let eventLogger       = null;
let harness           = null;
let currentShowConfig = null; // last ShowConfig received from hub, used by fixData

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

// ─── Helper: derive hub WSS URL from API base ─────────────────────────────────
function deriveHubUrl() {
  return API_BASE
    .replace(/^https?:\/\//, 'wss://')
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
  return {
    mode: nodeConfig ? nodeConfig.get('mode') : 'production',
    hudOnline: hudServer !== null,
    gepActive: broadcastGep.getStatus().active,
    lanRelayActive: lanRelay !== null,
    appVersion: APP_VERSION,
  };
}

// ─── Helper: apply an arbitrary merge patch to the HUD server ─────────────────
// Used by ShowRunner (via hudPatch callback) and RulesEngine.
async function applyHudPatch(matchCode, patch) {
  if (!hudServer) return;
  try {
    const res = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${matchCode || 'MAIN'}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body:    JSON.stringify(patch),
    });
    if (!res.ok) console.warn('[hud] PATCH rejected, status:', res.status);
  } catch (err) {
    console.error('[hud] PATCH error:', err.message);
  }
}

// ─── Helper: apply a ShowConfig patch to the HUD server ───────────────────────
async function applyShowConfigToHud(showConfig) {
  if (!hudServer) return;
  const matchCode = showConfig.matchCode || 'MAIN';
  const patch = matchContext.buildShowPatch(showConfig);
  try {
    const res = await fetch(`http://127.0.0.1:${HUD_PORT}/api/${matchCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.warn('[broadcast] HUD PATCH rejected for ShowConfig, status:', res.status);
    }
  } catch (err) {
    console.error('[broadcast] HUD PATCH error:', err.message);
  }
}

// ─── Helper: create and wire a HubClient instance ─────────────────────────────
function createHubClient(queue) {
  const client = new HubClient({
    hubUrl: deriveHubUrl(),
    offlineQueue: queue,
    logger: console,
    statusProvider: getNodeStatus,
  });

  client.on('connected', () => {
    hubConnected = true;
    if (mainWindow) mainWindow.webContents.send('hub-connected');
  });
  client.on('disconnected', () => {
    hubConnected = false;
    if (mainWindow) mainWindow.webContents.send('hub-disconnected');
  });

  client.onShowConfig(cfg => {
    currentShowConfig = cfg;
    // Forward raw config to renderer for UI (no secrets in ShowConfig payload).
    if (mainWindow) mainWindow.webContents.send('show-config', cfg);
    // Apply to HUD server.
    applyShowConfigToHud(cfg);
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
    if (mainWindow) mainWindow.webContents.send('obs-connected', info ?? {});
    startObsScreenshotLoop();
  });
  controller.on('disconnected', () => {
    if (mainWindow) mainWindow.webContents.send('obs-disconnected');
    stopObsScreenshotLoop();
  });
  controller.on('tally-changed', (tally) => {
    if (mainWindow) mainWindow.webContents.send('obs-tally', tally);
  });
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
  wireObsEvents(obsController);
  // P2: wire ShowRunner to the newly created controller.
  if (showRunner) showRunner.setObsController(obsController);
  return obsController;
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
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
    if (url.startsWith('file://')) return;
    if (!isAllowedExternal(url)) event.preventDefault();
  });
});

// ─── IPC handlers — C-3: registered using the enum, never dynamic ─────────────

ipcMain.handle(IPC_COMMANDS.HUD_STATUS, async () => {
  const online = hudServer !== null;
  const clients = online ? hudServer.clientCount : 0;
  return { online, port: HUD_PORT, clients, errorCode: online ? null : hudStartErrorCode };
});

ipcMain.handle(IPC_COMMANDS.HUD_OVERLAY_LIST, () => {
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

ipcMain.handle(IPC_COMMANDS.OPS_LOGIN, async (_event, { email, password } = {}) => {
  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.message || data.error || 'Login failed.' };
    }
    const token = data.access_token || data.token;
    if (token) {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token);
    }
    // Strip token fields before returning to renderer — C-5 principle
    const { access_token: _at, token: _t, refresh_token: _rt, ...safeUser } = data.user || data;
    return { ok: true, user: safeUser };
  } catch (_) {
    return { ok: false, error: 'Network error — could not reach Esportra.' };
  }
});

ipcMain.handle(IPC_COMMANDS.OPS_GET_MATCHES, async () => {
  const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  if (!token) return { ok: false, error: 'Not signed in.' };
  try {
    const res = await fetch(`${API_BASE}/api/tournaments?status=active`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      return { ok: false, error: 'Session expired. Please sign in again.' };
    }
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.message || 'Could not load tournaments.' };
    return { ok: true, tournaments: data };
  } catch (_) {
    return { ok: false, error: 'Network error — could not reach Esportra.' };
  }
});

ipcMain.handle(IPC_COMMANDS.OPS_SELECT_MATCH, async (_event, { tournamentSlug, matchId } = {}) => {
  if (!tournamentSlug || !matchId) {
    return { ok: false, error: 'tournamentSlug and matchId are required.' };
  }
  const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  if (!token) return { ok: false, error: 'Not signed in.' };
  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${tournamentSlug}/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.message || 'Could not load match data.' };
    }
    const match = await res.json();

    // Patch HUD server state using match-context (C-2: uses per-session HUD_KEY).
    // buildShowPatch handles missing ShowConfig fields gracefully with safe defaults.
    const patch = matchContext.buildShowPatch(match);
    const hudRes = await fetch(`http://127.0.0.1:${HUD_PORT}/api/MAIN`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
      body: JSON.stringify(patch),
    });
    if (!hudRes.ok) {
      return { ok: false, error: 'HUD server rejected the state patch.' };
    }
    return { ok: true, match };
  } catch (err) {
    return { ok: false, error: 'Could not load match data — ' + err.message };
  }
});

ipcMain.handle(IPC_COMMANDS.MANUAL_PATCH, async (_event, { patch } = {}) => {
  if (!patch || typeof patch !== 'object') {
    return { ok: false, error: 'patch must be a JSON object.' };
  }
  try {
    const res = await fetch(`http://127.0.0.1:${HUD_PORT}/api/MAIN`, {
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

ipcMain.handle(IPC_COMMANDS.PREVIEW_OVERLAY, async (_event, { url } = {}) => {
  if (!url || typeof url !== 'string') return { ok: false, error: 'url is required.' };
  if (!url.startsWith(`http://localhost:${HUD_PORT}/`) && !url.startsWith(`http://127.0.0.1:${HUD_PORT}/`)) {
    return { ok: false, error: 'Only HUD overlay URLs can be previewed.' };
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Overlay Preview',
    webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true },
  });
  win.loadURL(url);
  return { ok: true };
});

// ─── P0 IPC: PAIR ─────────────────────────────────────────────────────────────
// Accepts a short-lived organizer-generated pairing code, exchanges it for a
// node token via the backend, stores the token in the OS keychain, and connects
// the hub client. The token is NEVER returned to the renderer.

ipcMain.handle(IPC_COMMANDS.PAIR, async (_event, { pairingCode } = {}) => {
  if (!pairingCode || !/^[A-Z0-9]{6,8}$/i.test(pairingCode)) {
    return { ok: false, error: 'Pairing code must be 6–8 alphanumeric characters.' };
  }
  try {
    const res = await fetch(`${API_BASE}/api/broadcast/nodes/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Version': APP_VERSION },
      body: JSON.stringify({
        code: pairingCode.toUpperCase(),
        name: os.hostname(),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'Pairing failed.' };
    }

    const { nodeId, token: newToken } = data;
    if (!nodeId || !newToken) {
      return { ok: false, error: 'Invalid response from server — missing nodeId or token.' };
    }

    // Persist token in OS keychain — never log it, never return it to renderer.
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_NODE_TOKEN_ACCOUNT, newToken);
    nodeConfig.set('nodeId', nodeId);
    nodeToken = newToken;

    // (Re)initialize offline queue and hub client with the new token.
    if (hubClient) await hubClient.disconnect();
    offlineQueue = new OfflineQueue({ nodeToken: newToken, logger: console });
    hubClient = createHubClient(offlineQueue);
    hubClient.connect(newToken);
    // P2: wire new offlineQueue into EventLogger.
    if (eventLogger) eventLogger._offlineQueue = offlineQueue;

    // Return nodeId only — token stays in main process.
    return { ok: true, nodeId };
  } catch (_) {
    return { ok: false, error: 'Network error — could not reach Esportra.' };
  }
});

// ─── P0 IPC: GET_STATUS ───────────────────────────────────────────────────────

ipcMain.handle(IPC_COMMANDS.GET_STATUS, () => {
  const relayPort = nodeConfig ? nodeConfig.get('lanRelayPort') : 5301;
  const gepStatus = broadcastGep.getStatus();
  const hudOnline = hudServer !== null;
  return {
    mode: nodeConfig ? nodeConfig.get('mode') : 'production',
    nodeId: nodeConfig ? nodeConfig.get('nodeId') : null,
    paired: nodeToken !== null,
    hubConnected,
    hudOnline,
    gepActive: gepStatus.active,
    lanRelay: lanRelay ? lanRelay.getStatus() : { listening: false, port: relayPort, consumerCount: 0 },
    health: {
      hudServer: {
        state: hudOnline ? 'healthy' : (hudStartErrorCode ? 'error' : 'offline'),
        detail: hudOnline ? `Port ${HUD_PORT}` : (hudStartErrorCode ? `Error: ${hudStartErrorCode}` : 'Not started'),
      },
      obsConnection: (() => {
        if (!obsController) return { state: 'offline', detail: 'Not connected' };
        const obs = obsController.getState();
        if (obs.connected) {
          return { state: 'healthy', detail: `OBS ready${obs.studioMode ? ' (Studio Mode)' : ''}` };
        }
        return { state: 'attention', detail: obs.state };
      })(),
      gepFeed: {
        state: gepStatus.active ? 'healthy' : 'offline',
        detail: gepStatus.active ? 'Live' : 'Not capturing',
      },
      apiConnection: {
        state: hubConnected ? 'healthy' : (nodeToken ? 'attention' : 'offline'),
        detail: hubConnected ? 'Hub connected' : (nodeToken ? 'Reconnecting…' : 'Not paired'),
      },
      overlayRender: {
        state: hudOnline ? 'healthy' : 'unknown',
        detail: hudOnline ? `${hudServer.clientCount || 0} OBS source(s) connected` : 'HUD offline',
      },
    },
  };
});

// ─── P0 IPC: SET_MODE ─────────────────────────────────────────────────────────

ipcMain.handle(IPC_COMMANDS.SET_MODE, (_event, { mode: newMode } = {}) => {
  const VALID_MODES = new Set(['production', 'capture-only']);
  if (!newMode || !VALID_MODES.has(newMode)) {
    return { ok: false, error: 'Invalid mode. Use "production" or "capture-only".' };
  }
  if (!nodeConfig) return { ok: false, error: 'Node config not ready.' };
  nodeConfig.set('mode', newMode);
  return { ok: true, restartRequired: true };
});

// ─── P0 IPC: COPY_OUTPUT_URL ──────────────────────────────────────────────────
// Returns the browser-source URL for an overlay. No secrets in the URL per arch §8.

ipcMain.handle(IPC_COMMANDS.COPY_OUTPUT_URL, (_event, { overlayName, matchCode } = {}) => {
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
const OBS_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);

ipcMain.handle(IPC_COMMANDS.OBS_CONNECT, async (_event, { host, port, password } = {}) => {
  if (!host || typeof host !== 'string') {
    return { ok: false, error: 'host is required.' };
  }
  if (!OBS_ALLOWED_HOSTS.has(host)) {
    return { ok: false, error: 'OBS must run on localhost. Remote connections not supported in P1.' };
  }
  const safePort = Number(port) || 4455;
  if (safePort < 1 || safePort > 65535) {
    return { ok: false, error: 'port must be between 1 and 65535.' };
  }
  const controller = getOrCreateVideoController();
  try {
    await controller.connect(host, safePort, password || '');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Connection failed.' };
  }
});

// ─── P1 IPC: OBS_DISCONNECT ──────────────────────────────────────────────────

ipcMain.handle(IPC_COMMANDS.OBS_DISCONNECT, async () => {
  if (!obsController) return { ok: true };
  await obsController.disconnect();
  return { ok: true };
});

// ─── P1 IPC: OBS_GET_STATUS ──────────────────────────────────────────────────

ipcMain.handle(IPC_COMMANDS.OBS_GET_STATUS, () => {
  if (!obsController) {
    return { connected: false, state: 'disconnected', studioMode: false, tally: { preview: null, program: null } };
  }
  return obsController.getState();
});

// ─── P1 IPC: OBS_BUILD_SCENES ────────────────────────────────────────────────
// Creates ESA_ scenes in OBS with browser sources for each named overlay URL.
// Security: all provided URLs must target the local HUD server only.

const HUD_URL_PREFIX_RE = /^https?:\/\/(localhost|127\.0\.0\.1):5300\//;

ipcMain.handle(IPC_COMMANDS.OBS_BUILD_SCENES, async (_event, { outputUrls } = {}) => {
  if (!obsController) return { ok: false, error: 'OBS is not connected.' };
  const safeUrls = {};
  for (const [key, url] of Object.entries(outputUrls || {})) {
    if (typeof url !== 'string' || !HUD_URL_PREFIX_RE.test(url)) {
      return { ok: false, error: `outputUrls["${key}"] must be a localhost:5300 HUD URL.` };
    }
    safeUrls[key] = url;
  }
  try {
    const result = await obsController.buildScenes(safeUrls);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── P1 IPC: OBS_TAKE ────────────────────────────────────────────────────────
// Studio-mode-aware scene transition targeting ≤100ms.

ipcMain.handle(IPC_COMMANDS.OBS_TAKE, async (_event, { sceneName } = {}) => {
  if (!obsController) return { ok: false, error: 'OBS is not connected.' };
  if (!sceneName || typeof sceneName !== 'string') {
    return { ok: false, error: 'sceneName is required.' };
  }
  if (sceneName.length > 256) {
    return { ok: false, error: 'sceneName must be 256 characters or fewer.' };
  }
  return obsController.take(sceneName);
});

// ─── P1 IPC: OBS_TRIGGER_REPLAY ──────────────────────────────────────────────
// Save replay buffer → ESA_Replay → return to previous scene after dwell.

ipcMain.handle(IPC_COMMANDS.OBS_TRIGGER_REPLAY, async (_event, opts = {}) => {
  if (!obsController) return { ok: false, error: 'OBS is not connected.' };
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

ipcMain.handle(IPC_COMMANDS.RUNNER_LOAD_RUNDOWN, (_event, { segments } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!Array.isArray(segments)) return { ok: false, error: 'segments must be an array.' };
  showRunner.loadRundown(segments);
  if (eventLogger) eventLogger.log({ type: 'rundown_loaded', actor: 'operator', data: { count: segments.length } });
  return { ok: true };
});

ipcMain.handle(IPC_COMMANDS.RUNNER_START, () => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  showRunner.start();
  if (eventLogger) eventLogger.log({ type: 'rundown_started', actor: 'operator' });
  return { ok: true };
});

ipcMain.handle(IPC_COMMANDS.RUNNER_HOLD, (_event, { segmentId } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!segmentId)  return { ok: false, error: 'segmentId required.' };
  const result = showRunner.hold(segmentId);
  if (result.ok && eventLogger) eventLogger.log({ type: 'cmd_hold', segmentId, actor: 'operator' });
  return result;
});

ipcMain.handle(IPC_COMMANDS.RUNNER_SKIP, (_event, { segmentId } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!segmentId)  return { ok: false, error: 'segmentId required.' };
  const result = showRunner.skip(segmentId);
  if (result.ok && eventLogger) eventLogger.log({ type: 'cmd_skip', segmentId, actor: 'operator' });
  return result;
});

ipcMain.handle(IPC_COMMANDS.RUNNER_TAKE, async (_event, { segmentId, commandId } = {}) => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  if (!segmentId)  return { ok: false, error: 'segmentId required.' };
  const result = await showRunner.take(segmentId, { commandId });
  if (result.ok && eventLogger) eventLogger.log({ type: 'cmd_take', segmentId, actor: 'operator' });
  return result;
});

ipcMain.handle(IPC_COMMANDS.RUNNER_RESUME, () => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  showRunner.resume();
  if (eventLogger) eventLogger.log({ type: 'cmd_resume', actor: 'operator' });
  return { ok: true };
});

ipcMain.handle(IPC_COMMANDS.RUNNER_TECH_PAUSE, () => {
  if (!showRunner) return { ok: false, error: 'ShowRunner not initialized.' };
  showRunner.techPause();
  if (eventLogger) eventLogger.log({ type: 'cmd_tech_pause', actor: 'operator' });
  return { ok: true };
});

// ─── P2 IPC: FIX_DATA ────────────────────────────────────────────────────────

ipcMain.handle(IPC_COMMANDS.FIX_DATA, async (_event, correction = {}) => {
  if (!hudServer) return { ok: false, error: 'HUD server not running.' };
  const result = await fixData(correction, {
    showConfig:  currentShowConfig || {},
    hudPort:     HUD_PORT,
    hudKey:      HUD_KEY,
    offlineQueue,
  });
  if (result.ok && eventLogger) {
    eventLogger.log({ type: 'fix_data', actor: 'operator', data: correction });
  }
  return result;
});

// ─── P2 IPC: SIMULATION (dev only) ───────────────────────────────────────────

ipcMain.handle(IPC_COMMANDS.SIMULATION_START, async (_event, { filePath, speed } = {}) => {
  if (process.env.NODE_ENV !== 'development') {
    return { ok: false, error: 'Simulation only available in development mode.' };
  }
  if (!harness) return { ok: false, error: 'Simulation harness not initialized.' };
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'filePath required.' };
  }
  // Restrict to the simulation directory to prevent path traversal.
  const simDir   = path.join(__dirname, 'simulation');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(simDir)) {
    return { ok: false, error: 'filePath must be within the simulation directory.' };
  }
  await harness.play(resolved, { speed: Number(speed) || 1.0 });
  return { ok: true };
});

ipcMain.handle(IPC_COMMANDS.SIMULATION_STOP, () => {
  if (harness) harness.stop();
  return { ok: true };
});

// ─── Broadcast GEP controls ───────────────────────────────────────────────────
const broadcastGep = require('./broadcast-gep');
broadcastGep.setStatusCallback(status => {
  if (mainWindow) mainWindow.webContents.send('BROADCAST_STATUS_CHANGED', status);
});

ipcMain.handle(IPC_COMMANDS.BROADCAST_STATUS, () => broadcastGep.getStatus());

ipcMain.handle(IPC_COMMANDS.START_BROADCAST, async (_event, { matchCode } = {}) => {
  const mode = nodeConfig ? nodeConfig.get('mode') : 'production';
  const gepTargetUrl = mode === 'capture-only'
    ? `ws://127.0.0.1:${nodeConfig.get('lanRelayPort')}`
    : undefined;
  return broadcastGep.start({ hudKey: HUD_KEY, hudPort: HUD_PORT, matchCode: matchCode || 'MAIN', gepTargetUrl });
});

ipcMain.handle(IPC_COMMANDS.STOP_BROADCAST, () => broadcastGep.stop());

// ─── Update guard ─────────────────────────────────────────────────────────────
function isBroadcastActive() {
  const hudActive = hudServer !== null && hudServer.clientCount > 0;
  const gepActive = broadcastGep.getStatus().active;
  return hudActive || gepActive;
}
// When electron-updater is added: before autoUpdater.downloadUpdate(), check !isBroadcastActive()

// ─── HUD server lifecycle ─────────────────────────────────────────────────────
async function startHudServer() {
  const { start: startHud } = require('../esportra-valorant-hud/server/server');
  const hudRoot = getHudRoot();
  const hudDataDir = getHudDataDir();
  try {
    hudServer = await startHud({ port: HUD_PORT, key: HUD_KEY, root: hudRoot, dataDir: hudDataDir });
    console.log(`[broadcast] HUD server started on 127.0.0.1:${HUD_PORT}`);
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
      const res = await fetch(`http://127.0.0.1:${HUD_PORT}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
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
app.whenReady().then(async () => {
  // 1. Load node config — must be first (mode determines which modules start).
  nodeConfig = new NodeConfig();
  const mode = resolveMode(nodeConfig);

  // P2: Initialize ShowRunner, EventLogger, and RulesEngine.
  // OBS controller wired lazily in getOrCreateVideoController(); offlineQueue
  // wired after pairing succeeds.
  showRunner  = new ShowRunner({ obsController: null, hudPatch: applyHudPatch, logger: console });
  eventLogger = new EventLogger({ offlineQueue: null, logger: console });
  rulesEngine = new RulesEngine({ hudPatch: applyHudPatch, logger: console });
  showRunner.setRulesEngine(rulesEngine);

  // Forward ShowRunner events to renderer.
  showRunner.on('stateChange', (state) => {
    if (mainWindow) mainWindow.webContents.send('runner-state', state);
  });
  showRunner.on('takeTriggered', ({ segment }) => {
    if (eventLogger) eventLogger.log({ type: 'take_triggered', segmentId: segment.id, scene: segment.scene, actor: 'runner' });
  });
  showRunner.on('segmentDone', ({ segment }) => {
    if (eventLogger) eventLogger.log({ type: 'segment_done', segmentId: segment.id, scene: segment.scene, actor: 'runner' });
  });
  showRunner.on('error', (err) => {
    if (eventLogger) eventLogger.log({ type: 'runner_error', actor: 'runner', data: { message: err.message } });
  });

  // Forward EventLogger entries to renderer.
  eventLogger.on('entry', (entry) => {
    if (mainWindow) mainWindow.webContents.send('event-log-entry', entry);
  });

  // P2: Simulation harness — dev only.
  if (process.env.NODE_ENV === 'development') {
    const Harness = require('./simulation/harness');
    harness = new Harness({ showRunner, logger: console });
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
      lanRelay = new LanRelay({
        mode: 'production',
        targets: relayTargets,
        logger: console,
        onGepState: (gepMessage) => {
          if (!hudServer) return;
          fetch(`http://127.0.0.1:${HUD_PORT}/api/MAIN/ingest/valorant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': HUD_KEY },
            body: JSON.stringify([gepMessage]),
          }).catch(err => console.warn('[lan-relay] HUD ingest error:', err.message));
        },
      });
      lanRelay.start();
    }
  } else if (mode === 'capture-only') {
    // LAN relay observer mode — open WS server; ow-electron sends GEP to it.
    const LanRelay = require('./lan-relay');
    lanRelay = new LanRelay({
      mode: 'observer',
      port: nodeConfig.get('lanRelayPort'),
      logger: console,
    });
    lanRelay.start();
  }

  // 3. Create main window and register activate handler.
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
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
