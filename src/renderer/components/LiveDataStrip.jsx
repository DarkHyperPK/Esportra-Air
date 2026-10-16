import React from 'react';
import PlayerCoverage from './PlayerCoverage.jsx';
export default function LiveDataStrip({ feed }) {
  if (!feed?.available) return <p className="air-empty-state">Waiting for game data for the selected match. No sample scores are shown.</p>;
  return <section className="production-live-data" aria-label="Live game data">
    {feed.stale && <p className="broadcast-error" role="alert">Game feed paused. Values are last received; check the observer connection.</p>}
    <div className="live-data-round"><strong>Round {feed.round ?? '—'}</strong><span>{feed.phase}</span><span>Spike: {feed.spike}</span></div>
    <div className="live-data-teams">{feed.teams.map((team, index) => <div key={index}><strong>{team.name}</strong><span>Score {team.score ?? '—'}</span><span>Alive {team.alive ?? '—'}</span><span>Bank {team.credits === null ? '—' : team.credits.toLocaleString()}</span></div>)}</div>
    <details className="production-advanced"><summary>Game data diagnostics</summary><p>Reported updates in the last 60 seconds. Covered values use the last received data.</p>{feed.features.map(feature => <div className="product-data-row" key={feature.name}><span>{feature.name}</span><small>{feature.state} · {feature.changes} updates · {feature.ageMs === null ? 'Waiting' : `${Math.floor(feature.ageMs / 1000)} seconds since update`}</small></div>)}</details>
    <PlayerCoverage players={feed.playerCoverage} />
  </section>;
}
