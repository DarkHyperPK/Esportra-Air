const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, validateBindings, eventBinding, matchesBinding } = require('../src/shortcuts');
test('shortcut edits reject conflicts and unsafe keys', () => {
  assert.equal(validateBindings(DEFAULTS).ok, true);
  assert.equal(validateBindings({ ...DEFAULTS, take: 'F1' }).ok, false);
  assert.equal(validateBindings({ ...DEFAULTS, take: 'Alt+F4' }).ok, false);
  assert.equal(validateBindings({ ...DEFAULTS, take: 'Z' }).ok, false);
  assert.equal(validateBindings({ ...DEFAULTS, take: 'Ctrl+Shift+T' }).ok, true);
});
test('modified keys and repeats never fire a plain scene binding', () => {
  assert.equal(eventBinding({ key: 't', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+T');
  assert.equal(matchesBinding({ key: 'F1', ctrlKey: true }, 'F1'), false);
  assert.equal(matchesBinding({ key: 'F1', repeat: true }, 'F1'), false);
  assert.equal(matchesBinding({ key: 'F1' }, 'F1'), true);
});
test('Space, H and S can be assigned while other unmodified letters stay blocked', () => {
  assert.equal(validateBindings({ take: 'Space', hold: 'H', skip: 'S' }).ok, true);
  assert.equal(eventBinding({ key: ' ' }), 'Space');
  assert.equal(validateBindings({ take: 'Z' }).ok, false);
});
