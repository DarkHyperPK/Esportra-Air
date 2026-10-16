const { test } = require('node:test');
const assert = require('node:assert/strict');
const { graphicPatch } = require('../src/graphic-actions');
test('operator update and poll use the existing HUD fields and validated plain text', () => {
  assert.deepEqual(graphicPatch('toast', { text: 'Back in two minutes' }, 1000), { toast: { text: 'Back in two minutes', ts: 1000 } });
  const poll = graphicPatch('poll', { question: 'Who wins?', options: ['North', 'South'], firstPercent: 62 });
  assert.deepEqual(poll.poll.options.map(option => option.pct), [62, 38]);
  assert.equal(poll.show.poll, true); assert.equal(graphicPatch('hide-poll').show.poll, false);
  for (const input of [{ question: '<img>', options: ['North', 'South'], firstPercent: 50 }, { question: 'Winner?', options: ['North', 'North'], firstPercent: 50 }, { question: 'Winner?', options: ['A', 'B'], firstPercent: 101 }]) assert.throws(() => graphicPatch('poll', input));
});
