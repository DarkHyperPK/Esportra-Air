# CLAUDE.md — Esportra-Air

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

## Read first

`docs/PRODUCT.md` is the agreed product direction (10 November 2026): purpose, decisions, experience, architecture and build stages. Follow it. If a request conflicts with it, raise the conflict instead of quietly drifting back to the retired direction.

Esportra Air connects Esportra tournament data and live game data to broadcast graphics. It is **not** a switcher: it never composites, encodes, streams, records or switches scenes. It installs its own scenes/sources in OBS and reads on-air status only.

## Repository today

```
Esportra-Air/
├── docs/PRODUCT.md              ← agreed direction and stages
├── esportra-valorant-hud/       ← HUD: overlays, core, server, Valorant GEP adapter (kept)
│   ├── overlays/                ← 46 HTML overlays (must keep working unchanged)
│   ├── core/                    ← hud.js client, state defaults, catalog, brand, assets
│   ├── server/server.js         ← current HUD server (protocol the Rust engine must keep)
│   ├── adapters/valorant-gep.js ← GEP → state parser (pure; parity reference for Rust)
│   └── adapters/test-valorant.js ← already failing (see Known facts)
├── engine/                      ← Rust graphics engine
├── apps/desktop/                ← Esportra Air (production app)
├── apps/player/                 ← Esportra Player (capture app for player and observer PCs)
├── packages/capture/            ← shared: GEP bridge, ingest client, join protocol, secrets
├── screens/, index.html         ← PRD pictures and the PRD
└── tools/                       ← PRD/UI reference scripts
```

The app:

```
engine/                 Rust workspace: air-state (JSON semantics, merge/diff), air-valorant (parser),
                        air-engine (server binary); fixtures/ golden data recorded from the JS pipeline
apps/desktop/           ow-electron app: src/main (engine supervisor, GEP, OBS, production model),
                        src/renderer (React interface), dev/ (dev host + walkthrough), test/
```

Commands: `cd apps/player && npm test && npm run typecheck && npm run build` (Player app); `cd engine && cargo test --workspace && cargo build --release`; `cd apps/desktop && npm test && npm run typecheck && npm run build`. Re-record fixtures after changing the JS parser: `node engine/fixtures/record.cjs`. Overlay parity: `node engine/tools/overlay-parity.cjs`. Full journey: `node apps/desktop/dev/host.ts` then `node apps/desktop/dev/walkthrough.cjs <dir>`.

## Running the current HUD

```bash
cd esportra-valorant-hud
npm install
node server/server.js
```

Overlays: `http://localhost:5300/overlays/<name>.html?match=CODE`. WebSocket `ws://host:5300/ws?match=CODE&role=overlay|control|ingest&key=…`. Writes require the key passed at startup.

## Key conventions

- **One shared state object per match room.** Clients receive `snapshot`, then RFC 7386 merge `patch` messages with an incrementing `v`; a gap triggers `resync`. Overlays acknowledge with `rendered`.
- **Overlays are plain HTML/JS/CSS**, no build step. `update(state)` redraws, `tick(state)` runs 10×/s, animations fire on state deltas.
- **Art assets** (agents, abilities, weapons, maps) are downloaded once from `media.valorant-api.com` into `<engine data>/art/` by Air (`apps/desktop/src/main/art-cache.ts`) and served by the engine at `/art/`; the engine rewrites `core/catalog.js` to point there. Only pictures are fetched.
- **Game capture starts only after explicit user consent.** Never auto-start it.
- **Local mode never sends game data off the local network.** Remote mode is opt-in with its own consent.

## Known facts

