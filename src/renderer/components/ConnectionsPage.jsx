import React, { useEffect, useState } from "react";
import AirShell from "./air/AirShell.jsx";
import CaptureControls from "./CaptureControls.jsx";
import { HelpTip, PageHead, useWorkspace } from "../workspace.jsx";
const api = window.esportraBroadcast;
export default function ConnectionsPage() {
  const { status, navigate, refresh } = useWorkspace();
  const [obs, setObs] = useState(null),
    [obsLoading, setObsLoading] = useState(true);
  async function readObs() {
    try {
      const current = await api.obs.getStatus();
      setObs(current);
      return current;
    } catch (_) {
      setObs(null);
      setError("Could not read OBS connection status.");
    } finally {
      setObsLoading(false);
    }
  }
  useEffect(() => {
    void readObs();
    const connected = api.obs.onConnected?.(() => {
      void readObs();
      void refresh();
    });
    const disconnected = api.obs.onDisconnected?.(() => {
      void readObs();
      void refresh();
    });
    return () => {
      connected?.();
      disconnected?.();
    };
  }, [status?.health?.obsConnection?.state]);
  const connected = obs?.connected === true;
  const [connecting, setConnecting] = useState(false);
  const [host, setHost] = useState("localhost"),
    [port, setPort] = useState(4455),
    [password, setPassword] = useState("");
  const [observer, setObserver] = useState({ host: "", port: 5301, key: "" }),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [restart, setRestart] = useState(false);
  async function perform(action, success) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (result?.ok === false) throw new Error(result.error);
      if (success) setNotice(success);
      await readObs();
      await refresh();
      return result;
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function connectObs() {
    setConnecting(true);
    const result = await perform(
      () => api.obs.connect(host, Number(port), password, false),
      "",
    );
    if (result?.ok) setPassword("");
    setConnecting(false);
  }
  return (
    <AirShell screenTitle="Connections">
      <main className="workspace-page">
        <PageHead
          eyebrow="PRODUCTION WORKSPACE"
          title="Connections"
          action={
            <button
              className="air-primary-btn"
              onClick={() => navigate("template")}
            >
              Preview broadcast screens
            </button>
          }
        >
          Manage OBS and game data connections.
        </PageHead>
        {error && (
          <p className="broadcast-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="inline-notice" role="status">
            {notice}
          </p>
        )}
        <div className="workspace-columns">
          <section className="workspace-section">
            <h2>
              OBS Studio{" "}
              <HelpTip>
                In OBS, open Tools → WebSocket Server Settings. Enable the
                server and copy its port and password. Air creates your HUD
                sources after you customize and send the screens.
              </HelpTip>
            </h2>
            {obsLoading ? (
              <p role="status">Checking OBS…</p>
            ) : !obs ? (
              <p>
                OBS status unavailable.{" "}
                <button className="air-text-btn" onClick={readObs}>
                  Retry
                </button>
              </p>
            ) : connected ? (
              <div className="obs-connected-summary">
                <p role="status">
                  <i className="connection-dot is-connected" /> Connected
                </p>
                {obs.host && (
                  <p>
                    {obs.host}:{obs.port}
                  </p>
                )}
                {obs.version && <p>OBS version {obs.version}</p>}
                {obs.collection && <p>Scene collection: {obs.collection}</p>}
                <div className="product-actions">
                  <button
                    className="air-ghost-btn"
                    disabled={busy}
                    onClick={() => perform(() => api.obs.disconnect(), "")}
                  >
                    Disconnect OBS
                  </button>
                  <button
                    className="air-ghost-btn"
                    onClick={() => navigate("producer")}
                  >
                    OBS controls
                  </button>
                </div>
              </div>
            ) : (
              <>
                <form
                  className="workspace-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void connectObs();
                  }}
                >
                  <label>
                    OBS address
                    <input
                      value={host}
                      onChange={(event) => setHost(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    OBS port
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={port}
                      onChange={(event) => setPort(event.target.value)}
                      required
                    />
                  </label>
                  <label className="full">
                    OBS password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="off"
                      placeholder="Blank uses saved password"
                    />
                  </label>
                  <div className="product-actions full">
                    <button className="air-primary-btn" disabled={busy}>
                      {connecting ? "Connecting…" : "Connect OBS"}
                    </button>
                    <button
                      type="button"
                      className="air-ghost-btn"
                      onClick={() => navigate("producer")}
                    >
                      OBS controls
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
          <section className="workspace-section">
            <h2>Esportra connection</h2>
            <p>
              {status?.paired
                ? "This PC is paired."
                : "Connect your account to create independent matches, or pair with an Esportra tournament."}
            </p>
            <p>
              {status?.hubConnected
                ? "Connected to Esportra"
                : "Not connected to Esportra"}
            </p>
            <button
              className="air-ghost-btn"
              onClick={() => navigate("projects")}
            >
              Account & independent projects
            </button>
          </section>
        </div>
        <div className="product-actions">
          <button
            className="air-ghost-btn"
            onClick={() => navigate("readiness")}
          >
            Review broadcast setup
          </button>
        </div>
        <section className="workspace-section">
          <h2>Game capture on this PC</h2>
          <p>
            Read game data on this PC.
          </p>
          <CaptureControls
            active={status?.gepActive === true}
            configuredCode={status?.show?.matchCode}
            configuredRole={status?.captureRole}
            broadcastApi={api.broadcast}
            onChanged={refresh}
          />
        </section>
        <section className="workspace-section">
          <h2>
            Receive data from an observer PC{" "}
            <HelpTip>
              Use this only when another PC observes the game. Open Air on that
              PC in capture-only mode and copy its connection key. The key lets
              your production PC receive its data securely on the LAN.
            </HelpTip>
          </h2>
          <p>
            Skip this section when you observe and produce on one PC. Keys stay
            in the operating system's credential store.
          </p>
          {(status?.lanRelayTargets || []).map((target) => (
            <p key={target}>
              <strong>{target}</strong> · Saved observer{" "}
              <button
                className="air-ghost-btn"
                disabled={busy}
                onClick={() =>
                  perform(
                    () =>
                      api.air.setRelayTargets(
                        status.lanRelayTargets.filter(
                          (item) => item !== target,
                        ),
                        {},
                      ),
                    "Observer removed. Restart Air to apply the change.",
                  ).then((result) => {
                    if (result?.ok) setRestart(true);
                  })
                }
              >
                Remove observer
              </button>
            </p>
          ))}
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              const target = `${observer.host}:${observer.port}`;
              void perform(
                () =>
                  api.air.setRelayTargets(
                    [...new Set([...(status?.lanRelayTargets || []), target])],
                    observer.key ? { [target]: observer.key } : {},
                  ),
                "Observer saved. Restart Air to connect with the updated list.",
              ).then((result) => {
                if (result?.ok) {
                  setRestart(true);
                  setObserver({ ...observer, key: "" });
                }
              });
            }}
          >
            <label>
              Observer address
              <input
                aria-label="Observer address"
                placeholder="192.168.1.24"
                value={observer.host}
                onChange={(event) =>
                  setObserver({ ...observer, host: event.target.value })
                }
                required
              />
            </label>
            <label>
              Observer port
              <input
                aria-label="Observer port"
                type="number"
                min="1"
                max="65535"
                value={observer.port}
                onChange={(event) =>
                  setObserver({ ...observer, port: Number(event.target.value) })
                }
                required
              />
            </label>
            <label className="full">
              Connection key
              <input
                aria-label="Observer connection key"
                type="password"
                value={observer.key}
                onChange={(event) =>
                  setObserver({ ...observer, key: event.target.value })
                }
                autoComplete="off"
                placeholder="Copy from the observer PC; blank reuses a saved key"
              />
            </label>
            <div className="product-actions full">
              <button className="air-primary-btn" disabled={busy}>
                Save observer
              </button>
              <button
                className="air-ghost-btn"
                type="button"
                disabled={busy}
                onClick={() =>
                  perform(
                    () => api.air.testObserver(observer),
                    "Observer connection verified. Save it to receive game data.",
                  )
                }
              >
                Test connection
              </button>
              {restart && (
                <button
                  type="button"
                  className="air-ghost-btn"
                  disabled={busy}
                  onClick={() =>
                    perform(() => api.air.restart(), "Restarting Air…")
                  }
                >
                  Restart Air
                </button>
              )}
            </div>
          </form>
        </section>
      </main>
    </AirShell>
  );
}
