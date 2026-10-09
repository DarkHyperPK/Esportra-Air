'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fetch = require('node-fetch');
const keytar = require('keytar');

const NodeConfig = require('./node-config');
const HubClient = require('./hub-client');
const OfflineQueue = require('./offline-queue');
const matchContext = require('./match-context');

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
    // Forward raw config to renderer for UI (no secrets in ShowConfig payload).
    if (mainWindow) mainWindow.webContents.send('show-config', cfg);
    // Apply to HUD server.
    applyShowConfigToHud(cfg);
  });

  return client;
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
      obsConnection: { state: 'unknown', detail: 'Not connected — P1' },
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
