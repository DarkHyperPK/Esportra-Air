# First show with PCOB (PUBG MOBILE observer client)

PCOB is only given to licensed tournaments, so nobody can record it beforehand. Air is built to work whichever way the
nine questions the official document leaves open turn out, and the first licensed show settles them. This page is for that day.

## Before the show

1. On the observer PC, switch **API Enable** on in the PUBG MOBILE observer client.
2. In Air, open Live › Game data, enter the observer PC's address (this PC or one on your network), tick the consent box
   and press Connect. Nothing is read without the tick.
3. Switch **Record game data** on (same panel). Air then writes every raw answer PCOB gives, exactly as received, to
   `Documents/Esportra Air recordings/pcob-<date-time>.ndjson` on this PC. It stays on this PC, stops after 4 hours or
   200 MB, and also reads every route between games. Do this for the whole show, including a test game before it.
4. Arm the match (Run sheet) before the game starts. Air only saves into the armed match.

## What to watch, and what Air does meanwhile

| # | Open question | What Air does if the answer is the awkward one |
|---|---|---|
| 1 | Which route carries GameID, GameStartTime and FinishedStartTime | Reads them from any route (team list, global info, top level). They are never required. |
| 2 | Does GameID change on a remake | A change only adds the "remake?" hint, and only if a GameID was seen. Remake stays your button. |
| 3 | FinishedStartTime before the winner | 0, empty, missing or earlier than the start counts as "not finished". The match ends when PCOB sets a valid time, or every team but one has a place, or you press **End match**. |
| 4 | teamName on players and teams | Never needed. Teams are seated by Character ID, then OpenID, then name. |
| 5 | Kill feed: whole game or only recent | Lines are de-duplicated by who, whom and time. First blood, Kill leader and all kill counts come from the players' kill numbers, not from the feed. |
| 6 | Is rank 1 written for the winner | Used if present. If not, and exactly one team is left alive when the game ends, it is proposed 1st and marked "last team standing, from alive count". You confirm it. |
| 7 | What the routes return after the game | Air keeps the last full reading and a checkpoint every 2 s. An empty or emptier answer never overwrites saved numbers. |
| 8 | Players before the plane | The roster check says "No players listed yet" and runs once players are listed. |
| 9 | When the end-of-game numbers arrive | After the end Air waits until they turn non-zero, 15 s at most. The match stays provisional. **Update from game** (on the provisional panel) re-reads and refills only those numbers, never a place or kill, until you Confirm. |

Watch these in particular, and note what you see:

- Did the match end by itself, and which way (winner time, places, or End match)?
- Is the winner's place 1, or was it marked "from alive count"?
- Were the after-match numbers there when the match was saved, or did Update from game have to fill them?
- Did a "remake?" hint show without you remaking?

## After the show

1. Switch **Record game data** off (it also stops by itself).
2. In Live › Game data, press **Show in folder**.
3. Send the newest `pcob-*.ndjson` file to the Esportra team (as an email attachment or a file share link). It holds only PCOB's
   answers and Air's own notes about its decisions (`game.start`, `game.end.detected`, `results.saved`); no passwords or
   account details. Zip it first if it is large.
4. Say which match numbers were scrim or test games, and write down anything Air asked you to type.
