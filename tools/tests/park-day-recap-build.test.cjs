const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/park-day-recap-build.test.cjs
// The park day recap builds itself stat by stat, then the polaroid and the closing stamp.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const R = loadTs('src/components/park/recapBuildPlan.ts');

test('stats land one after another, 280 ms apart, then the polaroid and the stamp', () => {
  assert.equal(R.recapStatAt(0), 600);
  assert.equal(R.recapStatAt(1) - R.recapStatAt(0), 280);
  assert.ok(R.RECAP_BUILD.polaroidAt >= R.recapStatAt(R.RECAP_BUILD.stats - 1));
  assert.ok(R.RECAP_BUILD.stampAt > R.RECAP_BUILD.polaroidAt);
  assert.ok(R.recapSettledAt() <= 3500, `settled at ${R.recapSettledAt()}`);
  assert.ok(R.RECAP_BUILD.titleAt < R.RECAP_BUILD.firstStatAt);
});

test('the polaroid shows a new coin first, and only real coin art', () => {
  assert.equal(R.bestCoin([{ coin_url: 'a', new: false }, { coin_url: 'b', new: true }]).coin_url, 'b');
  assert.equal(R.bestCoin([{ coin_url: null, new: true }, { coin_url: 'c', new: false }]).coin_url, 'c');
  assert.equal(R.bestCoin([]), null);
  assert.equal(R.bestCoin(undefined), null);
});

test('the build is skippable, plays once per day, and waits for Reduce Motion', () => {
  const src = read('src/components/park/ParkDayRecapBuild.tsx');
  assert.match(src, /useReduceMotionPreference/);
  assert.match(src, /played\.has\(dayKey\)/, 'one build per park day');
  assert.doesNotMatch(src, /withRepeat/, 'nothing loops');
  assert.match(src, /playHaptic\('golden'\)/);
  const card = read('src/screens/ParkDayRecapCard.tsx');
  assert.match(card, /onTouchStart=\{build\.instant \? undefined : build\.skip\}/, 'a tap skips to the full card');
  assert.match(card, /useRecapBuild\(recap && !selectedDay/, 'earlier days just show');
});

test('picture stats: small days stamp, bigger days count; a gold sunset, a Tomorrow step; no polling', () => {
  assert.equal(R.statStamps(0), true);
  assert.equal(R.statStamps(1), true);
  assert.equal(R.statStamps(3), true);
  assert.equal(R.statStamps(12), false);
  assert.ok(R.RECAP_BUILD.tomorrowAt > R.RECAP_BUILD.stampAt, 'tomorrow comes after the closing stamp');
  assert.ok(R.RECAP_BUILD.stampSparkles <= 12);
  const src = read('src/components/park/ParkDayRecapBuild.tsx');
  assert.doesNotMatch(src, /#ffb347/i, 'no orange in the sunset');
  assert.doesNotMatch(src, /VISIBLE_POLL_MS|setTimeout\(check/, 'the build never polls while off screen');
  assert.match(src, /export function notifyRecapViewport/);
  assert.doesNotMatch(src, /setTimeout\(\(\) => \{\n\s+setShown/, 'stat ticks fire from the UI clock');
  const card = read('src/screens/ParkDayRecapCard.tsx');
  assert.match(card, /icon="ride"/);
  assert.match(card, /icon="coin"/);
  assert.match(card, /<RecapTomorrow build=\{build\} line=\{tomorrow\} \/>/);
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /onScroll=\{notifyRecapViewport\}/);
  const tomorrow = read('src/components/park/useRecapTomorrow.ts');
  assert.match(tomorrow, /tomorrowLine\(state\)/, 'an honest line from the real Daily 3 streak');
});
