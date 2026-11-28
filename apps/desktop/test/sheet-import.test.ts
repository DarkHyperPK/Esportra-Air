import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store.ts';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { SheetImporter } from '../src/main/sheet-import.ts';
import { buildImport, guessColumns, matchPictures, parseDelimited, readSheet, roleOf, stemOf, type PicFile } from '../src/shared/sheet-import.ts';
import { cleanUid } from '../src/shared/uid.ts';

// Import teams and players (28 Nov). All names are made up.
const LAYOUT = 'Team ID,Team Name,Team Tag,Group,Team Logo URL,Player ID,Player IGN,Role,UID';
const row = (team: string, tag: string, ign: string, uid: string, role = 'Player', logo = '') => `T1,${team},${tag},Group A,${logo},P1,${ign},${role},${uid}`;
const empty = { teams: [], players: [] };

test('headers: the made-up registration layout is read, and Team ID and Player ID are not mistaken for UID', () => {
  const m = guessColumns(LAYOUT.split(','));
  assert.deepEqual(m, { team: 1, tag: 2, group: 3, ign: 6, uid: 8, role: 7, logo: 4, photo: null });
  // Other ways people write the same headers.
  assert.deepEqual(guessColumns(['Squad', 'Abbr', 'In-game name', 'Character ID', 'Position', 'Photo file']), { team: 0, tag: 1, group: null, ign: 2, uid: 3, role: 4, logo: null, photo: 5 });
  assert.equal(guessColumns(['Team', 'Player', 'ID']).uid, 2, 'a plain ID column is the UID when nothing else says UID');
  assert.equal(guessColumns(['Team', 'Player', 'Player ID', 'UID']).uid, 3, 'but an explicit UID column wins');
  assert.equal(guessColumns(['TeamName', 'PlayerName', 'Logo']).logo, 2);
});

