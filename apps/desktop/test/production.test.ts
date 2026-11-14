// The production model against the real engine binary, a fake OBS and a fake capture bridge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { LIBRARY, inShow, showPatch } from '../src/shared/library.ts';
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
    // First run: no game and no matches until the producer chooses a game.
    assert.deepEqual([production.snapshot().onboarding.done, production.snapshot().game], [false, null]);
    await assert.rejects(production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 3 }), /Choose a game first/);
    await assert.rejects(production.finishOnboarding(), /Choose a game first/);
    await assert.rejects(production.chooseGame('cs2'), /coming later/);
    await production.chooseGame('valorant');
    await production.chooseProfile('player-pcs');
    await production.finishOnboarding();
    assert.deepEqual([production.snapshot().game?.name, production.setup.profile], ['Valorant', 'player-pcs']);
    const reopened = new Store(join(dir, 'air.json'));
    assert.deepEqual([reopened.data.onboarding?.done, reopened.data.setup.game], [true, 'valorant'], 'first run is not shown again');

    // Keys and moments are this PC's own, and survive a restart.
    await production.setKey('pause', 'F10');
    await assert.rejects(production.setKey('pause', 'F2'), /already Timeout/);
    await production.setMoments(['pause', 'replay']);
    await assert.rejects(production.setMoments([]), /one to six/);
    const again = new Store(join(dir, 'air.json'));
    assert.deepEqual([again.data.keymap, again.data.moments], [{ pause: 'F10' }, ['pause', 'replay']]);
    assert.deepEqual([production.snapshot().keymap, production.snapshot().moments], [{ pause: 'F10' }, ['pause', 'replay']]);
    await production.resetKeys();
    await production.setMoments(['pause', 'timeout', 'replay', 'talent', 'sponsor', 'spotlight']);

    // No match yet: nothing on the Match step, capture refuses.
    assert.equal(production.snapshot().match, null);
    assert.throws(() => production.startCapture(), /Choose or create a match/);
    await assert.rejects(production.createQuickMatch({ teamA: 'Alpha', teamB: 'alpha', bestOf: 3 }), /different names/);
    await assert.rejects(production.createQuickMatch({ teamA: '<b>x</b>', teamB: 'Bravo', bestOf: 3 }), /plain text/);

    await production.createQuickMatch({ teamA: 'Team Alpha', teamB: 'Team Bravo', bestOf: 3 });
    production.rundownStartFrom('standard'); // quick matches start with an empty Rundown
    store.data.matches.push({ ...production.match!, id: randomUUID(), game: 'cs2' });
    assert.deepEqual(production.snapshot().matches.map((m) => m.game), ['valorant'], 'matches of another game are kept but hidden');
    store.data.matches.pop();
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
    const ev = production.eventOf(match)!;
    await production.updateEvent(ev.id, { name: 'Community Cup' });
    await production.saveSponsor(ev.id, { name: 'Acme', tier: 'partner', read: 'Official partner' });
    await production.updateMatch(match.id, { stage: 'Playoffs', theme: 'impact' });
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
    // My show (one list for the production): an element inside the HUD and an OBS graphic.
    const winProb = LIBRARY.valorant.find((i) => i.overlay === 'win-probability')!;
    await production.updateSetup(showPatch(production.setup, winProb, true)!);
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.show.winProb, true, 'adding win probability switches it on in the HUD');
    const standings = LIBRARY.valorant.find((i) => i.overlay === 'standings')!;
    await production.updateSetup(showPatch(production.setup, standings, false)!);
    assert.equal(inShow(production.setup, standings), false);
    assert.equal(production.snapshot().layers.find((l) => l.id === 'fs:standings')?.available, false, 'a graphic removed from My show cannot be put on air');
    await production.updateSetup(showPatch(production.setup, standings, true)!);
    assert.deepEqual(styled.state.sponsors, [{ name: 'ACME', logo: '', line: 'Official partner' }, { name: 'ACME', logo: '', line: 'Official partner' }], 'sponsors reach the HUD as objects, a partner twice per rotation');
    assert.equal(styled.state.event.stage, 'Playoffs');
    await assert.rejects(production.updateSetup({ package: 'neon' as never }), /available graphics styles/);

    // Check guides: connect OBS, then install, then loading.
    let checks = production.snapshot().checks;
    assert.equal(checks.find((c) => c.id === 'obs')!.action!.id, 'connect-obs');
    await obs.connect('127.0.0.1', 4455, 'secret');
    checks = production.snapshot().checks;
    assert.equal(checks.find((c) => c.id === 'scenes')!.action!.id, 'install-graphics');
    // A sponsor with a break video: Air adds it to the Break scene, hidden until shown.
    await production.saveSponsor(ev.id, { id: production.eventOf(match)!.sponsors[0]!.id, video: 'C:\\Sponsors\\acme.mp4' });
    await production.installGraphics();
    const snap = production.snapshot();
    assert.equal(snap.obs.installed, true);
    assert.ok(obsServer.scenes.has('ESPORTRA · Gameplay') && obsServer.scenes.has('ESPORTRA · Break') && obsServer.scenes.has('ESPORTRA · Desk'), 'scenes carry the ESPORTRA names');
    assert.equal(obsServer.inputs.get('ESPORTRA · In-game HUD')!.settings.url, `http://127.0.0.1:${port}/o/${ingameOutput}`);
    const video = obsServer.scenes.get('ESPORTRA · Break')!.find((i) => i.sourceName === 'ESPORTRA · Sponsor video · Acme');
    assert.ok(video && video.enabled === false, 'the sponsor video waits hidden in the Break scene');
    assert.equal(obsServer.inputs.get('ESPORTRA · Sponsor video · Acme')!.inputKind, 'ffmpeg_source');
    // Over-the-game graphics also sit over the desk cameras; the break frame's two windows have slots.
    assert.ok(obsServer.scenes.get('ESPORTRA · Desk')!.some((i) => i.sourceName === 'ESPORTRA · Full screen over desk'), 'the host is over the desk');
    assert.ok(!obsServer.scenes.has('ESPORTRA · Break window 1'), 'classic break: no Break windows are added to OBS');
    assert.ok(!snap.obs.scenes.find((x) => x.key === 'holding')!.slots.length, 'classic break: the windows ask for nothing');
    await assert.rejects(production.updateSetup({ look: { timer: { dx: 999, width: 160, plate: '#17181e' } } }), /up to 200 pixels/);
    await assert.rejects(production.updateSetup({ look: { pause: 'sideways' as never } }), /pause panel or the box/);
    await production.updateSetup({ look: { break: 'frame', timer: { dx: 6, width: 150, plate: '#1a1b20' } } });
    assert.equal(production.setup.screens.find((x) => x.id === 'holding')!.overlay, 'break-frame', 'the Break screen shows the frame');
    assert.equal(production.snapshot().obs.scenes.find((x) => x.key === 'holding')!.slots.length, 2, 'frame: both windows want a source');
    assert.equal(production.snapshot().obs.installed, false, 'the frame needs its two windows in OBS');
    await production.installGraphics();
    assert.ok(obsServer.scenes.has('ESPORTRA · Break window 1') && obsServer.scenes.has('ESPORTRA · Break window 2'), 'Add for me adds the windows for the frame');
    assert.deepEqual((await engine.client.get<any>(`/api/${match.code}`)).state.layout.timerWindow, { dx: 6, width: 150, plate: '#1a1b20' }, 'the scorebug lines up with the game timer');
    await production.updateSetup({ look: { break: 'classic', timer: { dx: 0, width: 160, plate: '#17181e' } } });
    assert.ok(Array.isArray((await engine.client.get<any>(`/api/${match.code}`)).state.schedule), "today's schedule is in the room");
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
    assert.equal((await live()).airFullscreenStyle, 'full');
    // The Rundown row's look decides how a Take shows the graphic: over the game here.
    const resultRow = production.snapshot().rundown.find((r) => r.show === 'map-result')!;
    production.rundownSave({ ...resultRow, style: 'band' });
    await production.setLayer('fs:series', 'on');
    await production.takeCue('cut');
    await production.setLayer('fs:map-result', 'on');
    await production.takeCue('cut');
    assert.deepEqual([(await live()).airFullscreen, (await live()).airFullscreenStyle], ['map-result', 'band'], 'Map result over the game');
    // Templates: a saved look goes to the room, a row picks it, a Take shows it; deleting it falls back.
    const gold = { id: 'tpl-gold', name: 'Gold result', graphic: 'map-result|band', parts: { panel: { radius: 18, fill: { kind: 'solid', a: 'brand.secondary', alpha: 0.9 } }, title: { color: '#ffc83d' } }, createdAt: 1, updatedAt: 1 };
    await production.templateSave(gold);
    assert.deepEqual((await live()).airTemplates.map((t: { id: string }) => t.id), ['tpl-gold'], 'saved looks are in the room');
    assert.equal((await live()).airBrand.secondary, '#ffc83d', 'with the event brand kit');
    await assert.rejects(production.templateSave({ ...gold, graphic: 'series|band' }), /stays with its graphic/);
    await assert.rejects(production.templateSave({ ...gold, id: 'tpl-bad', parts: { panel: { radius: 500 } } }), /corners must be between 0 and 80/);
    assert.throws(() => production.rundownSave({ ...resultRow, template: 'tpl-nope' }), /different graphic/);
    production.rundownSave({ ...resultRow, style: 'full', template: 'tpl-gold' });
    assert.equal(production.snapshot().rundown.find((r) => r.id === resultRow.id)!.style, 'band', 'the template decides over the game');
    await production.setLayer('fs:map-result', 'off');
    await production.takeCue('cut');
    await production.setLayer('fs:map-result', 'on');
    await production.takeCue('cut');
    assert.deepEqual([(await live()).airFullscreenStyle, (await live()).airFullscreenTemplate], ['band', 'tpl-gold'], 'a Take uses the row’s template');
    await production.brandSave(match.eventId!, { secondary: '#00ff88', atk: '#ff5500' });
    assert.deepEqual([(await live()).airBrand.secondary, (await live()).airBrand.atk], ['#00ff88', '#ff5500'], 'the kit follows the event');
    await assert.rejects(production.brandSave(match.eventId!, { text: 'white' }), /Text: use a colour/);
    // A HUD template on the HUD row restyles the HUD and lines up the timer window.
    await production.templateSave({ id: 'tpl-hud', name: 'Event HUD', graphic: 'hud', parts: { sbround: { color: 'brand.secondary' } }, timer: { dx: 4, width: 150, plate: '#20212a' }, createdAt: 1, updatedAt: 1 });
    const hudRow = production.snapshot().rundown.find((r) => r.show === 'in-game')!;
    production.rundownSave({ ...hudRow, template: 'tpl-hud' });
    await production.syncEngine();
    assert.equal((await live()).airHudTemplate, 'tpl-hud');
    assert.deepEqual((await live()).layout.timerWindow, { dx: 4, width: 150, plate: '#20212a' }, 'the HUD template’s timer window wins');
    // Scene screens: the Break row's look decides the Break page; scene templates reach the room by graphic.
    await production.templateSave({ id: 'tpl-frame', name: 'Cup frame', graphic: 'holding|band', parts: { clock: { color: 'brand.secondary' } }, createdAt: 1, updatedAt: 1 });
    const breakRow = production.snapshot().rundown.find((r) => r.show === 'holding') ?? null;
    if (breakRow) production.rundownSave({ ...breakRow, template: 'tpl-frame' });
    else production.rundownSave({ section: 'pre', show: 'holding', trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0, template: 'tpl-frame' });
    await production.syncEngine();
    assert.equal(production.setup.screens.find((x) => x.id === 'holding')!.overlay, 'break-frame', 'a frame template makes Break the frame');
    assert.deepEqual((await live()).airPageTemplates, { 'holding|band': 'tpl-frame' });
    assert.equal(production.snapshot().templateUse['tpl-frame'], 1, 'used in one match');
    assert.equal(production.snapshot().templateUse['tpl-gold'], 1);
    const br = production.snapshot().rundown.find((r) => r.show === 'holding')!;
    production.rundownSave({ ...br, style: 'full', template: undefined });
    await production.syncEngine();
    assert.equal(production.setup.screens.find((x) => x.id === 'holding')!.overlay, 'holding', 'back to the classic Break');
    assert.equal((await live()).airPageTemplates?.['holding|band'], undefined, 'a removed look is cleared in the room');
    await production.templateDelete('tpl-frame');
    await production.templateDelete('tpl-gold');
    assert.equal(production.snapshot().rundown.find((r) => r.id === resultRow.id)!.template, undefined, 'rows that used it go back to the default look');
    assert.deepEqual((await live()).airTemplates.map((t: { id: string }) => t.id), ['tpl-hud']);
    await production.templateDelete('tpl-hud');
    production.rundownSave({ ...resultRow, style: 'full' });
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
    assert.match(production.snapshot().gameLocked ?? '', /after the show/, 'the game cannot switch while game data runs');
    const other = { ...production.match!, id: randomUUID(), code: 'QOTHER01' };
    store.data.matches.push(other);
    await assert.rejects(production.selectMatch(other.id), /before switching matches/, 'every graphic would change mid-show');
    await assert.rejects(production.createQuickMatch({ teamA: 'Late', teamB: 'Entry', bestOf: 1 }), /before switching matches/);
    await production.selectMatch(production.match!.id);
    store.data.matches.pop();
    assert.equal(production.snapshot().feed.state, 'waiting');

    // Triggers write the state the overlays already understand.
    await assert.rejects(production.casterStrap(true), /people on air/);
    await production.saveTalent(ev.id, { name: 'Caster Two', role: 'analyst' });
    await production.saveTalent(ev.id, { name: 'Caster One', handle: '@one', role: 'play-by-play' });
    await production.casterStrap(true);
    let state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.show.lowerThird, true);
    assert.equal(state.lowerThird.kind, 'caster');
    assert.equal(state.casters[0].name, 'Caster One');
    const acme = production.eventOf(match)!.sponsors[0]!.id;
    await production.sponsorRead(acme);
    state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.lowerThird.title, 'Acme');
    assert.equal(production.snapshot().triggers.strap, false, 'one lower third at a time');
    assert.equal(state.lowerThird.sub, 'Official partner', 'the read text is the sponsor’s own');
    assert.equal(production.snapshot().triggers.sponsor, acme, 'on-screen state is read back from the engine');
    await production.updateMatch(match.id, { sponsorsOff: [acme] });
    await assert.rejects(production.sponsorRead(acme), /not on for this match/);
    assert.deepEqual((await engine.client.get<any>(`/api/${match.code}`)).state.sponsors, [], 'a sponsor switched off leaves the rotation');
    await production.updateMatch(match.id, { sponsorsOff: [] });
    await production.pause('technical');
    state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.airPause.kind, 'technical');
    await production.pause(null);
    state = (await engine.client.get<any>(`/api/${match.code}`)).state;
    assert.equal(state.airPause, undefined);
    // Keys over the game: F1 pressed while the game has focus runs the same call as inside Air.
    const { FakeShortcuts } = await import('../dev/fake-shortcuts.ts');
    const { dispatch } = await import('../src/main/api.ts');
    const shortcuts = new FakeShortcuts(new Set(['F3']));
    const ctx = { production, obs, secrets: null as never, copy: () => {} };
    production.attachKeys(shortcuts, (method, args) => dispatch(ctx, method, args));
    assert.deepEqual(production.snapshot().globalKeys.taken, ['F3']);
    assert.deepEqual(production.snapshot().globalKeys.active.slice().sort(), ['F1', 'F2', 'F5', 'F7', 'F8', 'F9'], 'F4 and F6 open forms in Air; F3 is held by another app');
    assert.ok(shortcuts.press('F1'));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.airPause.kind, 'technical', 'F1 over the game puts up the tech pause');
    assert.ok(shortcuts.press('F1'));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await engine.client.get<any>(`/api/${match.code}`)).state.airPause, undefined, 'and again takes it down');
    await production.setKey('pause', 'Ctrl+Alt+P');
    assert.ok(shortcuts.keys.has('Control+Alt+P') && !shortcuts.keys.has('F1'), 'a rebind re-registers');
    await production.resetKeys();
    production.setGlobalKeys(false);
    assert.equal(shortcuts.keys.size, 0, 'switched off: nothing is held');
    assert.equal(new Store(join(dir, 'air.json')).data.globalKeys, false);
    production.setGlobalKeys(true);
    assert.ok(shortcuts.keys.has('F1'));
    production.holdGlobalKeys(true);
    assert.equal(shortcuts.keys.size, 0, 'while Settings waits for a key, F1 reaches Air');
    assert.equal(production.snapshot().globalKeys.on, true, 'the switch itself stays on');
    production.holdGlobalKeys(false);
    assert.ok(shortcuts.keys.has('F1'));
    production.stopKeys();
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
    assert.deepEqual(obsServer.scenes.get('ESPORTRA · Full screen')!.map((i) => i.sourceName), ['ESPORTRA · Full screen graphics'], 'one host source in the Full screen scene, named apart from the scene (OBS keeps one list of names)');
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
    await production.updateEvent(production.match!.eventId, { name: 'Edited During Test' });
    await production.testRound('stop');
    await engine.poll();
    assert.equal(production.snapshot().testRound.running, false);
    const end = Date.now() + 4000;
    while ((await engine.client.get<any>(`/api/${match.code}`)).state.event.name !== 'Edited During Test') {
      assert.ok(Date.now() < end, 'the edit is sent once the test round ends');
      await engine.poll();
      await new Promise((r) => setTimeout(r, 100));
    }
    production.stopCapture();
    production.setCueMode(true);
    // Cued changes belong to their match: switching match drops them, so a Take never lands on another match.
    await production.toast('For this match only');
    assert.deepEqual(production.snapshot().cue.pending, ['Toast · For this match only']);
    await production.createQuickMatch({ teamA: 'Other', teamB: 'Side', bestOf: 1 });
    assert.deepEqual(production.snapshot().cue.pending, [], 'nothing cued on the new match');
    await production.selectMatch(match.id);
    assert.deepEqual(production.snapshot().cue.pending, [], 'and nothing comes back on the old one');
    await assert.rejects(production.takeCue('take'), /Nothing is cued/);
    production.setCueMode(false);
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
  production.setup.game = 'valorant';
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
    production.rundownStartFrom('standard'); // quick matches start with an empty Rundown
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
    const row = (id: string) => production.snapshot().rundown.find((r) => r.id === id)!;
    production.rundownSave({ ...row('result'), forSeconds: 1 });
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
    assert.throws(() => production.rundownStartFrom('minimal'), /Run manually first/);
    assert.throws(() => production.rundownSave({ ...row('half'), forSeconds: 8 }), /Run manually first/);

    await production.autopilotTake();
    await wait(() => view().now?.id === 'map1-live', 'back to the game');
    assert.equal(await showing(), null);

    // Skip halftime; the map ending arms the result, which clears itself after its time.
    production.autopilotSkip();
    assert.equal(view().next!.id, 'map1-result');
    const scoreIs = (a: number, b: number) => engine.client.post(`/api/${code}/ingest/valorant`, [{ info: { match_info: { match_score: JSON.stringify({ team_0: a, team_1: b }) } }, feature: 'match_info' }]);
    // A map stopped early (a remake) is not a map end: no result, nothing counted.
    await scoreIs(3, 2);
    await engine.client.post(`/api/${code}/ingest/valorant`, [{ events: [{ name: 'match_end', data: '' }] }]);
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(view().next!.state, 'armed', 'a 3–2 map end does not open the result');
    assert.deepEqual((await engine.client.get<any>(`/api/${code}`)).state.teams.map((t: any) => t.series ?? 0), [0, 0]);
    // A finished map (13–7): the result step opens, and the series counts it from the game.
    await scoreIs(13, 7);
    await engine.client.post(`/api/${code}/ingest/valorant`, [{ events: [{ name: 'match_end', data: '' }] }]);
    await wait(() => view().next?.id === 'map1-result' && view().next?.state === 'holding', 'result hold opens');
    await wait(async () => (await engine.client.get<any>(`/api/${code}`)).state.teams[0].series === 1, 'series 1–0 from the game');
    const counted = (await engine.client.get<any>(`/api/${code}`)).state;
    assert.deepEqual([counted.teams[1].series ?? 0, counted.series[0].score, counted.series[0].winner], [0, [13, 7], 0], 'map 1 result on the series graphics');
    await engine.client.post(`/api/${code}/ingest/valorant`, [{ events: [{ name: 'match_end', data: '' }] }]);
    await new Promise((r) => setTimeout(r, 600));
    assert.equal((await engine.client.get<any>(`/api/${code}`)).state.teams[0].series, 1, 'a second map end for the same map is not counted twice');
    await production.autopilotTake();
    await wait(async () => (await showing()) === 'map-result', 'map result on air');
    await wait(async () => (await showing()) === null, 'timed graphic clears', 3000);
    assert.equal(view().next!.id, 'champion');
    assert.equal(view().next!.state, 'armed', 'manual steps arm but never take themselves');
    assert.equal(obsServer.program, program, 'autopilot never switched an OBS scene');
    const log = production.snapshot().log.map((x) => x.text);
    for (const line of ['Autopilot started', 'Held by operator · Back to the game', 'Skipped · Halftime', 'Full screen · Map result']) assert.ok(log.includes(line), `${line} in ${log.join(' | ')}`);
    assert.ok(log.some((l) => l.startsWith('Autopilot paused')), 'pause logged');

    // Run manually clears everything; autopilot is never on after a restart.
    production.autopilotStop();
    assert.equal(view().enabled, false);
    assert.equal(view().next, null);
    production.autopilot.loadForMatch();
    assert.equal(view().enabled, false);
    // ...but it remembers where the show is: after a restart it offers to resume, and says so.
    assert.equal(view().resumeAt, 'Champion');
    production.noteRecovery();
    assert.match(production.snapshot().recovery ?? '', /Recovered after a restart\. Graphics kept the last data; autopilot is ready to resume at Champion\./);
    production.dismissRecovery();
    assert.equal(production.snapshot().recovery, null);
    production.autopilotRestart();
    assert.equal(view().resumeAt, null, 'starting the rundown again forgets the progress');

    // Starting points: Results only keeps the result and the return to the game; Manual and Empty take nothing.
    production.rundownStartFrom('minimal');
    assert.equal(view().preset, 'minimal');
    assert.deepEqual(view().segments.filter((x) => x.mode === 'automatic').map((x) => x.id), ['map1-live', 'map1-result']);
    production.rundownStartFrom('manual');
    assert.deepEqual(view().segments.filter((x) => x.mode === 'automatic').map((x) => x.id), []);
    production.rundownStartFrom('empty');
    assert.deepEqual(production.snapshot().rundown.map((r) => r.show), ['in-game'], 'Empty keeps only the in-game HUD row');
    assert.throws(() => production.rundownStartFrom('wild' as never), /Standard, Results only, Manual or Empty/);
    production.rundownStartFrom('standard');

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

    // Rows are the producer's own: saved for the match, in their order, switched off, added and removed.
    production.rundownSave({ ...row('live'), holdSeconds: 8, transition: 'cut' });
    production.rundownMove('result', -1);
    assert.throws(() => production.rundownMove('intro', 1), /cannot move further/, 'rows move within their section');
    production.autopilot.loadForMatch();
    const live = view().segments.find((x) => x.id === 'map1-live')!;
    assert.deepEqual([live.holdSeconds, live.transition], [8, 'cut']);
    assert.deepEqual(view().segments.slice(0, 4).map((x) => x.id), ['intro', 'map1-live', 'map1-result', 'map1-half']);
    assert.throws(() => production.rundownSave({ ...row('live'), holdSeconds: 500 }), /0–60/);
    production.rundownEnable('half', false);
    assert.ok(!view().segments.some((x) => x.id === 'map1-half'), 'a switched-off row is not in the rundown');
    production.rundownSave({ section: 'between', show: 'map-result', trigger: 'manual', map: 1, forSeconds: 20, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 });
    const added = production.snapshot().rundown.filter((r) => r.section === 'between').at(-1)!;
    assert.equal(view().segments.find((x) => x.id === added.id)!.name, 'Map result');
    production.rundownRemove(added.id);
    assert.ok(!production.snapshot().rundown.some((r) => r.id === added.id));
    // Only what is in the Rundown goes to OBS.
    const on = (id: string) => production.snapshot().setup.screens.find((x) => x.id === id)?.enabled;
    production.rundownSave({ section: 'between', show: 'standings', trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(on('standings'), true, 'adding Standings installs it');
    production.rundownRemove(production.snapshot().rundown.find((r) => r.show === 'standings')!.id);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(on('standings'), false, 'removing it takes it out of OBS');
    assert.equal(on('in-game'), true);
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
  production.setup.game = 'valorant';
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

    // Choosing it again updates the same match instead of adding a second one, and keeps its talent.
    assert.equal(production.eventOf(match)!.tournamentId, match.source!.tournamentId, 'the tournament is the event');
    await production.saveTalent(match.eventId, { name: 'Caster One' });
    wanted.teamB = 'Fnatic Esports';
    await production.esportraRefresh();
    await production.useEsportraMatch(wanted.id);
    assert.equal(store.data.matches.filter((m) => m.source?.matchId === wanted.id).length, 1);
    assert.equal(production.match!.teams[1].name, 'Fnatic Esports');
    assert.equal(production.eventOf(production.match!)!.talent[0]!.name, 'Caster One');
    assert.equal(production.match!.eventId, match.eventId);

    // A game Air cannot produce, and a refused account, both say why.
    backend.matches.push({ ...wanted, id: randomUUID(), game: 'cs2' });
    await production.esportraRefresh();
    await assert.rejects(production.useEsportraMatch(backend.matches.at(-1)!.id), /cannot produce this match’s game/);
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
  production.setup.game = 'valorant';
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
      bestOf: 3 as const,
      teams: [{ name: 'Night Owls', tag: 'NOW', color: '#22d3ee', logo }, { name: 'Crimson Five', tag: '', color: '#f43f5e', logo: '' }] as never,
      players: [[{ name: 'Juno Park', realName: 'June Park', gameId: 'Juno#EU1', photo }], []] as never,
      stage: 'Playoffs',
    };
    await assert.rejects(production.createMatch({ ...base, teams: [{ name: 'Same', tag: '', color: '#ffffff', logo: '' }, { name: 'same', tag: '', color: '#000000', logo: '' }] as never }), /different names/);
    await assert.rejects(production.createMatch({ ...base, teams: [{ name: 'A', tag: '', color: '#fff', logo: 'javascript:alert(1)' }, { name: 'B', tag: '', color: '#000', logo: '' }] as never }), /logo again/);
    await production.createMatch(base);
    const match = production.match!;
    await production.updateEvent(match.eventId, { name: 'Community Cup' });
    assert.deepEqual([match.game, match.title, match.teams[0].logo, match.teams[1].tag, match.stage], ['valorant', 'Night Owls vs Crimson Five', logo, 'CF', 'Playoffs']);

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
  production.setup.game = 'valorant';
  const row = () => production.snapshot().checks.find((c) => c.id === 'art')!;
  try {
    await production.createQuickMatch({ teamA: 'Team Alpha', teamB: 'Team Bravo', bestOf: 1 });
    production.rundownStartFrom('standard'); // quick matches start with an empty Rundown
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
  production.setup.game = 'valorant';
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
      bestOf: 1,
      teams: [{ name: 'Night Owls', tag: 'NOW', color: '#22d3ee', logo: '' }, { name: 'Crimson Five', tag: 'CF', color: '#f43f5e', logo: '' }] as never,
      players: [[{ name: 'Juno Park', realName: '', gameId: 'Juno#EU1', photo }], [{ name: 'Kai Ito', realName: '', gameId: 'Kai#JP1', photo: '' }]] as never,
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

test('Stream Deck / Companion: the module connects, gets map end from the game, and puts Map result up', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const { createRequire } = await import('node:module');
  const { AirLink } = createRequire(import.meta.url)('../../../packages/companion-module/link.js');
  const dir = mkdtempSync(join(tmpdir(), 'air-cmp-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'companion-test-key-0123456789ab', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const companionPort = await freePort();
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test', companionPort });
  production.setup.game = 'valorant';
  const seen: { events: string[]; hello: any; values: any } = { events: [], hello: null, values: null };
  let link: any = null;
  const wait = async (check: () => boolean | Promise<boolean>, label: string) => {
    const end = Date.now() + 5000;
    while (!(await check())) { if (Date.now() > end) assert.fail(label); await new Promise((r) => setTimeout(r, 25)); }
  };
  try {
    await production.createQuickMatch({ teamA: 'Team Alpha', teamB: 'Team Bravo', bestOf: 1 });
    production.rundownStartFrom('standard'); // quick matches start with an empty Rundown
    const code = production.match!.code;
    assert.equal(production.snapshot().control, 'air');
    assert.equal(production.snapshot().companion.running, false, 'Air only: no connection open');
    await production.setControl('companion');
    const view = production.snapshot().companion;
    assert.equal(view.running, true);
    link = new AirLink({ host: '127.0.0.1', port: companionPort, key: view.key, onHello: (h: any) => (seen.hello = h), onValues: (v: any) => (seen.values = v), onEvent: (e: any) => seen.events.push(e.name) });
    link.start();
    await wait(() => !!seen.hello && !!seen.values, 'hello and values');
    assert.ok(seen.hello.screens.some((s: any) => s.id === 'map-result'));
    assert.equal(seen.values.team_a, 'Team Alpha');
    await wait(() => production.snapshot().companion.connected === 1, 'Air sees Companion');

    await engine.client.post(`/api/${code}/ingest/valorant`, [{ events: [{ name: 'match_end', data: '' }] }]);
    await wait(() => seen.events.includes('map_end'), 'map end reaches Companion');

    production.setCueMode(false);
    await link.act('fullscreen', { screen: 'map-result', on: 'on' });
    await wait(async () => (await engine.client.get<any>(`/api/${code}`)).state.airFullscreen === 'map-result', 'Map result on air');
    await wait(() => seen.events.includes('graphic_on_air') && seen.values?.on_air === 'Map result', 'on-air event and value');
    await assert.rejects(link.act('autopilot_take'), /set to Both/);
    await assert.rejects(link.act('fullscreen', { screen: 'nope' }), /not in My show/);
    await production.setControl('air');
    assert.equal(production.snapshot().companion.running, false);
  } finally {
    link?.stop();
    await production.companion.stop();
    production.log.stop();
    await engine.stop(true);
  }
});

test('deleting: a match and an event go, never while live; the selection moves to what is left', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-del-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'delete-test-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test' });
  production.setup.game = 'valorant';
  try {
    await production.createEvent('Cup A');
    await production.createEvent('Cup B');
    const [a, b] = store.data.events;
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 1, eventId: a!.id });
    const first = production.match!.id;
    await production.createQuickMatch({ teamA: 'Charlie', teamB: 'Delta', bestOf: 1, eventId: a!.id });
    await production.createQuickMatch({ teamA: 'Echo', teamB: 'Foxtrot', bestOf: 1, eventId: b!.id });
    assert.deepEqual(store.data.matches.map((m) => m.eventId), [b!.id, a!.id, a!.id], 'each match is in the event it was made in');

    // The selected match cannot go while a test round is on air.
    await production.testRound('start');
    await new Promise((r) => setTimeout(r, 400));
    await engine.poll();
    await assert.rejects(production.deleteMatch(production.match!.id), /live/);
    await assert.rejects(production.deleteEvent(b!.id), /live/);
    await production.testRound('stop');
    await engine.poll();

    await production.deleteMatch(first);
    assert.ok(!store.data.matches.some((m) => m.id === first));
    await production.deleteEvent(b!.id);
    assert.deepEqual(store.data.events.map((e) => e.id), [a!.id]);
    assert.deepEqual(store.data.matches.map((m) => m.teams[0].name), ['Charlie'], 'its matches went with it');
    assert.equal(production.match?.teams[0].name, 'Charlie', 'the selection moved to what is left');
    await assert.rejects(production.deleteMatch('nope'), /already gone/);
  } finally {
    production.log.stop();
    await engine.stop(true);
  }
});

