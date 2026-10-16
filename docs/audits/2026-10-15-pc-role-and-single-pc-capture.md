# PROJ-061: PC-role navigation and one-PC capture

15 October 2026. Local fix, uncommitted and undeployed.

## Confirmed behavior

Production mode already supports OBS/HUD and local GEP capture on the same PC. No third combined mode is required. Capture-only mode sends game events to another production PC over LAN and has no production controls. GEP does not auto-start in either role; Start capture and the explicit consent confirmation remain required. No live game/Overwolf/OBS certification was performed.

## Changes

- PC role is consistently reachable from production navigation, the capture workspace and the pairing screen. Both workspaces use the same role-selection route before mode-specific rendering.
- The restart screen offers Change selection and Keep current role. Choosing the running role cancels a pending change without restarting. The IPC compares the requested role with the running runtime, rather than the last saved pending selection. GET_STATUS reports the configured role and restart requirement separately from the running role.
- Role descriptions explicitly explain one-PC observing/production and that capture starts only after approval.
- Game capture on this PC is an expanded Match setup section instead of a collapsed advanced setting. The saved observer/player capture role is reused. Capture transport uses the running mode until restart.
- Existing active-production/capture/HUD-consumer guards remain enforced. Pairing is retained when changing roles; no credential removal or automatic capture was introduced.

## Verification

Air 136 tests and renderer build passed. Native Electron fixture: 47 checks/eight captures passed, including changing the pending capture-only choice back to production, reopening PC role before pairing, clearing the restart requirement, confirming GEP remains inactive and rejecting mode changes during active production. Existing show, HUD preview, OBS template, correction, event queue and capture-consent checks remain passing. Fixtures use synthetic data and do not start real game capture or a user's OBS.

Sources: src/renderer/App.jsx, ModeScreen.jsx, PairScreen.jsx, CaptureScreen.jsx, ProductionReadiness.jsx, air/AirShell.jsx, src/main.js and tools/product-desktop-smoke.cjs. The sole implemented reference now has 142 real-component captures across 26 A–Z groups, with no renderer errors or horizontal overflow. Captures additionally exercise capture-workspace PC role navigation and returning to capture. Original index/images remain unchanged; gallery checks passed.

## Pending Obsidian consolidation

The Obsidian MCP connector is unavailable in this turn; no vault save was attempted through another route. Once connected, read/reconcile Air.md, Broadcast-Production.md, Current-Work.md and Session-Index.md, then add this verified role-switch/one-PC clarification and a dated session handoff. Preserve previous source dates and distinguish local fixture verification from live acceptance. Canonical context remains in D:/frag-and-book-main/.claude/company/projects/PROJ-061/context.md. No commit, push or deployment was requested.
