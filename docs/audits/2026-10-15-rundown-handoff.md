# PROJ-061 rundown publication and series flows

Verified local checkpoint: **17 implemented / 24 partial / 12 missing** across the original 53 requirements. Continue the existing user-authorized partial requirements; missing capabilities remain reserved for user selection. No new commits, pushes, deployment or independent acceptance.

## What changed

E3.6 is functionally implemented locally. Each send stores a versioned immutable rundown/configuration snapshot. Future items update at a confirmed Take or Skip boundary after OBS readiness, preserving current Program and completed history. Held items, transitions, pause, timeout and missing scenes defer activation. Non-rundown setup still waits until idle. Desktop reviews changes; owner web shows current, pending, older and stale reported node versions. Scoped node recovery retrieves missed publications after reconnect. Old/unversioned plans cannot replace a versioned plan.

E3.1 is functionally implemented locally. Best of 1 and Best of 3 templates use the selected existing match and its series format. They contain Opening, Match Introduction, map veto, agent selection/map/results for each map, breaks, Series Results, talent desk and Closing. Imports append safely and retry without duplicates; request identity is bound to the same flow/match. Templates start with manual Take.

Each item has validated cue, manual/automatic mode, screen, scene, transition, map scope and manual/countdown/immediate Hold settings. Local parsed round-live/end, spike planted/defused and map-end events and scoped observer flags drive supported automatic windows. Other cue names are operator reminders until delivery exists. Invalid stored settings remain manual with a warning. This is not the user-reserved full web rule editor, graphics-layer controls or remote commands.

Operator Hold now cancels automatic countdowns and waits for Take or Skip. Repeated cues cannot restart held items, paused cues are discarded, and recovered packets never replay automatic takes. Holds identify the local operation/source, not a certified named employee.

The existing one-hour production timeline records both manual and automatic takes only after OBS confirms Program. Recent history restores without re-enqueuing old entries. Strict cloud metadata excludes raw game data and correction reasons.

## Verification

- Air: 108 tests and renderer build passed. Native Electron fixture: 31 checks, including actual parsed game event → configured hold → OBS-confirmed automatic take, plus manual/automatic timeline records. Six native captures; synthetic credentials and services only.
- Backend: all 129 broadcast PostgreSQL tests passed; final two template/plan guards passed again after binding import identity to its flow/match. Three Core template tests and seven runtime tests passed. Owned loopback fixture stops after each run. Targeted formatting verification is part of final consolidation.
- Web: 81 broadcast tests, scoped ESLint and production/chunk/button/JSX checks passed. Full TypeScript remains failing outside broadcast; the scoped check reports no broadcast errors after correcting ES2020 compatibility in the new flow/timeline/invitation labels.
- Sole implemented screen reference is being regenerated to include typed flow settings. Prior successful export: 121 captures / 26 A–Z groups, no renderer/overflow/gallery errors. The expanded-rundown capture selector now uses its actual Edit button and waits for the field.

## Remaining

Continue E4.7 data fixes/Undo/next-round locks, then independent tournament synchronization, branding, result/report and reliability scope. E3.2 still lacks full tournament/agent/kill/clock/delay/hotkey segment delivery and isolated web/simulator test-fire; remote commands depend on reserved E6.2. E3.3 remote actions depend on reserved E6.2/E10.1. Live SDK/OBS/LAN timing, staging account/email delivery, independent review and acceptance remain pending. Existing staging and installer predate this code.

Source: `src/rundown-publication.js`, `src/segment-plan.js`, `src/show-runner.js`, backend `BroadcastRundown{Publication,TemplateEndpoints,PlanProjection}.cs`, frontend `Rundown{Templates,PlanEditor,Publication}.tsx`, and their tests. Obsidian continuation: `08-Sessions/2026-10-15-PROJ-061-Rundown-Publishing-Continuation.md`.
