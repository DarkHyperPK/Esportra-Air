import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Match } from '../src/shared/api.ts';
import { deleteTeam, emptyLibrary, linkMatch, pickTeam, pushMatch, refreshMatch, setLineup, validPlayer, validTeam } from '../src/main/team-library.ts';

const p = (name: string, gameId = '', photo = '') => ({ id: crypto.randomUUID(), name, realName: '', gameId, photo });
const match = (a: string, b: string, players: Match['players']): Match => ({
  id: crypto.randomUUID(), code: 'Q1', kind: 'quick', title: `${a} vs ${b}`, bestOf: 1, createdAt: 0, game: 'valorant', eventId: 'e', stage: '', talentOff: [], sponsorsOff: [], theme: 'broadcast',
  teams: [{ name: a, tag: 'A', color: '#111111', logo: '' }, { name: b, tag: 'B', color: '#222222', logo: '' }], players,
});

test('existing matches move into Teams/Players once: teams by name, players by Riot ID', () => {
  const lib = emptyLibrary();
  const m1 = match('Night Owls', 'Crimson Five', [[p('Juno', 'JUNO#EU1'), p('Mira')], [p('Kairo', 'KAIRO#EU1')]]);
  const m2 = match('night owls', 'Paper Rex', [[p('Juno again', 'juno#eu1', '/air-assets/00000000-0000-4000-8000-000000000001')], [p('Zed')]]);
  linkMatch(m1, lib);
  linkMatch(m2, lib);
  assert.deepEqual(lib.teams.map((t) => t.name), ['Night Owls', 'Crimson Five', 'Paper Rex']);
  assert.equal(lib.players.length, 4, 'Juno is one player, found by Riot ID');
  assert.equal(m2.teamIds![0], m1.teamIds![0]);
  assert.equal(m2.players[0][0]!.libraryId, m1.players[0][0]!.libraryId);
  assert.equal(lib.players.find((x) => x.name === 'Juno')!.photo, '/air-assets/00000000-0000-4000-8000-000000000001', 'a photo from a later match fills the gap');
});

test('a match arriving without photos or a logo takes them from Teams/Players (an Esportra import)', () => {
  const lib = emptyLibrary();
  const photo = '/air-assets/00000000-0000-4000-8000-000000000002', logo = '/air-assets/00000000-0000-4000-8000-000000000003';
  linkMatch(match('Night Owls', 'Crimson Five', [[p('JUNO', 'Juno#NWL', photo)], [p('Kairo', 'Kairo#CRF')]]), lib);
  lib.teams[0]!.logo = logo;
  const fromEsportra = match('NIGHT OWLS', 'Crimson Five', [[p('Juno', 'Juno#NWL'), p('Newcomer', 'New#NWL')], [p('Kairo', 'Kairo#CRF')]]);
  linkMatch(fromEsportra, lib);
  assert.equal(fromEsportra.players[0][0]!.photo, photo, 'the player found by Riot ID brings the photo');
  assert.equal(fromEsportra.players[0][0]!.name, 'Juno', 'the match keeps its own name');
  assert.equal(fromEsportra.players[0][1]!.photo, '', 'a player the library does not know stays without one');
  assert.equal(fromEsportra.teams[0].logo, logo, 'the team brings its logo');
  assert.equal(fromEsportra.teams[1].logo, '', 'no logo anywhere: none');
});

