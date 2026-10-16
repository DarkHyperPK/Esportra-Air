import React, { useState } from 'react';
const api = window.esportraBroadcast?.obs;
const KINDS = { cut_transition: 'cut', fade_transition: 'fade', obs_stinger_transition: 'stinger' };
export default function SceneMappings({ onSaved }) {
  const [setup, setSetup] = useState(null), [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function refresh() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.getSetup();
      if (!result.ok) throw new Error(result.error);
      setSetup(result); setRows(result.segments.map(item => ({ id: item.id, scene: item.scene, transition: item.transition || null })));
    } catch (_) { setError('Could not read OBS scenes. Connect OBS and try again.'); }
    finally { setBusy(false); }
  }
  async function save(reset = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.setSetup(reset ? setup.defaults.map(item => ({ id: item.id, scene: item.scene, transition: null })) : rows);
      if (!result.ok) throw new Error(result.error);
      setNotice('Scene mappings saved on this workstation. Broadcast screens is ready for review.'); onSaved?.();
      if (reset) setRows(setup.defaults.map(item => ({ id: item.id, scene: item.scene, transition: null })));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const update = (id, patch) => setRows(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  const unavailable = setup?.inspectionIncomplete || rows.some(row => !setup?.scenes.includes(row.scene));
  return <details className="production-advanced scene-mappings">
    <summary>Scene mappings</summary><p>Use your existing OBS scenes. Stop the broadcast before saving a different mapping.</p>
    <button className="air-ghost-btn" disabled={busy} onClick={refresh}>Refresh scenes from OBS</button>
    {error && <p className="broadcast-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {setup && <><p className="air-empty-state">{setup.collection || 'Collection unavailable'} · OBS {setup.version || 'version unavailable'}</p>
      {setup.segments.map(segment => {
        const row = rows.find(item => item.id === segment.id);
        return <div className="scene-mapping-row" key={segment.id}>
          <strong>{segment.name}</strong>
          <label className="air-field-label" htmlFor={`scene-${segment.id}`}>Scene<select id={`scene-${segment.id}`} aria-label={`Scene for ${segment.name}`} className="air-text-input" value={row.scene} disabled={busy} onChange={event => update(row.id, { scene: event.target.value })}>
            {!setup.scenes.includes(row.scene) && <option value={row.scene}>Missing: {row.scene}</option>}{setup.scenes.map(scene => <option key={scene}>{scene}</option>)}
          </select></label>
          <label className="air-field-label" htmlFor={`transition-${segment.id}`}>Transition<select id={`transition-${segment.id}`} aria-label={`Transition for ${segment.name}`} className="air-text-input" value={row.transition?.name || ''} disabled={busy} onChange={event => {
            const transition = setup.transitions.find(item => item.transitionName === event.target.value);
            update(row.id, { transition: transition ? { mode: KINDS[transition.transitionKind], name: transition.transitionName, ...(KINDS[transition.transitionKind] === 'fade' ? { durationMs: 300 } : {}) } : null });
          }}><option value="">Current OBS transition</option>{setup.transitions.filter(item => KINDS[item.transitionKind]).map(item => <option key={item.transitionName}>{item.transitionName}</option>)}</select></label>
          {row.transition?.mode === 'fade' && <label className="air-field-label">Fade milliseconds<input className="air-text-input" type="number" min="50" max="10000" value={row.transition.durationMs} onChange={event => update(row.id, { transition: { ...row.transition, durationMs: Number(event.target.value) } })} /></label>}
        </div>;
      })}
      {unavailable && <p className="broadcast-error" role="alert">Resolve missing scenes or refresh OBS before saving.</p>}
      <div className="product-actions"><button className="air-primary-btn" disabled={busy || unavailable || !rows.length} onClick={() => save()}>Save mappings</button><button className="air-ghost-btn" disabled={busy || !rows.length} onClick={() => save(true)}>Restore Esportra mappings</button></div>
    </>}
  </details>;
}
