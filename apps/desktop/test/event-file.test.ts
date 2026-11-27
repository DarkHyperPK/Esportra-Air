// Event files (27 Nov): export on one store, open on a fresh one, and the same lobbies, results, teams, players and pictures arrive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { EventFiles, parseEventFile, type AssetStore } from '../src/main/event-files.ts';
import { EventJournal, resultsOf, verify } from '../src/main/event-journal.ts';
import { Store } from '../src/main/store.ts';

const LOGO = '5b2f6f8e-1111-4222-8333-444455556666';
const PHOTO = '9c1d0a77-aaaa-4bbb-8ccc-ddddeeeeffff';
const png = (n: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, n)]);

function memoryAssets(initial: Record<string, Buffer> = {}): AssetStore & { files: Map<string, Buffer> } {
  const files = new Map(Object.entries(initial));
  return { files, get: async (id) => files.get(id) ?? null, put: async (id, b) => void files.set(id, b) };
}

function pc(name: string, assets = memoryAssets(), options: { live?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `air-${name}-`));
  const store = new Store(join(dir, 'air.json'));
  const journal = new EventJournal(join(dir, 'events'));
  const logs: string[] = [];
  const lobbies = new Lobbies({ store, journal, patch: async () => {}, live: () => false, log: (t) => logs.push(t), changed: () => {} });
  let selected: string | null = null;
  const files = new EventFiles({ store, assets, journal, selectedEventId: () => selected, live: () => !!options.live, imported: async () => {}, version: 'test', changed: () => {}, log: (t) => logs.push(t), debounceMs: 15 });
  return { dir, store, journal, lobbies, files, assets, logs, select: (id: string | null) => { selected = id; } };
}

async function seeded() {
  const a = pc('a', memoryAssets({ [LOGO]: png(1), [PHOTO]: png(2) }));
  a.store.data.events = [{ id: 'ev', name: 'Spring Cup: Finals', stages: ['Groups'], logo: `/air-assets/${LOGO}`, logoLight: '', accent: '#ffb60e', talent: [], sponsors: [], tournamentId: null }];
  a.store.data.teams = [0, 1, 2].map((i) => ({ id: `t${i}`, name: `Team ${i}`, tag: `T${i}`, color: '#ffffff', logo: i === 0 ? `/air-assets/${LOGO}` : '' }));
  a.store.data.players = [{ id: 'p1', name: 'Ace', realName: '', gameId: 'Ace', photo: `/air-assets/${PHOTO}`, role: '', teamId: 't0' }, { id: 'p2', name: 'Bee', realName: '', gameId: 'Bee', photo: '', role: '', teamId: 't1' }, { id: 'p9', name: 'Other', realName: '', gameId: '', photo: '', role: '', teamId: 't9' }];
  const l = await a.lobbies.create({ eventId: 'ev', game: 'pubgm', title: 'Group A', games: 3, maps: ['Erangel', 'Miramar'] });
  a.lobbies.setTeams(l.id, ['t0', 't1', 't2']);
  const ids = a.lobbies.find(l.id).teams.map((t) => t.id);
  a.lobbies.setResult(l.id, 1, ids.map((team, i) => ({ team, place: i + 1, elims: 5 - i })));
  a.lobbies.setResult(l.id, 2, [...ids].reverse().map((team, i) => ({ team, place: i + 1, elims: i })));
  // A match with a map record, its Rundown and match data.
  a.store.data.matches = [{ id: 'm1', code: 'QAAAAAAA', kind: 'quick', title: 'A vs B', bestOf: 3, teams: [{ name: 'A', tag: 'A', color: '#fff', logo: '' }, { name: 'B', tag: 'B', color: '#000', logo: '' }], createdAt: 1, game: 'valorant', players: [[], []], teamIds: [null, null], eventId: 'ev', stage: 'Groups', talentOff: [], sponsorsOff: [], theme: 'broadcast' } as never];
  a.store.data.mapRecords = { m1: [{ map: 'Lotus' } as never], other: [{ map: 'x' } as never] };
  a.store.data.matchData = { m1: { bestOf: 3 } as never };
  a.store.data.eventData = { ev: { ticker: ['Welcome'] } as never };
  a.store.save();
  return { a, lobbyId: l.id, ids };
}

