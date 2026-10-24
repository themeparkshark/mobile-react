const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/first-coin-today.test.cjs
// "First coin today!": once per player per local day, only from a real collection, never stacked.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const F = loadTs('src/components/park/firstCoinToday.ts');
const arrival = loadTs('src/components/park/parkArrival.ts');

test('the first coin of a local day is special; the second is not; a new day starts fresh', () => {
  const today = arrival.parkDayKey(new Date(2026, 9, 24, 9, 0));
  assert.equal(F.isFirstCoinToday(null, today), true, 'never celebrated before');
  assert.equal(F.isFirstCoinToday(today, today), false, 'already celebrated today');
  const tomorrow = arrival.parkDayKey(new Date(2026, 9, 25, 0, 1));
  assert.equal(F.isFirstCoinToday(today, tomorrow), true, 'date rollover resets it');
  assert.equal(arrival.parkDayKey(new Date(2026, 9, 24, 23, 59)), today, 'the phone\'s own calendar day');
});

test('the ribbon is short and settles: in, a 1.8 s stay, a faster exit', () => {
  assert.ok(F.FIRST_COIN.exitMs < 300, 'exits are faster than entrances');
  assert.ok(F.FIRST_COIN.sweepOpacity <= 0.2, 'a soft sunrise, never a flash');
  assert.ok(F.FIRST_COIN.sparkles <= 12, 'sparkle cap per wave');
  assert.ok(F.firstCoinEndsAt() <= 2600, `gone by ${F.firstCoinEndsAt()} ms`);
});

test('wired after the catch and after the ride coin flight, only on a real collection, one celebration at a time', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /onHomeCatchDone = useCallback\(\(\) => \{\n\s+if \(catchCollected\.current\)/, 'only a catch that collected counts');
  assert.match(explore, /onDone=\{\(\) => \{ setCollectFlight\(null\); firstCoin\.noteCollected\(\); \}\}/);
  assert.match(explore, /free: mapFocused && mapFreeForMoment && !arrivalBusy/, 'waits for the arrival and the chest');
  const hook = read('src/components/park/useFirstCoinToday.tsx');
  assert.match(hook, /setTimeout\(\(\) => \{ setQueued\(false\); setPlaying\(Date\.now\(\)\); \}, 300\)/, 'the 300 ms gap');
  const ribbon = read('src/components/park/FirstCoinRibbon.tsx');
  assert.match(ribbon, /momentParticles\(FIRST_COIN\.sparkles/);
  assert.match(ribbon, /useReduceMotionPreference/);
  assert.match(ribbon, /runOnJS\(land\)/, 'the haptic lands with the ribbon on the UI clock');
  assert.doesNotMatch(ribbon, /withRepeat/, 'one-shot, nothing loops');
});
