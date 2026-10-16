import React, { useEffect, useState } from 'react';
import AirShell from './air/AirShell.jsx';
const LABELS = { manual_take: 'Manual scene take', hold: 'Held next item', skip: 'Skipped item', take_requested: 'Take requested', resume: 'Production resumed', technical_pause: 'Technical pause', timeout_started: 'Team timeout', timeout_ended: 'Timeout ended', data_fixed: 'Data fixed on air', data_fix_queued: 'Data fix queued · on-air update failed', obs_drop: 'OBS disconnected', stale_feed: 'Game feed stale', output_drop: 'Browser output disconnected' };
const ACTORS = { operator:'Local operator', automation:'Autopilot', observer:'Observer', 'game-feed':'Game feed', system:'System' };
function kind(entry) { const actor = entry.data?.actorKind || entry.actor; return entry.type === 'SegmentTake' ? actor === 'automation' ? 'automatic' : actor === 'operator' ? 'manual' : 'unknown' : entry.data?.action === 'manual_take' ? 'manual' : entry.data?.action === 'hold' ? 'hold' : 'other'; }
function title(entry) { return entry.type === 'SegmentTake' ? `${{automatic:'Automatic',manual:'Manual',unknown:'Recorded'}[kind(entry)]} take · ${entry.data?.segmentName || 'Show item'}` : LABELS[entry.data?.action || entry.data?.kind] || entry.type; }
const NAV = [{ id: 'readiness', label: 'Match setup' }, { id: 'producer', label: 'Live controls' }, { id: 'outputs', label: 'Advanced sources' }];
export default function ProductionTimeline({ status, onScreenChange }) {
  const [history, setHistory] = useState({ items: [] }), [error, setError] = useState(''), [selected, setSelected] = useState(null);
  useEffect(() => {
    let mounted = true;
    const update = async () => { try { const result = await window.esportraBroadcast.air.getHistory(); if (mounted) { if (!result.ok) throw new Error(result.error); setHistory(result.history || { items: [] }); setError(''); } } catch { if (mounted) setError('Could not load local history.'); } };
    void update(); const timer = setInterval(update, 5000); return () => { mounted = false; clearInterval(timer); };
  }, []);
  const now = history.until || Date.now(), since = now - 3600000;
  const items = history.items.filter(entry => ['SegmentTake', 'ProductionAction', 'ProductionIncident'].includes(entry.type));
  const bins = Array.from({ length: 60 }, (_, index) => ({ time: since + index * 60000, automatic: 0, manual: 0, hold: 0, unknown: 0 }));
  items.forEach(entry => { const index = Math.min(59, Math.floor((entry.ts - since) / 60000)), type = kind(entry); if (index >= 0 && type !== 'other') bins[index][type]++; });
  const max = Math.max(1, ...bins.map(bin => bin.automatic + bin.manual + bin.hold + bin.unknown));
  const incidents = items.filter(entry => entry.type === 'ProductionIncident' || ['data_fixed','data_fix_queued'].includes(entry.data?.action));
  return <AirShell screenTitle="Show activity" show={status?.show} nodeName={status?.nodeName} nav={NAV} onTabChange={onScreenChange}><main className="air-content production-timeline">
    <div className="product-page-head"><div><h1>The last hour of production.</h1><p>Local records for this show. Scene takes appear after OBS confirms Program.</p></div><button className="air-ghost-btn" onClick={() => onScreenChange('producer')}>Back to OBS controls</button></div>
    {error && <p className="broadcast-error" role="alert">{error}</p>}
    {history.truncated && <p>Showing the latest retained records; earlier activity exceeds the local history limit.</p>}
    <div className="timeline-legend"><span className="automatic">Automatic takes</span><span className="manual">Manual takes</span><span className="hold">Holds</span></div>
    <div className="timeline-strip" aria-label="Sixty-minute production timeline">{bins.map((bin, index) => <button key={index} className="timeline-minute" title={`${new Date(bin.time).toLocaleTimeString()} · ${bin.automatic} automatic · ${bin.manual} manual · ${bin.hold} holds · ${bin.unknown} unspecified takes`} aria-label={`${60-index} minutes ago: ${bin.automatic} automatic takes, ${bin.manual} manual takes, ${bin.hold} holds`} onClick={() => setSelected(index)}>{['hold','manual','automatic','unknown'].map(type => <span key={type} className={type} style={{height:`${bin[type]/max*80}px`}} />)}</button>)}</div>
    <div className="timeline-axis"><span>60 minutes ago</span><span>45</span><span>30</span><span>15</span><span>Now</span></div>
    {selected !== null && <p role="status">{new Date(bins[selected].time).toLocaleTimeString()}: {bins[selected].automatic} automatic takes, {bins[selected].manual} manual takes, {bins[selected].hold} holds.</p>}
    <section><h2>Incidents &amp; data fixes</h2>{!incidents.length && <p>No recorded incidents in the last hour.</p>}{incidents.slice(-30).reverse().map((entry, index) => <div className="timeline-event" key={`${entry.ts}:${index}`}><time>{new Date(entry.ts).toLocaleTimeString()}</time><strong>{title(entry)}{entry.data?.status === 'resolved' ? ' · recovered' : ''}</strong><span>{ACTORS[entry.data?.actorKind || entry.actor] || 'Recorded node'}</span></div>)}</section>
    <section><h2>Takes &amp; holds</h2>{items.filter(entry => kind(entry) !== 'other').slice(-50).reverse().map((entry,index) => <div className="timeline-event" key={`${entry.ts}:${index}`}><time>{new Date(entry.ts).toLocaleTimeString()}</time><strong>{title(entry)}</strong><span>{ACTORS[entry.data?.actorKind || entry.actor] || 'Recorded node'} · {(entry.data?.cause || 'recorded').replaceAll('_',' ')}</span></div>)}</section>
  </main></AirShell>;
}
