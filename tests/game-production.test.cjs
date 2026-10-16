const { test } = require('node:test');
const assert = require('node:assert/strict');
const ProductionFeed = require('../src/production-feed');

test('preparing a different idle match clears old pauses without taking an OBS scene', () => {
  const { ShowRunner } = require('../src/show-runner');
  const calls=[], obs=new (require('node:events').EventEmitter)();
  obs.take=async()=>{calls.push('take');return {ok:true};};
  const runner=new ShowRunner({obsController:obs,logger:{error(){},warn(){}}});
  runner.techPause();runner.setTimeoutPaused(true);runner.loadRundown([]);
  runner.resetForMatch();
  assert.equal(runner.isTechPaused(),false);assert.equal(runner.isTimeoutPaused(),false);assert.deepEqual(calls,[]);
  runner.loadRundown([{id:'next',name:'Opening',scene:'Opening'}]);runner.start();
  assert.throws(()=>runner.resetForMatch(),/Stop the active broadcast/);
  runner.loadRundown([]);
});

test('cached live-round state after restart is stale until a real observer packet arrives', () => {
  const feed = new ProductionFeed({ now: () => 1000 }); feed.reset('FINAL');
  const state = { round: { phase: 'live', number: 2 }, teams: [{},{}], players: [[],[]] };
  feed.seed('FINAL', state);
  assert.equal(feed.snapshot().stale, true); assert.equal(feed.snapshot().ageMs, null);
  assert.equal(feed.snapshot().phase, 'unknown');
  feed.accept('FINAL', state, [], ['round']); assert.equal(feed.snapshot().stale, false);
});

test('player heartbeats and older recovered packets cannot hide a stale observer feed', () => {
  let now = 1000; const feed = new ProductionFeed({ now: () => now }); feed.reset('FINAL');
  const state = { round: { phase: 'live', number: 1 }, players: [[], []], teams: [{}, {}] };
  feed.accept('FINAL', state, [], ['round'], 1000);
  now = 12000; feed.accept('FINAL', state, [], ['playerCapture'], 12000);
  assert.equal(feed.snapshot().stale, true); assert.equal(feed.snapshot().ageMs, 11000);
  feed.accept('FINAL', state, [], ['round'], 500);
  assert.equal(feed.snapshot().ageMs, 11000);
});
const { RulesEngine } = require('../src/rules-engine');
const { reportedFeatures } = require('../esportra-valorant-hud/server/gep-features');
test('live strip distinguishes unreported defaults, stale feeds and a changed match', () => {
  let now = 1000;
  const feed = new ProductionFeed({ now: () => now }); feed.reset('FINAL');
  const state = { teams: [{ name: 'A', score: 1 }, { name: 'B', score: 0 }], round: { number: 2, phase: 'live' }, players: [[{ name: 'A player', alive: true, credits: 3000 }], [{ name: 'B player', alive: false, credits: 500 }]] };
  feed.accept('FINAL', state, [], ['round']);
  assert.equal(feed.snapshot().teams[0].score, null); assert.equal(feed.snapshot().teams[0].credits, null);
  feed.accept('FINAL', state, [], ['score', 'players', 'credits']);
  assert.equal(feed.snapshot().teams[0].credits, 3000); assert.equal(feed.snapshot().teams[1].alive, 0);
  now += 10001; assert.equal(feed.snapshot().stale, true);
  now += 60000; assert.equal(feed.snapshot().features[0].changes, 0);
  assert.equal(feed.accept('OTHER', state), false);
  feed.reset('OTHER'); assert.equal(feed.snapshot().available, false);
});
test('feature coverage derives only from GEP keys that were reported', () => {
  assert.deepEqual(reportedFeatures([{ info: { match_info: { round_number: '2', round_phase: 'combat' } } }]), ['round']);
  assert.deepEqual(reportedFeatures([{ feature: 'match_info', key: 'scoreboard_0', value: '{}' }]), ['players', 'credits']);
});
test('buy and round recap rules change graphics without taking an OBS scene', async () => {
  const patches = [], timers = [];
  const engine = new RulesEngine({ hudPatch: async (code, patch) => patches.push({ code, patch }), setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: () => {} });
  const runner = { getState: () => ({ activeSegment: { id: 'next', state: 'armed' } }), take: () => { throw new Error('Default graphics rules must not take scenes'); } };
  await engine.processEvent({ type: 'round.phase', phase: 'buy' }, runner, 'FINAL');
  await engine.processEvent({ type: 'round.won', state: { banner: { type: 'clutch' } } }, runner, 'FINAL');
  assert.equal(patches[0].patch.show.economy, 'auto');
  assert.equal(patches[1].patch.show.roundRecap, true);
  assert.equal(patches[2].patch.banner.hold, 4800);
  await timers[0](); assert.equal(patches.at(-1).patch.show.roundRecap, false);
  engine.dispose();
});
test('rules consume actual spike events and validate all duration settings', async () => {
  const patches = [];
  const engine = new RulesEngine({ hudPatch: async (_code, patch) => patches.push(patch) });
  await engine.processEvent({ type: 'spike.planted' }, {}, 'FINAL');
  assert.equal(patches[0].show.spikeTimer, true);
  assert.throws(() => engine.setDurations({ recapMs: -1 }), /duration/);
  engine.setDurations({ recapMs: 12000 }); assert.equal(engine.getDurations().recapMs, 12000);
  engine.dispose();
});
