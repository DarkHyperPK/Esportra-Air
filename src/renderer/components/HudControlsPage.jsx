import React, { useEffect, useState } from "react";
import AirShell from "./air/AirShell.jsx";
import { PageHead, useWorkspace } from "../workspace.jsx";
import TemplatePreview from "./TemplatePreview.jsx";
const api = window.esportraBroadcast?.hudControls;
const LAYERS = {
  scorebug: "Team scores & round timer",
  players: "Player cards",
  killfeed: "Kill feed",
  observed: "Observed player",
  minimap: "Minimap frame",
  economy: "Economy",
  scoreboard: "Full scoreboard",
  lowerThird: "Lower third",
  replay: "Replay label",
  ticker: "Ticker",
  roundHistory: "Round history",
  winProb: "Win probability",
  spikeTimer: "Spike timer",
  moments: "Round moments",
  sponsor: "Sponsors",
  eventBug: "Event branding",
  poll: "Poll",
  duel: "Player duel",
  teamCompare: "Team comparison",
  roundRecap: "Round recap",
  playerCams: "Player cameras",
};

export default function HudControlsPage() {
  const { status, navigate } = useWorkspace();
  const [data, setData] = useState(null),
    [draft, setDraft] = useState(null),
    [tab, setTab] = useState("layers"),
    [overlay, setOverlay] = useState("ingame"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [previewSource, setPreviewSource] = useState("draft");
  const [banner, setBanner] = useState({
      type: "ace",
      team: 0,
      player: 0,
      headline: "",
      subline: "",
      clutchSize: 2,
    }),
    [updateText, setUpdateText] = useState("");
  async function load() {
    try {
      const result = await api.get();
      if (!result.ok) throw new Error(result.error);
      setData(result);
      setDraft(result.draft);
    } catch (failure) {
      setError(failure.message);
    }
  }
  useEffect(() => {
    setData(null);
    setDraft(null);
    setError("");
    setPreviewSource("draft");
    void load();
  }, [status?.show?.id, status?.show?.matchCode]);
  async function action(kind, graphic) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.update({
        context: data.context,
        action: kind,
        settings: draft,
        graphic,
      });
      if (!result.ok) throw new Error(result.error);
      setData(result);
      if (kind !== "save") {
        setPreviewSource("live");
        if (kind.startsWith("countdown")) setOverlay("starting-soon");
        else if (kind === "graphic")
          setOverlay(graphic?.kind === "toast" ? "toast" : "banners");
      }
      if (kind === "save" || kind === "apply") setDraft(result.draft);
      setNotice(
        kind === "save"
          ? "HUD draft saved. The live HUD is unchanged. Send to OBS applies it with your screens."
          : kind === "apply"
            ? "HUD settings applied to this match’s live outputs."
            : kind === "graphic"
              ? "Graphic updated on this match’s live HUD."
              : "Countdown updated on the live HUD.",
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  function change(values) {
    setPreviewSource("draft");
    setDraft((previous) => ({ ...previous, ...values }));
    setNotice("");
  }
  const previewItem = {
    id: "hud-control-preview",
    overlay,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    background: "",
  };
  return (
    <AirShell screenTitle="HUD controls">
      <main className="workspace-page hud-controls-page">
        <PageHead
          eyebrow="MATCH GRAPHICS"
          title="HUD controls"
          action={
            <button
              className="air-ghost-btn"
              onClick={() => navigate("template")}
            >
              Back to broadcast screens
            </button>
          }
        >
          Control the HUD’s layers, banners and screen content for the selected
          match.
        </PageHead>
        {error && (
          <p className="broadcast-error" role="alert">
            {error}
            <button className="air-ghost-btn" onClick={load}>
              Retry HUD controls
            </button>
          </p>
        )}
        {notice && (
          <p className="inline-notice" role="status">
            {notice}
          </p>
        )}
        {!draft ? (
          <p role="status">
            {error
              ? "Choose a match and check the local HUD connection."
              : "Loading HUD settings…"}
          </p>
        ) : (
          <>
            <div className="hud-controls-layout">
              <section>
                <div
                  className="workspace-tabs"
                  role="tablist"
                  aria-label="HUD control section"
                >
                  {[
                    ["layers", "Layers & appearance"],
                    ["content", "Screen content"],
                    ["graphics", "Live graphics"],
                    ["match", "Match data"],
                  ].map(([value, label]) => (
                    <button
                      role="tab"
                      key={value}
                      aria-selected={tab === value}
                      onClick={() => setTab(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tab === "layers" && (
                  <>
                    <section className="workspace-section">
                      <h2>Visible HUD layers</h2>
                      <p>
                        These switches control the combined Match HUD. Dedicated
                        screens stay visible when selected. Preview changes,
                        then save your draft before sending to OBS.
                      </p>
                      <div className="hud-layer-options">
                        {Object.entries(LAYERS).map(([key, label]) =>
                          ["economy", "roundRecap"].includes(key) ? (
                            <label className="hud-layer-mode" key={key}>
                              <span>{label}</span>
                              <select
                                aria-label={`${label} visibility`}
                                value={String(draft.layers[key] ?? false)}
                                disabled={busy}
                                onChange={(event) =>
                                  change({
                                    layers: {
                                      ...draft.layers,
                                      [key]:
                                        event.target.value === "auto"
                                          ? "auto"
                                          : event.target.value === "true",
                                    },
                                  })
                                }
                              >
                                <option value="false">Off</option>
                                <option value="auto">Automatic</option>
                                <option value="true">Always on</option>
                              </select>
                            </label>
                          ) : (
                            <label key={key}>
                              <input
                                type="checkbox"
                                checked={draft.layers[key] === true}
                                disabled={busy}
                                onChange={(event) =>
                                  change({
                                    layers: {
                                      ...draft.layers,
                                      [key]: event.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>{label}</span>
                            </label>
                          ),
                        )}
                      </div>
                    </section>
                    <section className="workspace-section">
                      <h2>Banner appearance</h2>
                      <label>
                        Banner style
                        <select
                          aria-label="HUD banner style"
                          value={draft.bannerTheme}
                          onChange={(event) =>
                            change({ bannerTheme: event.target.value })
                          }
                        >
                          {[
                            ["broadcast", "Broadcast"],
                            ["compact", "Velocity"],
                            ["monument", "Monument"],
                            ["impact", "Impact"],
                          ].map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </section>
                  </>
                )}
                {tab === "content" && (
                  <>
                    <section className="workspace-section">
                      <h2>Opening & break countdown</h2>
                      <div className="workspace-form">
                        <label>
                          Countdown length (minutes)
                          <input
                            type="number"
                            min="1"
                            max="180"
                            value={draft.holding.minutes}
                            onChange={(event) =>
                              change({
                                holding: {
                                  ...draft.holding,
                                  minutes: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Screen message
                          <input
                            maxLength={180}
                            value={draft.holding.message}
                            onChange={(event) =>
                              change({
                                holding: {
                                  ...draft.holding,
                                  message: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                      <p>
                        Starting applies the length and message above to the
                        live countdown.
                      </p>
                      <div className="product-actions">
                        <button
                          className="air-ghost-btn"
                          disabled={busy}
                          onClick={() => action("countdown-start")}
                        >
                          Start live countdown
                        </button>
                        <button
                          className="air-ghost-btn"
                          disabled={busy}
                          onClick={() => action("countdown-stop")}
                        >
                          Stop live countdown
                        </button>
                        <button
                          className="air-text-btn"
                          onClick={() => setOverlay("starting-soon")}
                        >
                          Preview Opening
                        </button>
                      </div>
                    </section>
                    <section className="workspace-section">
                      <h2>Lower third</h2>
                      <div className="workspace-form">
                        <label>
                          Headline
                          <input
                            maxLength={100}
                            value={draft.lowerThird.title}
                            onChange={(event) =>
                              change({
                                lowerThird: {
                                  ...draft.lowerThird,
                                  title: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Subtitle
                          <input
                            maxLength={160}
                            value={draft.lowerThird.sub}
                            onChange={(event) =>
                              change({
                                lowerThird: {
                                  ...draft.lowerThird,
                                  sub: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                      <p>
                        Enable Lower third in Layers & appearance to show it.
                      </p>
                    </section>
                    <section className="workspace-section">
                      <h2>Ticker</h2>
                      <label>
                        One message per line (up to 10)
                        <textarea
                          rows={5}
                          value={draft.ticker.join("\n")}
                          onChange={(event) =>
                            change({ ticker: event.target.value.split("\n") })
                          }
                        />
                      </label>
                    </section>
                  </>
                )}
                {tab === "graphics" && (
                  <section className="workspace-section">
                    <h2>Live graphic actions</h2>
                    <p>
                      These actions update the selected match’s live HUD
                      immediately. They do not switch the OBS scene.
                    </p>
                    <div className="workspace-form">
                      <label>
                        Banner
                        <select
                          aria-label="Live banner type"
                          value={banner.type}
                          onChange={(event) =>
                            setBanner({ ...banner, type: event.target.value })
                          }
                        >
                          {[
                            ["ace", "Ace"],
                            ["teamace", "Team ace"],
                            ["clutch", "Clutch"],
                            ["flawless", "Flawless"],
                            ["thrifty", "Thrifty"],
                            ["matchpoint", "Match point"],
                            ["overtime", "Overtime"],
                            ["custom", "Custom announcement"],
                          ].map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Team
                        <select
                          value={banner.team}
                          onChange={(event) =>
                            setBanner({
                              ...banner,
                              team: Number(event.target.value),
                            })
                          }
                        >
                          {[0, 1].map((index) => (
                            <option key={index} value={index}>
                              {status?.show?.teams?.[index]?.name ||
                                `Team ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Player slot
                        <select
                          value={banner.player}
                          onChange={(event) =>
                            setBanner({
                              ...banner,
                              player: Number(event.target.value),
                            })
                          }
                        >
                          {[0, 1, 2, 3, 4].map((index) => (
                            <option key={index} value={index}>
                              {index + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                      {banner.type === "clutch" && (
                        <label>
                          Clutch against
                          <select
                            value={banner.clutchSize}
                            onChange={(event) =>
                              setBanner({
                                ...banner,
                                clutchSize: Number(event.target.value),
                              })
                            }
                          >
                            {[2, 3, 4, 5].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {banner.type === "custom" && (
                        <>
                          <label>
                            Headline
                            <input
                              maxLength={100}
                              value={banner.headline}
                              onChange={(event) =>
                                setBanner({
                                  ...banner,
                                  headline: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Subline
                            <input
                              maxLength={160}
                              value={banner.subline}
                              onChange={(event) =>
                                setBanner({
                                  ...banner,
                                  subline: event.target.value,
                                })
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <div className="product-actions">
                      <button
                        className="air-ghost-btn"
                        disabled={busy}
                        onClick={() =>
                          action("graphic", { kind: "banner", input: banner })
                        }
                      >
                        Show banner on live HUD
                      </button>
                      <button
                        className="air-ghost-btn"
                        disabled={busy}
                        onClick={() =>
                          action("graphic", { kind: "hide-banner" })
                        }
                      >
                        Hide live banner
                      </button>
                      <button
                        className="air-text-btn"
                        onClick={() => setOverlay("banners")}
                      >
                        Preview Banners screen
                      </button>
                    </div>
                    <h3 className="hud-inline-heading">
                      Short on-screen update
                    </h3>
                    <label>
                      Message
                      <input
                        maxLength={180}
                        value={updateText}
                        onChange={(event) => setUpdateText(event.target.value)}
                      />
                    </label>
                    <button
                      className="air-ghost-btn"
                      disabled={busy || !updateText.trim()}
                      onClick={() =>
                        action("graphic", {
                          kind: "toast",
                          input: { text: updateText },
                        })
                      }
                    >
                      Show update on live HUD
                    </button>
                  </section>
                )}
                {tab === "match" && (
                  <section className="workspace-section">
                    <h2>Match data & player names</h2>
                    <p>
                      Game capture supplies scores and player status. HUD name
                      edits preserve original identities; on-air corrections
                      keep official tournament results unchanged.
                    </p>
                    <div className="product-actions">
                      <button
                        className="air-ghost-btn"
                        onClick={() => navigate("players")}
                      >
                        Edit HUD nicknames
                      </button>
                      <button
                        className="air-ghost-btn"
                        onClick={() => navigate("data-fixes")}
                      >
                        Fix on-air match data
                      </button>
                      <button
                        className="air-ghost-btn"
                        onClick={() => navigate("live")}
                      >
                        Inspect live game data
                      </button>
                      <button
                        className="air-ghost-btn"
                        onClick={() => navigate("producer")}
                      >
                        Open live graphic controls
                      </button>
                    </div>
                  </section>
                )}
              </section>
              <aside className="hud-control-preview">
                <label>
                  Preview screen
                  <select
                    aria-label="HUD preview screen"
                    value={overlay}
                    onChange={(event) => setOverlay(event.target.value)}
                  >
                    <option value="ingame">Match HUD</option>
                    <option value="starting-soon">Opening</option>
                    <option value="holding">Break</option>
                    <option value="lower-third">Lower third</option>
                    <option value="banners">Banners</option>
                    <option value="toast">Short update</option>
                    <option value="scoreboard">Scoreboard</option>
                  </select>
                </label>
                <TemplatePreview
                  item={previewItem}
                  previewBase={data.previewBase}
                  teams={data.teams || []}
                  matchCode={data.context.matchCode}
                  hudSettings={previewSource === "draft" ? draft : null}
                  initialDemo={false}
                  forceReceived={previewSource === "live"}
                  disabled
                  onMove={() => {}}
                />
              </aside>
            </div>
            <footer className="workspace-footer">
              <div>
                <strong>Preview first. Apply when ready.</strong>
                <p>
                  Save draft leaves live output unchanged. Apply to live HUD
                  changes this match’s current graphics immediately.
                </p>
              </div>
              <div className="product-actions">
                <button
                  className="air-primary-btn"
                  disabled={busy}
                  onClick={() => action("save")}
                >
                  {busy ? "Saving…" : "Save HUD draft"}
                </button>
                <button
                  className="air-ghost-btn"
                  disabled={busy}
                  onClick={() => action("apply")}
                >
                  Apply to live HUD
                </button>
              </div>
            </footer>
          </>
        )}
      </main>
    </AirShell>
  );
}
