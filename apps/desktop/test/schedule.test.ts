import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByWhen, prepState, whenGroup } from '../src/shared/schedule.ts';
import { cameraLinkUrl, rotationShare, type EventInfo } from '../src/shared/model.ts';

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).toISOString();

test('matches group by when, in the order a producer looks', () => {
  const now = new Date(2026, 10, 11, 15).getTime(); // Wednesday 11 Nov, 15:00
  assert.equal(whenGroup(at(2026, 11, 11, 20), now), 'Today');
  assert.equal(whenGroup(at(2026, 11, 11, 9), now), 'Today', 'earlier today is still today');
  assert.equal(whenGroup(at(2026, 11, 17), now), 'This week', 'six days ahead, across the weekend');
  assert.equal(whenGroup(at(2026, 11, 18), now), 'Later');
  assert.equal(whenGroup(at(2026, 11, 10), now), 'Earlier');
  assert.equal(whenGroup(null, now), 'No time set');
  assert.equal(whenGroup('not a date', now), 'No time set');
  const rows = [
    { id: 'quick-old', at: null, createdAt: 1 },
    { id: 'later', at: at(2026, 12, 1), createdAt: 0 },
    { id: 'tonight-late', at: at(2026, 11, 11, 22), createdAt: 0 },
    { id: 'tonight', at: at(2026, 11, 11, 20), createdAt: 0 },
    { id: 'quick-new', at: null, createdAt: 2 },
    { id: 'yesterday', at: at(2026, 11, 10), createdAt: 0 },
  ];
  assert.deepEqual(groupByWhen(rows, now).map((g) => [g.group, g.rows.map((r) => r.id)]), [
    ['Today', ['tonight', 'tonight-late']],
    ['Later', ['later']],
    ['No time set', ['quick-new', 'quick-old']],
    ['Earlier', ['yesterday']],
  ]);
});

test('a match is prepared when both lineups can be found in game data and someone is on air', () => {
  const p = (gameId: string) => ({ id: gameId || 'x', name: 'P', realName: '', gameId, photo: '' });
  const five = Array.from({ length: 5 }, (_, i) => p(`P${i}#EU1`));
  const event = { id: 'e', talent: [{ id: 't1' }], sponsors: [] } as unknown as EventInfo;
  assert.equal(prepState({ players: [five, five.slice(0, 4)], talentOff: [], sponsorsOff: [] }, event).label, 'Lineups missing');
  assert.equal(prepState({ players: [five, [...five.slice(0, 4), p('')]], talentOff: [], sponsorsOff: [] }, event).label, 'Lineups missing', 'a player without an in-game name cannot be matched');
  assert.equal(prepState({ players: [five, five], talentOff: ['t1'], sponsorsOff: [] }, event).label, 'Nobody on air');
  assert.deepEqual(prepState({ players: [five, five], talentOff: [], sponsorsOff: [] }, event), { label: 'Prepared', health: 'ok' });
});

test('sponsor shares follow the tiers, and camera links are stable for a link id', () => {
  const s = (id: string, tier: 'title' | 'partner' | 'supporter') => ({ id, tier }) as never;
  const share = rotationShare([s('a', 'title'), s('b', 'partner'), s('c', 'supporter')]);
  assert.deepEqual(share, { a: 0.5, b: 2 / 6, c: 1 / 6 });
  assert.deepEqual(rotationShare([]), {});
  assert.equal(cameraLinkUrl('abc_123', 'Sara Malik'), cameraLinkUrl('abc_123', 'Sara Malik'));
  assert.match(cameraLinkUrl('abc_123', 'Sara Malik'), /push=abc_123&.*label=Sara%20Malik$/);
});
