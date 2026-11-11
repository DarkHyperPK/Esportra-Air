# Esportra Air — product specification

Draft for review, 11 November 2026. When approved this becomes the reference every screen, mock and build is checked against. `PRODUCT.md` keeps the decisions log; this document describes the whole product.

---

## 1. What Air is

Air turns tournament data and live game data into broadcast graphics, and runs them during a show.

**It promises the producer three things:**
1. Everything on air (teams, players, talent, sponsors, scores, moments) comes from one place: the match.
2. The show keeps running when something breaks. Nothing on air goes blank or wrong because a PC, a cable or the app restarted.
3. One person can run a professional show, with the system doing the repetitive work and the producer making the calls.

**It never:**
- switches OBS scenes, streams, records or touches the producer's own scenes;
- starts game capture without the producer's explicit consent;
- sends game data off the local network unless remote production is switched on.

---

## 2. Who uses it

| Person | Where | What they do in Air |
|---|---|---|
| **Producer** (the paying user) | Production PC | Prepares matches, runs the show, makes the calls. |
| **Observer** | Observer PC (or the production PC) | Spectates the game. Their PC sends the match data through Esportra Player. Never touches Air. |
| **Players** | Their own PCs | Install Esportra Player once, check in, then forget it. |
| **Talent** (host, casters, analysts) | Desk or remote | Appear on air: name, photo, camera. Never touch Air. |
| **Tournament organiser** | Esportra | Owns the schedule, teams and lineups that Air loads. |

**Typical productions** (Air adapts to each; chosen in first run, changeable in Settings):

| Setup | PCs | Example |
|---|---|---|
| **One PC** | Observer client, OBS and Air together | Community cup, one person |
| **Observer + production** | Observer PC sends data; production PC runs Air and OBS | Online league |
| **With player PCs** | As above, plus Esportra Player on each player's PC (for data the game only gives players) | LAN final |

---

## 3. The product model

Everything on screen and on air comes from these objects. Each has a home in the app and a list of graphics that use it.

### Production (this PC)
- **Fields:** setup type, OBS connection, game, account (Esportra or guest), keyboard map.
- **Home:** Settings.

### Event
The tournament or show series. It carries defaults that each match can override.
- **Fields:**
  - name and stage names (e.g. "Playoffs");
  - event logo (light and dark versions);
  - accent colour for the event's own graphics;
  - default talent and default sponsors.
- **From Esportra:** name, stages, logo.
- **Used by:** event bug, holding screens, lower thirds, intro, champion screen.
- **Home:** Event (new).

### Match
- **Fields:**
  - two teams, best-of, scheduled time, stage;
  - lineups;
  - talent for this match, sponsors for this match;
  - chosen screens ("My show"), autopilot rules, banner style.
- **From Esportra:** teams, lineups, time, best-of. A guest creates it by hand.
- **Home:** Matches → the match.

### Team
- **Fields:** name, short name, colour, logo (transparent PNG or SVG, shown at its own shape), optional secondary colour.
- **Used by:** everything team-related.

### Player
- **Fields:**
  - display name, real name (optional), in-game identity (how the game knows them);
  - photo (cut-out or headshot);
  - country (optional), role (optional);
  - camera (optional);
  - player PC (when that setup is used).
- **Used by:** player cards, profile, spotlight, roster, MVP, results.

### Talent
The new object.
- **Roles:** host, play-by-play caster, analyst, interviewer, guest.
- **Fields:** name, handle, photo, camera.
- **Used by:** caster lower third, desk screen, talent introductions, analyst graphics.
- **Home:** the event's default list, adjustable per match.

### Sponsor
The upgrade.
- **Fields:**
  - name and logo (light and dark versions);
  - tier (title, partner, supporter), which decides the rotation share;
  - optional short video loop (played in OBS as a media source);
  - optional read text for the "presented by" lower third.
- **Used by:** sponsor slot in the HUD, sponsor read, holding screens, break screens, ticker.
- **Home:** the event, with per-match overrides.

### Camera
For players and talent.
- **Two kinds:**
  - **Remote link:** a browser link the person opens on any device. This is what player cams use today; caster and analyst cams will use it too.
  - **Local:** an OBS source the producer already has (a capture card, NDI).
