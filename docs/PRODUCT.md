# Esportra Air: local product build

Latest correction: actual OBS replay-status error 604 no longer blocks sending screens. Connected OBS shows Disconnect; imported templates survive navigation; static screen designs remain visible without sample game data. Official logo/wordmark and platform colors are used. [Evidence and restart/send steps](audits/2026-10-16-obs-template-delivery-and-connections.md): 156 tests / 58 native checks. Actual post-restart send remains pending.

Latest workflow: **Broadcast setup** now opens first, with Prepare / Design / Operate navigation and direct keyboard shortcuts. Charcoal replaces soft slate; preview modes are explicit and HUD switches no longer reload the iframe. [Current flow and evidence](audits/2026-10-16-charcoal-guided-workflow.md): 154 tests, 56 native checks, 179 reference screens. User/live acceptance remains open.

Latest workflow correction: **Add screen** now lives in Broadcast screens; **HUD controls** is in the sidebar; sample preview has moving isolated data. [Current flow and evidence](audits/2026-10-15-screen-library-and-hud-workflow.md): 154 tests, 54 native checks, 178 reference screens. User/live acceptance is still open.


Latest visual checkpoint: the user rejected the previous appearance. The actual desktop shell, match workspace, guide and screen editor were refined; visual acceptance remains open. [Changes, screenshots and checks](audits/2026-10-15-workspace-polish.md).


## Latest approved plan — 15 October 2026

The clearer sidebar workspace and independent account/project path are implemented locally across desktop, backend and web, including match/player/live views, source-backed brackets, walkthrough, offline drafts/access and dedicated Air admin. Current evidence: Air 148 tests/build; backend 149 API/42 Core; web 56 scoped tests/lint/build; native 51 checks; 172 A–Z reference captures. Older counts below describe earlier scope/releases. Original 53-requirement counts have not been reassessed for this extra plan. [Current workflow, evidence and release gates](audits/2026-10-15-workspace-standalone-handoff.md). No new commit, push, deployment or live/independent acceptance.


Updated 15 October 2026. The web planning workspace and local Windows production application are implemented in part. Backend `505f514` and frontend `ba8c37e3` passed staging CI, promotion and executed smoke checks; Air remains local `3012560`, unsigned and not certified against an actual Valorant/Overwolf/OBS/LAN/account rehearsal. The complete original `index.html` PRD is not delivered: the [53-requirement audit](coverage/INDEX-COVERAGE.md) records 23 functionally implemented, 18 partial and 12 missing requirements. These counts are not a percentage of product completion.

## PC role and single-PC broadcasts

Choose **production mode** when one PC observes Valorant and runs OBS. It supports local GEP capture alongside production. GEP starts only after **Start capture → Allow and start capture**; it does not auto-start. Match setup exposes **Game capture on this PC** directly. Capture-only mode is for sending game events to another production PC.

Use **PC role** from production navigation, Capture or pairing to change roles. Before restarting, **Change selection** reopens the choices and **Keep current role** cancels the pending change. Active production/capture and HUD consumers must stop before switching services. [Verified role fix](audits/2026-10-15-pc-role-and-single-pc-capture.md).

## Current broadcast workflow

Use the tournament Broadcast workspace to pair Air, select the existing eligible match and prepare screens/assets/talent/crew. Choose **Send match to Air**. In Air choose **Customize broadcast** to rename/reorder screens, choose a design and position/size the HUD before **Send to OBS**. Air creates the HUD browser sources and attaches the existing video/camera input you select. **Save draft** leaves OBS unchanged. After sending, **Open live controls → Start show flow**; start streaming in OBS. “Show flow” means the screens your audience sees in order.

Verified locally: Air 136 tests/build; native 47 checks/eight captures; web 85 broadcast tests, scoped lint and production checks. The sole reference now has 142 real-component captures across 26 A–Z groups. These synthetic checks do not certify live device/game/staging operation. See [the focused handoff](audits/2026-10-15-template-to-obs-handoff.md).

## Open the build

The unsigned Windows installer is `dist/Esportra Air Setup 0.1.0.exe`. The unpacked application is `dist/win-unpacked/Esportra Air.exe`. Build verification does not install either artifact or change the user's existing Air configuration.

The single active UI reference is [the implemented A–Z screen folder](../design/implemented/index.html), generated from real current components with synthetic API/IPC data. Original `index.html` and its linked images remain the product brief. Older three design variants are preserved only in the hash-verified history archive at `docs/archive/retired-uiux-2026-10-14.zip`. Prior [product smoke screenshots](audits/product-smoke/index.html) remain test evidence, not a competing UI reference; their white preview/program frames are a one-pixel OBS fixture rather than video.

