const assert = require('node:assert/strict');
const test = require('node:test');
const { load, USF_NIGHT, USH_NIGHT, T, tonight } = require('./helpers/fright-fixtures.cjs');

const phase = load('phase');

test('R3: phases off / early / live / last_call / after / off across a USH night with Early Access', () => {
  const p = at => phase.computePhase(USH_NIGHT, T(at));
  assert.equal(p('2026-10-09T16:59:00-07:00'), 'off');
  assert.equal(p('2026-10-09T17:00:00-07:00'), 'early');
  assert.equal(p('2026-10-09T18:59:59-07:00'), 'early');
  assert.equal(p('2026-10-09T19:00:00-07:00'), 'live');
  assert.equal(p('2026-10-10T01:29:00-07:00'), 'live');
  assert.equal(p('2026-10-10T01:30:00-07:00'), 'last_call');
  assert.equal(p('2026-10-10T02:00:00-07:00'), 'after');
  assert.equal(p('2026-10-10T02:59:00-07:00'), 'after');
  assert.equal(p('2026-10-10T03:00:00-07:00'), 'off');
});

test('R3: no night row (dark Monday, cancelled) is off all day; disabled payload is off', () => {
  assert.equal(phase.computePhase(null, T('2026-10-12T20:00:00-07:00')), 'off');
  assert.equal(phase.effectivePhase(tonight({ night: null, phase: 'off' }), T('2026-10-09T20:00:00-04:00')), 'off');
  assert.equal(phase.effectivePhase(tonight({ enabled: false }), T('2026-10-09T20:00:00-04:00')), 'off');
  // Without a window the server's word stands.
  assert.equal(phase.effectivePhase(tonight({ night: null, phase: 'live' }), 0), 'live');
});

test('R4: a 1:30 AM moment belongs to the previous night (last call), 1:00 AM is still live', () => {
  assert.equal(phase.computePhase(USF_NIGHT, T('2026-10-10T01:00:00-04:00')), 'live');
  assert.equal(phase.computePhase(USF_NIGHT, T('2026-10-10T01:30:00-04:00')), 'last_call');
});

test('R10: before opening shows a countdown (off or early), after close shows after, 60+ min later is off', () => {
  const teaser = T('2026-10-09T17:00:00-04:00');
  assert.equal(phase.computePhase(USF_NIGHT, teaser), 'off');
  assert.equal(phase.countdownTarget(USF_NIGHT, teaser), T(USF_NIGHT.opens_at));
  assert.equal(phase.countdownTarget(USF_NIGHT, T('2026-10-09T12:00:00-04:00')), null, 'no countdown before the teaser');
  assert.equal(phase.countdownTarget(USH_NIGHT, T('2026-10-09T17:30:00-07:00')), T(USH_NIGHT.opens_at), 'early counts down too');
  assert.equal(phase.computePhase(USF_NIGHT, T('2026-10-10T02:10:00-04:00')), 'after');
  assert.equal(phase.computePhase(USF_NIGHT, T('2026-10-10T03:01:00-04:00')), 'off');
});

test('R3 edge timers: nextPhaseEdge walks every edge in order', () => {
  const edges = [];
  let now = T('2026-10-09T12:00:00-07:00');
  for (let edge = phase.nextPhaseEdge(USH_NIGHT, now); edge != null; edge = phase.nextPhaseEdge(USH_NIGHT, now)) {
    edges.push(edge);
    now = edge;
  }
  assert.deepEqual(edges, [USH_NIGHT.teaser_from, USH_NIGHT.early_opens_at, USH_NIGHT.opens_at, USH_NIGHT.last_call_at,
    USH_NIGHT.closes_at, USH_NIGHT.after_until].map(T));
});

test('R7/R8: fog is 40% in early, full live, fades over 10 minutes after close', () => {
  assert.equal(phase.fogLevel('early', USF_NIGHT, 0), 0.4);
  assert.equal(phase.fogLevel('live', USF_NIGHT, 0), 1);
  assert.equal(phase.fogLevel('after', USF_NIGHT, T('2026-10-10T02:05:00-04:00')), 0.5);
  assert.equal(phase.fogLevel('after', USF_NIGHT, T('2026-10-10T02:20:00-04:00')), 0);
  assert.equal(phase.fogLevel('off', USF_NIGHT, 0), 0);
});

test('poll policy: 120 s only while ON + focused + foreground; 20 min in an event park; none elsewhere or backgrounded', () => {
  const base = { modeOn: true, focused: true, foreground: true, eventPark: true };
  assert.equal(phase.frightPollMs(base), 120_000);
  assert.equal(phase.frightPollMs({ ...base, pollSeconds: 90 }), 90_000);
  assert.equal(phase.frightPollMs({ ...base, focused: false }), 20 * 60_000);
  assert.equal(phase.frightPollMs({ ...base, modeOn: false }), 20 * 60_000);
  assert.equal(phase.frightPollMs({ ...base, modeOn: false, eventPark: false }), null);
  assert.equal(phase.frightPollMs({ ...base, foreground: false }), null);
});
