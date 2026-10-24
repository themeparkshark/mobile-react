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