For source development, run `npm start` in this repository. Web pages belong to the existing `D:/frag-and-book-main` application; use its staging deployment with the appropriate organization. Backend changes belong to `D:/esportra-backend`. See [the staging rehearsal guide](STAGING-TEST.md). The current local implementation includes new setup and production features. The existing installer and staging releases predate these changes; use npm start for current Air source.

## Plan on the web

1. Open `/broadcast/home`. Open Shows to create a show, or Get started to prepare an existing show. Creation opens guided setup.
2. Follow eight preparation steps: connect desktop, choose an eligible match, preview its HUD, select templates/screens, optional sponsors, talent, crew, and review/send. Existing tournament and match data is reused. Sidebar progress and the selected match stay visible; phone planning uses the step selector.
3. Generate a temporary desktop pairing code. Enter it on the workstation. A registered node and a recent heartbeat are separate checks; the web monitor does not claim local OBS or game-feed readiness.
4. Edit segment duration, notes and order in the show plan. Reorder is atomic. Send configuration when the plan is ready. A successful send means the server sent configuration, not that a workstation is ready to broadcast.

Title changes are blocked while the platform show is live. Tournament links must belong to the organization, and existing match slots must be compatible. Marking the platform show live or ended changes platform state; it does not switch or stop OBS.

Crew invites support producer, technical director, observer, replay operator and monitor. Accepted crew open `/broadcast/crew/shows` for their role brief, match codes and planned rundown. Crew workspace access does not grant organization editing rights or remote OBS control. Source credentials are not shown in the web crew workspace.

## Additional platform operations — 14 October 2026

Tournament management now includes **Run → Broadcast** at `/organizer/tournament/:slug?tab=broadcast`. Create a tournament-bound show, pair that show's organization, preview current tournament/match/veto data and send it to Air. Match selection now selects the corresponding veto and map pool in the existing HUD. Send remains explicit and active production defers application. Details: `D:/frag-and-book-main/docs/tournament-air-bridge.md`. Latest evidence is Core 246, web 84, Air 43 tests, browser 18 and native 11 fixture checks; unsigned installer rebuilt and verified.

Show settings now edit planned start in your browser timezone, store UTC and allow explicit clearing. Shows can duplicate planning into a fresh draft without crew or runtime history. Delete is available for unstarted shows without history; completed/live shows remain for reports. The node monitor confirms platform access revocation. Recorded activity shows acknowledged metadata with cursor pagination. Resolved teams/best-of and platform status labels distinguish the planned match and lifecycle.

Latest platform evidence: Core 243, API event guard 27 and frontend 64 tests passed; 13 browser fixture workflows/screenshots and production build passed. The earlier table below records the initial product checkpoint. Latest developer guide: `D:/frag-and-book-main/docs/broadcast-air-platform.md`. Database/live rehearsal and independent acceptance remain pending.

## Run on the desktop

1. Choose **Production** for the OBS desk or **Capture only** for a game observer, then pair. Role changes require a restart and are blocked while local capture, connected relay consumers or a rundown are active.
2. On Readiness, verify the loaded show and select the configured match code. Sending a new plan while capture or rundown is active defers it; stop the activity and explicitly apply the pending plan. An idle configuration load does not start a rundown.
3. In Producer, connect to OBS WebSocket using its actual host, port and password. Enable OBS Studio Mode. Prepare ESA scenes; existing scenes are preserved. The application reads tally and obtains actual preview/program screenshots from OBS.
4. In Outputs, save names for existing HUD overlays and match codes. Copy a localhost URL for OBS on this machine, or a LAN URL for another machine. Preview opens the existing overlay. Removing a saved output removes the Air bookmark; it does not delete an OBS browser source.
5. Start the loaded rundown from Readiness. Preview the required scene and use Take/F8 to put it on program. Stop rundown clears local timers and segments while leaving OBS program unchanged. Reload the saved plan before restarting.

The HUD implementation remains `esportra-valorant-hud/`. Air uses that server, capture adapter and overlay catalogue. `assets/` contains the company application icon; preview artwork and static screens are not a second Valorant HUD.

## Connect observer capture

Both production and observer nodes use the organization's pairing workflow. Use the match code provided by the loaded show. On each observer, explicitly start capture only after reading and confirming the privacy notice. Start is never automatic. Cancel leaves capture stopped.

Copy the observer pairing key on the observer computer. On the production desk, enter `host:port=key` in Observer machines; separate multiple addresses with commas. Existing addresses can omit a saved key. Keys are stored in the operating system credential vault. Restart applies target changes when no protected local activity is running.

Raw observed player/game data travels locally or over the authenticated LAN relay. It is not queued to Esportra's cloud event endpoint. Browser-origin relay connections and unauthorized external consumers are rejected. Scoped packets must match the selected show and match code. Healthy game-feed status requires recent accepted packets; a running child process alone is insufficient.

