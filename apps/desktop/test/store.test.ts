import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, defaults } from '../src/main/store.ts';

test('older saves move event, sponsors and lineups onto each match', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'air-store-')), 'air.json');
  const old = defaults() as any;
  old.setup.brand = { eventName: 'Community Cup', stage: 'Playoffs' };
  old.setup.sponsors = ['Acme'];
  old.matches = [
    { id: 'm1', code: 'Q1234567', kind: 'quick', title: 'A vs B', bestOf: 3, teams: [{ name: 'A', tag: 'A', color: '#fff', logo: '' }, { name: 'B', tag: 'B', color: '#000', logo: '' }], casters: [], createdAt: 1 },
    { id: 'm2', code: 'E1234567', kind: 'esportra', title: 'C vs D', bestOf: 1, teams: [{ name: 'C', tag: 'C', color: '#fff', logo: '' }, { name: 'D', tag: 'D', color: '#000', logo: '' }], casters: [], createdAt: 2, source: { matchId: 'x', tournamentId: 't', tournament: 'Spring Open', scheduledAt: null, lineups: [['P1', 'P2'], ['Q1']] } },
  ];
  writeFileSync(file, JSON.stringify(old));
  const store = new Store(file);
  const [a, b] = store.data.matches;
  assert.deepEqual([a!.game, a!.stage, a!.players], ['valorant', 'Playoffs', [[], []]]);
  const eventA = store.data.events.find((e) => e.id === a!.eventId)!;
  assert.equal(eventA.name, 'Community Cup');
  assert.deepEqual(eventA.sponsors.map((x) => [x.name, x.tier]), [['Acme', 'partner']]);
  const eventB = store.data.events.find((e) => e.id === b!.eventId)!;
  assert.deepEqual([eventB.name, eventB.tournamentId], ['Spring Open', 't'], 'an Esportra match gets its tournament as the event');
  assert.deepEqual(b!.players.map((t) => t.map((p) => p.name)), [['P1', 'P2'], ['Q1']]);
  assert.match(b!.players[0]![0]!.id, /^[0-9a-f-]{36}$/);
});

test('casters and sponsors become the event’s, and each match keeps exactly what it had', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'air-store-')), 'air.json');
  const old = defaults() as any;
  const team = (n: string) => ({ name: n, tag: n, color: '#ffffff', logo: '' });
  const match = (id: string, casters: string[], sponsors: string[], stage = 'Groups') => ({
    id, code: `Q${id}`, kind: 'quick', title: id, bestOf: 1, teams: [team(`${id}a`), team(`${id}b`)], createdAt: 1, game: 'valorant', theme: 'broadcast', players: [[], []],
    casters: casters.map((name) => ({ name, handle: `@${name}` })), event: { name: 'Night Cup', stage }, sponsors,
  });
  old.matches = [match('m1', ['Sara', 'Omar'], ['Nova']), match('m2', ['Sara', 'Lena'], ['Nova', 'Volt'], 'Final')];
  delete old.events;
  writeFileSync(file, JSON.stringify(old));
  const store = new Store(file);
  assert.equal(store.data.events.length, 1, 'both matches share one event');
  const ev = store.data.events[0]!;
  assert.deepEqual(ev.talent.map((t) => [t.name, t.handle, t.role, t.camera.kind]), [['Sara', '@Sara', 'play-by-play', 'none'], ['Omar', '@Omar', 'analyst', 'none'], ['Lena', '@Lena', 'analyst', 'none']]);
  assert.deepEqual(ev.stages, ['Groups', 'Final']);
  const names = (ids: string[], list: Array<{ id: string; name: string }>) => list.filter((x) => !ids.includes(x.id)).map((x) => x.name);
  const [m1, m2] = store.data.matches;
  assert.deepEqual(names(m1!.talentOff, ev.talent), ['Sara', 'Omar']);
  assert.deepEqual(names(m2!.talentOff, ev.talent), ['Sara', 'Lena']);
  assert.deepEqual(names(m1!.sponsorsOff, ev.sponsors), ['Nova']);
  assert.deepEqual(names(m2!.sponsorsOff, ev.sponsors), ['Nova', 'Volt']);
  assert.equal(m2!.stage, 'Final');
  for (const m of store.data.matches) assert.ok(!('casters' in m) && !('sponsors' in m) && !('event' in m), 'the old fields are gone');

  // Saving and loading again changes nothing.
  store.save();
  const again = new Store(file);
  assert.deepEqual(again.data.events, store.data.events);
  assert.deepEqual(again.data.matches, store.data.matches);
});
