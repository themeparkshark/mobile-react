const assert = require('node:assert/strict');
const test = require('node:test');
const { load, USF_NIGHT, T } = require('./helpers/fright-fixtures.cjs');

const clock = load('clock');
const phase = load('phase');

test('R5: offset = server_now - request midpoint', () => {
  const sentAt = 1_000_000;
  const receivedAt = 1_000_400;
  const server = new Date(1_000_200 + 90_000).toISOString();
  assert.equal(clock.clockOffset(server, sentAt, receivedAt), 90_000);
  assert.equal(clock.serverNow(90_000, 5), 90_005);
  assert.equal(clock.clockOffset('nonsense', sentAt, receivedAt), null);
  assert.equal(clock.clockOffset(server, receivedAt, sentAt), null, 'a backwards round trip is unusable');
});

test('R5: phase math runs on the corrected clock, so a phone 2 hours slow still sees live', () => {
  const realNow = T('2026-10-09T20:00:00-04:00');
  const phoneNow = realNow - 2 * 3600_000;
  const offset = clock.clockOffset(new Date(realNow).toISOString(), phoneNow - 100, phoneNow + 100);
  assert.equal(phase.computePhase(USF_NIGHT, phoneNow), 'off');
  assert.equal(phase.computePhase(USF_NIGHT, clock.serverNow(offset, phoneNow)), 'live');
});

test('R5 tamper guard: a wall-clock jump of more than 2 minutes against the monotonic clock forces a refetch', () => {
  const baseline = { wall: 10_000_000, mono: 500 };
  assert.equal(clock.clockJumped(baseline, 10_000_000 + 60_000, 500 + 60_000), false, 'normal time passing');
  assert.equal(clock.clockJumped(baseline, 10_000_000 + 60_000 + 3 * 3600_000, 500 + 60_000), true, 'set forward');
  assert.equal(clock.clockJumped(baseline, 10_000_000 - 3600_000, 500 + 1000), true, 'set back');
  assert.equal(clock.clockJumped(null, 0, 0), false);
  assert.equal(clock.clockJumped(baseline, 0, NaN), false, 'no monotonic clock: skip');
});
