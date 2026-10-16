import React from "react";
import { PAGES, NAV_GROUPS, useWorkspace } from "../../workspace.jsx";
import AirIcon from "./AirIcon.jsx";
import BrandLogo from "./BrandLogo.jsx";

export default function AirShell({
  screenTitle,
  nodeName,
  contextualButton,
  nav = [],
  activeTab,
  onTabChange,
  statusBadge,
  showHeader = true,
  show,
  children,
}) {
  const workspace = useWorkspace(),
    status = workspace?.status;
  const navigate = workspace?.navigate || onTabChange,
    selected = show || status?.show;
  const active =
    {
      bracket: "template",
      "data-fixes": "hud",
      outputs: "template",
      settings: "help",
      readiness: "connections",
      projects: "matches",
    }[workspace?.active || activeTab] ||
    workspace?.active ||
    activeTab;
  const sidebar =
    !!navigate &&
    status?.mode !== "capture-only" &&
    (!!status?.paired || !!status?.standalone);
  const match = selected?.matches?.find(
    (item) => item.matchCode === selected.matchCode,
  );
  const obsConnected = status?.health?.obsConnection?.state === "healthy";
  const feedConnected =
    status?.productionFeed?.ageMs != null &&
    status.productionFeed.ageMs < 10000 &&
    !status?.productionFeed?.stale;
  return (
    <div className={`air-window ${sidebar ? "has-sidebar" : "welcome-window"}`}>
      {sidebar && (
        <aside className="workspace-sidebar" aria-label="Main navigation">
          <BrandLogo />
          <button
            className="sidebar-project"
            onClick={() => navigate("projects")}
          >
            <span className="project-avatar">
              <AirIcon name="template" size={17} />
            </span>
            <span>
              <strong>{selected?.title || "Your workspace"}</strong>
              <small>
                {selected?.source === "standalone"
                  ? "Independent project"
                  : "Tournament workspace"}
              </small>
            </span>
            <AirIcon name="chevron" size={14} />
          </button>
          {NAV_GROUPS.map(([label, pages]) => (
            <section className="sidebar-nav-group" key={label}>
              <p className="sidebar-label">{label}</p>
              <nav aria-label={label}>
                {pages.map(([id, title]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigate(id)}
                    aria-current={active === id ? "page" : undefined}
                  >
                    <AirIcon name={id} />
                    <span>{title}</span>
                    {id === "live" && feedConnected && (
                      <i className="live-dot" />
                    )}
                  </button>
                ))}
              </nav>
            </section>
          ))}
          <div className="sidebar-bottom">
            <div className="sidebar-connections">
              <button onClick={() => navigate("connections")}>
                <i
                  className={`connection-dot ${obsConnected ? "is-connected" : ""}`}
                />
                <span>
                  {obsConnected ? "OBS connected" : "OBS not connected"}
                </span>
                <AirIcon name="chevron" size={12} />
              </button>
              <span>
                <i
                  className={`connection-dot ${status?.hubConnected ? "is-connected" : ""}`}
                />
                {status?.hubConnected
                  ? "Esportra connected"
                  : "Working locally"}
              </span>
            </div>
            <div className="sidebar-device">
              <button
                className="sidebar-role"
                aria-label="PC role"
                onClick={() => navigate("settings")}
                title="Change how this PC is used"
              >
                <AirIcon name="screen" size={16} />
                <span>
                  <strong>PC role</strong>
                  <small>
                    {nodeName || status?.nodeName || "Production PC"}
                  </small>
                </span>
              </button>
              <button
                className="appearance-toggle"
                aria-label="Toggle light and dark appearance"
                title={
                  workspace.theme === "dark"
                    ? "Switch to light appearance"
                    : "Switch to dark appearance"
                }
                onClick={() =>
                  workspace.setTheme(
                    workspace.theme === "dark" ? "light" : "dark",
                  )
                }
              >
                <AirIcon name={workspace.theme === "dark" ? "sun" : "moon"} />
              </button>
            </div>
          </div>
        </aside>
      )}
      <div className="workspace-main">
        {showHeader && (
          <header className="workspace-topbar">
            <div className="workspace-breadcrumb">
              <span>{sidebar ? "Workspace" : "ESPORTRA AIR"}</span>
              {sidebar && (
                <>
                  <AirIcon name="chevron" size={12} />
                  <strong>
                    {PAGES.find(([id]) => id === active)?.[1] || screenTitle}
                  </strong>
                </>
              )}
            </div>
            <div>
              {statusBadge}
              {contextualButton}
              {selected && (
                <div className="workspace-match-strip">
                  <i
                    className={feedConnected ? "live-dot" : "match-indicator"}
                  />
                  <span className="selected-match-caption">Selected match</span>
                  <strong>{match?.label || selected.title}</strong>
                  <code>{selected.matchCode}</code>
                  <button
                    className="feed-status"
                    onClick={() => navigate("live")}
                    title={
                      status?.productionFeed?.ageMs == null
                        ? "No game data received for this match. Check capture in Connections."
                        : status?.productionFeed?.stale
                          ? `Game data last received ${Math.floor(status.productionFeed.ageMs / 1000)} seconds ago. Open Live match to inspect it.`
                          : "Open Live match to inspect received game data."
                    }
                  >
                    {status?.productionFeed?.ageMs == null
                      ? "Game data: waiting"
                      : `Game data: ${Math.floor(status.productionFeed.ageMs / 1000)}s ago`}
                  </button>
                </div>
              )}
            </div>
          </header>
        )}
        {sidebar && status?.airAccount?.warning && (
          <div className="workspace-access-notice" role="status">
            <span>
              {status.airAccount.warning}
              {status.airAccount.offlineExpiresAt &&
                ` Access valid until ${new Date(status.airAccount.offlineExpiresAt).toLocaleString()}.`}
            </span>
            <button
              className="air-ghost-btn"
              onClick={() => navigate("projects")}
            >
              Account access
            </button>
          </div>
        )}
        {!sidebar && nav.length > 0 && (
          <nav className="welcome-navigation" aria-label="Screen navigation">
            {nav.map((item) => (
              <button
                className="air-ghost-btn"
                key={item.id}
                onClick={() => navigate?.(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
        {sidebar && active !== "home" && (
          <div className="workflow-location" aria-label="Broadcast workflow">
            <button onClick={() => navigate("home")}>
              <AirIcon name="home" size={14} /> Setup overview
            </button>
            <span>
              {["matches", "players", "connections"].includes(active)
                ? "01 / Prepare your match & equipment"
                : ["template", "hud"].includes(active)
                  ? "02 / Customize screens, then Send to OBS"
                  : ["producer", "live", "shortcuts"].includes(active)
                    ? "03 / Operate your broadcast"
                    : "Workspace settings"}
            </span>
            {active === "players" && (
              <button onClick={() => navigate("connections")}>
                Next: connect equipment <AirIcon name="arrow" size={14} />
              </button>
            )}
            {active === "connections" && (
              <button onClick={() => navigate("template")}>
                Next: prepare screens <AirIcon name="arrow" size={14} />
              </button>
            )}
            {active === "hud" && (
              <button onClick={() => navigate("template")}>
                Next: send screens to OBS <AirIcon name="arrow" size={14} />
              </button>
            )}
          </div>
        )}
        <div className="air-screen-body">{children}</div>
      </div>
    </div>
  );
}
