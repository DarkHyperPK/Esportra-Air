# PROJ-061 — screen library, HUD controls and real sample preview

15 October 2026. The user reported three real workflow gaps after the visual redesign. Corrected locally in the existing desktop/HUD pipeline. No commit, push, deployment or acceptance.

## Operator workflow

1. Choose the prepared match in Matches and check Teams & players.
2. In Broadcast screens, choose **Add screen**. **Individual screens** and **Templates** are separate. Preview a screen or a set, then **Add to broadcast** or **Add N screens**. Rename/reorder/remove in the current match's draft. This works for tournament-linked and independent matches without leaving the workspace. Up to 50 screens; locally added screens have scoped local UUIDs and manual production cues. Published tournament plans are unchanged.
3. Open **HUD controls** in the sidebar or the screen editor. Layers & appearance, Screen content, Live graphics and Match data expose HUD switches, automatic economy/recap modes, banner designs, countdown/messages, ticker/lower-third content, live banners/updates and links to audited on-air corrections, HUD nicknames and incoming game data.
4. **Save HUD draft** changes the local draft and its read-only preview. **Send to OBS** applies that saved HUD setup together with the screen template. **Apply to live HUD** is an explicit immediate operation. Countdown and live graphic actions identify live output in their labels and switch the panel preview to the actual live source. Editing settings returns to the draft preview. Match scores/identities remain outside the appearance patch; official results are unchanged.
5. Use **Use sample game data in this preview** to inspect synthetic players, scores and running timers with the selected teams. Opening uses a moving sample countdown; Match HUD shows sample players and game events. Turning it off returns to the actual room. The preview canvas is constant across modes; it is never added to OBS. Explicit Send to OBS creates browser sources/scenes, preserves Program and loads added screens into production.

Fully quit the old app, then run `npm start` in D:/Esportra-Air. Existing windows and old installers do not load updated main-process IPC automatically.

## Root causes and implementation

The old editor validated only published screen IDs and could not add a new screen. Local additions now survive reload and enter the production list through the same source-aware adapter, without writing tournament configuration. The editor supports adding from an empty list.

The paired workspace had no route to HUD control capabilities. Native, typed main-process handlers now scope all HUD edits by source/show/match/node, keep write credentials in main and persist draft/applied settings separately. Applied settings survive authorized show/branding refreshes. Existing audited corrections and player preferences are reused; the legacy unscoped raw JSON editor is not embedded.

The previous sample view was a frozen snapshot. Interactive preview now has a running local clock and simulation, selected-team/roster names and sample countdown. Preview settings are validated through a shared browser/main validator and applied to a cloned view. No sample-mode WebSocket or write reaches the live room. A verified child-frame ready message, loading state/retry and a short preview-only input debounce avoid blank frame flashes. Production commands are not delayed.

A further renderer bug let Match HUD layer switches hide a selected standalone Scoreboard. Dedicated registered browser outputs and editor previews now enable their own primary module in the view; the composite Match HUD's switches and persisted room state remain untouched. Scoreboard shows waiting players/unknown values before capture rather than placeholder weapon/credit data.

## Fresh evidence

- Air **154 tests** and renderer build passed, including local screen persistence/runtime mapping, bounded input validation, source/node isolation, draft versus applied settings, countdowns and scoped graphics.
- Native Electron **54 checks / 14 screenshots** passed. Includes adding a sixth screen, saving/reloading it, sending it into the actual production list, unchanged Program, HUD draft isolation, explicit Send application, and live custom-banner preview.
- `node tools/hud-sample-smoke.cjs`: actual HUD engine tests moving match/Opening clocks, ten sample players, selected names, read-only draft preview, dedicated /o browser-source visibility and unchanged live room/version. Three captures under docs/audits/screen-controls.
- `node tools/workspace-polish-smoke.cjs`: real components at 960/1024/1280/1440/1920, themes, guide/search/history/navigation/focus; ten captures. Full export: 172 app/web captures plus six actual bracket presentations, **178 screens / 26 A–Z groups**. Renderer/gallery/overflow checks passed. Root index and original 19 images/34 references unchanged.
- HUD browser assets synchronized to frontend public/air-hud. No backend API behavior changed in this correction; earlier API/Core/web test results are historical for this batch.

Fixtures use synthetic accounts and a local OBS protocol implementation. Actual OBS/GEP/game/LAN/staging, installer and independent/user acceptance remain separate. External agent-art requests are blocked in isolated browser tests, so those fixtures do not certify production asset delivery. No product-completion percentage is inferred from the original 53-requirement audit.

Canonical project: D:/frag-and-book-main/.claude/company/projects/PROJ-061/context.md and air-workspace-implementation.md. Sole UI reference: design/implemented/index.html. Obsidian consolidation: `08-Sessions/2026-10-15-PROJ-061-Screen-Library-and-HUD-Workflow.md`, affected Air/Frontend notes, Current-Work checkpoint/row and Session-Index. Saved through MCP and read back successfully.
