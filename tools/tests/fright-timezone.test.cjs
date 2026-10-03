/**
 * Fin-ister Nights timezone matrix: both parks, both midnight crossovers, the
 * November fall-back night, a traveler phone in another zone, and a tampered
 * clock. All logic runs on absolute instants from the server's ISO offsets.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { load, USF_NIGHT, USH_NIGHT, T } = require('./helpers/fright-fixtures.cjs');

const phase = load('phase');
const dates = load('dates');
const clock = load('clock');
const recap = load('recap');

test('both parks: the same absolute instant is live in Orlando and early in Hollywood', () => {
  const at = Date.parse('2026-10-10T00:30:00Z'); // 8:30 PM ET, 5:30 PM PT
  assert.equal(phase.computePhase(USF_NIGHT, at), 'live');
  assert.equal(phase.computePhase(USH_NIGHT, at), 'early');
  assert.equal(dates.clockAt(at, -240), '8:30 PM');
  assert.equal(dates.clockAt(at, -420), '5:30 PM');
});

test('midnight crossover in both parks: 12:30 AM local is live and belongs to night_on', () => {
  assert.equal(phase.computePhase(USF_NIGHT, T('2026-10-10T00:30:00-04:00')), 'live');
  assert.equal(phase.computePhase(USH_NIGHT, T('2026-10-10T00:30:00-07:00')), 'live');
  const r = recap.recapTrigger({ record: { slug: 'usf-2026', nightOn: USF_NIGHT.night_on, parkId: 3, opensAt: USF_NIGHT.opens_at,
    closesAt: USF_NIGHT.closes_at, haunts: 1, offered: false }, now: T('2026-10-10T00:30:00-04:00'), phase: 'live', parkLeft: true });
  assert.equal(r.nightOn, '2026-10-09');
  assert.equal(dates.nightDateLabel(r.nightOn), 'Friday, October 9');
});

test('DST: the Oct 31 night closes 02:00 EST after the fall-back; 01:30 EDT and 01:30 EST are both inside the night', () => {
  const night = { night_on: '2026-10-31', opens_at: '2026-10-31T18:30:00-04:00', closes_at: '2026-11-01T02:00:00-05:00',
    early_opens_at: null, last_call_at: '2026-11-01T01:30:00-05:00', after_until: '2026-11-01T03:00:00-05:00',
    teaser_from: '2026-10-31T15:30:00-04:00' };
  assert.equal(phase.computePhase(night, Date.parse('2026-11-01T05:30:00Z')), 'live', '01:30 EDT (first pass)');
  assert.equal(phase.computePhase(night, Date.parse('2026-11-01T06:30:00Z')), 'last_call', '01:30 EST (repeat hour)');
  assert.equal(phase.computePhase(night, Date.parse('2026-11-01T07:00:00Z')), 'after', '02:00 EST');
  assert.equal(dates.parkClock(night.closes_at), '2:00 AM');
  assert.equal(dates.nightDateLabel(night.night_on), 'Saturday, October 31');
});

test('traveler: a phone on Pacific time in Orlando sees park times with a zone label; same zone shows none', () => {
  assert.equal(dates.parkTimeLabel(USF_NIGHT.opens_at, 'America/New_York', -420), '6:30 PM ET');
  assert.equal(dates.parkTimeLabel(USF_NIGHT.opens_at, 'America/New_York', -240), '6:30 PM');
  assert.equal(dates.parkTimeLabel(USH_NIGHT.opens_at, 'America/Los_Angeles', -240), '7:00 PM PT');
  assert.equal(dates.parkTimeLabel('2026-10-09T18:30:00+09:00', 'Asia/Somewhere', -240), '6:30 PM UTC+9');
  assert.equal(dates.isoOffsetMinutes('2026-11-01T02:00:00-05:00'), -300);
});

test('traveler, real process zone: with TZ=America/Los_Angeles the Orlando label still reads 6:30 PM ET', () => {
  const script = `
    const { loadTs } = require(${JSON.stringify(path.join(__dirname, 'helpers/ts-module.cjs'))});
    const d = loadTs('src/services/fright/dates.ts');
    process.stdout.write(JSON.stringify([d.parkTimeLabel('2026-10-09T18:30:00-04:00', 'America/New_York'),
      d.parkTimeLabel('2026-10-09T19:00:00-07:00', 'America/Los_Angeles'), d.nightDateLabel('2026-10-09')]));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: 'America/Los_Angeles' } }).toString());
  assert.deepEqual(out, ['6:30 PM ET', '7:00 PM', 'Friday, October 9']);
  const tokyo = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: 'Asia/Tokyo' } }).toString());
  assert.deepEqual(tokyo, ['6:30 PM ET', '7:00 PM PT', 'Friday, October 9']);
});

test('tampered clock: a phone set 5 hours ahead never unlocks the night early; the jump forces a refetch', () => {
  const realNow = T('2026-10-09T14:00:00-04:00'); // 2 PM: off
  const phoneNow = realNow + 5 * 3600_000; // phone says 7 PM
  assert.equal(phase.computePhase(USF_NIGHT, phoneNow), 'live', 'raw phone clock would unlock');
  const offset = clock.clockOffset(new Date(realNow).toISOString(), phoneNow - 50, phoneNow + 50);
  assert.equal(phase.computePhase(USF_NIGHT, clock.serverNow(offset, phoneNow)), 'off', 'server-corrected clock stays off');
  // Tampering after the fetch: the wall clock jumps 5 h while the monotonic clock moves 1 s.
  assert.equal(clock.clockJumped({ wall: realNow, mono: 1000 }, realNow + 5 * 3600_000, 2000), true);
});

test('USH Early Access and USF without it: countdown labels read the park clock', () => {
  assert.equal(dates.parkClock(USH_NIGHT.early_opens_at), '5:00 PM');
  assert.equal(dates.parkClock(USF_NIGHT.opens_at), '6:30 PM');
  assert.equal(dates.nightInstant('2026-10-09', '21:00', USF_NIGHT.opens_at), Date.parse('2026-10-10T01:00:00Z'));
});
