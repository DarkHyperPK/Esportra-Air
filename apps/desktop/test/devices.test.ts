import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devicesView } from '../src/shared/devices.ts';
import type { JoinedPc } from '../src/shared/join.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pc = (n: number, playerId: string | null, role: 'player' | 'observer' = 'player'): JoinedPc => ({ id: n, role, name: `PC-${n}`, ip: '10.0.0.' + n, since: 0, lastAgeMs: 500, messages: 3, playerId });
const NOW = 1_000_000;
const room = () => [0, 1].map((t) => Array.from({ length: 5 }, (_, i) => ({ name: `P${t}${i}`, photo: '', puuid: id(t * 5 + i) })));

test('a player PC is seated by the player id it sends, with how fresh its data is', () => {
  const players = room();
  (players[0]![0] as any).captureCoverage = { lastSeenAt: NOW - 400 };
  (players[0]![1] as any).captureCoverage = { lastSeenAt: NOW - 25_000 };
  const v = devicesView({ lineup: null, roomPlayers: players, peers: [pc(1, id(0)), pc(2, id(1)), pc(3, id(2)), pc(4, null, 'observer')], now: NOW });
  assert.equal(v.fromGame, true);
  assert.deepEqual(v.seats.slice(0, 4).map((x) => [x.name, x.pc, x.state]), [['P00', 'PC-1', 'live'], ['P01', 'PC-2', 'quiet'], ['P02', 'PC-3', 'joined'], ['P03', null, 'none']]);
  assert.equal(v.seats[0]!.ageMs, 400);
  assert.equal(v.checkedIn, 1);
  assert.deepEqual(v.observers.map((o) => o.name), ['PC-4']);
  assert.deepEqual(v.unseated, []);
});

test('PCs without a seat say why', () => {
  const v = devicesView({ lineup: null, roomPlayers: room(), peers: [pc(1, null), pc(2, id(99))], now: NOW });
  assert.deepEqual(v.unseated.map((u) => u.detail), ['Joined. Waiting for the game to open on this PC.', 'This player is not in the match the observer is watching.']);
});

test('before the game reports its players, seats come from the lineup and nobody is checked in', () => {
  const lineup = [[{ id: 'a', name: 'Juno', realName: '', gameId: 'Juno#EU1', photo: '/p' }], []] as never;
  const v = devicesView({ lineup, roomPlayers: [[{ name: '', puuid: '' }], []], peers: [pc(1, id(0))], now: NOW });
  assert.equal(v.fromGame, false);
  assert.deepEqual(v.seats.map((x) => [x.name, x.photo, x.state]), [['Juno', '/p', 'none']]);
  assert.deepEqual(v.unseated.map((u) => u.detail), ['Ready. Seated as soon as the match starts.']);
  assert.equal(v.checkedIn, 0);
});
