import React, { useState } from "react";
import AirShell from "./air/AirShell.jsx";

export default function ModeScreen({
  airApi,
  restartRequired,
  onSelected,
  onBack,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(mode) {
    setBusy(true);
    setError("");
    try {
      const result = await airApi.setMode(mode);
      if (!result.ok) throw new Error(result.error);
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
    <AirShell screenTitle="Machine role">
      <div className="air-content">
        <h1>Every machine has one clear job.</h1>
        <p className="air-empty-state">
          Choose how this PC participates in the show.
        </p>
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
        {restartRequired ? (
          <section className="product-panel">
            <h2>Restart to load this machine’s role.</h2>
            <p>Air will reopen with the services for this machine’s role.</p>
            <button
              className="air-primary-btn"
              disabled={busy}
              onClick={restart}
            >
              Restart Air
            </button>
          </section>
        ) : (
          <div className="product-grid">
            <section className="product-panel">
              <h2>Production desk</h2>
              <p>Run the local HUD, connect OBS and take show segments.</p>
              <button
                className="air-primary-btn"
                disabled={busy}
                onClick={() => choose("production")}
              >
                Use production mode
              </button>
            </section>
            <section className="product-panel">
              <h2>Observer capture</h2>
              <p>
                Capture game events and relay them to the production PC over
                LAN.
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
