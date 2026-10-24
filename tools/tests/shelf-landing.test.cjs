const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/shelf-landing.test.cjs
// A new coin lands in its shelf slot: the beat sheet, the domino jiggle and the row shine.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const L = loadTs('src/components/shelfLanding.ts');

test('the first coin lands before 1 s (payoff inside 1.2 s); a repeat drops straight in and is shorter', () => {
  const first = L.SHELF_LANDING.first.dropAt + L.SHELF_LANDING.first.dropMs;
  const repeat = L.SHELF_LANDING.repeat.dropAt + L.SHELF_LANDING.repeat.dropMs;
  assert.ok(first < 1000, `lands at ${first}`);
  assert.ok(first + L.SHELF_LANDING.hitStopMs + 200 <= 1200, 'the puff is out inside 1.2 s');
  assert.ok(L.SHELF_LANDING.hitStopMs >= 50 && L.SHELF_LANDING.hitStopMs <= 80, 'one held hit-stop frame');
  assert.ok(repeat < first, 'repeat moments are shorter than first-time ones');
  assert.ok(L.SHELF_LANDING.pulseMs <= L.SHELF_LANDING.first.dropAt + L.SHELF_LANDING.first.dropMs + 40, 'the slot glows twice by the landing');
  assert.ok(first + L.SHELF_LANDING.shineAfterMs + L.SHELF_LANDING.shineMs <= 2600, 'settled inside 2.6 s');
  assert.ok(L.SHELF_LANDING.sparkles <= 12);
});

test('neighbours jiggle outward like dominoes, 40 ms apart, the nearest two tip and hop most; the landing coin does not', () => {
  assert.equal(L.jiggleDelay(0), null);
  assert.equal(L.jiggleDelay(1), 0);
  assert.equal(L.jiggleDelay(-1), 0);
  assert.equal(L.jiggleDelay(3), 80);
  assert.equal(L.jiggleDirection(-2), -1);
  assert.equal(L.jiggleDirection(2), 1);
  assert.ok(L.jiggleAmount(1).deg >= 5 && L.jiggleAmount(1).hop > 0, 'the nearest neighbours visibly tip and hop');
  assert.ok(L.jiggleAmount(2).deg < L.jiggleAmount(1).deg, 'further coins tip less');
  assert.equal(L.jiggleAmount(0).deg, 0);
  assert.ok(L.SHELF_LANDING.kickPt >= 2 && L.SHELF_LANDING.kickPt <= 4, 'a small plank kick');
});

test('a row shines only when every slot in it is owned', () => {
  assert.equal(L.rowComplete([1, 2, 3], new Set([1, 2, 3, 9])), true);
  assert.equal(L.rowComplete([1, 2, 3], new Set([1, 3])), false);
  assert.equal(L.rowComplete([], new Set([1])), false);
});

