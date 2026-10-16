# PROJ-061 partial requirements completion

Date: 14 October 2026. User authorized completing the 38 existing partial requirements first and reserved implementation of the 13 missing requirements for a later selection.

## Current state

The earlier production batch closed five scopes. This continuation has closed sixteen more locally, including pairing recovery, stale-feed warnings, rehearsal, OBS source slots, crew delivery, timelines/incidents, round chapters, versioned rundown publication, Bo1/Bo3 flows, pause graphics, stage following, HUD appearance, tournament sync, show branding and complete correction scope/review/Undo. Current counts (15 October): **23 implemented / 18 partial / 12 missing**. The full product is unfinished; partials dependent on the user's reserved missing-feature choices remain open.

Only local source and isolated fixture behavior are verified. No current changes are committed, deployed or accepted. The existing installer and staging deployments predate the new setup and production interface.

## Original partial work register

| Requirement | Current state | Remaining scope |
| --- | --- | --- |
| E1.1 | Functionally implemented locally | Web-generated direction is the accepted current workflow. Real staging/account timing and independent acceptance remain pending. |
| E1.2 | Open partial | Output access keys/rotation remain part of user-reserved E7.4. Live output/LAN rendering acceptance remains pending. |
| E1.3 | Open partial | The reported delivery metric is acknowledgement round-trip median, not one-way event-to-frame latency. Actual game/LAN p95 acceptance is unverified. |
| E1.4 | Functionally implemented locally | Live SDK/OBS timing and independent acceptance remain pending. |
| E1.5 | Functionally implemented locally | Recorded Bo3 timing and live OBS rehearsal acceptance remain pending. No arbitrary file import; the PRD scripted-round alternative is shipped locally. |
| E1.6 | Open partial | Exact numerical charges remain dependent on actual SDK reporting. Live player-PC/game verification is unexecuted. |
| E2.1 | Functionally implemented locally | Live same-PC/LAN connection and reconnect timing acceptance remains unverified. |
| E2.2 | Functionally implemented locally | Actual OBS device/camera/game source acceptance remains pending. Existing-collection screen preparation is retained. |
| E2.3 | Open partial | Per-node web publish readiness remains dependent on node assignment (E5.5). |
| E2.4 | Open partial | Remote web/phone tally depends on E6.1 and E10.1; live latency acceptance remains pending. |
| E2.5 | Functionally implemented locally | Live playback with an actual OBS recording/Stinger remains unverified. |
| E3.1 | Functionally implemented locally | Bo1/Bo3 flows, validated cue/mode/screen/scene/transition/Hold settings and live supported game/observer cues are wired. Full cue delivery/test-fire remains E3.2; full rule editor is reserved E3.7. Live acceptance pending. |
| E3.2 | Open partial | Supported parsed game/observer cues now drive configured windows. Tournament/agent/kill/clock/delay/hotkey cue delivery and isolated web/simulator test-fire remain; remote commands depend on E6.2. |
| E3.3 | Open partial | Hold freezes automatic advancement and waits for explicit Take/Skip locally. Remote actions depend on E6.2/E10.1; other cue delivery remains under E3.2. |
| E3.4 | Functionally implemented locally | Parsed game graphics, delayed manual pause/timeout panels and explicit existing pause scene exception are wired. General web rule editing is reserved E3.7; live acceptance pending. |
| E3.5 | Open partial | Local pause exception, reconnect/manual pause and dropped replay/auto-take safety are verified. Remote command lifecycle depends on reserved E6.2; real network/OBS acceptance pending. |
| E3.6 | Functionally implemented locally | Live OBS/network timing and independent acceptance remain pending. Current Program/history are preserved; only upcoming items update at confirmed boundaries. |
| E4.1 | Functionally implemented locally | Real OBS media/transition visuals and live latency acceptance remain unverified. |
| E4.2 | Functionally implemented locally | Live operator acceptance remains pending. |
| E4.4 | Open partial | Caster lower-third selection is user-reserved E4.5. Existing F1–F8 defaults are retained; added actions are rebindable. |
| E4.6 | Functionally implemented locally | Live observer accuracy and acceptance remain unverified; raw GEP stays on LAN. |
| E4.7 | Functionally implemented locally | Round/source-preserving score, map, series, team/player-name, side and focus fixes; Undo and Air-only/official-review selection. Active authorized crew review is atomic, scoped and stale-score guarded. Live/independent acceptance remains pending. |
| E4.8 | Open partial | Full graphic-layer and talent/player actions depend on user-reserved E4.3/E4.5. |
| E5.1 | Functionally implemented locally | Opt-in stage following adds eligible resolved entries without changing Program or removing slots. Live bracket acceptance pending; 200-entry capacity and bounded batches are explicit. |
| E5.2 | Functionally implemented locally | Installed pack, actual themes/colors/event bug/rotation and an existing OBS Stinger selection are wired. New imports inherit it; existing item choices persist. Live clip/operator acceptance pending. |
| E5.3 | Functionally implemented locally | Selected-show identity/roster/schedule/veto/series/branding refresh every five seconds without replacing live GEP or rundown. Actual healthy-network delivery within five seconds and live acceptance pending. |
| E5.4 | Functionally implemented locally | Existing talent/caster cards, sponsor assets/reads, saved rotation and per-show display-name overrides are wired. Live acceptance pending; automatic proof is E8.3 and selected talent actions are E4.5. |
| E5.6 | Open partial | No genuine live autopilot cards or automatic match queue. |
| E6.4 | Functionally implemented locally | Live OBS/game/output incident rehearsal and independent acceptance remain pending. Actor categories identify the local operation/source; they do not certify a named employee. Timeline retention is explicitly bounded. |
| E6.5 | Functionally implemented locally | Live OBS/game/output incident rehearsal and independent acceptance remain pending. Actor categories identify the local operation/source; they do not certify a named employee. Timeline retention is explicitly bounded. |
| E7.1 | Open partial | Role/capability matrix differs from PRD; no complete ops-staff/device control model. |
| E7.2 | Functionally implemented locally | Live configured email delivery, notification timing and independent acceptance remain pending; isolated tests do not send external messages. |
| E7.3 | Open partial | No web crew-source catalogue, QR, per-source tally or cloud relay. |
| E8.1 | Open partial | Manual durable Air proposals and authorized official review work. Automatic GEP map-end capture, Riot verification and full dispute/advancement remain open. |
| E8.2 | Open partial | No complete automation/latency/incident KPIs or share-card workflow. |
| E8.3 | Open partial | Screenshot proof timeline and verified automatic visibility attribution remain unfinished. Current new read controls are explicitly operator-reported. |
| E8.4 | Functionally implemented locally | Live full match/recording alignment and independent acceptance remain pending. |
| E9.2 | Open partial | Manual official-result proposals replay durably with original pairing/show/match/teams and typed acknowledgment. Automatic GEP capture and live offline game/OBS/proof rehearsal remain open. |
| E9.3 | Open partial | No assignment conflict workflow or versioned last-writer-wins reconciliation UI. |

