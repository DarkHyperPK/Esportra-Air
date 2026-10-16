import React, { useState } from "react";
import AirShell from "./air/AirShell.jsx";
import ConfirmDialog from "./air/ConfirmDialog.jsx";
import CopyUrlButton from "./air/CopyUrlButton.jsx";
const NAV = [
  { id: "readiness", label: "Readiness" },
  { id: "producer", label: "Live production" },
  { id: "outputs", label: "Browser sources" },
];

export default function SourceOutputs({
  status,
  airApi,
  onScreenChange,
  onChanged,
}) {
  const [adding, setAdding] = useState(false);
  const [lan, setLan] = useState(false);
  const [name, setName] = useState("");
  const [overlay, setOverlay] = useState("");
  const [matchCode, setMatchCode] = useState("MAIN");
  const [followMatch, setFollowMatch] = useState(true);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const catalogue = status?.outputCatalogue || [],
    outputs = status?.outputs || [];
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await airApi.addOutput({
        name,
        overlay: overlay || catalogue[0]?.name,
        matchCode,
        followMatch,
      });
      if (!result.ok) throw new Error(result.error);
      setAdding(false);
      setName("");
      onChanged?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const result = await airApi.removeOutput(removing.id);
      if (!result.ok) throw new Error(result.error);
      setRemoving(null);
      onChanged?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  function address(output) {
    const url = new URL(output.url);
    if (lan && status.nodeIp) url.hostname = status.nodeIp;
    return url.href;
  }
  return (
    <AirShell
      show={status?.show}
      screenTitle="Browser outputs"
      nodeName={status?.nodeName}
      nav={NAV}
      activeTab="outputs"
      onTabChange={onScreenChange}
      contextualButton={
        <button
          className="air-primary-btn"
          onClick={() => {
            setError("");
            setAdding(true);
          }}
        >
          + Add output
        </button>
      }
    >
      <div className="air-content">
        <div className="product-actions">
          <button
            className={!lan ? "air-primary-btn" : "air-ghost-btn"}
            onClick={() => setLan(false)}
          >
            This PC
          </button>
          <button
            className={lan ? "air-primary-btn" : "air-ghost-btn"}
            disabled={!status?.nodeIp}
            onClick={() => setLan(true)}
          >
            LAN {status?.nodeIp || "unavailable"}
          </button>
        </div>
        <p className="air-empty-state">
          Add these stable HTTP URLs as browser sources in OBS. Outputs can follow
          the selected match automatically.
        </p>
        {error && (
          <p className="broadcast-error" role="alert">
            {error}
          </p>
        )}
        {adding && (
          <form className="product-panel" onSubmit={create}>
            <h2>Add a browser output</h2>
            <div className="product-form">
              <label>
                Name
                <input
                  className="product-input"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Overlay
                <select
                  aria-label="Overlay"
                  className="product-input"
                  value={overlay || catalogue[0]?.name || ""}
                  onChange={(event) => setOverlay(event.target.value)}
                >
                  {catalogue.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Match code
                <input
                  className="product-input"
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9_-]+"
                  value={matchCode}
                  disabled={followMatch}
                  onChange={(event) => setMatchCode(event.target.value)}
                />
              </label>
            </div>
            <label><input type="checkbox" checked={followMatch} onChange={event => setFollowMatch(event.target.checked)} /> Follow selected match</label>
            <div className="product-actions">
              <button
                className="air-primary-btn"
                disabled={busy || !catalogue.length}
              >
                Save output
              </button>
              <button
                type="button"
                className="air-ghost-btn"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {!outputs.length ? (
          <section className="product-panel">
            <h2>Your first browser source.</h2>
            <p>
              Choose an overlay, then copy its stable URL into OBS. It follows your selected match by default.
            </p>
          </section>
        ) : (
          <table className="outputs-table product-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Browser URL</th>
                <th>Match</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map((output) => (
                <tr key={output.id}>
                  <td>
                    {output.name}
                    <small>{output.overlay}</small>
                  </td>
                  <td className="product-url">{address(output)}</td>
                  <td>{output.followMatch ? 'Selected match' : output.matchCode}<small>{output.connectionCount ?? 0} connected · {output.lastFrameAt ? `Frame ${new Date(output.lastFrameAt).toLocaleTimeString()}` : 'Waiting for render'}</small></td>
                  <td>
                    <div className="product-actions">
                      <CopyUrlButton url={address(output)} />
                      <button
                        className="air-ghost-btn"
                        onClick={() =>
                          window.esportraBroadcast?.hud.previewOverlay(
                            output.url,
                          )
                        }
                      >
                        Preview
                      </button>
                      <button
                        className="air-ghost-btn"
                        onClick={() => {
                          setError("");
                          setRemoving(output);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {removing && (
        <ConfirmDialog
          title="Remove this saved output?"
          body="This removes the output from Air’s list. An OBS browser source using its URL continues working until you remove it in OBS."
          confirmLabel="Remove saved output"
          confirmVariant="destructive"
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
          confirming={busy}
          errorText={error || null}
        />
      )}
    </AirShell>
  );
}
