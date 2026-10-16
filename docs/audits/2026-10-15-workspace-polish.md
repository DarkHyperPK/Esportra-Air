# PROJ-061 — desktop visual refinement

The user identified further functional gaps after this visual pass. [Screen library, native HUD controls, sample rendering and source-visibility correction](2026-10-15-screen-library-and-hud-workflow.md) supersedes its workflow state. Current tests: 154 Air / 54 native; sole reference 178 screens.


15 October 2026. The user rejected the prior workspace appearance as insufficiently polished. This is a corrective design pass on the real app, not product acceptance or a separate mockup direction. No commit, push or deployment.

## Design correction

| Before | After | Why |
| --- | --- | --- |
| Inherited Poppins on the app and controls overrode the proposed system font | Shared Segoe UI/system typeface at the source of the legacy styles | Clear desktop typography and consistent metrics |
| Letter badges, large active stripe and repeated navigation/status rows | Consistent SVG icons, grouped sidebar navigation, restrained selected state and one compact context bar | Recognizable controls and less competing chrome |
| Full-width six-step checklist dominated Matches | Compact side guide shows one next action, progress and optional full checklist; dismiss/restart remains | Operators can focus on choosing a match |
| Raw pending label and fragmented five-column match table | Team marks, combined match/project/format identity, readable schedule and Scheduled/Live status, aligned row action | Faster match identification without inventing readiness |
| Stacked screen preview and settings required scrolling past the canvas | Screen-order column, central preview and settings inspector; responsive inspector below on smaller windows | Keep editing context visible |
| Repeated heavy borders, inconsistent controls and default Electron menu | Subtle separators, aligned fields/actions, hover/focus/pressed states, hidden native menu available with Alt | Restraint and predictable desktop interaction |

Soft slate and light themes remain. Production commands and telemetry have no animation delays. Existing match eligibility/history, player aliases, capture consent, OBS source creation and access behavior are retained.

## Verification

- Air 148 tests and renderer build passed. The UI title selectors in the native regression were updated to exact headings; assertions were retained.
- Focused real-component browser check: guide expand/dismiss/restart, match search/recovery/history guards, seven semantic navigation icons, system typeface, keyboard focus and content fit at 960/1024/1280/1440/1920 passed. Ten synthetic screenshots in `docs/audits/workspace-polish/`; the screen-preview iframe there is explicitly an isolated fixture, not real game/OBS output.
- Native Electron fixture passed 51 tournament/independent production checks and 11 captures after the final stylesheet split/window options. One intermediate run timed out waiting for the sample-preview badge; the rerun with frame diagnostics passed. This intermittent preview wait is recorded for live rehearsal, not declared a diagnosed runtime defect or silently omitted.
- Full implemented reference regenerated from actual components: 166 app/web captures plus six actual HUD bracket presentations = 172, across all 26 A–Z groups. Renderer errors and overflow absent; gallery/search/phone checks passed. Original root index and its linked 19 images/34 references unchanged.
- Backend APIs and web behavior are unchanged in this pass. Earlier API/Core/web test evidence belongs to the preceding approved-plan implementation, not a fresh run here.

## Source and continuation

`src/renderer/components/air/WorkspaceShell.jsx`, `AirIcon.jsx`, `MatchList.jsx`, `MatchDayPages.jsx`, `Walkthrough.jsx`, `TemplateSetup.jsx`, `TemplatePreview.jsx`; shared `workspace.css`, `workspace-flows.css`, `workspace-editor.css` and legacy typography sources. Styles were split without changing cascade order; index and both renderer exporters load the same sequence. `src/main.js` uses native menu auto-hide and a slate window background. Native menu remains accessible using Alt.

Reproduce focused check: `node tools/workspace-polish-smoke.cjs`. Existing `npm start` rebuilds and opens the app. Close the running old window before restarting to inspect the new renderer.

Sole implemented UI reference: `design/implemented/index.html`. Do not create another UI pack. User visual approval, live OBS/GEP/hardware/staging rehearsal, installer and independent acceptance remain outstanding. Scope/release details: [workspace and standalone handoff](2026-10-15-workspace-standalone-handoff.md).
