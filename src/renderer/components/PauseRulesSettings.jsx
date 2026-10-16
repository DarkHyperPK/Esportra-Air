import React, { useState } from 'react';
export default function PauseRulesSettings() {
  const api = window.esportraBroadcast?.pauseRules;
  const [settings, setSettings] = useState(null), [scenes, setScenes] = useState([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function load() { try { const result = await api.get(); if (!result.ok) throw new Error(result.error); setSettings(result.config); setScenes(result.scenes); } catch (_) { setNotice('Could not load pause settings. Check OBS and retry.'); } }
  async function save() {
    setBusy(true); setNotice('');
    try { const result = await api.set(settings); setNotice(result.ok ? 'Pause behavior saved on this computer.' : result.error); }
    catch (_) { setNotice('Could not save pause behavior. Retry before starting the broadcast screens.'); }
    finally { setBusy(false); }
  }
  return <details className="production-advanced" onToggle={event => { if (event.currentTarget.open && !settings) void load(); }}>
    <summary>Pause & timeout behavior</summary>
    <p>Manual technical pause or team timeout shows a HUD panel after this delay. OBS disconnection pauses automation without declaring a game pause.</p>
    {settings && <>
      <label><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} /> Show pause and timeout panels</label>
      <label className="air-field-label">Panel delay (seconds)<input className="air-text-input" type="number" min="1" max="30" value={settings.delayMs / 1000} disabled={busy} onChange={event => setSettings(current => ({ ...current, delayMs: Math.round(Number(event.target.value) * 1000) }))} /></label>
      <label className="air-field-label">During a technical pause<select className="air-text-input" disabled={busy} value={settings.scene || ''} onChange={event => setSettings(current => ({ ...current, scene: event.target.value || null }))}><option value="">Keep current Program · graphics only</option>{settings.scene && !scenes.includes(settings.scene) && <option value={settings.scene}>{settings.scene} · saved scene unavailable</option>}{scenes.map(scene => <option key={scene} value={scene}>Take {scene}</option>)}</select></label>
      <p>Choosing a scene explicitly allows this one pause rule to take it while paused. Resume clears the panel; it leaves Program where it is. All other automatic takes stay blocked.</p>
      <div className="product-actions"><button className="air-ghost-btn" disabled={busy} onClick={() => void load()}>Refresh OBS scenes</button><button className="air-ghost-btn" disabled={busy} onClick={() => void save()}>Save pause behavior</button></div>
    </>}
    {notice && <p role="status">{notice}</p>}
  </details>;
}
