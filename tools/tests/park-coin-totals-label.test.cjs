const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/park-coin-totals-label.test.cjs
// One park, one labeled truth: the big number is every coin at the park
// (rides, shows, famous spots); the Ride Passport chip is the rides-only part.
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the park header never calls the all-coin total "ride coins" next to a rides-only passport', () => {
  const src = read('src/screens/ParkCollectionHeader.tsx');
  assert.match(src, /export const PARK_TOTAL_LABEL = 'COINS';/);
  assert.match(src, /return `RIDES \$\{collected\}\/\$\{available\}`;/);
  assert.doesNotMatch(src, />RIDE COINS</);
  assert.doesNotMatch(src, />PASSPORT \{/);
  assert.match(src, /Ride Passport: \$\{ridePassportCollected \?\? 0\} of \$\{ridePassportAvailable\} rides/);
});

test('the profile park row uses the same label for the same number', () => {
  assert.match(read('src/components/VisitedParks.tsx'), /\$\{park\.ride_coins_available\} COINS`/);
});

test('the glossary explains the subset instead of claiming the passport is the whole shelf', () => {
  const g = read('src/services/help/glossary.ts');
  assert.doesNotMatch(g, /Every ride coin at one park\. Fill the shelf/);
  assert.match(g, /One for each ride, show and famous spot/);
  assert.match(g, /Just the rides on a park\\'s shelf/);
});
