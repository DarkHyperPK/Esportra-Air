# PROJ-061 — charcoal UI and guided broadcast workflow

16 October 2026. User rejected the flat soft-slate appearance and reported unclear operating order, sample-off ambiguity and HUD preview reloads. This checkpoint supersedes the appearance and preview-mode descriptions in the 15 October handoff. Implemented locally; user acceptance, live hardware rehearsal and deployment remain separate.

## Operator path

1. **Broadcast setup** is the default after opening or pairing a production PC. A selected-match summary, four ordered stages and one prominent next action show where to begin. Returning to Setup overview never starts a production command.
2. **Prepare:** choose an eligible match in Matches. Check both lineups and HUD names in Teams & players. **Confirm lineup & continue** records a local review for this source/show/match and roster, then opens Connections. Roster/identity changes invalidate that review; scores and team-side changes do not. Missing players prevent confirmation. Sidebar sections and contextual next actions keep preparation visible.
3. **Connect:** connect OBS and opt in to local capture or connect another observer. A waiting feed is shown explicitly; receiving live game packets is not required to design screens before the game begins.
4. **Design:** Broadcast screens / **Add screen** offers separate template and individual previews. Customize/order/save locally; HUD controls edits layers and content. **Send to OBS** creates browser sources/scenes and applies saved HUD settings while retaining the current Program. **Open OBS controls** continues to production. Keyboard shortcuts is now a direct sidebar destination.
5. **Operate:** **Start broadcast** arms the first prepared screen; **Show screen on air** takes the armed screen live. **Skip this screen** advances. The separate OBS Preview/Program controls retain their existing behavior. Start streaming or recording in OBS Studio. The setup page describes an active Air session without claiming streaming has started.

The sidebar groups tools as START HERE, 01 / PREPARE, 02 / DESIGN, 03 / OPERATE and WORKSPACE. Essential navigation stays available; this is guided navigation rather than a wizard that locks experienced operators out. The existing walkthrough remains skippable/resumable and uses explicit lineup review.

## Preview modes and root-cause fixes

- **No game data:** clear preview canvas with an explicit explanation. It does not display synthetic statistics or open a match-room socket. This intentionally hides the populated HUD; choose Sample data to inspect its filled layout.
- **Sample data:** moving local simulation with the selected teams. Its local clock, players and scores are visibly labeled synthetic. No live room receives sample writes.
- **Received match data:** read-only selected-room feed. The label explains that last received values can remain after capture stops. Selecting this mode is deliberate rather than an ambiguous unchecked sample box.

Previously, each settings change entered the iframe URL and remounted its document. Settings now travel as validated, origin/source-checked read-only messages to the existing preview. The underlying received/simulated state is retained separately from the view patch, so live updates preserve the draft and clearing it restores received values. Settings messages cannot modify a registered OBS /o output. Changing screen/data source/match and explicit retry can navigate; layer switches do not reload. Drafts never write game identities or official results.

Native visual inspection also found the HUD panel was looking for teams in the lightweight status payload, which does not contain teams. The scoped HUD response now includes the current authorized teams; the panel uses that response, matching the screen editor. Roster review uses the existing registeredRoster status field rather than assuming a teams field.

## Visual direction

Neutral charcoal replaces blue slate: #222225 workspace, #1a1a1d navigation, layered gray surfaces, off-white controls and restrained Esportra rose identity. Subtle gradients, inset edges and shadows provide depth without animated telemetry. System typography, aligned controls, visible hover/focus and the light option remain. Production guidance uses the actual Start/Take/Skip labels. Duplicate top-bar shortcut navigation and malformed current-screen copy were removed.

## Verification

- Air: 154 tests and renderer build passed.
- Native Electron regression: **56 checks / 15 captures passed**, including selected-team sample rendering, same-document layer toggles, draft/live isolation, pairing/roles/capture consent, account revocation, automatic OBS composition and Program retention. Synthetic OBS protocol/account/capture fixtures; no actual game or OBS instance.
- tools/preview-controls-smoke.cjs: three explicit modes, no iframe navigation for layer changes, preserved sample timer, received updates retaining draft, restored source settings, rejected untrusted origins and no preview writes to the room. Three screenshots in docs/audits/preview-workflow.
- tools/hud-sample-smoke.cjs: existing running sample clocks, dedicated output visibility and unchanged live room passed.
- tools/workspace-polish-smoke.cjs: default entry, explicit lineup confirmation, next action, direct shortcuts, themes, match history/recovery/focus and horizontal fit at 960/1024/1280/1440/1920 passed. Fourteen captures in docs/audits/workspace-polish. Screenshot review is implementation evidence, not user approval.
- Sole A–Z reference: **173 app/web screens plus six real HUD bracket presentations, 179 captures across 26 groups**; renderer/export checks passed, with no horizontal overflow. Original root index.html and linked product-brief images remain preserved. Frontend browser-only HUD assets synchronized; no backend endpoint/migration changes in this batch.

Earlier backend/Core/web counts and the original 53-requirement audit are historical and were not reassessed here. No claim of overall product completion, actual OBS/GEP/LAN/staging correctness, packaged installer readiness or independent acceptance. Existing installer/staging predate this uncommitted work. No commit, push or deployment performed.

## Review locally

Fully quit the previous Air process. Run npm start from D:/Esportra-Air and begin at Broadcast setup. The old installer and already-open windows do not load these main-process changes. Next external acceptance: review the new hierarchy/theme, then rehearse a real selected match with OBS and the GEP feed.

Canonical project records: D:/frag-and-book-main/.claude/company/projects/PROJ-061/context.md and air-workspace-implementation.md. Obsidian handoff 08-Sessions/2026-10-16-PROJ-061-Charcoal-and-Guided-Workflow.md and the Air/Frontend notes, Current-Work checkpoint/row and Session-Index were saved through MCP and read back successfully.
