import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bracketFrom, mapOf, readLineup, readPackage, talentRole, vetoFrom, readVetoSteps } from '../src/shared/esportra-package.ts';
import { proposalKey } from '../src/main/esportra-sync.ts';
import { FakeEsportra } from '../dev/fake-esportra.ts';

const P1 = 'vgd1A1b2C3d4E5A1b2C3d4E5A1b2C3d4E5A1b2C3d4E5A1b2C3d4E5A1b2C3d4E5A1b2C3d4E5xY_z';

test('prepare’s package is read from its JSON string: lineups with Riot ids, veto, pool, sponsors, casters', () => {
  const fake = new FakeEsportra();
  const m = fake.matches[0]!;
  fake.riot.set('VGD One', P1);
  fake.vetoOf(m.id).steps.push({ team: 0, action: 'ban', map: 'Bind', side: null }, { team: 1, action: 'ban', map: 'Pearl', side: null });
  const id = randomUUID();
  const config = (fake as any).configuration(m, id);
  const pkg = readPackage({ id, version: 3, configurationJson: JSON.stringify(config) });
  assert.equal(pkg.packageId, id);
  assert.equal(pkg.version, 3);
  assert.equal(pkg.lineups[0].length, 5, 'the coach is not in the lineup');
  assert.deepEqual(pkg.lineups[0][0], { name: 'VGDOne', gameId: 'VGDOne#VGD', puuid: P1, registered: 'VGD One' }, 'the name on air without its tag, the Riot ID and the PUUID');
  assert.deepEqual(pkg.lineups[0][1], { name: 'VGD Two', gameId: '', puuid: '', registered: 'VGD Two' }, 'an unverified player keeps the registered name');
  assert.deepEqual(pkg.veto.map((s) => s.map), ['BIND', 'PEARL']);
  assert.deepEqual(pkg.mapPool, ['ABYSS', 'ASCENT', 'BIND', 'CORRODE', 'HAVEN', 'LOTUS', 'SUNSET']);
  assert.deepEqual(pkg.sponsors.map((s) => [s.name, !!s.logoUrl, !!s.assetId]), [['Northwind', true, false], ['Bluefin', false, true]], 'an /air-assets/ logo is fetched by its asset id, never used as a path');
  assert.deepEqual(pkg.casters.map((c) => [c.name, talentRole(c.role)]), [['Sam Rivers', 'play-by-play'], ['Alex Moore', 'host']]);
  assert.throws(() => readPackage({ id: 'x', configurationJson: '{}' }), /did not return a match package/);
  assert.throws(() => readPackage({ id, configurationJson: '{not json' }), /cannot read/);
});

test('map names and lineups from Esportra are cleaned', () => {
  assert.equal(mapOf('Bind'), 'BIND');
  assert.equal(mapOf(' ice box '), 'ICEBOX');
  assert.equal(mapOf('Dust2'), null);
  assert.deepEqual(readVetoSteps([{ team: 0, action: 'ban', map: 'Nowhere' }, { team: 5, action: 'decider', map: 'Lotus', side: 'DEF' }, { action: 'side', map: 'Bind' }]), [{ team: -1, action: 'decider', map: 'LOTUS', side: 'DEF' }]);
  assert.deepEqual(readLineup([{ name: '<b>x</b>', role: 'starter' }, { name: 'Sub', role: 'substitute' }]), [{ name: 'bx/b', gameId: '', puuid: '', registered: 'bx/b' }]);
});

test('Esportra’s veto becomes Air’s only when it follows the best-of’s order; a short pool is filled', () => {
  const steps = readVetoSteps([{ team: 0, action: 'ban', map: 'Bind' }, { team: 1, action: 'ban', map: 'Abyss' }, { team: 0, action: 'pick', map: 'Lotus', side: 'DEF' }]);
  const ok = vetoFrom(steps, 3, ['BIND', 'ABYSS', 'LOTUS']);
  assert.ok(ok);
  assert.equal(ok.veto.length, 3);
  assert.ok(ok.mapPool.length >= 7, 'a pool of three is filled with Air’s maps so the veto can finish');
  assert.equal(vetoFrom(readVetoSteps([{ team: 0, action: 'pick', map: 'Bind' }]), 3, []), null, 'a pick first is not a best of 3 veto here');
});

