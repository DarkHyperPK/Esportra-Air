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
    await production.updateSetup({ package: 'impact', hud: { ...production.setup.hud, minimap: true } });
    await production.updateMatch(match.id, { sponsors: ['Acme'], event: { name: 'Community Cup', stage: 'Playoffs' }, theme: 'impact' });
    await assert.rejects(production.updateMatch(match.id, { theme: 'neon' as never }), /banner styles/);
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.event.name, 'Community Cup', 'the event comes from the match');
    await assert.rejects(production.updateMatch(match.id, { players: [[{ name: 'Juno', gameId: 'no-tag' } as never], []] }), /Name#TAG/);
    await production.updateMatch(match.id, { players: [[{ name: 'Juno', realName: 'June Park', gameId: 'Juno#EU1', photo: '' } as never], []] });
    assert.equal(production.match!.players[0]![0]!.gameId, 'Juno#EU1');
    assert.match(production.match!.players[0]![0]!.id, /^[0-9a-f-]{36}$/);
    const styled = await engine.client.get<any>(`/api/${match.code}`);
    assert.equal(styled.state.layout.bannerTheme, 'impact');
    assert.equal(styled.state.show.minimap, false, 'the game draws its own minimap; Air keeps it off');
    assert.equal(styled.state.show.killfeed, false);
    assert.equal(styled.state.show.observed, false);
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

    // Graphics only: changes are cued, the cue room shows them, Take puts them on air. OBS is never switched.
    const live = async () => (await engine.client.get<any>(`/api/${match.code}`)).state;
    const cueRoom = async () => (await engine.client.get<any>(`/api/__ESA_SIM_CUE_${match.code}`)).state;
    const programBefore = obsServer.program;
    assert.equal(production.snapshot().cue.mode, true, 'cueing is on by default');
    await assert.rejects(production.takeCue('take'), /Nothing is cued/);
    await production.toast('Cued first');
    assert.deepEqual(production.snapshot().cue.pending, ['Toast · Cued first']);
    assert.notEqual((await live()).toast.text, 'Cued first', 'not on air yet');
    assert.equal((await cueRoom()).toast.text, 'Cued first', 'the Cued monitor shows it');
    await production.takeCue('cut');
    assert.equal((await live()).toast.text, 'Cued first');
    assert.deepEqual(production.snapshot().cue.pending, []);
    await production.setLayer('fs:map-result', 'on');
    assert.equal((await live()).airFullscreen ?? null, null);
    assert.equal((await cueRoom()).airFullscreen, 'map-result');
    await production.takeCue('stinger');
    assert.equal((await live()).airFullscreen, 'map-result', 'lands behind the stinger');
    await production.setLayer('fs:map-result', 'off');
    production.clearCue();
    assert.deepEqual(production.snapshot().cue.pending, []);
    // One change per slot: a later cue replaces an earlier one, and going back to what is on air uncues it.
    const layer = (id: string) => production.snapshot().layers.find((x) => x.id === id)!;
    await production.setLayer('economy', 'off');
    assert.deepEqual([layer('economy').mode, layer('economy').cued], ['auto', 'off']);
    await production.setLayer('economy', 'on');
    assert.deepEqual(production.snapshot().cue.pending, ['Economy board · on']);
    await production.setLayer('economy', 'auto');
    assert.deepEqual(production.snapshot().cue.pending, [], 'back to the on-air mode: nothing cued');
    assert.equal(layer('economy').cued, undefined);
    await production.setLayer('fs:series', 'on');
    await production.setLayer('fs:champion', 'on');
    assert.deepEqual(production.snapshot().cue.pending, ['Full screen · Champion'], 'one full-screen graphic at a time');
    assert.deepEqual([layer('fs:champion').cued, layer('fs:map-result').cued], ['on', 'off']);
    production.clearCue();
    assert.equal((await live()).airFullscreen, 'map-result', 'clearing the cue changes nothing on air');
    await production.saveReplay();
    assert.ok(obsServer.requests.includes('SaveReplayBuffer'), 'F3 saves the replay buffer');
    assert.equal(obsServer.program, programBefore, 'no OBS scene change');
    assert.deepEqual(obsServer.requests.filter((r) => /^(SetCurrentProgramScene|SetCurrentPreviewScene|TriggerStudioModeTransition|SetStudioModeEnabled|SetCurrentSceneTransition)$/.test(r)), [], 'Air never switches');
    // The rest of this test checks each change on air directly.
    production.setCueMode(false);
    assert.equal(production.snapshot().cue.mode, false);
    await production.setLayer('fs:map-result', 'off');
    assert.equal((await live()).airFullscreen ?? null, null);

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
    assert.equal(rows.filter((x) => x.group === 'ingame').length, 5);
    assert.equal(rows.filter((x) => x.group === 'between').length, 8);
    assert.equal(rows.filter((x) => x.group === 'fullscreen').length, 8);
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

    // Full-screen rows pick the graphic the full-screen host shows; OBS is not touched.
    assert.equal(row('fs:map-result').available, true);
    const previewBefore = production.snapshot().obs.previewScene;
    await production.setLayer('fs:map-result', 'on');
    assert.equal(row('fs:map-result').mode, 'on');
    assert.equal(row('fs:series').mode, 'off');
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.airFullscreen, 'map-result');
    assert.equal(production.snapshot().obs.previewScene, previewBefore, 'no OBS scene change');
    assert.deepEqual(obsServer.scenes.get('Esportra · Fullscreen')!.map((i) => i.sourceName), ['Esportra · Full screen'], 'one host source in the Fullscreen scene');
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
    for (const line of ['Cued · Toast · Cued first', 'Cut · Toast · Cued first', 'Stinger · Full screen · Map result', 'Cue cleared']) assert.ok(log.includes(line), `${line} in ${log.join(' | ')}`);
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
    // Editing the match while the test round is on air is fine: it reaches the engine when the round ends.
    await production.updateMatch(match.id, { event: { name: 'Edited During Test', stage: '' } });
    await production.testRound('stop');
    await engine.poll();
    assert.equal(production.snapshot().testRound.running, false);
    const end = Date.now() + 4000;
    while ((await engine.client.get<any>(`/api/${match.code}`)).state.event.name !== 'Edited During Test') {
      assert.ok(Date.now() < end, 'the edit is sent once the test round ends');
      await engine.poll();
      await new Promise((r) => setTimeout(r, 100));
    }
    overlay.close();
  } finally {
    await obs.disconnect();
    await engine.stop(true);
  }
});