| Topic | Status |
|---|---|
| Spike planted | Inferred from the +300 credit change in `valorant-gep.js` (applied), plus `planted_location` at round end |
| Per-player health/abilities | Only from player-PC capture (GEP `me` is local-player only) |
| `observing` | Custom games only |
| Overwolf | Developer account exists; app not yet approved. GEP in production depends on approval |
| Legacy app | Removed in Stage 4 (the old Electron app in `src/`, its tests, the capture child and root build files). Recoverable from git history before commit "Stage 4" |
| Output aliases | `hud.js` only recognises UUID aliases (`/o/<uuid>`); Air's screens carry a UUID `outputId` |
| Rehearsal | Private inside Air (`__ESA_SIM_REH_<code>`, never an OBS output). Sample rooms (`__ESA_SIM_*`) may change graphics during a test round; match rooms may not |
| Restarts and reconnects | Air restarting re-attaches to the running engine (nothing changes on air). An engine restart rebuilds the parser's memory from the saved match (`ValorantAdapter::resume_from`): same seats, same score baseline. Game data after a gap of 10 s or more is a new credit baseline (no inferred spike plant). Autopilot progress is saved per match and offered as "Resume at …". Up to 0.3 s of changes can be lost if the engine crashes (saves every 300 ms) |
| Events | Talent and sponsors belong to an event (`store.data.events`, `src/shared/model.ts`); a match has `eventId`, `stage` and `talentOff`/`sponsorsOff` switch lists. Older saves are migrated by `migrateToEvents` (one event per tournament or event name; each match keeps exactly its old casters and sponsors). Sponsors reach the HUD as `{name, logo, line}`, repeated by tier (title 3, partner 2, supporter 1) |
| First run and game | New installs see first run (`FirstRun.tsx`) until `finishOnboarding`; saves from before it count as done with Valorant. The game is app-wide (`setup.game`, top-bar switcher, locked while game data or a test round runs); matches of other games are kept but hidden. Game wording comes from the module in `src/shared/games.ts` |
| Switching match | Changes every graphic on air, so `selectMatch`, `createMatch`, `createQuickMatch` and `useEsportraMatch` refuse a different match while game data or a test round runs (`Production.assertCanSwitch`) |
| My show and the rail | My show is one list per production: OBS graphics are `setup.screens[].enabled`, HUD elements `setup.hud`; `src/shared/library.ts` (`showLink`, `inShow`, `showPatch`) maps each library graphic to one, or marks it always in the HUD. The rail runs in working order (Event, Matches, Library, OBS, Capture), then Live apart at the bottom; Air opens on Matches, or Event when none exists, never Live |
| OBS names and Go live | Everything Air adds starts `ESPORTRA · ` (scenes Break, Gameplay, Full screen, Replay, Desk; slots Game feed, Desk camera 1/2). Older `Esportra · ` scenes and inputs Air owns are renamed in place (`formerly` in `scene-build.ts`); a crew scene with an old name is never touched. Sponsor videos are hidden looping `ffmpeg_source` inputs in Break. Go live (`components/GoLive.tsx`) = install My show, start game data only with the consent tick, arm autopilot if chosen; it never streams |
| Live, keys and the manual | Live has four zones (on air, Next = `AutopilotCard`, Cued, six Moments) plus All graphics (`Ctrl G`) for every layer, person, sponsor and message. Every key comes from `src/shared/keymap.ts` (`ACTIONS`, defaults; `store.data.keymap` holds this PC's overrides, `store.data.moments` the six moments). The manual is one source (`src/shared/manual.ts`, `{key:id}` placeholders) for Help and the PDF (`manualHtml`, printed by the main process; the dev host prints with Playwright) |
| Player PCs | Send only their own `me` data and heartbeats; the engine drops anything else from a player PC (`join.rs` `admit`). Each joined PC reports the `playerId` it sends; Devices (`src/shared/devices.ts` `devicesView`) seats it by that id against the game's players (`puuid`), with freshness from `captureCoverage.lastSeenAt` (live under 10 s). Before the game lists its players, seats come from the lineup. The first two on-air talent with a camera fill `ESPORTRA · Desk camera 1/2` at install (camera link as an Air-owned browser source, or the crew's OBS source) |
| Moment rules | Autopilot rules react to repeatable moments beside the rundown (`src/shared/rules.ts`, run by `src/main/autopilot/rule-runner.ts`; saved as `store.data.rules`, starter: ace → player spotlight, 3 s hold). The engine's `round.won` carries `moment` (`overtime`/`matchpoint`/`flawless`/`clutch`/`thrifty`/`round`, null after an ace) and `player` for a clutch. A rule waits while a full-screen graphic is up or a rundown hold counts down, then fires within 10 s or is dropped. Results only switches rules off; Manual makes each wait in Cued. Rehearsals run the rules too and keep their moments for the builder's count |
| `adapters/test-valorant.js` | Already failing before this work: it expects player-PC data from non-UUID ids, which `player-coverage.js` rejects |

## Locked decisions

See the decision table in `docs/PRODUCT.md`. In short: one ow-electron app plus a separate Rust graphics engine; Valorant only behind a game-module seam; Esportra tournaments plus quick match; no Air pages on the Esportra website; local and remote transport; stage rail Match → Check → Live.

## Verification

- Local tests do not certify OBS, GEP, live game or deployment behaviour. Say which checks ran and which need the user's Windows machine.

## Reference material

`Reference data/` (gitignored) contains the Spectra broadcast system. Do not modify it.
