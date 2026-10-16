# Original index.html brief

Source: D:/Esportra-Air/index.html. SHA-256: c12b4442c8667aa7849833af6ef4b3d20f7e83af7be00f3ba3291132af05e0b3. Extracted 14 October 2026; original remains authoritative.

## Esportra Broadcast UI/UX recipe

What each part does, how it behaves, how it moves and how it connects to the backend. The numbered white squares on every picture are explained in section 7.

The HUD tool, grown from esportra-valorant-hud into a product: a tournament-driven broadcast system. Every match on an Esportra schedule becomes a show. The show runs itself on a production PC next to OBS or vMix, the graphics follow the game on their own, and people step in only when a judgment call is needed.

- Pictures (this folder) are the UI/UX: every screen, state and interaction is drawn. Numbered white squares on each picture are explained in §7.

- This document is the recipe and the ingredients: what each part does, how it behaves, how it moves, and how it connects to the backend.

- Editable sources: design/source/hud/*.mjs (kit: design/source/hud-kit.mjs). Rebuild with node design/source/build.mjs hud.

- Graphics Studio (designing your own HUDs) is deferred to a later desktop phase (§13).

Sample teams and people are fictional. Monitors and thumbnails show the HUD's own demo renders.

## 1. The pictures

# Picture Surface What it shows

1 web-01-home.png Web Tonight's shows, live matches with autopilot state, queue built from the schedule, nodes, alerts

2 web-02-show-setup.png Web Show setup step 2: HUD pack, theme, teams synced from the tournament, what the crew gets

3 web-03-rundown.png Web Rundown segments driven by tournament state; rule editor with hold window and test fire

4 web-04-live-monitor.png Web Every node on air, remote hold/take, node chat, incidents, show timeline

5 web-05-crew-links.png Web Crew and roles, browser sources with OBS tally, one-click scene build, co-stream links

6 web-06-report.png Web Post-show report: automation stats, sponsor proof, VOD chapters, results to the bracket

7 desk-07-pair-readiness.png Desktop Pairing, show and match, readiness checklist, what autopilot does next

8 desk-08-console.png Desktop Producer console: PVW/PGM, Take, autopilot now/next with hold, layers, triggers, live data

9 desk-09-scenes.png Desktop OBS/vMix connection, scenes built by Esportra, segment → scene map, transitions, replays

10 desk-10-capture.png Desktop GEP features and freshness, fallbacks, player PCs, live state, simulator

11 desk-11-observer.png Desktop Observer PC in capture-only mode

12 desk-12-outputs.png Desktop Browser sources served by the node, connections, manual add steps

13 desk-13-data-fix.png Desktop Fix data drawer with bracket correction and history

14 desk-14-offline-sync.png Desktop Offline mode, sync queue, conflict resolver

15 sys-15-how-it-works.png System Architecture and a match start to finish across Esportra, node, OBS and screen

16 sys-16-states.png System Failure, empty and loading states

17 sys-17-components-motion.png System Controls in every state, tally, monitors, countdown, take, easing

18 sys-18-phone-remote.png System Phone remote for the floor producer

19 sys-19-onboarding.png System Nine-step setup checklist

## 2. Product, people and permissions

The promise: link a tournament, pair a PC, add five browser sources in OBS once. From then on every match produces itself, and your crew only steps in for the moments that need a person.

Role Where they work Can do Cannot do

Ops lead Web (any device) Create shows, edit rundowns and rules, assign nodes, see every node, remote hold/take, read reports Change OBS settings on a node's PC

Producer Desktop console on the production PC, phone remote, or web live monitor (one node) Hold, skip, take, fire triggers, fix data, pause or resume autopilot Edit rules for the whole show (proposes a change instead)

Observer Observer PC, capture-only app Send game data, mark replays, flag moments Anything that changes what is on air

Crew Sources page (web or desktop Outputs) Copy browser-source URLs, run connection checks, test pattern Controls of any kind

Talent (casters) None (managed by producer) Appear on lower thirds and the casters scene -

Permissions are enforced on the server (RLS and hub authorization), never by hiding buttons (§10).

## 3. Industry today, and how we are better

What exists (October 2026):

Tool Model Strengths Gaps we exploit

LHM.gg (Lexogrine HUD Manager) Desktop app plus cloud storage OBS/vMix integration, automatic replay scene at round end, claims about 80% automation; Scout AI observer and auto replays for CS2/Dota 2; Valorant HUDs Teams and matches are set up inside LHM; the tournament lives elsewhere. Valorant automation lags CS2. One production at a time

Singular.live Cloud graphics Remote operation, data integration, broadcast-grade Not game-aware; needs data plumbing per show

NodeCG (+ obs-websocket) Open-source framework Flexible browser graphics, OBS control A developer tool; every show is a project

SuperConductor Rundown and playout controller Timeline control of OBS, vMix, ATEM, CasparCG No game data, no tournament

Community Valorant tools (RCVolus observer tool, Spectra, Overwolf observer bridges) Observer-PC agent + HTML overlays Free, VCT-like looks No automation, no ops, fragile setup

Where Esportra is better (each is a design commitment visible in the pictures):

- Tournament-native, zero setup. Teams, logos, rosters, schedule, veto and series score already live in Esportra. A show is created from a tournament, and new matches join as the bracket advances (pictures 1, 2).

- The loop closes. GEP's final score confirms the map result back into the bracket, and corrections are recorded with their source (pictures 6, 13).

- Autopilot with a human hold. Every automatic take can carry a hold window: a visible countdown anyone can stop. Safer than blind automation, faster than manual (pictures 3, 8, 17).

- Rundowns follow tournament state, not a clock: check-in, veto, agent select, round phase and map end drive the show (pictures 3, 15).

- Many matches at once. Parallel nodes, one live monitor, auto-queued matches, co-stream links for teams and creators (pictures 1, 4, 5).

- LAN-first and low-bandwidth. The node runs the show without internet and syncs later (picture 14).

- Proof and payoff after the show. Sponsor time on air, VOD chapters from round events, share cards (picture 6).

Sources: LHM.gg broadcast and overlay management, LHM.gg Valorant guide, LHM CS2 features, LHM CS2 replays, NodeCG overview, awesome-nodecg, EBU awesome-broadcasting (SuperConductor), Singular.live comparison, RCVolus valorant-observer-tool, Overwolf observer bridge example.

## 4. Architecture

Picture 15 is the diagram. In one sentence: the web plans and watches; the desktop node runs the show next to OBS; OBS only switches scenes, and the graphics inside each scene follow the match by themselves.

### 4.1 What runs where

Part Runs on Made of Job

Esportra web → Broadcast Cloud, any browser Existing React app (/organizer/broadcast/...) + .NET API + SignalR Shows, rundowns, rules, nodes, crew, live monitor, reports

Broadcast hub Cloud SignalR hub (new BroadcastHub) Config down to nodes, status and events up, remote commands

Production node Streaming PC (Windows) Esportra Broadcast desktop app (ow-electron, alongside esportra-desktop) Show runner + autopilot, local HUD server, OBS/vMix controller, producer console, offline queue

Local HUD server Inside the node The existing server/server.js (rooms, snapshot + JSON merge patch, event log, HTTP API) Serves the 45 graphics as browser sources and pushes state to them

Graphics Inside OBS as browser sources The existing overlays/*.html + core/hud.js Render state; show and hide their own parts

Observer capture Observer PC Same desktop app in Capture only mode, using adapters/valorant-gep.js Read GEP next to the game, send it to the node over LAN

OBS / vMix Streaming PC or LAN Unchanged Mix, encode, stream; obey scene commands

### 4.2 Who talks to whom

From → To Channel Carries

Web ↔ cloud REST + SignalR (existing patterns) Show config, monitor data

Cloud ↔ node SignalR client initiated by the node (outbound only, works behind venue NAT) Down: show config, match context (teams, logos, veto, series), remote commands. Up: heartbeat, tally, autopilot state, events, results

Observer → node WebSocket on the LAN (role=ingest, node key) Raw GEP messages; the node runs the adapter

Node → graphics The existing HUD protocol over ws://host:5300/ws?match=…&role=overlay snapshot, patch (with version v), event

Node → OBS obs-websocket v5 (built into OBS 28+, default port 4455, password auth) Scene switches, transitions, replay buffer, scene building; OBS events back for tally

Node → vMix vMix HTTP API (default port 8088) Inputs to preview/program, transitions, stingers, overlays; XML state for tally

### 4.3 Why not webhooks, and why not control OBS from the web

OBS doesn't receive webhooks. It exposes a WebSocket server on the PC it runs on. A cloud page can't reliably reach that (NAT, firewalls, venue Wi-Fi), and the show would stop when the internet drops. So the node, on the same PC or LAN as OBS, holds the obs-websocket connection. A remote Take from the web goes cloud → node → OBS.

### 4.4 Two layers of control

Layer Example Controlled by OBS involved?

Inside a graphic Economy board in buy phase, killfeed, ace banner, spike timer HUD state from the node No. The page shows its own parts

Which scene is on air Holding → Fullscreen intro → Gameplay → Replay → Fullscreen result Node via obs-websocket / vMix API Yes, a handful of times per map

Rounds never switch scenes. That keeps OBS calm and makes most failures harmless: if OBS control drops, the graphics keep updating.

## 5. User flow, end to end

### 5.1 Before the event: web, once per tournament (pictures 19, 2, 3, 5)

- Broadcast → Get started. Link the tournament. Its matches become shows; future matches join as the bracket advances.

- Choose the look. Pick a HUD pack (the 45 Esportra graphics today; custom packs later from Graphics Studio). Team colours and logos come from team profiles.

- Rundown. Start from the Bo1 or Bo3 template. Each segment says what starts it, which graphics show, which OBS scene, and its hold window. Adjust rules if needed, test-fire on the simulator.

- Brand & talent. Sponsors (rotation, reads), casters (names for lower thirds), event bug.

- Nodes & crew. Assign matches to production PCs, invite producer, observer, crew.

### 5.2 Production PC setup: once per machine, about 5 minutes (pictures 7, 9, 12, 11)

- Install Esportra Broadcast on the streaming PC, sign in. The app shows a pairing code; enter it on the web (or scan the QR). The PC now appears as a node.

- In OBS: Tools → WebSocket Server Settings → Enable. The app finds OBS on the same PC automatically; for a LAN OBS, paste IP and password once.

- Build scenes (one click). The app creates Holding, Gameplay, Fullscreen, Replay, Casters in OBS, puts the right Esportra browser sources in each (1920×1080, "shutdown when not visible" off), and leaves labelled slots for the crew's own sources: game feed (NDI or capture) and caster cameras. Crews with existing scenes skip this and map their scene names on the Scenes screen instead.

- Observer PC: install the same app, choose Capture only, pick the production PC. It reads GEP from the Valorant observer client and sends it over the LAN. On a single-PC setup, capture runs on the node itself.

- Readiness (picture 7) turns green: Esportra, show and match, game data, OBS, scenes, browser sources, talent, internet. Any red row has a one-click fix ("Add for me").

### 5.3 Show day: what happens on its own (pictures 8, 15)

Moment Node does OBS shows On screen

Match room opens (T−15) Loads match context from Esportra Holding Starting soon with countdown and teams

Both teams checked in Hold 5 s on the console, then stinger Fullscreen Match intro

Veto running on Esportra Feeds bans and picks live Fullscreen Map veto

GEP: agent select Updates graphic Fullscreen Agent select

GEP: round live Stinger Gameplay Game feed + in-game HUD

Each round No scene changes. Rules show economy in buy phase, recap at round end, spike timer, banners Gameplay Inside the HUD

Replay (observer F9 or producer F3) SaveReplayBuffer → load clip → Replay scene → back on clip end Replay Replay bug

Tech pause Hold 3 s, then pause panel (or BRB scene per rule) Gameplay or BRB Pause panel

Map ends Hold 5 s, stinger Fullscreen Map result, then series

Series ends Manual by default (casters often want the desk) Fullscreen or Casters Champion or next match

Bracket advances Queues the next match on this node Holding New countdown

The GEP final score confirms the map result into the bracket; a verified badge appears on the web.

### 5.4 What people do during the show

- Producer: watches PVW/PGM and the Next card. If autopilot is about to do something wrong, Hold (H). To jump ahead, Take now (Space). One-off moments: caster lower third, toast, poll, sponsor read, replay. Wrong data: Fix data.

- Ops lead: live monitor across nodes, node chat, remote hold/take, moves matches between nodes if one fails.

- Crew: keeps OBS running; never touches HUD data.

- Observer: observes; F9 marks a replay, F10 flags a moment for the producer.

### 5.5 After the show (picture 6)

The report builds itself when the series ends: time on air, automatic vs manual takes, incidents, sponsor time on air (exportable proof), VOD chapters (copy to YouTube), results sent to the bracket, share cards.

### 5.6 When things go wrong (pictures 16, 14)

Failure Behaviour The one action

OBS disconnects Autopilot pauses on that node; graphics keep updating; alert on console, phone and web Resume autopilot on reconnect

GEP feed stale (no events for 10 s during a live round) Live stats freeze with a small "feed paused" tag Check observer PC, or switch to manual score

Output dropped Card turns red on Outputs and web Open in OBS (usually "shutdown when not visible")

Node offline Web shows last seen and its next match Move the match to another node

Internet drops Nothing on air changes; sync queue fills on disk None; resolve conflicts when back

Match rescheduled Rundown and countdown shift None

Forfeit Skip to result with forfeit label, then next match Hold to keep casters on the desk

## 6. Design direction and tokens

Direction: Command Console (dense, calm, tabular, fast) inside Esportra's Broadcast chrome. Product surfaces vary density, not identity. The design-recipe Direction Contract for this surface:

Decision Value

Ground Stage black #09090B, panels #111114, hairlines rgba(255,255,255,.07)

Type Poppins 800 for titles and hero numbers; Inter for UI text; JetBrains Mono for captions, timecodes, URLs, hotkeys

Corners Square everywhere (only dots and phone frames are round)

Rose #F43F5E Means ON AIR / PGM / live, and nothing else. Program monitor ring, ON AIR tally, Take button, live count in the nav

Amber #FBBF24 Cued, preview, hold window, automatic-next. PVW ring, hold countdown, Auto chips

White The action and selection: primary buttons, active nav, selected segment, toggles on

Green / amber / red Health only: connected, attention, broken

Team colour Only inside team frames (crests, team swatches)

Density 34–40 px rows, 13–13.5 px body, 9.5–11 px mono captions

Spacing rhythm 14 / 16 / 22 / 24 px between groups; panels breathe more than rows

Copy voice: plain, present tense, says what happens next. "Autopilot cuts to Holding when the match room opens." Never "Error 502". Every alert says what happened, what still works, and the one thing to do.

## 7. Screen by screen

For each screen: purpose, the numbered callouts on the picture, states, and interactions. Shared interaction rules (all screens):

- Hover: rows lighten to rgba(255,255,255,.04); secondary buttons raise their border to 35% white; primary buttons dim to #E4E4E7; Take deepens to #E11D48. 120 ms colour transition. No movement on hover.

- Press: 1 px down shift, darker fill, 60 ms.

- Focus: 2 px white ring outside a 2 px stage gap. Never rose.

- Disabled: 35% opacity, no hover, tooltip says why.

- Copy buttons swap their icon to a check for 1.2 s and announce "Copied".

- Live values (scores, latency, timers) never animate their digits except countdowns; changes flash the cell background for 400 ms.

### 7.1 Web · Broadcast home (picture 1)

Purpose: what's on tonight, what needs a person.

- KPI strip: live now, queued today, nodes (with attention dot), hands-free %, sponsor time on air. Each tile links to its detail (live monitor, rundowns, nodes, reports).

- Autopilot line on each live card: "next Round recap in 0:04". Clicking opens the live monitor focused on that node. The countdown mirrors the node's hold window.

- Up next: auto-queued from the schedule, sorted by start time. Status chips: Ready, Rescheduled, Waiting on result (depends on a previous series), Needs a node (red, the only blocker).

- Production nodes: each with capabilities (GEP, OBS/vMix, feeds) and state. "Pair a node" opens the pairing dialog.

- Alerts: newest first, tone-coded, time-stamped. Clicking jumps to the cause. Resolved alerts fade to the incidents log after 10 min.

States: empty (no shows, see picture 16), loading (skeleton cards), node offline (card red, alert pinned).

### 7.2 Web · Show setup (picture 2)

- Step rail: Tournament ✓ → HUD pack → Brand & talent → Nodes & crew. Coverage summary says which stages and how many matches are included, and that new matches join automatically.

- HUD pack picker: Esportra packs / My packs / Studio (soon). Cards preview the pack's in-game graphic; selected card gets the amber PVW ring and a "Selected" chip (amber = "this will go on air", not live yet).

- Synced from the tournament: teams, logos, colours, rosters with a Live sync chip. Team edits update graphics within seconds; overrides live in Brand & talent.

- What your crew gets: the browser sources this pack creates per node. Sets expectations before anyone opens OBS.

- Footer: Back, Preview on a node (runs the simulator on a paired node), Continue.

Interactions: changing the pack updates the preview everywhere; theme toggles apply instantly in the preview. Validation is inline and never blocks Back.

### 7.3 Web · Rundown and rules (picture 3)

- Segments: drag handle (reorder; locked segments can't move above prerequisites), trigger line, graphics thumbnails, OBS scene chip, hold window, auto/manual toggle. 5× marks a segment that repeats per map. Selected segment has the white left bar.

- Rule drawer: When (trigger), Only if (conditions), Then (ordered actions: OBS, vMix, graphic, sponsor, wait). "+ Add action" lists only actions the assigned nodes support.

- Hold window: Auto / Hold N s / Manual. Copy under it explains exactly what the producer will see.

- In-round rules: run inside "Map · live rounds" without scene changes.

Interactions: test fire runs the rule on a node's simulator and reports each action's result and timing. Publish to nodes pushes a new rundown version; nodes switch at the next segment boundary, never mid-segment. Unpublished changes show a "Draft" chip.

### 7.4 Web · Live monitor (picture 4)

- Tile: teams, ON AIR tally, PGM (rose ring) and PVW (amber ring) mirrored from OBS at 2 fps (thumbnails, not video), score and map.

- Autopilot bar: next action with countdown; Hold and Take now send remote commands (the node acknowledges in under 300 ms; the button shows a spinner until then).

- Paused tile: amber outline, the reason, and Resume autopilot.

- Node chat: messages between ops and the node's producer; system messages (holds, takes) appear inline.

- Starting next: queue with node assignment; a red outline marks a match with no node.

- Show timeline: last 60 min of segments with markers for automatic takes (grey), holds (amber), manual takes (white). Hover a marker for who and why.

Grid / Focus toggle: Focus shows one node large with its full event log.

### 7.5 Web · Crew and links (picture 5)

- Crew table with roles and status; Invite sends an email and an in-app invite.

- Studio crew can be a device, not a person: a sources-only link for the OBS PC.

- Co-stream links: watch-party overlay (score, series, veto) for teams and creators; expires at series end.

- Browser sources: per node, LAN / This PC / Cloud relay URLs with a key. Tally per source: ON AIR, In OBS (connected), Not added.

- Let the app build your OBS scenes (recommended) or the manual guide. Rotating the key updates every connected source without re-pasting (sources reconnect with the new key pushed over their live socket).

### 7.6 Web · Post-show report (picture 6)

- KPIs: on air, automatic takes, holds and manual, incidents, median GEP latency.

- Sponsor time on air: minutes per sponsor with placements; Export sponsor proof (PDF with timestamps and thumbnails).

- VOD chapters: built from segment and round events; Copy for YouTube.

- Results sent to the bracket: map scores verified from Riot; series outcome and what it unlocked; share cards.

- Incidents and overrides: time, node, what happened, who, impact.

### 7.7 Desktop · Pair and readiness (picture 7)

- This PC: node name, owner org, pairing code for another PC (expires in 10 min).

- Show and match: Auto follows the rundown's assignment; manual pick is for covering another node.

- Readiness checklist: eight rows, each with state and detail. Rows recheck every 2 s.

- One-click fixes on failing rows (e.g. "Add for me" creates the missing browser source in OBS).

- Start autopilot (primary) or Run manually.

- What autopilot does next: the next five segments with their triggers, so the producer knows what will happen before pressing Start.

### 7.8 Desktop · Producer console (picture 8)

The heart of show day. Everything is reachable by keyboard.

- PVW (amber): what the next take will put on air. Autopilot loads PVW first when OBS Studio Mode is on.

- Take / Cut / Stinger: Take uses the segment's transition; Cut and Stinger force one. Space takes.

- Next card: trigger, action, countdown ring. H holds (ring freezes, card shows "Held by Ayesha", autopilot waits for Take or Skip), S skips, Take takes now.

- Coming up: the following segments.

- Graphic layers: In-game, Between rounds, Full screen. Each row: state (On = rose outline, Auto = amber, Off) and hotkey. Clicking toggles manual on/off; Auto rows are controlled by rules until the producer overrides them, then show "Manual" until the next segment.

- Triggers: tech pause (amber because it changes the show's state), timeout, replay, toast, caster lower third, poll, stinger, sponsor read. F1–F8.

- Live data strip and Fix data (picture 13).

- Event log: kills, plants, holds, takes, round results; newest on top.

Lower thirds (right column) are one click for talent and player spotlight.

### 7.9 Desktop · Scenes (picture 9)

- Connection: OBS version, address, Studio Mode, scene collection, what we control.

- Scenes built by Esportra: tree of scenes and their sources. Slots needing your sources are amber ("Add your source"); the app detects when the crew adds them (InputCreated / scene item events) and the slot turns into the real source name.

- Composition and layer order of the selected scene, plus the warning strip for open slots.

- Segment → scene: dropdowns list scenes read live from OBS (GetSceneList).

- Transitions and replays: stinger file and cut point, replay buffer length; test buttons run against OBS without changing the program scene (they use preview).

More switchers: link several OBS instances or vMix; each segment can target one.

### 7.10 Desktop · Capture (picture 10)

- Source KPIs: observer PC, latency, messages per second, gaps (resyncs).

- GEP features: what the game sends, status (Live or Covered), freshness, 60 s activity bars.

- Player PCs (optional): exact health and ability charges when installed on player PCs.

- Live state: the current HUD state version and key fields.

- Simulate: recorded match (.ndjson from the HUD server's event log) or scripted round; drives graphics and autopilot; OBS switching only if allowed.

- Fallback rules for fields GEP doesn't provide (spike timer from the plant event, round timer counted locally, unobserved health hidden).

### 7.11 Desktop · Observer capture-only (picture 11)

- Sending status with destination and latency (green square, never rose: it isn't on air).

- Valorant, GEP, messages sent.

- Hotkeys: F9 mark replay, F10 flag a moment, Ctrl+Shift+P pause sending.

- Pause sending and Change production PC. No show controls exist in this mode by design.

### 7.12 Desktop · Outputs (picture 12)

- Every browser source this node serves, with live preview.

- This PC / LAN / Cloud relay address modes (cloud relay is for remote production where OBS isn't on the venue LAN).

- Output cards: tally, connections, URL with copy, resolution, frame health. Two connections usually mean the source sits in two scenes.

- Manual add steps for crews skipping the one-click build.

### 7.13 Desktop · Fix data (picture 13)

- Apply semantics: changes go on air on Apply; the feed won't overwrite a fixed field until the next round.

- Score steppers.

- Names on screen: Riot ID → display name (saved per player for the whole tournament).

- Bracket prompt whenever a map score changes: On air only, or Air and bracket (records a correction with the producer as source).

- History with Undo last.

The console stays visible behind the drawer so the producer sees the fix land.

### 7.14 Desktop · Offline and sync (picture 14)

- Offline banner: duration, reassurance, retry timer.

- Waiting to sync: queued results, corrections, report data; persisted to disk.

- What still works offline vs what doesn't.

- Conflict resolver: shows both versions with who and when; one choice per conflict.

- Connection history.

### 7.15–7.19 System boards (pictures 15–19)

- How it works (15): the architecture and a match start to finish in four lanes: Esportra, node autopilot, OBS scene, on screen. Rose marks the live Gameplay scene; amber marks hold windows.

- States (16): eight designed states with what happened, what still works, and the action.

- Components and motion (17): see §8.

- Phone remote (18): opens from a QR on the desktop app; same session as the console. Now/next with Hold, Skip, Take now (56 px targets); triggers grid; alerts with Resume autopilot.

- Onboarding (19): 1. Nine-step checklist; the current step is highlighted with its input inline. 2. Pairing code entry on step 4. 3. Progress and time left; you can stop any time and resume where you left off.

## 8. Motion

Rule zero: motion marks a change of state, never decoration. The HUD's own rule applies to the app too: animations fire on state transitions (a version change), so a screen that reloads mid-show returns in the right state without replaying old animations.

Token Duration Easing Used for

enter 180 ms cubic-bezier(.2,0,0,1) Drawers, menus, new rows

exit 120 ms cubic-bezier(.4,0,1,1) Closing, removing

alert-in 240 ms cubic-bezier(.3,0,0,1) Alerts slide 12 px from the top edge + fade

flash 400 ms linear Live value changed (background tint fades out)

hover 120 ms linear Colour only

press 60 ms linear 1 px shift

Choreography:

- Hold countdown: the amber ring drains linearly over the hold window, number steps each second. At zero the ring turns rose for 200 ms and the take happens. Hold freezes the ring and the card shows who held it.

- Take (PVW → PGM): the console mirrors OBS events (SceneTransitionStarted → CurrentProgramSceneChanged); it never animates a take OBS didn't make. With a stinger, the PGM monitor switches at the stinger's cut point (600 ms).

- Tally change: chip swaps instantly (no fade). Tally must never lag what's on air.

- Lists that update live (event log, alerts): new item enters at the top with enter; others shift without animation to avoid motion sickness during busy rounds.

- Reduced motion: rings become a number, wipes become cuts, slide-ins become fades, flashes become a static dot for 1 s.

## 9. Automation model

Concepts:

Concept Meaning

Show A tournament (or part of it) covered with one look and one rundown template

Node A paired production PC that runs shows

Rundown Ordered segments for one match type (Bo1, Bo3)

Segment A part of the show: trigger, graphics, scene, transition, hold window, auto/manual

Rule When + Only if + Then (ordered actions); in-round rules live inside a segment

Action OBS (scene, transition, replay), vMix (input, overlay), graphic (show/hide/duration), sponsor read, wait

Hold window Seconds of visible countdown before an automatic take; Auto = 0, Manual = waits for Take

Triggers (what can start a segment or rule): - Tournament: match room opened, check-in complete, veto step, veto complete, map result verified, series decided, rescheduled, forfeit. - GEP: agent select, round phase (buy, live, end), kill, multi-kill, spike planted or defused, match end. - Time: at a clock time, after N seconds. - People: hotkey, phone tap, remote command, observer flag.

Segment state machine:

Safety rules: - No automatic take during a tech pause or timeout, unless the rule is the pause rule itself. - Segments marked Manual never auto-take, but they still arm and show in Next. - If OBS is disconnected, autopilot pauses; it never queues takes to replay later. - Every automatic action carries a command id; the node ignores duplicates (idempotent), so remote double-taps can't double-cut. - Every hold, skip, manual take and data fix is audited (who, when, why if given).

## 10. Data, contracts and backend links

Follows the repo order: migration (RLS) → types → schema → hook → components → page. Tables are proposals for review by the database and security leads.

### 10.1 Proposed tables (Supabase, RLS on every table)

Table Key columns RLS

broadcast_shows id, organization_id, tournament_id, name, hud_pack, theme jsonb, status Org staff read/write; public none

broadcast_nodes id, organization_id, name, capabilities jsonb, last_seen_at, token_hash Org staff read; write via RPC only (pairing)

broadcast_assignments show_id, match_id, node_id, starts_at Org staff

rundown_templates / rundown_segments template_id, order, trigger jsonb, graphics jsonb, scene, transition, hold_seconds, mode Org staff; versioned on publish

automation_rules segment_id or show_id, when jsonb, only_if jsonb, actions jsonb Org staff

broadcast_outputs node_id, kind, key_hash, rotated_at Org staff; keys returned once

broadcast_events node_id, match_id, type, payload jsonb, actor_id, created_at Insert by node RPC; read org staff

broadcast_crew show_id, user_id, role Org admins manage; members read own

Writes from nodes go through RPCs or the .NET API with a node token scoped to its organization and assigned matches. No service-role key ever ships in the desktop app.

### 10.2 Hub messages (SignalR BroadcastHub)

Direction Message Payload

Node → hub Heartbeat node id, versions, OBS/GEP state, tally, autopilot state (every 2 s)

Node → hub Event segment changes, takes, holds, incidents, results

Hub → node ShowConfig show, rundown version, rules, theme, outputs

Hub → node MatchContext teams, logos, rosters, series, veto steps (pushed on change)

Hub → node Command { id, type: hold|skip|take|resume|trigger, segmentId?, by }

Node → hub CommandAck { id, ok, error? }

### 10.3 Local HUD room (unchanged protocol)

The node embeds the existing server and its contract (snapshot / patch with version v / event, resync on gaps, ndjson log). Match context from the hub and GEP from the adapter both become patches on the same room state (core/state.default.js), so every graphic keeps working as built.

### 10.4 OBS (obs-websocket v5) used by the node

Need Requests and events

Connect Hello / Identify with password (OBS 28+, port 4455)

Read scenes GetSceneList, GetSceneItemList

Build scenes CreateScene, CreateInput (browser_source with url, width 1920, height 1080, shutdown: false), slot placeholders

Take Studio Mode: SetCurrentPreviewScene + TriggerStudioModeTransition; otherwise SetCurrentProgramScene

Transitions SetCurrentSceneTransition, SetCurrentSceneTransitionDuration

Replays SaveReplayBuffer → ReplayBufferSaved (path) → SetInputSettings on the replay media source → switch to Replay → MediaInputPlaybackEnded → return

Tally CurrentProgramSceneChanged, CurrentPreviewSceneChanged, SceneTransitionStarted/Ended

Detect crew sources InputCreated, SceneItemCreated

Monitor thumbnails GetSourceScreenshot at 2 fps for the web live monitor

vMix equivalents: PreviewInput, Cut, Fade, Stinger1, OverlayInput1In/Out, replay functions; tally from the /api XML state.

### 10.5 Pairing and output keys

- Node requests a pairing code (10 min, single use).

- Org staff enters it on the web.

- Server issues a node token (hashed at rest), revocable from Production nodes.

- Output URLs carry a per-node key. Rotating it pushes the new key to connected sources over their socket. Old URLs stop working after a 60 s grace.

## 11. Reliability and performance budgets

Budget Target

GEP event → graphic on screen (LAN) under 150 ms p95

Producer Take → OBS program change under 100 ms on the same PC

Remote Take (web) → node ack under 300 ms with good internet

Heartbeat 2 s; node marked "attention" after 6 s, "offline" after 20 s

GEP stale no events for 10 s during a live round

Reconnect OBS: backoff 1, 2, 4, 8 s, max 10 s. Hub: same, then every 15 s

Offline queue on disk, survives restart, ordered, idempotent replay

Graphics 60 fps; no layout thrash; images preloaded per map

Resync: graphics request a snapshot when they see a gap in v (existing behaviour). Conflicts after offline: last-writer-wins for config, explicit resolver for match assignment and results.

## 12. Accessibility and keyboard

- Colour is never the only signal: tally chips always carry text (ON AIR, PVW, OFF); health chips carry words.

- Contrast: body text ≥ 4.5:1 on panels; captions ≥ 3:1 at their size.

- Focus order follows reading order; drawers trap focus and return it on close.

- Screen readers: tally changes and alerts are announced politely; the hold countdown announces start and result only (not every second).

- Targets: 34 px minimum on desktop, 56 px on the phone remote.

Console keyboard map:

Key Action

Space Take

H / S Hold / Skip the next automatic take

1–8 In-game layers

Q–I Between-rounds layers

A–J Full-screen graphics

F1–F8 Triggers (tech pause, timeout, replay, toast, lower third, poll, stinger, sponsor)

Ctrl+D Fix data

Ctrl+P Pause or resume autopilot

Esc Close drawer, cancel a pending manual action

Hotkeys are rebindable and work when the console window is focused; global hotkeys are opt-in.

## 13. Build order

Phase Ships Builds on

P0 · Node Desktop app packaging the existing HUD server, overlays and GEP adapter; Capture only mode; Outputs; local console esportra-valorant-hud, esportra-desktop (ow-electron)

P1 · OBS control obs-websocket connection, one-click scene build, segment → scene, Take/Cut/Stinger, replay flow, tally P0

P2 · Autopilot Rundown runner, hold windows, in-round rules, Fix data, event log P1

P3 · Web Broadcast Shows, nodes and pairing, match context sync, live monitor, crew and links (migrations + RLS first) Esportra API, SignalR

P4 · Reports and loop Results to the bracket, sponsor proof, VOD chapters, share cards, co-stream links P3

P5 · Phone remote, vMix, multi-node polish P2, P3

P6 · Graphics Studio (desktop) Design your own HUDs and bind data (Compositor-style editor: layers, canvas, inspector, bindings, states) P0–P2

## 14. Open questions

- Riot policy: confirm the broadcast and commercial use of Valorant art and GEP data for paid tiers.

- Overwolf distribution: ship the node as an Overwolf-reviewed ow-electron app, or a signed installer with GEP support? This decides update cadence.

- Cloud relay: offer hosted browser sources for fully remote productions (adds bandwidth cost), or LAN/this-PC only at launch?

- Pricing: how many parallel nodes per plan; is the hands-free automation in the free tier?

- Replays without OBS replay buffer: also support vMix replay and a dedicated replay PC?

## Esportra Broadcast product requirements

Where we are, the goal, what we are building in full, and what comes next.



Product Esportra Broadcast (working name for the HUD tool)

Document PRD v1.0

Status Draft for CEO review

Date 3 October 2026

Owner Product (CPO) · Design: Creative Lead · Engineering: CTO

Companion docs UI/UX recipe and screens: README.md and the 19 pictures in this folder · HUD codebase: esportra-valorant-hud

## 1. Status: what we did, where we are

### 1.1 Already built (before this document)

esportra-valorant-hud, a working broadcast HUD (your codebase): - 45 browser-source graphics at 1920×1080: in-game layers, between-rounds panels, full-screen scenes, holding screens, stinger. - An operator control panel (control.html). - A real-time room server (server/server.js): rooms by match code, snapshot + JSON merge patch with versioning, an event log to ndjson, an HTTP API and static hosting. - A Valorant GEP adapter (adapters/valorant-gep.js) with tests and a simulator, plus an Overwolf capture starter. - Brand assets, fonts and a stinger render.

In Esportra (web): tournaments, brackets, map veto, match rooms, Riot-verified results, SignalR match rooms, and organizer dashboards. These are the data the broadcast tool automates from.

### 1.2 Done in this cycle

Area What Where

Share cards Esportra share cards made in-app from the Riot record (16:9 match, 4:5 player), downloadable by captains and organizers in the match room; broadcast redesign with MVP duel, team-colour lighting, angled boards src/components/share-cards/*, commits 1bb540d5, 82d4dd76

OBS overlay theme theme=esportra on the existing Riot OBS overlay routes, default on /debug/riot; old themes kept src/pages/debug/EsportraOverlay.tsx, commit 5794c800

Architecture decision Hybrid: desktop production node (GEP, local HUD server, OBS/vMix control, autopilot, offline) + web Broadcast section (plan, monitor, report). Graphics Studio deferred to desktop §18

Industry research LHM.gg, Singular.live, NodeCG, SuperConductor, community Valorant tools; our differentiators README.md §3

UI/UX 19 high-fidelity screens: 6 web, 8 desktop, 5 system boards, with numbered callouts design/hud-studio/*.png, commits 3a3f2830, 9f8679af

UX spec Recipe and ingredients: flows, per-screen behaviour, motion, automation model, OBS/vMix contract, data, reliability, a11y README.md

Design source Editable HTML sources and kit, rebuilt by the design pipeline design/source/hud-kit.mjs, design/source/hud/*.mjs

This PRD Goal, scope, requirements, acceptance criteria, release plan this file

### 1.3 Where we are

- Design: complete for the MVP surfaces, pending CEO review.

- Engineering: not started on the product. The HUD core is reusable as-is (graphics, room server, adapter).

- Next decision needed: approve scope and phases (§6, §14), then answer the open questions that block P0 (§19: Overwolf distribution, Riot policy).

## 2. Goal

Vision: every Esportra match can be a broadcast, produced by the tournament itself.

Goal for v1 (GA): an organizer links a tournament, pairs one PC, adds browser sources in OBS once, and every match on that node runs as a show with at least 80% of on-air changes made automatically. A producer only holds, skips or adds moments.

Business goals: 1. Make Esportra the default home for Pakistani and regional Valorant tournaments that stream, because production is easier here than anywhere else. 2. Open a paid tier for organizers who stream (nodes, parallel feeds, sponsor proof). 3. Raise sponsor value of Esportra events with measurable on-air time.

## 3. Problem

Running a Valorant tournament broadcast today needs: - A HUD tool, set up separately from the tournament. - Manual entry of teams, logos and scores. - An operator clicking graphics all match. - A producer switching OBS scenes by hand. - Someone copying results back into the bracket.

Small and mid-size organizers either don't stream, stream a bare game feed, or burn volunteers on repetitive clicks. Mistakes are public (wrong score, wrong team name), and sponsors get no proof of exposure.

Evidence we have: - The HUD we already built proves the graphics and data layer. - LHM.gg's growth proves demand for automation (it markets "up to 80%" automated production). - Esportra already holds the tournament data every one of those manual steps re-types.

## 4. Users and jobs to be done

Persona Context Jobs to be done Pain today

Ops lead (organizer staff) Runs 4–16 matches a day across 1–4 streams "Make sure every match that should be on stream is, with the right teams, without me babysitting each one" Spreadsheets, Discord pings, re-typing

Producer One stream, one PC, often a volunteer "Keep the show clean and react to moments, not do busywork" Clicks every round; misses replays; panics when OBS drops

Observer Spectates in Valorant "Watch the game; tell the producer when something deserves a replay" Shouts across the room

Crew Sets up OBS, cameras, audio "Add the graphics once and never touch them again" URLs change, sources break between matches

Caster / talent On the desk "Have my name right and the right stats on screen when I talk" Wrong lower thirds, no stats

Sponsor (indirect) Pays for placement "Proof I was on screen and for how long" Screenshots, guesses

Team / creator (indirect) Co-streams their matches "Show the live score on my stream" No official overlay

## 5. Product principles

- The tournament drives the show. If Esportra knows it, nobody types it.

- Autopilot, with a visible hold. Automation acts on its own, but always announces itself and can be stopped.

- Graphics never depend on OBS or the internet. Failures pause automation; they never blank the screen.

- One job per surface. Observer sends data, crew adds sources, producer decides, ops oversees.

- Rose means on air. The interface tells the truth about what viewers see.

- Everything has a keyboard path and an audit trail.

## 6. Scope

### 6.1 In scope for v1 (GA = phases P0–P4)

- Desktop production node: GEP capture (observer and optional player PCs), local HUD server serving the 45 graphics, producer console, OBS control, vMix control (basic), autopilot, Fix data, offline mode.

- Web Broadcast section: shows from tournaments, HUD pack and theme, rundown templates (Bo1, Bo3) and rules, node pairing and assignment, live monitor with remote hold/take, crew and links, post-show report.

- Results loop: map results confirmed from GEP into the bracket, corrections with source.

- Sponsor on-air proof, VOD chapters, share cards in the report.

- Onboarding checklist and one-click OBS scene build.

### 6.2 Later (post-GA)

- Phone remote (P5). Designed now, built after GA if time is tight.

- Graphics Studio, a desktop editor for custom HUDs and data binding (P6).

- Multi-game (CS2 via GSI, League) on the same node architecture.

- Cloud relay for fully remote productions.

- AI observer assistance (auto camera suggestions) and auto-highlight clips.

### 6.3 Non-goals for v1

- Encoding or streaming video (OBS/vMix keep that job).

- Replacing the Valorant observer (we don't control the game camera).

- Mac or Linux nodes (Windows only, because GEP and Valorant are Windows).

- Editing graphics layouts in v1 (themes only; layout editing is the Studio).

- Hosting VODs.

## 7. Success metrics

Metric Definition v1 target (90 days after GA)

North star: hands-free rate Automatic takes ÷ all takes (automatic + manual), per show ≥ 80% median

Time to first show Tournament linked → first match on air with autopilot ≤ 30 min median for a new org

Shows per week Matches produced through Broadcast 150 / week

Active orgs Orgs with ≥ 1 show in the last 30 days 25

On-air incidents Wrong score or team name on air, per 10 shows ≤ 1

Recovery Median time from OBS drop to resumed autopilot ≤ 30 s

Results loop Map results confirmed from GEP without manual entry ≥ 90% of produced maps

Sponsor proof exports Reports exported per sponsored show ≥ 50%

Producer satisfaction "How easy was today's show?" (1–5) after each show ≥ 4.3

Guardrails: no increase in disputes on produced matches; node crash rate under 1 per 50 show-hours.

Instrumentation: every take, hold, skip, data fix and incident is already an audited event (§11), so metrics come from broadcast_events without extra tracking.

## 8. System overview

- Web: plans shows, watches nodes, reports.

- Node: runs the show. It embeds the existing HUD server and graphics unchanged, and adds the show runner, OBS/vMix controller, console and offline queue.

- OBS: switches scenes on command.

- Graphics: follow state on their own, so rounds never switch scenes.

Full detail: README.md §4 and picture sys-15-how-it-works.png.

## 9. Requirements by epic

Each requirement has an ID, priority (P0 = GA blocker, P1 = GA target, P2 = post-GA), phase, and acceptance criteria. Screens are referenced by picture number (README.md §1).

### E1 · Production node and capture (phase P0)

E1.1 Install and pair: as an ops lead, I pair a PC to my organization so it can run shows. (P0, screens 7, 19) - Given a fresh install, when the app starts, then it shows a pairing code valid for 10 minutes and single use. - When org staff enters the code on the web, then the node appears in Production nodes within 3 s with its name and capabilities. - Revoking the node on the web disconnects it within 5 s; it returns to the pairing screen. - The node token is stored in the OS credential store, never in plain files.

E1.2 Local HUD server: as crew, I add browser sources that never need to change between matches. (P0, screen 12) - The node serves all 45 graphics at stable URLs per node (/o/<output>?k=<key>) on This PC and LAN addresses. - Switching matches on the node changes content, never URLs. - Each output reports its connection count and last frame time to the console and web. - The existing room protocol (snapshot, patch with v, event, resync) is unchanged; graphics from esportra-valorant-hud run without code changes.

E1.3 Capture only mode: as an observer, I send game data without being able to change the show. (P0, screen 11) - Choosing Capture only hides all show controls; the window shows destination, latency, features and hotkeys. - GEP messages reach the node over LAN with median latency ≤ 50 ms. - F9 sends a replay marker, F10 a producer flag; both appear in the console within 300 ms. - If the production PC is unreachable, the app buffers up to 60 s of messages and retries; it says so.

E1.4 Capture status and fallbacks: as a producer, I know what data I can trust. (P0, screen 10) - Each GEP feature shows Live or Covered, freshness and 60 s activity. - Spike timer derives from the plant event (45 s, with defuse markers); round timer counts locally and corrects on GEP time. - No events for 10 s during a live round marks the feed stale (console banner, web alert, on-screen "feed paused" tag).

E1.5 Simulator: as a producer, I rehearse without the game. (P1, screen 10) - Loads an .ndjson recording (from the room event log) or a scripted round; play, pause, speed 0.5–4×, scrub. - Drives graphics and autopilot; OBS switching only when "Allow OBS" is on.

E1.6 Player PCs: as a producer, I can add exact health and ability charges. (P2) - Installing the capture app on player PCs adds per-player health and charges; the console shows which players are covered.

### E2 · OBS and vMix control (phase P1)

E2.1 Connect to OBS (P0, screens 7, 9) - The node auto-detects OBS on the same PC (obs-websocket, port 4455) and asks only for the password; a LAN OBS needs IP and password once. - Connection state, version, Studio Mode and scene collection show on Scenes and Readiness. - Reconnect uses backoff 1, 2, 4, 8 s (max 10 s) and pauses autopilot while disconnected.

E2.2 One-click scene build (P0, screens 5, 9) - Creates scenes Holding, Gameplay, Fullscreen, Replay, Casters in a new scene collection "Esportra · ". - Adds the matching browser sources at 1920×1080 with "shutdown when not visible" off. - Adds labelled slots for game feed and caster cameras; detects when crew adds sources to them. - Never deletes or renames existing user scenes; rebuilding only touches Esportra-owned items.

E2.3 Segment → scene mapping (P0, screen 9) - Each segment maps to a scene and a transition (Cut, Fade N ms, Stinger); the scene list is read live from OBS. - Missing scenes block Publish to that node with a clear message.

E2.4 Takes (P0, screen 8) - Studio Mode on: load preview, then transition. Off: set program scene. - Take latency ≤ 100 ms on the same PC. - Tally on console, web and phone follows OBS events, never local assumptions.

E2.5 Replays (P1) - Replay trigger saves the replay buffer, loads the clip into the Replay scene's media source, switches with stinger, and returns to the previous scene when the clip ends. - If the replay buffer is off, the trigger is disabled with the reason.

E2.6 vMix (P1) - Same mapping with inputs instead of scenes via the HTTP API; tally from the XML state; Cut, Fade and Stinger 1–4 supported.

E2.7 Multiple switchers (P2) - A node can hold several OBS or vMix connections; each segment targets one.

### E3 · Autopilot, rundowns and rules (phase P2)

E3.1 Rundown templates (P0, screen 3) - Ship Bo1 and Bo3 templates with the segments in README §5.3. - Segments have trigger, graphics, scene, transition, hold window (Auto / N s / Manual) and mode.

E3.2 Triggers (P0) - Supported: match room opened, check-in complete, veto step, veto complete, agent select, round phase, kill and multi-kill, spike planted or defused, map end, series decided, rescheduled, forfeit, clock time, delay, hotkey, remote command, observer flag. - Each trigger has a test fire in the web editor and in the simulator.

E3.3 Hold windows (P0, screens 8, 17) - An armed automatic take shows the Next card with a countdown equal to its hold window. - H holds (waits for Take or Skip), S skips, Space takes now. All three work from the console, phone and web. - Holds and skips are audited with actor and time.

E3.4 In-round rules (P0) - Buy phase → economy board, round end → recap N s, spike planted → spike timer, multi-kill/clutch/flawless → banner, tech pause → pause panel. - In-round rules never switch OBS scenes unless a rule explicitly says so (e.g. tech pause → BRB).

E3.5 Safety (P0) - No automatic take during tech pause or timeout, except the pause rule itself. - OBS disconnected → autopilot paused; queued takes are dropped, not replayed later. - Commands carry ids; duplicates are ignored.

E3.6 Publishing (P1) - Publish creates a new rundown version; nodes switch at the next segment boundary. - Nodes show which rundown version they run; the web shows nodes on an old version.

E3.7 Rule editor (P1, screen 3) - When / Only if / Then with ordered actions; actions limited to node capabilities; validation inline.

### E4 · Producer console (phases P1–P2)

E4.1 Monitors and take bar (P0, screen 8): PVW (amber) and PGM (rose) mirror OBS; Take / Cut / Stinger with hotkeys. E4.2 Now / next / coming up (P0): the current segment, the armed next action with countdown, and the next three segments. E4.3 Graphic layers (P0): every graphic grouped by layer with On / Auto / Off and a hotkey. Manual override wins until the next segment. E4.4 Triggers pad (P0): F1–F8 for tech pause, timeout, replay, toast, caster lower third, poll, stinger, sponsor read. Toast and poll open a small inline form. E4.5 Lower thirds (P1): one-click talent and player spotlight from the show's talent list. E4.6 Live data strip and event log (P0): round, phase, score, alive, banks, spike; newest-first log of game and show events. E4.7 Fix data (P0, screen 13): - Covers score, names (Riot ID → display), sides, series and observed player. - Applies on air immediately, and the feed doesn't overwrite fixed fields until the next round. - A map score change asks "On air only" or "Air and bracket". - Undo last is available, and every change is audited. E4.8 Keyboard (P0): the full map in README §12; rebindable; window-focused by default.

### E5 · Web: shows and setup (phase P3)

E5.1 Create a show from a tournament (P0, screens 19, 2): choose tournament and stages; matches become show entries; new matches join as the bracket advances. E5.2 HUD pack and theme (P0): Esportra pack selection, team colours toggle, event bug, sponsor rotation, stinger. E5.3 Sync from the tournament (P0): teams, logos, colours, rosters, schedule, veto steps and series score push to nodes within 5 s of a change. E5.4 Brand and talent (P1): sponsors (logo, reads, rotation), casters and talent cards, per-show overrides of team display names. E5.5 Node assignment (P0): assign matches to nodes; "Needs a node" blocks only that match; drag to reassign. E5.6 Broadcast home (P0, screen 1): KPIs, live cards with autopilot line, auto-queued list, nodes, alerts.

### E6 · Web: live monitor (phase P3)

E6.1 Tiles (P0, screen 4): per live node, PGM/PVW thumbnails (2 fps via OBS screenshots), score, tally, autopilot state, feed health. E6.2 Remote control (P0): Hold, Take now, Resume autopilot; node acknowledges in ≤ 300 ms; the UI shows pending until acked. E6.3 Node chat (P1): ops ↔ producer messages with system events inline. E6.4 Show timeline (P1): 60-minute strip with automatic takes, holds and manual takes. E6.5 Incidents (P0): OBS drops, stale feed, output dropped, data fixes, with time and actor.

### E7 · Crew, links and access (phase P3)

E7.1 Roles (P0, screen 5): ops lead, producer, observer, crew, enforced server-side. E7.2 Invites (P0): email + in-app; role per show; revoke. E7.3 Browser source links (P0): per node and output, LAN / This PC / Cloud relay (relay is P2), copy and QR, tally. E7.4 Key rotation (P1): rotate pushes the new key to connected sources; old links die after 60 s. E7.5 Co-stream links (P1): watch-party overlay (score, series, veto), no controls, expires at series end.

### E8 · Reports and results loop (phase P4)

E8.1 Results to the bracket (P0, screen 6): GEP map end with a final score creates a verified map result for the Esportra match; conflicts with a reported result open the existing dispute flow instead of overwriting. E8.2 Show report (P1): KPIs, sponsor time on air, VOD chapters, incidents, share cards. E8.3 Sponsor proof (P1): per-sponsor minutes, placements, timestamps and thumbnails; PDF export. E8.4 VOD chapters (P1): from segment and round events, YouTube-ready text.

### E9 · Offline and sync (phase P2)

E9.1 Run offline (P0, screen 14): with no internet, graphics, autopilot, OBS control and LAN capture continue. E9.2 Sync queue (P0): results, corrections and report data persist on disk and replay in order when online. E9.3 Conflicts (P1): match assignment and results conflicts show both versions with who and when; config uses last-writer-wins.

### E10 · Phone remote (phase P5)

E10.1 (P2, screen 18): QR pairing from the console; now/next with Hold, Skip, Take now; triggers; alerts; same session as the console.

### E11 · Onboarding (phase P3)

E11.1 (P0, screen 19): nine-step checklist with progress and resume. Every step deep-links to where it happens. Target: a new org completes it in ≤ 30 min.

## 10. Non-functional requirements

Area Requirement

Performance GEP → on screen ≤ 150 ms p95 on LAN. Take ≤ 100 ms same PC. Remote take ack ≤ 300 ms. Graphics at 60 fps on a GTX 1650 / i5-9400 class streaming PC while OBS encodes 1080p60. Node CPU ≤ 5% and RAM ≤ 400 MB idle with all outputs connected

Reliability Node crash rate < 1 per 50 show-hours. Auto-restart and resume the current segment after a crash in ≤ 10 s. No on-air blanking from any single failure (OBS link, internet, cloud, observer PC)

Compatibility Windows 10 22H2+ and 11. OBS 28+ (obs-websocket v5). vMix 26+. Valorant observer client. Browsers for web: last 2 versions of Chrome, Edge, Firefox, Safari

Scalability 50 concurrent live nodes at GA, 500 within a year. Hub fan-out per show ≤ 20 web viewers

Security See §13

Accessibility WCAG 2.2 AA on web surfaces; keyboard-complete console; colour never the only signal

Localization English at GA; strings externalized; Urdu-ready layout (RTL not required for GA)

Observability Node heartbeats, structured logs (local, rotated 7 days), crash reports with consent, show event stream as metrics source

Updates Node checks for updates when idle, never during a live show; rollback to previous version available

## 11. Data model

Proposed Supabase tables (RLS on every table, default deny), or .NET-owned equivalents where the domain already lives there:

Entity Fields Notes

broadcast_shows id, organization_id, tournament_id, name, stage_ids[], hud_pack, theme jsonb, rundown_template_id, status, created_by One per covered tournament scope

broadcast_show_matches show_id, match_id, node_id?, starts_at, status (queued, live, done, skipped) Created as the bracket produces matches

broadcast_nodes id, organization_id, name, capabilities jsonb, app_version, last_seen_at, token_hash, revoked_at Pairing via RPC only

broadcast_pairing_codes code_hash, organization_id, expires_at, used_at Single use, 10 min

rundown_templates id, organization_id?, name, best_of, version, published_at System templates have null org

rundown_segments template_id, version, position, key, trigger jsonb, graphics jsonb, scene_key, transition jsonb, hold_seconds, mode, repeats_per_map Immutable per version

automation_rules id, template_id, version, segment_key?, when jsonb, only_if jsonb, actions jsonb, enabled In-round rules attach to a segment

broadcast_outputs node_id, kind, key_hash, rotated_at Keys shown once

broadcast_crew show_id, user_id, role ops_lead, producer, observer, crew

broadcast_talent show_id, name, role, handle Lower thirds

broadcast_sponsors show_id, name, logo_path, placements[], read_text, rotation_seconds Sponsor proof joins events to these

broadcast_events id, show_id, node_id, match_id, type, payload jsonb, actor_id?, command_id?, created_at Append-only; source of reports and metrics

broadcast_corrections match_id, map_number, before jsonb, after jsonb, source (producer, gep), actor_id, created_at Feeds bracket correction records

Event types (non-exhaustive): segment.armed, segment.held, segment.skipped, take.auto, take.manual, trigger.fired, data.fixed, obs.disconnected, obs.connected, feed.stale, feed.recovered, output.dropped, result.verified, sponsor.onair (start/stop), node.offline, node.online.

## 12. Interfaces and contracts

Detail lives in README.md §10. Summary:

Interface Contract

Web ↔ API REST for CRUD on shows, templates, rules, crew, nodes; existing auth; Zod schemas shared with forms

Broadcast hub (SignalR) Heartbeat, Event, CommandAck up; ShowConfig, MatchContext, Command down. Node-initiated connection, node token auth

Node ↔ graphics Existing HUD room protocol (snapshot, patch with v, event, resync), unchanged

Observer → node WebSocket role=ingest with node key; raw GEP messages; adapter runs on the node

Node → OBS obs-websocket v5 requests and events (connect, read and build scenes, takes, transitions, replay flow, screenshots for monitor)

Node → vMix HTTP API functions; XML state for tally

Results Node posts result.verified with map number, score, Riot match id; API creates the verified map result or opens a dispute on conflict

Versioning: hub messages carry schema: 1; nodes refuse newer major versions and prompt to update when idle.

## 13. Security, privacy and compliance

Aligned with the repo's blocking security rules (CLAUDE.md):

- Never trust the client. Role, ownership and assignment are checked in RLS, RPCs and hub authorization. The node token only allows its org's shows and assigned matches.

- No service-role keys in the desktop app. Only the node token (OS credential store) and public anon config.

- Output keys are per node, hashed at rest, rotatable. Graphics are read-only (role=overlay). Write roles (control, ingest) need the key.

- Observer isolation: capture-only can only send ingest messages; it can't issue commands.

- Audit: every on-air change is an event with actor or system source.

- Personal data: player Riot IDs and display names already exist in Esportra. Webcam frames are never captured by us. Crash reports are opt-in and scrubbed of tokens.

- Riot and Overwolf: follow Riot's broadcast and API policies for Valorant art and data (art loads from the community API at runtime; no redistribution). GEP use per Overwolf's terms. Confirm commercial terms before paid tiers (§19).

- Never weaken RLS, triggers or storage policies to make a feature work.

## 14. Release plan and milestones

Phase Content Exit criteria Estimate

P0 · Node Desktop app with embedded HUD server and graphics, pairing, Capture only, Outputs, capture status, simulator A paired node serves all graphics to OBS from GEP on a real observer PC; LAN latency ≤ 150 ms p95 3 weeks

P1 · OBS control Connect, one-click scene build, segment → scene, takes, replays, tally, console monitors and take bar Producer can run a Bo3 manually from the console without touching OBS 3 weeks

P2 · Autopilot Templates, triggers, hold windows, in-round rules, safety, Fix data, offline queue A recorded Bo3 runs end to end on autopilot with ≥ 80% automatic takes in simulation 3 weeks

P3 · Web Broadcast Migrations + RLS, shows, sync, nodes, assignment, live monitor, crew, links, onboarding A new org goes from tournament to first live show in ≤ 30 min in a moderated test 4 weeks

P4 · Loop and reports Results to the bracket, report, sponsor proof, VOD chapters, co-stream links 90% of produced maps confirm results without manual entry in alpha events 2 weeks

Alpha Esportra-run events on 1–2 nodes 10 shows, ≤ 1 on-air incident per 10 shows 2 weeks (overlaps P4)

Beta 5–10 partner organizers Success metrics trending to targets; no P0 bugs open for 7 days 4 weeks

GA Public, paid tier on Metrics in §7 tracked; support playbook ready —

P5 Phone remote, vMix polish, multi-switcher 2 weeks

P6 Graphics Studio (desktop) Separate PRD —

Estimates assume one desktop engineer, one full-stack engineer, part-time design and QA. They are planning guidance, not commitments.

## 15. Quality plan

- Unit: adapter (GEP shapes), rundown state machine, rule evaluation, hold/skip/take logic, conflict resolution (Vitest, existing tests extended).

- Integration: node ↔ OBS against a real OBS in CI (Windows runner), node ↔ hub with a test hub, results loop against a staging API.

- Simulation: recorded matches replayed at speed through autopilot; assert segment order, scene changes and hold behaviour.

- Chaos: kill OBS, drop internet, stop observer PC, close a source mid-show; assert no blanking and correct alerts.

- Security: RLS tests as non-admin (other org, crew, observer), token revocation, key rotation, command spoofing.

- Performance: latency harness from GEP ingest to frame paint; CPU and RAM on the reference PC during 1080p60 encode.

- Acceptance: each epic's criteria above, verified with evidence by QA before phase exit.

- Test matrix: Windows 10/11 × OBS 28/30/31 × Studio Mode on/off × single-PC / two-PC × vMix 26/27.

## 16. Risks and mitigations

Risk Likelihood Impact Mitigation

Riot policy limits commercial use of art or data Medium High Legal review before paid tier; art loaded at runtime, not redistributed; fallback to text-only graphics

Overwolf review slows releases Medium Medium Decide distribution early (§19); keep capture a thin module so most code ships outside it

GEP gaps or changes (no round timer, limited health) High Medium Fallback rules already designed; adapter covered by recorded-message tests; monitor Overwolf changelogs

OBS version differences Medium Medium Target obs-websocket v5 only; test matrix; graceful capability detection

Venue networks block LAN traffic between PCs Medium Medium Single-PC mode; diagnostics on Capture screen; documented firewall rule

Producers distrust autopilot Medium High Hold windows everywhere, Manual segments, simulator rehearsal, visible audit

Scope creep into a full production suite High Medium Non-goals in §6.3; Studio as separate PRD

Single engineer bottleneck on desktop Medium High P0 reuses the existing HUD; hire or contract a second desktop engineer before P2

## 17. Packaging and pricing hypotheses

To validate in beta; not decided.

Tier For Includes

Free Community tournaments 1 node, Esportra pack, autopilot with manual-default rundown, Esportra watermark on holding screens

Pro Organizers who stream weekly 4 nodes, full autopilot, sponsor proof, VOD chapters, co-stream links, no watermark

Event One-off big events Unlimited nodes for 7 days, priority support, custom theme setup

Hypothesis: sponsor proof and hands-free autopilot are the paid triggers; nodes are the volume lever.

## 18. Decisions log

# Decision Why Date

D1 Hybrid architecture: desktop production node + web Broadcast section GEP and OBS are local; the show must survive internet drops; ops and monitoring belong on the web 3 Oct 2026

D2 OBS/vMix control via obs-websocket v5 / vMix HTTP API from the node, not webhooks or the web OBS exposes a local WebSocket; the cloud can't reach venue LANs reliably 3 Oct 2026

D3 Autopilot with hold windows as the core interaction Industry automates blindly; producers need to trust and stop it 3 Oct 2026

D4 Rounds never switch scenes; graphics update inside the in-game HUD Fewer OBS changes, failures stay harmless 3 Oct 2026

D5 Reuse the existing HUD graphics, room server and adapter unchanged inside the node Fastest path; already tested 3 Oct 2026

D6 Graphics Studio deferred to a desktop phase (Compositor as UX reference) Better as a desktop app; not needed for automation value 3 Oct 2026

D7 Rose = on air only; amber = cued/hold Interface must tell the truth about what viewers see 3 Oct 2026

D8 Esportra theme kept alongside old OBS overlay themes on /debug/riot Test the new design without breaking existing setups 3 Oct 2026

## 19. Open questions

# Question Blocks Owner

Q1 Distribute the node through Overwolf (ow-electron app review) or as a signed installer with GEP support? P0 packaging CTO

Q2 Riot terms for commercial broadcast use of Valorant art and GEP data in paid tiers Paid launch CEO / legal

Q3 Supabase tables vs .NET-owned domain for broadcast data (the API already owns tournaments) P3 migrations CTO + database lead

Q4 Cloud relay for remote productions at GA, or later? E7.3 scope CPO

Q5 Is the phone remote needed at GA for floor producers? P5 timing CPO

Q6 Which partner organizers join beta? Beta COO

Q7 Pricing tiers and node limits GA CFO

## 20. What's next

Immediately (this week): 1. CEO review of this PRD and the 19 screens; approve scope (§6) and phases (§14). 2. Answer Q1 and Q3; they shape P0 and P3. 3. Promote the share-card and overlay work on staging to production after a look on staging (already pending).

P0 kickoff (next 3 weeks), in order: 1. Create the desktop app shell in esportra-desktop (ow-electron) with sign-in and pairing (E1.1). 2. Embed server/server.js, overlays/ and core/ from esportra-valorant-hud; serve them per node with output keys (E1.2). 3. Port adapters/valorant-gep.js and the capture starter into Capture only mode with LAN ingest (E1.3). 4. Build the Capture and Outputs screens from pictures 10–12 (E1.4). 5. Simulator from ndjson logs (E1.5). 6. Exit test on a real observer PC + OBS (latency, stability).

Parallel (web, low risk): draft migrations and RLS for broadcast_nodes, broadcast_pairing_codes, broadcast_shows; review with the database and security leads before P3.

## 21. Glossary

Term Meaning

Node A paired production PC running the Esportra Broadcast desktop app

Show A tournament (or stages of it) covered with one look and rundown

Rundown Ordered segments for a match type (Bo1, Bo3)

Segment A part of the show with its trigger, graphics, scene, transition and hold window

Rule When + Only if + Then actions; in-round rules run inside a segment

Hold window Countdown before an automatic take, during which anyone can hold or skip

Autopilot The node running segments and rules on its own

PVW / PGM Preview (next) and Program (on air), as in OBS Studio Mode or vMix

Tally Indicator of what is on air (rose) or in preview (amber)

GEP Overwolf Game Events Provider: Valorant game data available to apps on the same PC

Capture only Desktop app mode on the observer PC that only sends game data

Browser source A web page added to OBS/vMix as a video source

obs-websocket OBS's built-in remote-control WebSocket server (v5, OBS 28+)

## 22. Appendix: related work shipped this cycle

Production (main) and staging (staging), newest first:

Commit Change Env

9f8679af Esportra Broadcast screens (web, desktop node, system) staging

3a3f2830 Broadcast design kit and first web screens staging

82d4dd76 Broadcast redesign of match and player share cards staging

5794c800 Esportra theme for the Riot OBS overlay staging

1bb540d5 Share cards for captains and organizers; tournament card image fix; Riot match id hidden in bracket results staging

04153519 Riot stats window performance (cached catalogs, cheaper effects) production

fd09fb2b Full-height public bracket; full Riot match stats restored production

e01ad451 Tournament card hover fix and compact card production

95827e4a One tournament card for browse, manage and profiles production

e22b68f8, 4315f0be Notifications redesign production
