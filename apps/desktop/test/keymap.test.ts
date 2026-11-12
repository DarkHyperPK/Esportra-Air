import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, DEFAULT_MOMENTS, actionFor, isTyping, keyFromEvent, keyOf, rebind, validMoments } from '../src/shared/keymap.ts';

const ev = (key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => ({ key, ctrlKey: !!mods.ctrlKey, shiftKey: !!mods.shiftKey });

test('every action has its own default key, and moments come from the moment list', () => {
  const keys = ACTIONS.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate default keys: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`);
  assert.equal(new Set(ACTIONS.map((a) => a.id)).size, ACTIONS.length);
  assert.deepEqual(validMoments(DEFAULT_MOMENTS), DEFAULT_MOMENTS);
});

test('a key press finds its action, modifiers included', () => {
  assert.equal(actionFor({}, ev(' ')), 'take');
  assert.equal(actionFor({}, ev('F7')), 'stinger');
  assert.equal(actionFor({}, ev('h')), 'hold');
  assert.equal(actionFor({}, ev('g', { ctrlKey: true })), 'all');
  assert.equal(actionFor({}, ev('g')), ACTIONS.find((a) => a.key === 'G')?.id ?? null, 'plain G is not All graphics');
  assert.equal(keyFromEvent(ev('a', { shiftKey: true })), 'Shift+A');
  assert.equal(keyFromEvent(ev('Shift', { shiftKey: true })), '', 'a modifier alone is not a key');
  assert.equal(isTyping({ tagName: 'INPUT' } as never), true);
  assert.equal(isTyping({ tagName: 'BUTTON' } as never), false);
});

test('rebinding refuses a key in use unless swapped, and never a key Air keeps', () => {
  assert.throws(() => rebind({}, 'pause', 'F2'), /F2 is already Timeout/);
  const swapped = rebind({}, 'pause', 'F2', true);
  assert.deepEqual([keyOf(swapped, 'pause'), keyOf(swapped, 'timeout')], ['F2', 'F1']);
  const moved = rebind({}, 'pause', 'F10');
  assert.equal(actionFor(moved, ev('F10')), 'pause');
  assert.equal(actionFor(moved, ev('F1')), null, 'the old key is free');
  assert.deepEqual(rebind(moved, 'pause', null), {}, 'reset removes the override');
  assert.deepEqual(rebind({}, 'pause', 'F1'), {}, 'binding the default stores nothing');
  for (const k of ['Escape', 'Ctrl+K']) assert.throws(() => rebind({}, 'pause', k), /kept for Air/);
  assert.throws(() => rebind({}, 'nope', 'F10'), /no longer exists/);
  assert.throws(() => validMoments([]), /one to six/);
  assert.throws(() => validMoments(['pause', 'timeout', 'replay', 'toast', 'talent', 'poll', 'sponsor']), /one to six/);
  assert.throws(() => validMoments(['layer:scorebug']), /from the list/);
});