test('autopilot puts graphics up through the real engine, with hold, skip, presets and safety pauses; OBS is never switched', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-auto-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'autopilot-test-key-0123456789', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const obsServer = new FakeObs();
  const obs = new ObsLink(() => obsServer, { backoffMs: [50] });
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs, capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test' });
  const wait = async (check: () => boolean | Promise<boolean>, label: string, ms = 4000) => {
    const end = Date.now() + ms;
    while (!(await check())) {
      if (Date.now() > end) assert.fail(`timed out: ${label}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const view = () => production.snapshot().autopilot;
  try {
    await production.createQuickMatch({ teamA: 'Team Alpha', teamB: 'Team Bravo', bestOf: 1 });
    const code = production.match!.code;
    const showing = async () => (await engine.client.get<any>(`/api/${code}`)).state.airFullscreen ?? null;
    assert.equal(view().enabled, false, 'off by default');
    assert.equal(production.snapshot().autopilotBlock, null, 'autopilot needs a match, not OBS');
    await obs.connect('127.0.0.1', 4455, 'secret');
    await production.installGraphics();
    const program = obsServer.program;
    assert.equal(view().preset, 'standard');
    assert.deepEqual(view().segments.map((x) => x.id), ['intro', 'map1-live', 'map1-half', 'map1-result', 'champion']);

    // Off means off: a round going live changes nothing.
    await engine.client.post(`/api/${code}/ingest/valorant`, [{ feature: 'match_info', key: 'round_phase', data: 'combat' }]);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await showing(), null);

    // A timed result: back to the game by itself after one second.
    production.segmentUpdate('map1-result', { forSeconds: 1 });
    production.autopilotStart();
    assert.equal(view().next!.id, 'intro');
    await production.autopilotTake();
    await wait(() => view().now?.id === 'intro', 'intro on air');
    assert.equal(await showing(), 'match-intro', 'the full-screen host shows the intro');
    assert.equal(view().next!.id, 'map1-live');

    // The round going live opens a hold window the producer stops with Hold.
    await engine.client.post(`/api/${code}/ingest/valorant`, [{ feature: 'match_info', key: 'round_phase', data: 'shopping' }]);
    await engine.client.post(`/api/${code}/ingest/valorant`, [{ feature: 'match_info', key: 'round_phase', data: 'combat' }]);
    await wait(() => view().next?.state === 'holding', 'hold window opens');
    assert.ok(view().holdEndsAt! > Date.now() && view().holdTotalMs === 3000);
    production.autopilotHold();
    assert.equal(view().next!.heldBy, 'operator');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await showing(), 'match-intro', 'held: nothing changed');

    // A technical pause blocks Take; resuming clears the panel too. Presets cannot change while running.
    await production.pause('technical');
    await wait(() => view().paused === 'tech', 'pause reaches autopilot');
    await assert.rejects(production.autopilotTake(), /Technical pause/);
    await production.autopilotResume();
    assert.equal(view().paused, null);
    assert.equal((await engine.client.get<any>(`/api/${code}`)).state.airPause, undefined);
    assert.throws(() => production.autopilotPreset('minimal'), /Run manually first/);

    await production.autopilotTake();
    await wait(() => view().now?.id === 'map1-live', 'back to the game');
    assert.equal(await showing(), null);

    // Skip halftime; the map ending arms the result, which clears itself after its time.
    production.autopilotSkip();
    assert.equal(view().next!.id, 'map1-result');
    await engine.client.post(`/api/${code}/ingest/valorant`, [{ events: [{ name: 'match_end', data: '' }] }]);
    await wait(() => view().next?.id === 'map1-result' && view().next?.state === 'holding', 'result hold opens');
    await production.autopilotTake();
    await wait(async () => (await showing()) === 'map-result', 'map result on air');
    await wait(async () => (await showing()) === null, 'timed graphic clears', 3000);
    assert.equal(view().next!.id, 'champion');
    assert.equal(view().next!.state, 'armed', 'manual steps arm but never take themselves');
    assert.equal(obsServer.program, program, 'autopilot never switched an OBS scene');
    const log = production.snapshot().log.map((x) => x.text);
    for (const line of ['Autopilot started', 'Held by operator · Map 1 · back to the game', 'Skipped · Map 1 · halftime', 'Full screen · Map result']) assert.ok(log.includes(line), `${line} in ${log.join(' | ')}`);
    assert.ok(log.some((l) => l.startsWith('Autopilot paused')), 'pause logged');

    // Run manually clears everything; autopilot is never on after a restart.
    production.autopilotStop();
    assert.equal(view().enabled, false);
    assert.equal(view().next, null);
    production.autopilot.loadForMatch();
    assert.equal(view().enabled, false);
    // ...but it remembers where the show is: after a restart it offers to resume, and says so.
    assert.equal(view().resumeAt, 'Winner');
    production.noteRecovery();
    assert.match(production.snapshot().recovery ?? '', /Recovered after a restart\. Graphics kept the last data; autopilot is ready to resume at Winner\./);
    production.dismissRecovery();
    assert.equal(production.snapshot().recovery, null);
    production.autopilotRestart();
    assert.equal(view().resumeAt, null, 'starting the rundown again forgets the progress');

    // Presets: Minimal keeps the result and the return to the game; Manual leaves nothing automatic.
    production.autopilotPreset('minimal');
    assert.equal(view().preset, 'minimal');
    assert.deepEqual(view().segments.filter((x) => x.mode === 'automatic').map((x) => x.id), ['map1-live', 'map1-result']);
    production.autopilotPreset('manual');
    assert.deepEqual(view().segments.filter((x) => x.mode === 'automatic').map((x) => x.id), []);
    assert.throws(() => production.autopilotPreset('wild' as never), /Standard, Minimal or Manual/);
    production.autopilotPreset('standard');

    // Player cameras: links are made per player, pushed to the engine, and replace-able.
    const cams0 = production.snapshot().cams;
    assert.equal(cams0.slots.length, 10);
    assert.equal(cams0.slots.every((x) => !x.id && !x.connected), true);
    await production.camCreate(0, 2);
    const made = production.snapshot().cams.slots[2]!;
    assert.match(made.id!, /^[A-Za-z0-9_-]{12}$/);
    assert.match(made.pushUrl!, new RegExp(`^https://vdo.ninja/\\?push=${made.id}&`));
    let room = (await engine.client.get<any>(`/api/${code}`)).state;
    assert.equal(room.airCams.slots[0][2], made.id);
    assert.equal(room.show.playerCams, true, 'in-game frames show once a camera exists');
    await production.camCreate(0, 2);
    assert.notEqual(production.snapshot().cams.slots[2]!.id, made.id, 'a new link replaces the old one');
    await production.camsSet({ delayMs: 1500 });
    assert.equal((await engine.client.get<any>(`/api/${code}`)).state.airCams.delayMs, 1500);
    await assert.rejects(production.camsSet({ delayMs: 99999 }), /0–10,000/);
    await assert.rejects(production.camCreate(2, 0), /team and player/);
    await production.camsSet({ layout: 'grid10' });
    await new Promise((r) => setTimeout(r, 50));
    room = (await engine.client.get<any>(`/api/${code}`)).state;
    assert.equal(room.airCams.layout, 'grid10');
    assert.equal(room.show.playerCams, false, 'the grid replaces the in-game frames');
    assert.equal(room.airFullscreen, 'cam-grid', 'the grid shows in the full-screen host');
    await production.camsSet({ layout: 'ingame' });
    await production.camRemove(0, 2);
    assert.equal(production.snapshot().cams.slots[2]!.id, null);
    assert.equal((await engine.client.get<any>(`/api/${code}`)).state.show.playerCams, false);

    // Edits are saved for the match and rebuild with it.
    production.segmentUpdate('map1-live', { holdSeconds: 8, transition: 'cut' });
    production.segmentMove('intro', 1);
    production.autopilot.loadForMatch();
    const live = view().segments.find((x) => x.id === 'map1-live')!;
    assert.deepEqual([live.holdSeconds, live.transition], [8, 'cut']);
    assert.equal(view().segments[1]!.id, 'intro');
    assert.throws(() => production.segmentUpdate('map1-live', { holdSeconds: 500 }), /valid/);
  } finally {
    production.autopilot.stopAll();
    production.log.stop();
    await obs.disconnect();
    await engine.stop(true);
  }
});

test('an Esportra match becomes the match on this PC, with its tournament, teams and lineups', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const { FakeEsportra } = await import('../dev/fake-esportra.ts');
  const { EsportraAccount } = await import('../src/main/esportra.ts');
  const { randomUUID } = await import('node:crypto');
  const backend = await new FakeEsportra().start();
  const dir = mkdtempSync(join(tmpdir(), 'air-prod-esp-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'esportra-test-key-0123456789', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  const values = new Map<string, string>();
  const esportra = new EsportraAccount({ apiBase: backend.url, store, secrets: { get: (k) => values.get(k) ?? null, set: (k, v) => void (v === null ? values.delete(k) : values.set(k, v)) }, deviceId: randomUUID(), deviceName: 'TEST-PC' });
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, esportra, version: 'test' });
  try {
    const row = () => production.snapshot().checks.find((c) => c.id === 'esportra')!;
    assert.equal(row().action!.id, 'sign-in');
    await assert.rejects(production.useEsportraMatch(backend.matches[0]!.id), /no longer in your Esportra schedule/);
    await assert.rejects(production.esportraSignIn(backend.email, 'nope'), /Check your email/);
    await production.esportraSignIn(backend.email, backend.password);
    assert.equal(row().health, 'ok');
    assert.match(row().detail, /producer@example.com · 2 matches/);

    const wanted = backend.matches[0]!;
    await production.useEsportraMatch(wanted.id);
    const match = production.match!;
    assert.equal(match.kind, 'esportra');
    assert.match(match.code, /^E[0-9A-F]{7}$/);
    assert.deepEqual(match.teams.map((t) => [t.name, t.tag]), [['Paper Rex', 'PRX'], ['Fnatic', 'FNC']]);
    assert.equal(match.teams[0]!.logo, 'https://example.com/a.png');
    assert.equal(match.bestOf, 3);
    assert.equal(match.source!.lineups![0]!.length, 5);
    const room = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(room.event.name, 'Community Cup', 'the tournament name is the event name on air');
    assert.equal(room.teams[1].name, 'Fnatic');
    assert.equal(room.airContext.source, 'esportra');

    // Choosing it again updates the same match instead of adding a second one, and keeps the casters.
    await production.updateMatch(match.id, { casters: [{ name: 'Caster One', handle: '' }] });
    wanted.teamB = 'Fnatic Esports';
    await production.esportraRefresh();
    await production.useEsportraMatch(wanted.id);
    assert.equal(store.data.matches.filter((m) => m.source?.matchId === wanted.id).length, 1);
    assert.equal(production.match!.teams[1].name, 'Fnatic Esports');
    assert.equal(production.match!.casters[0]!.name, 'Caster One');

    // A game Air cannot produce, and a refused account, both say why.
    backend.matches.push({ ...wanted, id: randomUUID(), game: 'cs2' });
    await production.esportraRefresh();
    await assert.rejects(production.useEsportraMatch(backend.matches.at(-1)!.id), /only produces Valorant/);
    backend.allowed = false;
    await production.esportraRefresh().catch(() => {});
    assert.equal(row().health, 'warn');
    await assert.rejects(production.useEsportraMatch(backend.matches[1]!.id), /no active Air access|Esportra/);
    // Quick matches never need the account.
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 1 });
    assert.equal(production.match!.kind, 'quick');
    await production.esportraSignOut();
    assert.equal(row().action!.id, 'sign-in');
  } finally {
    production.autopilot.stopAll();
    production.log.stop();
    await engine.stop(true);
    await backend.stop();
  }
});

