'use strict';
// PRIVACY GATE — enforced in the React UI (T6):
// Before calling start(), the UI MUST display the privacy notice:
// "This app collects data for all players in the observed match —
//  including health, credits, weapons, kills, and agents.
//  This data is processed locally and never sent to Esportra servers."
// The start() call here assumes the user has already consented.
//
// CIO requirement: Broadcast mode MUST be explicitly activated by the user.
// GEP NEVER auto-starts when the app opens — start() is only called from
// the IPC handler that the UI invokes after the user clicks "Start Broadcast".

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Paths are relative to this file (src/), resolving to the capture app root.
const CAPTURE_APP = path.join(__dirname, '..', 'esportra-valorant-hud', 'capture', 'overwolf-valorant');
const OW_ELECTRON_BIN = path.join(
  CAPTURE_APP,
  'node_modules',
  '@overwolf',
  'ow-electron',
  'dist',
  'electron.exe',
);

let captureProcess = null;
let statusCallback = null;

/**
 * Register a callback that is invoked whenever the capture process status changes.
 * Called with { active: boolean, pid?: number, reason?: string }.
 */
function setStatusCallback(cb) {
  statusCallback = cb;
}

function notifyStatus(status) {
  if (statusCallback) statusCallback(status);
}

/**
 * Returns the current capture process status without side effects.
 * Safe to call at any time, including before start() has been called.
 */
function getStatus() {
  return {
    active: captureProcess !== null && captureProcess.exitCode === null,
    pid: captureProcess?.pid ?? null,
  };
}

/**
 * Spawn the ow-electron capture agent.
 *
 * @param {object} opts
 * @param {string} opts.hudKey   - Per-session HUD write key (HUD_KEY from main.js).
 * @param {number} [opts.hudPort=5300]
 * @param {string} [opts.matchCode='MAIN']
 * @returns {Promise<{ ok: boolean, pid?: number, error?: string }>}
 */
async function start({ hudKey, hudPort = 5300, matchCode = 'MAIN', gepTargetUrl }) {
  if (captureProcess !== null && captureProcess.exitCode === null) {
    return { ok: false, error: 'Broadcast already active.' };
  }

  if (!fs.existsSync(OW_ELECTRON_BIN)) {
    return {
      ok: false,
      error: 'GEP capture binary not found. Reinstall Esportra Broadcast.',
    };
  }

  // Build a minimal environment for the capture child process — inherits only
  // required Windows system vars. Never inherit arbitrary OS credentials or
  // tokens via process.env spread.
  // ESPORTRA_API_URL is explicitly blanked — CIO requirement: no GEP data sent to API.
  const ENV_ALLOWLIST = [
    'PATH', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR',
    'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'COMSPEC',
  ];
  const inheritedEnv = Object.fromEntries(
    ENV_ALLOWLIST.filter(k => process.env[k] !== undefined)
      .map(k => [k, process.env[k]])
  );
  const env = {
    ...inheritedEnv,
    ESPORTRA_SERVER: gepTargetUrl || `ws://127.0.0.1:${hudPort}`,
    ESPORTRA_MATCH: matchCode,
    ESPORTRA_KEY: hudKey,
    ESPORTRA_API_URL: '',
  };

  captureProcess = spawn(
    OW_ELECTRON_BIN,
    [CAPTURE_APP, '--development', '--owepm-package-channel=gep:prod'],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    },
  );

  captureProcess.stdout.on('data', d =>
    console.log('[gep-capture]', d.toString().trim()),
  );
  captureProcess.stderr.on('data', d =>
    console.warn('[gep-capture:err]', d.toString().trim()),
  );

  captureProcess.on('exit', (code, signal) => {
    console.log(`[gep-capture] exited (code=${code} signal=${signal})`);
    captureProcess = null;
    notifyStatus({ active: false, reason: `Process exited (code=${code})` });
  });

  captureProcess.on('error', err => {
    console.error('[gep-capture] failed to start:', err.message);
    captureProcess = null;
    notifyStatus({
      active: false,
      reason: 'Failed to start capture process: ' + err.message,
    });
  });

  notifyStatus({ active: true, pid: captureProcess.pid });
  return { ok: true, pid: captureProcess.pid };
}

/**
 * Stop the capture process if it is running.
 * On Windows, SIGTERM may be ignored by ow-electron; a SIGKILL fallback fires
 * after 2 s to ensure the process is not left orphaned when the app closes.
 */
function stop() {
  if (!captureProcess) return { ok: true };

  const proc = captureProcess;
  // Nullify early so a racing exit event does not double-notify.
  captureProcess = null;

  try {
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (_) {
        // Already gone — ignore.
      }
    }, 2000);
  } catch (e) {
    console.warn('[gep-capture] stop error:', e.message);
  }

  notifyStatus({ active: false, reason: 'Broadcast stopped by user.' });
  return { ok: true };
}

module.exports = { start, stop, getStatus, setStatusCallback };
