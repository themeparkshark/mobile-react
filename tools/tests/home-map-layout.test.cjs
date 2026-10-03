const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const chest = loadTs('src/screens/ExploreScreen/dailyChestPresence.ts');
const look = loadTs('src/screens/ExploreScreen/findPresentation.ts');
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

test('home map: find info lives on the marker as one small tag (distance far away, timer in the last minutes)', () => {
  const marker = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.doesNotMatch(marker, /TAP TO GRAB/);
  assert.doesNotMatch(marker, /WALK CLOSER/);
  assert.doesNotMatch(marker, /formatLeavesIn/);
  assert.match(marker, /LEAVING_SOON_MS = 5 \* 60_000/);
  assert.match(marker, /const far = !inRange && distance != null \? formatFindDistance\(distance\) : '';/);
  assert.match(marker, /\[far \|\| null, leavingSoon\]\.filter\(Boolean\)\.join\(' · '\)/);
  // Always mounted: a marker view never changes its layout.
  assert.match(marker, /<View style=\{\[styles\.timePill, \(chromeless \|\| !tag\) && styles\.chromeOff\]\}>/);
  assert.match(read('src/screens/ExploreScreen/HomeFindMarker.tsx'), /distance=\{distance\}/);
});

test('home map: only a slim one-line chip ever sits over the map (peeks, map states), never a card', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /<HomeHuntChip message=\{chip \?\? statusChip\} onDismiss=\{chip \? dismissChip : noop\} \/>/);
  for (const card of ['HomeHuntCard', 'TripGoalCard', 'HomeTicketProgress', 'HomeFocusCard', 'HomeMapStatusCard']) {
    assert.doesNotMatch(home, new RegExp(`<${card}\\b`), `${card} never renders on the home map`);
  }
  // A tapped far find: a one-line peek with its name, gone after about 4 s.
  assert.match(home, /const PEEK_TTL_MS = 4000;/);
  assert.match(home, /text: peekLine\(item\.name, distance\), ttlMs: PEEK_TTL_MS/);
  const chip = read('src/screens/ExploreScreen/HomeHuntChip.tsx');
  assert.match(chip, /Gesture\.Pan\(\)/, 'swipe to dismiss');
  assert.match(chip, /setTimeout\(onDismiss/, 'auto-dismiss');
  assert.match(chip, /numberOfLines=\{1\}/, 'one line');
  assert.match(chip, /wrap: \{ alignSelf: 'center', maxWidth: 320 \}/, 'sized to its content');
  // Ticket progress and the park story are small chips in the top HUD row; the park pill never shows at home.
  assert.match(home, /<HomeHudChips top=\{rowTop\}/);
  assert.match(read('src/screens/ExploreScreen/HomeHudChips.tsx'), /height: 30,/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /pillHidden=\{!park \|\| suggestionSlots\.right !== 'project'\}/);
});

test('home map: peek and map-state lines', () => {
  assert.equal(look.peekLine('Golden Crisp Churro', 70), 'Golden Crisp Churro · walk closer · 70 m');
  assert.equal(look.peekLine(null, null), 'walk closer');
  const base = { homeLocationConfirmed: true, isLoading: false, empty: false, loadError: false };
  assert.equal(look.mapStatusLine(base), null, 'finds up: no line at all');
  assert.equal(look.mapStatusLine({ ...base, homeLocationConfirmed: false }).text, 'Checking your map...');
  assert.equal(look.mapStatusLine({ ...base, empty: true, loadError: true }).action, 'retry');
  assert.equal(look.mapStatusLine({ ...base, empty: true }).action, 'collections');
  assert.equal(look.mapStatusLine({ ...base, empty: true, rankLine: '#4 this week' }).text, 'All quiet · #4 this week');
  assert.equal(look.mapStatusLine({ ...base, loadError: true }).text, 'Saved map · tap to refresh');
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

