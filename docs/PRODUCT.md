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

Clickable prototype: https://claude.ai/artifact/1VrfQuDRMRyi9ajSSkosiC (private until shared).

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

Until Stage 4 the legacy app in `src/` and the HUD in `esportra-valorant-hud/` remain as they are. The legacy renderer does not build at commit `49a0f7d`, because `src/renderer/App.jsx` imports three components that commit deleted (`BroadcastConsole`, `ProductionReadiness`, `ProducerScreen`). The new app is built alongside it rather than repaired.
