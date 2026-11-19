# PUBG Mobile and Free Fire in Air: research and outline (19 Nov 2026)

What a battle royale show needs, where its data and assets can come from, and how it fits Air. This is research,
not a build. Air is a broadcast graphics tool for several games; a battle royale is a different shape from Valorant
(a lobby of 12–25 teams playing several games, scored by placement and eliminations), so it gets its own system,
not Valorant's with new words.

Not checked yet: no PMGO, PMGC or FFWS broadcast was watched frame by frame. Items marked * come from vendor or
press descriptions and must be confirmed against broadcast stills before anything is designed.

## 1. Where the data can come from

| Source | What it gives | How to get access |
|---|---|---|
| PUBG Mobile observer client (PCOB) | A local HTTP API on the observer PC (`127.0.0.1:10086`, polled, no login), about 60 routes. Players: `playerName`, `uID`, `teamId`, `health`/`healthMax`, `liveState` (0 normal, 1 plane, 2 parachute, 3 vehicle, 4 knocked, 5 dead, 6 disconnected), `killNum`, `damage`, `rank`, `gotAirDropNum`, `isOutSideBlueCircle`, position. Teams: `teamName`, `killNum`, `liveMemberNum`, `rank`. Killfeed (`getkillinfo`): causer, victim, knocked or killed (`ResultHealthStatus` 1/2), distance. Zone and plane path (`getgameglobalinfo`). Observed player (`getobservingplayer`). Assists, headshots, heals and damage taken arrive only after the match. Route names come from community documentation, not from Krafton. | Krafton's third-party tournament program (launched November 2025) gives approved organisers a licence, the spectator client, live match data API support, Esports Room Cards and asset resources. Organisers apply through the partner portal; reviews take 1–3 days. [Esports Advocate](https://esportsadvocate.net/2025/11/pubg-mobile-third-party-tournament-program-launched/), [Inven Global](https://www.invenglobal.com/articles/19839/pubg-mobile-eases-path-for-community-run-esports-tournaments-with-streamlined-system) |
| Free Fire | No public observer or live data API found. | Ask Garena's esports partnerships team. Until then: Esportra results plus typed data. |
| Esportra (built) | BR groups, lobbies and games; `br_lobby_results` per team or participant (placement, kills, placement and kill points); leaderboards (`BrLeaderboardModels`: total points, kills, wins, best placement); scoring settings per stage (`BrScoringSettings`: placement table, kill points, kill cap); map pool or fixed map (`BrMapConfig`); `BRHub` for live updates. | Ours. Not sent to Air yet (section 5). |

## 2. Scoring (set per tournament, never hard-coded)

