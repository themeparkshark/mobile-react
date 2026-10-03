const assert = require('node:assert/strict');
const test = require('node:test');
const { load, T, haunt, north } = require('./helpers/fright-fixtures.cjs');
const { plain } = require('./helpers/plain.cjs');

const run = load('run');
const queue = load('queue');

const now = T('2026-10-09T20:00:00-04:00');
const spot = haunt('usf26-robot-city');
const fixAt = (meters, accuracy = 10, at = now) => ({ ...north(spot, meters), accuracy, at });

test('H1: enter needs accepting, accuracy <= 50, a fresh fix and distance <= radius + min(accuracy, 25)', () => {
  assert.equal(run.canEnter(spot, fixAt(30), now).ok, true);
  assert.equal(run.canEnter({ ...spot, accepting: false }, fixAt(30), now).reason, 'not_accepting');
  assert.equal(run.canEnter(spot, null, now).reason, 'no_fix');
  assert.equal(run.canEnter(spot, fixAt(30, 51), now).reason, 'poor_accuracy');
  assert.equal(run.canEnter(spot, fixAt(30, null), now).reason, 'poor_accuracy');
  assert.equal(run.canEnter(spot, fixAt(30, 10, now - 31_000), now).reason, 'stale_fix');
  assert.equal(run.canEnter(spot, fixAt(69, 10), now).ok, true, '60 + 10 slack');
  assert.equal(run.canEnter(spot, fixAt(72, 10), now).reason, 'too_far');
  assert.equal(run.canEnter(spot, fixAt(84, 40), now).ok, true, 'slack caps at 25');
  assert.equal(run.canEnter(spot, fixAt(86, 40), now).reason, 'too_far');
});

test('H6 phones-down: quiet until min_done_at, then ready; no prompts inside the quiet window', () => {
  const entered = run.localRun(spot.key, now, 5, 45);
  assert.equal(run.runStage(null, now), 'none');
  assert.equal(run.runStage(entered, now + 60_000), 'quiet');
  assert.equal(run.mayPrompt(entered, now + 60_000), false);
  assert.equal(run.survivedEnabled(entered, now + 60_000), false, 'I survived it! disabled before min dwell');
  assert.equal(run.quietMinutesLeft(entered, now + 60_000), 6);
  assert.equal(run.runStage(entered, now + 7 * 60_000), 'ready');
  assert.equal(run.survivedEnabled(entered, now + 7 * 60_000), true);
  assert.equal(run.mayPrompt(entered, now + 7 * 60_000), true);
  assert.equal(run.runStage({ ...entered, done_at: new Date(now).toISOString() }, now), 'done');
  assert.equal(run.runStage(entered, now + 5 * 3600_000), 'expired', '4 h dwell cap');
  // The server's min_done_at wins over the local estimate.
  const server = { ...entered, min_done_at: new Date(now + 20 * 60_000).toISOString() };
  assert.equal(run.runStage(server, now + 10 * 60_000), 'quiet');
});

test('H6: auto-finish on a fix > 90 m after min dwell, on next app open, or the button; never before min dwell', () => {
  const entered = run.localRun(spot.key, now, 5, 45);
  const later = now + 8 * 60_000;
  const decide = (extra) => run.finishDecision({ run: entered, spot, fix: null, now: later, appOpened: false, ...extra });
  assert.equal(decide({ fix: fixAt(120, 10, later) }), 'exit');
  assert.equal(decide({ fix: fixAt(80, 10, later) }), null, 'still near the entrance');
  assert.equal(decide({ fix: fixAt(120, 10, now + 60_000) }), null, 'an exit fix from before min dwell never counts');
  assert.equal(decide({ appOpened: true }), 'next_open');
  assert.equal(decide({ buttonPressed: true }), 'button');
  assert.equal(run.finishDecision({ run: entered, spot, fix: fixAt(200, 10, now + 60_000), now: now + 60_000, appOpened: true,
    buttonPressed: true }), null, 'phones-down window: nothing finishes');
});

test('H6 offline queue: enter/done keep the fix time, retry with backoff, drop on a clear no, expire by the server bounds', () => {
  let q = queue.enqueue([], { kind: 'enter', key: spot.key, nightOn: '2026-10-09', at: now,
    fix: { latitude: 1, longitude: 2, accuracy: 10, at: new Date(now).toISOString() } }, now);
  q = queue.enqueue(q, { kind: 'done', key: spot.key, nightOn: '2026-10-09', at: now + 9 * 60_000 }, now + 9 * 60_000);
  assert.deepEqual(plain(queue.dueActions(q, now + 9 * 60_000).map(a => a.kind)), ['enter', 'done']);
  // A newer enter for the same haunt replaces the older one.
  q = queue.enqueue(q, { kind: 'enter', key: spot.key, nightOn: '2026-10-09', at: now + 1000 }, now + 9 * 60_000);
  assert.equal(q.filter(a => a.kind === 'enter').length, 1);
  // Network failure: retry later with backoff.
  let settled = queue.settle(q, q[0].id, { ok: false }, now + 9 * 60_000);
  assert.equal(settled.outcome, 'retry');
  assert.equal(settled.queue.find(a => a.id === q[0].id).nextAt, now + 9 * 60_000 + 15_000);
  assert.equal(queue.settle(q, q[0].id, { ok: false, error: 'throttled' }, now).outcome, 'retry');
  assert.equal(queue.settle(q, q[0].id, { ok: false, error: 'too_far' }, now).outcome, 'dropped');
  settled = queue.settle(q, q[0].id, { ok: true }, now);
  assert.equal(settled.outcome, 'sent');
  assert.equal(settled.queue.length, 1);
  assert.equal(queue.backoffMs(10), 5 * 60_000);
  // Expiry: an enter older than 20 minutes is pruned (server `at` bound), a done lives up to 4 h.
  const old = queue.enqueue([], { kind: 'enter', key: 'a', nightOn: 'x', at: now }, now);
  assert.equal(queue.dueActions(old, now + 21 * 60_000).length, 0);
  const done = queue.enqueue([], { kind: 'done', key: 'a', nightOn: 'x', at: now }, now);
  assert.equal(queue.dueActions(done, now + 3 * 3600_000).length, 1);
  assert.equal(queue.pruneQueue(done, now, 'y').length, 0, 'another night: dropped');
  assert.equal(queue.parseQueue('garbage').length, 0);
  assert.equal(queue.parseQueue(JSON.stringify(done)).length, 1);
});