LAN access requires the computers' existing network/firewall configuration to permit the HUD/relay ports (5300/5301 by default). This build does not change firewall settings. Overwolf/game operation and applicable distribution approval must be validated before release.

## Corrections and offline operation

Review a score correction before applying it. The local HUD update preserves team identities and other maps. The correction queues an audit record for its originating show; it does not overwrite an official bracket result.

Cached show configuration remains available offline. Contracted production events and corrections have durable identities, signed queue records and acknowledged batch delivery. Records appended during delivery survive rewriting. Events from separate shows are never mixed into the same request. Rejections stay queued. Historical records without a trustworthy originating show remain queued rather than being assigned to the current show.

## Verification evidence

| Area | Evidence | Limit |
| --- | --- | --- |
| Air | 41 Node tests passed; renderer build passed | Includes real local HUD HTTP/WS tests, not a live game |
| Desktop | 11 native Electron interaction checks passed | Synthetic local platform and OBS protocol fixtures; native keytar module loads, credential methods are isolated |
| Web | 25 focused tests passed; 8 browser/layout checks and 8 screenshots passed | Actual components/hooks with local API/DB fixtures |
| Web build | Vite production build, chunk, button and JSX checks passed | Global strict TypeScript check still fails outside the affected broadcast code; no broadcast diagnostics in the final run |
| Backend | API tests project builds with zero errors; prior Core 227 and event guard 27 tests passed | Four existing fake-ADO nullability warnings; new PostgreSQL integration tests compiled but could not run without Docker/PostgreSQL |
| Windows package | Unsigned NSIS installer built; packaged native/runtime dependencies loaded; capture SDK included; protected file checks passed | Installer not installed, signed, published or live-game certified |

Repeat Air tests with `npm test`. Run `node tools/product-desktop-smoke.cjs` for the isolated desktop fixture. Build the web app before running `node tools/product-web-smoke.cjs` from the frontend repository. These fixtures use temporary data and must not be treated as independent acceptance.

The verified package command uses the installed Electron/native modules:

```powershell
$env:ELECTRON_BUILDER_CACHE = Join-Path $env:TEMP 'air-electron-build-cache'
$env:npm_config_cache = Join-Path $env:TEMP 'air-build-npm-cache'
npx electron-builder --win --x64 --config.electronDist=node_modules/electron/dist --config.npmRebuild=false
node tools/verify-product-package.cjs
```

Run `npm run build:renderer` first after source changes. Normal `npm run build:win` also builds the renderer and can rebuild native dependencies, which may require the usual build tools/network. The package report records the tested artifact's SHA-256 in `audits/product-smoke/package-result.json`.

## Outstanding release evidence

Run the new database integration suite in its PostgreSQL/Docker fixture, followed by one real web-to-node configuration, observer relay, OBS take, correction and offline reconnect rehearsal. Obtain independent runtime QA and the existing acceptance decision. Signing and deployment need their own authorized release work.

The earlier implementation checkpoint was saved and read back through Obsidian MCP on 13 October. MCP was initially unavailable on 14 October, then returned during the backend/frontend continuation. Final product and platform findings are now saved and read back in `08-Sessions/2026-10-14-PROJ-061-Backend-Frontend-Implementation.md`, curated product/domain notes, Current-Work and Session-Index. [The original local handoff](audits/2026-10-14-product-handoff.md) retains that outage history. No filesystem write bypassed the vault boundary; no commit, push or deployment was performed.

## 14 October setup simplification

Preparation now follows eight steps in the tournament Broadcast workspace: connect Air, choose an eligible match, preview HUD, choose screens, optionally add sponsors, assign talent, assign crew and review. Desktop receives that match/flow, checks local systems and runs production. Shortcuts are editable and checked for conflicts. This redesign is local source only; it is not the previous staging release or installer. See [the current handoff](audits/2026-10-14-setup-uiux-handoff.md) for verification and pending database/live/Obsidian work.


## Partial requirements follow-up — 14 October 2026

The user authorized completion of the existing 38 partial requirements and reserved the 13 missing requirements for a later selection. The first production batch closes five functional scopes locally: OBS discovery/connection inspection (E2.1), replay playback/return (E2.5), Take/Cut/Stinger controls (E4.1), current/next/coming-up (E4.2), and the game data strip with combined event log (E4.6). Current audit: 7 implemented / 33 partial / 13 missing. The complete product remains unfinished.

Scene mappings, missing-scene start guards, independent team timeout, actual parsed-event graphics rules, persistent graphics timings and expanded shortcuts improve other partial requirements. Web/phone controls, node assignment and graphic layers remain dependent on the user's missing-feature selection. No missing requirement is claimed implemented.

Air passes 70 automated tests, its renderer build and 18 native Electron fixture checks. The reference has 103 current component captures across 26 A–Z groups. These checks use synthetic OBS/platform data; live hardware/game/latency acceptance remains pending. Staging and the installer still predate this work. This batch does not change backend source and does not resolve the earlier Docker/PostgreSQL test blocker.

