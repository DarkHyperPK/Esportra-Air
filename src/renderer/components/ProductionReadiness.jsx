import React, { useState } from "react";
import AirShell from "./air/AirShell.jsx";
import HealthRow from "./air/HealthRow.jsx";
import ConfirmDialog from "./air/ConfirmDialog.jsx";
import ScoreCorrection from "./ScoreCorrection.jsx";
import CaptureControls from "./CaptureControls.jsx";
import RundownRevision from "./RundownRevision.jsx";
import RegisteredLineup from "./RegisteredLineup.jsx";
const NAV = [
  { id: "readiness", label: "Match setup" },
  { id: "template", label: "Customize broadcast" },
  { id: "producer", label: "Live controls" },
  { id: "outputs", label: "Advanced sources" },
  { id: "settings", label: "Machine" },
];
const CHECKS = [
  ["hudServer", "Local HUD"],
  ["obsConnection", "OBS"],
  ["gepFeed", "Game events"],
  ["apiConnection", "Platform link"],
  ["overlayRender", "HUD clients"],
];

export default function ProductionReadiness({
  status,
  airApi,
  onScreenChange,
  onChanged,
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);
  async function perform(action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (result?.ok === false) throw new Error(result.error);
      onChanged?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const segments = status?.runner?.segments || [],
    active = status?.runner?.activeSegment;
  return (
    <AirShell
      screenTitle="Match setup"
      show={status?.show}
      nodeName={status?.nodeName}
      nav={NAV}
      activeTab="readiness"
      onTabChange={onScreenChange}
    >
      <div className="air-content readiness-workspace">
        <div className="product-page-head">
          <div>
            <h1>Your match, ready for air.</h1>
            <p>
              {status?.show?.title ||
                "Send a show configuration from Esportra Broadcast."}
            </p>
          </div>
          <button
            className="air-primary-btn"
            disabled={!status?.show}
            onClick={() => onScreenChange(status?.obsTemplate?.prepared ? "producer" : "template")}
          >
            {status?.obsTemplate?.prepared ? 'Open OBS controls' : 'Customize broadcast'}
          </button>
        </div>
        {error && (
          <p className="broadcast-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="product-grid">
          <section className="product-panel">
            <h2>Show match</h2>
            <select
              className="product-input"
              aria-label="Configured show match"
              value={status?.show?.matchCode || ""}
              disabled={
                busy ||
                !!active ||
                status?.gepActive ||
                !status?.show?.matches?.length
              }
              onChange={(event) =>
                perform(() => airApi.selectShowMatch(event.target.value))
              }
            >
              {status?.show?.matches?.map((match) => (
                <option key={match.matchCode} value={match.matchCode}>
                  {match.matchCode} · {match.label}
                </option>
              ))}
            </select>
            <p>
              This match supplies your teams, logos and broadcast screens. Stop
              the broadcast screens and game capture before changing matches.
            </p>
            {status?.pendingShow && (
              <p>Waiting plan: {status.pendingShow.title}</p>
            )}
            <button
              className="air-ghost-btn"
              disabled={busy || !!active || status?.gepActive}
              onClick={() => perform(() => airApi.applyPendingShow())}
            >
              {status?.pendingShow ? "Apply waiting plan" : "Reload saved plan"}
            </button>
          </section>
          <section className="product-panel">
            <h2>Local systems</h2>
            {CHECKS.map(([key, label]) => (
              <HealthRow
                key={key}
                label={label}
                state={status?.health?.[key]?.state || "offline"}
                subtext={status?.health?.[key]?.detail || "Not checked"}
              />
            ))}
            <div className="product-actions">
              <button
                className="air-ghost-btn"
                onClick={() => onScreenChange("producer")}
              >
                Connect OBS
              </button>
              <button
                className="air-ghost-btn"
                onClick={() => onScreenChange("template")}
              >
                Preview and customize screens
              </button>
            </div>
          </section>
          <section className="product-panel">
            <h2>Broadcast screens</h2>
            {status?.tournamentSync && <p role="status">{status.tournamentSync.error || (status.tournamentSync.lastSuccessAt ? 'Tournament data checked every five seconds. Live round data and broadcast screens stay in Air.' : 'Waiting for the first tournament data check.')}</p>}
            <RundownRevision publication={status?.rundownPublication} reason={status?.configuration?.reason} />
            <RegisteredLineup show={status?.show} />
            {status?.show?.scheduledAt && <p>Scheduled: {new Date(status.show.scheduledAt).toLocaleString()}</p>}
            <p>
              {status?.configuration?.applied
                ? `${segments.length} items loaded`
                : status?.configuration?.reason || "No broadcast screens received."}
            </p>
            {segments.slice(0, 8).map((segment) => (
              <div className="product-data-row" key={segment.id}>
                <span>{segment.name}</span>
                <small>
                  {segment.scene} · {segment.state}
                  {segment.planWarning && <span role="status"> · {segment.planWarning}</span>}
                </small>
              </div>
            ))}
            <div className="product-actions">
              <button
                className="air-primary-btn"
                disabled={busy || !segments.length || !!active}
                onClick={() =>
                  perform(() => window.esportraBroadcast.runner.start())
                }
              >
                Start broadcast
              </button>
              <button
                className="air-ghost-btn"
                disabled={busy || !active}
                onClick={() =>
                  perform(() =>
                    status.runner.techPaused
                      ? window.esportraBroadcast.runner.resume()
                      : window.esportraBroadcast.runner.techPause(),
                  )
                }
              >
                {status?.runner?.techPaused
                  ? "Resume broadcast"
                  : "Technical pause"}
              </button>
              <button
                className="air-ghost-btn"
                disabled={busy || !active}
                onClick={() => setConfirmStop(true)}
              >
                Stop broadcast
              </button>
            </div>
          </section>
          <section className="product-panel"><h2>Game feed & observer PCs</h2><p>Observe and produce on this PC, or connect another observer through Connections. One-PC production needs no network address.</p><button className="air-ghost-btn" onClick={()=>onScreenChange('connections')}>Open connection settings</button></section>
          <details className="readiness-advanced"><summary>Fix on-air match data</summary><ScoreCorrection matchCode={status?.show?.matchCode || "MAIN"} context={status?.correctionContext} /></details>
          <section aria-label="Game capture on this PC">
            <h2>Game capture on this PC</h2>
            <p>
              Observing and producing on one PC? Start capture here. Capture is off until you approve it.
              If another PC observes the game, use its LAN feed instead.
            </p>
            <CaptureControls
              active={status?.gepActive === true}
              configuredCode={status?.show?.matchCode}
              configuredRole={status?.captureRole}
              broadcastApi={window.esportraBroadcast.broadcast}
              onChanged={onChanged}
            />
          </section>
        </div>
      </div>
      {confirmStop && (
        <ConfirmDialog
          title="Stop the broadcast?"
          body="Timers stop and the local segment list clears. OBS keeps its current program scene. Reload the saved plan before starting again."
          confirmLabel="Stop broadcast"
          confirmVariant="destructive"
          confirming={busy}
          errorText={error || null}
          onCancel={() => setConfirmStop(false)}
          onConfirm={() =>
            perform(async () => {
              const result = await window.esportraBroadcast.runner.stop();
              if (!result.ok) throw new Error(result.error);
              setConfirmStop(false);
              return result;
            })
          }
        />
      )}
    </AirShell>
  );
}
