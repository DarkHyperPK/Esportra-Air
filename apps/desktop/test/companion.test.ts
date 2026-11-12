import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import WebSocket from 'ws';
import { CompanionHost } from '../src/main/companion.ts';
import { Store } from '../src/main/store.ts';
import { companionValues, eventsFor, isLocalAddress, stateEvents, type ControlMode } from '../src/shared/companion.ts';

const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });

test('values: teams, score, round, what is on air, and every player (p1–p5 first team, p6–p10 second)', () => {
  const p = (name: string, extra = {}) => ({ name, agent: 'Jett', alive: true, credits: 3900, k: 2, d: 1, a: 0, ...extra });
  const room = { teams: [{ name: 'Night Owls', tag: 'NO', score: 7, series: 1 }, { name: 'Crimson Five', tag: 'CF', score: 5, series: 0 }], round: { number: 13, phase: 'buy' }, map: { number: 2, name: 'LOTUS' },
    players: [[p('Juno'), p('Mira', { alive: false }), p(''), p(''), p('')], [p('Kairo', { k: 5 })]] };
  const v = companionValues(room, { onAir: 'Halftime', cued: 1, next: 'Map 2 · Map result' });
  assert.deepEqual([v.team_a, v.score_a, v.score_b, v.series_a, v.round, v.phase, v.map, v.on_air, v.cued], ['Night Owls', 7, 5, 1, 13, 'buy', 2, 'Halftime', 1]);
  assert.deepEqual([v.alive_a, v.alive_b, v.credits_b], [1, 1, 3900]);
  assert.deepEqual([v.p1_name, v.p2_alive, v.p6_name, v.p6_kills, v.p10_name], ['Juno', false, 'Kairo', 5, '']);
  assert.equal(companionValues(null, { onAir: 'Game', cued: 0, next: '' }).team_a, '', 'no match yet: empty values, no crash');
});

test('events: each engine event is the Companion event it means; Air sees on-air, pause and data changes', () => {
  assert.deepEqual(eventsFor({ type: 'round.won', team: 1, how: 'elim', round: 12, moment: 'round' }).map((e) => e.name), ['round_end', 'halftime']);
  assert.deepEqual(eventsFor({ type: 'round.won', team: 0, how: 'boom', round: 5, moment: 'clutch', player: 3 })[0]!.data, { team: 0, how: 'boom', round: 5, moment: 'clutch', player: 3 });
  assert.deepEqual(eventsFor({ type: 'round.phase', phase: 'live' }).map((e) => e.name), ['round_live']);
  assert.deepEqual(eventsFor({ type: 'round.phase', phase: 'buy' }), []);
  assert.deepEqual(eventsFor({ type: 'match.end' }).map((e) => e.name), ['map_end']);
  assert.deepEqual(eventsFor({ type: 'banner.ace', team: 0, player: 2 })[0], { name: 'ace', data: { team: 0, player: 2 } });
  const a = { onAir: null, pause: false, dataPaused: false };
  assert.deepEqual(stateEvents(null, a), [], 'nothing on the first look');
  assert.deepEqual(stateEvents(a, { ...a, onAir: 'halftime' }).map((e) => e.name), ['graphic_on_air']);
  assert.deepEqual(stateEvents({ ...a, onAir: 'halftime' }, { ...a, onAir: 'map-result' }).map((e) => e.name), ['graphic_off_air', 'graphic_on_air']);
  assert.deepEqual(stateEvents(a, { onAir: null, pause: true, dataPaused: true }).map((e) => e.name), ['pause_on', 'data_paused']);
});

test('only this PC and the local network may connect', () => {
  for (const ip of ['127.0.0.1', '::1', '::ffff:192.168.1.20', '10.0.0.5', '172.20.1.1', 'fe80::1']) assert.equal(isLocalAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '::ffff:1.2.3.4', '2001:db8::1', undefined]) assert.equal(isLocalAddress(ip), false, String(ip));
});

