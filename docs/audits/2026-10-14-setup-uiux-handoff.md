# Esportra Air — setup and UI reference handoff

14 October 2026. Local implementation; not committed or deployed.

The canonical current change record is `D:/frag-and-book-main/.claude/company/projects/PROJ-061/setup-simplification.md`. It documents the eight-step tournament-web preparation flow, desktop production simplification, isolated actual-HUD previews, match-specific screen imports and editable shortcuts, with verification and remaining work.

The original `index.html` is unchanged: SHA-256 `c12b4442c8667aa7849833af6ef4b3d20f7e83af7be00f3ba3291132af05e0b3`. Its 19 unique linked screenshots remain. The full original E1–E11 audit covers 53 requirements: 2 implemented, 38 partial, 13 missing. This is not a product completion percentage. Original P0–P4 live acceptance remains pending.

The only active implemented screen reference is `design/implemented/index.html`, with literal A–Z screenshot folders and a manifest/register. It is generated from real web/Air components with synthetic data and desktop IPC. Three prior variants and three duplicate ZIPs were retired only after checking all 263 archived files. Their retained archive is `docs/archive/retired-uiux-2026-10-14.zip`, SHA-256 `dcfddcad8339d1a48470f4e777046b331e9446c24c230af6cc4eb8c23e7bc92d`. The implemented gallery before this simplification is preserved in `docs/archive/implemented-baseline-before-simplification-2026-10-14.zip`; the obsolete ninth-step image was verified against its archived bytes before removal.

The current implemented reference has 97 screenshots in 26 A–Z groups. Renderer errors and horizontal overflow are zero; gallery search/filter checks passed.

Verification: frontend full suite 621 tests before final targeted changes; final affected suite 38 tests, build/lint and scoped broadcast TypeScript checks passed. Air has 49 passing tests, renderer build and 13 native fixture checks. Backend/test assemblies compile and formatting passes. Database tests remain unexecuted because no local Docker/server runtime is available. Actual staging pairing, OBS, game capture, LAN and independent/operator acceptance remain open. The current installer belongs to the prior source version.

Obsidian MCP is unavailable. Pending curated Markdown update: Air/Frontend/Backend product notes, broadcast domain, dated session handoff, Current Work and Session Index. Read shared notes and reconcile them before writing. Do not refresh protected source snapshots through filesystem access. Do not treat prior release CI as verification or deployment of this redesign.

Next action: open the current implemented gallery and validate the new backend tests against an isolated replay database before a separately authorized named-branch staging push.
