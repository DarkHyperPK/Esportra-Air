# Windows checks before a pitch

Local tests and the walkthrough run in a Linux sandbox with a stand-in OBS and a recorded game. They do not prove the real thing.

Go through this list once on a Windows PC with OBS 30 or later, Overwolf and Valorant. Tick each line, and note anything that differs from what it says.

## Get the build

- [ ] The `Air (Windows)` workflow on GitHub is green for the commit you test.
- [ ] Download the `esportra-air-windows` artifact. It has the Air installer, the Player installer and `air-engine.exe`.
- [ ] Install Air. It opens on first run: one plain column, no pictures (welcome, account, game, setup, Connect OBS).

## First run and sign-in

- [ ] Sign in with an Esportra staging account. Air goes on to the game step.
- [ ] Start first run again (Settings) and choose Continue as guest instead. Signing in later from Settings works.

## OBS

- [ ] Connect OBS (Tools › WebSocket Server Settings: enable it, and copy the port and password into Air).
- [ ] The match's OBS step: **Add for me** creates every `ESPORTRA ·` scene and slot. Overview then shows Scenes as ready.
- [ ] Put your game capture in `ESPORTRA · Game feed` and your desk cameras in `Desk camera 1/2`.
- [ ] Switch scenes in OBS yourself. Air shows which scene is on air and never switches one itself.

## Game data (Overwolf and Valorant)

- [ ] Start capture: the consent notice comes first, and nothing is read before you accept it.
- [ ] Join a Valorant custom game as observer. Scores, rounds, sides, credits and the spike reach the HUD.
- [ ] Start Valorant **before** accepting consent, then accept. Note whether game data starts without restarting Valorant.
- [ ] Player PCs: install Esportra Player on one PC, join with the code, and check that it is seated by its player and that health and abilities show for that player.
- [ ] Two observers join the same match: only one sends game data, and kills are not counted twice. Devices › Use for game data switches to the other.
- [ ] Player app: tick Record game data on this PC. A file appears in `Documents\Esportra Player recordings` and recording stops about 10 s after the map ends.

## Graphics on air

- [ ] The scorebug's window sits over the game's own round timer. If it doesn't, make a HUD template, choose the Scorebug part and adjust Timer window with Backdrop › Your picture set to a screenshot of your game. Note the numbers that fit.
- [ ] Plant the spike: the game blanks its timer and the window shows the spike and its countdown.
- [ ] Take a full-screen graphic, then the same graphic over the game, from Live with Cued and Take.
- [ ] Rundown autopilot: halftime and the map end put up their graphics by themselves.
- [ ] Templates: a template on a Rundown row shows on air. A HUD template's entrances play when the scoreboard or a banner appears.
- [ ] Break: the classic look, then the frame look (put something in `Break window 1/2`). Desk with a template.
- [ ] The brand kit: change Attack and Defence and see the scorebug's sides follow.

## Esportra match

Needs the backend's live veto route on staging (esportra-backend PR #6). Until it is merged and deployed, the veto lines below cannot pass.

- [ ] Events › an Esportra tournament › Use this match. Both lineups arrive; players with a verified Riot ID are seated before the game lists them.
- [ ] Run the veto on the Esportra website. Each ban and pick shows in Map veto within about 2 s, with whose turn it is and the countdown.
- [ ] Reset the veto on the website. Air empties the veto and the series.
- [ ] Enter a veto step in Air (Match data › Maps and veto). Esportra stops changing the veto until you press Follow Esportra again.
- [ ] Unplug the network during the veto. The last veto stays, and Air says Esportra cannot be reached. Plug it back in: it follows again.
- [ ] A map is counted. Live › Results to Esportra shows the result; Apply or Reject works when your account can review results.

## Match data

- [ ] Maps and veto by hand: best of, pool, picks with sides, undo. The on-air preview follows.
- [ ] Players prep, Event data (standings, bracket, ticker) and Show text (Starting soon / Break / Ending, countdown) reach their graphics.
- [ ] Overview names graphics in the show that are missing their data.

## Live control panel

- [ ] Series − / + changes the series on air.
- [ ] Close map keeps the map's record. With map 2 live, pick map 1's record: Map result (A) and Map breakdown (N) show map 1.
- [ ] Player of the map and Matchup: pick players and tick stats; the graphic follows.
- [ ] Champion (J) after the series.

## Timeout and sponsor spaces

- [ ] Leave a buy phase running past 40 s: Live suggests a timeout. Call one for a team: the bar shows above the buy-phase table, with the team, the score and a 60 s countdown.
- [ ] Give a sponsor the map veto, victory and timeout spaces: Presented by shows on Map veto, Map result, Champion and the timeout bar.
- [ ] The rotator still rotates only sponsors that have the rotator space.

## Older saves

- [ ] Open a match saved before 16 November whose Rundown had Victory · Map, Breakdown, Team performance or Victory · Series. The rows now show Map result, Map breakdown or Champion, with no duplicate rows, and autopilot still puts them up.
- [ ] Rebuild the OBS scenes for that match: nothing is missing.

## Safety

- [ ] Close Air while the HUD is on air and choose to keep graphics on air. The HUD keeps updating. Reopen Air: it reattaches with nothing changing on air.
- [ ] End the engine (Task Manager). Air restarts it and the match resumes with the same score.

## Control

- [ ] Keys over the game: with Valorant focused, F-keys and Ctrl/Alt keys still work, and keys another app holds show as taken.
- [ ] Stream Deck / Companion: add the Esportra Air module (`packages/companion-module`), connect with the key, put Map result up from a button.

## Other software (optional)

- [ ] vMix: add a Web Browser input with an Air output address (Air › match › OBS step lists them). Check that the background is see-through.

## Report back

For each line that fails: what you did, what you saw, and a screenshot. For game-data problems, a recording file from the Player app helps most.
