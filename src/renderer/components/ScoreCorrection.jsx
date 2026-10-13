import React, { useState } from "react";
import ConfirmDialog from "./air/ConfirmDialog.jsx";
export default function ScoreCorrection({ matchCode }) {
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [map, setMap] = useState("1"),
    [a, setA] = useState("0"),
    [b, setB] = useState("0"),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await window.esportraBroadcast.fixData({
        matchCode,
        mapIndex: Number(map),
        teamAScore: Number(a),
        teamBScore: Number(b),
        reason,
      });
      if (!result.ok)
        throw new Error(
          result.queued
            ? "Correction queued, but local HUD could not be updated. Verify the overlay before continuing."
            : result.error || "Could not apply correction.",
        );
      setConfirm(false);
      setOpen(false);
      setNotice(
        result.queued
          ? "Local HUD updated. Correction queued for platform delivery; official bracket result is unchanged."
          : "Local HUD updated. Platform delivery was not queued.",
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="product-panel">
      <h2>Score correction</h2>
      <p>Correct a local map result for {matchCode || "MAIN"}.</p>
      {notice && <p role="status">{notice}</p>}
      {error && !confirm && (
        <p role="alert" className="broadcast-error">
          {error}
        </p>
      )}
      {!open ? (
        <button
          className="air-ghost-btn"
          onClick={() => {
            setOpen(true);
            setError("");
            setNotice("");
          }}
        >
          Fix map score
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setConfirm(true);
          }}
        >
          <div className="product-form">
            <label>
              Map
              <input
                className="product-input"
                type="number"
                min="1"
                max="9"
                required
                value={map}
                onChange={(event) => setMap(event.target.value)}
              />
            </label>
            <label>
              Team A
              <input
                className="product-input"
                type="number"
                min="0"
                max="2147483647"
                required
                value={a}
                onChange={(event) => setA(event.target.value)}
              />
            </label>
            <label>
              Team B
              <input
                className="product-input"
                type="number"
                min="0"
                max="2147483647"
                required
                value={b}
                onChange={(event) => setB(event.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                className="product-input"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <div className="product-actions">
            <button className="air-primary-btn" type="submit">
              Review correction
            </button>
            <button
              className="air-ghost-btn"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {confirm && (
        <ConfirmDialog
          title={`Set map ${map} to ${a}–${b}?`}
          body="The local overlay updates immediately. Platform delivery records a correction; it does not overwrite the official bracket result."
          confirmLabel="Apply correction"
          confirmVariant="primary"
          onConfirm={apply}
          onCancel={() => setConfirm(false)}
          confirming={busy}
          errorText={error || null}
        />
      )}
    </section>
  );
}
