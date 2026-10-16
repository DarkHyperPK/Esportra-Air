import React, { useState } from "react";
import { useWorkspace } from "../workspace.jsx";
import HudFrame from "./HudFrame.jsx";

export default function ProjectProductionEditor({
  project,
  busy,
  onSave,
  onLogo,
}) {
  const { status } = useWorkspace();
  const [kind, setKind] = useState("sponsors"),
    [name, setName] = useState(""),
    [role, setRole] = useState("Commentator"),
    [logo, setLogo] = useState(null),
    [preview, setPreview] = useState(null);
  const document = project.document,
    catalogue = status.outputCatalogue || [];
  const options = Array.isArray(catalogue)
    ? catalogue
    : Object.values(catalogue);
  const change = (field, rows) => onSave({ ...document, [field]: rows });
  return (
    <>
      <section className="workspace-section">
        <h2>Project broadcast screens</h2>
        <p>
          Choose the screens viewers see and their order. Customize the selected
          match before sending anything to OBS.
        </p>
        <h3>Templates</h3>
        <p>Ready-made screen sets. Preview the opening, then add the set.</p>
        <div className="product-actions">
          <button
            className="air-ghost-btn"
            onClick={() => setPreview("starting-soon")}
          >
            Preview match essentials
          </button>
          <button
            className="air-ghost-btn"
            disabled={busy}
            onClick={() =>
              change("screens", [
                ...document.screens,
                ...[
                  ["Opening", "pre_show", "starting-soon"],
                  ["Match Introduction", "pre_show", "match-intro"],
                  ["Map", "match", "ingame"],
                  ["Break", "break", "brb"],
                  ["Results", "post_show", "map-result"],
                ].map(([title, type, overlay]) => ({
                  id: crypto.randomUUID(),
                  title,
                  type,
                  overlay,
                  matchId: null,
                })),
              ])
            }
          >
            Add match essentials
          </button>
        </div>
        <h3>Individual screens</h3>
        {(document.screens || []).map((screen, index) => (
          <div className="product-data-row" key={screen.id}>
            <strong>{screen.title}</strong>
            <span>{screen.overlay}</span>
            <div className="product-actions">
              <button
                className="air-ghost-btn"
                disabled={busy || !index}
                onClick={() => {
                  const rows = [...document.screens];
                  [rows[index - 1], rows[index]] = [
                    rows[index],
                    rows[index - 1],
                  ];
                  void change("screens", rows);
                }}
              >
                Move up
              </button>
              <button
                className="air-ghost-btn"
                onClick={() => setPreview(screen.overlay)}
              >
                Preview
              </button>
              <button
                className="air-ghost-btn"
                disabled={busy}
                onClick={() =>
                  change(
                    "screens",
                    document.screens.filter((row) => row.id !== screen.id),
                  )
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="workspace-toolbar">
          <label>
            Add an individual screen
            <select
              defaultValue=""
              disabled={busy}
              onChange={(event) => {
                if (!event.target.value) return;
                const overlay = event.target.value,
                  item = options.find(
                    (row) => (row.name || row.id || row.overlay) === overlay,
                  );
                void change("screens", [
                  ...document.screens,
                  {
                    id: crypto.randomUUID(),
                    title: item?.name || item?.title || overlay,
                    type: "custom",
                    overlay,
                    matchId: null,
                  },
                ]);
                event.target.value = "";
              }}
            >
              <option value="">Choose a screen</option>
              {options
                .filter((row) => row.name || row.id || row.overlay)
                .map((row) => (
                  <option
                    key={row.name || row.id || row.overlay}
                    value={row.name || row.id || row.overlay}
                  >
                    {row.title || row.name || row.id || row.overlay}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="air-ghost-btn"
            disabled={busy}
            onClick={() =>
              change("screens", [
                ...document.screens,
                {
                  id: crypto.randomUUID(),
                  title: "Tournament bracket",
                  type: "custom",
                  overlay: "bracket",
                  matchId: null,
                },
              ])
            }
          >
            Add bracket screen
          </button>
        </div>
        {preview && (
          <div>
            <div className="workspace-toolbar">
              <p>Preview only · OBS is unchanged</p>
              <button
                className="air-ghost-btn"
                onClick={() => setPreview(null)}
              >
                Close preview
              </button>
            </div>
            <HudFrame
              title="Project screen preview"
              src={`http://localhost:5300/overlays/${encodeURIComponent(preview)}.html?preview=1`}
            />
          </div>
        )}
      </section>
      <section className="workspace-section">
        <h2>
          Sponsors, talent & crew <small>Optional</small>
        </h2>
        <p>
          These details belong to this project. Add only the people and brands
          involved in your broadcast.
        </p>
        <div className="workspace-toolbar">
          {[
            ["sponsors", "Sponsors"],
            ["talent", "Talent"],
            ["crew", "Crew"],
          ].map(([value, label]) => (
            <button
              className="air-ghost-btn"
              aria-pressed={kind === value}
              key={value}
              onClick={() => {
                setKind(value);
                setRole(value === "crew" ? "Producer" : "Commentator");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {(document[kind] || []).map((row) => (
          <div className="product-data-row" key={row.id}>
            <strong>{row.name}</strong>
            <span>
              {row.role || (row.logoAssetId ? "Logo ready" : "No logo")}
            </span>
            <button
              className="air-ghost-btn"
              disabled={busy}
              onClick={() =>
                change(
                  kind,
                  document[kind].filter((item) => item.id !== row.id),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <form
          className="workspace-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await change(kind, [
              ...(document[kind] || []),
              {
                id: crypto.randomUUID(),
                name: name.trim(),
                ...(kind === "sponsors" ? { logoAssetId: logo } : { role }),
              },
            ]);
            if (result?.ok) {
              setName("");
              setLogo(null);
            }
          }}
        >
          <label>
            Name
            <input
              required
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {kind !== "sponsors" ? (
            <label>
              Responsibility
              <input
                required
                maxLength={80}
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            </label>
          ) : (
            <div className="product-actions">
              <button
                type="button"
                className="air-ghost-btn"
                disabled={busy}
                onClick={async () => {
                  const asset = await onLogo();
                  if (asset) setLogo(asset.id);
                }}
              >
                Choose sponsor logo
              </button>
              {logo && <span>Logo selected</span>}
            </div>
          )}
          <div className="product-actions full">
            <button className="air-primary-btn" disabled={busy}>
              Add{" "}
              {kind === "sponsors"
                ? "sponsor"
                : kind === "talent"
                  ? "talent"
                  : "crew member"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
