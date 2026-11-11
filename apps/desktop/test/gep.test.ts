import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { GepBridge, PlayerSource, type OverwolfPackages } from '../../../packages/capture/src/gep.ts';

const tick = () => new Promise((r) => setImmediate(r));

function fakeOverwolf() {
  const gep = Object.assign(new EventEmitter(), {
    calls: [] as string[],
    async setRequiredFeatures(gameId: number, features: string[]) { gep.calls.push(`features:${gameId}:${features.join(',')}`); },
    async getInfo(gameId: number) { gep.calls.push(`info:${gameId}`); return { info: { match_info: { map: 'Jam' } } }; },
  });
  const packages = Object.assign(new EventEmitter(), { gep }) as unknown as OverwolfPackages & EventEmitter;
  return { packages, gep };
}

test('nothing is enabled or forwarded before the producer consents', async () => {
  const { packages, gep } = fakeOverwolf();
  const sent: unknown[] = [];
  const bridge = new GepBridge({ packages, send: (m) => sent.push(m) });
  packages.emit('ready', {}, 'gep', '1.0');
  let enabled = 0;
  gep.emit('game-detected', { enable: () => { enabled += 1; } }, 21640, 'VALORANT');
  gep.emit('new-info-update', {}, 21640, { info: { match_info: { round_number: '1' } } });
  await tick();
  assert.equal(enabled, 0);
  assert.deepEqual(gep.calls, []);
  assert.deepEqual(sent, []);
  assert.equal(bridge.state, 'off');

  bridge.start();
  await tick();
  assert.equal(enabled, 1, 'the detected game is enabled once consent is given');
  assert.deepEqual(gep.calls, ['features:21640:match_info,me,game_info', 'info:21640']);
  assert.deepEqual(sent, [{ info: { match_info: { map: 'Jam' } } }]);

  gep.emit('new-game-event', {}, 21640, { name: 'kill_feed', data: '{}' });
  gep.emit('new-info-update', {}, 1234, { info: { other: 1 } });
  assert.deepEqual(sent.at(-1), { events: [{ name: 'kill_feed', data: '{}' }] }, 'single events are wrapped; other games ignored');
  assert.equal(sent.length, 2);
  assert.equal(bridge.state, 'live');

  bridge.stop();
  gep.emit('new-info-update', {}, 21640, { info: { match_info: { round_number: '2' } } });
  assert.equal(sent.length, 2, 'stopping capture stops forwarding');
  assert.equal(bridge.state, 'off');
});

test('consent before the game starts waits, then tracks on detection', async () => {
  const { packages, gep } = fakeOverwolf();
  const bridge = new GepBridge({ packages, send: () => {} });
  packages.emit('ready', {}, 'gep', '1.0');
  bridge.start();
  assert.equal(bridge.state, 'waiting');
  assert.match(bridge.reason ?? '', /Waiting for Valorant/);
  gep.emit('game-detected', { enable() {} }, 22904, 'VALORANT');
  await tick();
  assert.ok(gep.calls.includes('features:22904:match_info,me,game_info'));
  gep.emit('game-exit', {}, 22904);
  assert.match(bridge.reason ?? '', /Valorant closed/);
  bridge.stop();
});

test('without the Overwolf runtime capture is unavailable', () => {
  const bridge = new GepBridge({ packages: null, send: () => {} });
  bridge.start();
  assert.equal(bridge.state, 'unavailable');
});

test('player PCs forward only their own data, tagged with their Riot id', () => {
  const source = new PlayerSource('player');
  const id = '00000000-0000-4000-8000-000000000001';
  assert.deepEqual(source.prepare({ info: { match_info: { round_number: '1' } } }), []);
  assert.deepEqual(source.prepare({ feature: 'me', info: { me: { health: '80' } } }), [], 'held until identity is known');
  const out = source.prepare({ feature: 'me', info: { me: { player_id: id } } });
  assert.equal(out.length, 2);
  assert.ok(out.every((p) => p.playerId === id));
  assert.deepEqual(source.heartbeat(), { playerId: id, captureHeartbeat: true });
  // The 2-second refresh forwards getInfo(): only `me` goes out, never the player's view of the match.
  const poll = source.prepare({ info: { me: { health: '64' }, match_info: { match_score: '{"won":5,"lost":2}', round_number: '9' } } });
  assert.deepEqual(poll, [{ feature: 'me', info: { me: { health: '64' } }, playerId: id }]);
  assert.throws(() => new PlayerSource('player', 'not-a-uuid'));
});
