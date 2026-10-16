# PROJ-061 on-air overrides checkpoint

E4.7 remains partial; current functional coverage is **17 implemented / 24 partial / 12 missing**. This continuation completes independent local data fixes while preserving official result authority.

Production can correct displayed scores, team names/tags, attacking/defending sides and observed-player focus from the received roster. These changes mask local HTTP/WebSocket outputs without changing the underlying GEP state or tournament records. Clear uses the latest source; Undo restores the previous override in this session/round. Observed focus follows a received player identity, with a team-scoped name fallback when an ID is absent.

Overrides expire next round or stay until explicitly cleared. Older recovered packets cannot expire a newly applied lock. Saved active values restore after restart only for the same show/match context and after validation; Undo history is session-only. A changed match context clears them. Failed manual persistence rolls back the change; failed automatic expiry persistence leaves a visible warning and does not block incoming game data.

The private control endpoint requires the local write credential, which stays in main. Trusted production IPC binds a mutation to the same show, match, match code and paired node; stale requests and capture mode cannot mutate another match. Detailed before/after and reasons remain in local audit files. The existing signed one-hour cloud timeline receives only action/time/source metadata. No named employee identity or official bracket update is implied.

Controls are available from Live production, including the configurable `Ctrl+Shift+D` shortcut during a technical pause. Missing roster, missing match, unavailable local HUD, storage failure and cleared/expired override states are explicit.

Verification: Air **113 tests**, renderer build, **33 native Electron checks** and seven native captures passed. Native checks exercised score override, Undo, stale binding rejection and the shortcut during technical pause. Sole implemented reference regenerated: **125 captures / 26 A–Z groups**, no renderer/overflow errors. Original index and its 19 images/34 references remain unchanged. Existing backend 129 broadcast tests and web 81 broadcast tests are unchanged from the prior checkpoint. No new commit, deploy, independent review or live hardware acceptance.

Remaining E4.7: Air-and-bracket scope prompt plus an authorized official-result review/update flow. Existing bracket writes require authenticated organizer/eligible crew authority; a paired node is not silently granted that authority. Continue other independent partials, next technical pause/timeout graphics and the explicitly configured pause scene exception.

Source: HUD server `display-fixes.js` and `server.js`; main/preload trusted IPC; `DisplayFixScreen.jsx` and `ActiveDisplayFixes.jsx`; `tests/display-fixes.test.cjs`, HTTP product integration and native desktop fixture.