## Missing requirements reserved for user selection

| Selection | Requirement | Scope |
| --- | --- | --- |
| 1 (reclassified) | E1.6 | Existing player-PC GEP support is partial; see correction below |
| 2 | E2.6 | vMix production integration |
| 3 | E2.7 | Multiple switchers on a node |
| 4 | E3.7 | Web automation rule editor |
| 5 | E4.3 | Graphics On / Auto / Off controls |
| 6 | E4.5 | Talent and player spotlight |
| 7 | E5.5 | Match-to-node assignment |
| 8 | E6.1 | Remote preview/program monitoring |
| 9 | E6.2 | Web Hold / Take / Resume |
| 10 | E6.3 | Broadcast crew chat |
| 11 | E7.4 | Output key rotation |
| 12 | E7.5 | Expiring co-stream links |
| 13 | E10.1 | Phone production remote |

## Verification and boundaries

- Air: 70 automated tests pass; renderer build passes. The native Electron fixture passes 18 checks, including persisted scene mapping, missing-scene rejection, Cut, inactive-buffer rejection, playback-ended return and independent timeout/technical pause. These use mock OBS and platform services, not a live tournament.
- Actual HUD server integration confirms unauthorized ingest cannot emit production callbacks and authorized ingest forwards the adapter's actual round.phase event. Local game logs do not enter the cloud event allowlist.
- The only active UI reference remains design/implemented/index.html. The original index.html and its linked screens are preserved.
- Backend DB integration tests from the setup redesign still require an isolated PostgreSQL/Docker environment. No backend code was changed by this production batch.
- Obsidian MCP is unavailable; no current vault save is claimed. Consolidate this checkpoint through MCP when available after reading current shared notes.

