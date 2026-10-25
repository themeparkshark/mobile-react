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
  assert.match(src, /momentParticles\(P\.sparkles/, 'the card burst reads its plan (RIDE_UP or the repeat)');
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
  assert.match(recap, /\{rideUp && <RideUpCelebration rideName=\{rideName\} short=\{rideUpShort\} origin=\{cannonFrom\} \/>\}/);
  assert.match(recap, /const rideUp = endReason === 'boarded'/);
  assert.match(recap, /rideUp \? rideUpStatStartsAt\(index, plan\)/, 'the earned row rolls out of the burst');
  assert.match(src, /return plan\.burstAt \+ index \* plan\.statStepMs;/);
});

test('the recap\'s own header card is the stage: no veil, no second banner, the real title stamps', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /<RideUpHero active=\{rideUp\} plan=\{rideUpPlan\} burstPoint=\{burstPoint\}>\{backdrop => \(/, 'the header card itself pops');
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

test('round 6 (kept): the burst colours are made once per frame, never once per piece', () => {
  const fx = read('src/components/park/ArrivalFxCanvas.tsx');
  const rain = fx.slice(fx.indexOf('export function drawRain'), fx.indexOf('/** A four-point star'));
  assert.doesNotMatch(rain, /Skia\.Color\(/, 'drawRain reads the frame palette');
  const cannon = src.slice(src.indexOf('const picture = useDerivedValue'), src.indexOf("if (count <= 0) return <Announce"));
  assert.match(cannon, /const pal = rainPalette\(\);/);
  assert.doesNotMatch(cannon, /Skia\.Color\(|Skia\.Paint\(/, 'the cannon reads the frame palette and its paints are made once');
  const burst = read('src/components/park/BurstCanvas.tsx');
  assert.doesNotMatch(burst.slice(burst.indexOf('for (let i = 0; i < stars.length')), /Skia\.Color\(/, 'no color per star');
});

test('wave 5 round 3: the payoff breaks out of the header: a cannon from the shark, rays past the card edges, bigger stars', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  // The cannon: pieces shoot up and out of the shark (above it at first), then fall across the sheet below it.
  const fxSrc = src;
  assert.match(fxSrc, /export const CANNON_UP = 1[0-9]{2};/);
  assert.match(fxSrc, /<Canvas style=\{\[styles\.cannon, \{ top: -top, width, height: height \+ top \}\]\}>/, 'the canvas reaches above the recap');
  const pieceSrc = fxSrc.slice(fxSrc.indexOf('export function cannonPieces'), fxSrc.indexOf('function Cannon('));
  const mod = { exports: {} };
  const ts = require('typescript');
  const js = ts.transpileModule(`const CANNON_G = 980;\n${pieceSrc.replace(/export /g, '')}\nmodule.exports = { cannonPieces, cannonAt };`.replace("const CANNON_G = 980;\n", ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  new Function('module', 'exports', js)(mod, mod.exports);
  const pieces = mod.exports.cannonPieces(28);
  assert.equal(pieces.length, 28);
  let up = 0; let below = 0;
  for (const p of pieces) {
    if (mod.exports.cannonAt(p, 0.35).y < -40) up += 1;
    if (mod.exports.cannonAt(p, 1.4).y > 60) below += 1;
  }
  assert.ok(up >= 20, `most pieces fly up out of the card first (${up})`);
  assert.ok(below >= 20, `then fall across the sheet (${below})`);
  // The rays: the same fan inside the card and behind it, so they run on past the card's edges.
  assert.match(fxSrc, /export function heroRaysSize\(cardHeight: number\): number \{\n  return Math\.max\(340, cardHeight \* 2\.4\);/);
  assert.equal((fxSrc.match(/<GoldBurst size=\{rays\}/g) || []).length, 2);
  assert.match(fxSrc, /<BurstCanvas progress=\{burst\} count=\{sparkles\} radius=\{168\} ring=\{52\}/);
  // Built in steps after the card's first frame (the burst layers never ride the recap's first commit).
  assert.match(fxSrc, /export const HERO_BUILD = 3;/);
  for (const at of [1, 2, 3]) assert.match(fxSrc, new RegExp(`<StepGate steps=\\{steps\\} at=\\{${at}\\}>`));
});

test('wave 5 round 3: the earned chips are big (40 pt icons, 24 pt numbers) and a zero reads as nothing (dimmed, no tick)', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /export const RIDE_UP_ICON = 40;/);
  assert.match(recap, /<GameIcon name=\{icon\} size=\{rideUp \? RIDE_UP_ICON : 30\} \/>/);
  assert.match(recap, /const none = value <= 0 && index > 0;/);
  assert.match(recap, /recapStatNone: \{ opacity: 0\.4 \}/);
  assert.match(recap, /tick=\{rideUp && !none\}/);
  assert.match(recap, /recapStatValueBig: \{ fontSize: 24 \}/);
});

test('round 6: the recap art is decoded while the player waits, so the first frame has its shark and icons', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /export function warmRecapArt\(\)/);
  assert.match(recap, /Image\.prefetch\(uris, 'memory'\)/);
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'), /useEffect\(\(\) => \{ warmRecapArt\(\); \}, \[\]\);/);
  assert.match(read('src/screens/LinePlay/QueueStampPreviewScreen.tsx'), /warmRecapArt\(\);/);
});

test('wave 5 round 2: the second ride of the day skips the confetti and rolls the numbers in 0.8 s', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const store = new Map();
  const repeat = loadTs('src/screens/LinePlay/components/rideUpRepeat.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } } },
  });
  assert.equal(repeat.rideUpVariantFor(null, '2026-10-25'), 'full');
  assert.equal(repeat.rideUpVariantFor({ day: '2026-10-25', count: 1 }, '2026-10-25'), 'short');
  assert.equal(repeat.rideUpVariantFor({ day: '2026-10-24', count: 5 }, '2026-10-25'), 'full', 'a new day starts with the full cheer');
  assert.equal(JSON.stringify(repeat.nextRideUpDay({ day: '2026-10-24', count: 5 }, '2026-10-25')), JSON.stringify({ day: '2026-10-25', count: 1 }));
  const day = new Date(2026, 9, 25, 10);
  assert.equal(repeat.takeRideUpVariant('Space:300', day), 'full');
  assert.equal(repeat.takeRideUpVariant('Space:300', day), 'full', 'the same recap never counts twice');
  assert.equal(repeat.takeRideUpVariant('Peter:200', day), 'short');
  const R = /export const RIDE_UP_REPEAT: RideUpPlan = \{([\s\S]*?)\n\};/.exec(src)[1];
  const val = name => Number(new RegExp(`${name}: ([\\d_]+)`).exec(R)[1].replace(/_/g, ''));
  assert.equal(val('confetti'), 0);
  assert.ok(val('burstAt') + 4 * val('statStepMs') + val('statMs') <= 800, 'five numbers rolled by 0.8 s');
  assert.ok(val('leaveAt') + val('leaveMs') <= 1500, 'settled by 1.5 s');
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /takeRideUpVariant\(rideUpKey \?\? `\$\{rideName\}:\$\{elapsedSeconds\}`\) === 'short' \? RIDE_UP_REPEAT : RIDE_UP/);
});
