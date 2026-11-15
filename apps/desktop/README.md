# Esportra Air desktop

The ow-electron app producers use: **Match → Check → Live**, with production setup (graphics, brand,
layout, OBS) done once. The graphics themselves are served by the separate Rust engine in
`../../engine`, so they stay on air if this app closes or restarts.

```
src/main/       main process (ow-electron): engine supervisor, GEP capture, OBS, production model
src/preload/    exposes window.air to the interface
src/renderer/   React interface
src/shared/     the main ↔ interface contract (api.ts)
dev/            dev host + automated walkthrough (any OS, no Overwolf/OBS/Valorant needed)
test/           node --test suites (some run the real engine binary)
```

## Commands

Build the engine first: `cd ../../engine && cargo build --release`.

```bash
npm install
npm test               # unit + integration tests
npm run typecheck
npm run build          # main/preload bundle + interface
```

Try the whole journey in a browser with a simulated game and an in-memory OBS:

```bash
npm run build:renderer && node dev/host.ts      # then open the printed URL
node dev/walkthrough.cjs ./walkthrough           # automated run with screenshots
```

On Windows with Overwolf: `npm start` runs the app in ow-electron with the GEP package.
`npm run dist:win` packages it with ow-electron-builder (the engine is built for Windows separately:
`cargo build --release --target x86_64-pc-windows-msvc`).

## Not verifiable off Windows

ow-electron launch, GEP against a real Valorant game, a real OBS install, and the packaged
installer must be checked on a Windows machine with Overwolf, Valorant and OBS.