test('a match follows the library: renames, moves and deletions', () => {
  const lib = emptyLibrary();
  const m = match('Night Owls', 'Crimson Five', [[p('Juno', 'JUNO#EU1'), p('Mira')], [p('Kairo')]]);
  linkMatch(m, lib);
  const owls = lib.teams[0]!;
  owls.name = 'Night Owls Academy';
  const mira = lib.players.find((x) => x.name === 'Mira')!;
  mira.teamId = lib.teams[1]!.id;
  assert.equal(refreshMatch(m, lib), true);
  assert.equal(m.teams[0].name, 'Night Owls Academy');
  assert.deepEqual(m.players[0].map((x) => x.name), ['Juno'], 'a player who moved team leaves the lineup');
  assert.equal(refreshMatch(m, lib), false, 'nothing more to change');
  deleteTeam(lib, owls.id);
  refreshMatch(m, lib);
  assert.equal(m.teamIds![0], null);
  assert.equal(m.teams[0].name, 'Night Owls Academy', 'the match keeps its copy');
  assert.equal(lib.players.find((x) => x.name === 'Juno')!.teamId, null, 'its players have no team now');
});

test('picking a team and its starters', () => {
  const lib = emptyLibrary();
  const a = validTeam({ name: 'Paper Rex' }, lib);
  lib.teams.push(a, validTeam({ name: 'Vortex' }, { ...lib, teams: [a] }));
  for (const n of ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff']) lib.players.push(validPlayer({ name: n, teamId: a.id }, lib));
  lib.players.push(validPlayer({ name: 'Other', teamId: lib.teams[1]!.id }, lib));
  const m = match('X', 'Y', [[], []]);
  pickTeam(m, 0, a.id, lib);
  assert.deepEqual(m.players[0].map((x) => x.name), ['Aa', 'Bb', 'Cc', 'Dd', 'Ee'], 'the first five start');
  assert.throws(() => pickTeam(m, 1, a.id, lib), /different team/);
  const ff = lib.players.find((x) => x.name === 'Ff')!.id;
  setLineup(m, 0, [ff, ...m.players[0].slice(0, 4).map((x) => x.libraryId!)], lib);
  assert.equal(m.players[0][0]!.name, 'Ff');
  assert.throws(() => setLineup(m, 0, [lib.players.at(-1)!.id], lib), /from this team/);
  assert.throws(() => setLineup(m, 0, Array(8).fill(ff), lib), /seven/);
  assert.equal(validTeam({ id: a.id, name: 'Paper Rex', color: '#123456' }, lib).id, a.id, 'saving a team under its own name is fine');
  assert.throws(() => validTeam({ name: 'paper rex' }, { ...lib, teams: lib.teams }), /already a team/);
  assert.throws(() => validPlayer({ name: 'X', gameId: 'nohash' }, lib), /Name#TAG/);
  assert.equal(validPlayer({ name: 'X', gameId: 'IRP_ACE' }, lib, 'pubgm').gameId, 'IRP_ACE', 'PUBG MOBILE names have no #TAG');
  assert.throws(() => validPlayer({ name: 'X', gameId: 'a'.repeat(33) }, lib, 'freefire'), /32 characters/);
  assert.equal(validTeam({ name: 'Team Liquid' }, emptyLibrary()).tag, 'TL');
});

test('edits made inside a match reach the library', () => {
  const lib = emptyLibrary();
  const m = match('Night Owls', 'Crimson Five', [[p('Juno')], []]);
  linkMatch(m, lib);
  m.teams[0] = { ...m.teams[0], color: '#abcdef' };
  m.players[0][0] = { ...m.players[0][0]!, gameId: 'JUNO#EU1' };
  pushMatch(m, lib);
  assert.equal(lib.teams[0]!.color, '#abcdef');
  assert.equal(lib.players[0]!.gameId, 'JUNO#EU1');
});

test('a finished match keeps the teams it was played with', () => {
  const lib = emptyLibrary();
  const m = match('Night Owls', 'Crimson Five', [[p('Juno')], []]);
  linkMatch(m, lib);
  m.finishedAt = 1;
  lib.teams[0]!.name = 'Renamed';
  assert.equal(refreshMatch(m, lib), false);
  assert.equal(m.teams[0].name, 'Night Owls');
  delete m.finishedAt;
  assert.equal(refreshMatch(m, lib), true, 'reopened: it follows again');
  assert.equal(m.teams[0].name, 'Renamed');
});
