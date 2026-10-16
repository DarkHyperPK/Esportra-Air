import React from "react";
import AirIcon from "./air/AirIcon.jsx";

const labels = {
  pending: "Scheduled",
  scheduled: "Scheduled",
  ready: "Ready",
  in_progress: "Live",
  completed: "Completed",
  cancelled: "Cancelled",
};

function TeamMark({ team }) {
  const logo = team.logoUrl || team.logo;
  return (
    <span className="match-team-mark" title={team.name}>
      {logo && (
        <img
          src={logo}
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <span>{team.name?.slice(0, 2).toUpperCase() || "?"}</span>
    </span>
  );
}

export default function MatchList({ matches, data, status, onSelect }) {
  const locked = !!status?.runner?.activeSegment || status?.gepActive;
  return (
    <table className="workspace-table match-list">
      <thead>
        <tr>
          <th>Match</th>
          <th>Scheduled</th>
          <th>Status</th>
          <th>
            <span className="sr-only">Next action</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match) => {
          const selected = match.matchCode === status?.show?.matchCode;
          const history = ["completed", "cancelled"].includes(match.status);
          const date = match.scheduledAt ? new Date(match.scheduledAt) : null;
          return (
            <tr
              key={match.id || match.matchCode}
              className={selected ? "selected" : ""}
            >
              <td>
                <div className="match-identity">
                  <div className="match-team-marks">
                    {match.teams.slice(0, 2).map((team, index) => (
                      <TeamMark key={index} team={team} />
                    ))}
                  </div>
                  <div>
                    <strong>
                      {match.teams.map((team) => team.name).join(" vs ")}
                    </strong>
                    <small>
                      <span>{data.title}</span>
                      <span className="match-format">
                        {match.matchCode} · BO{match.bestOf || 1}
                      </span>
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {date ? (
                  <>
                    <span>
                      {date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <small>
                      {date.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </>
                ) : (
                  <span className="unscheduled">Not scheduled</span>
                )}
              </td>
              <td>
                <span
                  className={`status-pill ${match.status === "in_progress" ? "live" : ""}`}
                >
                  <i />
                  {labels[match.status] || "Scheduled"}
                </span>
              </td>
              <td>
                {history ? (
                  <span className="history-label">History only</span>
                ) : (
                  <button
                    className={selected ? "air-primary-btn" : "air-ghost-btn"}
                    onClick={() => onSelect(match)}
                    disabled={locked}
                    title={
                      locked
                        ? "Stop production and capture before changing matches"
                        : undefined
                    }
                  >
                    {selected ? "Check players" : "Prepare match"}
                    <AirIcon name="arrow" size={14} />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
