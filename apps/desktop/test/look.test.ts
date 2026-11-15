import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOOK, lookOf, validLook } from '../src/shared/look.ts';

test('the scorebug window, pause and break looks: defaults, partial changes and limits', () => {
  assert.deepEqual(lookOf(undefined), DEFAULT_LOOK);
  const moved = validLook({ timer: { ...DEFAULT_LOOK.timer, dx: -12 } }, DEFAULT_LOOK);
  assert.deepEqual([moved.timer.dx, moved.timer.width, moved.pause], [-12, 160, 'box']);
  assert.equal(validLook({ break: 'frame' }, moved).timer.dx, -12, 'a change keeps the rest');
  assert.throws(() => validLook({ timer: { ...DEFAULT_LOOK.timer, width: 40 } }, DEFAULT_LOOK), /100–240/);
  assert.throws(() => validLook({ timer: { ...DEFAULT_LOOK.timer, plate: 'red' } }, DEFAULT_LOOK), /#17181e/);
  assert.throws(() => validLook({ break: 'wavy' as never }, DEFAULT_LOOK), /classic break or the frame/);
});