test('reading: CSV with quotes, semicolons, pasted tabs, a header guess, and rows left blank', () => {
  assert.deepEqual(parseDelimited('a,b\n"x, y",2\n\n'), [['a', 'b'], ['x, y', '2']]);
  assert.deepEqual(parseDelimited('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseDelimited('a\tb\r\n1\t2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseDelimited('﻿x,"he said ""hi"""\n'), [['x', 'he said "hi"']]);
  assert.equal(readSheet(`${LAYOUT}\n${row('Night Owls', 'NWL', 'Juno', '5031945047')}`).hasHeader, true);
  const noHeader = readSheet('Night Owls,Juno,5031945047');
  assert.equal(noHeader.hasHeader, false);
  assert.equal(noHeader.rows.length, 1);
});

test('UIDs: digits only; spreadsheet damage is named', () => {
  assert.deepEqual(cleanUid(' 5031945047 '), { uid: '5031945047', problem: null });
  assert.equal(cleanUid('5031945047.0').uid, '5031945047');
  assert.match(cleanUid('5.03E+09').problem ?? '', /turned this id into a number/);
  assert.match(cleanUid('50A3').problem ?? '', /only digits/);
  assert.match(cleanUid('123').problem ?? '', /5 to 20 digits/);
  assert.deepEqual(cleanUid(''), { uid: '', problem: null });
});

test('roles: the words people use, and the ones Air does not know', () => {
  assert.deepEqual(['IGL', 'captain', 'player', 'Substitute', 'Coach', ''].map(roleOf), ['IGL', 'IGL', 'Player', 'Sub', 'Coach', '']);
  assert.equal(roleOf('wizard'), null);
});

const SAMPLE = [LAYOUT,
  row('Night Owls', 'NWL', 'Juno', '5031945047', 'IGL'), row('Night Owls', 'NWL', 'Mira', '5034599482'), row('Night Owls', 'NWL', 'Dax', '5037253917'), row('Night Owls', 'NWL', 'Riku', '5039908352'),
  row('Pale Horse', 'PHS', 'Mortis', '5085033747', 'IGL'), row('Pale Horse', 'PHS', 'Pestis', '5087688182'), row('Pale Horse', 'PHS', 'Bellum', '5090342617'),
  row('Neon Vipers', 'NVP', 'Zeno', '5092997052', 'IGL'), row('Neon Vipers', 'NVP', 'Volt', '5095651487'), row('Neon Vipers', 'NVP', 'Arc', '5098305922'), row('Neon Vipers', 'NVP', 'Spark', '5100960357'),
  row('Dusk Raiders', 'DSK', 'Zeno', '5175284537', 'IGL'), row('Dusk Raiders', 'DSK', 'Nightjar', '5177938972'), row('Dusk Raiders', 'DSK', 'Gloam', '5180593407'), row('Dusk Raiders', 'DSK', 'Vesper', '5183247842'),
  row('Ash Syndicate', 'ASH', 'Cairn', '5103614792', 'IGL'), row('Ash Syndicate', 'ASH', 'Karn', ''), row('Ash Syndicate', 'ASH', 'Soot', '5106269227'), row('Ash Syndicate', 'ASH', 'Embers', '5.1E+09'), row('Ash Syndicate', 'ASH', 'Ward', '5110000001', 'Coach'),
].join('\n');

test('checks: new or updates a saved team, fewer than 4 players, duplicate names, missing and bad UIDs, coaches not counted', () => {
  const sheet = readSheet(SAMPLE);
  const lib = { teams: [{ id: 'lt', name: 'NIGHT OWLS', tag: 'XXX', color: '#fff', logo: '' }, { id: 'lt2', name: 'Pale Horse FC', tag: 'PHS', color: '#fff', logo: '' }], players: [] };
  const p = buildImport(sheet, guessColumns(sheet.headers), lib);
  assert.equal(p.blocked, null);
  assert.equal(p.teams.length, 5);
  const t = (n: string) => p.teams.find((x) => x.name === n)!;
  assert.equal(t('Night Owls').status, 'update', 'matched by name, whatever the case');
  assert.equal(t('Night Owls').libraryId, 'lt');
  assert.equal(t('Pale Horse').status, 'update', 'matched by tag when the name differs');
  assert.equal(t('Neon Vipers').status, 'new');
  assert.deepEqual(t('Night Owls').checks, []);
  assert.deepEqual(t('Pale Horse').checks.map((c) => c.id), ['few-players']);
  assert.equal(t('Pale Horse').counted, 3);
  // Zeno is in two teams: both are flagged, and each says where the other is.
  const zeno = t('Neon Vipers').players.find((x) => x.ign === 'Zeno')!;
  assert.match(zeno.checks.find((c) => c.id === 'ign-duplicate')!.text, /Dusk Raiders/);
  assert.ok(t('Dusk Raiders').checks.some((c) => c.id === 'ign-duplicate'));
  // Ash Syndicate: Karn has no UID, Embers' UID was ruined by the sheet, the coach needs none and is not counted.
  const ash = t('Ash Syndicate');
  assert.equal(ash.counted, 4);
  assert.equal(ash.players.length, 5);
  assert.ok(ash.players.find((x) => x.ign === 'Karn')!.checks.some((c) => c.id === 'uid-missing'));
  assert.ok(ash.players.find((x) => x.ign === 'Embers')!.checks.some((c) => c.id === 'uid-invalid'));
  assert.deepEqual(ash.players.find((x) => x.ign === 'Ward')!.checks, []);
  assert.deepEqual(ash.checks.map((c) => c.id).sort(), ['uid-missing', 'uid-problem']);
  assert.deepEqual(p.counts, { all: 5, needs: 4, added: 3, updates: 2 });
});

test('checks: the same UID twice, and a team named once above its players', () => {
  const sheet = readSheet('Team,Player,UID\nOwls,Juno,5031945047\n,Mira,5031945047\n,Dax,5037253917');
  const lib = { teams: [{ id: 'lt', name: 'Owls', tag: 'OWL', color: '#fff', logo: '' }], players: [{ id: 'pl', name: 'Stranger', realName: '', gameId: 'Stranger', photo: '', role: '', teamId: null, uid: '5037253917' }, { id: 'pj', name: 'Juno', realName: '', gameId: 'Juno', photo: '', role: '', teamId: 'lt' }] };
  const p = buildImport(sheet, guessColumns(sheet.headers), lib);
  assert.equal(p.teams.length, 1, 'rows under the first line belong to its team');
  const [juno, mira, dax] = p.teams[0]!.players;
  assert.ok(juno!.checks.some((c) => c.id === 'uid-duplicate') && mira!.checks.some((c) => c.id === 'uid-duplicate'));
  assert.ok(!dax!.checks.some((c) => c.id === 'uid-duplicate'), 'a UID someone else holds only matters when it is not the same person');
  assert.equal(buildImport(sheet, { ...guessColumns(sheet.headers), team: null }, empty).blocked, 'Choose the column with the team names.');
});

// ── pictures ──
const file = (id: string, path: string, hash: string): PicFile => ({ id, path, name: path.split('/').pop()!, hash });

test('pictures: logos by name, tag or the sheet’s file name; photos by IGN with case and symbols ignored; a shared picture is no photo', () => {
  const files = [
    file('1', 'logos/Night_Owls.PNG', 'h1'), file('2', 'logos/crf.png', 'h2'), file('3', 'photos/J.U.N.O.jpg', 'h3'), file('4', 'photos/mira.jpg', 'h4'),
    file('5', 'photos/default.jpg', 'hd'), file('6', 'static_noise_final_v2.png', 'h6'), file('7', 'photos/dax copy.jpg', 'hd'), file('8', 'night-owls-alt.png', 'h8'),
  ];
  const want = {
    teams: [{ key: 'a', name: 'Night Owls', tag: 'NWL', hint: '' }, { key: 'b', name: 'Crimson Five', tag: 'CRF', hint: '' }, { key: 'c', name: 'Static Noise', tag: 'STN', hint: 'https://cdn.example/x/missing.png?v=2' }, { key: 'd', name: 'Hollow Point', tag: 'HOP', hint: '' }],
    players: [
      { key: 'p1', team: 'a', ign: 'Juno', hint: '' }, { key: 'p2', team: 'a', ign: 'Mira', hint: '' }, { key: 'p3', team: 'a', ign: 'Dax', hint: 'default.jpg' }, { key: 'p4', team: 'a', ign: 'Riku', hint: 'default.jpg' }, { key: 'p5', team: 'a', ign: 'Nobody', hint: '' },
    ],
  };
  const m = matchPictures(files, want);
  assert.deepEqual(m.logos, { a: '1', b: '2' });
  assert.deepEqual(m.photos, { p1: '3', p2: '4' }, 'Dax and Riku point at one picture: no photo for either');
  assert.equal(m.shared.length, 1);
  assert.deepEqual(m.shared[0]!.keys.sort(), ['p3', 'p4']);
  assert.deepEqual(m.unmatchedPhotos, ['p5']);
  assert.deepEqual(m.unmatchedLogos.map((u) => u.key), ['c', 'd']);
  assert.equal(m.unmatchedLogos[0]!.closest, 'static_noise_final_v2.png', 'a close file is offered, never used by itself');
  assert.equal(m.unmatchedLogos[1]!.closest, null);
  // Keeping the shared picture, and choosing the close file for Static Noise.
  const m2 = matchPictures(files, want, { c: '6' }, true);
  assert.equal(m2.photos.p3, '5');
  assert.equal(m2.photos.p4, '5');
  assert.equal(m2.logos.c, '6');
  assert.equal(stemOf('https://x/y/Night%20Owls.PNG?x=1'), 'nightowls');
  // The same bytes under two different names are also one picture.
  const twin = matchPictures([file('1', 'a.jpg', 'same'), file('2', 'b.jpg', 'same')], { teams: [], players: [{ key: 'x', team: 't', ign: 'A', hint: '' }, { key: 'y', team: 't', ign: 'B', hint: '' }] });
  assert.deepEqual(twin.photos, {});
});

// ── the folder and the save ──
const PNG = (n: number) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(String(n))]);

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
  const store = new Store(join(dir, 'air.json'));
  store.data.events = [{ id: 'ev', name: 'Cup', stages: [], logo: '', logoLight: '', accent: '#ffb60e', talent: [], sponsors: [], tournamentId: null }];
  store.data.teams = [{ id: 'saved', name: 'Night Owls', tag: 'NWL', color: '#123456', logo: '' }];
  store.data.players = [{ id: 'old', name: 'Juno', realName: 'J. Made-up', gameId: 'Juno', photo: '', role: '', teamId: 'saved' }];
  const stored: Buffer[] = [];
  const lobbies = new Lobbies({ store, patch: async () => {}, live: () => false, log: () => {}, changed: () => {} });
  const importer = new SheetImporter({
    store, lobbies, game: () => 'pubgm', log: () => {},
    storeImage: async (raw) => { stored.push(raw); return `/air-assets/img-${stored.length}`; },
    libraryChanged: async () => { lobbies.refresh(); store.save(); },
  });
  return { dir, store, lobbies, importer, stored };
}

