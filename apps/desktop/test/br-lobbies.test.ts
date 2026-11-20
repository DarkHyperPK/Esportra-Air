// Lobbies: created for a battle royale game, teams follow Teams/Players, results put the standings in the room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { Store } from '../src/main/store.ts';

function setup(live = false) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'lobby-')), 'air.json'));
  store.data.events = [{ id: 'ev', name: 'Cup', stages: [], logo: '', logoLight: '', accent: '#ffb60e', talent: [], sponsors: [], tournamentId: null }];
  store.data.teams = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, name: `Team ${i}`, tag: `T${i}`, color: '#ffffff', logo: '' }));
  store.data.players = [{ id: 'p1', name: 'Ace', realName: '', gameId: 'AceInGame', photo: '', role: '', teamId: 't0' }];
  const patches: Array<{ code: string; fields: any }> = [];
  const logs: string[] = [];
  const lobbies = new Lobbies({ store, patch: async (code, fields) => void patches.push({ code, fields }), live: () => live, log: (t) => logs.push(t), changed: () => {} });
  return { store, lobbies, patches, logs };
}

test('a lobby is for a battle royale game; its teams follow Teams/Players', async () => {
  const { store, lobbies } = setup();
  await assert.rejects(() => lobbies.create({ eventId: 'ev', game: 'valorant' }), /battle royale/);
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', title: 'Group A', games: 3, maps: ['Erangel', 'Miramar'] });
  assert.deepEqual(l.games.map((g) => g.map), ['Erangel', 'Miramar', '']);
  assert.deepEqual(l.scoring.placement.slice(0, 3), [10, 6, 5], 'PUBG MOBILE starts from PMGC scoring');
  lobbies.setTeams(l.id, ['t0', 't1', 't2', 't3']);
  assert.deepEqual(lobbies.find(l.id).teams[0]!.players, ['AceInGame']);
  store.data.teams![0]!.name = 'Renamed';
  lobbies.refresh();
  assert.equal(lobbies.find(l.id).teams[0]!.name, 'Renamed');
});

test('saving a result puts the standings in the selected lobby room; a cleared game drops out', async () => {
  const { lobbies, patches, logs } = setup();
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', games: 2 });
  lobbies.setTeams(l.id, ['t0', 't1', 't2']);
  const [a, b, c] = lobbies.find(l.id).teams.map((t) => t.id);
  lobbies.setResult(l.id, 1, [{ team: a, place: 2, elims: 6 }, { team: b, place: 1, elims: 1 }, { team: c, place: 3, elims: 0 }]);
  await new Promise((r) => setTimeout(r, 0));
  const last = patches.at(-1)!;
  assert.equal(last.code, l.code);
  assert.deepEqual(last.fields.br.standings.map((s: any) => [s.team, s.total]), [[a, 12], [b, 11], [c, 5]]);
  assert.equal(last.fields.br.current, 2);
  assert.match(logs.at(-1)!, /Team 0 leads on 12/);
  assert.throws(() => lobbies.setResult(l.id, 2, [{ team: a, place: 1, elims: 0 }, { team: b, place: 1, elims: 0 }]), /both in place 1/);
  lobbies.clearResult(l.id, 1);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(patches.at(-1)!.fields.br.played, 0);
});

test('a live lobby cannot be deleted', async () => {
  const { lobbies } = setup(true);
  const l = await lobbies.create({ eventId: 'ev', game: 'freefire' });
  assert.equal(l.scoring.placement[0], 12, 'Free Fire starts from FFWS scoring');
  assert.throws(() => lobbies.remove(l.id), /live/);
});
