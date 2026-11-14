# Overwolf submission pack (Esportra Air and Esportra Player)

What to give Overwolf when submitting the apps for approval. The facts below are taken from the code at the commit this file was last changed with. Check them again if the capture code changes.

## The apps

- **Esportra Air** (`apps/desktop`): a production app for esports broadcasters. It turns tournament data and live game data into broadcast graphics, which show in OBS as browser sources. It never streams, records, switches scenes or changes the game.
- **Esportra Player** (`apps/player`): a small capture app for player and observer PCs at an event. It sends that PC's own game data to the producer's Air on the same network.

Both are ow-electron apps using one Overwolf package: `gep` (`"overwolf": { "packages": ["gep"] }` in each `package.json`).

## Game and data read

- **Game:** Valorant only.
- **Observer PC (Air, or Player in observer role):** GEP features `match_info`, `me` and `game_info` (`OBSERVER_FEATURES` in `packages/capture/src/gep.ts`).
- **Player PC (Player in player role):** features `me` and `match_info` (`PLAYER_FEATURES`). Only that player's own `me` data (health, abilities, player id) is sent. `match_info` is read on the PC only to find which player it is (the scoreboard line marked as the local player) when Riot is slow to send the player id; it never leaves the PC.
- **What it is used for:** scores, rounds, sides, credits, the spike state, the players in the match, and the local player's health and abilities, all for on-screen graphics.
- **What is not read or done:** no game memory is read or changed; there is no input automation, no overlay inside the game, and nothing that gives a player an advantage. Graphics are shown to viewers through OBS, not to players.

## Consent and privacy

- **Consent first:** game capture starts only after the user accepts a notice in the app, every time capture is first started. It is never started automatically. When Valorant starts, the app lets Overwolf attach to it (`game-detected`), but it asks for no game data and sends nothing until the notice is accepted.
- **Local by default:** game data stays on the local network. It goes from the capturing PC to the producer's Air graphics engine on the same PC or network.
- **What reaches Esportra:** no game data is sent to Esportra's servers. The Esportra account is used for sign-in and for tournament data (matches, rosters).
- **Remote mode** (observers in another place, through an Esportra relay) is planned and will have its own consent. It is not in this build.
- **Player PCs:** they send only their own `me` data and heartbeats, and the graphics engine drops anything else (`engine/crates/air-engine/src/join.rs`, `admit`).
- **Downloads:** agent, weapon and map pictures are downloaded once from `media.valorant-api.com`. Only pictures are fetched.

## Screenshots

Use the walkthrough shots (`node apps/desktop/dev/walkthrough.cjs <dir>` against `node apps/desktop/dev/host.ts`):
- first run;
- Events;
- a match's Overview;
- Rundown;
- Live;
- Graphics › Templates;
- the template editor;
- Player PCs and cameras.

Add one photo of the graphics on air in OBS from the Windows checks (`docs/WINDOWS-CHECKS.md`).

## Before submitting

- [ ] The `Air (Windows)` workflow is green and both installers are built.
- [ ] Every line of `docs/WINDOWS-CHECKS.md` that involves the game is ticked.
- [ ] App names, icons and the description above match the store listing.
- [ ] Overwolf's current submission requirements have been checked on their developer site (they change). Anything new they ask for is added here.
