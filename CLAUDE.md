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
| Menu, events and the match | The menu is Events, Live, then Teams/Players and Graphics (the pack library), Help and Settings (`components/Chrome.tsx`). Events (`screens/EventsScreen.tsx`) is home: an event holds its matches (tabs Matches, Branding, Talent and sponsors); Esportra tournaments without a local event are listed too. A match opens on its steps (`screens/MatchWorkspace.tsx`): Overview, Teams/Players (pick each side's saved team and who plays), Talent and sponsors, Rundown, OBS, Player PCs and cameras, Rehearse, then Go live; OBS and devices are no longer menus (`go('scenes'|'outputs'|'capture')` opens the step). `deleteMatch`/`deleteEvent` refuse while that match is live. My show is still `setup.screens[].enabled` + `setup.hud` (`src/shared/library.ts`) until the Rundown step replaces it |
| OBS names and Go live | Everything Air adds starts `ESPORTRA · ` (scenes Break, Gameplay, Full screen, Replay, Desk; slots Game feed, Desk camera 1/2). Older `Esportra · ` scenes and inputs Air owns are renamed in place (`formerly` in `scene-build.ts`); a crew scene with an old name is never touched. Sponsor videos are hidden looping `ffmpeg_source` inputs in Break. Go live (`components/GoLive.tsx`) = install My show, start game data only with the consent tick, arm autopilot if chosen; it never streams |
| Live, keys and the manual | Live has four zones (on air, Next = `AutopilotCard`, Cued, six Moments) plus All graphics (`Ctrl G`) for every layer, person, sponsor and message. Every key comes from `src/shared/keymap.ts` (`ACTIONS`, defaults; `store.data.keymap` holds this PC's overrides, `store.data.moments` the six moments). The manual is one source (`src/shared/manual.ts`, `{key:id}` placeholders) for Help and the PDF (`manualHtml`, printed by the main process; the dev host prints with Playwright) |
| Player PCs | Send only their own `me` data and heartbeats; the engine drops anything else from a player PC (`join.rs` `admit`). Each joined PC reports the `playerId` it sends; Devices (`src/shared/devices.ts` `devicesView`) seats it by that id against the game's players (`puuid`), with freshness from `captureCoverage.lastSeenAt` (live under 10 s). Before the game lists its players, seats come from the lineup. The first two on-air talent with a camera fill `ESPORTRA · Desk camera 1/2` at install (camera link as an Air-owned browser source, or the crew's OBS source) |
| Rundown | Autopilot is a rundown of screens the producer builds (Matches › Autopilot, `components/Autopilot.tsx` + `ScreenRule.tsx`): each row is a full-screen graphic from My show (or back to the game) with When (`WHEN` in `src/shared/autopilot.ts`: Take, map starts, round live, round ends, halftime = round 12, map ends, after previous), Map (every map, map N, after the series), on-screen time, cut/stinger and hold. Saved as `store.data.rundown[matchId] = {rows, startedFrom}` (older edits migrate via `migrate` in `rundown.ts`); `buildRundown` expands rows into the steps ShowRunner runs (`map<N>-<id>` for every-map rows). Once a team has won the series (`teams[].series`, set through Fix data or Esportra), steps for unplayed maps are skipped. Spike, economy and recap stay HUD Auto layers, not rows. The engine's `round.won` also carries `moment` (unused by Air) |
| Graphics control and Companion | `store.data.control` = `air` (default) / `companion` / `both` (Settings › Graphics control, first run). `companion` hides the Autopilot tab, Live's Next and Go live's autopilot step, and stops autopilot. Companion connects to `src/main/companion.ts` (WebSocket `/companion?key=…`, port 5321, local-network addresses only, key in secrets as `companionKey`) only while the choice is not `air`. Air sends `hello` (My show screens, talent, sponsors), `values` (`companionValues` in `src/shared/companion.ts`) and `event`s (`eventsFor`, `stateEvents`); actions run through the same Production methods as keys, so Cued applies; no action touches the in-game HUD; autopilot actions only with `both`. The Companion module (`packages/companion-module`, SDK `@companion-module/base` 1.10 for Companion 3.4+) is plain JS; it is not yet listed with Bitfocus |
| Teams/Players | Teams and players are kept once (`store.data.teams`, `store.data.players`; menu Teams/Players, `screens/TeamsScreen.tsx` with a Teams or Players filter). A match keeps a copy of its two teams and lineups (`match.teams`/`match.players`, read by everything else) that follows the library: `match.teamIds` per side and `libraryId` per lineup entry (`src/main/team-library.ts`: `linkMatch` on load, create and Esportra; `refreshMatch` after every library change; `pickTeam`/`setLineup` for the match step; `pushMatch` sends edits made inside a match back). A player who changes team leaves that match's lineup; deleting a team leaves its players teamless and matches keep their copy. A finished match (`finishedAt`: a team won the series in the room, Esportra reports it completed, or Mark as finished on Overview) keeps the teams and players it was played with; Reopen makes it follow again |
| `adapters/test-valorant.js` | Already failing before this work: it expects player-PC data from non-UUID ids, which `player-coverage.js` rejects |

## Locked decisions

See the decision table in `docs/PRODUCT.md`. In short: one ow-electron app plus a separate Rust graphics engine; Valorant only behind a game-module seam; Esportra tournaments plus quick match; no Air pages on the Esportra website; local and remote transport; stage rail Match → Check → Live.

## Verification

- Local tests do not certify OBS, GEP, live game or deployment behaviour. Say which checks ran and which need the user's Windows machine.

## Reference material

`Reference data/` (gitignored) contains the Spectra broadcast system. Do not modify it.
