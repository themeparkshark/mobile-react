const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/motion-small-moments.test.cjs
// The shared small-moment tokens (press, stagger, ambient, HUD bump, kick, rolling numbers).

const motion = loadTs('src/ui/motion.ts');

test('press: a small squash, a fast press-in and a release spring with one small overshoot', () => {
  assert.equal(motion.PRESS.scale, 0.94);
  assert.ok(motion.PRESS.subtleScale > motion.PRESS.scale && motion.PRESS.subtleScale < 1);
  assert.equal(motion.PRESS.inMs, 70);
  assert.ok(motion.PRESS.inMs < motion.DURATION.tap, 'press-in is quicker than a full tap');
  const ratio = motion.dampingRatio(motion.PRESS.spring);
  assert.ok(ratio > 0.3 && ratio < 0.6, `release spring bounces once (ratio ${ratio})`);
  assert.ok(motion.PRESS.overshoot > 1 && motion.PRESS.overshoot <= 1.05);
});

test('stagger: at most 8 rows animate and the whole list lands inside 400 ms', () => {
  assert.equal(motion.staggerDelay(0), 0);
  assert.equal(motion.staggerDelay(8), null, 'row 9 is simply there');
  assert.equal(motion.staggerDelay(-1), null);
  for (const count of [1, 2, 3, 5, 8, 40]) {
    for (let i = 0; i < Math.min(count, 8); i++) {
      const d = motion.staggerDelay(i, count);
      assert.ok(d !== null && d + motion.DURATION.base <= motion.STAGGER.capMs, `row ${i} of ${count} ends by the cap`);
      if (i > 0) assert.ok(d > motion.staggerDelay(i - 1, count), 'rows arrive in order');
    }
  }
  assert.equal(motion.staggerDelay(1, 3), motion.STAGGER.stepMs, 'short lists use the full 35 ms step');
  assert.equal(motion.staggerDelay(3, 2), null, 'rows past the list do not animate');
});

test('ambient, HUD bump and kick stay inside the director caps', () => {
  assert.equal(motion.AMBIENT.maxSprites, 12);
  assert.ok(motion.AMBIENT.shimmerEveryMs[0] < motion.AMBIENT.shimmerEveryMs[1]);
  assert.equal(motion.HUD_BUMP.peak, 1.22);
  assert.equal(motion.HUD_BUMP.spring, motion.SPRING.stamp);
  assert.ok(motion.KICK.maxPt <= 4);
});

test('rolling numbers: capped ticks, none on a decrease', () => {
  assert.equal(motion.COUNT.ms, motion.DURATION.count);
  assert.equal(motion.countTicks(0, 5), 5);
  assert.equal(motion.countTicks(0, 500), 12, 'capped at 12 ticks');
  assert.equal(motion.countTicks(10, 3), 0, 'decreases roll quietly');
  assert.equal(motion.countTicks(10, 10), 0);
  assert.equal(motion.countTicks(0, 0.4), 1, 'a real gain always ticks once');
  assert.equal(motion.countTicks(NaN, 3), 0);
});
