import React, { useEffect, useState } from 'react';
import AirShell from './air/AirShell.jsx';
import { ACTIONS, DEFAULTS, validateBindings, eventBinding } from '../../shortcuts.js';
const api = window.esportraBroadcast?.shortcuts;
export default function ShortcutSettings({ status, onScreenChange }) {
  const [bindings, setBindings] = useState(DEFAULTS), [recording, setRecording] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api?.get().then(result => { if (result.ok) setBindings(result.bindings); else setError(result.error); }).catch(() => setError('Could not load shortcuts. Reopen settings to retry.')); }, []);
  useEffect(() => {
    if (!recording) return;
    function capture(event) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { setRecording(null); return; }
      if (event.repeat) return;
      const key = eventBinding(event);
      if (!key) return;
      const next = { ...bindings, [recording]: key }, result = validateBindings(next);
      setError(result.ok ? '' : result.error);
      if (result.ok) { setBindings(next); setRecording(null); setNotice('Unsaved changes. Save shortcuts to use them.'); }
    }
    document.addEventListener('keydown', capture, true);
    return () => document.removeEventListener('keydown', capture, true);
  }, [recording, bindings]);
  async function save(reset = false) {
    setBusy(true); setError('');
    try {
      if (!api) throw new Error('Shortcut settings require the Air desktop app.');
      const result = await api.set(reset ? DEFAULTS : bindings);
      if (!result.ok) throw new Error(result.error);
      setBindings(result.bindings); setRecording(null); setNotice(reset ? 'Default shortcuts restored.' : 'Shortcuts saved on this workstation.');
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <AirShell screenTitle="Keyboard shortcuts" show={status?.show} nodeName={status?.nodeName} contextualButton={<button className="air-ghost-btn" onClick={() => onScreenChange('producer')}>Back to production</button>}>
    <div className="air-content shortcut-settings">
      <h1>Keyboard shortcuts</h1><p>Click a binding, then press your new keys. Escape cancels. Shortcuts work only in production, outside text fields and dialogs.</p>
      {error && <p className="broadcast-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <div aria-label="Production shortcuts">{ACTIONS.map(action => <div className="shortcut-row" key={action.id}>
        <div><h2>{action.label}</h2><p>{action.description}</p></div>
        <button className="air-ghost-btn" aria-label={`Change ${action.label} shortcut`} disabled={busy} onClick={() => { setRecording(action.id); setError(''); }}>
          {recording === action.id ? 'Press keys… Esc to cancel' : bindings[action.id]}
        </button>
      </div>)}</div>
      <div className="product-actions"><button className="air-primary-btn" disabled={busy || !!recording} onClick={() => save()}>Save shortcuts</button><button className="air-ghost-btn" disabled={busy} onClick={() => save(true)}>Reset all shortcuts</button></div>
    </div>
  </AirShell>;
}