The full original-partial register, missing-selection numbers, evidence and continuation are in D:/Esportra-Air/docs/audits/2026-10-14-partial-completion.md. Obsidian MCP is unavailable; this is a pending local handoff, not a successful vault update. Reconcile shared notes through MCP when it becomes available.


### E1.6 correction — 14 October 2026

Player-PC health/ability support already has GEP capture-agent and HUD-adapter hooks. The normal Air launcher does not expose or pass player identity, and per-player coverage/live verification is unfinished. E1.6 is corrected from missing to partial; no duplicate GEP implementation is needed. Current audit is 7 implemented / 34 partial / 12 missing. This correction delivers no new runtime functionality. The full evidence is in D:/Esportra-Air/docs/audits/2026-10-14-partial-completion.md. Obsidian sync is pending because MCP is unavailable.


### Continuing partial requirements — 14 October 2026

Latest local audit: **12 implemented / 29 partial / 12 missing**. This supersedes the earlier 7/34/12 checkpoint. Newly closed scopes: pairing recovery (E1.1), stale-feed warning chain (E1.4), packaged isolated rehearsal (E1.5), owned OBS collection/source slots (E2.2), round chapters (E8.4). Player GEP, observer recovery, stable output aliases, inline graphics and durable sponsor-proof delivery advance other partials without claiming numerical ability charges, one-way latency, automatic proof visibility, official result integration or user-reserved missing capabilities.

Air 94 automated tests/build, 26 native local fixture checks, PostgreSQL broadcast 117 tests plus subsequent lifecycle 3/pairing 2, Core targeted 7, frontend health 3/scoped lint/full production build passed. Native polling now awaits actual IPC states. Original index.html is preserved; one implemented A–Z reference remains. Latest export/format verification passed. Sources and all remaining scope: D:/Esportra-Air/docs/audits/2026-10-14-partial-completion.md and docs/coverage/index-coverage.json.

Obsidian MCP is restored and pending findings have been consolidated/read back. Current work remains uncommitted, undeployed and unaccepted; previous staging/installer state remains separate. Next: continue remaining partials, preserving existing missing-feature selection numbers and live/independent acceptance gates.


Latest verified invitation checkpoint: **13 implemented / 28 partial / 12 missing** after closing E7.2 locally. All 122 PostgreSQL broadcast API tests, email recipient/inbox guards, frontend binding compatibility 2 tests and scoped lint pass. Production frontend build passes. Implemented reference has 117 real-component fixture captures across 26 A–Z groups; renderer/overflow/gallery checks pass. No actual external email, new deployment or acceptance. Account-bound invites disappear if the bound account is deleted, rather than reopening to another account. Continue the remaining partials, next timeline/incident visibility.


Latest timeline/incident continuation: **15 implemented / 26 partial / 12 missing**, closing E6.4/E6.5 locally. Air 101 tests/build, native 27, PostgreSQL broadcast 125, web build/scoped lint and 119 A–Z reference captures pass. Actor categories are source/operation labels, not certified employee identity; only confirmed OBS takes count in new records. Demo rooms/timers and cached-feed/pairing races were hardened. Current work is uncommitted, undeployed and independently unaccepted. Full evidence/remaining scope: Air docs/audits/2026-10-14-partial-completion.md. Continue publication/templates, holds and tournament data/branding without silently implementing reserved missing capabilities.

## Correction and official-result review — 15 October 2026

Local source now covers Air-only or Air-plus-official-review map corrections, team/player display names, scores, sides, series wins and observed-player fixes. Overrides preserve source GEP, have round/clear lifetimes, and support audited current-session Undo. Undo changes the overlay only; it does not withdraw a delivered proposal or reverse an approved result.

An official proposal persists in the original-pairing/show/match/team disk queue. Web show and assigned-crew workspaces show current versus proposed scores and require explicit approval/rejection. Only active crew with can_submit_result can review, including the organization owner. Stale official scores, changed teams/format and finalized/closed matches are guarded. Atomic map/series/audit writes and idempotent review prevent partial approvals. Completed-match final scores reach the HUD without returning played matches to the picker or switching OBS. Automatic GEP verified results, Riot checks and the full dispute/advancement loop remain unfinished.

Evidence: Air 132 tests/build, native 43 checks/seven captures; backend all 139 broadcast API tests; web 85 tests in the scoped 16-suite run plus final result-review 3, scoped lint and production build. No broadcast TypeScript diagnostics were found; global errors remain outside broadcast. The sole reference has 136 A-Z captures and passed renderer/overflow/gallery checks. No new commits, deployment or live/independent acceptance. Full detail: [result review handoff](audits/2026-10-15-result-review-handoff.md).
