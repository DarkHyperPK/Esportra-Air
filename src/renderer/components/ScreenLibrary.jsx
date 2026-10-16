import React, { useEffect, useRef, useState } from "react";
import TemplatePreview from "./TemplatePreview.jsx";
import AirIcon from "./air/AirIcon.jsx";

export const SCREEN_NAMES = {
  ingame: "Match HUD",
  "starting-soon": "Opening",
  "match-intro": "Match Introduction",
  holding: "Break",
  casters: "Talent cameras",
  series: "Results",
  scoreboard: "Scoreboard",
  bracket: "Bracket",
  "team-roster-a": "Team A lineup",
  "team-roster-b": "Team B lineup",
  "agent-select": "Agent selection",
  "map-veto": "Map veto",
  "lower-third": "Lower third",
  "round-recap": "Round recap",
  "map-result": "Map result",
  sponsor: "Sponsors",
};
export const screenName = (name) =>
  SCREEN_NAMES[name] ||
  name
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
const SETS = [
  {
    name: "Match broadcast",
    description: "A complete sequence for one match.",
    screens: ["starting-soon", "match-intro", "ingame", "holding", "series"],
  },
  {
    name: "Desk & interviews",
    description: "Opening, talent cameras and a break.",
    screens: ["starting-soon", "casters", "holding"],
  },
  {
    name: "Between maps",
    description: "Map result, series score and a break.",
    screens: ["map-result", "series", "holding"],
  },
];

export default function ScreenLibrary({
  overlays,
  teams,
  matchCode,
  previewBase,
  hudSettings,
  onAdd,
  onClose,
  remaining,
}) {
  const dialog = useRef(null),
    [tab, setTab] = useState("screens"),
    [query, setQuery] = useState(""),
    [choice, setChoice] = useState("ingame"),
    [setIndex, setSetIndex] = useState(0);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.querySelector("button")?.focus();
    const key = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = [
          ...dialog.current.querySelectorAll(
            'button:not(:disabled), input, select, [tabindex="0"]',
          ),
        ],
        first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.current.addEventListener("keydown", key);
    return () => {
      dialog.current?.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  const collection = SETS[setIndex],
    selected = tab === "templates" ? collection.screens : [choice];
  const item = {
    id: "library-preview",
    title: screenName(choice),
    overlay: choice,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    background: "",
  };
  return (
    <div className="air-dialog-backdrop">
      <section
        ref={dialog}
        className="screen-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-library-title"
      >
        <header>
          <div>
            <h2 id="screen-library-title">Add broadcast screens</h2>
            <p>
              Preview a screen or add a ready-made set. Customize it before
              sending to OBS.
            </p>
          </div>
          <button className="air-ghost-btn" onClick={onClose}>
            Close library
          </button>
        </header>
        <div className="screen-library-body">
          <div className="screen-library-choices">
            <div
              className="workspace-tabs"
              role="tablist"
              aria-label="Screen library"
            >
              <button
                role="tab"
                aria-selected={tab === "templates"}
                onClick={() => {
                  setTab("templates");
                  setChoice(collection.screens[0]);
                }}
              >
                Templates
              </button>
              <button
                role="tab"
                aria-selected={tab === "screens"}
                onClick={() => setTab("screens")}
              >
                Individual screens
              </button>
            </div>
            {tab === "templates" ? (
              <div className="template-set-list">
                {SETS.map((set, index) => (
                  <button
                    key={set.name}
                    aria-pressed={setIndex === index}
                    onClick={() => {
                      setSetIndex(index);
                      setChoice(set.screens[0]);
                    }}
                  >
                    <AirIcon name="template" />
                    <strong>{set.name}</strong>
                    <p>{set.description}</p>
                    <small>
                      {set.screens.length} screens ·{" "}
                      {set.screens.map(screenName).join(", ")}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <input
                  aria-label="Search screen library"
                  placeholder="Search screens"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="screen-library-grid">
                  {overlays
                    .filter((name) =>
                      screenName(name)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((name) => (
                      <button
                        key={name}
                        aria-pressed={choice === name}
                        onClick={() => setChoice(name)}
                      >
                        <AirIcon
                          name={name === "ingame" ? "producer" : "template"}
                          size={22}
                        />
                        <strong>{screenName(name)}</strong>
                        <span>
                          Preview
                          <AirIcon name="chevron" size={12} />
                        </span>
                      </button>
                    ))}
                </div>
                {!overlays.some((name) =>
                  screenName(name).toLowerCase().includes(query.toLowerCase()),
                ) && (
                  <p className="empty-state">
                    No screens found. Try a different name.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="screen-library-preview">
            {tab === "templates" && (
              <div className="library-set-preview">
                {collection.screens.map((name) => (
                  <button
                    className={choice === name ? "selected" : ""}
                    key={name}
                    onClick={() => setChoice(name)}
                  >
                    {screenName(name)}
                  </button>
                ))}
              </div>
            )}
            <h3>{screenName(choice)}</h3>
            <TemplatePreview
              key="library-preview"
              initialDemo
              item={item}
              teams={teams}
              matchCode={matchCode}
              previewBase={previewBase}
              hudSettings={hudSettings}
              disabled
              onMove={() => {}}
            />
            <p>
              Preview data stays separate from your match. Adding screens does not change
              OBS.
            </p>
          </div>
        </div>
        <footer>
          <span>
            {selected.length > remaining
              ? `There is room for ${remaining} more screens. Remove some before adding this set.`
              : "Added screens stay in your local draft until you choose Send to OBS."}
          </span>
          <button
            className="air-primary-btn"
            disabled={!selected.length || selected.length > remaining}
            onClick={() =>
              onAdd(
                selected.map((overlay) => ({
                  title: screenName(overlay),
                  overlay,
                })),
              )
            }
          >
            {tab === "templates"
              ? `Add ${selected.length} screens`
              : "Add to broadcast"}
            <AirIcon name="plus" size={15} />
          </button>
        </footer>
      </section>
    </div>
  );
}