- **States:** not set, waiting, connected, lost.
- **Used by:** player cams, desk screen, talent lower thirds, picture-in-picture.

### HUD pack and screens
- A pack is a complete graphic style for one game.
- A screen is one graphic in it (scorebug, map result, desk…).
- **Fields:** what it shows, when it is used, which OBS scene it belongs to, which data it needs.
- Each match chooses its screens (**My show**). Only chosen screens are sent to OBS and appear on Live.

### Autopilot rules
- **The rule shape:** *when* [game moment or time] *and* [conditions], *show* [graphic] *for* [time] *via* [cut or stinger], with a *hold* [seconds, or wait for the producer].
- Presets are sets of rules.

### Show state
- **What it holds:**
  - whether the match is live;
  - what is on air, what is cued, what autopilot will do next;
  - data health, device check-in;
  - recovery state.
- It is saved continuously so a restart resumes rather than resets.

### What is in the app today vs. this spec

| Object | Today | Missing |
|---|---|---|
| Event | Name and stage only, inside the match | Logo, accent, defaults, its own home |
| Talent | Two casters, name and handle | Roles, photo, camera, more than two people |
| Sponsor | Name only | Logo, tier, video, read text |
| Camera | Player remote links; caster cams are empty OBS slots | Talent remote links, local sources, states |
| Player | Name, in-game id, photo, player-cam link | Country, role, player PC check-in |
| Screens | On/off switches in "Match graphics" | Chosen per match from the Library |
| Show state | Partly in memory | Saved and resumable |

---

## 4. The journey, end to end

### A. First run (once, about two minutes)
1. **Welcome:** what Air does, in one sentence.
2. **Account:** sign in with Esportra, or continue as a guest.
3. **Game:** no default.
4. **Setup:** one PC, observer plus production, or with player PCs.
5. **Connect OBS:** can be skipped.
6. **Land on Matches.**

### B. Preparing (days or hours before)
1. **Event:** logo, accent, default talent with photos and cameras, sponsors with logos.
2. **Match:** opened from the Esportra schedule, or created as a quick match.
3. **Teams and players:** check the logos, photos and in-game identities that Esportra provided, and fill gaps.
4. **My show:** pick screens from the Library pack and choose a banner style.
5. **Autopilot:** pick a preset and adjust rules.
6. **Rehearse:** watch the match privately with real names, photos and graphics, and fix anything that looks wrong.
7. **Send links:**
   - camera links to talent and players who use remote cameras;
   - the Esportra Player check-in code to observers and players.

