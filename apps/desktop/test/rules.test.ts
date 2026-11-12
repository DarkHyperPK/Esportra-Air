import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_RULES, countMatches, fillText, matchRule, ruleSentence, validRule, type Rule } from '../src/shared/rules.ts';
import { RuleRunner, type Action } from '../src/main/autopilot/rule-runner.ts';

const ctx = { map: 1, round: 7 };
const ace = { type: 'banner.ace', team: 0, player: 2 };
const won = (moment: string, round: number, extra = {}) => ({ type: 'round.won', team: 1, how: 'elim', round, moment, ...extra });
const rule = (r: Partial<Rule> = {}): Rule => ({ ...STARTER_RULES[0]!, ...r });

test('each moment matches its own events, and conditions filter them', () => {
  assert.deepEqual(matchRule(rule(), ace, ctx), { team: 0, player: 2, round: 7 });
  assert.equal(matchRule(rule(), won('flawless', 7), ctx), null);
  const clutch = rule({ when: 'clutch' });
  assert.deepEqual(matchRule(clutch, won('clutch', 9, { player: 4 }), ctx), { team: 1, player: 4, round: 9 });
  assert.equal(matchRule(clutch, won('round', 9), ctx), null);
  const mp = rule({ when: 'match_point', show: { kind: 'toast', text: '{team} at match point' } });
  assert.ok(matchRule(mp, won('matchpoint', 20), ctx));
  assert.equal(matchRule({ ...mp, team: 0 }, won('matchpoint', 20), ctx), null, 'only for the other team');
  assert.equal(matchRule({ ...mp, map: 2 }, won('matchpoint', 20), ctx), null, 'only on map 2');
  assert.equal(matchRule({ ...mp, rounds: 'first' }, won('matchpoint', 20), ctx), null);
  assert.ok(matchRule({ ...mp, rounds: 'second' }, won('matchpoint', 20), ctx));
  assert.ok(matchRule(rule({ when: 'overtime', show: { kind: 'toast', text: 'Overtime' } }), won('overtime', 24), ctx));
  assert.equal(matchRule(rule({ enabled: false }), ace, ctx), null);
  assert.equal(fillText('{player} of {team} clutches it', { team: 1, player: 0, round: 3 }, { teams: ['Night Owls', 'Crimson Five'], players: [[], ['Kairo']] }), 'Kairo of Crimson Five clutches it');
});

test('rules read as one sentence and are checked at the boundary', () => {
  const s = ruleSentence(rule(), { teams: ['A', 'B'], graphic: (id) => id });
  assert.equal(`${s.when}${s.rest}`, 'When a player gets an ace, show Player spotlight for 8 s via the stinger. 3 s hold.');
  assert.throws(() => validRule({ ...rule(), when: 'flawless' }, 'x', []), /needs a moment with one player/);
  assert.throws(() => validRule({ ...rule(), show: { kind: 'fullscreen', screen: 'halftime' } }, 'x', ['map-result']), /in My show/);
  assert.throws(() => validRule({ ...rule(), show: { kind: 'toast', text: '<b>' } }, 'x', []), /plain text/);
  assert.throws(() => validRule({ ...rule(), hold: 'window', holdSeconds: 0 }, 'x', []), /1–30 seconds/);
  assert.equal(validRule({ ...rule(), hold: 'none' }, 'x', []).holdSeconds, 0);
});

test('the last rehearsal says how often a rule would have fired', () => {
  const recorded = [{ event: ace, ctx: { map: 1, round: 7 } }, { event: won('round', 8), ctx }, { event: { ...ace, team: 1, player: 0 }, ctx: { map: 1, round: 19 } }];
  assert.deepEqual(countMatches(rule(), recorded, { players: [['', '', 'Juno'], ['Kairo']] }), { n: 2, examples: ['round 7 (Juno)', 'round 19 (Kairo)'] });
});

