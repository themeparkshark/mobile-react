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

test('H6 min dwell mirrors the server: max(walk + 2, round(0.4 x posted)) from entry; server min_done_at wins', () => {
  assert.equal(run.minDwellMinutes(5, 45), 18);
  assert.equal(run.minDwellMinutes(5, 10), 7, 'short line: walk + 2');
  assert.equal(run.minDwellMinutes(5, null), 7);
  assert.equal(run.minDwellMinutes(4, 90), 36);
  const entered = run.localRun(spot.key, now, 5, 60); // 60 min posted: 24 min
  assert.equal(Date.parse(entered.min_done_at), now + 24 * 60_000);
  const noServer = { ...entered, min_done_at: null };
  assert.equal(run.minDoneAt(noServer, 5), now + 24 * 60_000);
  const server = { ...entered, min_done_at: new Date(now + 40 * 60_000).toISOString() };
  assert.equal(run.minDoneAt(server, 5), now + 40 * 60_000, 'authoritative');
});

test('H6 in line: quiet (no prompts) until min_done_at; "I survived it!" only after; minutes in line counts up', () => {
  const entered = run.localRun(spot.key, now, 5, 45); // 18 min
  assert.equal(run.runStage(null, now), 'none');
  assert.equal(run.runStage(entered, now + 8 * 60_000), 'quiet', 'unlocking 8 minutes into a 45-minute line stays quiet');
  assert.equal(run.mayPrompt(entered, now + 8 * 60_000), false);
  assert.equal(run.survivedEnabled(entered, now + 8 * 60_000), false);
  assert.equal(run.minutesInLine(entered, now + 12 * 60_000 + 30_000), 12);
  assert.equal(run.runStage(entered, now + 18 * 60_000), 'ready');
  assert.equal(run.survivedEnabled(entered, now + 18 * 60_000), true);
  assert.equal(run.runStage({ ...entered, done_at: new Date(now).toISOString() }, now), 'done');
  assert.equal(run.runStage(entered, now + 5 * 3600_000), 'expired', '4 h dwell cap');
});

test('H6a GPS exit: 2 consecutive fixes, accuracy <= 50 m, both > 150 m from the pin, at least 60 s apart, after min dwell', () => {
  const entered = run.localRun(spot.key, now, 5, 45);
  const ready = now + 20 * 60_000;
  let s1 = run.exitStep(null, entered, spot, fixAt(200, 20, ready), ready);
  assert.ok(s1.hold, 'first qualifying fix is held');
  assert.equal(s1.exit, false, 'one fix never credits');
  let s2 = run.exitStep(s1.hold, entered, spot, fixAt(210, 20, ready + 30_000), ready + 30_000);
  assert.equal(s2.exit, false, 'under 60 s');
  s2 = run.exitStep(s1.hold, entered, spot, fixAt(220, 20, ready + 60_000), ready + 60_000);
  assert.equal(s2.exit, true);
  // Resets: a close fix, a rough fix, or a fix from before min dwell.
  assert.equal(run.exitStep(s1.hold, entered, spot, fixAt(120, 20, ready + 70_000), ready + 70_000).hold, null, '120 m is still the queue');
  assert.equal(run.exitStep(s1.hold, entered, spot, fixAt(300, 60, ready + 70_000), ready + 70_000).hold, null, 'accuracy over 50 m');
  assert.equal(run.exitStep(null, entered, spot, fixAt(300, 10, now + 60_000), now + 60_000).hold, null, 'still in the quiet window');
  assert.equal(run.finishDecision({ run: entered, spot, now: ready, exitConfirmed: true }), 'exit');
  assert.equal(run.finishDecision({ run: entered, spot, now: ready, buttonPressed: true }), 'button');
  assert.equal(run.finishDecision({ run: entered, spot, now: now + 60_000, exitConfirmed: true, buttonPressed: true }), null,
    'nothing finishes before min_done_at');
});

test('H6b removed: there is no next-app-open finish', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/fright/run.ts'), 'utf8');
  assert.doesNotMatch(src, /appOpened|next_open/);
  const engine = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/fright/useFrightEngine.ts'), 'utf8');
  assert.doesNotMatch(engine, /appOpened: true|'next_open'/);
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
