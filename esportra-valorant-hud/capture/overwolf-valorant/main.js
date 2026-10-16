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
const { PlayerSource } = require('./player-source');

const CONFIG = {
  server: process.env.ESPORTRA_SERVER || 'ws://localhost:5300',   // your Esportra server
  match: process.env.ESPORTRA_MATCH || 'MAIN',                     // the match room code shown in the control panel
  showId: process.env.ESPORTRA_SHOW_ID || null,
  key: process.env.ESPORTRA_KEY || '',                             // only if the server sets ESPORTRA_KEY
  playerId: process.env.ESPORTRA_PLAYER_ID || '',                  // set on player PCs: the player's Riot PUUID
  captureRole: process.env.ESPORTRA_CAPTURE_ROLE || (process.env.ESPORTRA_PLAYER_ID ? 'player' : 'observer'),
};
const VALORANT = 21640;                                            // Overwolf game ID for Valorant (22904 is alternate ID)
const playerSource = new PlayerSource({ role: CONFIG.captureRole, playerId: CONFIG.playerId });
const FEATURES = CONFIG.captureRole === 'player' ? ['me'] : ['match_info', 'me', 'game_info'];

// ── reliable socket: queue while offline, resend on reconnect ──
let ws = null;
const queue = new (require('./capture-queue'))();
function connect() {
  const role = CONFIG.captureRole === 'player' ? 'player' : 'ingest';
  ws = new WebSocket(`${CONFIG.server}/ws?match=${encodeURIComponent(CONFIG.match)}&role=${role}&key=${encodeURIComponent(CONFIG.key)}`);
  ws.on('open', () => { console.log('Connected to Esportra'); queue.drain().forEach(sendPacket); });
  ws.on('close', () => setTimeout(connect, 1500));
  ws.on('error', e => console.warn('Esportra connection error:', e.message));
}
function send(message) {
  for (const packet of playerSource.prepare(message)) sendPacket(packet);
}
function sendPacket(message) {
  const frame = JSON.stringify({ type: 'valorant', message, match: CONFIG.match, showId: CONFIG.showId, recovered: message.recovered === true, bufferedAgeMs: message.bufferedAgeMs || 0 });
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame); else queue.add(message);
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
    console.log('Pending GEP updates checked');

    gep.getSupportedGames()
      .then(games => {
        const val = games.find(g => g.id === VALORANT);
        console.log('Valorant in supported games:', val ? `YES — "${val.name}"` : 'NO (not in list!)');
        console.log('All supported games:', games.map(g => `${g.id}:${g.name}`).join(', '));
      })
      .catch(err => console.error('getSupportedGames error:', err.message || err));

    gep.getInfo(VALORANT)
      .then(info => console.log('Valorant game information received'))
      .catch(err => console.log('getInfo(Valorant) error (expected if not running):', err.message || err));

    gep.getFeatures(VALORANT)
      .then(features => console.log('Valorant features received'))
      .catch(err => console.log('getFeatures(21640) error:', err.message || err));

    gep.getInfo(22904)
      .then(info => console.log('Alternate Valorant game information received'))
      .catch(err => console.log('getInfo(22904) error:', err.message || err));

    // ── package-level events ──
    packages.on('failed-to-initialize', (_e, pkgName) => console.error('Package failed to initialize:', pkgName));
    packages.on('package-update-pending', (_e, info) => console.log('Package update pending'));

    let gameConnected = false;
    let captureGameId = VALORANT, infoPending = false;

    // log ALL game-detected events so we can see which ID fires for Valorant
    gep.on('game-detected', (e, gameId, name) => {
      console.log(`game-detected: gameId=${gameId} name=${name}`);
      if (gameId !== VALORANT && gameId !== 22904) return;
      console.log(`Valorant detected (${name} / ${gameId}) — enabling GEP...`);
      e.enable();
      gameConnected = true;
      captureGameId = gameId;
      gep.setRequiredFeatures(gameId, FEATURES)
        .then(async () => { console.log('GEP features registered for', gameId, ':', FEATURES); const info = await gep.getInfo(gameId); if (info?.info) send(info); else if (info?.me) send({ info }); })
        .catch(err => console.error('setRequiredFeatures error:', err.message || err));
    });

    gep.on('elevated-privileges-required', (_e, gameId) => {
      if (gameId !== VALORANT && gameId !== 22904) return;
      console.warn('⚠ Valorant is running as Administrator — restart this app as Administrator too.');
    });

    gep.on('game-exit', (_e, gameId) => {
      if (gameId !== VALORANT && gameId !== 22904) return;
      gameConnected = false;
      playerSource.reset();
      console.log('Valorant exited.');
    });

    gep.on('new-info-update', (_e, gameId, ...args) => {
      if (gameId !== VALORANT && gameId !== 22904) return;
      if (!gameConnected) { gameConnected = true; console.log('✓ Valorant detected — GEP connected'); }
      console.log('[GEP] Information update received');
      args.forEach(a => send(a));
    });
    gep.on('new-game-event', (_e, gameId, ...args) => {
      if (gameId !== VALORANT && gameId !== 22904) return;
      if (!gameConnected) { gameConnected = true; console.log('✓ Valorant detected — GEP connected'); }
      console.log('[GEP] Game event received');
      args.forEach(a => send(a.events ? a : { events: [a] }));
    });
    gep.on('error', (_e, gameId, err) => console.error('GEP error', gameId, err));
    setInterval(async () => {
      if (!gameConnected) return;
      const packet = playerSource.heartbeat(); if (packet) sendPacket(packet);
      if (CONFIG.captureRole !== 'player' || infoPending) return;
      infoPending = true;
      try { const info = await gep.getInfo(captureGameId); if (gameConnected) { if (info?.info) send(info); else if (info?.me) send({ info }); } }
      catch { /* SDK updates remain the primary source; the next poll retries. */ }
      finally { infoPending = false; }
    }, 2000);
  });
});
