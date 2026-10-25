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
  assert.match(recap, /rideUp \? rideUpStatStartsAt\(index\)/, 'the earned row rolls out of the burst');
  assert.match(src, /return RIDE_UP\.burstAt \+ index \* RIDE_UP\.statStepMs;/);
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
  const lastLands = num('burstAt') + 4 * num('statStepMs') + num('statMs');
  assert.ok(lastLands <= 1450, `the fifth stat lands by about 1.4 s (${lastLands})`);
  assert.ok(num('ringAt') + num('ringMs') <= 1450, 'the minutes land with the bar');
});

test('round 6: frame 1 is the whole card, the burst at 0.4 s leads the numbers, the last lands by 1.2 s, settled by 2.0 s', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.ok(num('burstAt') <= 450, `the hero bursts at about 0.4 s (${num('burstAt')})`);
  assert.equal(num('stampAt'), 0, 'the title slams from frame 1');
  const lastLands = num('burstAt') + 4 * num('statStepMs') + num('statMs');
  assert.ok(lastLands <= 1200, `the fifth number lands by 1.2 s (${lastLands})`);
  assert.ok(num('leaveAt') + num('leaveMs') <= 2000, 'settled by 2.0 s');
  // The title is never invisible: it starts oversize and slams down (no opacity ramp from 0).
  assert.doesNotMatch(src, /opacity: Math\.min\(1, stamp\.value \* 3\)/);
  assert.match(src, /scale: 1\.5 - 0\.5 \* stamp\.value/);
  // The shark is on the card from frame 1 on "Your ride's up!" (no delayed zoom), and the cards under the header
  // only rise a few points in a quick fade (no blank body).
  assert.match(recap, /entering=\{reducedMotion \|\| rideUp \? undefined : ZoomIn\.delay\(80\)/);
  assert.match(recap, /rideUp \? FadeInDown\.delay\(40 \+ index \* 40\)\.duration\(180\)/);
  // The preview mounts the recap in place once the push has ended, with the provider's insets (no SafeAreaView jump).
  const preview = read('src/screens/LinePlay/QueueStampPreviewScreen.tsx');
  assert.match(preview, /addListener\('transitionEnd'/);
  assert.doesNotMatch(preview, /<SafeAreaView/);
});

test('round 6: the confetti makes its colors once per frame, never once per piece', () => {
  const fx = read('src/components/park/ArrivalFxCanvas.tsx');
  const rain = fx.slice(fx.indexOf('export function drawRain'), fx.indexOf('/** A four-point star'));
  assert.doesNotMatch(rain, /Skia\.Color\(/, 'drawRain reads the frame palette');
  assert.match(rain, /paint\.setColor\(pal\[piece\.tone\]\)/);
  assert.ok(fx.indexOf('export function rainPalette') < fx.indexOf('export function drawRain'), 'the palette worklet is declared before the worklet that calls it');
  assert.match(src, /drawRain\(canvas, paint, ink, rain\.value, pieces, pal\)/);
  const burst = read('src/components/park/BurstCanvas.tsx');
  assert.doesNotMatch(burst.slice(burst.indexOf('for (let i = 0; i < stars.length')), /Skia\.Color\(/, 'no color per star');
});

test('round 6: the recap art is decoded while the player waits, so the first frame has its shark and icons', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /export function warmRecapArt\(\)/);
  assert.match(recap, /Image\.prefetch\(uris, 'memory'\)/);
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'), /useEffect\(\(\) => \{ warmRecapArt\(\); \}, \[\]\);/);
  assert.match(read('src/screens/LinePlay/QueueStampPreviewScreen.tsx'), /warmRecapArt\(\);/);
});
