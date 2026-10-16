# PROJ-061: customize before OBS and clearer broadcast actions

15 October 2026. Local implementation; no new commit, push, deployment or live acceptance.

## Operator workflow

The tournament dashboard's Broadcast workspace remains the eight-step preparation home: connect desktop, choose an eligible match, preview HUD, choose templates or individual screens, optionally add sponsors, assign talent, assign crew, review. Existing tournament/team/assets data is reused. The final action is **Send match to Air**.

Air then uses **Customize broadcast → Send to OBS → Open live controls → Start show flow**. The selected match remains visible. Producers rename/reorder screens, choose the installed screen design, drag or precisely position/size the HUD, and select an existing OBS video/camera input behind it. **Save draft** changes only Air. Input refresh preserves unsaved edits. Streaming starts in OBS; sending screens does not start streaming, game capture or change the on-air scene.

User-facing “rundown” becomes **Show flow**, explained as the screens viewers see in order. Production actions are **Show screen on air**, **Show preview on air**, **Pause automatic switch** and **Skip this screen**. Keyboard settings keep the existing actions, change/reset/conflict behavior and clearer descriptions. Internal API/type names retain compatibility.

## Automatic OBS preparation

The main process validates original pairing/show/match, current published plan and optimistic draft revision. URL injection, duplicate/foreign screens and invalid layout are rejected. The renderer supplies no browser-source URL. Stable local output aliases are generated from the selected screen designs. Explicit Send to OBS creates owned scenes and browser sources and attaches the selected existing video/camera input. Layout transforms apply only when the draft layout changes; retries preserve unchanged direct OBS adjustments. Automatic preparation uses same-PC OBS.

Current collection ownership, source collisions, streaming/recording, active show flow and opted-in OBS rehearsal are guarded. Scope/output/collection changes abort a pending send. Confirmed scene ownership persists for safe retries after partial failure. The operation never starts a stream, takes the on-air scene, removes a user scene/input or resets global OBS video settings. Existing named transitions and advanced collection/source-slot controls remain available. A successful send updates the workstation's screen mappings and local show-flow names/order.

The HUD preview connects read-only to the actual selected match room. Reference captures use isolated, explicitly labelled sample data. Game events supply data, not captured video. This work attaches an existing OBS capture/video/camera input; it does not create a game-capture device, webcam delivery service, addons system or vMix workflow.

## Verification

- Air: 136 tests and renderer build passed. Draft persistence includes renamed/order/layout state; stale scope, invalid canvas/URL and invalid video input are rejected. OBS retry/idempotence and unchanged-layout preservation pass.
- Native Electron: 45 checks and eight captures passed against synthetic backend/OBS fixtures. Actual HUD frame connects to the selected match with demo preview off. Saving has no OBS mutation; stale send is denied; explicit send creates HUD/video composition, updates the local flow and preserves actual Program; repeated send creates no duplicate input or transform.
- Web: 85 broadcast tests in 16 suites, scoped lint and production build/chunk/button/JSX checks passed. No backend change in this batch; earlier backend test evidence is historical.
- Sole UI reference: 140 real-component captures across all 26 A–Z groups. Original index and linked images remain the product brief. Renderer/overflow/gallery checks recorded separately in the generated reference.

Coverage stays **23 implemented / 18 partial / 12 missing**. E2.2 evidence is expanded; this is not a new completion percentage. Existing installer and staging releases predate these local changes. Actual tournament account, game/Overwolf/LAN/OBS device tests, release/deployment and independent acceptance remain pending. Continue the recorded partials; reserved missing capabilities still require user selection.

Sources: src/obs-template.js, src/obs-template-push.js, src/obs-controller.js, src/main.js, src/preload.js, src/renderer/components/TemplateSetup.jsx and TemplatePreview.jsx, tests/obs-template.test.cjs, tools/product-desktop-smoke.cjs; web SetupReview, tournament Broadcast and show-flow components; design/implemented.