test('an event file carries the lobbies, results, teams, players, pictures and journal; a fresh PC gets the same results', async () => {
  const { a, lobbyId } = await seeded();
  const path = join(a.dir, 'out', 'Spring Cup Finals.airevent');
  const saved = await a.files.save('ev', path);
  assert.deepEqual(saved.counts, { matches: 1, lobbies: 1, results: 3, teams: 3, players: 2, pictures: 2 }, 'only the teams and players the event uses; 2 lobby results + 1 map record');
  assert.equal(saved.missingPictures, 0);
  assert.deepEqual(saved.journalProblems, []);
  assert.equal(a.files.defaultFileName('ev'), 'Spring Cup Finals.airevent');
  const bundle = parseEventFile(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(bundle.mapRecords), ['m1'], 'map records of other matches stay out');
  assert.ok(bundle.journal.length >= 4);

  const b = pc('b');
  const check = b.files.check(readFileSync(path, 'utf8'));
  assert.equal(check.name, 'Spring Cup: Finals');
  assert.deepEqual(check.counts, saved.counts);
  assert.equal(check.exists, false);
  assert.deepEqual(check.problems, []);
  assert.equal(b.store.data.events.length, 0, 'checking changes nothing');
  const done = await b.files.confirm(check.token, 'copy');
  assert.equal(done.eventId, 'ev', 'a new event keeps its ids');
  const mine = b.store.data.lobbies![0]!;
  assert.equal(mine.id, lobbyId);
  assert.deepEqual(resultsOf(mine), resultsOf(a.store.data.lobbies![0]!), 'same results');
  assert.deepEqual(b.store.data.teams!.map((t) => t.id).sort(), ['t0', 't1', 't2']);
  assert.deepEqual(b.store.data.players!.map((p) => p.id).sort(), ['p1', 'p2']);
  assert.deepEqual(b.store.data.mapRecords!.m1, a.store.data.mapRecords!.m1);
  assert.deepEqual(b.store.data.eventData!.ev, a.store.data.eventData!.ev);
  assert.ok(b.assets.files.get(LOGO)!.equals(png(1)) && b.assets.files.get(PHOTO)!.equals(png(2)), 'pictures arrive byte for byte');
  assert.equal(verify(b.journal.read('ev'), b.store.data.lobbies!.filter((l) => l.eventId === 'ev')).ok, true, 'the journal on the new PC rebuilds the same results');
  assert.equal(b.journal.read('ev').at(-1)!.kind, 'event.import');
  assert.equal(new Store(join(b.dir, 'air.json')).data.lobbies![0]!.id, lobbyId, 'and it is saved');
});

test('the same event on this PC: a copy gets new ids and changes nothing here; Replace swaps it', async () => {
  const { a, lobbyId } = await seeded();
  const text = (await a.files.render('ev')).text;
  const before = JSON.stringify(a.store.data.lobbies);
  const check = a.files.check(text);
  assert.equal(check.exists, true);
  assert.equal(check.existing?.lobbies, 1);
  const copy = await a.files.confirm(check.token, 'copy');
  assert.notEqual(copy.eventId, 'ev');
  assert.equal(a.store.data.events.length, 2);
  assert.equal(a.store.data.events.find((e) => e.id === copy.eventId)!.name, 'Spring Cup: Finals (copy)');
  assert.equal(JSON.stringify(a.store.data.lobbies!.filter((l) => l.eventId === 'ev')), before, 'the original lobbies are untouched');
  const lobbyCopy = a.store.data.lobbies!.find((l) => l.eventId === copy.eventId)!;
  assert.notEqual(lobbyCopy.id, lobbyId);
  assert.notEqual(lobbyCopy.code, a.store.data.lobbies![0]!.code);
  assert.deepEqual(resultsOf(lobbyCopy), resultsOf(a.store.data.lobbies![0]!));
  const matchCopy = a.store.data.matches.find((m) => m.eventId === copy.eventId)!;
  assert.notEqual(matchCopy.id, 'm1');
  assert.ok(a.store.data.mapRecords![matchCopy.id] && a.store.data.matchData![matchCopy.id] && a.store.data.eventData![copy.eventId]);
  assert.equal(verify(a.journal.read(copy.eventId), [lobbyCopy]).ok, true, 'the copy has its own journal, under its own ids');
  assert.equal(a.store.data.teams!.length, 3, 'teams are shared, not duplicated');

  // Replace: the event here is swapped for the file's (a result typed since the file was saved is gone).
  a.lobbies.clearResult(lobbyId, 1);
  const again = a.files.check(text);
  const done = await a.files.confirm(again.token, 'replace');
  assert.equal(done.eventId, 'ev');
  assert.equal(a.store.data.lobbies!.filter((l) => l.eventId === 'ev').length, 1, 'replaced, not doubled');
  assert.equal(a.store.data.lobbies!.find((l) => l.id === lobbyId)!.games[0]!.results!.length, 3, 'game 1 is back as the file had it');
  assert.equal(a.store.data.matches.filter((m) => m.eventId === 'ev').length, 1);
  assert.ok(readdirSync(join(a.dir, 'events', 'ev')).some((f) => f.startsWith('journal.ndjson.replaced-')), 'the journal it replaced is kept aside');
});

