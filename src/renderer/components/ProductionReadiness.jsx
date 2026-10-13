import React, { useState } from "react";
import AirShell from "./air/AirShell.jsx";
import HealthRow from "./air/HealthRow.jsx";
import ConfirmDialog from "./air/ConfirmDialog.jsx";
import ScoreCorrection from "./ScoreCorrection.jsx";
import CaptureControls from "./CaptureControls.jsx";
const NAV = [
  { id: "readiness", label: "Readiness" },
  { id: "producer", label: "Producer" },
  { id: "outputs", label: "Outputs" },
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
  const [targets, setTargets] = useState(
    (status?.lanRelayTargets || []).join(", "),
  );
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
  async function saveTargets() {
    const connections = targets
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const [target, key] = value.split("=");
        return { target: target.trim(), key: key?.trim() };
      });
    const result = await airApi.setRelayTargets(
      connections.map((item) => item.target),
      Object.fromEntries(
        connections
          .filter((item) => item.key)
          .map((item) => [item.target, item.key]),
      ),
    );
    if (!result.ok) throw new Error(result.error);
    setTargets(connections.map((item) => item.target).join(", "));
    setNotice("Observer addresses and keys saved. Restart Air to connect.");
  }
  const segments = status?.runner?.segments || [],
    active = status?.runner?.activeSegment;
  return (
    <AirShell
      screenTitle="Production readiness"
      nodeName={status?.nodeName}
      nav={NAV}
      activeTab="readiness"
      onTabChange={onScreenChange}
    >
      <div className="air-content">
        <div className="product-page-head">
          <div>
            <h1>Prepare this production desk.</h1>
            <p>
              {status?.show?.title ||
                "Send a show configuration from Esportra Broadcast."}
            </p>
          </div>
          <button
            className="air-primary-btn"
            onClick={() => onScreenChange("producer")}
          >
            Open producer
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
              Capture and browser sources must use this match code. Match
              changes require an idle rundown.
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
                onClick={() => onScreenChange("outputs")}
              >
                Prepare browser sources
              </button>
            </div>
          </section>
          <section className="product-panel">
            <h2>Local rundown</h2>
            <p>
              {status?.configuration?.applied
                ? `${segments.length} segments loaded`
                : status?.configuration?.reason || "No rundown received."}
            </p>
            {segments.slice(0, 8).map((segment) => (
              <div className="product-data-row" key={segment.id}>
                <span>{segment.name}</span>
                <small>
                  {segment.scene} · {segment.state}
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
                Start rundown
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
                  ? "Resume rundown"
                  : "Technical pause"}
              </button>
              <button
                className="air-ghost-btn"
                disabled={busy || !active}
                onClick={() => setConfirmStop(true)}
              >
                Stop rundown
              </button>
            </div>
          </section>
          <section className="product-panel">
            <h2>Observer machines</h2>
            <p>
              Copy the pairing key on each observer. Enter host:port=key,
              separated by commas. Existing addresses can omit their saved key.
              Keys are stored in the OS credential vault.
            </p>
            <input
              className="product-input"
              type="password"
              autoComplete="off"
              aria-label="Observer addresses and pairing keys"
              placeholder="192.168.1.24:5301=observer-key"
              value={targets}
              onChange={(event) => setTargets(event.target.value)}
            />
            <p>
              {status?.pendingRecords || 0} records queued for acknowledged
              platform delivery.
            </p>
            <div className="product-actions">
              <button
                className="air-ghost-btn"
                disabled={busy}
                onClick={() => perform(saveTargets)}
              >
                Save addresses
              </button>
              {notice && (
                <button
                  className="air-primary-btn"
                  onClick={() => perform(() => airApi.restart())}
                >
                  Restart Air
                </button>
              )}
            </div>
          </section>
          <ScoreCorrection matchCode={status?.show?.matchCode || "MAIN"} />
          <section className="product-panel">
            <h2>Capture on this PC</h2>
            <p>
              Use only when this production computer is also the game observer.
              Other observer computers relay over LAN.
            </p>
            <CaptureControls
              active={status?.gepActive === true}
              configuredCode={status?.show?.matchCode}
              broadcastApi={window.esportraBroadcast.broadcast}
              onChanged={onChanged}
            />
          </section>
        </div>
      </div>
      {confirmStop && (
        <ConfirmDialog
          title="Stop the local rundown?"
          body="Timers stop and the local segment list clears. OBS keeps its current program scene. Reload the saved plan before starting again."
          confirmLabel="Stop rundown"
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
