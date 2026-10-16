import React, { useEffect, useState } from "react";
import HudFrame from "./HudFrame.jsx";
import AirShell from "./air/AirShell.jsx";
import { PageHead, useWorkspace } from "../workspace.jsx";
const api = window.esportraBroadcast?.air;
export default function BracketPage() {
  const { status, navigate } = useWorkspace();
  const [data, setData] = useState(null),
    [view, setView] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setView(null);
    setData(null);
    setError("");
    let alive = true;
    async function load() {
      try {
        const result = await api.getBracket();
        if (!result.ok) throw new Error(result.error);
        if (alive) {
          setData(result);
          setView((previous) => previous || result.view);
        }
      } catch (failure) {
        if (alive) setError(failure.message);
      }
    }
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [status?.show?.id, status?.show?.matchCode]);
  const stage = data?.stages?.find((stage) => stage.id === view?.stageId),
    groups = [
      ...new Set(
        (stage?.matches || []).map((node) => node.group).filter(Boolean),
      ),
    ];
  async function save() {
    setError("");
    const result = await api.setBracketView({ context: data.context, view });
    if (!result.ok) return setError(result.error);
    setNotice(
      "Bracket presentation updated for this match. OBS keeps its current scene.",
    );
  }
  return (
    <AirShell screenTitle="Bracket graphics">
      <main className="workspace-page">
        <PageHead
          eyebrow="SHOW THE TOURNAMENT STORY"
          title="A bracket made for the broadcast."
          action={
            <button
              className="air-ghost-btn"
              onClick={() => navigate("template")}
            >
              Back to broadcast screens
            </button>
          }
        >
          Choose a stage and a readable section. Scores and team names use the
          actual source data.
        </PageHead>
        {error && (
          <p className="broadcast-error" role="alert">
            {error}
          </p>
        )}
        {data?.warning && <p className="inline-notice">{data.warning}</p>}
        {notice && (
          <p className="inline-notice" role="status">
            {notice}
          </p>
        )}
        {!data?.stages?.length ? (
          <section className="empty-state">
            <h2>No published bracket to show yet</h2>
            <p>
              For Esportra tournaments, publish the stage's bracket. For
              independent matches, arrange or import a bracket in your project.
            </p>
            <button
              className="air-primary-btn"
              onClick={() => navigate("projects")}
            >
              Open independent project
            </button>
          </section>
        ) : (
          <>
            <div className="workspace-form">
              <label>
                Stage
                <select
                  value={view?.stageId || ""}
                  onChange={(event) =>
                    setView({
                      ...view,
                      stageId: event.target.value,
                      page: 0,
                      startRound: 0,
                      group: "",
                    })
                  }
                >
                  {data.stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Section
                <select
                  value={view?.side || "upper"}
                  onChange={(event) =>
                    setView({ ...view, side: event.target.value, page: 0 })
                  }
                >
                  {[
                    ["upper", "Upper bracket"],
                    ["lower", "Lower bracket"],
                    ["final", "Final"],
                    ["group", "Group / Swiss matches"],
                    ["all", "All sections"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                View
                <select
                  value={view?.mode || "matches"}
                  onChange={(event) =>
                    setView({ ...view, mode: event.target.value, page: 0 })
                  }
                >
                  <option value="matches">Match bracket</option>
                  <option
                    value="standings"
                    disabled={!stage?.standings?.length}
                  >
                    Source standings
                  </option>
                </select>
              </label>
              {groups.length > 0 && (
                <label>
                  Group
                  <select
                    value={view?.group || ""}
                    onChange={(event) =>
                      setView({ ...view, group: event.target.value, page: 0 })
                    }
                  >
                    <option value="">All groups</option>
                    {groups.map((group) => (
                      <option key={group}>{group}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                First round to display
                <input
                  type="number"
                  min="0"
                  max="32"
                  value={view?.startRound || 0}
                  onChange={(event) =>
                    setView({ ...view, startRound: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Page (eight matches per round)
                <input
                  type="number"
                  min="1"
                  max="251"
                  value={(view?.page || 0) + 1}
                  onChange={(event) =>
                    setView({ ...view, page: Number(event.target.value) - 1 })
                  }
                />
              </label>
            </div>
            <div className="product-actions">
              <button className="air-primary-btn" onClick={save}>
                Update bracket preview
              </button>
            </div>
            <HudFrame
              title="Bracket HUD preview"
              src={`${status?.hudPreviewBase || "http://localhost:5300"}/overlays/bracket.html?match=${encodeURIComponent(status?.show?.matchCode || "MAIN")}`}
            />
            <p>
              Add the Bracket screen in your broadcast screens before sending to
              OBS. Preview updates do not switch the on-air scene.
            </p>
          </>
        )}
      </main>
    </AirShell>
  );
}
