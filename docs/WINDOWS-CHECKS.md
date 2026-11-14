# Windows checks before a pitch

Local tests and the walkthrough run in a Linux sandbox with a stand-in OBS and a recorded game. They do not prove the real thing.

Go through this list once on a Windows PC with OBS 30 or later, Overwolf and Valorant. Tick each line, and note anything that differs from what it says.

## Get the build

- [ ] The `Air (Windows)` workflow on GitHub is green for the commit you test.
- [ ] Download the `esportra-air-windows` artifact. It has the Air installer, the Player installer and `air-engine.exe`.
- [ ] Install Air. It opens on first run (welcome, game, setup, Connect OBS).

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

## Graphics on air

- [ ] The scorebug's window sits over the game's own round timer. If it doesn't, make a HUD template, choose the Scorebug part and adjust Timer window with Backdrop › Your picture set to a screenshot of your game. Note the numbers that fit.
- [ ] Plant the spike: the game blanks its timer and the window shows the spike and its countdown.
- [ ] Take a full-screen graphic, then the same graphic over the game, from Live with Cued and Take.
- [ ] Rundown autopilot: halftime and the map end put up their graphics by themselves.
- [ ] Templates: a template on a Rundown row shows on air. A HUD template's entrances play when the scoreboard or a banner appears.
- [ ] Break: the classic look, then the frame look (put something in `Break window 1/2`). Desk with a template.
- [ ] The brand kit: change Attack and Defence and see the scorebug's sides follow.

## Safety

- [ ] Close Air while the HUD is on air and choose to keep graphics on air. The HUD keeps updating. Reopen Air: it reattaches with nothing changing on air.
- [ ] End the engine (Task Manager). Air restarts it and the match resumes with the same score.

## Control

- [ ] Keys over the game: with Valorant focused, F-keys and Ctrl/Alt keys still work, and keys another app holds show as taken.
- [ ] Stream Deck / Companion: add the Esportra Air module (`packages/companion-module`), connect with the key, put Map result up from a button.

## Other software (optional)

- [ ] vMix: add a Web Browser input with an Air output address (Air › match › OBS step lists them). Check that the background is see-through.
