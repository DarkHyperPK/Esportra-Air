# Esportra Player — design

Agreed direction, 10 November 2026. Esportra Air stays a standalone production app. Game capture on other PCs moves to a separate, small app, **Esportra Player**, that connects to Air for data.

## Why a separate app

- Air runs the show. A player or an observer should install something small: no OBS, no graphics, no scenes.
- Spectra does the same: one capture client that runs on the observer PC, and the same client run in an auxiliary (player) mode on each player's PC to read `me.health`, `me.abilities` and ultimate charge, which the observer's game client does not report. Its source is GPL-3.0, so Esportra Player is written fresh; only the ideas are used.
- It can serve scrims later with no producer: the app works on its own as a tracker.

## One app, two roles, two modes

| | Tracker (default) | Tournament mode (a switch) |
|---|---|---|
| Player role | Captures the player's own game and keeps a history on their PC. Nothing leaves the PC. | Also sends live health, abilities, ultimate and agent to the production PC, and an end-of-map report. |
| Observer role | Not used on its own. | Sends the match data (scoreboard, rounds, kills, spike). Optional hotkey marker for the producer. |

Tournament mode is switched on by the player or observer, never by the producer, and shows exactly what is being sent. It ends by itself when the match ends.

## Data

- **Capture:** Overwolf GEP in the main process, after explicit consent (as in Air): `match_info`, `me`, `game_info`. The player's identity is their Riot player id from the game; nobody types it.
- **Live (player):** health when it changes (not faster than about 300 ms), abilities, ultimate charge from the scoreboard, agent. Same messages as today's join protocol, tagged with the player id.
- **End-of-map report (new):** the player's own kills, deaths, assists, headshots and round results, plus agent and map. Accepted by the production engine only from a joined player PC, size-limited, kept on the match record. It is the player's own claim: it feeds graphics (player profile, spotlight) and the producer's records, never results or standings.
- **Tracker history:** a local file per game on the player's PC (agent, map, score, per-round kills and deaths). Which stats Overwolf actually gives a non-observer player has to be confirmed on a real PC before any stat is promised.

## Connecting

- Production PC: Capture › "Allow other PCs on this network to join" (built). The player enters the address and 6-character code once; the app remembers them across restarts and tray close (a gap in Spectra's client).
- Remote (different places) needs a relay in the Esportra backend. Not part of this design.

## Observer role and automatic replay

The production PC already receives every game event from the observer, so automatic replay is decided in Air, not in the observer app:

- Air saves the OBS replay buffer on configured events (ace, clutch, a 3+ kill burst, a last-second defuse), off by default, never during a tech pause or timeout, never when the replay buffer is off.
- The observer app adds one thing: an optional marker hotkey that tells Air "that was a moment", for a replay or a highlight.

## What changes in Air

- Air keeps the join host (the code, the port, the list of joined PCs) and gains the report view and the auto-replay rules.
- Air's own **Capture-only mode stays until the Player app has the observer role working**, then is removed. Nothing is deleted before then.

## Code

- `apps/player/`: ow-electron app, tray, small window (connection, consent, live status, tracker history).
- A shared package for what both apps need: the GEP bridge and player source, the ingest client with its connection state, the join protocol types and codes. Air's copies move there, so the two apps cannot drift apart.

## Build order

1. Shared package; scaffold the Player app with the Player role connecting to Air (parity with today's capture-only player mode).
2. Tracker: local history and window. No networking.
3. Tournament mode: the report, the engine message, the producer-side view.
4. Observer role, marker hotkey, auto-replay in Air.
5. Remove Air's capture-only mode.

## Not decided

- Scrims with no producer: local tracker only for now. A scrim destination (an Esportra scrim) needs backend endpoints and is designed separately.
- Windows verification of everything (GEP in a real non-observer game, firewall, two PCs).
