# Local Air with Esportra staging

The staging frontend supplies the organizer controls. The local Air app connects directly to the staging backend. Air defaults to `https://api-staging.esportra.com`; `ESPORTRA_API_URL` overrides that value.

## OBS setup correction — 16 October 2026

Save your draft before quitting. Restart current source with npm start, then use Broadcast screens / Send to OBS. A disabled or unavailable replay buffer no longer blocks setup. In OBS, look for scenes beginning Air · in the selected scene collection. Connections shows Connected/Disconnect from actual OBS status. No manual HUD browser-source creation is needed. [Evidence and limits](audits/2026-10-16-obs-template-delivery-and-connections.md). No staging deployment performed.

## Current local workflow — 16 October 2026

Fully quit Air before running the current source; already-open windows and old installers predate these changes. Start at **Broadcast setup**, follow its highlighted next action, then use Prepare / Design / Operate navigation. Confirm lineups, connect equipment, add/customize screens, Send to OBS and open OBS controls. Start broadcast prepares a screen; Show screen on air takes it live. Start the stream in OBS Studio.

Preview data source is explicit: **No game data** is a clear canvas, **Sample data** is an isolated moving simulation, **Received match data** shows the real room including last received values. Layer changes update without reloading. [Verified local evidence and remaining live checks](audits/2026-10-16-charcoal-guided-workflow.md). No staging release was performed in this correction.

## Run the app

From PowerShell:

```powershell
Set-Location 'D:\Esportra-Air'
npm start
```

The start command rebuilds the renderer and launches Electron. Existing dependencies are installed in this checkout. On another checkout, run `npm ci` first; the native keytar dependency must match Electron's ABI. A previously built installer is available locally under `dist/`, which is not committed.

## Choose the PC role

For one PC observing and producing, choose **Use production mode**. In **Connections**, **Game capture on this PC → Start capture → Allow and start capture** enables GEP explicitly. Choosing production mode does not start capture. Capture-only mode is for a separate observer/player PC that sends data to the production PC over LAN.

Open **PC role** to change this later, including before pairing. If a restart is pending, choose **Change selection** or **Keep current role** to correct the choice. A service change requires restart after capture/production and active HUD consumers stop.

## Rehearse the staging connection

1. Sign in to the staging Esportra frontend with the organization account for your test tournament. Open **Run → Broadcast** (`/organizer/tournament/:slug?tab=broadcast`) and choose **Prepare broadcast**. The local frontend/backend changes must be deployed or run locally before their new controls appear; existing staging releases predate this continuation.
2. Follow the eight setup steps. Generate a pairing code and connect Air, choose an eligible match, preview its HUD, choose templates or individual screens, optionally add sponsors, then assign talent and crew. Existing tournament/team records are reused; completed matches are excluded.
3. Review and choose **Send match to Air**. Air receives the teams, logos, map pool, match veto, branding and selected screens. This does not start capture or streaming.
4. In Air open **Broadcast screens**. Rename/reorder screens, choose a design, and adjust HUD size/position. **Save draft** changes only Air. Connect OBS locally; choose an existing game/video/camera input to place behind the HUD. Air automatically adds the HUD browser sources when you choose **Send to OBS**; no URL copying or manual browser-source creation is required.
5. Open **OBS controls**, review readiness and start production. Use **Show screen on air**, **Pause automatic switch**, or **Skip this screen**. **Show preview on air** sends the OBS preview to viewers. Start/stop streaming in OBS. Start consented Valorant capture or connect the observer feed when ready; game events supply HUD data, while OBS supplies video.
6. Rehearse disconnect/reconnect, repeat Send to OBS and a local correction. Confirm retries do not duplicate sources or unexpectedly switch the on-air scene. Pending events retain their originating show. Air-only corrections preserve official tournament results; applying an official-result proposal requires separate authorized review.

Use staging test data: pairing creates a node, and show creation/configuration changes staging records. No live production readiness is claimed by the local tests.

## Known frontend findings

The requested bracket-contract, Payment Review variant and captain match-room null findings are logged in the frontend repository at `docs/known-issues/2026-10-14-frontend-staging.md`. They are open; the bracket finding has no confirmed visible defect. The Payment Review render failure and conditional match-room failure were identified from source, not reproduced in a browser.

## Independent account/project rehearsal

New independent APIs and `/air`/`/admin/air` are local changes. Existing staging lacks these until a separately authorized release. For an entirely local rehearsal, run the backend and frontend using their current repository run instructions, then start Air with `ESPORTRA_API_URL` pointing at that local backend. Use a real test Esportra account; no organizer verification or tournament is required.

1. Choose **Create independent broadcast**, sign in and create a workspace/project. Alternatively create the project in web `/air` and refresh Air.
2. Add both teams, logos and players. Enter exact in-game identities; keep HUD nicknames separate. Create a match with format/maps and optional schedule. Sponsors, talent and crew are optional.
3. Prepare that match in **Matches**, check **Teams & players**, connect OBS and opt-in game capture in **Connections**. Confirm uncertain identity bindings before production.
4. Preview/customize **Broadcast screens**; sample preview is labeled and isolated. Choose **Send to OBS** and check automatic sources and unchanged Program. Open **OBS controls** to take screens on air. Inspect **Live match** for incoming/stale/unknown data.
5. Test offline edits, reconnect/conflict review, explicit access denial and restart blocking after the active session finishes. Confirm independent events never alter official tournament results.

Apply migrations `20261015180000_air_workspaces_and_access.sql`, `20261015181000_air_production_events.sql`, `20261015182000_air_grant_device_limits.sql` before these APIs. A persistent backend `AirAccess:SigningPrivateKey` is required for release-quality offline leases; configure it through deployment secrets. Development keys are ephemeral. Never paste private signing material into source or documentation.

Super-admin `/admin/air` is separate from announcements Broadcasts. Check manual grants/extensions, limits, device revocation, audit and operational metadata using an authorized test administrator; no payments or raw packet upload. Full evidence: [current handoff](audits/2026-10-15-workspace-standalone-handoff.md). Live services, elapsed seven-day offline use and packaged installer remain separate acceptance.

## Screen and HUD setup in the current local app

Broadcast screens now has **Add screen** with previewable templates and individual screens. Added screens stay in this match's local draft; rename/order them before **Save draft** and **Send to OBS**. The new **HUD controls** sidebar page covers layers, screen content and live graphics. **Save HUD draft** leaves live output unchanged; **Send to OBS** applies that saved setup with screens. **Apply to live HUD** is explicitly immediate. Sample preview uses synthetic moving data and never updates the live room. After a live HUD action, the panel previews the actual source.

Fully quit the old Air process and run npm start to load these IPC/UI changes; old windows/installers remain old. [Current flow, checks and limits](audits/2026-10-15-screen-library-and-hud-workflow.md).