test('the New match wizard: teams with logos, lineups with Riot IDs and photos reach the HUD', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-wizard-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'wizard-test-key-0123456789ab', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test' });
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  try {
    await assert.rejects(production.uploadImage('data:image/gif;base64,R0lGOD'), /PNG, JPEG or WebP/);
    await assert.rejects(production.uploadImage('data:image/jpeg;base64,/9j/4AAQ'), /only read PNG/, 'without a converter only PNG is accepted');
    const logo = await production.uploadImage(PNG);
    const photo = await production.uploadImage(PNG);
    assert.match(logo, /^\/air-assets\/[0-9a-f-]{36}$/);
    const served = await fetch(`http://127.0.0.1:${port}${logo}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');

    const base = {
      game: 'valorant' as const, bestOf: 3 as const,
      teams: [{ name: 'Night Owls', tag: 'NOW', color: '#22d3ee', logo }, { name: 'Crimson Five', tag: '', color: '#f43f5e', logo: '' }] as never,
      players: [[{ name: 'Juno Park', realName: 'June Park', gameId: 'Juno#EU1', photo }], []] as never,
      casters: [{ name: 'Sara Malik', handle: '' }], event: { name: 'Community Cup', stage: 'Playoffs' }, sponsors: ['Acme'],
    };
    await assert.rejects(production.createMatch({ ...base, game: 'cs2' }), /coming to Air/);
    await assert.rejects(production.createMatch({ ...base, teams: [{ name: 'Same', tag: '', color: '#ffffff', logo: '' }, { name: 'same', tag: '', color: '#000000', logo: '' }] as never }), /different names/);
    await assert.rejects(production.createMatch({ ...base, teams: [{ name: 'A', tag: '', color: '#fff', logo: 'javascript:alert(1)' }, { name: 'B', tag: '', color: '#000', logo: '' }] as never }), /logo again/);
    await production.createMatch(base);
    const match = production.match!;
    assert.deepEqual([match.game, match.title, match.teams[0].logo, match.teams[1].tag, match.casters.length], ['valorant', 'Night Owls vs Crimson Five', logo, 'CF', 1]);

    // Game data with the Riot ID shows the producer's display name and photo.
    await engine.client.post(`/api/${match.code}/ingest/valorant`, [{ feature: 'match_info', key: 'scoreboard_0', data: JSON.stringify({ player_id: 'p0', name: 'Juno #EU1', character: 'Clay', team: 0, alive: true, money: 3900 }) }]);
    const state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.players[0][0].name, 'Juno Park');
    assert.equal(state.players[0][0].photo, photo);
    assert.equal(state.teams[0].logo, logo);
    assert.equal(state.event.name, 'Community Cup');

    // Editing the teams later renames the match.
    await production.updateMatch(match.id, { teams: [{ ...match.teams[0], name: 'Night Owls Academy' }, match.teams[1]] });
    assert.equal(production.match!.title, 'Night Owls Academy vs Crimson Five');
  } finally {
    production.autopilot.stopAll();
    production.log.stop();
    await engine.stop(true);
  }
});

test('agent and map art is downloaded to this PC and served by the engine; Readiness follows it', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('art')]);
  let up = false;
  const host = (await import('node:http')).createServer((_req, res) => (up ? res.writeHead(200, { 'content-type': 'image/png' }).end(PNG) : res.writeHead(503).end()));
  await new Promise<void>((r) => host.listen(0, '127.0.0.1', r));
  const dir = mkdtempSync(join(tmpdir(), 'air-art-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'art-test-key-0123456789abcdef', env: engineEnv(), ...realProcess });
  await engine.start();
  const obs = new ObsLink(() => new FakeObs(), { backoffMs: [50] });
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs, capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test', artOrigin: `http://127.0.0.1:${(host.address() as { port: number }).port}/` });
  const row = () => production.snapshot().checks.find((c) => c.id === 'art')!;
  try {
    await production.createQuickMatch({ teamA: 'Team Alpha', teamB: 'Team Bravo', bestOf: 1 });
    await production.art.download();
    assert.equal(row().health, 'warn', 'offline: graphics run without the pictures');
    assert.equal(row().action?.id, 'download-art');
    up = true;
    await production.art.download();
    const { total, have } = production.snapshot().art;
    assert.ok(total > 200 && have === total, `${have} of ${total}: ${production.snapshot().art.lastError}`);
    assert.equal(row().health, 'ok');
    assert.match(row().detail, /on this PC/);
    const catalogue = await (await fetch(`http://127.0.0.1:${port}/core/catalog.js`)).text();
    const path = /"\/art\/(agents\/[0-9a-f-]{36}\/displayicon\.png)"/.exec(catalogue)![1]!;
    const picture = await fetch(`http://127.0.0.1:${port}/art/${path}`);
    assert.equal(picture.status, 200);
    assert.deepEqual(Buffer.from(await picture.arrayBuffer()), PNG, 'the engine serves the copy on this PC');
  } finally {
    production.art.stop();
    production.log.stop();
    host.close();
    await engine.stop(true);
  }
});

test('rehearsal plays the match privately with its own players, and autopilot fires through the show', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-rehearse-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'rehearse-test-key-0123456789', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const capture = new FakeCapture();
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs: new ObsLink(() => new FakeObs()), capture, ingest: { target: () => {} }, version: 'test' });
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const view = () => production.snapshot().rehearsal;
  const wait = async (check: () => boolean, label: string, ms = 60_000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) assert.fail(`timed out: ${label} · ${view().log.map((l) => l.text).join(' | ')}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  try {
    await assert.rejects(production.rehearsal.start(), /Choose a match/);
    const photo = await production.uploadImage(PNG);
    await production.createMatch({
      game: 'valorant', bestOf: 1,
      teams: [{ name: 'Night Owls', tag: 'NOW', color: '#22d3ee', logo: '' }, { name: 'Crimson Five', tag: 'CF', color: '#f43f5e', logo: '' }] as never,
      players: [[{ name: 'Juno Park', realName: '', gameId: 'Juno#EU1', photo }], [{ name: 'Kai Ito', realName: '', gameId: 'Kai#JP1', photo: '' }]] as never,
      casters: [], event: { name: 'Community Cup', stage: '' }, sponsors: [],
    });
    const code = production.match!.code;
    const live = async () => (await engine.client.get<any>(`/api/${code}`)).state;
    const before = await live();
    await production.rehearsal.start({ speed: 4, autopilot: true, handsFree: true });
    const room = view().room!;
    assert.equal(room, `__ESA_SIM_REH_${code}`);
    const rehearsal = async () => (await engine.client.get<any>(`/api/${room}`)).state;

    // Hands-free: the intro is taken by itself, then rounds go live and autopilot goes back to the game.
    await wait(() => view().autopilot?.segments.find((s) => s.id === 'intro')?.state !== 'queued' && view().autopilot?.now?.id === 'intro', 'intro taken hands-free');
    await wait(() => view().beat >= 1, 'rounds begin');
    await wait(() => ['map1-live', 'map1-half', 'map1-result'].includes(view().autopilot?.now?.id ?? ''), 'back to the game when a round goes live');
    // The sample game's players carry the match's own names and photo.
    const state = await rehearsal();
    assert.equal(state.teams[0].name, 'NIGHT OWLS');
    assert.equal(state.players[0][0].name, 'Juno Park');
    assert.equal(state.players[0][0].photo, photo);
    assert.equal(state.players[1][0].name, 'Kai Ito');

    await wait(() => view().autopilot?.now?.id === 'map1-half', 'halftime at round 12');
    assert.equal((await rehearsal()).airFullscreen, 'halftime');
    await wait(() => view().autopilot?.now?.id === 'map1-result', 'map result at map end', 90_000);
    assert.equal((await rehearsal()).airFullscreen, 'map-result');
    await wait(() => !view().running, 'rehearsal finishes', 60_000);
    assert.ok(view().log.some((l) => l.text === 'Rehearsal finished'));
    assert.equal(view().autopilot?.now?.id, 'champion', 'hands-free takes the winner too');

    // Nothing reached the match: no full-screen graphic, no autopilot, same score.
    const after = await live();
    assert.equal(after.airFullscreen ?? null, before.airFullscreen ?? null);
    assert.deepEqual(after.teams.map((t: any) => t.score), before.teams.map((t: any) => t.score));
    assert.equal(production.snapshot().autopilot.enabled, false);
    assert.ok(!(await engine.client.get<any>('/control/status')).rooms.some((r: any) => r.match === room && r.testRound?.running));

    // Stop clears everything; starting is refused while real game data flows.
    await production.rehearsal.start({ speed: 4 });
    production.rehearsal.stop();
    assert.equal(view().running, false);
    capture.state = 'live';
    await assert.rejects(production.rehearsal.start(), /Game data is live/);
  } finally {
    production.rehearsal.stop();
    production.log.stop();
    await engine.stop(true);
  }
});
