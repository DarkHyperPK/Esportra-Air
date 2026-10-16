import React, { useEffect, useState } from "react";
import AirShell from "./air/AirShell.jsx";
import TemplatePreview from "./TemplatePreview.jsx";
import ScreenLibrary from "./ScreenLibrary.jsx";
import AirIcon from "./air/AirIcon.jsx";
import { PageHead, useWorkspace } from "../workspace.jsx";
const api = window.esportraBroadcast?.obs;
const NAV = [
  { id: "readiness", label: "Match setup" },
  { id: "template", label: "Customize broadcast" },
  { id: "producer", label: "Live controls" },
  { id: "outputs", label: "Advanced sources" },
];
const DESIGNS = {
  ingame: "Match HUD",
  holding: "Break screen",
  casters: "Talent cameras",
  series: "Series results",
  scoreboard: "Full scoreboard",
  sponsor: "Sponsor",
  "starting-soon": "Opening",
  "match-intro": "Match introduction",
};
export default function TemplateSetup({ status, onScreenChange, onChanged }) {
  const { screenDrafts } = useWorkspace();
  const cacheKey = (context) =>
    `${context.source || "esportra"}:${context.showId}:${context.matchId}:${context.nodeId}`;
  const [data, setData] = useState(null),
    [draft, setDraft] = useState(null),
    [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [operation, setOperation] = useState("");
  const [library, setLibrary] = useState(false);
  function addScreens(rows) {
    if (!draft || draft.items.length + rows.length > 50) return;
    const names = new Set(draft.items.map((item) => item.title));
    const added = rows.map((row) => {
      let title = row.title,
        index = 2;
      while (names.has(title)) title = `${row.title} (${index++})`;
      names.add(title);
      return {
        id: `air_${crypto.randomUUID()}`,
        title,
        overlay: row.overlay,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        background: "",
      };
    });
    setSelected(draft.items.length);
    setDraft({ ...draft, items: [...draft.items, ...added] });
    setData({ ...data, prepared: false });
    setNotice(
      `${added.length} ${added.length === 1 ? "screen added" : "screens added"} to your draft. Customize before sending to OBS.`,
    );
    setLibrary(false);
  }
  async function reload(discardLocal = false) {
    setLibrary(false);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.getTemplate();
      if (!result.ok) throw new Error(result.error);
      const cached =
        !discardLocal &&
        screenDrafts.current.get(cacheKey(result.draft.context));
      setData({
        ...result,
        prepared: cached?.dirty ? false : result.prepared,
        savedDraft: JSON.stringify(result.draft),
      });
      if (cached?.dirty) {
        setDraft(cached.draft);
        setSelected(
          Math.min(cached.selected, Math.max(0, cached.draft.items.length - 1)),
        );
        if (
          cached.draft.context.planVersion !==
            result.draft.context.planVersion ||
          cached.draft.revision !== result.draft.revision
        )
          setError(
            "Your local draft is preserved, but the saved match setup changed. Reload the match template to use the latest saved version.",
          );
      } else {
        setDraft(result.draft);
        setSelected(0);
      }
    } catch (failure) {
      setError(failure.message || "Could not load the match template.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setDraft(null);
    void reload();
  }, [status?.show?.id, status?.show?.matchCode]);
  useEffect(() => {
    if (!draft) return;
    screenDrafts.current.set(cacheKey(draft.context), {
      draft,
      selected,
      dirty: JSON.stringify(draft) !== data?.savedDraft,
    });
  }, [draft, selected, data?.savedDraft]);
  async function perform(push) {
    setOperation(push ? "send" : "save");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await (push
        ? api.pushTemplate(draft)
        : api.saveTemplate(draft));
      if (!result.ok) throw new Error(result.error);
      setDraft(result.draft);
      setData((previous) => ({
        ...previous,
        prepared: result.prepared,
        savedDraft: JSON.stringify(result.draft),
        sentScenes: result.scenes || [],
      }));
      setNotice(
        push
          ? "Screens sent to OBS. Open OBS controls to run your broadcast screens. Start streaming in OBS when ready."
          : "Draft saved in Air. OBS has not been changed.",
      );
      onChanged?.();
    } catch (failure) {
      setError(failure.message || "Could not save this template.");
    } finally {
      setBusy(false);
      setOperation("");
    }
  }
  const item = draft?.items[selected];
  function change(values) {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.map((row, index) =>
        index === selected ? { ...row, ...values } : row,
      ),
    }));
    setNotice("");
    setData((previous) => ({ ...previous, prepared: false }));
  }
  function remove() {
    const items = draft.items.filter((_, index) => index !== selected);
    setDraft({ ...draft, items });
    setSelected(Math.max(0, selected - 1));
    setData((previous) => ({ ...previous, prepared: false }));
  }
  function move(direction) {
    const next = selected + direction;
    if (next < 0 || next >= draft.items.length) return;
    const items = [...draft.items];
    [items[selected], items[next]] = [items[next], items[selected]];
    setDraft({ ...draft, items });
    setSelected(next);
    setData((previous) => ({ ...previous, prepared: false }));
  }
  async function refreshInputs() {
    setBusy(true);
    setError("");
    try {
      const result = await api.getTemplate();
      if (!result.ok) throw new Error(result.error);
      setData((previous) => ({
        ...previous,
        inputs: result.inputs,
        inputError: result.inputError,
        obsConnected: result.obsConnected,
      }));
    } catch (failure) {
      setError(failure.message || "Could not refresh OBS inputs.");
    } finally {
      setBusy(false);
    }
  }
  const connected = status?.health?.obsConnection
    ? status.health.obsConnection.state === "healthy"
    : data?.obsConnected;
  const changed =
    !!status?.obsTemplate?.planVersion &&
    draft?.context.planVersion !== status.obsTemplate.planVersion;
  const active = status?.runner?.activeSegment;
  const label =
    status?.show?.matches?.find(
      (match) => match.matchCode === status.show.matchCode,
    )?.label || status?.show?.title;
  return (
    <AirShell
      screenTitle="Broadcast screens"
      show={status?.show}
      nodeName={status?.nodeName}
      nav={NAV}
      activeTab="template"
      onTabChange={onScreenChange}
    >
      <main className="air-content template-workspace">
        <PageHead
          eyebrow="MATCH PREPARATION"
          title="Broadcast screens"
          action={
            <div className="template-header-actions">
              <button
                className="air-ghost-btn"
                onClick={() => onScreenChange("hud")}
              >
                HUD controls
              </button>
              <button
                className="air-ghost-btn"
                onClick={() => onScreenChange("bracket")}
              >
                Bracket graphics
              </button>
            </div>
          }
        >
          Customize {label || "your match"} before sending screens to OBS.
        </PageHead>
        {error && (
          <p role="alert" className="broadcast-error">
            {error}{" "}
            <button
              className="air-ghost-btn"
              disabled={busy}
              onClick={() => reload(true)}
            >
              Reload match template
            </button>
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {draft && (
          <div className="template-delivery-state" role="status">
            <span>
              {JSON.stringify(draft) !== data?.savedDraft
                ? "Unsaved local changes"
                : data?.prepared
                  ? "Sent to OBS"
                  : "Draft · not sent to OBS"}
            </span>
            <small>
              Adding a template updates this draft. Choose Send to OBS below to
              create its scenes.
            </small>
          </div>
        )}
        {changed && (
          <p role="alert">
            The match setup changed on the web. Your edits remain here. Reload
            the latest match template before saving or sending; reloading
            replaces these edits.
          </p>
        )}
        {busy && !draft && <p role="status">Loading your match screens…</p>}
        {draft?.items.length === 0 && (
          <p>
            No screens yet. Choose Add screen below, then select a template or
            individual screen.
          </p>
        )}
        <div className="screen-library-entry">
          <span>
            {draft?.items.length || 0} / 50 broadcast screens · customize before
            Send to OBS
          </span>
          <button
            className="air-ghost-btn"
            disabled={busy || !draft || draft.items.length >= 50}
            onClick={() => setLibrary(true)}
          >
            <AirIcon name="plus" size={15} />
            Add screen
          </button>
        </div>
        {library && (
          <ScreenLibrary
            overlays={data.overlays}
            teams={data.teams || []}
            matchCode={draft.context.matchCode}
            previewBase={data.previewBase}
            hudSettings={data.hudSettings}
            remaining={50 - draft.items.length}
            onAdd={addScreens}
            onClose={() => setLibrary(false)}
          />
        )}
        {item && (
          <div className="template-workspace-columns">
            <aside
              aria-label="Broadcast screen order"
              className="template-screen-list"
            >
              <h2>Screen order</h2>
              <p>What viewers see, in sequence.</p>
              <ol>
                {draft.items.map((row, index) => (
                  <li key={row.id}>
                    <button
                      className={index === selected ? "selected" : ""}
                      aria-current={index === selected ? "step" : undefined}
                      onClick={() => setSelected(index)}
                    >
                      {index + 1}. {row.title}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="product-actions">
                <button
                  className="air-ghost-btn"
                  disabled={busy || !draft.items.length}
                  onClick={remove}
                >
                  Remove screen
                </button>
                <button
                  className="air-ghost-btn"
                  disabled={busy || selected === 0}
                  onClick={() => move(-1)}
                >
                  Move earlier
                </button>
                <button
                  className="air-ghost-btn"
                  disabled={busy || selected === draft.items.length - 1}
                  onClick={() => move(1)}
                >
                  Move later
                </button>
              </div>
            </aside>
            <section
              className="template-screen-editor"
              aria-label="Customize selected screen"
            >
              <TemplatePreview
                teams={data.teams || []}
                item={item}
                matchCode={draft.context.matchCode}
                previewBase={data.previewBase}
                hudSettings={data.hudSettings}
                disabled={busy}
                onMove={(x, y) => change({ x, y })}
              />
            </section>
            <aside className="template-inspector" aria-label="Screen settings">
              <h2>Screen settings</h2>
              <div className="template-screen-fields">
                <label>
                  Screen name
                  <input
                    className="product-input"
                    maxLength={80}
                    value={item.title}
                    disabled={busy}
                    onChange={(event) => change({ title: event.target.value })}
                  />
                </label>
                <label>
                  Screen design
                  <select
                    className="product-input"
                    aria-label="Screen design"
                    value={item.overlay}
                    disabled={busy}
                    onChange={(event) =>
                      change({ overlay: event.target.value })
                    }
                  >
                    {data.overlays.map((overlay) => (
                      <option key={overlay} value={overlay}>
                        {DESIGNS[overlay] || overlay.replaceAll("-", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Game video or camera
                  <select
                    className="product-input"
                    aria-label="Game video or camera"
                    value={item.background}
                    disabled={busy || !connected}
                    onChange={(event) =>
                      change({ background: event.target.value })
                    }
                  >
                    <option value="">Graphics only</option>
                    {data.inputs.map((input) => (
                      <option key={input.name} value={input.name}>
                        {input.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="template-input-help">
                    Choose an existing OBS game, video or camera input. Air adds
                    it behind this HUD automatically.
                  </p>
                  {connected && (
                    <button
                      className="air-ghost-btn"
                      disabled={busy}
                      onClick={refreshInputs}
                    >
                      Refresh video inputs
                    </button>
                  )}
                  {item.overlay === "ingame" && !item.background && (
                    <p role="status">
                      Choose game video for this Map screen before broadcasting.
                      Game event capture supplies data, not video.
                    </p>
                  )}
                  {data.inputError && <p role="alert">{data.inputError}</p>}
                </div>
              </div>
              <details className="production-advanced">
                <summary>HUD size and position</summary>
                <div className="template-layout-fields">
                  {[
                    ["x", "Horizontal position", 1920],
                    ["y", "Vertical position", 1080],
                    ["width", "Width", 1920],
                    ["height", "Height", 1080],
                  ].map(([field, title, max]) => (
                    <label key={field}>
                      {title}
                      <input
                        className="product-input"
                        type="number"
                        min={field === "width" || field === "height" ? 1 : 0}
                        max={max}
                        value={item[field]}
                        disabled={busy}
                        onChange={(event) =>
                          change({ [field]: Number(event.target.value) })
                        }
                      />
                    </label>
                  ))}
                  <button
                    className="air-ghost-btn"
                    disabled={busy}
                    onClick={() =>
                      change({ x: 0, y: 0, width: 1920, height: 1080 })
                    }
                  >
                    Fit full screen
                  </button>
                </div>
              </details>
              <details className="production-advanced">
                <summary>Scene transitions</summary>
                <p className="template-input-help">
                  New broadcasts use Fade, 300 ms. OBS needs Studio Mode and its
                  Fade transition. Choose Cut, Fade or an installed Stinger in
                  OBS controls. Existing transitions are preserved; changes are
                  confirmed by OBS.
                </p>
              </details>
            </aside>
          </div>
        )}
        {data?.available?.some(
          (row) => !draft?.items.some((item) => item.id === row.id),
        ) && (
          <label>
            Restore a screen
            <select
              value=""
              onChange={(event) => {
                const row = data.available.find(
                  (row) => row.id === event.target.value,
                );
                if (row) {
                  setDraft({ ...draft, items: [...draft.items, row] });
                  setData({ ...data, prepared: false });
                }
              }}
            >
              <option value="">Choose a removed screen</option>
              {data.available
                .filter(
                  (row) => !draft.items.some((item) => item.id === row.id),
                )
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        <footer className="template-next-action">
          <div>
            <strong>
              {data?.prepared
                ? "Screens are in OBS"
                : connected
                  ? "Ready to send your screens"
                  : "Connect OBS to send your screens"}
            </strong>
            <p>
              {active
                ? "Stop the broadcast before changing its OBS screens."
                : "Sending creates the scenes and sources in your current OBS scene collection. OBS keeps its current on-air scene."}
            </p>
            {active && (
              <button
                className="air-text-btn"
                onClick={() => onScreenChange("producer")}
              >
                Open OBS controls to stop the Air session
              </button>
            )}
            {data?.sentScenes?.length > 0 && (
              <small>
                {data.sentScenes.length} scenes created or updated. In OBS, look
                for names beginning with “Air ·”.
              </small>
            )}
          </div>
          <div className="product-actions">
            <button
              className="air-ghost-btn"
              disabled={busy || !item || changed}
              onClick={() => perform(false)}
            >
              {operation === "save" ? "Saving draft…" : "Save draft"}
            </button>
            {connected ? (
              <button
                className={data?.prepared ? "air-ghost-btn" : "air-primary-btn"}
                disabled={busy || !item || changed || !!active}
                onClick={() => perform(true)}
              >
                {operation === "send" ? "Sending…" : "Send to OBS"}
              </button>
            ) : (
              <button
                className="air-primary-btn"
                onClick={() => onScreenChange("connections")}
              >
                Connect OBS
              </button>
            )}
            {data?.prepared && (
              <button
                className="air-primary-btn"
                onClick={() => onScreenChange("producer")}
              >
                Open OBS controls
              </button>
            )}
          </div>
        </footer>
      </main>
    </AirShell>
  );
}
