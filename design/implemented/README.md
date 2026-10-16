# Esportra Air implemented UI reference

Single active screen reference, generated 16 October 2026. Product brief: [original index.html](../../index.html). Functional coverage: [53-requirement register](../../docs/coverage/INDEX-COVERAGE.md).

181 screenshots cover all 26 Aâ€“Z workflow groups. Screens are real current React components with synthetic accounts, API records, OBS status and desktop IPC. Capture-active and relay-connected values demonstrate implemented rendering, not a real game/connection. Producer monitors may be empty because no live OBS screenshots are supplied. No account, credential, clipboard, OBS instance or game is touched. Native fixture evidence from the prior product checks is separate.

Open [index.html](index.html) directly in a browser; no server is required. PNGs under screens/A through screens/Z are full resolution. [screen-register.md](screen-register.md) maps each screenshot to component, fixture URL and viewport. Missing PRD interfaces are listed in coverage rather than fabricated as implemented screenshots. The root index and original linked images remain unchanged.

## Current web workflow

One left sidebar replaces top navigation in Broadcast, independent Air projects and the tournament Broadcast tab. Explicit match selection, HUD editing, screen selection and publication lead to Air desktop for OBS production. The 16 October web audit and canonical PROJ-061 handoff in the frontend repository record local verification and open acceptance/deployment gates. Drawer captures finish finite animations before saving; they do not represent intermediate motion frames.

## Regenerate

From D:/Esportra-Air, run node tools/audit-index-prd.cjs to extract the original requirements; reassess docs/coverage/index-coverage.json when code changes. From D:/frag-and-book-main, run node tools/export-air-uiux.cjs using the existing frontend build CSS. Then from D:/Esportra-Air run node tools/bracket-presentation-smoke.cjs to add the six actual HUD presentation captures, followed by node tools/build-uiux-reference.cjs and node tools/verify-uiux-reference.cjs. The exporter needs the installed Playwright/browser and frontend dependencies; it uses the real Air App and isolated helper tools/uiux-desktop-fixture.cjs.

## Journeys

- A: Tournament entry and eligibility
- B: Home and show ledger
- C: Create or select show
- D: Show identity and schedule
- E: Eight preparation steps
- F: Web pairing
- G: Node directory and revocation
- H: On-air talent
- I: Sponsors
- J: Crew management
- K: Invitation acceptance
- L: Assigned crew workspace
- M: Show flow and screen editing
- N: Platform live and end confirmations
- O: Post-show report
- P: Sponsor proof
- Q: VOD chapters
- R: Recorded activity
- S: Desktop machine role
- T: Desktop pairing
- U: Production readiness
- V: Customize broadcast and live controls
- W: Observer capture
- X: Browser outputs
- Y: Local score correction
- Z: Offline continuation
