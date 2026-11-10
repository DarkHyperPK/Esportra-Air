# Esportra Air — product direction

Agreed 10 November 2026 in product discovery. This document replaces the earlier build log. Earlier handoffs remain in `docs/audits/` and in git history for reference only. They do not describe the direction.

## Purpose

Esportra Air connects tournament operations to broadcast production. Esportra tournament data and live game data go in. Broadcast-ready graphics come out. OBS or vMix stays in charge of the show.

Air is not a switcher. It never composites, encodes, streams, records or switches scenes.

## Who it is for

One product, three deployment shapes:

| Shape | Machines |
|---|---|
| Solo producer (the default experience) | One PC observes Valorant, runs Air and OBS |
| Small crew | Observer PC and production PC, on the same network or in different locations |
| Studio | Air as the data and graphics source inside an existing OBS/vMix workflow |

Studios with their own in-house graphics teams are out of scope.

## Decisions of 11 November 2026 (supersede the rows below where they conflict)

| # | Decision |
|---|---|
| R1 | **Graphics only.** Cue / Take / Hold / autopilot control Esportra graphics. Air never switches OBS scenes; it installs its scenes and reads which is on air. (Being built in rework stage 4; until then the earlier OBS switching is still in the code.) |
| R2 | **No duplicates of Valorant's own UI**: no killfeed, observer card or minimap frame from Air; the scorebug has no round timer and shows a beating spike when planted. (Rework stage 3.) |
| R3 | **Game picker.** A match starts with its game. Valorant works; other titles are shown as coming, never faked. |
| R4 | **App fonts: Archivo** (expanded width for titles and numbers) **+ JetBrains Mono.** HUD overlays keep their own fonts. |
| R5 | **Settings are about the software** (this PC, OBS connection, Esportra account, other PCs, keyboard, about). **The match is the centre**: teams, players, event, sponsors and graphics belong to it. Tournament is only a heading over its matches. The Layout tab is gone. |

The rework plan and its stages are in `/root/.claude/plans` for this session and summarised in the status table below.

## Product decisions

