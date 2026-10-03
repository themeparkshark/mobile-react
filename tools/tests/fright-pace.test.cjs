const assert = require('node:assert/strict');
const test = require('node:test');
const { load, haunt, north } = require('./helpers/fright-fixtures.cjs');

const pace = load('pace');
const dates = load('dates');

test('F5: pace text "4 down, 6 to go · 3h 10m left"', () => {
  assert.equal(pace.paceText(4, 10, (3 * 60 + 10) * 60_000 + 30_000), '4 down, 6 to go · 3h 10m left');
  assert.equal(pace.paceText(0, 10, 45 * 60_000), '0 down, 10 to go · 45m left');
  assert.equal(pace.paceText(3, 10, null), '3 down, 7 to go');
  assert.equal(pace.paceText(10, 10, 60_000), 'All 10! Ten-in-One Fin unlocked.');
  assert.equal(pace.hauntCountText(4, 10), '4 of 10 haunts');
});

test('F5: the haunt sheet sorts by posted wait then walking distance; closed and unknown waits sink', () => {
  const a = haunt('a', { posted_minutes: 30, sort: 1 });
  const b = haunt('b', { posted_minutes: 30, sort: 2, ...north(haunt('x'), 500) });
  const c = haunt('c', { posted_minutes: 15, sort: 3 });
  const d = haunt('d', { posted_minutes: null, sort: 4 });
  const e = haunt('e', { posted_minutes: 5, status: 'CLOSED', sort: 5 });
  const order = pace.sortHaunts([e, d, b, a, c], north(haunt('x'), 0)).map(s => s.key).join('');
  assert.equal(order, 'cabde');
  assert.equal(pace.paceVisible([d]), true, 'status alone is enough');
  assert.equal(pace.paceVisible([haunt('z', { status: null, posted_minutes: null })]), false, 'feed down: chip hides');
  assert.equal(pace.fanBadge(1), 'Fan favorite #1');
  assert.equal(pace.fanBadge(9), null, 'top lists only');
  assert.equal(pace.fanBadge(null), null);
});

test('dates: the night written out, never derived from the phone calendar', () => {
  assert.equal(dates.nightDateLabel('2026-10-09'), 'Friday, October 9');
  assert.equal(dates.nightDateLabel('2026-10-03'), 'Saturday, October 3');
  assert.equal(dates.nightDateLabel('2026-11-01'), 'Sunday, November 1');
  assert.equal(dates.nightDateLabel('2026-02-30'), null);
  assert.equal(dates.formatDuration(160 * 60_000), '2h 40m');
  assert.equal(dates.formatDuration(120 * 60_000), '2h');
  assert.equal(dates.formatMinutes(52), '52m');
});