test('the bracket snapshot gives the semi-finals and the final; standings when the stage has them', () => {
  const fake = new FakeEsportra();
  const m = fake.matches[0]!;
  const out = bracketFrom(fake.bracket(m), m.id)!;
  assert.deepEqual(out.bracket.sf, [['Vanguard Esports', 0, 'Helix Gaming', 0], ['Night Owls', 2, 'Crimson Five', 1]]);
  assert.deepEqual(out.bracket.gf, [['Night Owls', 0, 'TBD', 0]]);
  assert.deepEqual(out.bracket.qf, []);
  const swiss = { stages: [{ id: 's', matches: [{ matchId: m.id, round: 1, side: 'group' }], standings: [{ teamName: 'Night Owls', wins: 3, losses: 1, scoreDiff: 4, roundDiff: -2 }] }], matches: [] };
  assert.deepEqual(bracketFrom(swiss, m.id)!.standings, [['Night Owls', '3–1', '+4', '-2']]);
  assert.equal(bracketFrom({}, m.id), null);
});

test('a result’s proposal id depends only on the package, map and score', () => {
  const pkg = randomUUID();
  assert.equal(proposalKey(pkg, 1, [13, 9]), proposalKey(pkg, 1, [13, 9]));
  assert.notEqual(proposalKey(pkg, 1, [13, 9]), proposalKey(pkg, 1, [9, 13]));
  assert.match(proposalKey(pkg, 2, [13, 11]), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('17 Nov: a Riot ID and a PUUID each go to their own field; an older save that kept the PUUID as the Riot ID is split', async () => {
  const { splitRiot, riotLabel } = await import('../src/shared/riot.ts');
  const old = { gameId: P1 } as { gameId: string; puuid?: string };
  assert.equal(splitRiot(old), true);
  assert.deepEqual(old, { gameId: '', puuid: P1 });
  assert.equal(riotLabel(old), 'Riot account linked on Esportra');
  const typed = { gameId: 'Juno#EU1' };
  assert.equal(splitRiot(typed), false, 'a Riot ID stays');
  assert.deepEqual(readLineup([{ name: 'Juno', role: 'starter', inGameName: 'Juno#EU1', gameId: P1 }]), [{ name: 'Juno', gameId: 'Juno#EU1', puuid: P1, registered: 'Juno' }]);
  const { EsportraMatches } = await import('../src/main/esportra-matches.ts');
  const lineup = [{ id: 'x', name: 'Juno', realName: '', gameId: P1, photo: '' }] as any;
  EsportraMatches.fillLineup(lineup, [{ name: 'Juno', gameId: 'Juno#EU1', puuid: P1 }]);
  assert.deepEqual([lineup[0].gameId, lineup[0].puuid], ['Juno#EU1', P1], 'a lineup from before is filled by its PUUID');
});

test('17 Nov: a lineup made from Esportra names gets its Riot IDs from a later lineup that uses Riot names', async () => {
  const { EsportraMatches } = await import('../src/main/esportra-matches.ts');
  const id = '11111111-2222-4333-8444-555555555555';
  const lineup = [{ id: 'a', name: 'player10', realName: '', gameId: '', photo: '' }, { id: 'b', name: 'player61', realName: '', gameId: '', photo: '' }] as any;
  const from = readLineup([
    { name: 'player61', role: 'starter', playerId: null, inGameName: 'Kairo#EU2', gameId: P1.replace('v', 'w') },
    { name: 'player10', role: 'starter', playerId: id, inGameName: 'Juno#EU1', gameId: P1 },
  ]);
  EsportraMatches.fillLineup(lineup, from);
  assert.deepEqual(lineup.map((p: any) => [p.name, p.gameId, !!p.puuid]), [['player10', 'Juno#EU1', true], ['player61', 'Kairo#EU2', true]], 'matched by the Esportra name, not by position');
  assert.equal(lineup[0].esportraId, id, 'and remembered by Esportra id for next time');
});
