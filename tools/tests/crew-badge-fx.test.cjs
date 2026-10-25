const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/crew-badge-fx.test.cjs
// A warm crew: joins drop in and wave with a +1, good rounds float hearts; motion only, kid-safe, quiet for others.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const src = read('src/screens/LinePlay/group/CrewBadgeFx.tsx');
const num = name => Number(new RegExp(`${name}: (\\d+)`).exec(src)[1]);

test('the beat sheet matches the brief: drop 20 pt, a 15 degree wave over 500 ms, +1 over 900 ms, 80 ms apart, hearts over 1.2 s', () => {
  assert.equal(num('dropPt'), 20);
  assert.equal(num('waveDeg'), 15);
  assert.equal(num('waveMs'), 500);
  assert.equal(num('plusOneMs'), 900);
  assert.equal(num('joinStaggerMs'), 80);
  assert.equal(num('heartsMs'), 1200);
  assert.equal(num('hearts'), 3);
});

test('motion only, UI thread, one tick for a join and never a buzz for another player\'s stars', () => {
  assert.match(src, /withSpring\(1, SPRING\.land\)/, 'the join drops on SPRING.land');
  assert.equal((src.match(/queueHaptic\(/g) || []).length, 2, 'two haptics in the file: the join tick and your own hearts');
  assert.match(src, /if \(mine && before !== null && before !== undefined && now > before\) runOnJS\(tick\)\(\)/, 'hearts tick for your own stars only');
  assert.match(src, /if \(join === 0\) \{ queueHaptic\('tickSelection'\)/);
  assert.doesNotMatch(src, /withRepeat|setInterval|requestAnimationFrame/, 'one-shot');
  assert.doesNotMatch(src, /from 'react-native-svg'/);
  const strip = read('src/screens/LinePlay/group/GroupStrip.tsx');
  assert.match(strip, /<CrewBadgeFx joinOrder=\{joinOrder\} starsKey=\{stars\.get\(id\) \?\? 0\} reduced=\{reduced\} mine=\{index === 0\}\n\s+covered=\{covered\} order=\{index\}>/);
  assert.match(strip, /useEffect\(\(\) => \{ seen\.current = new Set/, 'the crew is remembered after each draw, never during render');
});

test('round 5: the +1 and the hearts read at a glance and the bubble never wraps on a 28 pt badge', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/LinePlay/group/CrewBadgeFx.tsx'), 'utf8');
  assert.match(src, /float: \{ position: 'absolute', left: -30, right: -30/, 'the float layer is wider than the badge');
  assert.match(src, /minHeight: 28, minWidth: 40/, 'a +1 bubble at least 28 pt tall and 40 pt wide');
  assert.ok(Number(/PLUS_FONT = (\d+)/.exec(src)[1]) >= 20);
  assert.ok(Number(/HEART_SIZE = (\d+)/.exec(src)[1]) >= 22);
});

const loadFx = () => loadTs('src/screens/LinePlay/group/CrewBadgeFx.tsx', {
  '@shopify/react-native-skia': { Skia: { Path: { MakeFromSVGString: () => ({}) } }, Canvas: () => null, Picture: () => null, PaintStyle: {}, StrokeJoin: {}, createPicture: () => null },
  react: { memo: x => x, useEffect: () => undefined, useMemo: f => f(), useRef: x => ({ current: x }), useState: x => [x, () => undefined] },
  'react-native': { StyleSheet: { create: x => x }, Text: () => null, View: () => null },
  'react-native-reanimated': { __esModule: true, default: { View: () => null } },
  '../../../gamekit/Haptics': { queueHaptic: () => undefined },
  '../../../gamekit/audio/playMoment': { playMoment: () => undefined },
  '../../../ui': { GameIcon: () => null },
  '../../../ui/tokens': { BRAND: { white: '#fff', navy: '#05346e', gold: '#ffcf3b' } },
  '../../../ui/motionEasing': { EASE: {}, SPRING: {} },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
});

test('round 6 (kept): solid gold hearts with a white rim and a navy ink line, a sparkle on the badge', () => {
  assert.match(src, /Skia\.Path\.MakeFromSVGString\('M16 29/, 'a real heart shape, not the round heart badge tinted into a disc');
  assert.match(src, /rim\.setColor\(Skia\.Color\(BRAND\.white\)\)/, 'a white rim');
  assert.match(src, /ink\.setColor\(Skia\.Color\(BRAND\.navy\)\)/, 'a navy ink line');
  assert.doesNotMatch(src, /<GameIcon name="heart"/);
  assert.match(src, /<GameIcon name="sparkle" size=\{SPARK_SIZE\} \/>/);
  // Still quiet for other players: the queue never buzzes or plays a sound.
  const queueSrc = src.slice(src.indexOf('export function createHeartsQueue'), src.indexOf('export const HEART_SIZE'));
  assert.doesNotMatch(queueSrc, /queueHaptic|playHaptic|playMoment/);
});

// A fake clock for the hearts queue: timers run when the test advances time.
function fakeClock() {
  let now = 0; let seq = 0; const timers = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: id => { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = until;
    },
    pending: () => timers.size,
  };
}
const harness = (fx, firstKey = 0) => {
  const clock = fakeClock();
  const log = [];
  let mounted = false;
  const q = fx.createHeartsQueue(firstKey, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    start: () => { mounted = true; log.push('start'); }, end: () => { mounted = false; log.push('end'); } });
  return { q, clock, log, mounted: () => mounted };
};
const flags = (covered = false, order = 0, reduced = false) => ({ covered, reduced, order });

test('wave 5 round 3 BLOCKER: a burst that has started always finishes and its canvas always leaves', () => {
  const fx = loadFx();
  const ms = fx.CREW_FX.heartsMs;
  // The grader's case: the strip is covered (a kid taps the next game) in the middle of the burst.
  {
    const h = harness(fx, 0);
    h.q.update(1, flags());
    h.clock.advance(0);
    assert.equal(h.mounted(), true, 'the burst starts');
    h.clock.advance(ms * 0.4);
    h.q.update(1, flags(true));
    h.clock.advance(ms);
    assert.equal(h.mounted(), false, 'covering the strip mid-burst never freezes the hearts: the canvas unmounts');
    h.q.update(1, flags(false));
    h.clock.advance(ms * 2);
    assert.deepEqual(h.log, ['start', 'end'], 'and it does not replay when the strip comes back');
  }
  // Reduce Motion or a new seat order mid-burst: same.
  for (const change of [flags(false, 0, true), flags(false, 3)]) {
    const h = harness(fx, 0);
    h.q.update(2, flags());
    h.clock.advance(ms * 0.5);
    h.q.update(2, change);
    h.clock.advance(ms);
    assert.equal(h.mounted(), false, `no hearts stuck on screen after ${JSON.stringify(change)}`);
  }
  // The hearts' own last frame ends it early; the safety timer then does nothing more.
  {
    const h = harness(fx, 0);
    h.q.update(1, flags());
    h.clock.advance(ms * 0.99);
    h.q.finish();
    assert.equal(h.mounted(), false);
    h.clock.advance(ms);
    assert.deepEqual(h.log, ['start', 'end']);
    assert.equal(h.clock.pending(), 0, 'no timer left behind');
  }
  // Leaving the screen mid-burst: nothing fires after dispose.
  {
    const h = harness(fx, 0);
    h.q.update(1, flags());
    h.clock.advance(10);
    h.q.dispose();
    assert.equal(h.clock.pending(), 0);
  }
  // The component wires it so: the timing callback finishes the burst, cleanup never cancels a started burst.
  assert.match(src, /withTiming\(1, \{ duration: CREW_FX\.heartsMs, easing: Easing\.linear \}, ok => \{ if \(ok\) runOnJS\(endBurst\)\(\); \}\)/);
  assert.match(src, /queue\.current\?\.update\(starsKey, \{ covered, reduced, order \}\);\n  \}, \[starsKey, reduced, covered, order\]\);/);
  assert.match(src, /useEffect\(\(\) => \(\) => \{ queue\.current\?\.dispose\(\); cancelAnimation\(hearts\); cancelAnimation\(bob\); \}, \[hearts, bob\]\);/);
  assert.match(src, /endTimer = io\.setTimeout\(finish, CREW_FX\.heartsMs \+ 80\)/, 'a safety timer the strip never clears');
});

test('wave 5 round 2 (kept): stars earned behind the pass-the-phone card wait, then play badge by badge; the first value never plays', () => {
  const fx = loadFx();
  const step = fx.CREW_FX.crewStaggerMs;
  const h = harness(fx, 5);
  h.q.update(5, flags());
  h.clock.advance(5000);
  assert.deepEqual(h.log, [], 'the first value never celebrates');
  h.q.update(6, flags(true, 2));
  h.clock.advance(5000);
  assert.deepEqual(h.log, [], 'nothing plays while the card covers the strip');
  h.q.update(6, flags(false, 2));
  h.clock.advance(2 * step - 1);
  assert.deepEqual(h.log, [], 'the third badge waits its turn');
  h.clock.advance(1);
  assert.deepEqual(h.log, ['start']);
  // Stars rising during a burst play right after it (never two canvases at once).
  h.q.update(7, flags(false, 2));
  h.clock.advance(fx.CREW_FX.heartsMs + 80);
  assert.deepEqual(h.log, ['start', 'end']);
  h.clock.advance(2 * step);
  assert.deepEqual(h.log, ['start', 'end', 'start']);
  // Reduce Motion: stars are counted but never play.
  const r = harness(fx, 0);
  r.q.update(1, flags(false, 0, true));
  r.clock.advance(5000);
  r.q.update(1, flags());
  r.clock.advance(5000);
  assert.deepEqual(r.log, []);
  const play = read('src/screens/LinePlay/group/useGroupPlay.tsx');
  assert.match(play, /<GroupStrip group=\{group\} compact=\{compact\} covered=\{!!mode\}/);
});

test('wave 5 round 3: 34 pt hearts in a halo around the badge, solid to the end, each shrinks to nothing with a white sparkle pop', () => {
  const fx = loadFx();
  assert.ok(fx.HEART_SIZE >= 34 && fx.HEART_SIZE <= 36, `heart size ${fx.HEART_SIZE}`);
  const step = fx.CREW_FX.heartStep;
  for (const lean of ['left', 'right']) {
    for (let i = 0; i < 3; i += 1) {
      let sawPop = false; let sawSpark = false;
      for (let t = 0; t <= 1; t += 0.001) {
        const h = fx.heartAt(t, i, lean);
        if (h.scale > 0) assert.equal(h.opacity, 1, 'never see-through');
        if (h.scale > 1.2) sawPop = true;
        if (h.spark > 0.4 && h.scale < 0.05) sawSpark = true;
      }
      assert.ok(sawPop, `heart ${i} pops past full size`);
      assert.ok(sawSpark, `heart ${i} ends in a sparkle where it was`);
      assert.equal(fx.heartAt(1, i, lean).scale, 0, 'every heart is gone when the burst ends');
    }
  }
  assert.ok(2 * step + 0.5 * fx.SPARK_END <= 1.0001, 'the last sparkle is gone inside the burst');
  // They pop one after another (pop, pop, pop).
  assert.ok(fx.heartAt(step * 0.5, 1).scale === 0 && fx.heartAt(step * 0.5, 0).scale > 0);
  assert.match(src, /\{burst > 0 && <HeartsBurst key=\{burst\} t=\{hearts\} mine=\{mine\} lean=\{order === 0 \? 'right' : 'left'\} \/>\}\n    <Animated\.View style=\{badgeStyle\}>/,
    'nothing mounted between bursts, and the hearts sit behind the badge');
  assert.equal((src.match(/<Canvas/g) || []).length, 1, 'one canvas for all three hearts');
});

test('wave 5 round 3: no heart crosses words (the ride card above the strip, the strip line right of the badges)', () => {
  const fx = loadFx();
  // Measured on the real LinePlay round (iPhone 17 Pro): the ride card's lowest words end about 42 pt above a badge's
  // centre, the strip line starts 22 pt right of the last badge's centre, and the first badge sits 36 pt from the
  // screen's left edge (the next badge is 19 pt to its right, so the first badge's hearts may lean over it).
  for (const lean of ['left', 'right']) {
    let top = 0; let left = 0; let right = 0;
    for (let t = 0; t <= 1; t += 0.0005) for (let i = 0; i < 3; i += 1) {
      const h = fx.heartAt(t, i, lean);
      if (h.scale <= 0) continue;
      const half = (fx.HEART_SIZE / 2) * h.scale;
      top = Math.min(top, h.y - half); left = Math.min(left, h.x - half); right = Math.max(right, h.x + half);
    }
    assert.ok(top >= -39, `${lean}: the halo stays under the ride card's words (${top.toFixed(1)})`);
    assert.ok(left >= -38, `${lean}: on screen (${left.toFixed(1)})`);
    if (lean === 'left') assert.ok(right <= 22, `the last badge's hearts stop before the strip line (${right.toFixed(1)})`);
    else assert.ok(right <= 19 + 22, `the first badge's hearts stop before the strip line (${right.toFixed(1)})`);
  }
});