### C. Show day, before going live
- **One screen (the match's Readiness) answers "can I go live?"** It lists:
  - OBS connected;
  - observer data arriving;
  - player PCs checked in, seat by seat;
  - talent cameras connected, person by person;
  - the art on this PC.
- **Every problem has its fix next to it.**
- **Go live** then does, in order:
  1. sends My show to OBS with clear names;
  2. starts game capture (with consent);
  3. arms autopilot.

  It never starts the stream.

### D. During the show
**The producer's loop each round:**
1. Glance at on air.
2. See what autopilot will do next.
3. Hold, skip or take.
4. Fire moments (pause, timeout, replay, a lower third).
5. React to alerts.

| Moment | What Air does | What the producer does |
|---|---|---|
| Buy phase | Economy board (auto layer) | Nothing, or hide it |
| Round live | Back to the game (rule) | Nothing |
| Kill streak, ace, clutch | Banner (auto) | Nothing |
| Round end | Round result and recap (auto) | Optional replay (F3) |
| Halftime | Halftime screen for the set time (rule) | Talent lower third, sponsor read |
| Technical pause | Pause panel with clock; autopilot waits | F1, then F1 to resume |
| Map end | Map result, then series (rules) | Desk with talent cams, then the next map |
| Break between maps | Holding screen with sponsors and the timer | Talent segment |
| Match end | Champion / result | End the show: the holding screen |

**When something breaks** (each case says what viewers see and what the producer sees):

| Failure | Viewers see | Producer sees and does |
|---|---|---|
| Observer data stops | Graphics hold the last full data; "paused" tag after 10 s | Alert with the observer PC's name; nothing to do unless it lasts |
| A player PC drops | That player's health and abilities hidden, never stale | The seat turns amber; tell the player |
| Air restarts | Nothing changes | Air reopens on Live: "Recovered. Autopilot resumes at Map 2 · back to the game" |
| Graphics engine restarts | Up to 0.3 s of change lost; nothing reorders, nothing goes blank | Same recovery message |
| OBS disconnects | Graphics continue (served by Air, not OBS) | Alert; Air reconnects by itself |
| Talent camera drops | The desk shows their photo instead | The camera's seat turns amber |
| Data is wrong (a score, a name) | The correction once applied | Fix data (Ctrl D) |

### E. After the show
- Air stops capture and returns to Matches.
- The match keeps its record: final score, what was shown, the event log.
- Reporting results back to Esportra is a later stage.

---

## 5. Screens

**Navigation:** Live · Matches · Event · Library · Devices · OBS · Settings. Each screen has one job and one primary action.

| Screen | Job | Primary action | Contents |
|---|---|---|---|
| **First run** | Get set up | Continue | Six steps (section 4A) |
| **Matches** | Find tonight's match | Open (or New quick match) | Scheduled on Esportra; on this PC; what is live now |
| **Match › Readiness** | Can I go live? | Go live | Checks with fixes; seats; talent cams |
| **Match › Teams and players** | Right names, logos, photos | Save | Two lineups, side by side |
| **Match › Talent and sponsors** | Who is on air for this match | Save | Talent from the event defaults, plus overrides; sponsors likewise |
| **Match › My show** | Choose graphics | Add from Library | Chosen screens and their OBS scenes |
| **Match › Autopilot** | Decide what runs by itself | Choose a preset | Rules as sentences, rule builder, "try in Rehearse" |
| **Match › Rehearse** | See the show before it happens | Play rehearsal | Private preview, beats, autopilot firing |
| **Event** | The event's identity and defaults | Save | Logo, accent, stages, default talent, sponsors |
| **Library** | See what each graphic looks like | Add to my show | Packs → pack window (list with filters, large live preview, details) |
| **Live** | Run the show | Take / Space | Section 6 |
| **Devices** (was Capture) | Who and what is connected | Copy check-in code | Observer data, player PC seats, talent and player cameras, with health |
| **OBS** | What Air adds to OBS | Send to OBS / Rebuild | Scenes and sources Air owns, connection, replay buffer |
| **Settings** | How Air runs on this PC | — | Setup, account, OBS connection, keyboard, about |
| **Help › Manual** | How to run a show | — | Task-based manual (section 6) |

---

## 6. Live, in detail

**Layout:**

| Zone | Contents |
|---|---|
| Main | **On air**: the program monitor with graphics. Under it, the status line: round, alive count, data age, seats, cameras. |
| Right, top | **Next**: autopilot's next step with its countdown. Hold (H), Skip (S), Take now (Space). |
| Right, middle | **Cue**: the manual graphic change you set up. Take (Space), Stinger (F7), Clear. Hidden when empty. |
| Right, bottom | **Moments**: the producer's own six most-used actions, chosen in Settings, with keys. |
| Drawer (Ctrl K or the All graphics button) | Every layer, poll, toast, lower third, camera and fix. |
| Top | Alerts, only when something needs attention, each with its fix. |

**Behaviour rules:**
- Space always means "take what is waiting", whether that is autopilot's next step or the cue.
- One alert at a time, the most important first. Nothing blinks unless it is on air.
- Every key can be remapped (Settings › Keyboard), with conflict detection and a reset.

**The manual** (Help › Manual, also printable from the docs) is written as scenarios:
- before the show;
- going live;
- a round;
- between rounds;
- halftime and map end;
- the desk segment;
- a technical pause;
- each failure in section 4D;
- player check-in;
- talent cameras;
- keyboard.

Each scenario is short, with the exact keys.

---

## 7. Look and feel

**Character:** a professional broadcast tool. Calm while you prepare, unmistakable when you are on air.

**Treatment by kind of screen** (no texture is reused for a different job):

| Kind | Treatment |
|---|---|
| First run, empty states | Atmosphere: soft stage light and a slow light sweep. |
| Event | The event's own accent and logo set the header. |
| Match | The two teams' colours as light from each side, the logos large, the lineup photos. |
| Library, Rehearse | Graphics shown over a game-like scene backdrop, so they are judged in context. |
| Working screens (Teams, Talent, Settings, Devices, OBS) | Quiet: no texture, clear forms, generous spacing. |
| Live | Maximum clarity. No texture or decoration. Colour only for meaning. |

**Colour meanings:**
- red = on air;
- amber = cued, counting down or needs attention;
- green = healthy;
- grey = off.

Team and event colours appear only as identity (light, logos, swatches), never as status.

**Imagery:**
- **Shown:** only the producer's own pictures (logos, player and talent photos, sponsor logos), plus textures generated in code.
- **Not shown in the interface:** game publisher art or stock photography. Game art appears only inside the broadcast graphics.

**Logos:** shown at their own shape, never in a box. A team without a logo shows its short name in its colour.

**Type:** Archivo, with the expanded width for titles and scores only. JetBrains Mono for times and keys. Labels in sentence case.

**Motion:** only for state changes (on air, countdown, a new alert). Reduced-motion respected.

---

## 8. Language

- **Say what the producer gets, never how Air does it.** No vendor, protocol or file names in the interface: no "GEP", "Overwolf", "WebSocket", "engine", "room", "ingest".
- **Producer words:**

  | Use | Instead of |
  |---|---|
  | game data | GEP feed |
  | on air | PGM |
  | cued | PVW |
  | player PC | player client |
  | check in | join |
  | camera link | VDO.Ninja |
  | graphics | overlays |
  | screens | outputs |

- **Errors** say what happened and what to do, in one or two sentences. No apologies.
- **Technical detail** (versions, ports, connection logs) lives in Settings › About and in a "Copy diagnostics" button for support, nowhere else.

---

## 9. Reliability

**Requirements** (the evidence is in the Stage A report):
1. **Graphics never go blank or partial** after any restart or reconnect; they hold the last full state.
2. **No replayed or invented moments** after a reconnect: no false spike plant, no repeated kill.
3. **Nothing reorders mid-match:** players keep their positions.
4. **The game parser's memory is saved and restored** with the match.
5. **Autopilot resumes** where it was.
6. **A player PC can only send its own player's data.** Done (commit `5314411`).
7. **A restart is visible to the producer** in one sentence, and invisible to viewers.

---

## 10. Game modules

Air is multi-game. Each game is a module that provides:
- **identity:** name, the in-game identity format (e.g. "Name#TAG");
- **match data:** what the observer provides;
- **player PC data:** what only players' PCs provide, or none;
- **the HUD pack**, and the game's art for the graphics;
- **vocabulary:** round, map, half, overtime; the game's moments (e.g. ace, clutch, spike plant);
- **the triggers and checks** its autopilot rules and readiness use.

Generic screens read these, so no Valorant wording appears outside the Valorant module. Valorant is the first module; others show as "coming later" until they exist.

---

## 11. Decisions I need from you

1. **Talent cameras:** remote camera links (like player cams), local OBS sources, or both? I suggest both, with remote links as the default.
2. **Sponsor videos:** play them in OBS as media sources that Air adds to the holding and break scenes, or leave video to the producer? I suggest Air adds them.
3. **The Event screen:** a new top-level item, or inside Matches? I suggest top-level: events outlive matches.
4. **Interviews and guests:** in scope for v1 (a lower third and a desk position), or later?
5. **The manual:** in the app only, or also as a PDF for crews? I suggest both, from one source.

---

## 12. Delivery

The order:

| Stage | What | Notes |
|---|---|---|
| 1 | **Spec approved** (this document) | |
| 2 | **Reliability** (section 9, items 1–5, 7) | Engine and app; no new screens except the recovery message |
| 3 | **Mocks of every screen** against this spec | Self-reviewed; one prototype; your approval |
| 4 | **Build in this order:** | One commit per item, each with tests and walkthrough screenshots |
| | • the product model (Event, Talent, Sponsor, Camera) and its migration | |
| | • first run and game modules | |
| | • Matches and the match workspace | |
| | • Library and My show | |
| | • Go live and OBS naming | |
| | • Devices with check-in | |
| | • Live and the manual | |
| | • Autopilot rules | |
| | • the look-and-feel pass | |
| 5 | **Windows verification** on your machine | Real OBS, real game, real player PCs |