test('Teams/Players: a match follows its saved teams and players, all the way to the HUD', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-lib-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'library-test-key-0123456789abcd', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test' });
  production.setup.game = 'valorant';
  const room = async () => (await engine.client.get<any>(`/api/${production.match!.code}`)).state;
  try {
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 1 });
    const lib = production.snapshot().library;
    assert.deepEqual(lib.teams.map((t) => t.name), ['Alpha', 'Bravo'], 'a new match puts its teams in Teams/Players');
    const alpha = lib.teams[0]!;
    await production.saveTeam({ ...alpha, name: 'Alpha Esports', color: '#00ff88' });
    assert.equal(production.match!.teams[0].name, 'Alpha Esports');
    assert.equal(production.match!.title, 'Alpha Esports vs Bravo');
    assert.equal((await room()).teams[0].name, 'Alpha Esports', 'the HUD shows the new name');

    for (const name of ['Ace', 'Bolt', 'Cleo', 'Dune', 'Edge', 'Flux']) await production.savePlayer({ name, gameId: `${name.toUpperCase()}#EU1`, teamId: alpha.id });
    await production.setMatchTeam(production.match!.id, 0, alpha.id);
    assert.deepEqual(production.match!.players[0].map((p) => p.name), ['Ace', 'Bolt', 'Cleo', 'Dune', 'Edge']);
    const flux = production.snapshot().library.players.find((p) => p.name === 'Flux')!;
    const ace = production.snapshot().library.players.find((p) => p.name === 'Ace')!;
    await production.setStarters(production.match!.id, 0, [flux.id, ...production.match!.players[0].slice(1).map((p) => p.libraryId!)]);
    assert.equal(production.match!.players[0][0]!.name, 'Flux');
    await assert.rejects(production.setStarters(production.match!.id, 1, [flux.id]), /team first|from this team/);
    // Ace leaves for Bravo: he leaves this lineup too.
    await production.savePlayer({ ...ace, teamId: production.snapshot().library.teams[1]!.id });
    assert.ok(!production.match!.players[0].some((p) => p.name === 'Ace'));
    await production.removeTeam(alpha.id);
    assert.equal(production.match!.teams[0].name, 'Alpha Esports', 'the match keeps its copy');
    assert.equal(production.snapshot().library.players.find((p) => p.name === 'Flux')!.teamId, null);
  } finally {
    production.log.stop();
    await engine.stop(true);
  }
});

