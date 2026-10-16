# Pause graphics and production safety

Local functional coverage is 18 implemented / 23 partial / 12 missing after E3.4. Manual technical pauses and team timeouts display a delayed HUD panel. Advanced desktop settings choose the delay and optionally an existing OBS scene. OBS tally confirms an actual scene take; missing scenes keep Program and explain the issue. Resume removes the panel and leaves Program in place.

Pending actions are bound to the original pairing/show/match and cancelled on resume or scope change. The private HUD panel endpoint authenticates mutations and isolates clear requests by panel identity. Panels do not restore as active after restart. An OBS disconnect alone does not invent a game pause graphic. Manual pauses survive OBS reconnect. Replay returns and automatic takes are dropped during pauses, including cancellation while OBS Preview is awaiting confirmation.

Evidence: Air 119 tests and renderer build passed; native Electron fixture passed 35 checks and seven captures. The actual HUD fixture verifies panel visibility, removal and unchanged Program on Resume. The sole implemented UI reference has 126 captures across 26 A–Z groups; renderer, overflow, gallery filtering and phone gallery checks pass. Original index.html hash and image references are preserved. Backend 129 broadcast API and final targeted guards and web 81 broadcast tests were previously verified and are unaffected by this desktop-only change.

Source: src/pause-rules.js, src/show-runner.js, src/obs-controller.js, src/obs-replay.js, src/main.js, renderer PauseRulesSettings.jsx, HUD core/hud.js and server/server.js, tests/pause-rules.test.cjs and tools/product-desktop-smoke.cjs.

No new commits, deployment, independent acceptance or actual game/OBS hardware certification. E3.5 remote command lifecycle depends on reserved E6.2. Full rule editing remains reserved E3.7. Next: independent HUD branding and tournament data synchronization partial scopes.
