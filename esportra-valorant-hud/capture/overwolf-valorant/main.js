// Esportra capture agent (starter) for Valorant, as an Overwolf Electron (ow-electron) app.
// Runs on the observer PC (role "ingest") or on a player PC (role "player", forwards that player's own health/abilities).
// It does no parsing: raw game-event messages go to the Esportra server, where adapters/valorant-gep.js turns them into state.
//
// Not runnable in a plain browser. Build it on Overwolf's ow-electron template and check the GEP calls against Overwolf's
// current docs (https://dev.overwolf.com/ow-electron/live-game-data-gep/live-game-data-gep-intro) before relying on it.
// Overwolf requires a developer account and app approval before you ship this to anyone.
'use strict';
const { app } = require('electron');
const WebSocket = require('ws');

const CONFIG = {
  server: process.env.ESPORTRA_SERVER || 'ws://localhost:5300',   // your Esportra server
  match: process.env.ESPORTRA_MATCH || 'MAIN',                     // the match room code shown in the control panel
  key: process.env.ESPORTRA_KEY || '',                             // only if the server sets ESPORTRA_KEY
  playerId: process.env.ESPORTRA_PLAYER_ID || '',                  // set on player PCs: the player's Riot PUUID
};
const VALORANT = 21640;                                            // Overwolf game ID for Valorant (22904 is alternate ID)
const FEATURES = CONFIG.playerId ? ['me'] : ['match_info', 'me', 'game_info'];

// ── reliable socket: queue while offline, resend on reconnect ──
let ws = null, queue = [];
function connect() {
  const role = CONFIG.playerId ? 'player' : 'ingest';
  ws = new WebSocket(`${CONFIG.server}/ws?match=${encodeURIComponent(CONFIG.match)}&role=${role}&key=${encodeURIComponent(CONFIG.key)}`);
  ws.on('open', () => { console.log('Connected to Esportra'); const q = queue; queue = []; q.forEach(send); });
  ws.on('close', () => setTimeout(connect, 1500));
  ws.on('error', e => console.warn('Esportra connection error:', e.message));
}
function send(message) {
  if (CONFIG.playerId) message.playerId = CONFIG.playerId;      // lets the adapter attach health/abilities to the right player
  const frame = JSON.stringify({ type: 'valorant', message });
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame); else queue.push(message);
}

// ── Overwolf game events ──
app.whenReady().then(() => {
  connect();
  const packages = app.overwolf.packages;
  packages.on('ready', (_e, name, version) => {
    if (name !== 'gep') return;
    console.log('GEP ready', version);
    const gep = packages.gep;

    // ── diagnostics: check pending updates + supported games ──
    const pending = packages.hasPendingUpdates();
    console.log('Pending GEP updates:', JSON.stringify(pending));

    gep.getSupportedGames()
      .then(games => {
        const val = games.find(g => g.id === VALORANT);
        console.log('Valorant in supported games:', val ? `YES — "${val.name}"` : 'NO (not in list!)');
        console.log('All supported games:', games.map(g => `${g.id}:${g.name}`).join(', '));
      })
      .catch(err => console.error('getSupportedGames error:', err.message || err));

    gep.getInfo(VALORANT)
      .then(info => console.log('getInfo(Valorant):', JSON.stringify(info)))
      .catch(err => console.log('getInfo(Valorant) error (expected if not running):', err.message || err));

    gep.getFeatures(VALORANT)
      .then(features => console.log('getFeatures(21640):', JSON.stringify(features)))
      .catch(err => console.log('getFeatures(21640) error:', err.message || err));

    gep.getInfo(22904)
      .then(info => console.log('getInfo(22904):', JSON.stringify(info)))
      .catch(err => console.log('getInfo(22904) error:', err.message || err));

    // ── package-level events ──
    packages.on('failed-to-initialize', (_e, pkgName) => console.error('Package failed to initialize:', pkgName));
    packages.on('package-update-pending', (_e, info) => console.log('Package update pending:', JSON.stringify(info)));

    let gameConnected = false;

    // log ALL game-detected events so we can see which ID fires for Valorant
    gep.on('game-detected', (e, gameId, name) => {
      console.log(`game-detected: gameId=${gameId} name=${name}`);
      if (gameId !== VALORANT && gameId !== 22904) return;
      console.log(`Valorant detected (${name} / ${gameId}) — enabling GEP...`);
      e.enable();
      gep.setRequiredFeatures(gameId, FEATURES)
        .then(() => console.log('GEP features registered for', gameId, ':', FEATURES))
        .catch(err => console.error('setRequiredFeatures error:', err.message || err));
    });

    gep.on('elevated-privileges-required', (_e, gameId) => {
      if (gameId !== VALORANT) return;
      console.warn('⚠ Valorant is running as Administrator — restart this app as Administrator too.');
    });

    gep.on('game-exit', (_e, gameId) => {
      if (gameId !== VALORANT) return;
      gameConnected = false;
      console.log('Valorant exited.');
    });

    gep.on('new-info-update', (_e, gameId, ...args) => {
      if (gameId !== VALORANT && gameId !== 22904) return;
      if (!gameConnected) { gameConnected = true; console.log('✓ Valorant detected — GEP connected'); }
      console.log('[info]', JSON.stringify(args[0]));
      args.forEach(a => send(a));
    });
    gep.on('new-game-event', (_e, gameId, ...args) => {
      if (gameId !== VALORANT && gameId !== 22904) return;
      if (!gameConnected) { gameConnected = true; console.log('✓ Valorant detected — GEP connected'); }
      console.log('[event]', JSON.stringify(args[0]));
      args.forEach(a => send(a.events ? a : { events: [a] }));
    });
    gep.on('error', (_e, gameId, err) => console.error('GEP error', gameId, err));
  });
});
