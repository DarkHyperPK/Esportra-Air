import React, { useEffect, useState, useRef } from 'react';
import AirShell from './air/AirShell.jsx';
const api = window.esportraBroadcast?.simulation;
const time = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const NAV = [{ id: 'readiness', label: 'Match setup' }, { id: 'producer', label: 'Live controls' }, { id: 'outputs', label: 'Advanced sources' }, { id: 'rehearsal', label: 'Rehearsal' }];

export default function RehearsalScreen({ status, onScreenChange }) {
  const [player, setPlayer] = useState(null), [obs, setObs] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [scene, setScene] = useState('');
  const [position, setPosition] = useState(null);
  const previewRef = useRef(null);
  useEffect(() => {
    if (!player?.loaded || !previewRef.current) return;
    const observer = new ResizeObserver(entries => { previewRef.current?.style.setProperty('--rehearsal-scale', entries[0].contentRect.width / 1920); });
    observer.observe(previewRef.current); return () => observer.disconnect();
  }, [player?.loaded]);
  useEffect(() => {
    let mounted = true;
    const update = async () => {
      try { const [playback, switcher] = await Promise.all([api?.getStatus(), window.esportraBroadcast?.obs?.getStatus()]); if (mounted) { setPlayer(playback?.status || null); setObs(switcher); } }
      catch { if (mounted) setError('Could not read rehearsal status.'); }
    };
    void update(); const timer = setInterval(update, 500);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  async function control(input) {
    setBusy(true); setError('');
    try { const result = await api.control(input); if (!result.ok) throw new Error(result.error); setPlayer(result.status); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const canUseObs = obs?.connected && !status?.gepActive && !status?.runner?.activeSegment && !status?.runner?.onAirSegment;
  return <AirShell screenTitle="Rehearsal" nodeName={status?.nodeName} nav={NAV} activeTab="rehearsal" onTabChange={onScreenChange}>
    <main className="air-content rehearsal-workspace">
      <div className="product-page-head"><div><span className="section-kicker">SAMPLE DATA</span><h1>Practice before the broadcast.</h1><p>Try the HUD and automatic graphics with a short sample match. Your tournament data stays separate.</p></div></div>
      {(error || player?.error) && <p className="broadcast-error" role="alert">{error || player.error}</p>}
      {player?.takeError && <p className="broadcast-error" role="alert">{player.takeError}</p>}
      {!player?.loaded ? <button className="air-primary-btn" disabled={busy || !status?.hudOnline} onClick={() => control({ action: 'load' })}>Load sample match</button> : <>
        <div className="rehearsal-preview" ref={previewRef}><iframe title="Rehearsal HUD — sample data" src={player.url} /></div>
        <div className="rehearsal-controls">
          <button className="air-primary-btn" disabled={busy || player.busy || (!player.playing && player.positionMs >= player.durationMs)} onClick={() => control({ action: player.playing ? 'pause' : 'play' })}>{player.playing ? 'Pause' : 'Play'}</button>
          <button className="air-ghost-btn" disabled={busy || player.busy} onClick={() => control({ action: 'seek', value: 0 })}>Rewind</button>
          <label>Speed <select className="product-input" value={player.speed} disabled={busy} onChange={event => control({ action: 'speed', value: Number(event.target.value) })}>{[0.5, 1, 2, 4, 10].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
          <output>{time(position ?? player.positionMs)} / {time(player.durationMs)}</output>
        </div>
        <p className="air-empty-state">Rehearsal autopilot · {player.rundown?.onAirSegment ? `${player.allowObs ? 'OBS confirmed' : 'Simulated take'}: ${player.rundown.onAirSegment.name}` : player.rundown?.activeSegment ? `Waiting for OBS tally: ${player.rundown.activeSegment.name}` : 'Waiting for the next sample round'}.</p>
        <label className="rehearsal-scrub">Match position<input aria-label="Rehearsal position" type="range" min="0" max={player.durationMs} step="1000" value={position ?? player.positionMs} disabled={busy || player.busy} onChange={event => setPosition(Number(event.target.value))} onPointerUp={event => { void control({ action: 'seek', value: Number(event.currentTarget.value) }); setPosition(null); }} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) { void control({ action: 'seek', value: Number(event.currentTarget.value) }); setPosition(null); } }} /></label>
        <section className="rehearsal-obs"><h2>Practice scene changes</h2><p>Optional. Allow OBS to switch to your chosen scene when a sample round starts. This affects OBS on this PC.</p>
          <select className="product-input" aria-label="Rehearsal OBS scene" value={scene} disabled={player.allowObs || !canUseObs} onChange={event => setScene(event.target.value)}><option value="">Choose an OBS scene</option>{(obs?.scenes || []).map(item => { const name = typeof item === 'string' ? item : item.sceneName; return <option key={name} value={name}>{name}</option>; })}</select>
          <label><input type="checkbox" checked={player.allowObs} disabled={busy || (!player.allowObs && (!canUseObs || !scene))} onChange={event => control({ action: 'obs', allowObs: event.target.checked, scene })} /> Allow OBS scene changes</label>
          {!canUseObs && <p>Stop the live broadcast screens and capture, then connect OBS to use scene changes.</p>}
        </section>
      </>}
    </main>
  </AirShell>;
}
