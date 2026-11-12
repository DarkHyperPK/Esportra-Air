import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANUAL, fill, manualHtml } from '../src/shared/manual.ts';
import { rebind } from '../src/shared/keymap.ts';

test('the manual is written for the producer and shows this PC’s keys', () => {
  const html = manualHtml({}, 'Valorant');
  for (const s of MANUAL) assert.ok(html.includes(`<h2>${s.title.replace(/&/g, '&amp;')}</h2>`), s.title);
  assert.doesNotMatch(html, /\{key:|\{game\}/, 'every placeholder is filled');
  assert.doesNotMatch(html, /overwolf|\bgep\b|websocket|\bengine\b|ingest|vdo\.ninja/i, 'no vendor or internal words');
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script|<link|src=/, 'one self-contained document');
  const mine = rebind({}, 'pause', 'F10');
  assert.match(fill('Press {key:pause}.', mine, 'Valorant'), /Press F10\./);
  assert.match(manualHtml(mine, 'Valorant'), /Tech pause<\/td><td class="k">F10/);
  assert.match(manualHtml({}, 'Valorant'), /For Valorant, each player/);
});
