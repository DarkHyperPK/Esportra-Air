import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globalKey, keyCommand, nextSponsor, toAccelerator } from '../src/shared/key-actions.ts';
import { globalActions } from '../src/main/global-keys.ts';
import { rebind } from '../src/shared/keymap.ts';
import type { Snapshot } from '../src/shared/api.ts';

const sponsors = [{ id: 'a', name: 'Acme' }, { id: 'b', name: 'Bolt' }];
function snap(over: Record<string, unknown> = {}): Snapshot {
  return {
    match: { talentOff: [], sponsorsOff: [] },
    event: { talent: [{ id: 't1', name: 'Caster' }], sponsors },
    autopilot: { enabled: false, next: null },
    cue: { pending: [] },
    triggers: { pause: null, strap: false, sponsor: null, player: false },
    obs: { state: 'connected' },
    readout: { observed: { name: 'Player' } },
    layers: [{ id: 'scorebug', mode: 'on', cued: null, available: true }, { id: 'economy', mode: 'auto', cued: null, available: true }, { id: 'fs:standings', mode: 'off', cued: 'on', available: true }],
    ...over,
  } as unknown as Snapshot;
}

test('Take: autopilot first, then the cue, else nothing; Stinger plays with or without a cue', () => {
  assert.equal(keyCommand('take', snap()), null);
  assert.deepEqual(keyCommand('take', snap({ cue: { pending: [{}] } })), { method: 'cueTake', args: ['take'] });
  assert.deepEqual(keyCommand('take', snap({ cue: { pending: [{}] }, autopilot: { enabled: true, next: { state: 'queued' } } })), { method: 'cueTake', args: ['take'] }, 'what is cued goes first, never an autopilot step early');
  assert.deepEqual(keyCommand('take', snap({ autopilot: { enabled: true, next: { state: 'queued' } } })), { method: 'autopilotTake', args: [] }, 'nothing cued: Take takes the next step');
  assert.equal(keyCommand('take', snap({ autopilot: { enabled: true, next: { state: 'taking' } } })), null, 'a step already being taken is not taken twice');
  assert.deepEqual(keyCommand('stinger', snap()), { method: 'stingerPlay', args: [] });
  assert.deepEqual(keyCommand('stinger', snap({ cue: { pending: [{}] } })), { method: 'cueTake', args: ['stinger'] });
  assert.equal(keyCommand('hold', snap()), null, 'hold only with a next step');
  assert.deepEqual(keyCommand('skip', snap({ autopilot: { enabled: true, next: { state: 'queued' } } })), { method: 'autopilotSkip', args: [] });
});

test('moments toggle; layers step on from the cued mode; forms belong to Air', () => {
  assert.deepEqual(keyCommand('pause', snap()), { method: 'pause', args: ['technical'] });
  assert.deepEqual(keyCommand('pause', snap({ triggers: { pause: 'technical' } })), { method: 'pause', args: [null] });
  assert.deepEqual(keyCommand('timeout', snap({ triggers: { pause: 'technical' } })), { method: 'pause', args: ['timeout'] });
  assert.deepEqual(keyCommand('talent', snap()), { method: 'casterStrap', args: [true] });
  assert.equal(keyCommand('talent', snap({ event: { talent: [], sponsors } })), 'ui', 'no talent: Air opens Talent');
  assert.deepEqual(keyCommand('sponsor', snap()), { method: 'sponsorRead', args: ['a'] });
  assert.deepEqual(keyCommand('sponsor', snap({ triggers: { sponsor: 'a' } })), { method: 'sponsorRead', args: [null] });
  assert.equal(nextSponsor(snap({ triggers: { sponsor: 'a' } }))?.id, 'b');
  assert.deepEqual(keyCommand('spotlight', snap()), { method: 'lowerThird', args: [{ kind: 'player' }] });
  assert.equal(keyCommand('replay', snap({ obs: { state: 'off' } })), null);
  assert.deepEqual(keyCommand('layer:scorebug', snap()), { method: 'setLayer', args: ['scorebug', 'off'] });
  assert.deepEqual(keyCommand('layer:economy', snap()), { method: 'setLayer', args: ['economy', 'on'] });
  assert.deepEqual(keyCommand('layer:fs:standings', snap()), { method: 'setLayer', args: ['fs:standings', 'off'] }, 'from the cued mode');
  for (const id of ['all', 'fix', 'toast', 'poll']) assert.equal(keyCommand(id, snap()), 'ui');
  assert.equal(keyCommand('pause', snap({ match: null })), null, 'no match, nothing on air');
});

test('which keys work over the game, and how they are registered', () => {
  for (const k of ['F1', 'F7', 'F24', 'Ctrl+Space', 'Alt+1', 'Ctrl+Shift+G', 'Shift+F3']) assert.ok(globalKey(k), k);
  for (const k of ['Space', 'H', 'S', 'Shift+S', '1', '', 'F25']) assert.ok(!globalKey(k), k);
  assert.equal(toAccelerator('Ctrl+Shift+G'), 'Control+Shift+G');
  assert.equal(toAccelerator('Ctrl+ArrowUp'), 'Control+Up');
  assert.equal(toAccelerator('F7'), 'F7');
  assert.deepEqual(globalActions({}).map((a) => a.key).sort(), ['F1', 'F2', 'F3', 'F5', 'F7', 'F8', 'F9'], 'defaults: F4 (toast) and F6 (poll) open forms; Ctrl G and Ctrl D open Air');
  assert.deepEqual(globalActions({ take: 'Ctrl+Space' }).map((a) => a.id).includes('take'), true, 'Take rebound to Ctrl Space works over the game');
});

test('keys every app needs cannot be taken', () => {
  for (const k of ['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+A', 'Alt+F4', 'Alt+Tab']) assert.throws(() => rebind({}, 'pause', k), /every app on this PC/, k);
});
