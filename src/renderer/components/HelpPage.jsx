import React, { useState } from "react";
import AirShell from "./air/AirShell.jsx";
import { PageHead, useWorkspace } from "../workspace.jsx";
import Walkthrough from "./Walkthrough.jsx";
import { useMatchDay } from "./MatchDayPages.jsx";
export default function HelpPage() {
  const { theme, setTheme, navigate } = useWorkspace(),
    { data } = useMatchDay();
  return (
    <AirShell screenTitle="Settings & help">
      <main className="workspace-page">
        <PageHead eyebrow="MAKE AIR WORK FOR YOU" title="Settings & help">
          Clear controls, a repeatable setup and help when you need it.
        </PageHead>
        <section className="workspace-section">
          <h2>Appearance</h2>
          <div
            className="workspace-tabs"
            role="tablist"
            aria-label="Appearance"
          >
            {["dark", "light"].map((value) => (
              <button
                role="tab"
                aria-selected={theme === value}
                key={value}
                onClick={() => setTheme(value)}
              >
                {value === "dark" ? "Charcoal" : "Light"}
              </button>
            ))}
          </div>
        </section>
        <section className="workspace-section">
          <h2>Production preferences</h2>
          <div className="product-actions">
            <button
              className="air-ghost-btn"
              onClick={() => navigate("shortcuts")}
            >
              Keyboard shortcuts
            </button>
            <button
              className="air-ghost-btn"
              onClick={() => navigate("settings")}
            >
              PC role
            </button>
            <button
              className="air-ghost-btn"
              onClick={() => navigate("timeline")}
            >
              Production history
            </button>
            <button
              className="air-ghost-btn"
              onClick={() => navigate("outputs")}
            >
              Advanced browser sources
            </button>
          </div>
        </section>
        <Walkthrough data={data} />
      </main>
    </AirShell>
  );
}
