# Local Air with Esportra staging

The staging frontend supplies the organizer controls. The local Air app connects directly to the staging backend. Air defaults to `https://api-staging.esportra.com`; `ESPORTRA_API_URL` overrides that value.

## Run the app

From PowerShell:

```powershell
Set-Location 'D:\Esportra-Air'
npm start
```

The start command rebuilds the renderer and launches Electron. Existing dependencies are installed in this checkout. On another checkout, run `npm ci` first; the native keytar dependency must match Electron's ABI. A previously built installer is available locally under `dist/`, which is not committed.

## Rehearse the staging connection

1. Sign in to the staging Esportra frontend with the organization owner account for the test tournament. Open its management dashboard and choose **Run → Broadcast** (`/organizer/tournament/:slug?tab=broadcast`). The new frontend/backend revisions must be deployed first.
2. Create or open the tournament's show. Select bracket matches, match codes and the rundown. Generate a pairing code for the show's organization; pair the local Air app before the code expires.
3. Preview the configuration and choose **Send configuration**. Verify that Air receives the expected tournament, teams, map pool and match veto. Sending does not start capture, start the rundown or take an OBS scene.
4. Connect local OBS WebSocket, verify preview/program and a manual scene take. Start Valorant capture only when the operator is ready. Observer/LAN and actual game capture require separate live checks and appropriate SDK availability.
5. Rehearse disconnect/reconnect and a local correction. Confirm queued events remain scoped to the originating show. Corrections do not overwrite official tournament results.

Use staging test data: pairing creates a node, and show creation/configuration changes staging records. No live production readiness is claimed by the local tests.

## Known frontend findings

The requested bracket-contract, Payment Review variant and captain match-room null findings are logged in the frontend repository at `docs/known-issues/2026-10-14-frontend-staging.md`. They are open; the bracket finding has no confirmed visible defect. The Payment Review render failure and conditional match-room failure were identified from source, not reproduced in a browser.
