import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { applyEventPatch, engineConfig, newEvent, renewTalentLink, sponsorRotation, upsertSponsor, upsertTalent, validOff } from '../src/main/event-model.ts';
import type { Match } from '../src/shared/api.ts';

test('a person keeps their camera link when other details change, and can get a new one', () => {
  let ev = upsertTalent(newEvent('Cup'), { name: 'Lena Fox', role: 'host', camera: { kind: 'link', linkId: null, obsSource: null } });
  const person = ev.talent[0]!;
  assert.match(person.camera.linkId!, /^[A-Za-z0-9_-]{12}$/);
  ev = upsertTalent(ev, { id: person.id, handle: '@lena' });
  assert.equal(ev.talent[0]!.camera.linkId, person.camera.linkId, 'unchanged by an edit');
  ev = renewTalentLink(ev, person.id);
  assert.notEqual(ev.talent[0]!.camera.linkId, person.camera.linkId, 'a new link replaces the old one');
  ev = upsertTalent(ev, { id: person.id, camera: { kind: 'obs', linkId: null, obsSource: 'Desk cam 2' } });
  assert.deepEqual(ev.talent[0]!.camera, { kind: 'obs', linkId: null, obsSource: 'Desk cam 2' });
  assert.throws(() => upsertTalent(ev, { id: person.id, camera: { kind: 'obs', linkId: null, obsSource: '' } }), /OBS source/);
  assert.throws(() => renewTalentLink(ev, person.id), /does not use a camera link/);
});

test('people and sponsors are checked at the boundary', () => {
  const ev = newEvent('Cup');
  assert.throws(() => upsertTalent(ev, { name: '' }), /Name/);
  assert.throws(() => upsertTalent(ev, { name: 'X', role: 'boss' as never }), /role/);
  assert.throws(() => upsertTalent(ev, { name: 'X', photo: 'file:///etc/passwd' }), /image again/);
  assert.throws(() => upsertTalent(ev, { id: randomUUID(), name: 'X' }), /no longer in this event/);
  assert.throws(() => upsertSponsor(ev, { name: 'Nova', tier: 'platinum' as never }), /tier/);
  assert.throws(() => applyEventPatch(ev, { accent: 'red' }), /accent/);
  assert.deepEqual(applyEventPatch(ev, { stages: ['Groups', 'Groups', 'Final'] }).stages, ['Groups', 'Final']);
  let full = ev;
  for (let i = 0; i < 12; i++) full = upsertTalent(full, { name: `P${i}` });
  assert.throws(() => upsertTalent(full, { name: 'One more' }), /up to 12/);
});

test('switch lists keep only the event’s own ids', () => {
  const a = randomUUID();
  assert.deepEqual(validOff([a, a, randomUUID()], [{ id: a }], 'Talent'), [a]);
  assert.throws(() => validOff(['nope'], [], 'Talent'), /choose again/);
});

test('a title sponsor gets three slots for every supporter slot, spread through the rotation', () => {
  let ev = newEvent('Cup');
  ev = upsertSponsor(ev, { name: 'Kestrel', tier: 'supporter' });
  ev = upsertSponsor(ev, { name: 'Nova', tier: 'title', read: 'Presented by Nova' });
  ev = upsertSponsor(ev, { name: 'Volt', tier: 'partner' });
  const order = sponsorRotation(ev.sponsors).map((s) => s.name);
  assert.deepEqual(order.filter((n) => n === 'NOVA').length, 3);
  assert.deepEqual(order.filter((n) => n === 'VOLT').length, 2);
  assert.deepEqual(order.filter((n) => n === 'KESTREL').length, 1);
  assert.ok(order.every((n, i) => n !== order[i + 1]), `no sponsor twice in a row: ${order.join(', ')}`);
  assert.equal(sponsorRotation(ev.sponsors)[0]!.line !== undefined, true);
});

test('the engine gets the match’s stage, the event’s look and its people in role order', () => {
  let ev = newEvent('Night Cup');
  ev = upsertTalent(ev, { name: 'Omar', role: 'analyst' });
  ev = upsertTalent(ev, { name: 'Sara', role: 'play-by-play' });
  ev = upsertTalent(ev, { name: 'Lena', role: 'host' });
  const off = [ev.talent.find((t) => t.name === 'Lena')!.id];
  const match = { eventId: ev.id, stage: 'Final', bestOf: 3, talentOff: off, sponsorsOff: [] } as unknown as Match;
  const config = engineConfig(match, ev, 'Fallback');
  assert.deepEqual(config.event, { name: 'Night Cup', stage: 'Final', bestOf: 3, logo: '', accent: '#8b7cf6' });
  assert.deepEqual(config.casters.map((c) => c.name), ['Sara', 'Omar'], 'Lena is off for this match');
  const empty = engineConfig({ ...match, talentOff: [] } as Match, null, 'Fallback');
  assert.equal(empty.event.name, 'Fallback');
  assert.equal(empty.casters.length, 2, 'the HUD always gets two caster slots');
});
