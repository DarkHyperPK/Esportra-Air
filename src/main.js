'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const keytar = require('keytar');

// ─── Security control C-4: shell.openExternal allowlist ───────────────────────
// C-4: use URL origin comparison — startsWith() is bypassable with https://esportra.gg.evil.com
const ALLOWED_ORIGINS = new Set(['https://esportra.gg', 'https://staging.esportra.gg']);

function isAllowedExternal(href) {
  try {
    const { origin } = new URL(href);
    return ALLOWED_ORIGINS.has(origin);
  } catch (_) { return false; }
}

// ─── IPC command enum — C-3: no dynamic dispatch ──────────────────────────────
const IPC_COMMANDS = Object.freeze({
  HUD_STATUS: 'HUD_STATUS',
  HUD_OVERLAY_LIST: 'HUD_OVERLAY_LIST',
  OPS_LOGIN: 'OPS_LOGIN',
  OPS_GET_MATCHES: 'OPS_GET_MATCHES',
  OPS_SELECT_MATCH: 'OPS_SELECT_MATCH',
  MANUAL_PATCH: 'MANUAL_PATCH',
  PREVIEW_OVERLAY: 'PREVIEW_OVERLAY',
  START_BROADCAST: 'START_BROADCAST',
  STOP_BROADCAST: 'STOP_BROADCAST',
  BROADCAST_STATUS: 'BROADCAST_STATUS',
});

const KEYTAR_SERVICE = 'esportra-air';
const KEYTAR_ACCOUNT = 'jwt';
const API_BASE = process.env.ESPORTRA_API_URL || 'https://esportra.gg';

// ─── HUD server state ─────────────────────────────────────────────────────────
let hudServer = null;
let hudStartErrorCode = null;
const HUD_PORT = 5300;
// C-2: per-session write token, generated once at startup, never exposed to renderer or overlays
const HUD_KEY = crypto.randomBytes(32).toString('hex');

// ─── Helper: resolve hud root ─────────────────────────────────────────────────
function getHudRoot() {
  if (app.isPackaged) {
    // asarUnpack puts esportra-valorant-hud/ outside the asar archive at runtime
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'esportra-valorant-hud');
  }
  return path.join(__dirname, '..', 'esportra-valorant-hud');
}

// ─── Helper: resolve writable data directory ─────────────────────────────────
function getHudDataDir() {
  return path.join(app.getPath('userData'), 'hud-data');
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
    if (isAllowedExternal(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    // Allow loading local renderer files
    if (url.startsWith('file://')) return;
    if (!isAllowedExternal(url)) {
      event.preventDefault();
    }
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
    // Store JWT securely — never log it, never return it to renderer (LOW fix)
    const token = data.access_token || data.token;
    if (token) {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token);
    }
    // Strip token fields before returning to renderer — C-5 principle
    const { access_token: _at, token: _t, refresh_token: _rt, ...safeUser } = data.user || data;
    return { ok: true, user: safeUser };
  } catch (err) {
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
  } catch (err) {
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
    // Fetch match details from backend
    const res = await fetch(`${API_BASE}/api/tournaments/${tournamentSlug}/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.message || 'Could not load match data.' };
    }
    const match = await res.json();

    // Patch HUD server state — uses per-session key (C-2)
    const patch = buildHudPatch(match);
    const hudRes = await fetch(`http://127.0.0.1:${HUD_PORT}/api/MAIN`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Esportra-Key': HUD_KEY,
      },
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
      headers: {
        'Content-Type': 'application/json',
        'X-Esportra-Key': HUD_KEY,
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      return { ok: false, error: 'HUD server rejected the patch.' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Could not reach HUD server — ' + err.message };
  }
});

ipcMain.handle(IPC_COMMANDS.PREVIEW_OVERLAY, async (_event, { url } = {}) => {
  if (!url || typeof url !== 'string') return { ok: false, error: 'url is required.' };
  // Only allow localhost HUD URLs — do not open arbitrary URLs
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

// ─── Map match data to HUD state shape ────────────────────────────────────────
function buildHudPatch(match) {
  const teams = Array.isArray(match.teams) ? match.teams : [];
  return {
    teams: teams.map((t, i) => ({
      name: t.name || '',
      tag: t.tag || t.abbreviation || '',
      color: t.color || (i === 0 ? '#FF4655' : '#00B4D8'),
      roster: Array.isArray(t.players)
        ? t.players.map(p => ({ name: p.username || p.name || '', agent: p.agent || '' }))
        : [],
    })),
    series: {
      format: match.format || 'bo1',
      currentMap: match.currentMap || match.current_map || 1,
    },
  };
}

// ─── Broadcast GEP controls ───────────────────────────────────────────────────
const broadcastGep = require('./broadcast-gep');
broadcastGep.setStatusCallback(status => {
  if (mainWindow) mainWindow.webContents.send('BROADCAST_STATUS_CHANGED', status);
});

ipcMain.handle(IPC_COMMANDS.BROADCAST_STATUS, () => broadcastGep.getStatus());

ipcMain.handle(IPC_COMMANDS.START_BROADCAST, async (_event, { matchCode } = {}) => {
  return broadcastGep.start({ hudKey: HUD_KEY, hudPort: HUD_PORT, matchCode: matchCode || 'MAIN' });
});

ipcMain.handle(IPC_COMMANDS.STOP_BROADCAST, () => broadcastGep.stop());

// ─── Update guard ─────────────────────────────────────────────────────────────
// Suppress auto-update download when WS clients are connected to the HUD server.
// electron-updater is not yet installed; this is a placeholder guard for when it is.
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

// ─── Health-check + crash recovery ─────────────────────────────────────────
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
      if (res.ok) return; // healthy
    } catch (_) {}

    // Server is down — attempt restart
    console.warn('[broadcast] HUD health check failed — attempting restart');
    hudServer = null;

    // Sliding window: reset counter if more than 60s have passed since first restart
    const now = Date.now();
    if (now - restartWindowStart > RESTART_WINDOW_MS) {
      restartCount = 0;
      restartWindowStart = now;
    }
    restartCount++;

    if (restartCount > MAX_RESTARTS) {
      console.error('[broadcast] HUD server restart limit reached — manual restart required');
      persistentError = true;
      // Notify renderer
      if (mainWindow) mainWindow.webContents.send('HUD_PERSISTENT_ERROR', { message: 'HUD server failed repeatedly. Restart Esportra Broadcast.' });
      return;
    }

    const ok = await startHudServer();
    if (ok && mainWindow) {
      mainWindow.webContents.send('HUD_RESTARTED');
    }
  }, 5000);
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startHudServer();
  startHealthCheck();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  broadcastGep.stop();
  clearInterval(healthCheckInterval);
  if (hudServer) {
    hudServer.stop();
    hudServer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
