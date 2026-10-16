import React, { useState } from "react";
const uuid = () => crypto.randomUUID();
export function TeamEditor({ initial, onSave, onCancel, onLogo, busy }) {
  const [team, setTeam] = useState(
    initial || {
      id: uuid(),
      name: "",
      tag: "",
      logoAssetId: null,
      players: Array.from({ length: 5 }, () => ({
        id: uuid(),
        originalName: "",
        inGameName: "",
        hudNickname: "",
        gameId: null,
        role: "starter",
      })),
    },
  );
  const changePlayer = (index, values) =>
    setTeam({
      ...team,
      players: team.players.map((player, i) =>
        i === index ? { ...player, ...values } : player,
      ),
    });
  return (
    <form
      className="workspace-section"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          ...team,
          players: team.players.map((player) => ({
            ...player,
            originalName:
              player.originalName.trim() || player.inGameName.split("#")[0],
          })),
        });
      }}
    >
      <h2>{initial ? "Edit team and players" : "Add a team"}</h2>
      <div className="workspace-form">
        <label>
          Team name
          <input
            required
            maxLength={80}
            value={team.name}
            onChange={(event) => setTeam({ ...team, name: event.target.value })}
          />
        </label>
        <label>
          Short team tag
          <input
            required
            maxLength={12}
            value={team.tag}
            onChange={(event) => setTeam({ ...team, tag: event.target.value })}
          />
        </label>
        <div className="product-actions">
          <button
            type="button"
            className="air-ghost-btn"
            disabled={busy}
            onClick={async () => {
              const asset = await onLogo();
              if (asset) setTeam({ ...team, logoAssetId: asset.id });
            }}
          >
            Choose team logo
          </button>
          {team.logoAssetId && (
            <span className="status-pill matched">Logo selected</span>
          )}
        </div>
      </div>
      <p>
        Enter the exact in-game name, including #tag where available. Air uses
        it to match captured players. A HUD nickname changes appearance only.
      </p>
      <table className="workspace-table">
        <thead>
          <tr>
            <th>Original name</th>
            <th>In-game name and tag</th>
            <th>HUD nickname, optional</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {team.players.map((player, index) => (
            <tr key={player.id}>
              <td>
                <input
                  aria-label={`Player ${index + 1} original name`}
                  maxLength={80}
                  placeholder="Defaults to game name"
                  value={player.originalName}
                  onChange={(event) =>
                    changePlayer(index, { originalName: event.target.value })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`Player ${index + 1} in-game identity`}
                  required
                  maxLength={100}
                  placeholder="Player#TAG"
                  value={player.inGameName}
                  onChange={(event) =>
                    changePlayer(index, { inGameName: event.target.value })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`Player ${index + 1} HUD nickname`}
                  maxLength={80}
                  value={player.hudNickname || ""}
                  onChange={(event) =>
                    changePlayer(index, { hudNickname: event.target.value })
                  }
                />
              </td>
              <td>
                <select
                  aria-label={`Player ${index + 1} role`}
                  value={player.role}
                  onChange={(event) =>
                    changePlayer(index, { role: event.target.value })
                  }
                >
                  <option value="starter">Starter</option>
                  <option value="substitute">Substitute</option>
                </select>
              </td>
              <td>
                <button
                  className="air-ghost-btn"
                  type="button"
                  onClick={() =>
                    setTeam({
                      ...team,
                      players: team.players.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="product-actions">
        <button
          type="button"
          className="air-ghost-btn"
          disabled={team.players.length >= 15 || busy}
          onClick={() =>
            setTeam({
              ...team,
              players: [
                ...team.players,
                {
                  id: uuid(),
                  originalName: "",
                  inGameName: "",
                  hudNickname: "",
                  gameId: null,
                  role: "substitute",
                },
              ],
            })
          }
        >
          Add player
        </button>
        <button className="air-primary-btn" disabled={busy}>
          {busy ? "Saving…" : "Save team"}
        </button>
        <button
          type="button"
          className="air-ghost-btn"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
export function MatchEditor({ teams, initial, onSave, onCancel, busy }) {
  const [match, setMatch] = useState(
    initial || {
      id: uuid(),
      title: "",
      teamIds: [teams[0]?.id || "", teams[1]?.id || ""],
      bestOf: 1,
      mapPool: [],
      scheduledAt: null,
      status: "scheduled",
      scores: [0, 0],
    },
  );
  const [maps, setMaps] = useState(match.mapPool.join(", "));
  return (
    <form
      className="workspace-section"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          ...match,
          title:
            match.title ||
            match.teamIds
              .map((id) => teams.find((team) => team.id === id)?.name)
              .join(" vs "),
          mapPool: maps
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
        });
      }}
    >
      <h2>{initial ? "Edit match" : "Create a match"}</h2>
      <div className="workspace-form">
        {[0, 1].map((side) => (
          <label key={side}>
            Team {side + 1}
            <select
              aria-label={`Match team ${side + 1}`}
              required
              value={match.teamIds[side]}
              onChange={(event) =>
                setMatch({
                  ...match,
                  teamIds: match.teamIds.map((id, index) =>
                    index === side ? event.target.value : id,
                  ),
                })
              }
            >
              {teams.map((team) => (
                <option value={team.id} key={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Match title, optional
          <input
            maxLength={120}
            value={match.title}
            onChange={(event) =>
              setMatch({ ...match, title: event.target.value })
            }
          />
        </label>
        <label>
          Series format
          <select
            value={match.bestOf}
            onChange={(event) =>
              setMatch({
                ...match,
                bestOf: Number(event.target.value),
                scores: [0, 0],
              })
            }
          >
            {[1, 3, 5, 7, 9].map((value) => (
              <option key={value} value={value}>
                Best of {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Map pool
          <input
            placeholder="Ascent, Haven, Lotus"
            value={maps}
            onChange={(event) => setMaps(event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={match.status}
            onChange={(event) =>
              setMatch({ ...match, status: event.target.value })
            }
          >
            <option value="scheduled">Upcoming</option>
            <option value="in_progress">Live</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Scheduled time, optional
          <input
            type="datetime-local"
            value={
              match.scheduledAt
                ? new Date(
                    Date.parse(match.scheduledAt) -
                      new Date().getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
            onChange={(event) =>
              setMatch({
                ...match,
                scheduledAt: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : null,
              })
            }
          />
        </label>
        {[0, 1].map((index) => (
          <label key={"score" + index}>
            Team {index + 1} series wins
            <input
              type="number"
              min="0"
              max={Math.floor(match.bestOf / 2) + 1}
              value={match.scores?.[index] || 0}
              onChange={(event) =>
                setMatch({
                  ...match,
                  scores: (match.scores || [0, 0]).map((score, i) =>
                    i === index ? Number(event.target.value) : score,
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      <p>
        Independent results affect this project and its graphics. They do not
        update Esportra tournament records.
      </p>
      <div className="product-actions">
        <button className="air-primary-btn" disabled={busy}>
          Save match
        </button>
        <button
          type="button"
          className="air-ghost-btn"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
