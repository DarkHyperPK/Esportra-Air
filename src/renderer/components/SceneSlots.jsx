import React, { useEffect, useState } from 'react';
import ConfirmDialog from './air/ConfirmDialog.jsx';
const api = window.esportraBroadcast?.obs;
export default function SceneSlots({ onChanged }) {
  const [setup, setSetup] = useState(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [choices, setChoices] = useState({});
  async function refresh() {
    try { const result = await api.getSlots(); if (!result.ok) throw new Error(result.error); setSetup(result); }
    catch (failure) { setError(failure.message); }
  }
  useEffect(() => {
    if (!api?.getSlots) return;
    void refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer);
  }, []);
  async function perform(action) {
    setBusy(true); setError(''); setNotice('');
    try { const result = await action(); if (!result.ok) throw new Error(result.error); setSetup(result); setNotice('Broadcast collection and source slots ready.'); onChanged?.(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <details className="production-advanced scene-slots"><summary>Broadcast collection &amp; source slots</summary>
    <p>Air prepares its own OBS collection with five broadcast scenes. Add your game feed and cameras in OBS, then connect them to these slots.</p>
    <div className="product-actions"><button className="air-ghost-btn" disabled={busy || !api?.buildCollection} onClick={() => setConfirm(true)}>{setup?.owned ? 'Rebuild Air scenes' : 'Create broadcast collection'}</button><button className="air-ghost-btn" disabled={busy || !api?.getSlots} onClick={refresh}>Refresh source slots</button></div>
    {error && <p className="broadcast-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {setup?.currentCollection && <p className="air-empty-state">OBS collection: {setup.currentCollection}</p>}
    {setup?.owned && setup.slots.map(slot => <div className="scene-slot-row" key={slot.id}><div><strong>{slot.label}</strong><small>{slot.sources.length ? `Connected: ${slot.sources.join(', ')}` : 'Waiting for an OBS input'}</small></div><select className="product-input" aria-label={`Input for ${slot.label}`} value={choices[slot.id] || ''} onChange={event => setChoices(previous => ({ ...previous, [slot.id]: event.target.value }))}><option value="">Choose existing input</option>{setup.inputs.map(input => <option key={input.name} value={input.name}>{input.name}</option>)}</select><button className="air-ghost-btn" disabled={busy || !choices[slot.id]} onClick={() => perform(() => api.assignSlot(slot.id, choices[slot.id]))}>Add to slot</button></div>)}
    {setup?.owned && !setup.inputs.length && <p>Open OBS and add your game capture or camera input. Air detects it on the next refresh.</p>}
    {confirm && <ConfirmDialog title={setup?.owned ? 'Rebuild broadcast scenes?' : 'Create an Air broadcast collection?'} body="This switches OBS to Air’s broadcast collection. Stop OBS streaming and recording first. Air preserves your other collections and existing source content." confirmLabel={setup?.owned ? 'Rebuild Air scenes' : 'Create collection'} confirming={busy} confirmVariant="primary" onCancel={() => setConfirm(false)} onConfirm={async () => { await perform(() => api.buildCollection()); setConfirm(false); }} />}
  </details>;
}
