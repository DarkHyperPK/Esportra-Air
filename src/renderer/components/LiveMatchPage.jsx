import React, { useEffect, useState } from "react";
import AirShell from "./air/AirShell.jsx";
import { PageHead, useWorkspace } from "../workspace.jsx";
import { useMatchDay } from "./MatchDayPages.jsx";
export default function LiveMatchPage() {
  const { status, navigate, refresh } = useWorkspace(),
    { data, error } = useMatchDay();
  const [tab, setTab] = useState("overview"),
    [paused, setPaused] = useState(false),
    [packets, setPackets] = useState([]),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!paused && data) setPackets(data.packets || []);
  }, [data, paused]);
  const live = data?.live || status?.productionFeed,
    known = live?.available,
    teams = live?.teams || [];
  async function link(code) {
    const result = await window.esportraBroadcast.air.selectShowMatch(code);
    if (!result.ok) return setNotice(result.error);
    await refresh();
    setNotice(
      "Detected game linked to the selected match. OBS keeps its current on-air screen.",
    );
  }
  return (
    <AirShell screenTitle="Live match">
      <main className="workspace-page">
        <PageHead
          eyebrow="INCOMING GAME FEED"
          title="Live match"
          action={
            <button
              className="air-primary-btn"
              onClick={() => navigate("producer")}
            >
              Open OBS controls
            </button>
          }
        >
          Live data stays on your production network. A game feed does not
          switch the broadcast by itself.
        </PageHead>
        {error && (
          <p role="alert" className="broadcast-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="inline-notice">
            {notice}
          </p>
        )}
        {data?.suggestions
          ?.filter((match) => match.matchCode !== data.selectedCode)
          .map((match) => (
            <div className="inline-notice" key={match.matchCode}>
              Detected players may belong to <strong>{match.label}</strong>.
              Confirm before linking.{" "}
              <button
                className="air-ghost-btn"
                onClick={() => link(match.matchCode)}
              >
                Link this match
              </button>
            </div>
          ))}
        <div
          className="workspace-tabs"
          role="tablist"
          aria-label="Live data view"
        >
          {[
            ["overview", "Match overview"],
            ["events", "Recent events"],
            ["packets", "Incoming packets"],
          ].map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "overview" &&
          (!known ? (
            <div className="empty-state">
              <h2>Waiting for game data</h2>
              <p>
                Start capture on this PC or connect the observer PC. No sample
                scores are shown here.
              </p>
              <button
                className="air-primary-btn"
                onClick={() => navigate("connections")}
              >
                Connect game feed
              </button>
            </div>
          ) : (
            <>
              {live.stale && (
                <p role="alert" className="inline-notice">
                  Feed paused · showing last received values. Check the observer
                  connection.
                </p>
              )}
              <div className="live-scoreline">
                <div>
                  <strong>{teams[0]?.name || "Team 1"}</strong>
                </div>
                <div className="score">
                  {teams[0]?.score ?? "—"} : {teams[1]?.score ?? "—"}
                </div>
                <div>
                  <strong>{teams[1]?.name || "Team 2"}</strong>
                </div>
              </div>
              <div className="live-facts">
                {[
                  ["Map", live.map],
                  ["Round", live.round],
                  ["Phase", live.phase],
                  ["Observed player", live.observedPlayer],
                  [
                    "Feed updated",
                    live.ageMs == null
                      ? null
                      : `${Math.floor(live.ageMs / 1000)} seconds ago`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value ?? "Unknown"}</strong>
                  </div>
                ))}
              </div>
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Agent</th>
                    <th>K / D / A</th>
                    <th>Health</th>
                    <th>Credits</th>
                    <th>Data source</th>
                  </tr>
                </thead>
                <tbody>
                  {(live.players || []).map((player) => (
                    <tr key={player.puuid || player.slot}>
                      <td>
                        <strong>{player.name}</strong>
                      </td>
                      <td>{player.agent || "Unknown"}</td>
                      <td>
                        {player.k ?? "—"} / {player.d ?? "—"} /{" "}
                        {player.a ?? "—"}
                      </td>
                      <td>{player.hpKnown ? player.hp : "Unknown"}</td>
                      <td>
                        {player.creditsKnown ? player.credits : "Unknown"}
                      </td>
                      <td>
                        {player.captureCoverage
                          ? "Observer + player PC"
                          : "Observer"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ))}
        {tab === "events" && (
          <section className="workspace-section">
            <h2>Recent game events</h2>
            <div className="event-list">
              {(data?.events || []).map((event, index) => (
                <div className="event-row" key={index}>
                  <time>{new Date(event.at).toLocaleTimeString()}</time>
                  <strong>{event.name}</strong>
                  <span>{JSON.stringify(event.data || {})}</span>
                </div>
              ))}
              {!data?.events?.length && (
                <p>Events appear when the selected game reports them.</p>
              )}
            </div>
          </section>
        )}
        {tab === "packets" && (
          <section className="workspace-section">
            <div className="workspace-toolbar">
              <input
                aria-label="Search packets"
                placeholder="Search packet data"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                className="air-ghost-btn"
                onClick={() => setPaused(!paused)}
              >
                {paused ? "Resume display" : "Pause display"}
              </button>
              <button
                className="air-ghost-btn"
                onClick={async () => {
                  await window.esportraBroadcast.air.clearPackets();
                  setPackets([]);
                }}
              >
                Clear buffer
              </button>
            </div>
            <p>
              {paused
                ? "Display paused; capture continues."
                : "Latest received packets; kept locally in a bounded memory buffer."}
            </p>
            <pre className="packet-output">
              {packets
                .filter((packet) =>
                  JSON.stringify(packet)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((packet) => JSON.stringify(packet, null, 2))
                .join("\n\n") || "No packets to display."}
            </pre>
          </section>
        )}
      </main>
    </AirShell>
  );
}
