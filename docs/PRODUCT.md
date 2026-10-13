# Esportra Air: local product build

Updated 14 October 2026. This is an implemented, locally verified build of the web planning workspace and Windows production application. It has not been accepted, deployed, code-signed, or certified against a live Valorant/Overwolf/OBS/backend setup.

## Open the build

The unsigned Windows installer is `dist/Esportra Air Setup 0.1.0.exe`. The unpacked application is `dist/win-unpacked/Esportra Air.exe`. Build verification does not install either artifact or change the user's existing Air configuration.

Actual component screenshots are in [the product gallery](audits/product-smoke/index.html). These use synthetic local fixtures. The white preview/program frames in the producer screenshot are a one-pixel OBS test image; no video feed is claimed. The earlier 66-frame V3 static design pack remains in `design/PROJ-061-control-room-v3/`.

For source development, run `npm start` in this repository. Web pages belong to the existing `D:/frag-and-book-main` application; run its normal development command and sign in with the appropriate organization. Backend changes belong to `D:/esportra-backend`. This work did not deploy those changes.

## Plan on the web

1. Open `/broadcast/home`. Open Shows to create a show, or Get started to prepare an existing show. Creation opens guided setup.
2. Follow the nine steps: show identity, organization tournament, published bracket matches and unique match codes, desktop nodes, crew, on-air talent, sponsors, rundown, and Send to desktop. Crew, talent and sponsors are optional for a solo producer. On a phone, use the step selector.
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
