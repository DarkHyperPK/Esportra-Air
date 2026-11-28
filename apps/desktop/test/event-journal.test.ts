// The event journal (27 Nov): every lobby change adds a flushed line, and the journal alone rebuilds the results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { EventJournal, replay, resultsOf, verify } from '../src/main/event-journal.ts';
import { Store } from '../src/main/store.ts';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'air-journal-'));
  const store = new Store(join(dir, 'air.json'));
  store.data.events = [{ id: 'ev', name: 'Cup', stages: [], logo: '', logoLight: '', accent: '#ffb60e', talent: [], sponsors: [], tournamentId: null }];
  store.data.teams = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, name: `Team ${i}`, tag: `T${i}`, color: '#ffffff', logo: '' }));
  const journal = new EventJournal(join(dir, 'events'), () => 1_000);
  const logs: string[] = [];
  const lobbies = new Lobbies({ store, journal, patch: async () => {}, live: () => false, log: (t) => logs.push(t), changed: () => {} });
  return { dir, store, journal, lobbies, logs };
}

const rows = (ids: string[], elims = [3, 2, 1, 0]) => ids.map((team, i) => ({ team, place: i + 1, elims: elims[i]! }));

test('every lobby change is a journal line with a growing seq, and the journal rebuilds the results', async () => {
  const { store, journal, lobbies } = setup();
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', title: 'Group A', games: 3 });
  lobbies.setTeams(l.id, ['t0', 't1', 't2', 't3']);
  const ids = lobbies.find(l.id).teams.map((t) => t.id);
  lobbies.setResult(l.id, 1, rows(ids));
  lobbies.setResult(l.id, 2, rows([...ids].reverse()));
  lobbies.setResult(l.id, 2, rows(ids, [0, 0, 5, 5]));
  lobbies.clearResult(l.id, 1);
  lobbies.update(l.id, { title: 'Group A final', games: [{ map: 'Erangel' }, { map: 'Miramar' }, { map: 'Sanhok' }, { map: 'Vikendi' }] });
  const lines = journal.read('ev');
  assert.deepEqual(lines.map((x) => x.kind), ['lobby.create', 'lobby.teams', 'result.set', 'result.set', 'result.set', 'result.clear', 'lobby.update']);
  assert.deepEqual(lines.map((x) => x.seq), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(lines.every((x) => x.eventId === 'ev' && x.at === 1_000 && x.data.lobbyId === l.id));
  assert.ok(readFileSync(journal.file('ev'), 'utf8').endsWith('\n'), 'one line each');
  const now = store.data.lobbies!.filter((x) => x.eventId === 'ev');
  assert.deepEqual(replay(lines).lobbies[l.id]!.results, resultsOf(now[0]!), 'the journal alone gives the results the store holds');
  assert.equal(replay(lines).lobbies[l.id]!.games, 4);
  assert.deepEqual(verify(lines, now), { ok: true, problems: [] });
  // The store drifting from the journal is found.
  now[0]!.games[1]!.results![0]!.elims = 99;
  assert.match(verify(lines, now).problems.join(' '), /game 2 differs/);
});

test('removing a team drops its rows in the replay; deleting a lobby removes it; the adjust hook is recorded and left alone', async () => {
  const { store, journal, lobbies } = setup();
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', games: 2 });
  lobbies.setTeams(l.id, ['t0', 't1', 't2']);
  const ids = lobbies.find(l.id).teams.map((t) => t.id);
  lobbies.setResult(l.id, 1, rows(ids, [1, 1, 1]));
  lobbies.setTeams(l.id, ['t0', 't1']);
  lobbies.noteAdjustment(l.id, { team: ids[0], points: -2, reason: 'Late to the lobby' });
  let lines = journal.read('ev');
  assert.deepEqual(verify(lines, store.data.lobbies!), { ok: true, problems: [] });
  assert.equal(replay(lines).lobbies[l.id]!.results[1]!.length, 2);
  assert.equal(replay(lines).adjustments[0]!.data.reason, 'Late to the lobby');
  lobbies.remove(l.id);
  lines = journal.read('ev');
  assert.deepEqual(Object.keys(replay(lines).lobbies), []);
  assert.equal(lines.at(-1)!.kind, 'lobby.delete');
});

test('a lobby that had results before the journal gets a baseline, so the journal still rebuilds it', async () => {
  const { store, journal, lobbies } = setup();
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', games: 2 });
  lobbies.setTeams(l.id, ['t0', 't1']);
  const ids = lobbies.find(l.id).teams.map((t) => t.id);
  // Results typed "in an older version": put straight in the store, nothing in the journal about them.
  store.data.lobbies![0]!.games[0]!.results = [{ team: ids[0]!, place: 1, elims: 4 }, { team: ids[1]!, place: 2, elims: 2 }];
  const fresh = new EventJournal(join(tmpdir(), `air-j-${Date.now()}`));
  const l2 = new Lobbies({ store, journal: fresh, patch: async () => {}, live: () => false, log: () => {}, changed: () => {} });
  l2.setResult(l.id, 2, [{ team: ids[1]!, place: 1, elims: 1 }, { team: ids[0]!, place: 2, elims: 0 }]);
  const lines = fresh.read('ev');
  assert.deepEqual(lines.map((x) => x.kind), ['lobby.baseline', 'result.set']);
  assert.deepEqual(verify(lines, store.data.lobbies!), { ok: true, problems: [] });
});

test('a half-written last line (a crash) is skipped, and the next line starts on a new line', async () => {
  const { journal, lobbies } = setup();
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', games: 1 });
  appendFileSync(journal.file('ev'), '{"seq":2,"at":1,"kind":"result.s');
  const again = new EventJournal(join(journal.file('ev'), '..', '..'));
  assert.equal(again.read('ev').length, 1);
  again.append('ev', 'lobby.update', { lobbyId: l.id, fields: {} });
  const lines = again.read('ev');
  assert.deepEqual(lines.map((x) => x.seq), [1, 2], 'seq continues after the last complete line');
  assert.equal(readFileSync(again.file('ev'), 'utf8').split('\n').filter(Boolean).length, 3, 'the torn fragment stays on its own line');
});

test('a journal that cannot be written is logged and never stops a result', async () => {
  const { dir, store, lobbies, logs } = setup();
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', games: 1 });
  lobbies.setTeams(l.id, ['t0', 't1']);
  // A journal folder that cannot exist: its parent is a file.
  writeFileSync(join(dir, 'in-the-way'), 'x');
  const broken = new EventJournal(join(dir, 'in-the-way', 'events'));
  const l2 = new Lobbies({ store, journal: broken, patch: async () => {}, live: () => false, log: (t) => logs.push(t), changed: () => {} });
  const ids = l2.find(l.id).teams.map((t) => t.id);
  l2.setResult(l.id, 1, rows(ids, [1, 0]).slice(0, 2));
  assert.equal(l2.find(l.id).games[0]!.results!.length, 2, 'the result is saved');
  assert.ok(logs.some((t) => /Could not write the event journal/.test(t)));
});
