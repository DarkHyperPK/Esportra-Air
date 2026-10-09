import React, { useState, useEffect, useCallback, useRef } from 'react';
import AirShell from './air/AirShell.jsx';
import KbdBadge from './air/KbdBadge.jsx';

function gepDot(state) {
  const colors = { live: '#22C55E', paused: '#71717A', stale: '#FBBF24', error: '#EF4444' };
  return colors[state] ?? '#71717A';
}

function relayChipClass(connected) {
  if (connected === true)  return 'relay-status-chip relay-status-chip--connected';
  if (connected === false) return 'relay-status-chip relay-status-chip--disconnected';
  return 'relay-status-chip relay-status-chip--reconnecting';
}

/**
 * Screen 3: Capture — observer/capture-only mode.
 * F9 and F10 keyboard shortcuts with flash feedback.
 */
export default function CaptureScreen({ status }) {
  const [f9Flash, setF9Flash] = useState(false);
  const [f10Flash, setF10Flash] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const f9Timer = useRef(null);
  const f10Timer = useRef(null);

  const flashF9 = useCallback(() => {
    setF9Flash(true);
    clearTimeout(f9Timer.current);
    f9Timer.current = setTimeout(() => setF9Flash(false), 1500);
  }, []);

  const flashF10 = useCallback(() => {
    setF10Flash(true);
    clearTimeout(f10Timer.current);
    f10Timer.current = setTimeout(() => setF10Flash(false), 1500);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'F9')  { e.preventDefault(); flashF9(); }
      if (e.key === 'F10') { e.preventDefault(); flashF10(); }
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setPausedByUser((p) => !p);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flashF9, flashF10]);

  const gep = status?.gepFeed ?? null;
  const relay = status?.relay ?? null;
  const match = status?.match ?? null;
  const prodNode = status?.productionNode ?? null;

  const gepState = pausedByUser ? 'paused' : (gep?.state ?? 'offline');
  const gepDotColor = gepDot(gepState);

  const gepHeroText = gepState === 'live'
    ? `Live · ${gep?.rate ?? 0} msg/s`
    : gepState === 'paused'
    ? 'Paused · Ctrl+Shift+P to resume sending'
    : gepState === 'stale'
    ? `Feed slow · Last packet ${gep?.lastPacketAgo ?? '?'} s ago`
    : 'GEP not detected · Is Valorant running?';

  const relayConnected = relay?.connected ?? null;
  const relayChip = relayConnected === true ? 'Connected'
    : relayConnected === false ? 'Disconnected'
    : 'Reconnecting…';

  return (
    <AirShell
      screenTitle="Capture"
      nodeName={status?.nodeName ?? null}
    >
      <div className="capture-content">

        {/* GEP Feed (hero) */}
        <div className="air-section-label">GEP Feed</div>
        <div className="gep-hero-row">
          <div className="gep-status-left">
            <div className="health-dot" style={{ background: gepDotColor }} role="presentation" />
            <span className="gep-hero-text">{gepHeroText}</span>
          </div>
          <button
            type="button"
            className="air-ghost-btn"
            onClick={() => setPausedByUser((p) => !p)}
            style={{ color: pausedByUser ? '#22C55E' : undefined }}
          >
            {pausedByUser ? 'Resume sending' : 'Pause sending'}
          </button>
        </div>
        <div className="air-section-sep" />

        {/* Match */}
        <div className="air-section-label">Match</div>
        {match ? (
          <>
            <div className="capture-match-teams">
              <span className="capture-team-name">{match.teamA}</span>
              <span className="capture-vs">vs</span>
              <span className="capture-team-name">{match.teamB}</span>
            </div>
            <div className="capture-map-round">
              Map {match.mapNumber} · {match.map} · Round {match.round}
            </div>
          </>
        ) : (
          <p className="air-empty-state">
            Waiting for match context from production node.
          </p>
        )}
        <div className="air-section-sep" />

        {/* Relay */}
        <div className="air-section-label">Relay to production node</div>
        {relay ? (
          <div className="relay-row">
            <span className="relay-address">{relay.host}:{relay.port}</span>
            <div className="relay-latency-group">
              <span className="relay-latency-label">Latency</span>
              <span className="relay-latency-value">{relay.latency} ms</span>
            </div>
            <div className={relayChipClass(relayConnected)}>{relayChip}</div>
          </div>
        ) : (
          <p className="air-empty-state" style={{ padding: 0 }}>No relay configured.</p>
        )}
        {relayConnected === false && (
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#EF4444', marginTop: 4 }}>
            Data is buffering locally until relay reconnects.
          </p>
        )}
        <div className="air-section-sep" />

        {/* Hotkeys */}
        <div className="air-section-label">Hotkeys</div>
        <div className="hotkeys-row">
          <div className={`hotkey-item${f9Flash ? ' hotkey-flash' : ''}`}>
            <KbdBadge keys={['F9']} />
            <span className="hotkey-label">Mark replay</span>
            {f9Flash && (
              <span className="hotkey-feedback hotkey-feedback--replay" aria-live="assertive">
                Replay marked
              </span>
            )}
          </div>
          <div className={`hotkey-item${f10Flash ? ' hotkey-flash' : ''}`}>
            <KbdBadge keys={['F10']} />
            <span className="hotkey-label">Flag moment</span>
            {f10Flash && (
              <span className="hotkey-feedback hotkey-feedback--flag" aria-live="assertive">
                Moment flagged
              </span>
            )}
          </div>
          <div className="hotkey-item">
            <KbdBadge keys={['Ctrl', 'Shift', 'P']} />
            <span className="hotkey-label">Pause sending</span>
          </div>
        </div>
        <div className="air-section-sep" />

        {/* Production node */}
        <div className="air-section-label">Production node</div>
        <div className="prod-node-row">
          {prodNode ? (
            <>
              <span className="prod-node-name">{prodNode.name}</span>
              <span className="prod-node-ip">{prodNode.ip}</span>
            </>
          ) : (
            <span className="prod-node-name" style={{ color: '#71717A' }}>Not configured</span>
          )}
          <button type="button" className="prod-node-change" style={{ marginLeft: 12 }}>
            Change production PC
          </button>
        </div>

      </div>
    </AirShell>
  );
}