test('a match finishes when a team wins the series, and then keeps the teams it was played with', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-fin-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'finish-test-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test' });
  production.setup.game = 'valorant';
  try {
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 1 });
    await production.correct({ field: 'series', value: [1, 0], reason: 'Map won' } as never);
    for (let i = 0; i < 40 && !production.match!.finishedAt; i++) { await engine.poll(); await new Promise((r) => setTimeout(r, 50)); }
    assert.ok(production.match!.finishedAt, 'a won series finishes the match');
    const alpha = production.snapshot().library.teams[0]!;
    await production.saveTeam({ ...alpha, name: 'Alpha Renamed' });
    assert.equal(production.match!.teams[0].name, 'Alpha', 'the finished match keeps its name');
    await production.markFinished(production.match!.id, false);
    assert.equal(production.match!.teams[0].name, 'Alpha Renamed', 'reopened: it follows again');
  } finally {
    production.log.stop();
    await engine.stop(true);
  }
});

/** A real PNG of a given size (all see-through), as Photoshop would export it. */
async function blankPng(width: number, height: number) {
  const { deflateSync, crc32 } = await import('node:zlib');
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('your own graphics: the design is kept as exported, its boxes reach the room, and it goes on air like Map result', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-own-'));
  const port = await freePort();
  (await import('node:fs')).mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'own-graphic-test-key-0123456789', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  const capture = new FakeCapture();
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture, ingest: { target: () => {} }, version: 'test' });
  production.setup.game = 'valorant';
  const { newBox } = await import('../src/shared/own-graphics.ts');
  try {
    await production.createQuickMatch({ teamA: 'Night Owls', teamB: 'Crimson Five', bestOf: 3 });
    const code = production.match!.code;
    // The design: only a 1920×1080 PNG, stored byte for byte.
    const png = await blankPng(1920, 1080);
    await assert.rejects(production.uploadArtwork(`data:image/png;base64,${(await blankPng(1280, 720)).toString('base64')}`), /1280 × 720\. Export it at 1920 × 1080/);
    await assert.rejects(production.uploadArtwork('data:image/jpeg;base64,/9j/4AAQ'), /as a PNG/);
    const image = await production.uploadArtwork(`data:image/png;base64,${png.toString('base64')}`);
    const served = await fetch(`http://127.0.0.1:${port}${image}`);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.ok(Buffer.from(await served.arrayBuffer()).equals(png), 'kept exactly as exported');
    await assert.rejects(production.uploadFont(`data:text/html;base64,${Buffer.from('<html>').toString('base64')}`, 'x.woff2'), /not a font/);
    const font = await production.uploadFont(`data:font/woff2;base64,${Buffer.from('wOF2\0\x01\0\0 a font').toString('base64')}`, 'Neon Grotesk Bold.woff2');
    assert.equal(font.name, 'Neon Grotesk Bold');

    const id = randomUUID();
    await production.ownSave({ id, name: 'Neon Cup · Map result', purpose: 'map-result', style: 'full', image, fonts: [font], boxes: [{ ...newBox('team.1.score', 1180, 400, 'b'), font: 'Neon Grotesk Bold' }], enter: 'fade', exit: 'fade', createdAt: 1, updatedAt: 1 });
    const room = async () => (await engine.client.get<any>(`/api/${code}`)).state;
    assert.deepEqual((await room()).airOwn.map((g: { id: string }) => g.id), [id], 'its definition is in the room for the full-screen host');
    assert.equal(production.sectionOf(`own:${id}`), 'between', 'it goes where Map result goes');
    // Used in the match: a Rundown row, then on air through Take like any full-screen graphic.
    production.ownUse(id);
    await production.syncEngine();
    const row = production.snapshot().rundown.find((r) => r.show === `own:${id}`)!;
    assert.deepEqual([row.section, row.trigger], ['between', 'map_end'], 'it comes up when the map ends, like Map result');
    assert.throws(() => production.ownUse(id), /already in this match/);
    assert.ok(production.snapshot().layers.some((l) => l.id === `fs:own:${id}` && l.available), 'it is a graphic on Live');
    await production.setLayer(`fs:own:${id}`, 'on');
    await production.takeCue('cut');
    assert.equal((await room()).airFullscreen, `own:${id}`);
    assert.deepEqual(production.snapshot().onAirLooks, [id], 'the editor can warn that saving changes it on air');
    assert.throws(() => production.rundownSave({ section: 'game', show: `own:${id}`, trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'cut', holdMode: 'manual', holdSeconds: 0 }), /does not go in this part/);
    // It survives a restart of Air: the store brings it back as a screen.
    production.log.stop();
    const again = new Store(join(dir, 'air.json'));
    assert.ok(again.data.setup.screens.some((x) => x.id === `own:${id}` && x.hosted), 'kept across restarts');
    // Mid-show it cannot be deleted (that would change the live Rundown and stop autopilot).
    capture.start();
    await assert.rejects(production.ownDelete(id), /match is live\. Delete it after the show/);
    capture.stop();
    // Deleting it takes its rows with it.
    await production.ownDelete(id);
    assert.equal(production.snapshot().rundown.some((r) => r.show === `own:${id}`), false);
    assert.deepEqual((await room()).airOwn, []);
    assert.equal((await room()).airFullscreen ?? null, null, 'it was on screen: back to the game');
  } finally {
    production.log.stop();
    await engine.stop(true);
  }
});
