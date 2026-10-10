import React, { useState, useEffect, useCallback, useRef } from 'react';
import AirShell from './air/AirShell.jsx';
import HealthRow from './air/HealthRow.jsx';
import KbdBadge from './air/KbdBadge.jsx';
import TallyDot from './air/TallyDot.jsx';

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
  { id: 'readiness', label: 'Readiness' },
  { id: 'producer',  label: 'Producer' },
  { id: 'outputs',   label: 'Outputs' },
];

// F1–F8 scene/action bindings
const TRIGGER_PAD = [
  { key: 'F1', label: 'Holding',    action: 'scene', scene: 'ESA_Holding' },
  { key: 'F2', label: 'Gameplay',   action: 'scene', scene: 'ESA_Gameplay' },
  { key: 'F3', label: 'Fullscreen', action: 'scene', scene: 'ESA_Fullscreen' },
  { key: 'F4', label: 'Replay',     action: 'scene', scene: 'ESA_Replay' },
  { key: 'F5', label: 'Casters',    action: 'scene', scene: 'ESA_Casters' },
  { key: 'F6', label: 'Replay Buf', action: 'replay' },
  { key: 'F7', label: 'Hold',       action: 'hold' },
  { key: 'F8', label: 'Go Live',    action: 'live' },
];

export default function ProducerScreen({ status, onScreenChange }) {
  const [host,      setHost]      = useState('localhost');
  const [port,      setPort]      = useState('4455');
  const [pass,      setPass]      = useState('');
  const [connecting,   setConnecting]   = useState(false);
  const [connError,    setConnError]    = useState('');
  const [obsStatus,    setObsStatus]    = useState(null);
  const [frames,       setFrames]       = useState({ pvw: null, pgm: null });
  const [tally,        setTally]        = useState({ preview: null, program: null });
  const [lastAction,   setLastAction]   = useState(null);
  // P2 autopilot state
  const [runnerState,  setRunnerState]  = useState(null);
  const [countdown,    setCountdown]    = useState(null); // MM:SS string
  const [eventLog,     setEventLog]     = useState([]);
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
      setEventLog(prev => [...prev.slice(-9), entry]);
    });
    return () => { offState?.(); offLog?.(); stopCountdown(); };
  }, [startCountdown, stopCountdown]);

  const refreshObs = useCallback(async () => {
    if (!obsApi) return;
    try {
      const s = await obsApi.getStatus();
      setObsStatus(s);
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
    let result;
    if (binding.action === 'scene') {
      if (!obsApi || !obsStatus?.connected) return;
      result = await obsApi.take(binding.scene);
    } else if (binding.action === 'replay') {
      if (!obsApi || !obsStatus?.connected) return;
      result = await obsApi.triggerReplay();
    } else if (binding.action === 'hold') {
      const seg = runnerState?.activeSegment;
      result = seg && runnerApi
        ? (runnerApi.hold(seg.id) ?? { ok: false })
        : { ok: false, error: 'No active segment' };
    } else if (binding.action === 'live') {
      const seg = runnerState?.activeSegment;
      result = seg && runnerApi
        ? await runnerApi.take(seg.id)
        : { ok: false, error: 'No active segment' };
    } else {
      result = { ok: false, error: `${binding.label}: unknown action` };
    }
    setLastAction({ key: binding.key, label: binding.label, ok: result?.ok ?? false });
  }, [obsStatus, runnerState]);

  // F1–F8 keyboard shortcuts — inactive when focus is inside a form field
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const binding = TRIGGER_PAD.find((b) => b.key === e.key);
      if (!binding) return;
      e.preventDefault();
      handleTrigger(binding);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleTrigger]);

  const handleConnect = useCallback(async () => {
    if (!obsApi) return;
    setConnecting(true);
    setConnError('');
    const result = await obsApi.connect(host, Number(port) || 4455, pass);
    setConnecting(false);
    if (!result.ok) setConnError(result.error || 'Connection failed.');
  }, [host, port, pass]);

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
      screenTitle="Producer"
      nodeName={status?.nodeName ?? null}
      nav={NAV}
      activeTab="producer"
      onTabChange={onScreenChange}
    >
      <div className="producer-layout">

        {/* ── Left: connection panel + tally ─────────────────────────────── */}
        <div className="producer-left">
          <div className="air-section-label">OBS Connection</div>

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
                placeholder="Optional" disabled={connecting} autoComplete="new-password" />
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

          <div className="air-section-sep" />

          <HealthRow
            label="OBS"
            state={connected ? 'healthy' : obsState !== 'disconnected' ? 'attention' : 'offline'}
            subtext={connected ? `${obsState}${studioMode ? ' · Studio Mode' : ''}` : obsState}
          />

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
                {lastAction.key}: {lastAction.label} {lastAction.ok ? '✓' : '✗'}
              </span>
            </div>
          )}

          {/* ── P2: Autopilot segment panel (left column) ──────────────── */}
          <div className="air-section-sep" />
          <div className="air-section-label">Autopilot</div>

          {runnerState?.techPaused && (
            <div className="autopilot-tech-banner" role="status">TECH PAUSE</div>
          )}

          {runnerState?.activeSegment ? (
            <div className="autopilot-seg-block">
              <div className="autopilot-seg-row">
                <span className={`seg-badge seg-badge--${runnerState.activeSegment.state}`}>
                  {SEG_BADGE_LABELS[runnerState.activeSegment.state] ?? runnerState.activeSegment.state}
                </span>
                <span className="autopilot-seg-name">{runnerState.activeSegment.name}</span>
              </div>
              {countdown !== null && (
                <div className="autopilot-countdown" aria-label="Hold window countdown">
                  {countdown}
                </div>
              )}
              {runnerState.nextSegment && (
                <div className="autopilot-next-row">
                  <span className="autopilot-next-label">NEXT</span>
                  <span className="autopilot-next-name">{runnerState.nextSegment.name}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="air-empty-state" style={{ marginTop: 4 }}>No rundown loaded.</p>
          )}

          {/* ── P2: Autopilot command buttons ──────────────────────────── */}
          <div className="autopilot-cmds">
            <button
              type="button"
              className="air-ghost-btn"
              disabled={!runnerState?.activeSegment || runnerState?.techPaused}
              onClick={() => runnerApi?.hold(runnerState.activeSegment?.id)}
            >
              Hold
            </button>
            <button
              type="button"
              className="air-ghost-btn"
              disabled={!runnerState?.activeSegment}
              onClick={() => runnerApi?.skip(runnerState.activeSegment?.id)}
            >
              Skip
            </button>
            <button
              type="button"
              className="air-primary-btn"
              style={{ flex: 1 }}
              disabled={!runnerState?.activeSegment || runnerState?.techPaused}
              onClick={() => runnerApi?.take(runnerState.activeSegment?.id)}
            >
              Take
            </button>
            <button
              type="button"
              className={`air-ghost-btn${runnerState?.techPaused ? ' autopilot-resume-btn' : ''}`}
              onClick={() => runnerState?.techPaused ? runnerApi?.resume() : runnerApi?.techPause()}
            >
              {runnerState?.techPaused ? 'Resume' : 'T.Pause'}
            </button>
          </div>
        </div>

        {/* ── Right: monitors + trigger pad ──────────────────────────────── */}
        <div className="producer-right">
          <div className="producer-monitors">
            {['PVW', 'PGM'].map((lbl) => (
              <div key={lbl} className="producer-monitor">
                <div className="producer-monitor-label">{lbl}</div>
                <div className="producer-monitor-frame">
                  {frames[lbl.toLowerCase()]
                    ? <img src={frames[lbl.toLowerCase()]} alt={`${lbl} frame`} className="producer-monitor-img" />
                    : <div className="producer-monitor-empty" aria-label={`${lbl} no signal`}>NO SIGNAL</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="air-section-sep" style={{ margin: '12px 0' }} />
          <div className="air-section-label">Trigger Pad</div>

          <div className="producer-trigger-grid">
            {TRIGGER_PAD.map((b) => {
              const active = b.scene ? tally.program === b.scene : false;
              return (
                <button
                  key={b.key}
                  type="button"
                  className={`trigger-btn${active ? ' trigger-btn--active' : ''}`}
                  onClick={() => handleTrigger(b)}
                  disabled={!connected}
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
            <p className="air-empty-state">Connect to OBS to enable the trigger pad and monitors.</p>
          )}

          {/* ── P2: Event log (last 10 entries) ────────────────────────── */}
          {eventLog.length > 0 && (
            <>
              <div className="air-section-sep" style={{ margin: '16px 0 10px' }} />
              <div className="air-section-label">Event Log</div>
              <div
                className="autopilot-event-log"
                role="log"
                aria-live="polite"
                aria-label="Show runner event log"
              >
                {[...eventLog].reverse().map((entry, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-ts">
                      {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="log-type">{entry.type.replace(/_/g, ' ')}</span>
                    {entry.segmentId && (
                      <span className="log-seg">{entry.segmentId}</span>
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
