# CLAUDE.md — Esportra-Air

## What This Project Is

Esportra-Air is Esportra's broadcast production system for Valorant tournaments. It has two layers:

1. **Working HUD** (`esportra-valorant-hud/`) — 45 web overlays, a Node.js server, a Valorant GEP data adapter, and a full operator control panel. Production-ready. No build step, no framework.
2. **Design Spec** (`index.html` + `screens/`) — 19 annotated mockups for the next phase: a web dashboard, a desktop Electron node app with autopilot, and a phone remote. Not yet coded.

## Read All Memory First

Before doing any work on this project, read every file in `.claude/memory/`:

| File | Contents |
|---|---|
| `.claude/memory/architecture.md` | Core architecture, data flow, WebSocket protocol, HTTP API, tech stack, design tokens |
| `.claude/memory/inventory.md` | Complete file inventory — all 45 overlays, server, adapter, control panel, design spec |
| `.claude/memory/gaps-and-fixes.md` | Known HUD gaps, Spectra reference solutions (spike $300 inference, timer drift), unresolved items |
| `.claude/memory/design-spec.md` | Product vision not yet coded, feature build order, prerequisites |

## Project Layout

```
Esportra-Air/
├── CLAUDE.md                        ← you are here
├── .gitignore
├── index.html                       ← standalone design-pack PRD viewer
├── screens/                         ← 19 annotated mockup PNGs
├── esportra-valorant-hud/           ← the working HUD system
│   ├── control.html                 ← operator control panel
│   ├── package.json                 ← only dep: ws v8.18
│   ├── server/server.js             ← HTTP + WebSocket server (117 lines)
│   ├── core/                        ← hud.js, hud.css, state.default.js, catalog.js, fonts, brand
│   ├── overlays/                    ← 45 HTML overlay files
│   ├── adapters/valorant-gep.js     ← Valorant GEP event adapter
│   ├── tools/simulate-valorant.js   ← round simulator
│   ├── capture/overwolf-valorant/   ← Overwolf capture stub
│   ├── stingers/                    ← .webm (OBS) + .mov (vMix)
│   └── previews/                    ← 52 JPEG overlay previews
└── Reference data/                  ← Spectra reference (gitignored)
    ├── Spectra-Server-main/
    ├── Spectra-Client-main/
    └── Spectra-Frontend-main/
```

## Running the HUD

```bash
cd esportra-valorant-hud
npm install          # installs ws
node server/server.js
# Open control.html at http://localhost:5300/control.html?match=CODE
# Add overlays in OBS as browser sources: http://localhost:5300/overlays/scorebug.html?match=CODE
```

Optional auth: set `ESPORTRA_KEY` env var. Roles: `overlay` (read-only), `control`/`ingest`/`player` (write).

## Key Conventions

- **One shared state object** — everything reads from and writes to the same JSON state. Never bypass this.
- **No build step** — plain HTML/JS/CSS. Edit and refresh.
- **State transitions drive animations** — `update(state)` redraws, `tick(state)` runs 10×/sec. Animations fire on delta, not replay.
- **Match rooms** identified by `?match=CODE` query param — one room per match.
- **Art assets are runtime CDN** — agent/weapon/map images from `media.valorant-api.com`. Requires internet.

## Known Gaps (read gaps-and-fixes.md for full detail)

| Gap | Status |
|---|---|
| Spike planted event unreliable | Fix known ($300 money delta) — not yet applied to adapter |
| Round timer drift | Decision pending — depends on whether numeric timer shown |
| Per-player live HP | Architecture limitation — accepted |
| Capture agent is a stub | Blocked on Overwolf developer account |

## Locked Decisions (read decisions.md for full detail)

| Decision | Answer |
|---|---|
| Web app lives where? | Inside the main Esportra platform — new routes in the frontend |
| Broadcast software | OBS WebSocket first (v5 protocol). vMix deferred. |
| Autopilot | v2. V1 = manual OBS scene switching only. |
| V1 topology | Two apps: ow-electron (observer) + Electron+React (broadcaster). HUD server = local (LAN) OR cloud (Esportra-hosted). Both modes supported. |
| Auxiliary mode | From v1 — same ow-electron binary, observer + auxiliary modes |
| Desktop app framework | Electron + React + TypeScript |

## V1 Build Scope

| What | Status |
|---|---|
| Spike detection fix ($300 inference in valorant-gep.js) | To build |
| HUD server — local mode + cloud deployment (both) | To build |
| ow-electron capture app — observer + auxiliary modes | To build (stub exists) |
| Electron + React desktop app (broadcaster) — connects to HUD server (local or cloud) + OBS WebSocket | To build |
| Web dashboard — show setup + live monitor (inside Esportra platform) | To build |
| Autopilot rules engine | V2 |
| Cloud HUD server | V2 |
| Phone remote | V2 |

## Reference Material

`Reference data/` (gitignored) contains the Spectra broadcast system (Node.js + Angular + Overwolf). It was used to derive the spike detection solution and understand timer drift. Do not modify it.
