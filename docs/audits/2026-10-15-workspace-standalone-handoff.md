# PROJ-061: production workspace and independent broadcasts

**Latest visual correction:** the user rejected the prior appearance. The real desktop shell, match list, compact guide and screen editor were reworked. [Visual changes and fresh checks](2026-10-15-workspace-polish.md). Visual acceptance remains open.


15 October 2026. Full plan authorized by the user. Implemented locally in Air, backend and web. No commit, push, deployment, independent acceptance or live hardware acceptance.

## Operator flow

Tournament: existing tournament dashboard **Broadcast → Prepare broadcast → Send match to Air**. Independent: sign in to an Esportra account through **Create independent broadcast**, create a project, add teams/players/logos and a match, then **Prepare match**. No organizer role or tournament is required for independent projects. Web `/air` can create workspaces/projects, teams and matches; desktop provides local production.

Desktop sidebar: **Matches → Teams & players → Live match → Broadcast screens → OBS controls**, with Connections and Settings & help. Soft slate/light appearances, selected match, connection/access notices, aligned controls, hover/focus and reduced-motion support. The walkthrough follows application state, can be skipped/resumed/restarted and offers isolated practice. Capture remains opt-in on a production or capture-only PC; the role can be changed later.

**Broadcast screens** means “Choose the screens viewers see and their order.” Rename/reorder/remove/restore screens, preview real match teams or explicitly marked sample data, choose an existing OBS video/camera behind the HUD, and save locally before **Send to OBS**. Sending creates browser sources/scenes automatically and retains Program. Real Cut/Fade/Stinger require actual OBS transitions; new independent and web-imported/template screens default to Fade/300 ms. Existing configured transitions are preserved. Fade/Stinger require Studio Mode; confirmations follow OBS responses/tally, not application animation.

## Identity and local diagnostics

Original, in-game and HUD names stay separate. Authorized linked rosters include stable player IDs and verified Riot identities where available. Verified game IDs take priority; otherwise only an exact full in-game identity auto-matches. Partial/duplicate names require confirmation. Preferences follow player IDs across roster order/side changes; a HUD alias is applied to the view without rewriting source packets or official profiles. Starters/substitutes remain visible before capture. Missing game values stay unknown; stale data is labeled last received.

Live match exposes scores/map/round/phase/observed player, player data and timestamped events. Raw packets are a bounded local memory buffer; search/pause/resume/clear affects the viewer only. Linking a suggested prepared match requires an explicit action and existing active-production guards. Observer configuration has separate address/port/masked key plus a private-network connection test. Credentials stay in the OS vault.

## Brackets

The live Bracket overlay uses `broadcastBracket` source data. Linked node API reads only authorized published/active stage versions, actual matches/teams/results and winner/loser connections. Elimination sections, lower bracket/finals and group/Swiss match boards are selectable; source standings are available where the active resolver supplies them. Round/section/group/page filters keep output readable. Standalone projects arrange/import matches and connections; no advancement engine. Missing bracket data yields an explicit empty presentation, never sample results. See [format and import example](../AIR-PROJECT-FORMAT.md).

## Account, storage and admin

Additive migrations: `20261015180000_air_workspaces_and_access.sql`, `20261015181000_air_production_events.sql`, `20261015182000_air_grant_device_limits.sql`. Air tables have RLS enabled and direct anon/authenticated access revoked. APIs enforce account/workspace ownership; independent IDs/events never enter official tournament result writes. Assets are decoded, bounded and re-encoded as private static PNGs.

One account-bound 14-day trial extends the existing broadcaster license foundation. Trial device allowances are unrestricted by default. Access checks online at launch; signed RS256 fallback lasts at most seven days and never beyond the license expiry. Signed access and refresh credentials stay in main-process keytar storage. Transient offline launch can retain verified access; an explicit online denial clears it. Clock rollback, account/device/signature mismatch and expiry are rejected. Warnings appear before cache expiry. Existing production can finish; another session requires access.

Snapshots/assets and event outboxes are atomic per API origin/account. Optimistic local versions and server revisions preserve concurrent/offline drafts. Conflicts retain both revisions and require an explicit choice, with a local backup. Asset retries preserve client UUIDs; events are idempotent, project/device scoped, metadata-only. There is no raw-packet admin upload.

Dedicated `/admin/air` uses existing super-admin route guards and authorization on every API. Customers/licenses, workspaces, plan/grant device allowances, device health/revocation, audit and release information are included. Manual grants/extensions only; no checkout. Announcements Broadcasts remains separate.

## Verification and release boundary

- Air: 148 tests and renderer build passed, including identity ambiguity/substitution, signed lease tampering/expiry/rollback, concurrent drafts/conflicts, origin/account isolation and source-safe screen removal.
- Backend: 149 Air/broadcast integration tests passed against fresh isolated PostgreSQL 16 databases, replay bootstrap plus additive migrations. Includes ownership, account-bound trial, revision conflict, quotas/override, device revocation, private/idempotent sanitized assets, all admin directories, audited grants, metadata filtering and published bracket/history. 42 scoped Core tests passed.
- Web: 56 scoped Air/broadcast tests, scoped lint and production build passed. Global TypeScript diagnostics still exist outside this integration; no Air diagnostics on the latest scoped inspection.
- Native Electron: full tournament and independent project-to-OBS fixture passed, including role changes, consent, revocation, shortcuts, roster alias preservation, real-vs-sample preview, automatic OBS composition and Program preservation. Fixtures are not a live OBS/GEP rehearsal. All 51 native checks passed with 11 screenshots, including online access denial: the active Program and active takes continue, but restarting production requires renewed access. Late tournament pause/replay timers are cleared when preparing a different idle match, preventing an unexpected old scene take.
- Bracket browser verification: six actual HUD presentations passed, including empty-source behavior, typography/output fit, large-page navigation and no overlapping match cards.
- Implemented reference: 172 real-component synthetic captures, A–Z; zero renderer errors/overflow in export, gallery/search/phone verification passed. Root index hash remains `c12b4442c8667aa7849833af6ef4b3d20f7e83af7be00f3ba3291132af05e0b3`; its 19 original images/34 references are preserved.

Before release: configure persistent server `AirAccess:SigningPrivateKey` through the deployment secret mechanism. Development/testing uses an ephemeral key; production without a configured key supports online access but issues no offline lease. Never commit a signing private key. Apply the additive migrations before the new frontend/desktop account APIs are used. Existing staging and the old installer predate these changes. Live OBS/Overwolf/game capture, physical observer LAN, real account/staging sync, seven-day elapsed offline usage, packaged build and user acceptance remain separate verification gates.

## Shared context

The Obsidian connector returned during this continuation. Startup and affected curated notes were read through MCP. Consolidation target: `08-Sessions/2026-10-15-PROJ-061-Workspace-Standalone-and-Air-Admin.md`, linked from Session-Index, Current-Work and affected Air/Backend/Frontend product notes. Saved through MCP and read back successfully: the dated session handoff, affected Air/Backend/Frontend notes, Current-Work checkpoint/row and Session-Index link. No protected vault sources are modified. Canonical owning project: `D:/frag-and-book-main/.claude/company/projects/PROJ-061/air-workspace-implementation.md`.
