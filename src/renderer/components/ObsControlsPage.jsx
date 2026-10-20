import { WorkspaceAction } from "./air/ReferenceUI.jsx";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Check, ChevronDown, CircleHelp, Clapperboard, Clock3, Film, Layers, Monitor, Pause, Play, Radio, RefreshCw, Settings2, ShieldCheck, Square, TriangleAlert, X } from 'lucide-react';
import AirShell from './air/AirShell.jsx';
import { PageHead, useWorkspace } from '../workspace.jsx';
import { DEFAULTS } from '../../shortcuts.js';

const api = window.esportraBroadcast?.obsConsole;
const editable = config => {
  const { replayInputName, replayInputId, ...values } = config;
  return values;
};
function CheckRow({ checked, onChange, children, disabled }) {
  return <label className="oc-check"><input type="checkbox" checked={checked === true} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{children}</span></label>;
}
function Field({ label, value, onChange, children, disabled }) {
  return <label className="oc-field"><span>{label}</span><select aria-label={label} disabled={disabled} value={value || ''} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}

export default function ObsControlsPage({ mode = 'operation', embedded = false }) {
  const setup = mode === 'setup';
  const Body = embedded ? 'section' : 'main';
  const { navigate } = useWorkspace();
  const [data, setData] = useState(null), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState(null), [bindings, setBindings] = useState(DEFAULTS);
  const dirty = useRef(false), scope = useRef(null), mounted = useRef(true), inFlight = useRef(false);
  const adopt = useCallback(value => {
    if (!mounted.current) return;
    setData(value);
    if (!dirty.current || scope.current !== value.context) { setDraft(editable(value.config)); dirty.current = false; }
    if (scope.current !== value.context) setPreview(null);
    scope.current = value.context;
    if (value.preview) setPreview(value.preview);
  }, []);
  const refresh = useCallback(async (force = false) => {
    if (!api || inFlight.current) return;
    inFlight.current = true;
    try { const result = await api.get({ refresh: force }); if (!result.ok) throw new Error(result.error); adopt(result.controls); }
    catch (failure) { if (mounted.current) setError(failure.message); }
    finally { inFlight.current = false; }
  }, [adopt]);
  useEffect(() => {
    mounted.current = true; void refresh();
    let debounce;
    const off = api?.onChanged(() => { clearTimeout(debounce); debounce = setTimeout(() => void refresh(), 100); });
    const timer = setInterval(() => void refresh(), 1500);
    window.esportraBroadcast?.shortcuts?.get().then(result => { if (result.ok && mounted.current) setBindings(result.bindings); });
    return () => { mounted.current = false; clearTimeout(debounce); clearInterval(timer); off?.(); };
  }, [refresh]);
  const run = useCallback(async (action, input = {}) => {
    if (!data || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.action({ context: data.context, action, ...input });
      if (!result.ok) throw new Error(result.error);
      adopt(result.controls);
      if (action === 'setup-replay') setNotice('Dedicated media source prepared in your existing replay scene. Review audio before playback.');
      if (action === 'select') setNotice(data.obs.studioMode ? 'OBS Preview selected. Program is unchanged.' : 'Next scene selected in Air. Program is unchanged.');
    } catch (failure) { setError(failure.message); void refresh(); }
    finally { if (mounted.current) setBusy(false); }
  }, [data, busy, adopt, refresh]);
  function change(key, value) { dirty.current = true; setDraft(current => ({ ...current, [key]: value })); }
  function highlight(key, value) { dirty.current = true; setDraft(current => ({ ...current, highlights: { ...current.highlights, [key]: value } })); }
  async function save(values) {
    if (!data || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.configure({ context: data.context, settings: values });
      if (!result.ok) throw new Error(result.error);
      dirty.current = false; adopt(result.controls); setNotice('OBS control settings saved on this workstation.');
    } catch (failure) { setError(failure.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (!api) return <AirShell screenTitle="OBS controls"><div className="workspace-page"><h1>Open the Air desktop app</h1><p>This panel requires the local desktop connection.</p></div></AirShell>;
  if (!data || !draft) { const loading = <div className="workspace-page" role="status">Reading OBS controls…{error && <p role="alert">{error}</p>}</div>; return embedded ? loading : <AirShell screenTitle="OBS controls">{loading}</AirShell>; }
  const { inventory, obs, config } = data;
  const available = config.enabled && obs.connected && !!obs.tally?.program && !inventory.stale && !inventory.error;
  const working = busy || data.busy || obs.transitionActive;
  const selected = inventory.scenes.find(row => row.id === data.selectedId);
  const sourceReady = inventory.inputs.some(input => input.id === config.replayInputId && input.kind === 'ffmpeg_source');
  const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(obs.host);
  const readyCount = data.replays.filter(row => row.state === 'ready').length;
  const sceneOptions = <><option value="">Choose an existing OBS scene</option>{inventory.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</>;
  const content = <Body className={`workspace-page oc-page${setup ? ' oc-setup-page' : ''}`}>
      {!embedded && <PageHead eyebrow={setup ? 'PREPARATION' : 'OPERATION'} title={setup ? 'OBS & replay setup' : 'OBS controls'}>{setup ? 'Configure optional scene controls, replay mappings and capture rules before production. Start streaming directly in OBS.' : 'Use your existing scenes. Switch here or directly in OBS; Air follows the actual output.'}</PageHead>}
      {!setup && <div className="oc-output-state" aria-label="Actual OBS output status"><span className={`oc-pill ${obs.streamActive === true ? 'good' : 'warn'}`}>{!obs.connected ? 'Stream status unknown · OBS offline' : obs.streamActive === true ? 'OBS streaming' : obs.streamActive === false ? 'OBS stream stopped' : 'Stream status unverified'}</span><span className="oc-pill">{!obs.connected || obs.recordActive == null ? 'Recording unverified' : obs.recordActive ? 'OBS recording' : 'Recording stopped'}</span><p>Start and stop streaming directly in OBS.</p></div>}
      <div className="oc-toolbar">
        <div className="oc-engine"><Monitor size={19} /><strong>OBS Studio</strong><span className={`oc-pill ${obs.connected && !inventory.stale ? 'good' : 'warn'}`}>{obs.connected ? inventory.stale ? 'Reconciling' : 'Connected' : 'Offline · Last observed'}</span><small>{inventory.collection || 'No collection connected'}</small></div>
        <WorkspaceAction variant="secondary" className="" disabled={busy} onClick={() => void refresh(true)}><RefreshCw size={14} />Refresh inventory</WorkspaceAction>
        {setup ? <button className={config.enabled ? 'air-ghost-btn' : 'air-primary-btn'} disabled={working} onClick={() => void save({ enabled: !config.enabled })}>{config.enabled ? 'Disable optional controls' : 'Enable optional controls'}</button> : <WorkspaceAction variant="secondary" className="" onClick={() => navigate('obs-setup')}>Open OBS & replay setup</WorkspaceAction>}
      </div>
      {!config.enabled && <div className="oc-information"><ShieldCheck size={20} /><p><strong>Optional OBS controls are off.</strong> Enable them in Preparation → OBS & replay setup. Live HUD graphics remain available independently.</p></div>}
      {(error || inventory.error || data.error) && <div className="oc-alert" role="alert"><TriangleAlert size={17} /><span>{error || inventory.error || data.error}</span><button aria-label="Dismiss control error" onClick={() => setError('')}><X size={14} /></button></div>}
      {notice && <p className="oc-notice" role="status"><Check size={14} />{notice}</p>}
      {data.shortcutConflicts.length > 0 && <p className="oc-alert" role="status">Some global shortcuts are unavailable: {data.shortcutConflicts.join(', ')}. Focused shortcuts remain available.</p>}
      {!setup && <div className="oc-columns">
        <section className="oc-panel oc-scenes" aria-label="OBS scene controls">
          <header><div><h2>Scenes & sources <small>{inventory.scenes.length}</small></h2></div><span className="oc-pill">{obs.studioMode ? 'Studio mode' : 'Direct mode'}</span></header>
          <div className="oc-tally"><div><span className="bc-cap">{obs.connected && !inventory.stale ? 'PROGRAM' : 'LAST OBSERVED PROGRAM'}</span><strong>{obs.tally?.program || 'Unknown'}</strong>{(!obs.connected || inventory.stale) && <small>Observed {obs.observedAt ? new Date(obs.observedAt).toLocaleTimeString() : 'time unavailable'}</small>}</div><ArrowRight size={17} /><div><span className="bc-cap">SELECTED NEXT</span><strong>{selected?.name || 'Choose a scene'}</strong></div></div>
          <div className="oc-take-actions"><WorkspaceAction variant="primary" className="" disabled={!available || working || !selected} onClick={() => void run('take')}><Play size={15} />Take<kbd>{bindings.consoleTake}</kbd></WorkspaceAction><WorkspaceAction variant="secondary" className="" disabled={!available || working || !selected} onClick={() => void run('cut')}><Square size={14} />Cut<kbd>{bindings.consoleCut}</kbd></WorkspaceAction><button className={`air-ghost-btn ${data.hold ? 'oc-held' : ''}`} disabled={!config.enabled || working} onClick={() => void run('hold', { active: !data.hold })}><Pause size={14} />{data.hold ? 'Resume automation' : 'Hold automation'}</button></div>
          <p className="oc-help"><ShieldCheck size={13} />{data.hold ? 'Air scene automation is held. Video, HUD and manual controls continue.' : 'Selecting a scene never takes it live. Manual output changes take priority.'}</p>
          <div className="oc-scene-grid">{inventory.scenes.map(scene => <button key={scene.id} disabled={!available || working} className={`oc-scene ${data.selectedId === scene.id ? 'selected' : ''} ${obs.tally?.program === scene.name ? 'program' : ''}`} onClick={() => void run('select', { sceneId: scene.id })}><span className="oc-scene-symbol"><Camera size={22} /></span><span><strong>{scene.name}</strong><small>{scene.items.length} source{scene.items.length === 1 ? '' : 's'}</small></span>{obs.tally?.program === scene.name ? <span className="oc-pill cue">PROGRAM</span> : obs.tally?.preview === scene.name ? <span className="oc-pill">PREVIEW</span> : null}</button>)}</div>
          {inventory.scenes.length === 0 && <div className="oc-empty"><Layers size={25} /><h3>No scenes discovered</h3><p>Connect OBS in Settings. Existing camera scenes appear here automatically.</p><WorkspaceAction variant="secondary" className="" onClick={() => navigate('connections')}>Open connections</WorkspaceAction></div>}
          {selected && <details className="oc-source-list" open><summary>Sources in {selected.name}<ChevronDown size={13} /></summary>{selected.items.length ? selected.items.map(item => <div key={item.id}><Monitor size={14} /><span>{item.name}</span><span className="oc-pill">{item.enabled ? 'Enabled' : 'Hidden'}</span></div>) : <p className="oc-help">This scene has no sources. Add them in OBS.</p>}<p className="oc-help">Read-only inventory. Camera placement and source settings stay in OBS.</p></details>}
        </section>
        <section className="oc-panel oc-replays" aria-label="Prepared replay queue">
          <header><div><h2>Replay queue <small>{readyCount} ready</small></h2></div></header>
          <div className="oc-replay-health"><span className={`oc-pill ${obs.replayBufferActive === true ? 'good' : 'warn'}`}>{obs.replayBufferActive === true ? 'Buffer running' : obs.replayBufferActive === false ? 'Buffer off' : 'Buffer unverified'}</span><span className="oc-pill">{config.highlights.enabled ? 'Capture enabled' : 'Capture off'}</span><span className="oc-pill">Phase: {data.phase || 'unknown'}</span></div>
          {data.playback && <div className="oc-playing"><Radio size={18} /><div><strong>Replay {data.playback.phase}</strong><small>{data.playback.error || 'Stinger, replay, guarded return to gameplay.'}</small></div><WorkspaceAction variant="primary" className="" disabled={working || data.playback.phase !== 'playing'} onClick={() => void run('return-gameplay')}>Return to gameplay</WorkspaceAction></div>}
          <div className="oc-replay-list">{data.replays.length ? [...data.replays].reverse().map(row => <article className={`oc-replay-card ${row.state === 'ready' ? 'ready' : ''}`} key={row.id}><div className="oc-replay-icon"><Clapperboard size={23} /></div><div className="oc-replay-copy"><strong>{row.title}</strong><small>{row.kills || 0} events · {row.durationMs ? `${(row.durationMs / 1000).toFixed(1)} sec verified clip` : 'Duration pending'}</small><span className={`oc-pill ${row.state === 'ready' ? 'good' : row.state === 'failed' ? 'warn' : ''}`}>{row.state}</span>{row.error && <p>{row.error}</p>}</div><div className="oc-replay-actions"><WorkspaceAction variant="secondary" className="" disabled={!available || working || row.state !== 'ready' || !!data.playback} onClick={() => void run('preview-replay', { id: row.id })}>Preview frame</WorkspaceAction><WorkspaceAction variant="primary" className="" disabled={!available || working || row.state !== 'ready' || !!data.playback} onClick={() => void run('play-replay', { id: row.id })}><Play size={13} />Play replay</WorkspaceAction><button className="air-text-btn" disabled={working || ['saving', 'preparing', 'playing'].includes(row.state)} onClick={() => void run('dismiss-replay', { id: row.id })}>Dismiss</button></div><p className="oc-footage">{row.footage || 'OBS output · Camera coverage unverified'}</p></article>) : <div className="oc-empty"><Clapperboard size={29} /><h3>No replay clips yet</h3><p>GEP kills prepare candidates when capture is enabled. You choose when to play them.</p></div>}</div>
          {preview && <div className="oc-clip-preview"><header><span>Replay frame · Preview only</span><button aria-label="Close replay frame" onClick={() => setPreview(null)}><X size={15} /></button></header><img src={preview.image} alt="Prepared replay preview frame from OBS" /><p>A frame does not verify camera coverage. Review the recorded action before airing.</p></div>}
          <p className="oc-help"><Clock3 size={13} />One Play action runs the configured stinger, the prepared clip, then the stinger back to your gameplay scene.</p>
        </section>
      </div>
      }
      {setup && <details className="oc-panel oc-setup" open={!sourceReady || !config.audioReviewed}>
        <summary><Settings2 size={17} /><span>Replay & control setup</span><span className="oc-pill">{sourceReady && config.audioReviewed ? 'Configured' : 'Needs setup'}</span><ChevronDown size={15} /></summary>
        <div className="oc-settings-grid"><section><h3>Scenes & transition</h3><Field label="Replay scene" value={draft.replaySceneId} onChange={value => change('replaySceneId', value)} disabled={working}>{sceneOptions}</Field><Field label="Gameplay return scene" value={draft.gameplaySceneId} onChange={value => change('gameplaySceneId', value)} disabled={working}>{sceneOptions}</Field><Field label="Stinger transition" value={draft.transitionName} onChange={value => change('transitionName', value)} disabled={working}><option value="">Choose an existing OBS Stinger</option>{inventory.transitions.filter(row => row.kind === 'obs_stinger_transition').map(row => <option key={row.name}>{row.name}</option>)}</Field><WorkspaceAction variant="secondary" className="" disabled={!available || working || !config.replaySceneId || sourceReady || dirty.current} onClick={() => void run('setup-replay')}><Film size={14} />{sourceReady ? 'Dedicated replay source ready' : 'Prepare replay media source'}</WorkspaceAction><p className="oc-help">Save mappings first. Preparing adds one owned media source to the existing replay scene. It never takes the scene live.</p></section>
          <section><h3>Highlight capture</h3><CheckRow checked={draft.highlights.enabled} disabled={working} onChange={value => highlight('enabled', value)}>Automatically prepare GEP highlights</CheckRow><Field label="Highlight preset" value={draft.highlights.preset} onChange={value => highlight('preset', value)} disabled={working}><option value="balanced">Balanced · First elimination + multi-kills</option><option value="multi">Multi-kills only</option><option value="all">All kills</option></Field><div className="oc-number-grid">{[['threshold', 'Multi-kill threshold', 2, 5, 1], ['windowMs', 'Grouping window (seconds)', 1000, 15000, 1000], ['postRollMs', 'Post-roll (seconds)', 1000, 5000, 1000], ['queueSize', 'Queue capacity', 1, 10, 1]].map(([key, label, min, max, scale]) => <label className="oc-field" key={key}><span>{label}</span><input aria-label={label} type="number" disabled={working} min={min / scale} max={max / scale} value={draft.highlights[key] / scale} onChange={event => highlight(key, Number(event.target.value) * scale)} /></label>)}</div><p className="oc-help">Configure at least 30 seconds in OBS Replay Buffer. Plays the entire saved buffer, up to 120 seconds. Adjust its length in OBS; clips are not trimmed.</p></section>
          <section><h3>Playback & shortcuts</h3><CheckRow checked={draft.replayAudioMuted} disabled={working} onChange={value => change('replayAudioMuted', value)}>Mute replay clip audio to avoid doubling live audio</CheckRow><CheckRow checked={draft.audioReviewed} disabled={working || !sourceReady} onChange={value => change('audioReviewed', value)}>I have reviewed the replay scene and audio routing in OBS</CheckRow><CheckRow checked={draft.highlights.allowLive} disabled={working} onChange={value => highlight('allowLive', value)}>Allow manual replay playback during live or unknown game phases</CheckRow><CheckRow checked={draft.globalShortcuts} disabled={working} onChange={value => change('globalShortcuts', value)}>Enable global OBS-control shortcuts while Air is in the background</CheckRow>{!local && <div className="oc-alert" role="alert"><TriangleAlert size={15} /><span><strong>Unencrypted LAN connection.</strong> The OBS WebSocket password travels in cleartext on this network. Use only on a trusted private LAN; never expose OBS WebSocket port to the internet.</span></div>}
<p className="oc-help"><TriangleAlert size={13} />{!local ? 'Replay preparation requires OBS on this PC. Scene controls still work over LAN.' : 'GEP detects events, not camera coverage. Replays contain the observer output OBS recorded, including existing graphics and audio.'}</p><button className="air-text-btn" onClick={() => navigate('shortcuts')}>Edit control shortcuts<ArrowRight size={13} /></button></section>
        </div><footer><p>{dirty.current ? 'Unsaved settings' : 'Settings saved locally'} · Changes affect optional controls, never HUD essentials.</p><WorkspaceAction variant="primary" className="" disabled={working} onClick={() => void save(draft)}>Save control settings</WorkspaceAction></footer>
      </details>}
      <p className="oc-bottom-note"><CircleHelp size={14} />OBS remains available at all times. vMix is supported as an alternative backend — configure <code>obsBackend: "vmix"</code> in Node Settings and connect via the Connections page. Rehearse replay video and audio before going live.</p>
    </Body>;
  return embedded ? content : <AirShell screenTitle={setup ? 'OBS & replay setup' : 'OBS controls'}>{content}</AirShell>;
}
