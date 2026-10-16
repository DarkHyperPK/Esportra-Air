import React, { useState, useEffect, useCallback, useRef } from 'react';
import AirShell from './air/AirShell.jsx';
import ConfirmDialog from './air/ConfirmDialog.jsx';
import HealthRow from './air/HealthRow.jsx';
import KbdBadge from './air/KbdBadge.jsx';
import TallyDot from './air/TallyDot.jsx';
import { ACTIONS, DEFAULTS, matchesBinding } from '../../shortcuts.js';
import ProductionTakeBar from './ProductionTakeBar.jsx';
import ComingUp, { OnAirItem } from './ComingUp.jsx';
import SceneMappings from './SceneMappings.jsx';
import LiveDataStrip from './LiveDataStrip.jsx';
import GraphicsDurations from './GraphicsDurations.jsx';
import GraphicForms from './GraphicForms.jsx';
import SceneSlots from './SceneSlots.jsx';
import PauseRulesSettings from './PauseRulesSettings.jsx';
import RundownRevision from './RundownRevision.jsx';
import { triggerLabel } from '../../segment-plan.js';

const obsApi    = window.esportraBroadcast?.obs    ?? null;
const runnerApi = window.esportraBroadcast?.runner ?? null;

/** Format milliseconds as MM:SS countdown display. */
function formatCountdown(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SEG_BADGE_LABELS = {
  queued:  'QUEUED',
  armed:   'ARMED',
  holding: 'HOLDING',
  taking:  'TAKING',
  on_air:  'ON AIR',
  done:    'DONE',
};

const NAV = [
  { id: 'readiness', label: 'Match setup' },
  { id: 'producer',  label: 'Live controls' },
  { id: 'outputs',   label: 'Advanced sources' },
];

export default function ProducerScreen({ status, onScreenChange }) {
  const [bindings, setBindings] = useState(DEFAULTS);
  const [graphicForm, setGraphicForm] = useState(null);
  useEffect(() => { window.esportraBroadcast?.shortcuts?.get().then(result => { if (result.ok) setBindings(result.bindings); }).catch(() => {}); }, []);
  const triggers = ACTIONS.map(action => ({ ...action, key: bindings[action.id], label: action.label.replace('Change scene · ', '') }));
  const [host,      setHost]      = useState('localhost');
  const [port,      setPort]      = useState('4455');
  const [pass,      setPass]      = useState('');
  const [allowRemote, setAllowRemote] = useState(false);
  const [discovery, setDiscovery] = useState('');
  useEffect(() => { obsApi?.discover?.().then(result => { setDiscovery(result.found ? 'OBS found on this PC. Enter its password, then Connect.' : 'Open OBS and enable WebSocket Server in Tools.'); }).catch(() => setDiscovery('Open OBS and enable WebSocket Server in Tools.')); }, []);
  const [connecting,   setConnecting]   = useState(false);
  const [connError,    setConnError]    = useState('');
  const [obsStatus,    setObsStatus]    = useState(null);
  const [frames,       setFrames]       = useState({ pvw: null, pgm: null });
  const [tally,        setTally]        = useState({ preview: null, program: null });
  const [lastAction,   setLastAction]   = useState(null);
  const [transitionOptions, setTransitionOptions] = useState({ durationMs: 300, stinger: '', busy: false });
  const actionBusy = useRef(false);
  const presetLoaded = useRef(false);
  // P2 autopilot state
  const [confirmStop, setConfirmStop] = useState(false), [stopping, setStopping] = useState(false), [sessionError, setSessionError] = useState('');
  async function stopSession() {
    setStopping(true);setSessionError('');
    try {const result=await runnerApi.stop();if(!result.ok)throw new Error(result.error);setConfirmStop(false);onScreenChange('template');}
    catch(error){setSessionError(error.message||'Could not stop this Air session.');}
    finally{setStopping(false);}
  }
  const [runnerState,  setRunnerState]  = useState(status?.runner || null);
  useEffect(() => setRunnerState(status?.runner || null), [status?.runner]);
  const [countdown,    setCountdown]    = useState(null); // MM:SS string
  const [eventLog,     setEventLog]     = useState([]);
  useEffect(() => { if (status?.productionEvents) setEventLog(status.productionEvents.slice(-100)); }, [status?.productionEvents]);
  const countdownRef = useRef(null); // { end: performance.now() target, tick: interval }

  // ── P2: hold countdown helpers (monotonic clock) ─────────────────────────
  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current.tick);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startCountdown = useCallback((initialMs) => {
    stopCountdown();
    const end  = performance.now() + initialMs;
    const tick = setInterval(() => {
      const remaining = Math.max(0, end - performance.now());
      setCountdown(formatCountdown(remaining));
      if (remaining <= 0) stopCountdown();
    }, 100);
    countdownRef.current = { end, tick };
    setCountdown(formatCountdown(initialMs));
  }, [stopCountdown]);

  // ── P2: runner event subscriptions ────────────────────────────────────────
  useEffect(() => {
    if (!runnerApi) return;
    const offState = runnerApi.onState((state) => {
      setRunnerState(state);
      if (state.holdCountdown !== null) {
        startCountdown(state.holdCountdown);
      } else {
        stopCountdown();
      }
    });
    const offLog = runnerApi.onEventLogEntry((entry) => {
      setEventLog(prev => [...prev.slice(-99), entry]);
    });
    return () => { offState?.(); offLog?.(); stopCountdown(); };
  }, [startCountdown, stopCountdown]);

  const refreshObs = useCallback(async () => {
    if (!obsApi) return;
    try {
      const s = await obsApi.getStatus();
      setObsStatus(s);
      if (!presetLoaded.current && s?.host) { setHost(s.host); setPort(String(s.port)); setAllowRemote(s.allowRemote === true); }
      presetLoaded.current = true;
      if (s?.tally) setTally(s.tally);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!obsApi) return;
    refreshObs();
    const interval  = setInterval(refreshObs, 2000);
    const offConn   = obsApi.onConnected(() => refreshObs());
    const offDisc   = obsApi.onDisconnected(() => { refreshObs(); setFrames({ pvw: null, pgm: null }); });
    const offTally  = obsApi.onTally((t) => setTally(t));
    const offFrames = obsApi.onPreviewFrame((f) => setFrames((p) => ({ ...p, ...f })));
    return () => { clearInterval(interval); offConn?.(); offDisc?.(); offTally?.(); offFrames?.(); };
  }, [refreshObs]);

  const handleTrigger = useCallback(async (binding) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    try {
    let result;
    if (binding.action === 'data-fix') {
      onScreenChange('data-fixes'); return;
    } else if (binding.action === 'graphic-form') {
      setGraphicForm(binding.form); return;
    } else if ((runnerState?.techPaused || runnerState?.timeoutPaused) && !['pause', 'skip', 'timeout'].includes(binding.action)) {
      result = { ok: false, error: runnerState.techPaused ? 'tech_pause' : 'timeout' };
    } else if (binding.action === 'scene') {
      if (!obsApi || !obsStatus?.connected) return;
      result = await obsApi.take(binding.scene);
    } else if (binding.action === 'replay') {
      if (!obsApi || !obsStatus?.connected) return;
      if (obsStatus.replayBufferActive !== true || obsStatus.replayBusy) { setLastAction({ label: binding.label, ok: false, error: 'Start the OBS replay buffer before saving a replay.' }); return; }
      result = await obsApi.triggerReplay();
    } else if (['cut', 'stinger'].includes(binding.action)) {
      const kind = binding.action === 'cut' ? 'cut_transition' : 'obs_stinger_transition';
      const transitions = (obsStatus?.transitions || []).filter(item => item.transitionKind === kind);
      const transition = transitions.find(item => item.transitionName === transitionOptions.stinger) || transitions[0];
      result = obsStatus?.connected && tally.preview && transition
        ? await obsApi.take(tally.preview, { mode: binding.action, name: transition.transitionName })
        : { ok: false, error: 'Choose an OBS preview scene and an available transition.' };
    } else if (binding.action === 'hold') {
      const seg = runnerState?.activeSegment;
      result = seg && runnerApi
        ? await runnerApi.hold(seg.id)
        : { ok: false, error: 'No active segment' };
    } else if (binding.action === 'live') {
      const seg = runnerState?.activeSegment;
      result = seg && runnerApi
        ? await runnerApi.take(seg.id)
        : { ok: false, error: 'No active segment' };
    } else if (binding.action === 'skip') {
      result = runnerState?.activeSegment && runnerApi ? await runnerApi.skip(runnerState.activeSegment.id) : { ok: false, error: 'No active segment' };
    } else if (binding.action === 'pause') {
      result = runnerApi ? await (runnerState?.techPaused ? runnerApi.resume() : runnerApi.techPause()) : { ok: false, error: 'Broadcast screens unavailable' };
    } else if (binding.action === 'timeout') {
      result = runnerApi ? await runnerApi.timeout(!runnerState?.timeoutPaused) : { ok: false, error: 'Broadcast screens unavailable' };
    } else {
      result = { ok: false, error: `${binding.label}: unknown action` };
    }
    const techPaused = result?.error === 'tech_pause';
    setLastAction({ key: binding.key, label: binding.label, ok: result?.ok ?? false, techPaused, error: result?.error });
    } catch (_) { setLastAction({ key: binding.key, label: binding.label, ok: false, error: 'Production action failed. Check OBS and retry.' }); }
    finally { actionBusy.current = false; void refreshObs(); }
  }, [obsStatus, runnerState, tally.preview, transitionOptions.stinger, refreshObs]);

  async function takePreview(transition) {
    if (actionBusy.current || runnerState?.techPaused || runnerState?.timeoutPaused || !tally.preview) return;
    actionBusy.current = true; setTransitionOptions(previous => ({ ...previous, busy: true }));
    try {
      const result = await obsApi.take(tally.preview, transition);
      setLastAction({ label: transition?.mode || 'Show preview on air', ok: result.ok, error: result.error });
    } catch (_) { setLastAction({ label: 'Show preview on air', ok: false, error: 'Could not show the preview on air. Check OBS and retry.' }); }
    finally { actionBusy.current = false; setTransitionOptions(previous => ({ ...previous, busy: false })); void refreshObs(); }
  }

  // F1–F8 keyboard shortcuts — inactive when focus is inside a form field
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable || document.querySelector('[role="dialog"]')) return;
      const binding = ACTIONS.find((action) => matchesBinding(e, bindings[action.id]));
      if (!binding) return;
      e.preventDefault();
      void handleTrigger({ ...binding, key: bindings[binding.id] }).catch(() => setLastAction({ label: binding.label, ok: false }));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleTrigger, bindings]);

  const handleConnect = useCallback(async () => {
    if (!obsApi) return;
    setConnecting(true);
    setConnError('');
    try {
      const result = await obsApi.connect(host, port === '' ? 4455 : Number(port), pass, allowRemote);
      if (!result.ok) setConnError(result.error || 'Connection failed.');
      else setPass('');
    } catch (_) { setConnError('Could not connect to OBS. Check WebSocket settings and retry.'); }
    finally { setConnecting(false); }
  }, [host, port, pass, allowRemote]);

  const handleDisconnect = useCallback(async () => {
    if (!obsApi) return;
    await obsApi.disconnect();
    setFrames({ pvw: null, pgm: null });
  }, []);

  const connected  = obsStatus?.connected ?? false;
  const studioMode = obsStatus?.studioMode ?? false;
  const obsState   = obsStatus?.state ?? 'disconnected';

  const tallyState = !connected ? 'offline' : tally.program ? 'pgm' : tally.preview ? 'pvw' : 'offline';

  return (
    <AirShell
      screenTitle="Live controls"
      show={status?.show}
      nodeName={status?.nodeName ?? null}
      nav={NAV}
      activeTab="producer"
      onTabChange={onScreenChange}
    >
      <section className="operator-instructions" aria-label="How to operate this broadcast">
        <div><span className="eyebrow">OPERATE / OBS CONTROLS</span><h1>{runnerState?.activeSegment ? 'Broadcast controls' : 'Ready for your first screen?'}</h1><p><strong>1. Start broadcast</strong> prepares your first screen. <strong>2. Show screen on air</strong> sends that screen to viewers. <strong>3. Skip this screen</strong> moves to the next screen.</p><small>Air controls your scenes. Start streaming or recording in OBS Studio.</small></div>
        <div className="obs-session-actions"><button className="air-ghost-btn" onClick={() => onScreenChange('shortcuts')}>Set keyboard shortcuts</button>{runnerState?.activeSegment && <button className="air-ghost-btn" disabled={stopping || obsStatus?.transitionActive} onClick={() => setConfirmStop(true)}>Stop Air session</button>}</div>
      </section>
      {confirmStop && <ConfirmDialog title="Stop the Air session?" body="Stops Air’s screen sequence and automatic actions. OBS keeps its current on-air scene and any stream or recording. You can then send your updated screens." confirmLabel="Stop Air session" confirming={stopping} errorText={sessionError} onConfirm={stopSession} onCancel={() => setConfirmStop(false)} />}
      <div className="producer-layout">

        {/* ── Left: connection panel + tally ─────────────────────────────── */}
        <div className="producer-left">
          <div className="air-section-label">OBS Connection</div>
          <details open={!connected} className="producer-connection-details"><summary>{connected ? 'OBS connected · Connection settings' : 'Connect OBS to this desk'}</summary>

          <label className="air-field-label" htmlFor="obs-host">Host</label>
          <input id="obs-host" type="text" className="air-text-input"
            value={host} onChange={(e) => setHost(e.target.value)}
            placeholder="localhost" disabled={connecting} autoComplete="off" spellCheck={false} />

          <div className="producer-row-2col">
            <div className="producer-col">
              <label className="air-field-label" htmlFor="obs-port">Port</label>
              <input id="obs-port" type="number" className="air-text-input"
                value={port} onChange={(e) => setPort(e.target.value)}
                min={1} max={65535} disabled={connecting} />
            </div>
            <div className="producer-col">
              <label className="air-field-label" htmlFor="obs-pass">Password</label>
              <input id="obs-pass" type="password" className="air-text-input"
                value={pass} onChange={(e) => setPass(e.target.value)}
                placeholder="Blank uses saved password" disabled={connecting} autoComplete="new-password" />
            </div>
          </div>

          <div className="producer-conn-actions">
            {!connected
              ? (
                <button type="button" className="air-primary-btn" style={{ width: '100%' }}
                  onClick={handleConnect} disabled={connecting || !obsApi}>
                  {connecting && <span className="air-spinner air-spinner--dark" />}
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
              ) : (
                <button type="button" className="air-ghost-btn" style={{ width: '100%' }}
                  onClick={handleDisconnect}>
                  Disconnect
                </button>
              )
            }
          </div>

          {connError && <div className="producer-conn-error" role="alert">{connError}</div>}
          {!connected && discovery && <p className="air-empty-state">{discovery}</p>}
          {!connected && <label className="air-empty-state"><input type="checkbox" checked={allowRemote} onChange={event => setAllowRemote(event.target.checked)} /> Allow this desk to control the entered private LAN OBS address</label>}
          </details>
          <div className="product-actions"><button className="air-ghost-btn" onClick={() => onScreenChange('template')}>Edit broadcast screens</button><p className="air-empty-state">Preview and edit your match screens, then send them to OBS.</p></div>

          <div className="air-section-sep" />

          <HealthRow
            label="OBS"
            state={connected ? 'healthy' : obsState !== 'disconnected' ? 'attention' : 'offline'}
            subtext={connected ? `${obsState}${studioMode ? ' · Studio Mode' : ''}` : obsState}
          />
          {connected && <p className="air-empty-state">OBS version {obsStatus?.version || 'unavailable'} · Scene collection: {obsStatus?.collection || 'unavailable'}</p>}

          <div className="air-section-sep" />

          <div className="air-section-label">Tally</div>
          <div className="producer-tally-row">
            <TallyDot state={tallyState} />
            <div className="producer-tally-text">
              {tally.program
                ? <><span className="producer-tally-pgm">PGM</span>{tally.program}</>
                : tally.preview
                ? <><span className="producer-tally-pvw">PVW</span>{tally.preview}</>
                : <span className="producer-tally-offline">Offline</span>}
            </div>
          </div>
          {tally.preview && tally.program && (
            <div className="producer-tally-pvw-line">
              <span className="producer-tally-pvw">PVW</span>{tally.preview}
            </div>
          )}
          {lastAction && (
            <div className="producer-last-action" aria-live="polite">
              <span className={lastAction.ok ? 'producer-action-ok' : 'producer-action-err'}>
                {lastAction.key}: {lastAction.label} {lastAction.ok ? '✓' : lastAction.techPaused ? 'Technical pause is active.' : lastAction.error || 'Action unavailable.'}
              </span>
            </div>
          )}

          {/* ── P2: Autopilot segment panel (left column) ──────────────── */}
          <div className="air-section-sep" />
          <div className="air-section-label">Broadcast screens</div>
          <RundownRevision publication={status?.rundownPublication} reason={status?.configuration?.reason} />
          {status?.tournamentSync?.error && <p className="air-inline-error" role="status">{status.tournamentSync.error}</p>}
          <OnAirItem runner={runnerState} programScene={tally.program} />

          {runnerState?.techPaused && (
            <div className="autopilot-tech-banner" role="alert">TECH PAUSE</div>
          )}
          {runnerState?.timeoutPaused && <div className="autopilot-tech-banner" role="status">Team timeout · takes paused</div>}
          {status?.pauseRule?.notice && <p role="status">{status.pauseRule.notice}</p>}

          {runnerState?.activeSegment ? (
            <div className="autopilot-seg-block">
              <div className="air-section-label">{runnerState.activeSegment.state === 'on_air' ? 'Current item' : 'Next action'}</div>
              <div className="autopilot-seg-row">
                <span className={`seg-badge seg-badge--${runnerState.activeSegment.state}`}>
                  {SEG_BADGE_LABELS[runnerState.activeSegment.state] ?? runnerState.activeSegment.state}
                </span>
                <span className="autopilot-seg-name">{runnerState.activeSegment.name}</span>
              </div>
              <small>Cue: {triggerLabel(runnerState.activeSegment.trigger)} · {runnerState.activeSegment.mode === 'automatic' ? 'Automatic' : 'Manual Take'}{runnerState.activeSegment.mapNumber ? ` · Map ${runnerState.activeSegment.mapNumber}` : ''}</small>
              {countdown !== null && (
                <div className="autopilot-countdown" aria-label="Hold window countdown">
                  {countdown}
                </div>
              )}
              {runnerState.activeSegment.heldBy && <p role="status">Automatic switch paused · show this screen or skip it</p>}
              {!runnerState.activeSegment.heldBy && runnerState.activeSegment.state === 'holding' && countdown === null && <p role="status">Game cue received · show this screen or skip it</p>}
            </div>
          ) : (
            <div><p className="air-empty-state" style={{ marginTop: 4 }}>Start prepares the first screen. Your OBS output changes only when you take a screen on air.</p><button className="air-primary-btn" disabled={!connected || !status?.configuration?.applied || !status?.runner?.segments?.length} onClick={() => runnerApi?.start()}>Start broadcast</button></div>
          )}

          {/* ── P2: Autopilot command buttons ──────────────────────────── */}
          <div className="autopilot-cmds">
            <button
              type="button"
              className="air-ghost-btn"
              disabled={!['armed', 'queued', 'holding'].includes(runnerState?.activeSegment?.state) || runnerState?.techPaused || runnerState?.timeoutPaused}
              onClick={() => runnerApi?.hold(runnerState.activeSegment?.id)}
            >
              Pause automatic switch
            </button>
            <button
              type="button"
              className="air-ghost-btn"
              disabled={!['armed', 'holding', 'on_air'].includes(runnerState?.activeSegment?.state) || runnerState?.techPaused}
              onClick={() => runnerApi?.skip(runnerState.activeSegment?.id)}
            >
              Skip this screen
            </button>
            <button
              type="button"
              className="air-primary-btn"
              style={{ flex: 1 }}
              disabled={!connected || !['armed', 'holding'].includes(runnerState?.activeSegment?.state) || runnerState?.techPaused || runnerState?.timeoutPaused}
              onClick={() => runnerApi?.take(runnerState.activeSegment?.id)}
            >
              Show screen on air
            </button>
            <button
              type="button"
              className={`air-ghost-btn${runnerState?.techPaused ? ' autopilot-resume-btn' : ''}`}
              onClick={() => runnerState?.techPaused ? runnerApi?.resume() : runnerApi?.techPause()}
            >
              {runnerState?.techPaused ? 'Resume' : 'Technical pause'}
            </button>
          </div>
          <ComingUp runner={runnerState} />

        </div>

        {/* ── Right: monitors + trigger pad ──────────────────────────────── */}
        <div className="producer-right">
          <LiveDataStrip feed={status?.gameFeed} />
          {!!status?.displayOverrides?.fields?.length && <p role="status">On-air override active · {status.displayOverrides.fields.join(', ')}. Open data fixes to clear or Undo.</p>}
          {status?.displayOverrides?.storageWarning && <p role="alert" className="broadcast-error">{status.displayOverrides.storageWarning}</p>}
          <div className="producer-monitors">
            {['PVW', 'PGM'].map((lbl) => (
              <div key={lbl} className="producer-monitor">
                <div className="producer-monitor-label">{lbl === 'PVW' ? 'Preview' : 'Program · live'}</div>
                <div className="producer-monitor-frame">
                  {frames[lbl.toLowerCase()]
                    ? <img src={frames[lbl.toLowerCase()]} alt={`${lbl} frame`} className="producer-monitor-img" />
                    : <div className="producer-monitor-empty" aria-label={`${lbl} no signal`}>NO SIGNAL</div>}
                </div>
              </div>
            ))}
          </div>

          <ProductionTakeBar obs={obsStatus} tally={tally} paused={runnerState?.techPaused || runnerState?.timeoutPaused} onTake={takePreview} value={transitionOptions} onChange={setTransitionOptions} />
          {connected && <div className="production-settings"><SceneSlots onChanged={refreshObs} /><SceneMappings onSaved={refreshObs} /><GraphicsDurations /></div>}

          <div className="air-section-sep" style={{ margin: '12px 0' }} />
          <div className="air-section-label">Scenes & production controls</div>

          <div className="producer-trigger-grid">
            {triggers.filter(b => !['cut', 'stinger'].includes(b.action)).map((b) => {
              const active = b.scene ? tally.program === b.scene : false;
              return (
                <button
                  key={b.key}
                  type="button"
                  className={`trigger-btn${active ? ' trigger-btn--active' : ''}`}
                  onClick={() => handleTrigger(b)}
                  disabled={
                    ['graphic-form', 'data-fix'].includes(b.action) ? !status?.show : ['pause', 'timeout'].includes(b.action) ? !runnerApi : b.action === 'scene' || b.action === 'replay'
                      ? !connected || runnerState?.techPaused || runnerState?.timeoutPaused || (b.action === 'replay' && (obsStatus?.replayBufferActive !== true || obsStatus?.replayBusy))
                      : !runnerState?.activeSegment || runnerState?.techPaused || runnerState?.timeoutPaused
                  }
                  aria-label={`${b.key}: ${b.label}`}
                  aria-pressed={active}
                >
                  <KbdBadge keys={[b.key]} />
                  <span className="trigger-btn-label">{b.label}</span>
                </button>
              );
            })}
          </div>

          {!connected && (
            <p className="air-empty-state">Connect OBS to change scenes. Manual HUD updates remain available.</p>
          )}
          {graphicForm && <GraphicForms key={graphicForm} kind={graphicForm} show={status?.show} placements={status?.sponsorPlacements} onClose={() => setGraphicForm(null)} />}
          {connected && obsStatus?.replayBufferActive !== true && <p className="air-empty-state">Replay unavailable. Start the replay buffer in OBS.</p>}

          {/* ── P2: Event log (last 10 entries) ────────────────────────── */}
          <button className="air-ghost-btn" onClick={() => onScreenChange('timeline')}>Open one-hour activity</button>
          <button className="air-ghost-btn" onClick={() => onScreenChange('data-fixes')}>Fix on-air data</button>
          <PauseRulesSettings />
          {eventLog.length > 0 && (
            <>
              <div className="air-section-sep" style={{ margin: '16px 0 10px' }} />
              <div className="air-section-label">Event Log</div>
              <div
                className="autopilot-event-log"
                role="log"
                aria-live="polite"
                aria-label="Runner event log"
              >
                {[...eventLog].reverse().map((entry, index) => (
                  <div key={`${entry.ts}:${index}`} className="log-entry">
                    <span className="log-ts">
                      {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="log-type">{entry.type.replace(/^Game_/, 'Game: ').replace(/[_.]/g, ' ')}</span>
                    {entry.segmentId && (
                      <span className="log-seg">{runnerState?.segments.find(segment => segment.id === entry.segmentId)?.name || entry.segmentId}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AirShell>
  );
}