## Runtime decisions

- Advanced scene mappings and graphic timings use the established Command Console direction. They stay outside the main take path. The production hierarchy is On air, Next action, then Coming up; compact command buttons use two readable columns.
- Same-PC and LAN ingestion notify production after the existing Valorant adapter parses packets. Default graphic rules use the actual HUD schema and never switch OBS scenes. The previous raw-packet-to-rule call was removed because event names did not match.
- OBS tally is authoritative. A take that receives no tally within three seconds returns to armed with an explicit error instead of claiming on-air success. OBS transition events prevent overlapping takes.
- Stinger/Fade require Studio Mode. Operators choose transitions already installed in OBS; Air does not invent media or alter unrelated inputs. Replay uses only its own named media source and cancels return after a manual program change.
- LAN OBS requires an explicit checkbox for a private IPv4 address. Invalid ports and unapproved LAN targets are rejected through trusted IPC. Credentials remain in the OS store, never in the renderer status or node-config file.
- Source protocol reference: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md. Live OBS, game and latency acceptance remains separate from fixtures.

## Continuation

Continue with independent partial requirements in the register: pairing revocation, stable outputs, observer buffering/markers, simulator, scene collections/source readiness, tournament enrollment/sync, versions and reporting/proof delivery. Keep missing capabilities parked. Requirements involving remote web/phone control, node assignment or full graphics layers must retain their dependency status until the user selects those missing scopes. Live hardware, game and latency acceptance are separate from functional implementation.


## E1.6 classification correction — 14 October 2026

The user questioned whether player-PC game data already uses the existing GEP. Source inspection confirms that it does. The ow-electron agent chooses the player role when ESPORTRA_PLAYER_ID is supplied, requests the me feature and tags packets with playerId. The adapter already maps health and abilities to that player's HUD slot. Therefore E1.6 has meaningful existing implementation and belongs in partial, rather than missing.

The normal Air launcher neither accepts nor passes player identity, so these hooks do not establish a supported operator workflow. Player selection/configuration, per-player coverage/freshness and live verification remain unfinished. Overwolf's current Valorant documentation lists local-player health and ability availability; its example uses availability booleans and does not establish exact numerical charges for every player on an observer PC. Source: https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/valorant/#me

Current classification is 7 implemented / 34 partial / 12 missing. This is an audit correction, not newly delivered functionality. Keep the other missing-feature selection numbers unchanged to avoid confusing the ongoing discussion. Obsidian MCP remains unavailable; sync this verified correction through MCP when it returns.


## Current continuation checkpoint — 14 October 2026

This section supersedes older implementation/blocker statements above; earlier checkpoints are retained as history.

- Player PCs reuse existing GEP capture, automatically identify their player and report coverage. Early packets are buffered; previous-round health/abilities become unknown until refreshed. Ability availability is not falsely labeled exact charges.
- Observer recovery keeps up to 60 seconds under bounded memory, with sequence/ACK recovery and F9/F10 markers. Recovered game events do not cause old automatic takes. ACK median is explicitly round-trip, not one-way latency.
- Stable /o output URLs follow match selection without reconnecting or replacing OBS URLs. Desktop/web show reported connections and actual render-heartbeat timestamps; output access keys/rotation remain reserved.
- Packaged scripted rehearsal owns its HUD room, RulesEngine and ShowRunner. Play/pause/speed/scrub work; real OBS changes require opt-in, idle production/capture and actual tally. Dry-run tally is explicitly simulated.
- Collection/slot preparation only adopts collections created by Air. Existing sources/other collections survive rebuilding. Active streaming or recording blocks collection and slot mutation.
- Toast/poll forms use existing HUD fields; assigned sponsor reads are operator-reported. Read placements retain original show/start identity across restart and queue delivery. API end records now close open starts; retries acknowledge existing rows without double counting. Foreign sponsors/segments and reversed times are rejected.
- Parsed round events create typed metadata chapters; raw capture is rejected at platform drains. Existing segment chapters/report/YouTube copy remain compatible.
- Local PostgreSQL 15.19 fixture resolves the former Docker blocker. MatchChoice and ShowDetailMatchSlotRow DateTimeOffset declarations caused reproduced Dapper 500s; database row types now match Npgsql DateTime.

