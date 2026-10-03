const assert = require('node:assert/strict');
const test = require('node:test');
const { load, T, USF_NIGHT, tonight, me } = require('./helpers/fright-fixtures.cjs');

const recap = load('recap');
const record = (extra = {}) => ({ slug: 'usf-2026', nightOn: USF_NIGHT.night_on, parkId: 3, opensAt: USF_NIGHT.opens_at,
  closesAt: USF_NIGHT.closes_at, haunts: 2, offered: false, ...extra });

test('F4a: leaving the park after 9 PM park time with 1+ haunts offers the Marquee', () => {
  assert.equal(recap.recapTrigger({ record: record(), now: T('2026-10-09T21:30:00-04:00'), phase: 'off', parkLeft: true }).reason, 'exit');
  assert.equal(recap.recapTrigger({ record: record(), now: T('2026-10-10T00:30:00-04:00'), phase: 'off', parkLeft: true }).reason,
    'exit', 'after midnight is still after 9 PM of the night');
  assert.equal(recap.recapTrigger({ record: record(), now: T('2026-10-09T20:30:00-04:00'), phase: 'off', parkLeft: true }), null,
    'before 9 PM');
  assert.equal(recap.recapTrigger({ record: record({ haunts: 0 }), now: T('2026-10-09T22:00:00-04:00'), phase: 'off',
    parkLeft: true }), null, 'no haunts: no exit recap');
});

test('F4b: the phase reaching after offers it, for the same night only', () => {
  const r = recap.recapTrigger({ record: record(), now: T('2026-10-10T02:05:00-04:00'), phase: 'after', phaseNightOn: '2026-10-09' });
  assert.equal(r.reason, 'after');
  assert.equal(r.nightOn, '2026-10-09');
  assert.equal(recap.recapTrigger({ record: record(), now: 0, phase: 'after', phaseNightOn: '2026-10-08' }), null);
});

test('F4 recap needs a logged haunt: a zero-haunt night never offers the exit card or the Marquee', () => {
  const zero = record({ haunts: 0 });
  assert.equal(recap.recapTrigger({ record: zero, now: T('2026-10-10T02:05:00-04:00'), phase: 'after', phaseNightOn: '2026-10-09' }), null);
  assert.equal(recap.recapTrigger({ record: zero, now: T('2026-10-10T11:00:00-04:00'), phase: 'off', appOpened: true }), null);
  assert.equal(recap.recapTrigger({ record: zero, now: T('2026-10-09T22:00:00-04:00'), phase: 'off', parkLeft: true }), null);
});

test('F4c: the next app open within 36 h of close offers it; later it moves to the Deep Lantern history', () => {
  assert.equal(recap.recapTrigger({ record: record(), now: T('2026-10-10T11:00:00-04:00'), phase: 'off', appOpened: true }).reason,
    'next_open');
  assert.equal(recap.recapTrigger({ record: record(), now: T('2026-10-11T15:00:00-04:00'), phase: 'off', appOpened: true }), null,
    'more than 36 h');
  assert.equal(recap.recapTrigger({ record: record(), now: T('2026-10-09T22:00:00-04:00'), phase: 'live', appOpened: true }), null,
    'mid-night app open is not the next open');
});

test('F4: once per night (local offered flag or server recap_seen)', () => {
  const at = T('2026-10-10T02:05:00-04:00');
  assert.equal(recap.recapTrigger({ record: record({ offered: true }), now: at, phase: 'after' }), null);
  assert.equal(recap.recapTrigger({ record: record(), now: at, phase: 'after', serverSeen: true }), null);
  const built = recap.nightRecordFrom(tonight({ me: me({ haunts_tonight: 3 }) }), null);
  assert.equal(built.nightOn, '2026-10-09');
  assert.equal(built.haunts, 3);
  assert.equal(built.offered, false);
  const seen = recap.nightRecordFrom(tonight({ me: me({ recap_seen: true }) }), built);
  assert.equal(seen.offered, true);
  assert.equal(seen.haunts, 3, 'never counts down');
  const next = recap.nightRecordFrom(tonight({ night: { ...USF_NIGHT, night_on: '2026-10-10' } }), { ...built, offered: true });
  assert.equal(next.offered, false, 'a new night starts fresh');
  assert.equal(recap.parseNightRecord('{'), null);
});
