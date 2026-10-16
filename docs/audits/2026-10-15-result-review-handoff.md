# PROJ-061: scoped corrections and official-result review

15 October 2026. User authorized finishing the existing partial requirements first. Single-agent continuation; reserved missing capabilities remain unchanged.

Current local functional coverage is **23 implemented / 18 partial / 12 missing**. E4.7 is now functionally implemented locally. This follows the 22/19/12 stage-following/appearance checkpoint. Functional implementation, live acceptance and deployment remain separate.

## Operator workflow

The desktop correction form defaults to **Air only**. **Air + official result review** updates the local map graphic and queues a proposed official result. The proposal records the original show, match, room code, pairing, registered participants, series format and delivery key. A changed selection/pairing rejects a stale form before mutation. A queued proposal is not an official or Riot-verified result.

The web show workspace and assigned-crew workspace show the official and proposed map scores with the operator's reason. Review opens an explicit confirmation; approval/rejection requires an active crew row with `can_submit_result`, including organization owners. Node credentials never grant this permission. Conflicting official scores, changed teams/format, removed match slots and finalized/closed matches reject approval. Reload is required before reviewing changed values. Decisions are idempotent and audited. Approved proposals also create an immutable before/after map correction, and post-show reports attribute them as manual results, not GEP-verified results.

Map/series/review/audit writes are atomic. Series scores update after each map, and Bo3 ends at 2–0 instead of waiting for a nonexistent third map. Existing session result writes use a parent-match lock, retain the inactive-crew guard and require explicit show identity for matches in multiple shows. Web conflict resolution supplies that show identity. A completed selected match refreshes final series metadata in Air while staying absent from eligible choices; it does not switch OBS or replace the published rundown.

Local data fixes cover score, series wins, team names/tags, received-player display names, attacking sides, observed player and map results. They remain separate from raw GEP. Player names follow received identity even when slots move; multiple names coexist. Round/clear locks, persisted overrides and current-session Undo retain existing behavior. Map corrections now use the same override/Undo audit mechanism. Local Undo neither withdraws a delivered proposal nor reverses an approved official result; the interface explains this.

## Evidence

- Air: **132 tests** and renderer build passed; native fixture **43 checks / seven captures** passed, including actual proposal REST delivery, map Undo, series/player-name rendering and terminal-series synchronization.
- Backend: all **139 broadcast API tests** passed against owned loopback-only PostgreSQL with synthetic records. New proposal tests cover unauthorized owners, active result permission, original pairing/team/show/map binding, revoked/foreign nodes, retry identity, stale scores, finalized results and nonmutating rejection. Existing tests cover concurrent map writes and multi-show permission selection. Final tournament-scope three and result/report twelve targeted checks passed after that full run; affected formatting passed. Result migration is local only.
- Web: **85 tests in 16 scoped suites**, final result-review **3**, affected lint and production build/chunk/button/JSX checks passed. Broadcast TypeScript filter found no diagnostics; full TypeScript still fails outside this integration.
- Reference: **136 real-component captures / 26 A–Z groups**, no renderer errors or horizontal overflow; gallery filters/search/phone behavior passed. Original index hash and 19 linked images/34 references remain preserved. `design/implemented/index.html` is the sole active implemented UI reference.

All services, accounts, OBS responses and credentials in the new verification are isolated synthetic fixtures. No live game/OBS/LAN/account certification, independent acceptance, new commit, push or deployment occurred. The unsigned installer and prior staging releases predate this work.

## Sources and next action

Air: `src/correction-scope.js`, `src/fix-data.js`, `src/hub-client.js`, `src/tournament-sync.js`, `src/main.js`, `esportra-valorant-hud/server/display-fixes.js`, `esportra-valorant-hud/server/server.js`, `ScoreCorrection.jsx`, `DisplayFixScreen.jsx`, `ActiveDisplayFixes.jsx` and related tests/native fixture.

Backend: `BroadcastResultProposalEndpoints.cs`, `DesktopBroadcastEndpoints.cs`, `BroadcastAppearanceEndpoints.cs`, `BroadcastShowEndpoints.cs`, `BroadcastReportEndpoints.cs`, associated API tests and `20261015110000_broadcast_result_proposals.sql`. The new table has SELECT-only browser RLS for owners/active crew; API review writes use service access plus explicit active result permission. Web: `useBroadcastResultProposals.ts`, `BroadcastResultReview.tsx`, show/crew workspace integration and explicit-show conflict hook.

Continue E8.1 automatic GEP map-end result capture, verified-result/dispute handling and bracket advancement; extend E9.2 from manual durable proposals to captured game results. Other partials and their reserved-feature dependencies remain in `docs/coverage/INDEX-COVERAGE.md`. Never infer verification from a GEP/hand-entered proposal or fixture screenshot.
