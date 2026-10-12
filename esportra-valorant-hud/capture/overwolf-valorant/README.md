# Valorant capture agent (starter)

Runs on the observer PC and forwards Overwolf's raw Valorant game events to the Esportra server. All parsing happens on the
server in `adapters/valorant-gep.js`, so this app stays tiny and rarely needs updates when the HUD changes.

## What you need

- An Overwolf developer account and an ow-electron app (start from Overwolf's ow-electron template).
- `npm install ws` in that app.
- Overwolf app approval before distributing it to anyone outside your team.

## Run modes

| Mode | Where | Set | Sends |
| --- | --- | --- | --- |
| Observer | The spectator PC in the custom game | `ESPORTRA_MATCH`, `ESPORTRA_SERVER` | Scoreboard, killfeed, roster, round phase, score, map, observed player |
| Player | Each competitor's PC (optional) | the above plus `ESPORTRA_PLAYER_ID` (their Riot PUUID) | That player's own health and ability charges |

Player mode is read-only and only forwards the player's own data. Get organizer and player sign-off before installing anything on competitors' machines.

## What Valorant's feed does not give you

- **No live "spike planted" event.** Press *Spike planted* in the control panel (or bind it to a Stream Deck key).
- **No round timer.** The server starts timers from round-phase changes.
- **Health and abilities only for the local player.** That is what player mode is for.

## Test without Overwolf

`node tools/simulate-valorant.js MAIN` streams a scripted round through the same server endpoint this agent uses.
