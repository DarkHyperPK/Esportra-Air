const test = require('node:test');
const assert = require('node:assert/strict');
const { TournamentSync, mergeMatchContext } = require('../src/tournament-sync');
const { buildShowPatch } = require('../src/match-context');
const { eligibleChoices } = require('../src/tournament-sync');
const current = () => ({ showId: 'show', selectedMatchId: 'match', matchCode: 'FINAL', teams: [{ teamId: 'north', name: 'North', seriesScore: 0 }, { teamId: 'south', name: 'South', seriesScore: 0 }], matches: [{ matchId: 'match', matchCode: 'FINAL' }], rundown: [{ id: 'opening' }], rundownVersion: 2 });
const incoming = () => ({ showId: 'show', match: { matchId: 'match', matchCode: 'FINAL', teams: [{ teamId: 'north', name: 'Renamed North', seriesScore: 1 }, { teamId: 'south', name: 'South', seriesScore: 0 }], bestOf: 3, veto: [], scheduledAt: '2026-10-20T14:00:00Z' }, appearance: { bannerTheme: 'impact', sponsorRotation: false, sponsorSeconds: 12, matches: { match: [{ displayName: 'North on air', color: '#123456' }, {}] } }, sponsors: [] });
test('completed selected match refreshes final scores while remaining absent from eligible choices', () => {
  const final = { ...incoming(), eligible: false, selectedMatchId: 'match', matches: [] };
  final.match.status = 'completed'; final.match.teams[0].seriesScore = 2;
  const before = current(), updated = mergeMatchContext(before, final);
  assert.equal(updated.teams[0].seriesScore, 2); assert.equal(updated.matches.length, 0);
  assert.equal(updated.selectedMatchId, 'match'); assert.equal(updated.rundown, before.rundown);
});
test('fresh same-participant identity and branding keep the published flow and cannot switch participants', () => {
  const config = current(), updated = mergeMatchContext(config, incoming());
  assert.equal(updated.rundown, config.rundown); assert.equal(updated.rundownVersion, 2);
  const patch = buildShowPatch(updated); assert.equal(patch.teams[0].name, 'North on air'); assert.equal(patch.teams[0].color, '#123456'); assert.equal(patch.teams[0].series, 1);
  assert.equal(patch.layout.sponsorRotation, false); assert.equal(patch.players, undefined); assert.equal(patch.round, undefined);
  assert.equal(updated.scheduledAt, '2026-10-20T14:00:00Z');
  const changed = incoming(); changed.match.teams[0].teamId = 'new-participant';
  assert.throws(() => mergeMatchContext(config, changed), /participants changed/);
  assert.throws(() => mergeMatchContext(config, { ...incoming(), showId: 'another' }), /Selected match changed/);
});
test('polls every five seconds without overlap and discards responses after pairing or selection changes', async () => {
  let scope = { token: 'first', config: current() }, resolve, applied = 0, callback, interval;
  const sync = new TournamentSync({ getScope: () => scope, fetchContext: () => new Promise(done => { resolve = done; }), apply: async () => { applied++; }, setIntervalFn: (run, milliseconds) => { callback = run; interval = milliseconds; return 1; }, clearIntervalFn: () => {} });
  sync.start(); assert.equal(interval, 5000); callback(); assert.equal(sync.busy, true);
  scope = { ...scope, token: 'second' }; resolve(incoming()); await new Promise(done => setImmediate(done)); assert.equal(applied, 0);
  const checking = sync.tick(); resolve(incoming()); await checking; assert.equal(applied, 1); assert.ok(sync.status().lastSuccessAt);
  const stale = sync.tick(); scope = null; resolve(incoming()); await stale; assert.equal(applied, 1); sync.stop();
});
test('missing/offline/played data retains output, reports the issue and recovers on a later poll', async () => {
  let fail = true, applied = 0;
  const sync = new TournamentSync({ getScope: () => ({ token: 'node', config: current() }), fetchContext: async () => { if (fail) throw new Error('Selected match is no longer eligible'); return incoming(); }, apply: async () => { applied++; }, now: () => 5000 });
  await sync.tick(); assert.equal(applied, 0); assert.match(sync.status().error, /no longer eligible/);
  fail = false; await sync.tick(); assert.equal(applied, 1); assert.equal(sync.status().error, null); assert.equal(sync.status().lastSuccessAt, 5000);
});
test('confirmed played match leaves output and plan intact while refreshing only eligible next-match choices', async () => {
  let config = current(), applied = 0;
  const ended = { showId: config.showId, selectedMatchId: config.selectedMatchId, eligible: false, matches: [{ matchId: 'next', matchCode: 'NEXT', status: 'pending', teams: [{ name: 'Next A' }, { name: 'Next B' }] }] };
  const sync = new TournamentSync({ getScope: () => ({ token: 'node', config }), fetchContext: async () => ended, apply: async () => { applied++; }, applyIneligible: async incoming => { config = eligibleChoices(config, incoming); } });
  await sync.tick(); assert.equal(applied, 0); assert.equal(config.selectedMatchId, 'match'); assert.equal(config.teams[0].name, 'North'); assert.equal(config.rundown[0].id, 'opening'); assert.equal(config.matches.length, 1); assert.equal(config.matches[0].matchCode, 'NEXT'); assert.match(sync.status().error, /no longer eligible/);
});
