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

test('the first coin lands at 1 s; a repeat drops straight in and is shorter', () => {
  const first = L.SHELF_LANDING.first.dropAt + L.SHELF_LANDING.first.dropMs;
  const repeat = L.SHELF_LANDING.repeat.dropAt + L.SHELF_LANDING.repeat.dropMs;
  assert.equal(first, 1000);
  assert.ok(repeat < first, 'repeat moments are shorter than first-time ones');
  assert.ok(L.SHELF_LANDING.pulseMs <= L.SHELF_LANDING.first.dropAt + L.SHELF_LANDING.first.dropMs, 'the slot glow finishes by the landing');
  assert.ok(first + L.SHELF_LANDING.shineAfterMs + L.SHELF_LANDING.shineMs <= 2600, 'settled inside 2.6 s');
  assert.ok(L.SHELF_LANDING.sparkles <= 12);
});

test('neighbours jiggle outward like dominoes, 40 ms apart; the landing coin does not', () => {
  assert.equal(L.jiggleDelay(0), null);
  assert.equal(L.jiggleDelay(1), 80);
  assert.equal(L.jiggleDelay(-1), 80);
  assert.equal(L.jiggleDelay(3), 160);
  assert.equal(L.jiggleDirection(-2), -1);
  assert.equal(L.jiggleDirection(2), 1);
  assert.ok(L.SHELF_LANDING.jiggleDeg <= 3, 'a small tip, not a wobble');
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
  const fx = read('src/components/ShelfLandingFx.tsx');
  assert.doesNotMatch(fx, /withRepeat/, 'one-shot only, nothing loops on the shelf');
  assert.match(fx, /useReducedGameMotion/);
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /<ShelfJiggle landingKey=\{landingKey\}/);
  assert.match(park, /RowShine/);
});
