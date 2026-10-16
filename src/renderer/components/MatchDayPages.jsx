import React, { useEffect, useState } from "react";
import Walkthrough from "./Walkthrough.jsx";
import AirIcon from "./air/AirIcon.jsx";
import MatchList from "./MatchList.jsx";
import AirShell from "./air/AirShell.jsx";
import { PageHead, HelpTip, useWorkspace } from "../workspace.jsx";
const api = window.esportraBroadcast?.air;
export function useMatchDay() {
  const { status } = useWorkspace();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  async function reload() {
    try {
      const result = await api.getMatchDay();
      if (!result.ok) throw new Error(result.error);
      setData(result);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  useEffect(() => {
    setData(null);
    void reload();
    const timer = setInterval(reload, 3000);
    return () => clearInterval(timer);
  }, [status?.show?.id, status?.show?.matchCode]);
  return { data, error, reload };
}
export function MatchesPage() {
  const { status, navigate, refresh } = useWorkspace(),
    { data, error } = useMatchDay();
  const [query, setQuery] = useState(""),
    [tab, setTab] = useState("upcoming"),
    [failure, setFailure] = useState("");
  const matches = (data?.matches || []).filter(
    (match) =>
      (tab === "completed"
        ? ["completed", "cancelled"].includes(match.status)
        : !["completed", "cancelled"].includes(match.status)) &&
      `${match.title || ""} ${match.teams.map((team) => team.name).join(" ")} ${match.matchCode}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function select(match) {
    setFailure("");
    const result = await api.selectShowMatch(match.matchCode);
    if (!result.ok) return setFailure(result.error);
    await refresh();
    navigate("players");
  }
  return (
    <AirShell screenTitle="Matches">
      <main className="workspace-page">
        <PageHead
          eyebrow="BROADCAST WORKSPACE"
          title="Matches"
          action={
            <button
              className={matches.length ? "air-ghost-btn" : "air-primary-btn"}
              onClick={() => navigate("projects")}
            >
              <AirIcon name="plus" size={16} />
              Create a match
            </button>
          }
        >
          Choose a match, check the lineup and prepare your broadcast.
        </PageHead>
        {(error || failure) && (
          <p className="broadcast-error" role="alert">
            {error || failure}
          </p>
        )}
        <div className="match-day-layout">
          <div className="match-day-main">
            <div className="workspace-toolbar match-list-toolbar">
              <div
                className="workspace-tabs"
                role="tablist"
                aria-label="Match status"
              >
                {[
                  ["upcoming", "Upcoming & live"],
                  ["completed", "Completed"],
                ].map(([value, label]) => (
                  <button
                    role="tab"
                    aria-selected={tab === value}
                    key={value}
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="match-search">
                <AirIcon name="search" size={16} />
                <input
                  aria-label="Search matches"
                  placeholder="Search matches"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            {!data && !error ? (
              <div className="empty-state" role="status">
                <h2>Loading matches</h2>
                <p>Getting the latest match details.</p>
              </div>
            ) : !matches.length ? (
              <div className="empty-state match-empty">
                <span className="empty-icon">
                  <AirIcon name="matches" size={26} />
                </span>
                <h2>
                  {query
                    ? "No matches found"
                    : tab === "completed"
                      ? "No completed matches yet"
                      : "No matches to prepare"}
                </h2>
                <p>
                  {query
                    ? "Try a team name or match code."
                    : tab === "completed"
                      ? "Completed broadcasts stay here for reference."
                      : "Send a tournament match from Esportra, or create an independent match in Air."}
                </p>
                <button
                  className="air-ghost-btn"
                  onClick={() =>
                    query ? setQuery("") : navigate("connections")
                  }
                >
                  {query ? "Clear search" : "Check Esportra connection"}
                </button>
              </div>
            ) : (
              <MatchList
                matches={matches}
                data={data}
                status={status}
                onSelect={select}
              />
            )}
            <div className="match-list-footer">
              <span>
                {matches.length}{" "}
                {tab === "completed" ? "completed" : "available"}{" "}
                {matches.length === 1 ? "match" : "matches"}
              </span>
              <span>Completed matches stay in history</span>
            </div>
            <section className="broadcast-essentials">
              <h2>Before you go live</h2>
              <p>Check the two connections that power your broadcast.</p>
              <div className="essential-connections">
                <div>
                  <span className="essential-icon">
                    <AirIcon name="producer" size={21} />
                  </span>
                  <div>
                    <h3>OBS Studio</h3>
                    <p>
                      {status?.health?.obsConnection?.state === "healthy"
                        ? "Connected to this production PC"
                        : "Connect to send screens to OBS"}
                    </p>
                  </div>
                  <button
                    className="air-text-btn"
                    onClick={() => navigate("connections")}
                  >
                    {status?.health?.obsConnection?.state === "healthy"
                      ? "Review"
                      : "Connect OBS"}
                    <AirIcon name="arrow" size={14} />
                  </button>
                </div>
                <div>
                  <span className="essential-icon">
                    <AirIcon name="live" size={21} />
                  </span>
                  <div>
                    <h3>Game data</h3>
                    <p>
                      {status?.productionFeed?.ageMs != null &&
                      !status?.productionFeed?.stale
                        ? "Receiving live game data"
                        : "Capture on this PC or use an observer"}
                    </p>
                  </div>
                  <button
                    className="air-text-btn"
                    onClick={() => navigate("connections")}
                  >
                    Check game feed
                    <AirIcon name="arrow" size={14} />
                  </button>
                </div>
              </div>
            </section>
          </div>
          <aside
            className="match-setup-rail"
            aria-label="Broadcast preparation"
          >
            <Walkthrough compact key={status?.show?.id || "new"} data={data} />
          </aside>
        </div>
      </main>
    </AirShell>
  );
}
export function PlayersPage() {
  const { navigate, markPlayersReviewed } = useWorkspace(),
    { data, error, reload } = useMatchDay();
  const [notice, setNotice] = useState(""),
    [failure, setFailure] = useState(""),
    [editing, setEditing] = useState(null);
  async function save(row, values) {
    setFailure("");
    const result = await api.setPlayerPreference({
      context: data.context,
      playerKey: row.key,
      ...values,
    });
    if (!result.ok) return setFailure(result.error);
    setEditing(null);
    setNotice("HUD appearance updated. Original player names are unchanged.");
    await reload();
  }
  return (
    <AirShell screenTitle="Teams & players">
      <main className="workspace-page">
        <PageHead
          eyebrow="MATCH PREPARATION"
          title="Teams & players"
          action={
            <button
              className="air-primary-btn"
              disabled={
                !!error ||
                data?.teams?.length !== 2 ||
                !data.teams.every((team) => team.players.length > 0)
              }
              title="Review both lineups before continuing"
              onClick={() => {
                markPlayersReviewed();
                navigate("connections");
              }}
            >
              Confirm lineup & continue
            </button>
          }
        >
          In-game identity connects captured data to a player. HUD nickname
          changes only what viewers see.
          <HelpTip>
            Use the full in-game name and tag. When a game reports only a
            partial name, confirm the received player once. Nicknames never
            change game identity.
          </HelpTip>
        </PageHead>
        {(error || failure) && (
          <p className="broadcast-error" role="alert">
            {error || failure}
          </p>
        )}
        {notice && (
          <p role="status" className="inline-notice">
            {notice}
          </p>
        )}
        {!data?.teams?.length ? (
          <div className="empty-state">
            <h2>Choose a match first</h2>
            <button
              className="air-primary-btn"
              onClick={() => navigate("matches")}
            >
              Choose match
            </button>
          </div>
        ) : (
          data.teams.map((team, index) => (
            <section className="workspace-section" key={team.id || index}>
              <div className="team-heading">
                {team.logo && (
                  <img
                    className="team-logo"
                    src={team.logo}
                    alt={`${team.name} logo`}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                      event.currentTarget.nextElementSibling?.removeAttribute(
                        "hidden",
                      );
                    }}
                  />
                )}
                <span hidden={!!team.logo} className="asset-missing">
                  Logo unavailable · check team assets
                </span>
                <div>
                  <h2>{team.name}</h2>
                  <span>{team.players.length} registered players</span>
                </div>
              </div>
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Original name / role</th>
                    <th>In-game identity</th>
                    <th>HUD nickname</th>
                    <th>Game data</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {team.players.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.originalName}</strong>
                        <small>
                          {row.role === "substitute"
                            ? "Substitute"
                            : row.role === "coach"
                              ? "Coach"
                              : "Starter"}
                        </small>
                      </td>
                      <td>{row.inGameName || "Identity not supplied"}</td>
                      <td>{row.hudNickname || row.originalName}</td>
                      <td>
                        <span
                          className={`status-pill ${row.state === "matched" ? "matched" : "warning"}`}
                        >
                          {row.state === "matched"
                            ? "Matched"
                            : row.state === "needs_confirmation"
                              ? "Needs confirmation"
                              : "Not detected"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="air-ghost-btn"
                          onClick={() =>
                            setEditing({
                              key: row.key,
                              nickname: row.hudNickname,
                              gameId: row.gameId,
                            })
                          }
                        >
                          Edit HUD name
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {team.players.map(
                (row) =>
                  editing?.key === row.key && (
                    <form
                      key={row.key}
                      className="workspace-section"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void save(row, {
                          nickname: editing.nickname,
                          gameId: editing.gameId,
                        });
                      }}
                    >
                      <h3>{row.originalName} · broadcast appearance</h3>
                      <div className="workspace-form">
                        <label>
                          HUD nickname
                          <input
                            aria-label="HUD nickname"
                            maxLength={80}
                            value={editing.nickname}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                nickname: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Confirm a detected game player
                          <select
                            aria-label="Confirm detected player"
                            value={editing.gameId || ""}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                gameId: event.target.value,
                              })
                            }
                          >
                            <option value="">
                              Use verified identity / no manual binding
                            </option>
                            {data.detectedPlayers
                              .filter((player) => player.puuid)
                              .map((player) => (
                                <option key={player.puuid} value={player.puuid}>
                                  {player.name} · Team {player.team + 1}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      <div className="product-actions">
                        <button className="air-primary-btn">
                          Save HUD name
                        </button>
                        <button
                          className="air-ghost-btn"
                          type="button"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ),
              )}
            </section>
          ))
        )}
      </main>
    </AirShell>
  );
}
