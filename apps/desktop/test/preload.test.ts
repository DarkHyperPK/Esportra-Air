import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The interface reaches the app only through the methods the preload lists (window.air). A method the app
// handles but the preload leaves out works on the dev host (HTTP) and fails in the real app ("is not a
// function"), as uploadArtwork did on 17 Nov. Both lists must match.
test('every app method is reachable from the interface, and nothing else is', () => {
  const api = readFileSync(resolve(import.meta.dirname, '../src/main/api.ts'), 'utf8');
  const preload = readFileSync(resolve(import.meta.dirname, '../src/preload/index.ts'), 'utf8');
  const handled = new Set([...api.matchAll(/case '([a-zA-Z]+)'/g)].map((m) => m[1]!));
  const list = preload.slice(preload.indexOf('const METHODS'), preload.indexOf('];'));
  const exposed = new Set([...list.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!));
  assert.deepEqual([...handled].filter((m) => !exposed.has(m)), [], 'handled by the app but missing from the preload');
  assert.deepEqual([...exposed].filter((m) => !handled.has(m)), [], 'in the preload but not handled by the app');
});
