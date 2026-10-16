import React, { useEffect, useState } from "react";
const FORMATS = [
  ["single_elimination", "Single elimination"],
  ["double_elimination", "Double elimination"],
  ["groups", "Group stage"],
  ["round_robin", "Round robin"],
  ["swiss", "Swiss"],
  ["manual", "Manual match board"],
];
export default function ProjectBracketEditor({ project, busy, onSave }) {
  const [bracket, setBracket] = useState(project.document.bracket),
    [selected, setSelected] = useState(0),
    [label, setLabel] = useState("Playoffs"),
    [format, setFormat] = useState("single_elimination"),
    [pending, setPending] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    setBracket(project.document.bracket);
  }, [project.id, project.localVersion]);
  const stage = bracket.stages[selected];
  function changeNode(id, values) {
    setBracket({
      ...bracket,
      stages: bracket.stages.map((s, index) =>
        index === selected
          ? {
              ...s,
              matches: s.matches.map((node) =>
                node.id === id ? { ...node, ...values } : node,
              ),
            }
          : s,
      ),
    });
  }
  async function importFile(file) {
    setError("");
    if (!file) return;
    try {
      if (file.size > 2097152)
        throw new Error("Import a project JSON under 2 MB.");
      const value = JSON.parse(await file.text());
      const document = value.document || value;
      if (
        document.schemaVersion !== 1 ||
        !Array.isArray(document.matches) ||
        !Array.isArray(document.teams) ||
        !document.bracket
      )
        throw new Error("Choose a version 1 Air project JSON.");
      setPending(document);
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <section className="workspace-section">
      <h2>Bracket graphics</h2>
      <p>
        Arrange matches for broadcast. Air shows your supplied results; it does
        not generate a tournament or advance winners.
      </p>
      {error && (
        <p role="alert" className="broadcast-error">
          {error}
        </p>
      )}
      <div className="workspace-form">
        <label>
          Stage name
          <input
            value={label}
            maxLength={100}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          Presentation format
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            {FORMATS.map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <div className="product-actions full">
          <button
            className="air-ghost-btn"
            disabled={busy || !label.trim()}
            onClick={() => {
              setBracket({
                ...bracket,
                format,
                stages: [
                  ...bracket.stages,
                  { id: crypto.randomUUID(), label, format, matches: [] },
                ],
              });
              setSelected(bracket.stages.length);
            }}
          >
            Add stage
          </button>
          <label>
            Import teams, matches and bracket JSON
            <input
              aria-label="Import Air project JSON"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void importFile(event.target.files[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {pending && (
        <section
          role="dialog"
          aria-label="Review project import"
          className="inline-notice"
        >
          <h3>Review project import</h3>
          <p>
            This replaces the project's teams, matches, screens and bracket with{" "}
            {pending.teams.length} teams and {pending.matches.length} matches.
            Existing cloud data changes only after sync.
          </p>
          <div className="product-actions">
            <button
              className="air-primary-btn"
              disabled={busy}
              onClick={async () => {
                const result = await onSave(pending);
                if (result?.ok) setPending(null);
              }}
            >
              Import this project
            </button>
            <button className="air-ghost-btn" onClick={() => setPending(null)}>
              Cancel import
            </button>
          </div>
        </section>
      )}
      {bracket.stages.length > 0 && (
        <>
          <div className="workspace-toolbar">
            <label>
              Stage
              <select
                value={selected}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {bracket.stages.map((s, index) => (
                  <option key={s.id} value={index}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="air-ghost-btn"
              disabled={busy}
              onClick={() => {
                setBracket({
                  ...bracket,
                  stages: bracket.stages.filter(
                    (_, index) => index !== selected,
                  ),
                });
                setSelected(0);
              }}
            >
              Remove stage
            </button>
          </div>
          {stage && (
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Round</th>
                  <th>Section</th>
                  <th>Feeds into</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {project.document.matches.map((match) => {
                  const node = stage.matches.find(
                    (node) => node.matchId === match.id,
                  );
                  return (
                    <tr key={match.id}>
                      <td>{match.title}</td>
                      {node ? (
                        <>
                          <td>
                            <input
                              aria-label={`Round for ${match.title}`}
                              type="number"
                              min="0"
                              max="32"
                              value={node.round}
                              onChange={(event) =>
                                changeNode(node.id, {
                                  round: Number(event.target.value),
                                })
                              }
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Section for ${match.title}`}
                              value={node.side}
                              onChange={(event) =>
                                changeNode(node.id, {
                                  side: event.target.value,
                                })
                              }
                            >
                              {["upper", "lower", "final", "group"].map(
                                (side) => (
                                  <option key={side}>{side}</option>
                                ),
                              )}
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label={`Next match for ${match.title}`}
                              value={node.nextMatchId || ""}
                              onChange={(event) =>
                                changeNode(node.id, {
                                  nextMatchId: event.target.value || null,
                                })
                              }
                            >
                              <option value="">No next match</option>
                              {project.document.matches
                                .filter((m) => m.id !== match.id)
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.title}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td>
                            <button
                              className="air-ghost-btn"
                              onClick={() =>
                                setBracket({
                                  ...bracket,
                                  stages: bracket.stages.map((s, index) =>
                                    index === selected
                                      ? {
                                          ...s,
                                          matches: s.matches.filter(
                                            (n) => n.id !== node.id,
                                          ),
                                        }
                                      : s,
                                  ),
                                })
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </>
                      ) : (
                        <td colSpan="4">
                          <button
                            className="air-ghost-btn"
                            onClick={() =>
                              setBracket({
                                ...bracket,
                                stages: bracket.stages.map((s, index) =>
                                  index === selected
                                    ? {
                                        ...s,
                                        matches: [
                                          ...s.matches,
                                          {
                                            id: crypto.randomUUID(),
                                            matchId: match.id,
                                            round: 0,
                                            side:
                                              stage.format === "groups" ||
                                              stage.format === "swiss" ||
                                              stage.format === "round_robin"
                                                ? "group"
                                                : "upper",
                                            nextMatchId: null,
                                          },
                                        ],
                                      }
                                    : s,
                                ),
                              })
                            }
                          >
                            Include match
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="product-actions">
            <button
              className="air-primary-btn"
              disabled={busy}
              onClick={() => onSave({ ...project.document, bracket })}
            >
              Save bracket layout
            </button>
          </div>
        </>
      )}
    </section>
  );
}
