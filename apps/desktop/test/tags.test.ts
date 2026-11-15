import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFor, tagsFor } from '../src/main/production.ts';

test('scorebug tags are short, meaningful and never collide', () => {
  assert.equal(tagFor('Team Alpha'), 'ALP');
  assert.equal(tagFor('Paper Rex'), 'PR');
  assert.equal(tagFor('Fnatic'), 'FNA');
  assert.equal(tagFor('Team Liquid Esports'), 'LIQ');
  assert.equal(tagFor('X'), 'XT');
  assert.deepEqual(tagsFor('Team Alpha', 'Team Bravo'), ['ALP', 'BRA']);
  const [a, b] = tagsFor('Alpha', 'Alpine');
  assert.notEqual(a, b);
  const [c, d] = tagsFor('Sentinels', 'Sentinels Academy');
  assert.notEqual(c, d);
});
