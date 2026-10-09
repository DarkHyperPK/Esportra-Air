import React, { useState, useCallback } from 'react';
import AirShell from './air/AirShell.jsx';
import HealthRow from './air/HealthRow.jsx';

const HEALTH_DEFS = [
  { key: 'hudServer',     label: 'HUD Server' },
  { key: 'obsConnection', label: 'OBS Connection' },
  { key: 'gepFeed',       label: 'GEP Feed' },
  { key: 'apiConnection', label: 'API Connection' },
  { key: 'overlayRender', label: 'Overlay Render' },
];

const NAV = [
  { id: 'readiness', label: 'Readiness' },
  { id: 'outputs',   label: 'Outputs' },
];

function SkeletonRows({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="air-skeleton air-skeleton-row" />
  ));
}

/**
 * Screen 2: Readiness — health dashboard in production mode.
 */
export default function ReadinessScreen({ status, onScreenChange }) {
  const [autopilot, setAutopilot] = useState('idle');
  // idle | starting | active | manual
  const [diagState, setDiagState] = useState('idle');
  // idle | exporting | done

  const health = status?.health ?? null;
  const hasError = health
    ? HEALTH_DEFS.some((d) => health[d.key]?.state === 'error')
    : false;

  const handleStartAutopilot = useCallback(async () => {
    setAutopilot('starting');
    await new Promise((r) => setTimeout(r, 1000));
    setAutopilot('active');
  }, []);

  const handleRunManually = useCallback(() => setAutopilot('manual'), []);
  const handlePauseAutopilot = useCallback(() => setAutopilot('idle'), []);
  const handleReturnToAutopilot = useCallback(() => setAutopilot('active'), []);

  const handleDiagExport = useCallback(() => {
    setDiagState('exporting');
    setTimeout(() => {
      console.log('diagnostic export', { status, ts: new Date().toISOString() });
      setDiagState('done');
      setTimeout(() => setDiagState('idle'), 2000);
    }, 500);
  }, [status]);

  const diagLabel = diagState === 'exporting' ? 'Exporting…'
    : diagState === 'done' ? '✓ Exported'
    : 'Self-Diagnostic Export';

  const autopilotBadge = autopilot === 'active'
    ? <span className="air-header-badge air-header-badge--active">Autopilot active</span>
    : autopilot === 'manual'
    ? <span className="air-header-badge air-header-badge--manual">Manual</span>
    : null;

  const diagButton = (
    <button
      type="button"
      className="air-ghost-btn"
      onClick={handleDiagExport}
      disabled={diagState === 'exporting'}
    >
      {diagLabel}
    </button>
  );

  const rundown = status?.rundown ?? null;
  const show = status?.show ?? null;
  const match = status?.match ?? null;

  return (
    <AirShell
      screenTitle="Readiness"
      nodeName={status?.nodeName ?? null}
      nav={NAV}
      activeTab="readiness"
      onTabChange={onScreenChange}
      statusBadge={autopilotBadge}
      contextualButton={diagButton}
    >
      <div className="readiness-two-col">
        {/* Left column */}
        <div className="readiness-left">
          <div className="air-section-label">Node</div>
          {!health ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              <div className="air-node-name">{status?.nodeName ?? 'Unknown node'}</div>
              <div className="air-node-meta">
                {show
                  ? `Show: ${show.name}`
                  : <em className="air-node-meta--empty">No show assigned</em>}
              </div>
              <div className="air-node-meta">
                {match
                  ? `Match: ${match.teamA} vs ${match.teamB}`
                  : <em className="air-node-meta--empty">Waiting for match assignment</em>}
              </div>
            </>
          )}

          <div className="air-section-sep" />

          <div className="air-section-label">Health</div>
          <div className="health-rows">
            {!health ? (
              <SkeletonRows count={5} />
            ) : (
              HEALTH_DEFS.map((def) => {
                const row = health[def.key] ?? {};
                const fixAction = row.fixLabel
                  ? { label: row.fixLabel, onAction: () => console.log('fix', def.key) }
                  : null;
                return (
                  <HealthRow
                    key={def.key}
                    label={def.label}
                    state={row.state ?? 'offline'}
                    subtext={row.subtext ?? 'Not connected'}
                    fixAction={fixAction}
                  />
                );
              })
            )}
          </div>

          {/* Primary actions */}
          <div className="readiness-actions">
            {autopilot === 'active' && (
              <button type="button" className="air-ghost-btn air-ghost-btn--36" style={{ flex: 1 }} onClick={handlePauseAutopilot}>
                Pause autopilot
              </button>
            )}
            {autopilot === 'manual' && (
              <button type="button" className="air-ghost-btn air-ghost-btn--36" style={{ flex: 1 }} onClick={handleReturnToAutopilot}>
                Return to autopilot
              </button>
            )}
            {(autopilot === 'idle' || autopilot === 'starting') && (
              <>
                <button type="button" className="air-ghost-btn air-ghost-btn--36" onClick={handleRunManually} disabled={autopilot === 'starting'}>
                  Run manually
                </button>
                <button
                  type="button"
                  className="air-primary-btn"
                  style={{ flex: 1 }}
                  onClick={handleStartAutopilot}
                  disabled={hasError || autopilot === 'starting'}
                  title={hasError ? 'Resolve the failing checks first.' : undefined}
                >
                  {autopilot === 'starting' && <span className="air-spinner air-spinner--dark" />}
                  {autopilot === 'starting' ? 'Starting…' : 'Start autopilot'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="readiness-right">
          <div className="air-section-label">What autopilot does next</div>
          {!rundown ? (
            <p className="air-empty-state">
              No rundown assigned for this match. Set one up on Esportra Broadcast.
            </p>
          ) : (
            rundown.slice(0, 5).map((seg, i) => (
              <div key={i} className="rundown-row">
                <div className="rundown-row-left">
                  <div className="rundown-trigger">{seg.trigger}</div>
                  <div className="rundown-action">{seg.action}</div>
                </div>
                <div className="rundown-row-right">
                  <div className="rundown-scene-chip">{seg.scene}</div>
                  {seg.holdWindow > 0 && (
                    <div className="rundown-hold-badge">{seg.holdWindow}s hold</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AirShell>
  );
}
