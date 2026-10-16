import React, { useEffect, useState } from "react";
import ConfirmDialog from "./air/ConfirmDialog.jsx";

export default function CaptureControls({
  active,
  broadcastApi,
  onChanged,
  configuredCode,
  configuredRole = 'observer',
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [matchCode, setMatchCode] = useState(configuredCode || "MAIN");
  const [captureRole, setCaptureRole] = useState(configuredRole);
  useEffect(() => { if (active) setCaptureRole(configuredRole); }, [active, configuredRole]);
  useEffect(() => {
    if (!active && configuredCode) setMatchCode(configuredCode);
  }, [configuredCode, active]);
  async function change(start) {
    setBusy(true);
    setError("");
    try {
      const result = start
        ? await broadcastApi.start({ matchCode, captureRole })
        : await broadcastApi.stop();
      if (result && result.ok === false)
        throw new Error(result.error || "Capture could not change state.");
      setConsent(false);
      onChanged?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="product-panel">
      <div className="product-actions">
        <label htmlFor="capture-role">Capture from<select id="capture-role" className="product-input" value={captureRole} disabled={active || busy} onChange={event => setCaptureRole(event.target.value)}><option value="observer">Observer PC</option><option value="player">My player PC</option></select></label>
        <label>
          Match code{" "}
          <input
            className="product-input"
            value={matchCode}
            maxLength={64}
            disabled={active || busy}
            onChange={(event) => setMatchCode(event.target.value)}
          />
        </label>
        <button
          className={active ? "air-ghost-btn" : "air-primary-btn"}
          disabled={
            busy || !broadcastApi || !/^[A-Z0-9_-]{1,64}$/i.test(matchCode)
          }
          onClick={() => (active ? change(false) : setConsent(true))}
        >
          {busy ? "Working…" : active ? "Stop capture" : "Start capture"}
        </button>
      </div>
      <p className="air-empty-state">{captureRole === 'player' ? 'Reads available game data for your player slot.' : 'Reads available match data from the observer.'}</p>
      {error && (
        <p className="broadcast-error" role="alert">
          {error}
        </p>
      )}
      {consent && (
        <ConfirmDialog
          title="Before starting capture"
          body={captureRole === 'player' ? 'Capture reads your Valorant identity, health and ability availability. This data stays on your LAN and is matched to your player slot in the selected broadcast. Overwolf may collect operational telemetry under its privacy policy.' : 'Capture reads health, credits, weapons, kills and agents for players in the observed match. Raw game events stay on your LAN and are not sent to Esportra servers. Overwolf may collect operational telemetry under its privacy policy.'}
          confirmLabel="Allow and start capture"
          confirmVariant="primary"
          onConfirm={() => change(true)}
          onCancel={() => setConsent(false)}
          confirming={busy}
          errorText={error || null}
        />
      )}
    </section>
  );
}
