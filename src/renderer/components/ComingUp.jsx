import React from 'react';
export function OnAirItem({ runner, programScene }) {
  const item = runner?.onAirSegment;
  const elsewhere = !!item && !!programScene && item.scene !== programScene;
  return <section className="production-coming-up" aria-label="Current screen"><div className="air-section-label">{elsewhere ? 'Current screen' : 'On air'}</div><p className="production-now">{item?.name || 'No Air screen on air yet'}</p>{elsewhere && <small>OBS is showing {programScene}. This scene change did not advance the broadcast screens.</small>}</section>;
}
export default function ComingUp({ runner }) {
  const upcoming = runner?.comingUp || (runner?.segments || []).filter(item => item.state === 'queued').slice(0, 3);
  return <section className="production-coming-up" aria-label="Coming up">
    <div className="air-section-label">Coming up</div>
    {upcoming.length ? <ol>{upcoming.map(item => <li key={item.id}><span>{item.name}</span><small>Queued</small></li>)}</ol> : <p className="air-empty-state">No more queued items.</p>}
  </section>;
}