Executed checks: Air 94 tests and renderer build; 26 native Electron checks with mocked platform hub/OBS and isolated credentials (no actual capture); broadcast PostgreSQL suite 117 passed, then node lifecycle 3 and pairing issuance/expiry/revoke 2 passed after authenticated revoke push. Core targeted 7 and frontend health 3 tests passed; scoped lint, frontend production build/chunk/button/JSX checks passed. Targeted C# formatting verification and screen exports passed. Native async polling was repaired to await IPC state before claiming OBS confirmation; all affected checks then passed.

No current changes committed, pushed, deployed or independently accepted. Staging and installer still predate this work. Obsidian MCP is available: prior pending work and this checkpoint are consolidated under 08-Sessions/2026-10-14-PROJ-061-Partial-Requirements-Continuation.md. Continue the remaining 29 partial scopes, keeping dependency boundaries explicit.


#### Crew invitation continuation — 14 October 2026

Backend and web email/in-app invitation workflow implemented locally. Recipient-bound invitations require a verified account; wrong-account token/ID acceptance is denied. Known recipients get a persisted notification and private inbox entry. Email delivery reports provider submission versus failure; failure preserves the invitation and single-use fallback link. Legacy link-only invitations remain supported. An older backend response that silently ignores email binding is cancelled by the frontend instead of being presented as a targeted invitation.

Migration 20261014210000_broadcast_crew_invite_delivery.sql adds nullable recipient/email-status fields and indexes, without changing RLS. Raw invite tokens are not persisted or included in inbox/notification rows. Tests use an in-memory email sink; no external messages sent. All 122 broadcast API tests, new invitation delivery 3 and frontend binding-compatibility 2 tests/scoped lint pass. Web production build passes. Updated email/inbox reference screens and final formatting verification are underway; E7.2 grading waits for those checks. Other partials continue; no new commit/deploy/acceptance.


Latest verified invitation checkpoint: **13 implemented / 28 partial / 12 missing** after closing E7.2 locally. All 122 PostgreSQL broadcast API tests, email recipient/inbox guards, frontend binding compatibility 2 tests and scoped lint pass. Production frontend build passes. Implemented reference has 117 real-component fixture captures across 26 A–Z groups; renderer/overflow/gallery checks pass. No actual external email, new deployment or acceptance. Account-bound invites disappear if the bound account is deleted, rather than reopening to another account. Continue the remaining partials, next timeline/incident visibility.


### Timeline/incident checkpoint — 14 October 2026

Current coverage: **15 implemented / 26 partial / 12 missing**. E6.4/E6.5 close locally after desktop/web one-hour timelines, confirmed take attribution, holds and incident transitions. Role/source categories are explicit; older actorless records stay unspecified. Typed metadata never includes raw game telemetry or correction reasons; owner guards/redaction pass. Unsupported metadata on an older backend is grouped separately so it cannot block existing event delivery.

Additional reliability fixes: cached live rounds are stale until a real observer packet arrives; scripted graphics timers freeze with virtual playback; rehearsal uses a random 32-character ephemeral room that cannot collide with a supported match code and writes no demo state/log files; nested video slots stay below HUD browser sources. Pairing/revocation writes are serialized and stale hub callbacks cannot replace a new pairing/configuration. Recovered capture retains its prior buffering age across both transport hops.

Checks: Air 101 tests/build and 27 native fixture checks passed; all 125 PostgreSQL broadcast API tests passed (fake email). Web production build/scoped lint and gallery 119 captures across A–Z pass. Targeted formatting verification is being finalized. Real hardware/game/latency, independent review, installer and deployment remain separate. Next partials: publication/templates/hold behavior and tournament synchronization/branding, preserving dependencies on user-reserved missing capabilities.
