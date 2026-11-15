# Esportra Valorant broadcast HUD

45 broadcast graphics for Valorant, an operator control panel, a real-time server, and a Valorant data adapter. Every graphic is a
1920×1080 web page you add to OBS or vMix as a browser source. All of them read one shared match state, so a change in the
control panel (or from the game feed) updates every graphic at once.

`previews/_all-graphics.jpg` shows everything at a glance; `previews/` has each graphic at 1280×720.

## Two ways to run it

### Server mode (recommended for shows)

Needs Node.js 18 or newer.

```bash
npm install            # one small dependency (ws); already included in node_modules
npm start              # or: node server/server.js   → http://localhost:5300
```

| What | URL |
| --- | --- |
| Control panel | `http://localhost:5300/control.html?match=GF1` |
| Any overlay | `http://localhost:5300/overlays/<name>.html?match=GF1` |
| Server health | `http://localhost:5300/health` |

`GF1` is the match room code: pick any code per match. Every page with the same code shows the same match, on any PC that can
reach the server. Set `ESPORTRA_KEY=yoursecret` before starting to require `&key=yoursecret` on the control panel and feeds.

### Local mode (one PC, no server)

Open `control.html` and the overlays straight from disk. They sync through the browser's own storage, which works when the control
panel and the overlays run in the same browser engine (for example the control panel as an OBS custom dock). Add `?demo=1` to any
overlay to watch it run a simulated round on its own.

## Adding graphics to OBS and vMix

- **OBS:** Sources → Browser → URL from the table above, width 1920, height 1080. Leave *Shutdown source when not visible* off so
  graphics keep their state. Add the control panel as a dock: Docks → Custom Browser Docks.
- **vMix:** Add Input → Web Browser → the same URL at 1920×1080.
- Any size works: graphics scale to the source size. Add `?bg=1` to see a map backdrop while you position things.
- **Preview:** add `?preview=1` to any overlay URL, or use **Preview** in the control panel or desktop catalogue. This displays sample data in the source's intended phase on a visible background. It does not join, read, or change the live match. Use **Live source** / **Copy OBS URL** for broadcast output.
- A live source can correctly appear empty: buy phase hides the player cards, spike appears only after planting, and scoreboards, comparisons, polls, camera frames, and lower thirds need their visibility toggles. Banners, moments, toast, replay, and stinger also need their corresponding event or trigger. An empty transparent page in a normal browser can look white.
- **Stinger:** `stingers/esportra-stinger.webm` (OBS) or `.mov` ProRes 4444 (vMix), both with transparency. Length **2 seconds**;
  set the transition point to **960 ms**. **Play stinger** plays the wipe over `ingame.html` and the standalone `overlays/stinger.html` source in the same match room. The browser wipe does not switch OBS scenes; configure the WebM as an OBS Stinger transition for scene changes.

## The graphics

**In-game layers** (transparent, over gameplay). `ingame.html` stacks every layer in one source; use the single files if you
want each layer in its own OBS source.

| File | What it shows | When |
| --- | --- | --- |
| `ingame.html` | All in-game layers below, in one source | Live rounds |
| `scorebug.html` | Mirrored team-colour gradients with white scores, centered round timer (fixed digit slots with red seconds:hundredths for the final 15 seconds of live rounds; white minutes:seconds in buy phase) or red spike heartbeat, series pips and alive heads | Always |
| `player-cards.html` | Both teams: agent, HP bar, armor, gun, ult pips or ULT ready, credits, K/D/A; dead players dim | Live rounds |
| `observed-player.html` | Spectated player: big HP, armor, gun, credits, ability charges (C Q E), ult points | Live rounds |
| `killfeed.html` | Kills with agent icons, weapon icons, headshots; fades after 7 s | Live rounds |
| `minimap-frame.html` | Frame and map label around the game's own minimap | Live rounds |
| `win-probability.html` | Team A vs team B bar from a simple model (alive, HP, armor, money, spike) | Live rounds |
| `round-history.html` | Every round's winner and how (elimination, detonation, defuse, time), halves marked | On demand |
| `spike-timer.html` | Centered spike icon with a smooth, synchronized heartbeat | Spike planted |
| `moments.html` | First blood, 2K–ACE, live 1vX clutch callouts | Automatic |
| `banners.html` | Two selectable themes: full width Broadcast, or Compact with an icon, title, and team; round moments, tech pause and timeout panels | Triggered |
| `toast.html` | One-line message for 7 s | Triggered |
| `sponsor.html` | Rotating "presented by" bug, 8 s per sponsor | Live rounds |
| `event-bug.html` | Event logo, name and stage, top right | Always |
| `poll.html` | Live viewer poll with team-coloured bars | On demand |
| `player-cams.html` | 10 webcam frames beside each player row (put camera sources under them) | On demand |
| `replay.html` | Replay bug with round number | Replays |

