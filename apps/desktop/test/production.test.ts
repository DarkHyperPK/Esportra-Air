// The production model against the real engine binary, a fake OBS and a fake capture bridge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import WebSocket from 'ws';
import { EngineSupervisor } from '../src/main/engine-supervisor.ts';
import { realProcess, engineEnv } from '../src/main/process.ts';
import { ObsLink } from '../src/main/obs.ts';
import { Production } from '../src/main/production.ts';
import { Store } from '../src/main/store.ts';
import { FakeObs } from './fake-obs.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');

const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });

class FakeCapture extends EventEmitter {
  state: 'off' | 'waiting' | 'live' | 'unavailable' = 'off';
  reason: string | null = null;
  start() { this.state = 'waiting'; this.reason = 'Waiting for Valorant.'; this.emit('change'); }
  stop() { this.state = 'off'; this.emit('change'); }
}

test('quick match to live: engine context, OBS install, checks and triggers', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-prod-'));
  const port = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'production-test-key-0123456789', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  await engine.start();
  assert.equal(engine.state, 'running', engine.error ?? '');
  const obsServer = new FakeObs();
  const obs = new ObsLink(() => obsServer);
  obsServer.scenes.set('Scene', []);
  const capture = new FakeCapture();
  const targets: Array<string | null> = [];
  const store = new Store(join(dir, 'air.json'));
  const production = new Production({ store, engine, obs, capture, ingest: { target: (url) => targets.push(url) }, version: 'test' });
  try {
    // No match yet: nothing on the Match step, capture refuses.
    assert.equal(production.snapshot().match, null);
    assert.throws(() => production.startCapture(), /Choose or create a match/);
    await assert.rejects(production.createQuickMatch({ teamA: 'Alpha', teamB: 'alpha', bestOf: 3 }), /different names/);
    await assert.rejects(production.createQuickMatch({ teamA: '<b>x</b>', teamB: 'Bravo', bestOf: 3 }), /plain text/);

    await production.createQuickMatch({ teamA: 'Team Alpha', teamB: 'Team Bravo', bestOf: 3 });
    const match = production.match!;
    assert.match(match.code, /^Q[0-9A-F]{7}$/);
    assert.match(targets.at(-1)!, new RegExp(`match=${match.code}&role=ingest`));
    const room = await engine.client.get<any>(`/api/${match.code}`);
    assert.equal(room.state.teams[0].name, 'Team Alpha');
    assert.deepEqual(room.state.teams.map((t: any) => t.tag), ['ALP', 'BRA']);
    assert.equal(room.state.event.bestOf, 3);
    assert.equal(room.state.airContext.matchId, match.id);

    // The output alias follows the match; the in-game page connects through it.
    const ingameOutput = production.setup.screens.find((x) => x.id === 'in-game')!.outputId;
    assert.match(ingameOutput, /^[0-9a-f-]{36}$/, 'the HUD only recognises UUID output aliases');
    const overlay = new WebSocket(`ws://127.0.0.1:${port}/ws?output=${ingameOutput}`);
    const first = await new Promise<any>((done) => overlay.once('message', (raw) => done(JSON.parse(String(raw)))));
    assert.equal(first.state.teams[1].name, 'Team Bravo');

    // Setup changes reach the HUD state.
    await production.updateSetup({ package: 'impact', hud: { ...production.setup.hud, minimap: true }, sponsors: ['Acme'] });
    const styled = await engine.client.get<any>(`/api/${match.code}`);
    assert.equal(styled.state.layout.bannerTheme, 'impact');
    assert.equal(styled.state.show.minimap, true);
    assert.deepEqual(styled.state.sponsors, ['Acme']);
    await assert.rejects(production.updateSetup({ package: 'neon' as never }), /available graphics styles/);

    // Check guides: connect OBS, then install, then loading.
    let checks = production.snapshot().checks;
    assert.equal(checks.find((c) => c.id === 'obs')!.action!.id, 'connect-obs');
    await obs.connect('127.0.0.1', 4455, 'secret');
    checks = production.snapshot().checks;
    assert.equal(checks.find((c) => c.id === 'scenes')!.action!.id, 'install-graphics');
    await production.installGraphics();
    const snap = production.snapshot();
    assert.equal(snap.obs.installed, true);
    assert.ok(obsServer.scenes.has('Esportra · Gameplay'));
    assert.equal(obsServer.inputs.get('Esportra · In-game HUD')!.settings.url, `http://127.0.0.1:${port}/o/${ingameOutput}`);
    assert.deepEqual(snap.obs.scenes.map((x) => [x.key, x.inObs]), [['holding', true], ['gameplay', true], ['fullscreen', true], ['replay', true], ['casters', true]]);
    assert.deepEqual(snap.obs.scenes.find((x) => x.key === 'casters')!.slots.map((x) => [x.id, x.source]), [['cam1', null], ['cam2', null]], 'slots wait for the crew’s sources');
    await production.useSlotSource('game', 'Game Capture');
    assert.equal(production.snapshot().obs.scenes.find((x) => x.key === 'gameplay')!.slots[0]!.source, 'Game Capture');

    // Switching: Studio Mode, preview a scene, take it; the tally follows OBS.
    await assert.rejects(production.take(), /Studio Mode/);
    await production.studioMode(true);
    await production.preview('Esportra · Holding');
    await production.take();
    assert.equal(production.snapshot().obs.programScene, 'Esportra · Holding');
    await assert.rejects(production.preview('Some other scene'), /Esportra scenes/);
    await production.preview('Esportra · Gameplay');
    await production.cut();
    assert.equal(production.snapshot().obs.programScene, 'Esportra · Gameplay');
    await production.stinger();

    // The monitors read OBS screenshots only while the console asks.
    const frames: Array<{ pvw: string | null; pgm: string | null }> = [];
    production.on('monitor', (f) => frames.push(f));
    production.setMonitoring(true);
    await new Promise((r) => setTimeout(r, 400));
    production.setMonitoring(false);
    const count = frames.length;
    assert.ok(count >= 1 && frames[0]!.pgm?.startsWith('data:image/'), 'program frame arrives');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(frames.length, count, 'no screenshots once the console stops asking');
    assert.equal(snap.checks.find((c) => c.id === 'scenes')!.health, 'ok');
    assert.equal(snap.checks.find((c) => c.id === 'feed')!.action!.id, 'start-capture');
    production.startCapture();
    assert.equal(production.snapshot().feed.state, 'waiting');

    // Triggers write the state the overlays already understand.
    await assert.rejects(production.casterStrap(true), /casters’ names/);
    await production.updateMatch(match.id, { casters: [{ name: 'Caster One', handle: '@one' }, { name: 'Caster Two', handle: '' }] });
    await production.casterStrap(true);
    let state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.show.lowerThird, true);
    assert.equal(state.lowerThird.kind, 'caster');
    assert.equal(state.casters[0].name, 'Caster One');
    await production.sponsorRead('Acme');
    state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.lowerThird.title, 'Acme');
    assert.equal(production.snapshot().triggers.strap, false, 'one lower third at a time');
    assert.equal(production.snapshot().triggers.sponsor, 'Acme', 'on-screen state is read back from the engine');
    await production.pause('technical');
    state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.airPause.kind, 'technical');
    await production.pause(null);
    state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.airPause, undefined);
    await production.lowerThird({ kind: 'person', name: 'Caster One', role: 'Caster · play-by-play' });
    assert.equal(production.snapshot().triggers.person, 'Caster One');
    await assert.rejects(production.lowerThird({ kind: 'player' }), /No player is being observed/);
    await production.lowerThird(null);
    assert.equal(production.snapshot().triggers.person, null);

    // Toast and poll go through the engine's validation.
    await assert.rejects(production.toast('<script>'), /plain text/);
    await production.toast('Map 2 starts soon');
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.toast.text, 'Map 2 starts soon');
    await assert.rejects(production.poll({ question: 'Q', options: ['Same', 'same'], firstPercent: 50 }), /must differ/);
    await production.poll({ question: 'Who wins?', options: ['Alpha', 'Bravo'], firstPercent: 55 });
    assert.equal(production.snapshot().triggers.poll, true);
    await production.poll(null);
    assert.equal(production.snapshot().triggers.poll, false);
    await production.stingerPlay();

    // Layers: Setup's switches set the start, then the console owns them.
    let rows = production.snapshot().layers;
    const row = (id: string) => production.snapshot().layers.find((x) => x.id === id)!;
    assert.deepEqual(['scorebug', 'economy', 'scoreboard', 'spikeTimer'].map((id) => row(id).mode), ['on', 'auto', 'off', 'auto']);
    assert.equal(rows.filter((x) => x.group === 'ingame').length, 8);
    assert.equal(rows.filter((x) => x.group === 'between').length, 8);
    assert.equal(rows.filter((x) => x.group === 'fullscreen').length, 7);
    await production.setLayer('economy', 'off');
    assert.equal(row('economy').manual, true);
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.show.economy, false);
    await production.setLayer('economy', 'auto');
    assert.equal(row('economy').manual, false);
    await assert.rejects(production.setLayer('scorebug', 'auto'), /no automatic mode/);
    await production.setLayer('scoreboard', 'on');
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.show.scoreboard, true);
    await production.updateSetup({ hud: { ...production.setup.hud, ticker: false } });
    assert.equal(row('ticker').mode, 'off', 'turning a layer off in Setup reaches the engine');

    // Full-screen rows pick the graphic in the Fullscreen scene, and line the scene up in Preview.
    assert.equal(row('fs:map-result').available, true);
    await production.setLayer('fs:map-result', 'on');
    assert.equal(row('fs:map-result').mode, 'on');
    assert.equal(row('fs:series').mode, 'off');
    assert.equal(production.snapshot().obs.previewScene, 'Esportra · Fullscreen');
    await production.setLayer('fs:series', 'on');
    assert.equal(row('fs:map-result').mode, 'off', 'one at a time');
    assert.equal(row('fs:series').mode, 'on');
    await production.setLayer('fs:series', 'off');
    assert.equal(row('fs:series').mode, 'off');

    // The event log follows the room and records what Air did.
    const players = Array.from({ length: 10 }, (_, i) => ({ feature: 'match_info', key: `scoreboard_${i}`, data: JSON.stringify({ player_id: `p${i}`, name: `P${i} #T`, character: 'Clay', team: i < 5 ? 0 : 1, alive: true, money: 3900, weapon: 'TX_Hud_Rifles_Volcano', shield: 2 }) }));
    await engine.client.post(`/api/${match.code}/ingest/valorant`, players);
    await engine.client.post(`/api/${match.code}/ingest/valorant`, [{ events: [{ name: 'kill_feed', data: JSON.stringify({ attacker: 'P0 #T', victim: 'P5 #T', weapon: 'TX_Hud_Rifles_Volcano', headshot: true }) }] }]);
    await new Promise((r) => setTimeout(r, 400));
    const log = production.snapshot().log.map((x) => x.text);
    assert.ok(log.some((t) => /^Kill · P0 ▸ P5 · Vandal · HS$/.test(t)), log.join(' | '));
    assert.ok(log.some((t) => t.startsWith('Take · Holding')) || log.some((t) => t.startsWith('Cut · ') || t.startsWith('Stinger · ')), 'takes are logged');
    const status = await engine.client.get<any>('/control/status');
    assert.ok(status.rooms.find((x: any) => x.match === match.code).clients <= 2, 'the log connection is not an on-air viewer');
    const readout = production.snapshot().readout!;
    assert.deepEqual(readout.alive, [5, 4]);
    assert.deepEqual(readout.bank, [19500, 19500], 'bank counts every player, alive or not');

    await production.correct({ field: 'scores', value: [5, 3], reason: 'Missed round' });
    state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.teams[0].score, 5);
    await production.correct({ clear: true });

    // Test round on the real outputs, then back.
    await production.testRound('start');
    await new Promise((r) => setTimeout(r, 500));
    await engine.poll();
    assert.equal(production.snapshot().testRound.running, true);
    await production.testRound('stop');
    await engine.poll();
    assert.equal(production.snapshot().testRound.running, false);
    overlay.close();
  } finally {
    await obs.disconnect();
    await engine.stop(true);
  }
});
