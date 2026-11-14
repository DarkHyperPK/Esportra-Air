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
| R1 | **Graphics only.** Cue / Take / Hold / autopilot control Esportra graphics. Air never switches OBS scenes; it installs its scenes and reads which is on air. (Rework stage 4.) |
| R2 | **No duplicates of Valorant's own UI**: no killfeed, observer card or minimap frame from Air; the scorebug has no round timer and shows a beating spike when planted. (Rework stage 3.) |
| R3 | **Game picker.** A match starts with its game. Valorant works; other titles are shown as coming, never faked. |
| R4 | **App fonts: Archivo** (expanded width for titles and numbers) **+ JetBrains Mono.** HUD overlays keep their own fonts. |
| R5 | **Settings are about the software** (this PC, OBS connection, Esportra account, other PCs, keyboard, about). **The match is the centre**: teams, players, event, sponsors and graphics belong to it. Tournament is only a heading over its matches. The Layout tab is gone. |
| R6 | **Graphics control is the producer's choice (12 Nov):** Air (Live, Cued/Take and the screen rundown), Stream Deck / Companion, or both (Settings › Graphics control, asked in first run). The rundown is optional: rows of screens from My show, each with the producer's own rule, using only signals Air already reads. With Companion, Air sends game events and values and takes button actions over a keyed local-network connection; crews build their own triggers in Companion. The in-game HUD runs itself (Auto layers) and is not controlled from Companion. Air never switches scenes; Companion may, if the crew sets it up. Module: `packages/companion-module`. |
| R7 | **One Rundown per match (13 Nov)** replaces My show and the Autopilot tab. Sections use common broadcast names: Pre-show, Game, Between maps, Post-show. Full-screen rows come up on Take or by themselves; Starting soon / Break / Ending (the Holding screen) and Desk are scene rows the crew switches in OBS; the in-game HUD is one row with its parts as switches. New matches start with only the HUD row; templates (Standard, Results only, Manual) are optional. Only what is in the selected match's Rundown is installed in OBS. **OBS scene names stay** (`ESPORTRA · Break`, Gameplay, Full screen, Replay, Desk): scenes are layouts, not times, so one Full screen scene carries the intro and the champion; the broadcast names live on the Rundown sections. A finished match keeps the teams and players it was played with. |
| R8 | **VCT-style graphics (13 Nov).** The scorebug is built around the game's own round timer (we never cover it; the spike countdown fills the window only while the game blanks its timer), coloured by side. Every full-screen graphic that VCT shows over a live shot gets an over-the-game version; each Rundown row picks Full screen or Over the game. Colours are the event's own; no Riot or Champions marks. |
| R9 | **Graphics templates (13 Nov).** Producers make their own looks in Graphics › Templates: a style editor on Air's graphics (move, scale, layer, hide, opacity, fill, text, font, border, corners, depth, fixed words, entrance), with undo/redo, snapping, Save as copy and export/import. Data stays wired; a template only sets inline styles on listed parts, never code. Each event has a brand kit (Primary = event colour, Secondary, Panel, Text, Attack, Defence) that every graphic and template reads. The Rundown only picks a look per row (built-in or template); the HUD row picks a HUD template, which also lines up the scorebug's timer window. |
| R10 | **Templates everywhere (13 Nov).** Templates also cover Starting soon / Break / Ending, the Break frame and the Desk, picked on their Rundown rows (Break's look also chooses classic or frame). The editor shows moments on demand (Sample: pause, banner, scoreboard, poll…) and any backdrop, including a screenshot that stays on the PC. HUD parts play their entrance on air when they appear. Built-in looks are listed to start from; the pack window lists each graphic's looks. |

The rework plan and its stages are in `/root/.claude/plans` for this session and summarised in the status table below.

**`docs/SPEC.md` (approved 11 Nov) is the full product specification**: product model (event, talent, sponsors, cameras), the producer's journey, screens, Live, look and feel, language, reliability and game modules. Where this file and the spec differ, the spec wins.

## Focus and parked work (14 November 2026)

The work now is the core: finish it, polish it, test it and fix its bugs, with Valorant as the only game. Everything below is parked. Raise it again only when the core is done.

| Parked | What it would be |
|---|---|
| Results to Esportra | Map results sent for the organiser's review (backend: `/api/air/broadcast/packages/{id}/result-proposals` already exists) |
| Sponsor proof of play | Time each sponsor was really on air, with a report (backend package events already accept sponsor timing) |
| Other games | CS2 through GSI, PUBG Mobile's live data API, other stat tools, each as a game module |
| Your own elements in templates | Text, image, shape, logo wall and data fields in templates; exit animations; your own fonts |
| Remote and roles | Browser control on the LAN with roles; the Esportra relay for remote crew and observers |
| Template packs | One file with templates, a brand kit and assets; packs shared in an Esportra organisation |
| Deep live stats on Esportra | Kill-by-kill match stats from Air shown on Esportra, HLTV-style |
| Languages, several stages, pitch kit, licences | Graphics in other languages; one Air per stage sharing an event; a branded demo; licence status in Settings |

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
| OBS link (S2, reduced in rework stage 4) | `apps/desktop/src/main/{obs,scene-build}.ts` | Connection with status from OBS events (program scene, Studio Mode state, transitions, replay buffer), screenshots for the Live monitors, Save replay (F3, buffer only), automatic reconnect. Builds the scene model: Holding, Gameplay (with the full-screen host over the game), Fullscreen, Replay, Casters, with empty slots for the game feed and caster cams that read "Add your source" until OBS reports a source. **Never switches scenes** (no Take, Cut, Stinger, Preview or Studio Mode calls; a test checks the link has no such methods) and never starts the stream, recording or replay buffer. Tested against an in-memory OBS only. |
| Console graphics (S3) | `engine/.../{layers,actions}.rs`, `apps/desktop/src/{main/production.ts,renderer/screens/ConsoleScreen.tsx}` | Layer modes On / Auto / Off in `state.airLayers` (engine writes `show.*`; legacy writes become manual overrides), hotkeys 1–8, Q–I, A–J, rules (multi-kill callout, overrides clear at next match), named actions at `POST /control/action`, F1–F8 incl. toast and poll forms and HUD stinger, lower thirds and player spotlight, live data strip, event log (read-only `observe` WS role). Full-screen layer toggles are wired to OBS scene visibility. Pixel parity with JS overlays holds (14/14). Not verified on real OBS. |
| Autopilot (S4, graphics since rework stage 4) | `apps/desktop/src/main/autopilot/{show-runner,rundown,autopilot}.ts`, `renderer/components/Autopilot.tsx` | Off by default and never restored after a restart. Steps per match (Bo1/3/5: match intro, then per map back to the game when a round goes live, halftime after round 12, map result, series, then the winner). Each step shows a full-screen graphic in the host (or goes back to the game), optionally for N seconds, by cut or behind the HUD stinger. Presets: Standard, Results only, Manual. Matches › Autopilot explains how it works and shows every step as a sentence with its graphic, trigger, hold, time and transition. Steps arm on game events (match start, round live, halftime, round end, spike planted/defused, map end, delay), open a visible hold window, then show the graphic. Hold (H), Skip (S), Take now (Space). Nothing takes during a tech pause or timeout, and a cancelled take is never replayed. Tested with a fake clock and with the real engine; not verified with a live game. |
| Capture and player cams (S5) | `apps/desktop/src/main/capture-stats.ts`, `renderer/{screens/CaptureScreen,components/Cameras}.tsx`, engine `cams.set` + test-round `speed`/`seek`, HUD `playercams` + `camgrid` modules, `overlays/cam-grid.html` | Capture page: source, last data, messages/s, gaps; a feature table (Live / Quiet / Waiting / Player PC) with 60 s sparklines; live state; Simulate with speed (0.5–8×) and scrub. Cameras by link: Air makes an unguessable VDO.Ninja link per player, the player opens it, the HUD puts the stream in that player's frame (In-game) or a 5-up / 10-up wall (Full screen layer K), with a delay (VDO.Ninja `buffer`). The connected dot comes from the overlay page's VDO.Ninja iframe messages. The simulator does not feed the capture stats. **Unverified:** VDO.Ninja inside OBS's browser source, its `api` message names, and the delay limits all need your Windows PC; the sandbox cannot reach vdo.ninja. Player-PC capture waits for Stage 3. |
| Esportra account (Stage 2) | `apps/desktop/src/main/{esportra,esportra-lease}.ts`, `shared/esportra.ts`, `dev/fake-esportra.ts`, renderer Sign-in dialog, Readiness picker, Sync page | Email + password sign-in against the existing backend (`/api/auth/desktop-login`, `/api/air/{session,devices,access,auth/refresh}`), this PC registered as a production device, tokens in the OS-encrypted secrets file, signed 72 h offline lease verified locally (tamper, wrong PC, clock rollback and expiry are refused; an explicit refusal removes the lease). The producer's scheduled matches (`/api/air/broadcast/matches`, roster) are listed on Readiness and Sync; choosing one creates or updates the match on this PC with teams, tags, logos, best-of, tournament name (shown as the event name on air) and lineups. Quick matches never need an account. One-way: nothing about the show is sent back. Default host `https://api-staging.esportra.com` (override `ESPORTRA_API_URL`). **Not done:** Esportra-driven autopilot triggers (veto, check-in, series decided: the match list only carries a status), hosted camera links (needs a backend page and relay), result reporting, bracket/standings data. **Verified only against a stand-in backend** that mirrors the real handlers' shapes; never run against the real one. |
| Observer and player PCs (Stage 3, same network) | `engine/crates/air-engine/src/join.rs`, `apps/desktop/src/main/join.ts`, `renderer/components/Join.tsx` | The producer switches "Allow other PCs on this network to join" on (Capture page); Air makes a 6-character join code and the engine opens a **separate** port (default 5301) that serves only `/join` and `/join/hello`. A capture-only PC (Setup › This PC › Capture-only) enters the producer's address and code, then sends its GEP data there; it follows the producer's current match, can only add game data (never read state or change graphics), and a player PC may only send messages tagged with its own player id. Wrong codes are rate limited (5 per minute per address), a new code or switching off drops every joined PC, 12 PCs at most, 400 messages/s each. The code is kept in the encrypted secrets; the port exists only while joining is on. **Not done: remote mode** (producer and observer in different places through an Esportra relay): it needs a relay service in the Esportra backend, which is a separate repository. **Unverified on Windows:** firewall prompt behaviour, two real PCs, real GEP from a player PC. |
| Esportra Player (step 1) | `apps/player/`, `packages/capture/` | A separate small ow-electron app with its own installer for player and observer PCs (see `docs/PLAYER-CLIENT.md`). Step 1 is built: the GEP bridge, ingest client, join protocol, link and secrets moved into `packages/capture` (no dependencies) and are shared with Air; the Player app connects to a production PC with its address and join code, remembers it across restarts, runs in the tray, and starts capture only after consent each run. Tested against a stand-in production PC (2 tests) and in the browser against its dev host. **Not yet:** the tracker, tournament-mode reports, the observer marker and auto-replay. Not run on Windows or with real GEP. Air's capture-only mode stays until the Player app's observer role is proven. |
| Rework stage 1 (11 Nov) | `apps/desktop/src/renderer/{styles.css,screens/SettingsScreen.tsx,components/Chrome.tsx}`, `shared/{api,games}.ts`, `main/{store,production,art-check}.ts` | Archivo + JetBrains Mono bundled (Inter and Poppins removed from the app), livelier surfaces. Rail: Live · Matches · Scenes · Outputs · Capture · Settings. Settings holds only software settings. Match v2: game, lineups (display name, real name, Riot ID, photo), event and sponsors per match, migrated from older saves; a new match starts with the event and sponsors of the latest match of its tournament. Readiness "Internet" row replaced by a real agent-and-map-art reachability check. |
| Rework stage 2 (11 Nov) | `engine/crates/air-engine/src/roster.rs`, `apps/desktop/src/renderer/{components/NewMatch.tsx,components/MatchEditors.tsx,screens/ReadyScreen.tsx}`, `main/production.ts` (`createMatch`, `uploadImage`) | Matches page: new match, Esportra schedule, matches on this PC, and a match workspace (hero with logos and colours; Readiness, Teams and players, Talent and event, Graphics). New match wizard: game (Valorant; CS2, LoL and Dota 2 shown as coming), format, teams (name, tag, colour, logo), lineups (photo, display name, Riot ID, real name), talent, event and sponsors. Logos and photos are stored in the engine's asset store as PNG (converted and capped at 512 px wide by Electron in the app; the dev host accepts PNG only). The engine matches each player's in-game name to the lineup's Riot ID and shows the display name and photo (player profile and roster cards use the photo). Not verified with real Riot IDs from a live game. |
| Rework stage 3 (11 Nov) | `apps/desktop/src/renderer/screens/LibraryScreen.tsx`, `components/Preview.tsx`, `shared/library.ts`, `esportra-valorant-hud/{core/hud.js,overlays/fullscreen.html}`, engine `fullscreen.show` | HUD library (rail › Library): every graphic grouped (over the game, between rounds, full screen, holding and talent), each a live preview scaled over a gameplay-like backdrop, using a sample room seeded with the selected match's teams, logos, players and event; Play a sample round runs the test round there at 2×; a detail view says what it is, when it shows and where it lives in OBS. Banner styles are previewed side by side and chosen per match (also step 5 of the wizard). Full-screen graphics now live in one host page driven by `state.airFullscreen`; the Fullscreen scene holds one source and Air never toggles OBS items for them (rebuild removes the old per-graphic sources). Killfeed, observer card and minimap are off and gone from the console (Valorant draws them). The scorebug shows the round number instead of a timer and a beating spike when planted (the blank was reproduced only with incomplete team data; the planted state renders correctly). |
| Rework stage 4 (11 Nov) | `apps/desktop/src/renderer/screens/ConsoleScreen.tsx`, `components/{Preview,Autopilot}.tsx`, `screens/ReadyScreen.tsx`, `main/{production,obs}.ts`, `main/autopilot/*` | Live is graphics only. Two monitors render Esportra graphics (in-game HUD plus full-screen host) over the latest OBS program frame, or a sample backdrop: **Cued** (an ephemeral engine room `__ESA_SIM_CUE_<code>`: the live state with the cued changes) and **On air**. Layers, full-screen graphics, lower thirds, toasts, polls and sponsor reads are cued; one change per slot (a later cue replaces an earlier one, going back to the on-air value uncues it); layer rows show on-air → cued. **Take** (Space) applies the cue, **Cut** the same, **Stinger** (F7) plays the HUD wipe and lands the cue behind it; Clear cue; cueing can be switched off so changes go straight on air. Pauses, autopilot and the camera layout always go straight on air. OBS Take / Cut / Stinger, the scene chips, Studio Mode, replay playback with scene switching and the Segment → Scene table are removed. Not verified on real OBS or with a live game. |
| Rework stage 5 (11 Nov) | `apps/desktop/src/main/rehearsal.ts`, `shared/rehearsal.ts`, `renderer/components/Rehearse.tsx`, `NewMatch.tsx` (step 6), `ReadyScreen.tsx` (Rehearse tab), engine `Room::mutate` | **Rehearse**, private inside Air (an ephemeral room `__ESA_SIM_REH_<code>`, never an OBS output). The room is seeded as map 1 of the match (teams, logos, colours, players, photos, event, banner style) and the sample game's ten players are mapped by position to the match's lineup, so every graphic shows the producer's own names and photos. A scripted show at 1×, 2× or 4×: match start, rounds 1–3 from the test round (kills, plants, economy), a jump to halftime (12 rounds), the second half, map end, then series and winner. The match's own autopilot steps run against it (its preset and edits), with "Take manual steps for me" for the intro and winner; the beat timeline says what fired in each beat. Wizard step 6 ("Create match and rehearse") and a Rehearse tab on the match page; Autopilot tab links to it. Refused while live game data flows; switching match stops it. Engine: a sample room may change graphics during its test round, and the change carries into the state the round returns to (match rooms still refuse). Found by rehearsing: the map result printed "null" for ACS/ADR/HS, which GEP does not provide; it now ranks by kills and shows a dash, like the scoreboard. |
| Art on this PC (11 Nov) | `apps/desktop/src/main/art-cache.ts`, engine `GET /art/<path>` and `core/catalog.js` rewrite, `core/hud.js` | All 279 agent, ability, weapon and map pictures named in the HUD catalogue are downloaded in the background when Air starts (6 at a time, PNG only, at most 5 MB each, written atomically) into `<engine data>/art/`, and retried every minute while any are missing. The engine serves them at `/art/...` and rewrites the catalogue's `media.valorant-api.com` URLs to `/art/` as it serves `catalog.js`, so OBS sources, Library previews and the Live monitors use the copies on this PC and work offline. Only pictures are fetched; no game data is sent. They are fetched at runtime into the user's data folder, not bundled in the installer. Readiness: "All 279 … on this PC", "Downloading n of 279", or a warning with Download now. The HUD asks for a picture that failed at most once a minute (it used to retry on every redraw). Not verified with a real internet connection or in OBS on Windows. |
| Interface pass (11 Nov) | `apps/desktop/src/renderer/{styles.css,App.tsx,components/Chrome.tsx,components/Global.tsx}` and every screen | One consolidated stylesheet with real tokens (type scale, 4-point spacing, shape, elevation, layers) in place of three stacked override layers; dead rules removed. One top bar: product, where you are (page / match · event), the health of game data, OBS, Esportra and the engine (a word and a dot each; healthy ones shorten on smaller screens), search and the clock. Every page opens with the same header (what it is, one line on what you do there, its actions). Scenes and Outputs are one OBS section with two tabs, and its copy now says plainly that Air never switches scenes. Errors arrive as toasts that stay long enough to read; Ctrl+K searches pages, matches and actions; ? lists every shortcut; status drawers show the facts behind each connection. Laid out and checked at 1280 × 800 as well as 1600 × 1000. Found on the way: editing a match during a test round raised an error; the edit now reaches the engine when the round ends. |
| Look and feel | `apps/desktop/src/renderer/styles.css` | Soft geometry (radius tokens `--r-*`, pill status chips, layered surfaces, sentence-case Inter buttons) replaces the PRD's square corners at the producer's request; the colour rules (rose = on air only, amber = cued) are unchanged. |
| HUD overlays | `esportra-valorant-hud/` | Unchanged. |
| Legacy app | removed | The old Electron app (`src/`), its tests, the Overwolf capture child (`esportra-valorant-hud/capture/`, replaced by `apps/desktop/src/main/gep.ts` and `ingest.ts`), root `package.json` and `electron-builder.yml`, and six legacy smoke scripts in `tools/` were removed in Stage 4. Git history keeps them. The Esportra website has no Air pages (decision, 10 Nov); removing any that still exist there is a separate change in the website repo. |
| Windows build | `.github/workflows/air-windows.yml` | Tests, engine build and installer packaging on a Windows runner. Not yet run. |

### Stage 1 exit check (needs a Windows PC with Overwolf, Valorant and OBS)

The full, current list is `docs/WINDOWS-CHECKS.md`; the Overwolf submission facts are in `docs/OVERWOLF-SUBMISSION.md`. The steps below are the original Stage 1 check.

1. Install from the workflow's `esportra-air-windows` artifact and open Air.
2. Create a quick match. Setup › OBS: connect, choose the game capture as gameplay source, Install graphics in OBS.
3. Open each Air scene in OBS once; Check should show every check except Esportra as ready apart from the game feed.
4. Start game capture, accept the notice, join a Valorant custom game as observer. The in-game scene should show live data.
5. Close Air while OBS shows the in-game scene and choose “Keep graphics on air”: the HUD must keep updating. Reopen Air: the status note should read “reconnected”.

Known limits to verify there: whether GEP can be enabled when Valorant was already running before consent; ow-electron packaging and Overwolf terms for the whole app; real OBS behaviour.