function harness(over: Partial<{ busy: boolean; preset: 'standard' | 'minimal' | 'manual' }> = {}) {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const clock = { now: () => now, setTimeout: (fn: () => void, ms: number) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id; }, clearTimeout: (id: unknown) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); } };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
      await new Promise((r) => setImmediate(r));
    }
    now = end;
  };
  const state = { busy: over.busy ?? false, rules: [rule()] as Rule[] };
  const calls: string[] = [];
  const log: string[] = [];
  const runner = new RuleRunner({
    rules: () => state.rules, active: () => true, preset: () => over.preset ?? 'standard', busy: () => state.busy,
    actionsFor: (_r, hit) => ({ label: `Spotlight · P${hit.player}`, on: [{ name: 'lowerthird.player', args: { team: hit.team, player: hit.player } }], off: [{ name: 'lowerthird.hide', args: {} }] }),
    air: async (a: Action[], label, via) => { calls.push(`air:${a[0]!.name}:${via}`); void label; },
    cue: async (a: Action[]) => { calls.push(`cue:${a[0]!.name}`); },
    takeCue: async (via) => { calls.push(`take:${via}`); },
    clearCue: async () => { calls.push('clear'); },
    log: (t) => log.push(t), changed: () => {}, clock,
  });
  return { runner, state, calls, log, advance };
}

const tick = () => new Promise((r) => setImmediate(r));

test('a hold window takes by itself, a hold keeps it cued, and skip drops it', async () => {
  const h = harness();
  h.runner.onGameEvent(ace, ctx);
  await tick();
  assert.deepEqual(h.calls, ['cue:lowerthird.player']);
  assert.equal(h.runner.view()?.endsAt, 3000);
  await h.advance(3000);
  assert.deepEqual(h.calls, ['cue:lowerthird.player', 'take:stinger']);
  await h.advance(8000);
  assert.deepEqual(h.calls.at(-1), 'air:lowerthird.hide:cut', 'cleared after 8 s');

  const held = harness();
  held.runner.onGameEvent(ace, ctx);
  await tick();
  held.runner.hold();
  await held.advance(10_000);
  assert.deepEqual(held.calls, ['cue:lowerthird.player'], 'held: nothing taken');
  await held.runner.skip();
  assert.deepEqual(held.calls, ['cue:lowerthird.player', 'clear']);
  assert.equal(held.runner.view(), null);
});

test('no hold goes straight on air; Manual preset waits in Cued; Results only fires nothing', async () => {
  const h = harness();
  h.state.rules = [rule({ hold: 'none', holdSeconds: 0 })];
  h.runner.onGameEvent(ace, ctx);
  await tick();
  assert.deepEqual(h.calls, ['air:lowerthird.player:stinger']);

  const manual = harness({ preset: 'manual' });
  manual.runner.onGameEvent(ace, ctx);
  await tick();
  assert.deepEqual(manual.calls, ['cue:lowerthird.player']);
  assert.equal(manual.runner.view(), null, 'waits in Cued, no countdown');

  const minimal = harness({ preset: 'minimal' });
  minimal.runner.onGameEvent(ace, ctx);
  await tick();
  assert.deepEqual(minimal.calls, []);
});

test('a rule never covers a full-screen graphic: it waits for the game, then fires or is dropped', async () => {
  const h = harness({ busy: true });
  h.runner.onGameEvent(ace, ctx);
  await h.advance(4000);
  assert.deepEqual(h.calls, [], 'waiting while the graphic is up');
  h.state.busy = false;
  await h.advance(1000);
  assert.deepEqual(h.calls, ['cue:lowerthird.player'], 'fires once the game is back');

  const late = harness({ busy: true });
  late.runner.onGameEvent(ace, ctx);
  await late.advance(12_000);
  late.state.busy = false;
  await late.advance(2000);
  assert.deepEqual(late.calls, []);
  assert.match(late.log.join('\n'), /Rule skipped · Spotlight · P2 \(a full-screen graphic was up\)/);
});
