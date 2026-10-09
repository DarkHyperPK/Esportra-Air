import React, { useState, useEffect, useCallback } from 'react';
import AirShell from './air/AirShell.jsx';
import HealthRow from './air/HealthRow.jsx';
import KbdBadge from './air/KbdBadge.jsx';
import TallyDot from './air/TallyDot.jsx';

const obsApi = window.esportraBroadcast?.obs ?? null;

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
  const [connecting, setConnecting] = useState(false);
  const [connError,  setConnError]  = useState('');
  const [obsStatus,  setObsStatus]  = useState(null);
  const [frames,     setFrames]     = useState({ pvw: null, pgm: null });
  const [tally,      setTally]      = useState({ preview: null, program: null });
  const [lastAction, setLastAction] = useState(null);

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
    if (!obsApi || !obsStatus?.connected) return;
    let result;
    if (binding.action === 'scene')        result = await obsApi.take(binding.scene);
    else if (binding.action === 'replay')  result = await obsApi.triggerReplay();
    else result = { ok: false, error: `${binding.label} available in P2` };
    setLastAction({ key: binding.key, label: binding.label, ok: result.ok });
  }, [obsStatus]);

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
        </div>
      </div>
    </AirShell>
  );
}
