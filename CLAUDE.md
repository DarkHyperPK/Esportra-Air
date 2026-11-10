# CLAUDE.md — Esportra-Air

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

## Read first

`docs/PRODUCT.md` is the agreed product direction (10 November 2026): purpose, decisions, experience, architecture and build stages. Follow it. If a request conflicts with it, raise the conflict instead of quietly drifting back to the retired direction.

Esportra Air connects Esportra tournament data and live game data to broadcast graphics. It is **not** a switcher: it never composites, encodes, streams, records or switches scenes. It installs its own scenes/sources in OBS and reads on-air status only.

## Repository today

```
Esportra-Air/
├── docs/PRODUCT.md              ← agreed direction and stages
├── esportra-valorant-hud/       ← HUD: overlays, core, server, Valorant GEP adapter (kept)
│   ├── overlays/                ← 46 HTML overlays (must keep working unchanged)
│   ├── core/                    ← hud.js client, state defaults, catalog, brand, assets
│   ├── server/server.js         ← current HUD server (protocol the Rust engine must keep)
│   ├── adapters/valorant-gep.js ← GEP → state parser (pure; parity reference for Rust)
│   └── capture/overwolf-valorant/ ← legacy ow-electron capture child (retired in Stage 4)
├── src/                         ← legacy Electron + React app (retired in Stage 4)
├── tests/                       ← legacy Node tests (`npm test`)
└── tools/                       ← legacy smoke/verification scripts
```

Planned (Stage 1): `apps/desktop/` (ow-electron shell, React + TypeScript renderer) and `engine/` (Rust workspace: `air-engine`, `air-state`, `air-valorant`).

## Running the current HUD

```bash
cd esportra-valorant-hud
npm install
node server/server.js
```

Overlays: `http://localhost:5300/overlays/<name>.html?match=CODE`. WebSocket `ws://host:5300/ws?match=CODE&role=overlay|control|ingest&key=…`. Writes require the key passed at startup.

## Key conventions

- **One shared state object per match room.** Clients receive `snapshot`, then RFC 7386 merge `patch` messages with an incrementing `v`; a gap triggers `resync`. Overlays acknowledge with `rendered`.
- **Overlays are plain HTML/JS/CSS**, no build step. `update(state)` redraws, `tick(state)` runs 10×/s, animations fire on state deltas.
- **Art assets** (agents, weapons, maps) load from `media.valorant-api.com` at runtime.
- **Game capture starts only after explicit user consent.** Never auto-start it.
- **Local mode never sends game data off the local network.** Remote mode is opt-in with its own consent.

## Known facts

| Topic | Status |
|---|---|
| Spike planted | Inferred from the +300 credit change in `valorant-gep.js` (applied), plus `planted_location` at round end |
| Per-player health/abilities | Only from player-PC capture (GEP `me` is local-player only) |
| `observing` | Custom games only |
| Overwolf | Developer account exists; app not yet approved. GEP in production depends on approval |
| Legacy renderer | Does not build at `49a0f7d` (imports three deleted components); not being repaired |

## Locked decisions

See the decision table in `docs/PRODUCT.md`. In short: one ow-electron app plus a separate Rust graphics engine; Valorant only behind a game-module seam; Esportra tournaments plus quick match; no Air pages on the Esportra website; local and remote transport; stage rail Match → Check → Live.

## Verification

- Legacy: `npm test` and `npm run build:renderer` (the latter currently fails, see above).
- Local tests do not certify OBS, GEP, live game or deployment behaviour. Say which checks ran and which need the user's Windows machine.

## Reference material

`Reference data/` (gitignored) contains the Spectra broadcast system. Do not modify it.