Choose **Banners → Banner theme** in the control panel. **Broadcast — full width** is the original banner, restored without the recent redesign. **Velocity**, **Monument**, and **Impact** are three additional full width designs using dark HUD panels and team colour gradients: a softly lit stage with fine angled accents, side portraits with a protected central title, and a player spotlight with oversized team lettering. Agent art follows the winning roster; Ace and Clutch feature the actual player, with ability symbols in Impact. Each has a centred title, a large unboxed moment icon, and staged entrance / exit motion. Missing game artwork falls back to the readable panel and title. Their pause screens span the screen too. White Esportra emblems sit directly on the dark panels, without boxed backgrounds. Reduced motion uses gentle fades. **Preview theme** opens isolated sample data for the selected style; **Compare designs** shows all three full width variants with animated preview links. The selection is stored in `layout.bannerTheme`, so capture-triggered banners follow it too. Broadcast remains the default for new rooms; existing rooms retain their selected theme. Velocity retains the stored value `compact` for compatibility, although its layout is now full width. The other values are `monument` and `impact`. The removed `contour` value falls back to Broadcast.

**Between rounds** (transparent panels)

| File | What it shows |
| --- | --- |
| `economy.html` | Full width buy phase board and round history: team bank and loss bonus; each player's credits, credit change, utility, gun, armor, ultimate, agent, and K/D/A. Shows itself in the buy phase. |
| `round-recap.html` | Who won the round and how, kills this round per player, banks. Solid full-width bottom backing covers the native ability HUD when a round ends. |
| `scoreboard.html` | Full stats table sorted by ACS with MVP tag, over a dimmed background |
| `duel.html` | 1v1 head-to-head card with agent portraits and six compared stats |
| `team-compare.html` | Team comparison bars: rounds, first kills, plants, defuses, clutches, eco wins, average ACS |
| `lower-third.html` | Headline, caster names, or player spotlight with live stats |
| `ticker.html` | Scrolling news bar with clock |

**Full-screen scenes**

| File | What it shows |
| --- | --- |
| `match-intro.html` | Team vs team, event, stage, best-of, map list |
| `map-veto.html` | Bans, picks, decider, sides |
| `agent-select.html` | Both line-ups with agent portraits and roles |
| `team-roster-a.html`, `team-roster-b.html` | One team's five players, agents and stats |
| `player-profile.html` | Player spotlight with agent portrait, map and event stats, quote |
| `halftime.html` | First-half score, round-by-round, side switch |
| `map-breakdown.html` | Score, halves, attack/defense rounds, round-by-round |
| `map-result.html` | Map winner and score, MVP card, top performers |
| `series.html` | Every map in the series with scores and who picked it |
| `bracket.html`, `standings.html`, `schedule.html` | Event context |
| `casters.html` | Two webcam holes with name plates |
| `starting-soon.html`, `brb.html`, `ending.html`, `holding.html` | Holding screens with countdown, up next and schedule (`holding.html` follows the mode set in the control panel) |
| `break-clock.html` | Small countdown corner for breaks |
| `champion.html` | Trophy and winning roster |
| `stinger.html` | Live stinger transition |

## Live data

### HTTP API

```bash
curl localhost:5300/api/GF1                                                 # read the whole state
curl -X PATCH localhost:5300/api/GF1 -H 'Content-Type: application/json' \
     -d '{"teams":[{"score":7},{"score":5}]}'                               # change part of it (JSON merge patch; arrays replace whole)
curl -X PUT   localhost:5300/api/GF1 -d @state.json                         # replace it
curl -X POST  localhost:5300/api/GF1/event -d '{"type":"sponsor.read","name":"NOVA ENERGY"}'
curl -X POST  localhost:5300/api/GF1/ingest/valorant -d '[{"info":{"match_info":{"map":"Jam"}},"feature":"match_info"}]'
```

Add `-H 'X-Esportra-Key: yoursecret'` when the server has a key. Arrays are replaced whole by a PATCH, so send the full
`teams` array (the example above is shortened for reading).

