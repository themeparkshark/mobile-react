'use strict';
/**
 * Studio engine timing and bridge modules: event ring (UI -> JS bridge),
 * walk sense (QUEUE REALITY), beat maps, calibration, fx-clock springs and
 * cue timelines, fixed views, atlas layout, haptic scheduling.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const ring = loadTs('src/gamekit/core/eventRing.ts');
const walk = loadTs('src/gamekit/core/walkSense.ts');
const bm = loadTs('src/gamekit/core/beatMap.ts');
const cal = loadTs('src/gamekit/core/calibration.ts');
const tl = loadTs('src/gamekit/core/timeline.ts');
const atlas = loadTs('src/gamekit/core/atlasLayout.ts');
const grammar = loadTs('src/gamekit/core/hapticGrammar.ts');

test('event ring: drains oldest first into a plain array, overwrites oldest when full', () => {
  const r = ring.createEventRing(4);
  assert.deepEqual(plain(ring.drainEvents(r)), []);
  ring.pushEvent(r, 1, 10, 0, 0, 100);
  ring.pushEvent(r, 2, 20, 0, 0, 116);
  const batch = ring.drainEvents(r);
  assert.ok(Array.isArray(batch));
  assert.deepEqual(plain(ring.eventsOf(batch).map((e) => [e.kind, e.a, e.t])), [[1, 10, 100], [2, 20, 116]]);
  assert.equal(r.size, 0);
  for (let i = 0; i < 6; i++) ring.pushEvent(r, 10 + i);
  assert.equal(r.dropped, 2);
  assert.deepEqual(plain(ring.eventsOf(ring.drainEvents(r)).map((e) => e.kind)), [12, 13, 14, 15]);
  let n = 0;
  ring.forEachEvent([1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 9], () => n++);
  assert.equal(n, 2, 'partial trailing event is ignored');
});

function simulateWalk(state, { hz = 1.8, amp = 0.35, ms = 8000, t0 = 0, noise = 0.01 }) {
  let events = 0;
  let steps = 0;
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;
  for (let t = t0; t < t0 + ms; t += 20) {
    const bob = amp * Math.max(0, Math.sin(2 * Math.PI * hz * (t / 1000))) ** 2;
    const ev = walk.walkSample(state, t, 0.02 + rnd() * noise, -1 - bob + rnd() * noise, 0.1 * bob + rnd() * noise);
    if (ev & walk.WALK_EV_STEP) steps++;
    events |= ev;
  }
  return { events, steps };
}

test('walk sense: a phone held still never walks; a queue shuffle is detected, then stops', () => {
  const still = walk.createWalkSense();
  const r0 = simulateWalk(still, { amp: 0, ms: 10000, noise: 0.02 });
  assert.equal(r0.steps, 0);
  assert.equal(still.walking, false);

  const s = walk.createWalkSense();
  const r1 = simulateWalk(s, { hz: 1.8, amp: 0.4, ms: 8000 });
  assert.ok(r1.events & walk.WALK_EV_START, 'walk started');
  assert.equal(s.walking, true);
  assert.ok(r1.steps >= 10 && r1.steps <= 18, `about 1.8 steps/s over 8 s, got ${r1.steps}`);
  assert.ok(s.cadence > 1 && s.cadence < 2.6);
  assert.ok(walk.walkForgiveness(s) > 1.1);

  const r2 = simulateWalk(s, { amp: 0, ms: 4000, t0: 8000, noise: 0.005 });
  assert.ok(r2.events & walk.WALK_EV_STOP, 'walk stopped after the line paused');
  assert.equal(s.walking, false);
});

test('walk sense: a single bump is not a walk', () => {
  const s = walk.createWalkSense();
  for (let t = 0; t < 3000; t += 20) {
    const z = t >= 1000 && t < 1100 ? 0.6 : 0;
    walk.walkSample(s, t, 0, -1, z);
  }
  assert.equal(s.walking, false);
  assert.ok(s.steps <= 1);
});

test('beat map: constant BPM matches the grid; quantize to 8ths and bars; loops wrap', () => {
  const m = bm.beatMapFromBpm(120, 100, 32, 4, 0);
  assert.equal(bm.beatIndexAt(m, 100), 0);
  assert.equal(bm.beatIndexAt(m, 350), 0.5);
  assert.equal(bm.timeOfBeat(m, 2.5), 1350);
  assert.ok(Math.abs(bm.msToNext(m, 120, 0.5) - 230) < 1e-9, 'next 8th');
  assert.ok(Math.abs(bm.msToNext(m, 120, 4) - 1980) < 1e-9, 'next bar');
  assert.ok(Math.abs(bm.msToNext(m, 330, 0.5, 40) - 270) < 1e-9, 'too-close line skipped');
  assert.equal(bm.gridErrorMs(m, 590, 1), -10);
  const bar = bm.barAt(m, 100 + 500 * 5 + 250);
  assert.deepEqual(plain(bar), { bar: 1, phase: 1.5 / 4, beatInBar: 1 });
  const loop = bm.beatMapFromBpm(120, 0, 16, 4, 8000);
  assert.equal(bm.beatIndexAt(loop, 8250), bm.beatIndexAt(loop, 250));
  assert.ok(bm.beatIndexAt(m, 100 + 500 * 40) > 39.9, 'extrapolates past the end');
});

test('beat map: live-feel beats follow the measured onsets, and the residual gate sees a bad map', () => {
  const beats = [];
  for (let i = 0; i < 32; i++) beats.push(i * 441 + (i % 2 ? 4 : -3));
  const m = { beats, beatsPerBar: 4, downbeat: 0, loopMs: 0 };
  assert.equal(bm.beatIndexAt(m, beats[7]), 7);
  const res = bm.beatMapResidualMs(m);
  assert.ok(Math.abs(res.bpm - 60000 / 441) < 0.5);
  assert.ok(res.maxResidualMs < 5, 'passes the 5 ms gate');
  const bad = { ...m, beats: beats.slice(0, 10).concat(beats.slice(11)) };
  assert.ok(bm.beatMapMaxJitterMs(bad) > 300, 'a missed beat shows up as a jump');
});

test('calibration: robust offset ignores outliers, rejects scatter, folds in and corrects taps', () => {
  const taps = [22, 25, 18, 30, 24, 21, 26, 250, -200, 23];
  const est = cal.estimateOffset(taps);
  assert.ok(est && est.offsetMs >= 21 && est.offsetMs <= 26, JSON.stringify(est));
  assert.equal(cal.estimateOffset([1, 2, 3]), null, 'needs 6 taps');
  assert.equal(cal.estimateOffset([0, 200, -200, 150, -150, 100, -100, 60]), null, 'too scattered');
  const c0 = cal.defaultCalibration('bluetooth', 'expo-av');
  assert.equal(c0.audioLatencyMs, 240);
  const c1 = cal.applyEstimate(c0, est, 5);
  assert.equal(c1.inputOffsetMs, est.offsetMs);
  assert.equal(cal.correctedTouchMs(1000, c1.inputOffsetMs), 1000 - est.offsetMs);
  assert.equal(cal.cueStartMs(1000, 900, 180), 900, 'never schedules into the past');
  assert.equal(cal.cueStartMs(1000, 500, 180), 820);
});

test('fx springs: closed form matches the stepped spring, settles, overshoots when underdamped', () => {
  const p = { damping: 10, stiffness: 380, mass: 0.5 };
  assert.equal(tl.springAt(0, 1.12, 1, p), 1.12);
  // numeric integration reference
  let x = 1.12, v = 0;
  const dt = 1 / 4000;
  for (let i = 0; i < 400; i++) { const a = (-p.stiffness * (x - 1) - p.damping * v) / p.mass; v += a * dt; x += v * dt; }
  assert.ok(Math.abs(tl.springAt(100, 1.12, 1, p) - x) < 2e-3);
  let min = Infinity;
  for (let t = 0; t < 400; t += 2) min = Math.min(min, tl.springAt(t, 1.12, 1, p));
  assert.ok(min < 1, 'underdamped spring overshoots past the target');
  const settle = tl.springSettleMs(p);
  assert.ok(Math.abs(tl.springAt(settle, 1.12, 1, p) - 1) < 0.005);
  const over = { damping: 60, stiffness: 100, mass: 1 };
  for (let t = 0; t < 2000; t += 50) assert.ok(tl.springAt(t, 0, 1, over) <= 1 + 1e-9, 'overdamped never overshoots');
  assert.ok(Math.abs(tl.springAt(400, 0, 1, { damping: 20, stiffness: 100, mass: 1 }) - (1 - Math.exp(-4) * (1 + 4))) < 1e-9, 'critical');
});

test('cue timelines: every cue fires once and in order, a freeze just delays them', () => {
  const t = tl.createTimeline([[3, 440], [1, 0], [2, 220]]);
  assert.deepEqual(plain(tl.timelineDue(t, 50)), [], 'not started');
  tl.startTimeline(t, 1000);
  assert.deepEqual(plain(tl.timelineDue(t, 1000)), [1]);
  assert.deepEqual(plain(tl.timelineDue(t, 1100)), []);
  assert.deepEqual(plain(tl.timelineDue(t, 1100)), [], 'a frozen fx clock fires nothing');
  assert.deepEqual(plain(tl.timelineDue(t, 1500)), [2, 3], 'a long frame fires both, in order');
  assert.equal(tl.timelineDone(t), true);
  assert.deepEqual(plain(tl.snapCues([[1, 100], [2, 340]], 221)), [[1, 0], [2, 442]]);
});

test('fixed view: contain letterboxes, cover crops, input maps back to logical units', () => {
  const f = tl.fitView(390, 844, 960, 1000);
  assert.ok(Math.abs(f.scale - 390 / 960) < 1e-12);
  assert.equal(f.offsetX, 0);
  assert.ok(f.offsetY > 0);
  const p = tl.screenToView(f, 195, f.offsetY + 500 * f.scale);
  assert.ok(Math.abs(p.x - 480) < 1e-9 && Math.abs(p.y - 500) < 1e-9);
  const c = tl.fitView(390, 844, 960, 1000, 'cover');
  assert.ok(c.visibleW < 960 && Math.abs(c.visibleH - 1000) < 1e-9);
});

test('atlas layout: fits frames, anchors characters to the floor, respects the 2048 cap', () => {
  const L = atlas.layoutAtlas([{ w: 400, h: 800, anchor: 'base' }, { w: 100, h: 100 }], 256, 2048, 4);
  assert.equal(L.cols, 2);
  assert.equal(L.width, 512);
  const a = L.cells[0];
  assert.ok(Math.abs(a.dy + a.dh - (256 - 4)) < 1e-9, 'feet on the cell floor');
  assert.ok(a.dw <= 248 && a.dh <= 248);
  const b = L.cells[1];
  assert.ok(Math.abs(b.dx - (256 + (256 - 248) / 2)) < 1e-9);
  const many = Array.from({ length: 64 }, () => ({ w: 256, h: 256 }));
  const big = atlas.layoutAtlas(many, 256, 2048);
  assert.equal(big.width, 2048);
  assert.equal(big.height, 2048);
  assert.equal(big.bytes, 16 * 1024 * 1024, 'about 16 MB per theme, as budgeted');
  assert.throws(() => atlas.layoutAtlas(Array.from({ length: 65 }, () => ({ w: 1, h: 1 })), 256, 2048));
});

test('haptic grid steps and scheduling from one start timestamp', async () => {
  const steps = grammar.gridSteps(5, 60, 75, 'selection', 'light');
  assert.deepEqual(plain(steps.map((s) => [s.at, s.p])), [[60, 'selection'], [135, 'light'], [210, 'selection'], [285, 'light'], [360, 'selection']]);
  const fired = [];
  const H = loadTs('src/gamekit/Haptics.ts', {
    'expo-haptics': {
      impactAsync: (s) => fired.push(`impact:${s}`),
      selectionAsync: () => fired.push('selection'),
      notificationAsync: (s) => fired.push(`note:${s}`),
      ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
      NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    },
    'react-native': { Platform: { OS: 'ios' } },
  });
  // Started 150 ms ago: the first two are late; one within lateDropMs fires now, one is skipped.
  const cancel = H.scheduleHaptics([{ at: 0, p: 'medium' }, { at: 120, p: 'selection' }, { at: 190, p: 'light' }], { startAt: Date.now() - 150, lateDropMs: 40 });
  assert.equal(fired.length, 1, `late step inside the window fires immediately: ${fired}`);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired.length, 2, 'the future step fired on time');
  cancel();
  const c2 = H.scheduleHaptics([{ at: 50, p: 'heavy' }]);
  c2();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired.length, 2, 'cancelled steps never fire');
  assert.equal(typeof H.scheduleHaptics([{ at: 0, p: 'light' }], { priority: -1 }), 'function');
  assert.equal(fired.length, 2, 'rival-caused never fires');
});
