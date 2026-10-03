const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const chest = loadTs('src/screens/ExploreScreen/dailyChestPresence.ts');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

// Home Hunt v3 (Oct 2, 2026): Dustin cut the GRAB ZONE circle, the big find
// card and the Next Park Trip chip from the home map. The map is the screen.
test('home map: no GRAB ZONE circle anywhere on the map', () => {
  const map = read('src/components/Map.tsx');
  assert.doesNotMatch(map, /GRAB ZONE/);
  assert.doesNotMatch(map, /pickupRange/);
  assert.doesNotMatch(map, /grabZone/);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../../src/screens/ExploreScreen/homeMapLayout.ts')), false);
  assert.doesNotMatch(read('src/screens/ExploreScreen/HomeExplore.tsx'), /pickupRange=/);
});

test('home map: no big find card, no Next Park Trip chip, no focused-set corner card', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.doesNotMatch(home, /<HomeHuntCard/);
  assert.doesNotMatch(home, /<TripGoalCard/);
  assert.doesNotMatch(home, /<HomeFocusCard/);
  assert.doesNotMatch(home, /import .*TripGoalCard/);
  // The trip goal stays reachable outside the home map (its own preview and component).
  assert.ok(fs.existsSync(path.resolve(__dirname, '../../src/screens/ExploreScreen/TripGoalCard.tsx')));
});

test('home map: the find marker has no distance or timer label until its last minutes', () => {
  const marker = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.doesNotMatch(marker, /TAP TO GRAB/);
  assert.doesNotMatch(marker, /WALK CLOSER/);
  assert.doesNotMatch(marker, /formatLeavesIn/);
  assert.match(marker, /LEAVING_SOON_MS = 5 \* 60_000/);
});

test('home map: only a slim chip ever sits over the map while finds are up', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /<HomeHuntChip message=\{chip\} onDismiss=\{dismissChip\} \/>/);
  const chip = read('src/screens/ExploreScreen/HomeHuntChip.tsx');
  assert.match(chip, /Gesture\.Pan\(\)/, 'swipe to dismiss');
  assert.match(chip, /setTimeout\(onDismiss/, 'auto-dismiss');
});

test('home map only asks the native map for screen points after it has settled (MapLibre "Invalid react tag")', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /if \(!project \|\| mapSettled === 0\) return null;/);
});

test('daily chest: dismissed stays away for the day, a new day or a new chest presents again', () => {
  chest.resetChestDismissal();
  const morning = new Date(2026, 9, 1, 9, 0);
  assert.equal(chest.chestDismissed(7, morning), false);
  chest.markChestDismissed(7, morning);
  assert.equal(chest.chestDismissed(7, new Date(2026, 9, 1, 23, 59)), true);
  assert.equal(chest.chestDismissed(7, new Date(2026, 9, 2, 0, 1)), false, 'the next day');
  assert.equal(chest.chestDismissed(8, morning), false, 'tomorrow\'s chest');
  chest.resetChestDismissal();
  assert.equal(chest.chestDismissed(7, morning), false, 'a fresh app open');
});

test('daily chest: the button opens it whenever the screen is free, even before the first catch', () => {
  const base = { unclaimed: true, autoReady: false, screenFree: true, requested: false, dismissed: false };
  assert.equal(chest.chestShouldShow(base), false, 'waits for the queue on its own');
  assert.equal(chest.chestShouldShow({ ...base, autoReady: true }), true);
  assert.equal(chest.chestShouldShow({ ...base, autoReady: true, dismissed: true }), false);
  assert.equal(chest.chestShouldShow({ ...base, dismissed: true, requested: true }), true);
  assert.equal(chest.chestShouldShow({ ...base, requested: true, screenFree: false }), false, 'never over a find or dialog');
  assert.equal(chest.chestShouldShow({ ...base, unclaimed: false, requested: true }), false);
});

