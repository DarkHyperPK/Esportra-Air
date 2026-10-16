import React from "react";
import AirShell from "./air/AirShell.jsx";
import AirIcon from "./air/AirIcon.jsx";
import { useWorkspace } from "../workspace.jsx";
import { useMatchDay } from "./MatchDayPages.jsx";

export default function BroadcastHome() {
  const { status, navigate, playersReviewed, screenDrafts } = useWorkspace();
  const { data, error } = useMatchDay();
  const match = data?.matches?.find(
    (row) => row.matchCode === status?.show?.matchCode,
  );
  const selected =
    !!match && !["completed", "cancelled"].includes(match.status);
  const connected = status?.health?.obsConnection?.state === "healthy";
  const context = status?.correctionContext;
  const cachedDraft =
    context &&
    screenDrafts.current.get(
      `${status.show?.source || "esportra"}:${context.showId}:${context.matchId}:${context.nodeId}`,
    );
  const draftCount = cachedDraft?.dirty
    ? cachedDraft.draft.items.length
    : status?.obsTemplate?.screenCount || 0;
  const prepared =
    selected && !!status?.obsTemplate?.prepared && !cachedDraft?.dirty;
  const running = !!status?.runner?.activeSegment;
  const feed =
    status?.productionFeed?.ageMs != null && !status.productionFeed.stale;
  const next =
    !selected || !playersReviewed ? 0 : !connected ? 1 : !prepared ? 2 : 3;
  const steps = [
    {
      title: "Prepare your match",
      detail:
        "Choose a match. Check both teams, player identities and HUD nicknames.",
      page: selected ? "players" : "matches",
      action: selected ? "Check players" : "Choose a match",
      state: selected
        ? playersReviewed
          ? "Lineups reviewed"
          : "Match selected · review players"
        : "Choose a match",
      icon: "players",
      links: [["matches", "Browse matches"]],
    },
    {
      title: "Connect your equipment",
      detail:
        "Connect OBS Studio and enable local capture, or connect an observer PC.",
      page: "connections",
      action: "Connect OBS & capture",
      state: connected
        ? feed
          ? "OBS & game feed connected"
          : "OBS connected · waiting for game feed"
        : "OBS not connected",
      icon: "connections",
      links: [["live", "Inspect incoming game data"]],
    },
    {
      title: "Build your broadcast",
      detail:
        "Add screens from the library, customize the HUD, then Send to OBS. Air creates the scenes and browser sources.",
      page: "template",
      action: "Prepare screens",
      state: prepared
        ? "Screens sent to OBS"
        : `${draftCount} screens in draft${cachedDraft?.dirty ? " · unsaved changes" : ""}`,
      icon: "template",
      links: [["hud", "Customize HUD layers"]],
    },
    {
      title: "Operate your broadcast",
      detail:
        "Start broadcast prepares your first screen. Show screen on air sends it to viewers. Start streaming or recording in OBS Studio.",
      page: "producer",
      action: running ? "Return to OBS controls" : "Open OBS controls",
      state: running ? "Air session active" : "Ready after setup",
      icon: "producer",
      links: [["shortcuts", "Set keyboard shortcuts"]],
    },
  ];
  return (
    <AirShell screenTitle="Broadcast setup">
      <main className="workspace-page broadcast-home">
        <header className="broadcast-home-header">
          <div>
            <p className="eyebrow">ESPORTRA AIR / PRODUCTION DESK</p>
            <h1>
              {running
                ? "Your production desk is active."
                : "Your broadcast starts here."}
            </h1>
            <p>Prepare once. Control every screen from this desk.</p>
          </div>
          <span className={`desk-session ${running ? "active" : ""}`}>
            <i />
            {running ? "AIR SESSION ACTIVE" : "PREPARATION"}
          </span>
        </header>
        {error && (
          <p className="broadcast-error" role="alert">
            {error}
          </p>
        )}
        <section className="broadcast-hero" aria-label="Next broadcast action">
          <div className="broadcast-hero-art" aria-hidden="true">
            <img src="../../assets/brand/esportra-mark.png" alt="" />
          </div>
          <div className="broadcast-hero-copy">
            <span className="eyebrow">
              {running ? "CONTINUE OPERATING" : `NEXT · STEP ${next + 1} OF 4`}
            </span>
            <h2>
              {running ? "Back to your production controls" : steps[next].title}
            </h2>
            <p>
              {running
                ? "Review the current output before making your next on-air change."
                : steps[next].detail}
            </p>
            <button
              className="air-primary-btn"
              onClick={() => navigate(running ? "producer" : steps[next].page)}
            >
              {running ? "Return to OBS controls" : steps[next].action}
              <AirIcon name="arrow" size={16} />
            </button>
          </div>
          <div className="broadcast-match-summary">
            <span>SELECTED MATCH</span>
            <strong>
              {selected
                ? match.label ||
                  match.title ||
                  match.teams?.map((team) => team.name).join(" vs ")
                : "No eligible match selected"}
            </strong>
            <small>
              {status?.show?.title ||
                "Choose a tournament or independent project"}
            </small>
            <button
              className="air-text-btn"
              onClick={() => navigate("matches")}
            >
              {selected ? "Change match" : "Browse matches"}
            </button>
          </div>
        </section>
        <div className="broadcast-route-heading">
          <h2>From setup to on air</h2>
          <span>Follow the steps. Return here anytime.</span>
        </div>
        <ol className="broadcast-route">
          {steps.map((step, index) => (
            <li
              key={step.page}
              className={index === next ? "current" : ""}
              aria-current={index === next ? "step" : undefined}
            >
              <span className="route-number">0{index + 1}</span>
              <div className="route-copy">
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
                <span className="route-state">{step.state}</span>
              </div>
              <div className="route-actions">
                <button
                  className="air-ghost-btn"
                  onClick={() => navigate(step.page)}
                >
                  {step.action}
                  <AirIcon name="arrow" size={14} />
                </button>
                {step.links.map(([page, label]) => (
                  <button
                    key={page}
                    className="air-text-btn"
                    onClick={() => navigate(page)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <footer className="broadcast-home-footer">
          <AirIcon name="book" />
          <div>
            <strong>First time producing?</strong>
            <p>
              Practice with isolated sample data before working with a real
              match.
            </p>
          </div>
          <button
            className="air-ghost-btn"
            onClick={() => navigate("rehearsal")}
          >
            Open practice
          </button>
        </footer>
      </main>
    </AirShell>
  );
}
