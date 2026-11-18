import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// 17 Nov: every visible text, picture and shape of every graphic (and every HUD and Break sample) can be selected
// on its own in Graphics studio. The audit loads each page and fails on anything no part reaches.
let playwright = true;
try { createRequire(import.meta.url).resolve('playwright'); } catch { playwright = false; }

test('every graphic lets the producer select each thing on it', { skip: !playwright && 'needs Playwright', timeout: 600_000 }, () => {
  const run = spawnSync(process.execPath, [resolve(import.meta.dirname, '../dev/parts-audit.cjs'), '--files'], { encoding: 'utf8', timeout: 590_000 });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`.split('\n').filter((l) => l.startsWith('✗') || l.includes('·') || l.includes('Error')).slice(0, 40).join('\n'));
});
