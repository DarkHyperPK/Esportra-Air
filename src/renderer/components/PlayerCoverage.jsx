import React from 'react';
export default function PlayerCoverage({ players = [] }) {
  return <details className="production-advanced"><summary>Player-PC coverage</summary>
    <p>Observer data identifies the roster. Player PCs add their own health and ability availability through GEP.</p>
    {players.length ? players.map(player => <div className="product-data-row" key={player.slot}>
      <span>{player.name}</span><small>{player.connected ? 'Player PC connected' : player.lastSeenAt ? 'Player PC stale' : 'Observer only'} · HP {player.health ?? 'Unknown'} · Abilities {player.abilities?.map((available, index) => `${['C', 'Q', 'E'][index]} ${available ? 'ready' : 'unavailable'}`).join(', ') || 'Unknown'}</small>
    </div>) : <p>Waiting for the observer roster. Start player capture on each participating PC to add coverage.</p>}
  </details>;
}