function host(mode: { value: ControlMode }, port: number, acted: Array<[string, unknown]>) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'air-cmp-')), 'air.json'));
  const secrets = new Map<string, string>();
  const state = { onAir: null as string | null, values: { score_a: 0 } as Record<string, number> };
  const h = new CompanionHost({
    store, secrets: { get: (k) => secrets.get(k) ?? null, set: (k, v) => void (v === null ? secrets.delete(k) : secrets.set(k, v)) },
    mode: () => mode.value, port, addresses: () => ['192.168.1.20'], changed: () => {},
    hello: () => ({ screens: [{ id: 'halftime', title: 'Halftime' }], talent: [], sponsors: [] }),
    values: () => state.values, watch: () => ({ onAir: state.onAir, pause: false, dataPaused: false }),
    act: async (name, args) => {
      if (name === 'nope') throw new Error('Air does not know the action “nope”.');
      acted.push([name, args]);
    },
  });
  return { h, state };
}

const open = (url: string) => new Promise<{ ws: WebSocket; messages: any[] }>((done, fail) => {
  const ws = new WebSocket(url);
  const messages: any[] = [];
  ws.on('message', (m) => messages.push(JSON.parse(m.toString())));
  ws.once('open', () => done({ ws, messages }));
  ws.once('unexpected-response', (_req, res) => fail(new Error(String(res.statusCode))));
  ws.once('error', fail);
});
const until = async (check: () => boolean, label: string) => {
  const end = Date.now() + 3000;
  while (!check()) { if (Date.now() > end) assert.fail(label); await new Promise((r) => setTimeout(r, 20)); }
};

test('the connection: runs only for Companion or Both, needs the key, sends hello, values and events, runs actions', async () => {
  const mode = { value: 'air' as ControlMode };
  const port = await freePort();
  const acted: Array<[string, unknown]> = [];
  const { h, state } = host(mode, port, acted);
  await h.sync();
  assert.equal(h.view().running, false, 'Air only: nothing listens');
  mode.value = 'both';
  await h.sync();
  const v = h.view();
  assert.equal(v.running, true);
  assert.deepEqual(v.addresses, [`192.168.1.20:${port}`]);
  await assert.rejects(open(`ws://127.0.0.1:${port}/companion?key=wrong`), /401/);
  const { ws, messages } = await open(`ws://127.0.0.1:${port}/companion?key=${v.key}`);
  await until(() => messages.length >= 2, 'hello and values');
  assert.equal(messages[0].type, 'hello');
  assert.deepEqual(messages[0].screens, [{ id: 'halftime', title: 'Halftime' }]);
  assert.deepEqual(messages[1], { type: 'values', values: { score_a: 0 } });
  assert.equal(h.view().connected, 1);

  h.onEngineEvent({ type: 'match.end' });
  state.onAir = null;
  h.onChange();
  state.onAir = 'map-result';
  state.values = { score_a: 13 };
  h.onChange();
  await until(() => messages.some((m) => m.type === 'values' && m.values.score_a === 13), 'new values');
  assert.deepEqual(messages.filter((m) => m.type === 'event').map((m) => m.name), ['map_end', 'graphic_on_air']);

  ws.send(JSON.stringify({ type: 'action', id: 1, name: 'fullscreen', args: { screen: 'halftime', on: true } }));
  ws.send(JSON.stringify({ type: 'action', id: 2, name: 'nope', args: {} }));
  await until(() => messages.filter((m) => m.type === 'result').length === 2, 'results');
  assert.deepEqual(messages.filter((m) => m.type === 'result'), [{ type: 'result', id: 1, ok: true }, { type: 'result', id: 2, ok: false, error: 'Air does not know the action “nope”.' }]);
  assert.deepEqual(acted, [['fullscreen', { screen: 'halftime', on: true }]]);

  // A new key disconnects Companion until it is given the new one.
  const closed = new Promise((r) => ws.once('close', r));
  h.renewKey();
  await closed;
  await assert.rejects(open(`ws://127.0.0.1:${port}/companion?key=${v.key}`), /401/);
  mode.value = 'air';
  await h.sync();
  assert.equal(h.view().running, false);
});
