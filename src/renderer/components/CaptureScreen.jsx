import React from 'react';
import AirShell from './air/AirShell.jsx';
import CaptureControls from './CaptureControls.jsx';
import ObserverMarkers from './ObserverMarkers.jsx';

/** Capture-only view of the fields actually supplied by GET_STATUS. */
export default function CaptureScreen({ status, broadcastApi, onChanged, onSettings }) {
  const active = status?.gepActive === true;
  const relay = status?.lanRelay;
  const listening = relay?.listening === true;
  const consumers = Number.isInteger(relay?.consumerCount) && relay.consumerCount >= 0
    ? relay.consumerCount : 0;
  const connected = listening && consumers > 0;
  const rate = Number.isFinite(relay?.gepMessagesPerSec) ? relay.gepMessagesPerSec : null;
  const relayLabel = connected ? 'Connected' : listening ? 'Waiting for production' : 'Not listening';
  const relayClass = connected ? 'connected' : listening ? 'reconnecting' : 'disconnected';

  return (
    <AirShell screenTitle="Capture" nodeName={status?.nodeName ?? null} contextualButton={onSettings && <button className="air-ghost-btn" onClick={onSettings}>PC role</button>}>
      <div className="capture-content">
        <CaptureControls active={active} broadcastApi={broadcastApi} onChanged={onChanged} configuredCode={status?.show?.matchCode} configuredRole={status?.captureRole} />
        <ObserverPairing status={status} />
        {status?.captureRole !== 'player' && <ObserverMarkers broadcastApi={broadcastApi} listening={listening} connected={connected} />}
        <div className="air-section-label">Game capture</div>
        <div className="gep-hero-row">
          <div className="gep-status-left" role="status">
            <div className="health-dot" style={{ background: active ? '#34D399' : '#71717A' }} aria-hidden="true" />
            <span className="gep-hero-text">
              {active ? 'Capture active' : 'Capture inactive'}
              {active && rate !== null ? ` · ${rate} msg/s` : ''}
            </span>
          </div>
        </div>
        <p className="air-empty-state">Capture activity and game-event traffic are separate checks.</p>
        <div className="air-section-sep" />

        <div className="air-section-label">LAN relay</div>
        <div className="relay-row">
          <span className="relay-address">{listening ? `Listening on port ${relay.port}` : 'Relay is not listening'}</span>
          <div className={`relay-status-chip relay-status-chip--${relayClass}`} role="status">{relayLabel}</div>
        </div>
        <p className="air-empty-state">
          {consumers} production connection{consumers === 1 ? '' : 's'}
        </p>
        {relay?.buffering && <p role="status">Buffering locally · {relay.retainedMessages} packets retained for up to 60 seconds. Production reconnects automatically.</p>}
        {Number.isFinite(relay?.ackLatencyMs) && <p className="air-empty-state">Delivery acknowledgement median: {Math.round(relay.ackLatencyMs)} ms over the last 60 seconds.</p>}
        {relay?.droppedMessages > 0 && <p className="broadcast-error">{relay.droppedMessages} old packets expired or exceeded buffer capacity. Current game data continues.</p>}
        {listening && !connected && (
          <p className="air-empty-state">Connect the production machine to this observer's LAN relay address.</p>
        )}
        <div className="air-section-sep" />

        <div className="air-section-label">Platform connection</div>
        <div className="prod-node-row" role="status">
          <span className="prod-node-name">
            {status?.hubConnected ? 'Platform connected' : 'Platform disconnected'}
          </span>
        </div>
        <p className="air-empty-state">Platform contact does not confirm delivery to the production machine.</p>
      </div>
    </AirShell>
  );
}

function ObserverPairing({ status }) {
  const [message, setMessage] = React.useState('');
  return <section className="product-panel"><h2>Connect production to this observer</h2><p>{status?.nodeIp || 'This PC'}:{status?.lanRelay?.port || 5301}</p><p>Copy this observer’s pairing key and enter it with the address on the production desk. Share it only with your production crew.</p><button className="air-ghost-btn" onClick={async () => { try { const result = await window.esportraBroadcast.air.copyRelayKey(); setMessage(result.ok ? 'Observer key copied to clipboard.' : result.error); } catch { setMessage('Could not copy the observer key.'); } }}>Copy observer pairing key</button>{message && <p role="status">{message}</p>}</section>;
}
