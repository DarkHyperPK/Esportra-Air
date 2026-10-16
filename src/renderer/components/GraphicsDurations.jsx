import React, { useState } from 'react';
const LABELS = { recapMs: 'Round recap', multiKillMs: 'Multi-kill', clutchMs: 'Clutch', flawlessMs: 'Flawless', aceMs: 'Ace / team ace' };
export default function GraphicsDurations() {
  const api = window.esportraBroadcast?.rules;
  const [durations, setDurations] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function load() { try { const result = await api.get(); if (!result.ok) throw new Error(result.error); setDurations(result.durations); } catch (_) { setNotice('Could not load graphic timings. Reopen production to retry.'); } }
  async function save() {
    setBusy(true); setNotice('');
    try { const result = await api.set(durations); setNotice(result.ok ? 'Graphic timings saved on this workstation.' : result.error); }
    catch (_) { setNotice('Could not save timings. Keep the current values and retry.'); }
    finally { setBusy(false); }
  }
  return <details className="production-advanced" onToggle={event => { if (event.currentTarget.open && !durations) void load(); }}>
    <summary>Automatic graphic timings</summary><p>These rules change graphics only. They do not switch OBS scenes.</p>
    {durations && Object.entries(LABELS).map(([key, label]) => <label className="air-field-label" key={key}>{label} (seconds)<input className="air-text-input" type="number" min="1" max="30" step="0.1" value={durations[key] / 1000} disabled={busy} onChange={event => setDurations(previous => ({ ...previous, [key]: Math.round(Number(event.target.value) * 1000) }))} /></label>)}
    {durations && <button className="air-ghost-btn" disabled={busy} onClick={save}>Save timings</button>}{notice && <p role="status">{notice}</p>}
  </details>;
}
