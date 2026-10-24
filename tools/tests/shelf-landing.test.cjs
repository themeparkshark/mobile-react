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