| Area | Decision |
|---|---|
| Switcher boundary | Air installs its own scenes and browser sources in OBS with one click, and reads which scene is on air. Every switch is done in OBS/vMix. |
| Tournament data | Comes from Esportra. Air adds only a quick match (two teams, logos, best-of) for scrims and showmatches. Air has no team, roster or bracket editors. |
| Website | The Esportra website has no Air pages. Air talks to the Esportra backend directly, and all broadcast setup lives in Air. |
| Live role | During play the producer watches health and has four manual actions with hotkeys: pause/timeout panel, caster strap, sponsor read, score/name correction. Everything else runs from data. |
| Results | One-way in v1 (Esportra → Air). Reporting results back is a later stage. |
| Games | Valorant only in v1, built as a game module so another title can be added. |
| Customisation | Curated graphics package, tournament brand, each screen and HUD element on/off, and layout adjustments (move/resize HUD elements, reorder/rename screens). |
| Transport | **Local** (default): one PC or same-network PCs; game data never leaves the local network. **Remote**: observer and producer in different places; the game feed travels through an Esportra relay and the producer's Air draws the HUD with an adjustable delay. Remote mode has its own consent. |
| Other PCs | **Esportra Air is standalone production only.** Capture on observer and player PCs is a separate app, Esportra Player (see `docs/PLAYER-CLIENT.md`), that connects to Air with a join code. Air's capture-only mode stays until the Player app has the observer role, then is removed. |
| Getting in | Producer signs in with an Esportra account. Observer and player PCs join with a short code shown in the producer's Air. |
| Setup unit | Tournament setup once (graphics, brand, layout, OBS). A short routine for each match. |
| Checks | Warn, never block. Problems stay visible on air. |
| Kept from the old app | Player-PC capture (live health and abilities from competitors' PCs). |
| Parked | Reporting to Esportra (sponsor proof, timeline, VOD chapters, offline queue), crew roles, observer markers. |
| Retired | Show-runner and autopilot rules, rundowns, take/cut/stinger, replay control, vMix control, independent projects and editors, website pairing and the web broadcast-preparation flow, PC-role screen, result proposals. All remain in git history (last legacy commit `49a0f7d`). |

## Experience

```
┌──────────────────────────────────────────────────────────────┐
│ Community Cup ▾          1 Match    2 Check    3 Live       ⚙ │
├──────────────────────────────────────────────────────────────┤
│                     (current stage)                          │
├──────────────────────────────────────────────────────────────┤
│ ● Game feed   ● Graphics   ● OBS   ● Esportra                │
└──────────────────────────────────────────────────────────────┘
```

- **Tournament setup** (from the tournament name, done once): Graphics, Brand, Layout, OBS. "Install graphics in OBS" adds one Air scene per screen. Each output also has a URL for vMix or manual use.
- **1 Match:** pick a scheduled match or create a quick match; see both lineups and casters.
- **2 Check:** a self-verifying checklist (lineups, graphics in OBS, graphics rendering, game feed, Esportra) with in-place fixes, capture consent, and a test round that plays sample data through the real outputs.
- **3 Live:** health tiles, a compact match readout, and the four manual actions. "Next match" returns to Match with setup intact.
- **Status strip:** every indicator opens its problem and fix.

Clickable prototype: https://claude.ai/artifact/1VrfQuDRMRyi9ajSSkosiC (private until shared). The built app replaces the prototype's placeholder “packages” with the HUD's four real banner themes, and its Layout tab edits screen order, names and placement plus the minimap frame (overlay elements themselves have fixed positions today).

## Architecture

```
ow-electron app (one Electron runtime)        Rust graphics engine (separate process)
  main: GEP listener, engine supervisor,  ──▶   Valorant parser → match state
        OBS setup/status, sign-in               rooms, merge-patch, persistence
  renderer: React + TypeScript UI         ──▶   serves overlays to OBS (HTTP + WebSocket)
                                                corrections, triggers, test round, transport
```

- **Why Rust:** reliability on air. The engine runs separately from the window, so a UI crash or restart never takes graphics off air. The window re-attaches to a running engine.
- **Why ow-electron for the whole app:** Overwolf Game Events (GEP) are only available in the ow-electron main process. Running the whole app on ow-electron replaces today's two runtimes (stock Electron plus a hidden ow-electron capture child) with one.
- **Compatibility:** the engine keeps the existing HUD WebSocket/HTTP protocol, so all overlays in `esportra-valorant-hud/overlays/` run unchanged.
- **Remote relay:** a pass-through in the Esportra backend that forwards frames between members of a production and stores nothing. Parsing always happens on the producer's engine.

## Build stages

| Stage | Outcome |
|---|---|
| 0 | Clickable prototype approved; this document and `CLAUDE.md` updated |
| 1 | Rust engine (parity with today's HUD server and parser), ow-electron shell, OBS install/status, the Match/Check/Live interface — on custom matches, local mode |
| 2 | Esportra sign-in and tournaments, using the existing `/api/air/*` endpoints. Pilot milestone |
| 3 | Same-network observer PCs, join codes and remote mode, player-PC capture. **v1** |
| 4 | Remove the legacy app (`src/`, capture child) and the Air pages on the Esportra website |

Outside the build: Overwolf app approval (developer account exists, app not yet approved) and Windows code signing (`sign.md`).

## Current code

| Part | Where | Status |
|---|---|---|
| Graphics engine (Rust) | `engine/` | Stage 1 built. Golden parity with the JS parser on three recorded fixtures; 14 overlays render pixel-identical to the JS server; test round; feed-paused tag; control API. |
| Desktop app (ow-electron, React + TypeScript) | `apps/desktop/` | Stage 1 built on quick matches: Match → Check → Live, production setup, OBS install/status, GEP capture with consent, triggers, engine supervision and re-attach. Walkthrough passes in Chromium against the real engine with a simulated game and in-memory OBS. |
| OBS control (S2) | `apps/desktop/src/main/{obs,scene-build,replay}.ts` | Studio Mode, PVW/PGM tally from OBS events, Take / Cut / Stinger with the transition restored afterwards, screenshots for the monitors, replay (F3), automatic reconnect. Builds the PRD scene model: Holding, Gameplay, Fullscreen, Replay, Casters, with empty slots for the game feed and caster cams that read "Add your source" until OBS reports a source. Never starts the stream, recording or replay buffer. Tested against an in-memory OBS only. |
| Console graphics (S3) | `engine/.../{layers,actions}.rs`, `apps/desktop/src/{main/production.ts,renderer/screens/ConsoleScreen.tsx}` | Layer modes On / Auto / Off in `state.airLayers` (engine writes `show.*`; legacy writes become manual overrides), hotkeys 1–8, Q–I, A–J, rules (multi-kill callout, overrides clear at next match), named actions at `POST /control/action`, F1–F8 incl. toast and poll forms and HUD stinger, lower thirds and player spotlight, live data strip, event log (read-only `observe` WS role). Full-screen layer toggles are wired to OBS scene visibility. Pixel parity with JS overlays holds (14/14). Not verified on real OBS. |
| Autopilot (S4) | `apps/desktop/src/main/autopilot/{show-runner,rundown,autopilot}.ts`, `renderer/components/Autopilot.tsx` | Off by default and never restored after a restart. Rundown per match (Bo1/3/5: starting soon, intro, map live / result / break, series, casters, ending) edited in Scenes › Segment → Scene (trigger, OBS scene, transition, hold, mode, order). Segments arm on game events (round live, round end, spike planted/defused, map end, delay), open a visible hold window, then take through OBS Studio Mode. Hold (H), Skip (S), Take now (Space). Nothing takes during a tech pause or timeout or while OBS is disconnected, and a cancelled take is never replayed. Agent select / Series layers moved to Shift+H / Shift+S. Esportra triggers (veto, check-in, series decided) wait for Stage 2. Tested with a fake clock and with the real engine + fake OBS; not verified on real OBS. |
| Capture and player cams (S5) | `apps/desktop/src/main/capture-stats.ts`, `renderer/{screens/CaptureScreen,components/Cameras}.tsx`, engine `cams.set` + test-round `speed`/`seek`, HUD `playercams` + `camgrid` modules, `overlays/cam-grid.html` | Capture page: source, last data, messages/s, gaps; a feature table (Live / Quiet / Waiting / Player PC) with 60 s sparklines; live state; Simulate with speed (0.5–8×) and scrub. Cameras by link: Air makes an unguessable VDO.Ninja link per player, the player opens it, the HUD puts the stream in that player's frame (In-game) or a 5-up / 10-up wall (Full screen layer K), with a delay (VDO.Ninja `buffer`). The connected dot comes from the overlay page's VDO.Ninja iframe messages. The simulator does not feed the capture stats. **Unverified:** VDO.Ninja inside OBS's browser source, its `api` message names, and the delay limits all need your Windows PC; the sandbox cannot reach vdo.ninja. Player-PC capture waits for Stage 3. |
| Esportra account (Stage 2) | `apps/desktop/src/main/{esportra,esportra-lease}.ts`, `shared/esportra.ts`, `dev/fake-esportra.ts`, renderer Sign-in dialog, Readiness picker, Sync page | Email + password sign-in against the existing backend (`/api/auth/desktop-login`, `/api/air/{session,devices,access,auth/refresh}`), this PC registered as a production device, tokens in the OS-encrypted secrets file, signed 72 h offline lease verified locally (tamper, wrong PC, clock rollback and expiry are refused; an explicit refusal removes the lease). The producer's scheduled matches (`/api/air/broadcast/matches`, roster) are listed on Readiness and Sync; choosing one creates or updates the match on this PC with teams, tags, logos, best-of, tournament name (shown as the event name on air) and lineups. Quick matches never need an account. One-way: nothing about the show is sent back. Default host `https://api-staging.esportra.com` (override `ESPORTRA_API_URL`). **Not done:** Esportra-driven autopilot triggers (veto, check-in, series decided: the match list only carries a status), hosted camera links (needs a backend page and relay), result reporting, bracket/standings data. **Verified only against a stand-in backend** that mirrors the real handlers' shapes; never run against the real one. |
| Observer and player PCs (Stage 3, same network) | `engine/crates/air-engine/src/join.rs`, `apps/desktop/src/main/join.ts`, `renderer/components/Join.tsx` | The producer switches "Allow other PCs on this network to join" on (Capture page); Air makes a 6-character join code and the engine opens a **separate** port (default 5301) that serves only `/join` and `/join/hello`. A capture-only PC (Setup › This PC › Capture-only) enters the producer's address and code, then sends its GEP data there; it follows the producer's current match, can only add game data (never read state or change graphics), and a player PC may only send messages tagged with its own player id. Wrong codes are rate limited (5 per minute per address), a new code or switching off drops every joined PC, 12 PCs at most, 400 messages/s each. The code is kept in the encrypted secrets; the port exists only while joining is on. **Not done: remote mode** (producer and observer in different places through an Esportra relay): it needs a relay service in the Esportra backend, which is a separate repository. **Unverified on Windows:** firewall prompt behaviour, two real PCs, real GEP from a player PC. |
| Esportra Player (step 1) | `apps/player/`, `packages/capture/` | A separate small ow-electron app with its own installer for player and observer PCs (see `docs/PLAYER-CLIENT.md`). Step 1 is built: the GEP bridge, ingest client, join protocol, link and secrets moved into `packages/capture` (no dependencies) and are shared with Air; the Player app connects to a production PC with its address and join code, remembers it across restarts, runs in the tray, and starts capture only after consent each run. Tested against a stand-in production PC (2 tests) and in the browser against its dev host. **Not yet:** the tracker, tournament-mode reports, the observer marker and auto-replay. Not run on Windows or with real GEP. Air's capture-only mode stays until the Player app's observer role is proven. |
| Rework stage 1 (11 Nov) | `apps/desktop/src/renderer/{styles.css,screens/SettingsScreen.tsx,components/Chrome.tsx}`, `shared/{api,games}.ts`, `main/{store,production,art-check}.ts` | Archivo + JetBrains Mono bundled (Inter and Poppins removed from the app), livelier surfaces. Rail: Live · Matches · Scenes · Outputs · Capture · Settings. Settings holds only software settings. Match v2: game, lineups (display name, real name, Riot ID, photo), event and sponsors per match, migrated from older saves; a new match starts with the event and sponsors of the latest match of its tournament. Readiness "Internet" row replaced by a real agent-and-map-art reachability check. |
| Look and feel | `apps/desktop/src/renderer/styles.css` | Soft geometry (radius tokens `--r-*`, pill status chips, layered surfaces, sentence-case Inter buttons) replaces the PRD's square corners at the producer's request; the colour rules (rose = on air only, amber = cued) are unchanged. |
| HUD overlays | `esportra-valorant-hud/` | Unchanged. |
| Legacy app | removed | The old Electron app (`src/`), its tests, the Overwolf capture child (`esportra-valorant-hud/capture/`, replaced by `apps/desktop/src/main/gep.ts` and `ingest.ts`), root `package.json` and `electron-builder.yml`, and six legacy smoke scripts in `tools/` were removed in Stage 4. Git history keeps them. The Esportra website has no Air pages (decision, 10 Nov); removing any that still exist there is a separate change in the website repo. |
| Windows build | `.github/workflows/air-windows.yml` | Tests, engine build and installer packaging on a Windows runner. Not yet run. |

### Stage 1 exit check (needs a Windows PC with Overwolf, Valorant and OBS)

1. Install from the workflow's `esportra-air-windows` artifact and open Air.
2. Create a quick match. Setup › OBS: connect, choose the game capture as gameplay source, Install graphics in OBS.
3. Open each Air scene in OBS once; Check should show every check except Esportra as ready apart from the game feed.
4. Start game capture, accept the notice, join a Valorant custom game as observer. The in-game scene should show live data.
5. Close Air while OBS shows the in-game scene and choose “Keep graphics on air”: the HUD must keep updating. Reopen Air: the status note should read “reconnected”.

Known limits to verify there: whether GEP can be enabled when Valorant was already running before consent; ow-electron packaging and Overwolf terms for the whole app; real OBS behaviour.
