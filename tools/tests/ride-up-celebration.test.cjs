const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/ride-up-celebration.test.cjs
// "Your ride's up!": the queue wrap-up cheers you onto the ride (four beats, UI thread, kid-safe).

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const src = read('src/screens/LinePlay/components/RideUpCelebration.tsx');
const num = name => Number(new RegExp(`${name}: (\\d+)`).exec(src)[1]);

test('four beats: payoff inside 1.5 s, a 70 ms hold, settled by 2.6 s', () => {
  const ringEnd = num('ringAt') + num('ringMs');
  assert.equal(num('hitAt'), ringEnd, 'the hold lands on the full ring');
  assert.equal(num('burstAt') - num('hitAt'), 70, 'one held 70 ms frame');
  assert.ok(num('burstAt') <= 1500, 'payoff inside 1.5 s');
  assert.ok(num('leaveAt') + num('leaveMs') <= 2600, 'out of the way by 2.6 s');
  assert.ok(num('leaveMs') < 300, 'exits are faster than entrances');
  assert.ok(num('sparkles') <= 12 && num('confetti') <= 28, 'particle caps per burst');
});

test('UI thread, power budget, Reduce Motion and Dim Flashing Lights', () => {
  assert.match(src, /momentParticles\(RIDE_UP\.sparkles/);
  assert.match(src, /momentParticles\(RIDE_UP\.confetti/);
  assert.match(src, /flashPeak\(isDimFlashingLightsEnabled\(\)/);
  assert.match(src, /useReduceMotionPreference/);
  assert.match(src, /reduceMotion: ReduceMotion\.Never/, 'the Reduce Motion fade is a real fade');
  assert.match(src, /useAnimatedReaction\(\(\) => Math\.floor\(ring\.value/, 'the tick ladder rides the ring on the UI clock');
  assert.doesNotMatch(src, /setInterval|requestAnimationFrame|setTimeout/, 'no JS timers drive the moment');
  assert.doesNotMatch(src, /withRepeat/, 'one-shot');
  assert.doesNotMatch(src, /from 'react-native-svg'/);
});

test('mounted only when the queue really ended with boarding, and the chips land under its burst', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /\{rideUp && <RideUpCelebration rideName=\{rideName\} \/>\}/);
  assert.match(recap, /const rideUp = endReason === 'boarded'/);
  assert.match(recap, /RIDE_UP\.ringAt \+ index \* RIDE_UP\.statStepMs/, 'the earned row rolls with the gold bar');
});

test('the recap\'s own header card is the stage: no veil, no second banner, the real title stamps', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /<RideUpHero active=\{rideUp\}>\{backdrop => \(/, 'the header card itself pops');
  assert.match(recap, /<RideUpKicker active=\{rideUp\} style=\{styles\.recapKicker\}>/, 'the existing title is the stamp');
  assert.doesNotMatch(src, /styles\.veil|veil:/, 'no full-page veil');
  assert.doesNotMatch(src, /YOUR RIDE&apos;S UP!/, 'no duplicate title banner');
  assert.match(src, /SLAM_SQUASH/);
});

test('round 5: the earned row is in place from frame 1 and every number lands by about 1.4 s on the UI thread', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.doesNotMatch(recap, /function useCountUp|requestAnimationFrame|setTimeout/, 'no JS-thread counting in the recap');
  assert.match(recap, /entering=\{reducedMotion \|\| rideUp \? undefined/, 'no delayed entrance on the ride-up row');
  assert.match(recap, /<RollingValue value=\{wholeMinutes\}/, 'the minutes roll too');
  assert.match(src, /export function RollingValue/);
  assert.match(src, /useAnimatedProps/, 'the digits are an animated native prop, not React state');
  const lastLands = num('ringAt') + 4 * num('statStepMs') + num('statMs');
  assert.ok(lastLands <= 1450, `the fifth stat lands by about 1.4 s (${lastLands})`);
  assert.ok(num('ringAt') + num('ringMs') <= 1450, 'the minutes land with the bar');
});
