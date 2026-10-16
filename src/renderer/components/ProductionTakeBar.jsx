import React from 'react';
export default function ProductionTakeBar({ obs, tally, paused, onTake, onChange, value }) {
  const transitions = obs?.transitions || [];
  const stingers = transitions.filter(item => item.transitionKind === 'obs_stinger_transition');
  const stinger = stingers.some(item => item.transitionName === value.stinger) ? value.stinger : stingers[0]?.transitionName || '';
  const cut = transitions.find(item => item.transitionKind === 'cut_transition');
  const fade = transitions.find(item => item.transitionKind === 'fade_transition');
  const disabled = !obs?.connected || !tally.preview || paused || value.busy || obs?.transitionActive;
  const choice = mode => mode === 'cut' ? { mode, name: cut?.transitionName } : mode === 'fade' ? { mode, name: fade?.transitionName, durationMs: value.durationMs } : { mode, name: stinger };
  return <section className="production-take-bar" aria-label="Preview to program controls">
    <div className="air-section-label">Show your preview to viewers</div>
    <p>{tally.preview || 'Enable Studio Mode and choose a preview scene in OBS.'}</p>
    <div className="product-actions">
      <button className="air-primary-btn" disabled={disabled} onClick={() => onTake()}>Show preview on air</button>
      <button className="air-ghost-btn" disabled={disabled || !cut} onClick={() => onTake(choice('cut'))}>Cut</button>
      <button className="air-ghost-btn" disabled={disabled || !obs?.studioMode || !fade} onClick={() => onTake(choice('fade'))}>Fade</button>
      <button className="air-ghost-btn" disabled={disabled || !obs?.studioMode || !stinger} onClick={() => onTake(choice('stinger'))}>Stinger</button>
    </div>
    <details className="production-advanced"><summary>Transition options</summary>
      <label className="air-field-label">Fade duration (milliseconds)<input className="air-text-input" type="number" min="50" max="10000" value={value.durationMs} onChange={event => onChange({ ...value, durationMs: Number(event.target.value) })} /></label>
      <label className="air-field-label">Stinger<select className="air-text-input" value={stinger} onChange={event => onChange({ ...value, stinger: event.target.value })}><option value="">No Stinger available</option>{stingers.map(item => <option key={item.transitionName}>{item.transitionName}</option>)}</select></label>
    </details>
    {!obs?.studioMode && obs?.connected && <p className="air-empty-state">Enable Studio Mode in OBS to prepare Preview and use animated transitions.</p>}
    {!stingers.length && obs?.connected && <p className="air-empty-state">Add your Stinger transition in OBS to enable Stinger and replay.</p>}
  </section>;
}