test('Replace is refused while a show is live; bad files are refused in plain words', async () => {
  const { a } = await seeded();
  const text = (await a.files.render('ev')).text;
  const live = pc('live', memoryAssets(), { live: true });
  const first = live.files.check(text);
  await live.files.confirm(first.token, 'copy');
  const again = live.files.check(text);
  await assert.rejects(() => live.files.confirm(again.token, 'replace'), /live/);
  assert.equal(live.store.data.events.length, 1, 'nothing changed');
  assert.throws(() => a.files.check('{"nope"'), /not an Esportra Air event file/);
  assert.throws(() => a.files.check(JSON.stringify({ format: 'something-else' })), /not an Esportra Air event file/);
  assert.throws(() => a.files.check(text.replace('"version":1', '"version":9')), /newer Esportra Air/);
  const evil = JSON.parse(text);
  evil.assets['not-an-id'] = { type: 'image/png', base64: 'AAAA' };
  assert.throws(() => a.files.check(JSON.stringify(evil)), /picture in that file is damaged/);
  const notPng = JSON.parse(text);
  notPng.assets[LOGO] = { type: 'image/png', base64: Buffer.from('<script>alert(1)</script>').toString('base64') };
  assert.throws(() => a.files.check(JSON.stringify(notPng)), /not a picture or font/);
  await assert.rejects(() => a.files.confirm('stale-token', 'copy'), /Open the event file again/);
});

test('a missing picture is counted, not fatal; the restore check says what the file lacks', async () => {
  const { a } = await seeded();
  a.assets.files.delete(PHOTO);
  const saved = await a.files.save('ev', join(a.dir, 'x.airevent'));
  assert.equal(saved.missingPictures, 1);
  assert.equal(saved.counts.pictures, 1);
  const check = pc('c').files.check(readFileSync(join(a.dir, 'x.airevent'), 'utf8'));
  assert.match(check.problems.join(' '), /1 picture used by the event is not in the file/);
});

test('the auto-backup folder gets the selected event\'s file after a change, once things settle', async () => {
  const { a } = await seeded();
  const folder = join(a.dir, 'Backups here');
  a.select('ev');
  a.files.setFolder(folder);
  await new Promise((r) => setTimeout(r, 120));
  const file = readdirSync(folder).find((f) => f.endsWith('.airevent'));
  assert.ok(file, 'written without being asked');
  assert.match(file!, /^Spring Cup Finals [0-9a-z]{2,6}\.airevent$/);
  const first = readFileSync(join(folder, file!), 'utf8');
  assert.equal(parseEventFile(first).lobbies[0]!.games.filter((g) => g.results?.length).length, 2);
  // Another result is saved: three saves in a burst make one write, with the new result in it.
  const lobby = a.store.data.lobbies![0]!;
  a.lobbies.setResult(lobby.id, 3, lobby.teams.map((t, i) => ({ team: t.id, place: i + 1, elims: 0 })));
  a.store.save(); a.store.save();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(parseEventFile(readFileSync(join(folder, file!), 'utf8')).lobbies[0]!.games.filter((g) => g.results?.length).length, 3);
  assert.equal(a.files.view().error, null);
  assert.ok(a.files.view().lastAt);
  a.files.setFolder(null);
  a.files.stop();
  assert.equal(a.files.view().folder, null);
  assert.ok(existsSync(folder));
  assert.equal(await a.files.backupNow(), null, 'off means off');
  writeFileSync(join(a.dir, 'unused'), '');
});
