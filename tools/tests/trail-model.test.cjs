const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/ts-module.cjs');
// Trail Boxes model: wording, progress and the walking-window recorder.

const m = loadTs('src/services/trail/trailModel.ts');

const PARK = 7;
const A = { lat: 34.138, lng: -118.354 };
function north(p, meters) { return { lat: p.lat + meters / 111320, lng: p.lng }; }

test('steps and distance read the way a kid and a parent expect', () => {
  assert.equal(m.formatSteps(12345), '12,345');
  assert.equal(m.formatSteps(-4), '0');
  assert.equal(m.shortSteps(950), '950');
  assert.equal(m.shortSteps(1240), '1.2k');
  assert.equal(m.shortSteps(2000), '2k');
  assert.equal(m.shortSteps(12800), '12k');
  assert.equal(m.formatDistance(9978, true), '6.2 miles');
  assert.equal(m.formatDistance(1609, true), '1.0 mile');
  assert.equal(m.formatDistance(9978, false), '10.0 km');
  assert.equal(m.usesMiles('en-US'), true);
  assert.equal(m.usesMiles('fr-FR'), false);
  assert.equal(m.percent(6000), '60%');
  assert.equal(m.percent(250), '2.5%');
});

test('the pill shows a ready box first, else the walking box closest to done', () => {
  const box = (id, goal, progress, status = 'walking') => ({ id, tier: 'blue', status, goal_steps: goal, progress_steps: progress, slot: 0 });
  assert.equal(m.headlineBox({ ready: [], walking: [box(1, 5000, 100), box(2, 2000, 1500)] }).id, 2);
  assert.equal(m.headlineBox({ ready: [box(3, 2000, 2000, 'ready')], walking: [box(2, 2000, 1999)] }).id, 3);
  assert.equal(m.headlineBox({ ready: [], walking: [] }), null);
  assert.equal(m.boxFraction(box(1, 2000, 500)), 0.25);
  assert.equal(m.stepsToGo(box(1, 2000, 500)), 1500);
});

test('milestones fire once as the fill crosses them, and the screen never goes backwards', () => {
  assert.equal(JSON.stringify(m.milestonesCrossed(0.2, 0.55)), '[0.25,0.5]');
  assert.equal((m.milestonesCrossed(0.55, 0.55)).length, 0);
  assert.equal(JSON.stringify(m.milestonesCrossed(0.9, 1)), '[1]');
  assert.equal(m.monotonic(0.6, 0.4, true), 0.6);
  assert.equal(m.monotonic(0.6, 0.1, false), 0.1);
});

test('steps that did not count are explained kindly, biggest first, silent reasons skipped', () => {
  const note = m.missNote({ credited_steps: 10, ready_box_ids: [], goal_box: null,
    missed: [{ reason: 'overlap', steps: 900 }, { reason: 'ride', steps: 300 }, { reason: 'outside', steps: 50 }] });
  assert.equal(note.steps, 300);
  assert.match(note.text, /Rides and trams/);
  assert.equal(m.missNote({ credited_steps: 0, ready_box_ids: [], goal_box: null, missed: [{ reason: 'ride', steps: 5 }] }), null);
  for (const r of ['ride', 'outside', 'not_checked_in', 'hour_cap', 'day_cap', 'gps_short']) {
    const text = m.missCopy(r);
    assert.ok(text && text.length < 70, r);
    assert.doesNotMatch(text, /calorie|weight|burn|lazy|only walked/i);
  }
});

test('reward labels', () => {
  assert.equal(m.rewardLabel({ kind: 'coins', amount: 1250 }), '1,250 Coins');
  assert.equal(m.rewardLabel({ kind: 'tickets', amount: 1 }), '1 Ticket');
  assert.equal(m.rewardLabel({ kind: 'mystery_box', amount: 2 }), '2 Mystery Pin Boxes');
  assert.equal(m.rewardLabel({ kind: 'exclusive', amount: 1, name: 'Propeller Hat' }), 'Propeller Hat');
  assert.equal(m.bonusLabel('exclusive', 1), 'Trail Exclusive item');
});

test('recorder: the open map makes a live window every 3 minutes from fixes the map already has', () => {
  const r = new m.TrailRecorder(() => 'x');
  let t = 0;
  let p = A;
  const out = [];
  for (let i = 0; i < 40; i++) { // a fix every 10 s, 12 m each
    out.push(...r.fix(PARK, p, t));
    t += 10_000; p = north(p, 12);
  }
  assert.equal(out.length, 2);
  assert.equal(out[0].source, 'live');
  assert.equal(out[0].ended_at - out[0].started_at, 180_000);
  assert.ok(Math.abs(out[0].gps_m - 216) <= 2, String(out[0].gps_m));
  assert.equal(out[0].steps, null);
  assert.notEqual(out[0].id, out[1].id);
});

test('recorder: a jump (tunnel, ride) is never counted as walking', () => {
  const r = new m.TrailRecorder(() => 'x');
  r.fix(PARK, A, 0);
  r.fix(PARK, north(A, 10), 10_000);
  r.fix(PARK, north(A, 20), 25_000);
  const out = r.fix(PARK, north(A, 600), 40_000);
  assert.equal(out.length, 1);
  assert.equal(out[0].gps_m, 20);
});

test('recorder: app closed in the park becomes one "closed" window between the two in-park points', () => {
  const r = new m.TrailRecorder(() => 'x');
  r.fix(PARK, A, 0);
  r.fix(PARK, north(A, 30), 30_000);
  const live = r.background(31_000);
  assert.equal(live.length, 1);
  assert.equal(JSON.stringify(r.away), JSON.stringify({ parkId: PARK, at: 31_000, pt: north(A, 30) }));
  const back = r.fix(PARK, north(A, 900), 3_600_000);
  assert.equal(back.length, 1);
  assert.equal(back[0].source, 'closed');
  assert.equal(back[0].started_at, 31_000);
  assert.equal(back[0].ended_at, 3_600_000);
  assert.equal(r.away, null);
});

test('recorder: coming back somewhere else (another park, home) sends no closed window', () => {
  const r = new m.TrailRecorder(() => 'x');
  r.fix(PARK, A, 0);
  r.background(60_000);
  assert.equal((r.fix(PARK + 1, A, 3_600_000)).length, 0);
  r.fix(PARK + 1, A, 3_700_000);
  r.background(3_800_000);
  assert.equal((r.fix(null, A, 4_000_000)).length, 0);
  assert.equal(r.away, null);
});

test('recorder: leaving the park closes the window; tiny windows are dropped', () => {
  const r = new m.TrailRecorder(() => 'x');
  r.fix(PARK, A, 0);
  r.fix(PARK, north(A, 40), 40_000);
  const out = r.fix(null, north(A, 60), 50_000);
  assert.equal(out.length, 1);
  assert.equal(out[0].gps_m, 40);
  r.fix(PARK, A, 100_000);
  assert.equal((r.flush(105_000)).length, 0);
});