test('the landing stays on the UI thread, the budget and the motion language', () => {
  const arrival = read('src/components/CoinShelfArrival.tsx');
  assert.match(arrival, /momentParticles\(SHELF_LANDING\.sparkles/);
  assert.match(arrival, /SPRING\.pop/);
  assert.match(arrival, /EASE\.in/);
  assert.match(arrival, /useReduceMotionPreference/, 'never skips itself before iOS answers Reduce Motion');
  assert.doesNotMatch(arrival, /glowStyle/, 'the hover glow stays put and fades; it never trails onto the shelf');
  const fx = read('src/components/ShelfLandingFx.tsx');
  assert.doesNotMatch(fx, /withRepeat/, 'one-shot only, nothing loops on the shelf');
  assert.match(fx, /useReducedGameMotion/);
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /<ShelfJiggle landingKey=\{landingKey\}/);
  assert.match(park, /<ShelfKick landingKey=\{landingKey\}/);
  assert.match(park, /Image\.prefetch\(arrivingCoinUrl/, 'the coin is decoded before the landing starts');
  assert.match(arrival, /runOnJS\(onDropDone\)/, 'the clink fires from the UI clock on the landing frame');
  assert.match(park, /RowShine/);
});

test('about one landing in ten is shiny, fixed per landing; a full row hops left to right under the light bar', () => {
  let shiny = 0;
  for (let i = 0; i < 2000; i += 1) if (L.shinyLanding(`33:8:${i}`)) shiny += 1;
  assert.ok(shiny > 120 && shiny < 280, `${shiny} of 2000`);
  assert.equal(L.shinyLanding('33:8:47'), L.shinyLanding('33:8:47'));
  assert.equal(L.shinyLanding(null), false);
  assert.ok(L.rowHopDelay(1) - L.rowHopDelay(0) === L.SHELF_LANDING.rowHopStepMs);
  assert.ok(L.rowHopDelay(4) < L.SHELF_LANDING.shineAfterMs + L.SHELF_LANDING.shineMs + 200, 'the last hop lands while the bar is still there');
  const src = read('src/components/CoinShelfArrival.tsx');
  assert.match(src, /drawBurst\(canvas, b, slot\.x, slot\.y/, 'ring and stars in the landing\'s one Skia canvas');
  assert.match(src, /scaleY: 1 - 0\.2 \* sq/, 'the coin slams flat for the hit-stop');
  assert.doesNotMatch(src, /Math\.cos\(t \* Math\.PI \* 3\)/, 'never edge-on right before impact');
  const fx = read('src/components/ShelfLandingFx.tsx');
  assert.match(fx, /runOnJS\(rowTick\)\(index\)/, 'each hop ticks on its frame, climbing the ladder');
});

test('round 4: a short anticipation, the bloom obeys Dim Flashing Lights, the caption keeps clear of section banners', () => {
  const L = require('./helpers/ts-module.cjs').loadTs('src/components/shelfLanding.ts').SHELF_LANDING;
  assert.ok(L.first.dropAt <= 250, 'the coin never hovers still for long before it dives');
  assert.ok(L.first.dropAt + L.first.dropMs + L.hitStopMs + L.shineAfterMs <= 1000, 'dive, slam and row shine start inside 1.0 s');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/CoinShelfArrival.tsx'), 'utf8');
  assert.match(src, /if \(f > 0\.001 && flashTop > 0\)/, 'no bloom pop with Dim Flashing Lights');
  assert.doesNotMatch(src, /bottom: 118/, 'the caption is never parked over the Limited Coins banner');
  assert.doesNotMatch(src, />Mastery</, 'a picture button, not a reading word');
});

test('round 5: the landing is one Skia canvas and the row shine mounts early, on the plank, inside the panel', () => {
  const src = read('src/components/CoinShelfArrival.tsx');
  assert.match(src, /<ShelfLandingCanvas /, 'one canvas for every glow, trail, flash and burst');
  assert.doesNotMatch(src, /TrailGhost|styles\.bright|styles\.slotRing|styles\.slotFlash|<BurstCanvas/, 'no separate animated layers for the light');
  assert.equal((src.match(/<Canvas /g) || []).length, 1, 'exactly one canvas');
  const fx = read('src/components/ShelfLandingFx.tsx');
  assert.doesNotMatch(fx, /expo-linear-gradient/, 'the bar and the plank glow are drawn in Skia');
  assert.match(fx, /armed = false/);
  assert.doesNotMatch(fx, /right: -4|backgroundColor: '#05346e'/, 'the row-done pill never hangs off the panel as a dark tab');
  assert.match(fx, /borderColor: '#e9a800'/, 'a gold rim');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /armed=\{shineArmed\}/, 'the shine mounts with the shelf, not on the landing frame');
});

test('round 5: the shared burst worklet is declared before the worklet that calls it (a worklet captures its callees when created)', () => {
  const src = read('src/components/park/BurstCanvas.tsx');
  assert.ok(src.indexOf('function drawBurstAtOrigin(') < src.indexOf('export function drawBurst('),
    'drawBurstAtOrigin must exist before drawBurst is created, or the landing canvas throws on the UI thread');
});
