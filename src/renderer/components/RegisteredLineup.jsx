import React from 'react';
export default function RegisteredLineup({ show }) {
  const teams = show?.registeredRoster || [];
  if (!teams.some(team => team.players?.length)) return null;
  return <details className="air-folded"><summary>Tournament lineup</summary>
    <p className="air-muted">Registered names for preparation. Live players, agents and scores come from game events.</p>
    {teams.map((team, index) => <div key={index}><strong>{team.team}</strong>
      {team.players.map((player, slot) => <div className="product-data-row" key={slot}><span>{player.name}</span><small>{player.role}</small></div>)}
    </div>)}
  </details>;
}