- **PMGC 2025:** 10, 6, 5, 4, 3, 2, 1, 1 for 1st–8th, then 0; 1 point per elimination. Tiebreaks: wins (WWCD), placement points, elimination points, most recent game. Grand Finals Day 3 "Smash rule": the threshold is the leader's points after match 12 plus 10, and the first team over it that wins a game is champion. Sources (secondary, no rulebook found): [Esportsverse](https://www.esportsverse.in/tournaments/pubg-mobile/pubg-mobile-global-championship-2025), [Liquipedia (PCL, same table)](https://liquipedia.net/pubg/PUBG_Champions_League/2025/Spring), [Sportskeeda](https://widgets.sportskeeda.com/esports/news-pmgc-2025-grand-finals-day-2-overall-standings-overview).
- **FFWS:** reported as 12, 9, 8 … 1 for 1st–10th, then 0; 1 point per kill. Tiebreaks: Booyahs, then kills. Finals "Champions Rush": a team over the threshold (80, later reported as 90) that wins a game is champion. Sources (secondary): [ExitLag](https://www.exitlag.com/news/what-is-the-champions-rush-in-free-fire/), [Dunia Games](https://duniagames.co.id/amp/discover/article/champions-rush-ffws-sea-2026-spring-point-limit-changes-more-exciting/en).

## 3. Graphics a BR broadcast uses

From [LHM.gg's PUBG Mobile HUD](https://lhm.gg/overlays/premium-pubg-mobile-hud), broadcast guides and PMGO 2025
production notes. Free Fire has the same shape, with 12 teams of 4, Booyah instead of Chicken Dinner, and its own maps.

**Over the game**
1. Match info: match N of M, map, teams alive, players alive.
2. Team status board: every team with rank, logo, tag, one mark per player (alive, knocked, dead) and kills or points this match.
3. Killfeed: knock or elimination, distance, weapon*.
4. Observed player: name, team, health, kills, damage.
5. Observed team: four players' health and status.
6. Zone: phase, waiting or closing, countdown.
7. Team eliminated: "TEAM X ELIMINATED · #rank".
8. Kill leader, and live top fraggers*.
9. Airdrop alert*; plane path and drop map at the start.
10. Winner: Winner Winner Chicken Dinner (Free Fire: Booyah).
11. Match point marker for teams over the Smash or Champions Rush threshold.

**Full screen, between games**

12. Starting soon, Break, Ending (already in Air).
13. Teams in this lobby.
14. Map rotation and schedule. PUBG Mobile: Erangel, Miramar, Sanhok, Vikendi, Rondo. Free Fire: Bermuda, Purgatory, Kalahari, Alpine, Nexterra.
15. Drop locations per team*.
16. Match result: rank, team, placement points, elimination points, total.
17. Overall standings: rank, team, wins, placement points, elimination points, total, match point.
18. MVP of the match: kills, damage, assists, survival time.
19. Top fraggers or team of the match.
20. Player profile and head-to-head.
21. Points system explainer.
22. Champion.

Already generic in Air: lower thirds, sponsors, ticker, schedule, desk.

## 4. Official assets

- **PUBG Mobile:** a press kit of logos, the 2022 brand guideline and fonts on Tencent's public Google Drive (only an archived copy was found; the producer has the current link). Licensed organisers also get Krafton's asset resources.
- **Free Fire:** Garena's brand page (`ff.garena.com/en/brand`). Logos must keep their original form, and there is no public licence beyond the page.
- **Rule for Air:** nothing official is committed to this repository or shipped in the installer. Air gets "Import game pack": the producer points it at the kit they downloaded and Air stores it in the engine's asset store, so the licence stays with the organiser. Graphics use only the kit's colours, fonts and logos. Where the kit has no picture (weapons, map art), the graphic shows text; nothing is drawn to look official.

## 5. Missing in the Esportra backend

1. The Air broadcast package and routes (`AirBroadcastEndpoints`) are head-to-head only. There is no BR package: lobby teams, games with their maps, results per game, scoring and standings.
2. No per-player BR stats per game (kills, damage, assists, survival). `br_lobby_results` is per team or participant.
3. No match-point rule (Smash, Champions Rush) in `BrScoringSettings`.
4. The game catalogue has `pubg` (PC rules) but no PUBG Mobile and no Free Fire. Their data and rules differ.
5. No route for Air to propose BR results (placements and kills read by PCOB), like the head-to-head result proposal.
6. No live BR push to Air. `BRHub` exists for the website; Air polls its own routes.

## 6. How a BR game fits Air

- **Game module:** `GameDef` in `src/shared/games.ts` gets `shape: 'versus' | 'lobby'`. `pubgm` and `freefire` are lobby games with their own wording (match, not map; WWCD or Booyah; eliminations), scoring and pack.
- **Match model:** a lobby match is a group day: teams, games with their map, results per game, scoring with an optional match-point threshold. The maths lives in `src/shared/br.ts`, which is pure and tested.
- **Game data:**
  - The Player app on the observer PC polls PCOB after the consent tick and forwards to the engine, as it does for Overwolf today.
  - A Rust crate `air-pubgm` turns polls into room state.
  - The one-source-per-match rule stays.
  - Free Fire: Esportra and typed data only.
- **Rundown and autopilot triggers:** game starts, team eliminated, final circle, winner, game ends, between games.
- **Not used for BR:** veto, agent select, economy, spike, rounds.
- **Demo before the licence:** a PCOB simulator in the dev host (like `fake-esportra.ts`) plays a 16-team game with made-up teams through the documented routes. Air shows the whole live show and proposes results to Esportra. The real PCOB then replaces the simulator.

## 7. Order of work

1. This research; a mock of the BR pack once the official kit and broadcast stills are in hand.
2. `br.ts`, the lobby model and the PCOB simulator.
3. The BR graphics pack, built only from the official kit.
4. Backend: the BR Air package (staging), after the gaps above are agreed.
5. The PCOB adapter and Player app poller. Testing against the real PCOB needs the licence and the Windows observer PC.

Needed from the producer:
- the current PUBG Mobile asset Drive link;
- stills, or a VOD link with timestamps, for the items marked *;
- a decision on applying to Krafton's third-party program.
