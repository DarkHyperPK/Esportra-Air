import React from 'react';
const LABELS = { scores: 'On-air score', series: 'Series wins', map_result: 'Map result', names: 'Team names & tags', player_name: 'Player display name', sides: 'Attacking / defending sides', observed: 'Observed player' };
export default function ActiveDisplayFixes({ context, busy, change }) {
  return <section>
    <h2>Active overrides</h2>
    {context.active.length ? context.active.map(entry => <div className="product-data-row" key={entry.field}><div><strong>{LABELS[entry.field]}</strong><p>{entry.until === 'next_round' ? 'Until next round' : 'Until cleared'} · {entry.reason}</p></div><button className="air-ghost-btn" disabled={busy} onClick={() => void change({ action: 'clear', field: entry.field })}>Clear {LABELS[entry.field]}</button></div>) : <p>No on-air overrides. The HUD follows its match and game data.</p>}
    <div className="product-actions"><button className="air-ghost-btn" disabled={busy || !context.canUndo} onClick={() => void change({ action: 'undo' })}>Undo last fix</button><button className="air-ghost-btn" disabled={busy || !context.active.length} onClick={() => void change({ action: 'clear' })}>Clear all overrides</button></div>
    <p>Undo is available for changes made in this session and round. Next-round locks expire on received game updates; clear manually if the observer is offline.</p>
    <p>Undo affects the local overlay. It does not withdraw a delivered result proposal or reverse an approved official result.</p>
  </section>;
}