### WebSocket protocol

Connect to `ws://host:5300/ws?match=GF1&role=overlay` (read-only) or `role=control|ingest|player` (can write, needs `&key=` if set).

| Direction | Message | Meaning |
| --- | --- | --- |
| server → client | `{type:"snapshot", v, state}` | Full state on join and on resync |
| server → client | `{type:"patch", v, patch}` | Every change as a JSON merge patch; `v` goes up by one each time |
| server → client | `{type:"event", event}` | One-shot moments (kills, round wins, custom events) |
| client → server | `{type:"resync"}` | Sent automatically when a client sees a gap in `v` |
| client → server | `{type:"set", state}` / `{type:"patch", patch}` | Replace or merge state |
| client → server | `{type:"valorant", message}` | One raw Overwolf game-event message for the Valorant adapter |

Every accepted change is appended to `server/data/<MATCH>.ndjson`, and the latest state is saved to `server/data/<MATCH>.json`,
so a server restart picks up where it left off and a match can be replayed.

### Valorant game data

- `adapters/valorant-gep.js` turns Overwolf's Valorant game-event messages into HUD state: players and agents, credits, guns,
  armor, ult points, K/D/A, killfeed (including ability kills), round phase and timers, score, round winner and how it was won,
  map, observed player, and, from player PCs, health and ability charges. It was written from Overwolf's public docs.
- `npm test` replays documented message shapes through it.
- `node tools/simulate-valorant.js GF1` streams a scripted round through the server, so you can test everything without the game.
- Game capture now lives in the desktop app (`apps/desktop/src/main/gep.ts`); the old `capture/overwolf-valorant/` starter was removed.
  Valorant's feed does not provide (spike-plant timing, round timer, other players' health) and how the HUD covers it.

## Customizing

- **Brand:** colors, panel tint and type live at the top of `core/hud.css` (`:root`). Fonts are in `core/fonts`, logos in `core/brand`.
- **Teams:** name, tag, color and logo URL are set in the control panel. Text on team colors switches between dark and light automatically.
- **Content:** veto, series, schedule, bracket, standings, sponsors, poll, duel, spotlight, round history and team stats are
  editable as JSON in the control panel's *Scene data* card.
- **Layout:** each graphic is one module in `core/hud.js` with its own block in `core/hud.css`. Positions are plain pixels on a
  1920×1080 canvas.

## How the code is organised

```
control.html            operator panel
overlays/*.html         one page per graphic: <body data-modules="scorebug,players,…"> + the three core scripts
core/state.default.js   the state shape and demo data (one plain JSON object)
core/hud.js             sync (server, local, demo), helpers, and every graphic as a module { update(state), tick(state) }
core/hud.css            design tokens and per-module styles
core/catalog.js         agent, ability, weapon and map image links (served by valorant-api.com)
server/server.js        rooms, snapshots + patches, event log, HTTP API, static hosting
adapters/               game data → state (Valorant today; one file per game)
tools/                  simulator
capture/                Overwolf capture agent starter
stingers/               rendered stinger files
```

The pattern: **one state object in, pixels out.** Data sources only change state. Each graphic's `update(state)` redraws
what changed, and `tick()` runs ten times a second for timers and fades. The scorebug uses `frame()` for hundredths during the final 15 seconds of live rounds. Fixed digit slots prevent horizontal movement as the hundredths change. Animations fire on state
transitions, such as a score going up or a banner timestamp changing, so a graphic that reloads mid-show comes back in the right
state without replaying old animations.

### Overlay audit

`tools/audit-overlays.cjs` runs under the repository's Electron installation. It renders all 45 HTTP-served pages against an isolated test server on port 18300, checks active and clean states plus scene updates, and verifies that sample previews stay separate from live rooms. Results, screenshots, and an HTML gallery are saved to `previews/audit/`. It does not use the running show's server or state.

## Notes

- Agent, weapon, ability and map art loads at runtime from valorant-api.com (an unofficial community API), so the broadcast PC
  needs internet access; without it those images hide and everything else still works. The art belongs to Riot Games.
  This project isn't endorsed by Riot Games. Check Riot's rules for commercial broadcasts before going live.
- Win probability is a transparent heuristic, not a trained model. Send `{"winProbOverride": 63}` (team A, percent) to drive it
  from your own model.
- Poppins and JetBrains Mono are under the SIL Open Font License.
