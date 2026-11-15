## Esportra Air

Esportra Air puts Valorant broadcast graphics on air from your Esportra tournament and the live game. This connection lets your Stream Deck run those graphics and react to the game.

### Connect

1. In Air, open **Settings › Graphics control** and choose **Stream Deck / Companion** or **Both**.
2. In **Settings › Companion**, copy the address and the key.
3. Here, enter the Air PC's address, the port (5321 unless you changed it) and the key.

Only PCs on the same local network can connect, and only with the key. **New key** in Air disconnects Companion until you enter the new key here.

### Buttons (actions)

- **Full-screen graphic**: show, hide or toggle any graphic in your My show (Halftime, Map result, Series…).
- **Talent lower third** and **Sponsor lower third** (or hide it).
- **Toast**: a line of text; variables work, e.g. `$(air:team_a) at match point`.
- **Tech pause / timeout**, or end it.
- **Take**, **Take behind the stinger**, **Clear**: when Air's Live has "Changes wait here" on, graphics wait in Cued until you take them, the same as Air's keys.
- **Autopilot: hold / skip / take now** (only when Air is set to Both).

The in-game HUD (scorebug, player cards, economy, round recap, spike timer, kill callouts) runs by itself in Air and is not controlled from here.

### Triggers (react to the game)

Every event sets `$(air:last_event)` and adds one to `$(air:event_count)`. Make a Companion trigger on **variable changed: `event_count`** with the condition **Esportra Air: Last event is …**, then add any actions: Air graphics, or your own OBS or vMix actions. Air never switches scenes itself; Companion does if you add that.

Events: map starts, round live, round ends (with team, round and moment: match point, overtime, flawless, clutch, eco win), halftime (round 12), map ends, spike planted (worked out from credits), spike defused, spike exploded, kill, ace, team ace, a graphic on or off air, tech pause or timeout on or off, game data paused or back.

### Values (variables)

Team names and tags, score, maps won, round, phase, map, players alive, team credits, what is on air, how many changes wait in Cued, autopilot's next step, and for players 1–10 (1–5 team A, 6–10 team B) name, agent, alive, kills, deaths, assists and credits.
