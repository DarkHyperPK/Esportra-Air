import React, { useState } from "react";
import AirShell from "./air/AirShell.jsx";

export default function ModeScreen({
  airApi,
  restartRequired,
  onSelected,
  onBack,
  currentMode,
  selectedMode,
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  async function choose(mode) {
    setBusy(true);
    setError("");
    try {
      const result = await airApi.setMode(mode);
      if (!result.ok) throw new Error(result.error);
      setEditing(false);
      onSelected(result);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function restart() {
    setBusy(true);
    setError("");
    try {
      const result = await airApi.restart();
      if (!result.ok) throw new Error(result.error);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  return (
    <AirShell screenTitle="PC role">
      <div className="air-content">
        <h1>How will you use this PC?</h1>
        <p className="air-empty-state">
          One PC can observe the game and produce the broadcast. Choose production mode for both.
        </p>
        {currentMode && <p>Current role: {currentMode === 'production' ? 'Production (can also capture game data)' : 'Capture for another production PC'}.</p>}
        {error && (
          <p className="broadcast-error" role="alert">
            {error}
          </p>
        )}
        {onBack && (
          <button className="air-ghost-btn" onClick={onBack}>
            Back to workspace
          </button>
        )}
        {restartRequired && !editing ? (
          <section className="product-panel">
            <h2>Restart to load this machine’s role.</h2>
            <p>Air will reopen with the services for this machine’s role.</p>
            {selectedMode && <p>Selected role: {selectedMode === 'production' ? 'Production' : 'Capture for another PC'}.</p>}
            <button
              className="air-primary-btn"
              disabled={busy}
              onClick={restart}
            >
              Restart Air
            </button>
            <button className="air-ghost-btn" disabled={busy} onClick={() => setEditing(true)}>Change selection</button>
            {currentMode && <button className="air-ghost-btn" disabled={busy} onClick={() => choose(currentMode)}>Keep current role</button>}
          </section>
        ) : (
          <div className="product-grid">
            <section className="product-panel">
              <h2>Produce on this PC</h2>
              <p>Run OBS and the HUD. This PC can also observe Valorant and capture game data. No second PC is required.</p>
              <p>Game capture stays off until you choose Start capture and approve it.</p>
              <button
                className="air-primary-btn"
                disabled={busy}
                onClick={() => choose("production")}
              >
                Use production mode
              </button>
            </section>
            <section className="product-panel">
              <h2>Capture for another PC</h2>
              <p>
                Capture game events and relay them to the production PC over
                LAN. OBS and broadcast controls run on that other PC.
              </p>
              <button
                className="air-ghost-btn"
                disabled={busy}
                onClick={() => choose("capture-only")}
              >
                Use capture-only mode
              </button>
            </section>
          </div>
        )}
      </div>
    </AirShell>
  );
}
