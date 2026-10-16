import React, { useState } from "react";
import { useWorkspace } from "../workspace.jsx";
import AirIcon from "./air/AirIcon.jsx";

const descriptions = [
  "Choose an Esportra match or create an independent one.",
  "Review both lineups and the names viewers will see.",
  "Connect OBS and choose where game data comes from.",
  "Choose your screens and check them before sending.",
  "Air creates the scenes and browser sources for you.",
  "Review the preview, then take your first screen on air.",
];
const actions = [
  "Choose a match",
  "Review lineup",
  "Connect OBS & game feed",
  "Preview screens",
  "Send screens to OBS",
  "Open production controls",
];
export default function Walkthrough({ data, compact = false }) {
  const { status, navigate, playersReviewed } = useWorkspace();
  const key = `air-guide:${status?.show?.id || "new"}`;
  const visited = (() => {
    try {
      return JSON.parse(localStorage.getItem(key + ":visited") || "{}");
    } catch (_) {
      return {};
    }
  })();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === "dismissed";
    } catch (_) {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(!compact);
  const steps = [
    ["Choose or create a match", !!status?.show?.matchCode, "matches"],
    [
      "Check the players",
      playersReviewed &&
        data?.teams?.length === 2 &&
        data.teams.every((team) => team.players.length > 0),
      "players",
    ],
    [
      "Connect OBS and the game feed",
      status?.health?.obsConnection?.state === "healthy" &&
        status?.productionFeed?.ageMs != null &&
        !status?.productionFeed?.stale,
      "connections",
    ],
    [
      "Preview broadcast screens",
      !!visited.template && !!status?.obsTemplate?.screenCount,
      "template",
    ],
    ["Send your screens to OBS", !!status?.obsTemplate?.prepared, "template"],
    ["Open production controls", !!visited.producer, "producer"],
  ];
  const complete = steps.filter((step) => step[1]).length;
  const next = steps.findIndex((step) => !step[1]);
  const current = next < 0 ? steps.length - 1 : next;
  function dismiss() {
    try {
      localStorage.setItem(key, "dismissed");
    } catch (_) {}
    setHidden(true);
  }
  function restart() {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
    setHidden(false);
  }
  if (hidden)
    return (
      <section className="walkthrough walkthrough-dismissed">
        <AirIcon name="book" />
        <div>
          <h2>First broadcast guide</h2>
          <p>Pick up where you left off.</p>
        </div>
        <button className="air-text-btn" onClick={restart}>
          Restart walkthrough
        </button>
      </section>
    );
  return (
    <section
      className={`walkthrough ${compact ? "walkthrough-compact" : ""}`}
      aria-label="First broadcast guide"
    >
      <div className="guide-heading">
        <span className="guide-icon">
          <AirIcon name="book" />
        </span>
        <div>
          <h2>Broadcast setup</h2>
          <p>Your first broadcast, step by step</p>
        </div>
      </div>
      <div
        className="guide-progress"
        aria-label={`${complete} of ${steps.length} preparation checks ready`}
      >
        {steps.map(([label, done]) => (
          <span key={label} className={done ? "complete" : ""} />
        ))}
      </div>
      <div className="guide-progress-label">
        <span>
          {complete} of {steps.length} checks ready
        </span>
        <button className="air-text-btn" onClick={dismiss}>
          Skip walkthrough
        </button>
      </div>
      <div className="guide-next">
        <small>{next < 0 ? "READY TO BROADCAST" : "NEXT STEP"}</small>
        <h3>{next < 0 ? "Your setup is ready" : steps[current][0]}</h3>
        <p>
          {next < 0
            ? "Open production controls when you are ready to go on air."
            : descriptions[current]}
        </p>
        <button
          className="air-ghost-btn"
          onClick={() => navigate(steps[current][2])}
        >
          {actions[current]}
          <AirIcon name="arrow" size={16} />
        </button>
      </div>
      <button
        className="guide-details-toggle air-text-btn"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Hide all steps" : "View all steps"}
        <AirIcon name="chevron" size={13} />
      </button>
      {expanded && (
        <ol className="guide-steps">
          {steps.map(([label, done, page], index) => (
            <li key={label}>
              <button
                onClick={() => navigate(page)}
                aria-current={index === next ? "step" : undefined}
              >
                <span className={`guide-step-number ${done ? "complete" : ""}`}>
                  {done ? <AirIcon name="check" size={12} /> : index + 1}
                </span>
                <span>{label}</span>
                <AirIcon name="chevron" size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="guide-practice">
        <button className="air-text-btn" onClick={() => navigate("rehearsal")}>
          <AirIcon name="producer" size={15} />
          Practice with sample data
        </button>
        <p>Practice stays separate from real matches.</p>
      </div>
    </section>
  );
}