test('import: scans a folder and its folders, copies only what belongs, keeps no path, saves teams and players', async () => {
  const { dir, store, lobbies, importer, stored } = await setup();
  const pics = join(dir, 'media');
  mkdirSync(join(pics, 'logos'), { recursive: true }); mkdirSync(join(pics, 'photos', 'deep'), { recursive: true });
  writeFileSync(join(pics, 'logos', 'night owls.png'), PNG(1));
  writeFileSync(join(pics, 'logos', 'NVP.png'), PNG(2));
  writeFileSync(join(pics, 'photos', 'Juno.png'), PNG(3));
  writeFileSync(join(pics, 'photos', 'deep', 'MIRA.jpg'), PNG(4));
  writeFileSync(join(pics, 'photos', 'zeno.png'), PNG(5));
  writeFileSync(join(pics, 'photos', 'volt.png'), PNG(5), { flag: 'w' }); // same bytes as zeno
  writeFileSync(join(pics, 'unrelated.png'), PNG(6));
  writeFileSync(join(pics, 'notes.txt'), 'not a picture');
  const sheet = readSheet(SAMPLE);
  const preview = buildImport(sheet, guessColumns(sheet.headers), { teams: store.data.teams!, players: store.data.players! });
  const wanted = { teams: preview.teams.map((t) => ({ key: t.key, name: t.name, tag: t.tag, hint: t.logoHint })), players: preview.teams.flatMap((t) => t.players.map((p) => ({ key: p.key, team: t.name, ign: p.ign, hint: p.photoHint }))) };
  await assert.rejects(importer.pictures({ folder: join(dir, 'nope'), wanted }), /cannot be opened/);
  const scan = (await importer.pictures({ folder: pics, wanted }))!;
  assert.equal(scan.files, 7, 'seven pictures, the text file is ignored');
  assert.deepEqual([scan.logos.found, scan.logos.of], [2, 5]);
  assert.equal(scan.photos.found, 2, 'Juno and Mira; both Zenos and Volt share one picture');
  assert.equal(scan.shared[0]!.keys.length, 3);
  assert.equal(scan.shared.length, 1);
  assert.ok(Object.values(scan.photoFiles).some((p) => /MIRA\.jpg$/.test(p)), 'folders inside are searched');
  const again = (await importer.pictures({ token: scan.token, wanted, useShared: true }))!;
  assert.equal(again.photos.found, 5, 'Use it anyway keeps the shared picture');
  const result = await importer.import({
    teams: preview.teams.map((t) => ({ key: t.key, name: t.name, tag: t.tag, group: t.group, players: t.players.map((p) => ({ key: p.key, ign: p.ign, uid: p.uid, role: p.role, photoHint: p.photoHint })) })),
    target: { kind: 'groups', eventId: 'ev' }, pictures: { token: scan.token },
  });
  assert.deepEqual(result.teams, { created: 4, updated: 1 });
  assert.equal(result.players.updated, 1, 'Juno was already saved on Night Owls');
  assert.equal(result.players.created, preview.players - 1);
  assert.equal(result.pictures.logos, 2);
  assert.equal(result.pictures.photos, 2);
  assert.equal(stored.length, 4, 'only the pictures that belong to someone were copied, once each');
  const lib = store.data;
  const owls = lib.teams!.find((t) => t.id === 'saved')!;
  assert.equal(owls.color, '#123456', 'a saved team keeps its colour');
  assert.ok(owls.logo.startsWith('/air-assets/'));
  const juno = lib.players!.find((p) => p.id === 'old')!;
  assert.equal(juno.uid, '5031945047');
  assert.equal(juno.role, 'IGL');
  assert.equal(juno.realName, 'J. Made-up', 'what the sheet does not carry is kept');
  assert.ok(juno.photo.startsWith('/air-assets/'));
  assert.equal(lib.players!.filter((p) => p.gameId === 'Zeno').length, 2, 'the same in-game name on two teams is kept, and flagged in the preview');
  const embers = lib.players!.find((p) => p.gameId === 'Embers')!;
  assert.equal(embers.uid, undefined, 'a UID the sheet ruined is not saved');
  assert.equal(lib.players!.find((p) => p.gameId === 'Ward')!.role, 'Coach');
  // One lobby for the group, holding all five teams; coaches are not in the squad.
  assert.equal(result.lobbies.length >= 1, true);
  const lobby = lobbies.list().find((l) => l.title === 'Group A')!;
  assert.equal(lobby.teams.length, 5);
  assert.deepEqual(lobby.teams.find((t) => t.name === 'Ash Syndicate')!.players, ['Cairn', 'Karn', 'Soot', 'Embers']);
  assert.deepEqual(lobby.teams.find((t) => t.name === 'Night Owls')!.uids, ['5031945047', '5034599482', '5037253917', '5039908352']);
  // No path of the folder is kept anywhere.
  assert.ok(!JSON.stringify(store.data).includes(pics), 'no folder path is saved');
  await assert.rejects(importer.import({ teams: preview.teams.slice(0, 1).map((t) => ({ key: t.key, name: t.name, players: [] })), pictures: { token: scan.token } }), /Choose the pictures folder again/, 'the scan is forgotten after the import');
});

test('import: the UID is the player: a saved player who has it is the one updated, and it is said', async () => {
  const { store, importer } = await setup();
  store.data.players!.push({ id: 'x', name: 'Other', realName: '', gameId: 'Other', photo: '', role: '', teamId: null, uid: '5031945047' });
  const r = await importer.import({ teams: [{ key: 'k', name: 'Fresh Team', players: [{ key: 'p', ign: 'Rook', uid: '5031945047', role: 'Player' }] }] });
  assert.equal(store.data.players!.filter((p) => p.uid === '5031945047').length, 1, 'one player per UID');
  const x = store.data.players!.find((p) => p.id === 'x')!;
  assert.equal(x.gameId, 'Rook');
  assert.equal(x.teamId, store.data.teams!.find((t) => t.name === 'Fresh Team')!.id);
  assert.match(r.problems.join(' '), /was already Other/);
});
