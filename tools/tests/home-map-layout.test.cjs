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
  assert.match(marker, /<View style=\{\[styles\.timePill, inRange \? styles\.tagNear : styles\.tagFar, \(chromeless \|\| !tag\) && styles\.chromeOff\]\}>/);
  assert.match(read('src/screens/ExploreScreen/HomeFindMarker.tsx'), /distance=\{distance\}/);
});

test('home map: only a slim one-line chip ever sits over the map (peeks, map states), never a card', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /<HomeHuntChip message=\{chip \?\? statusChip\} onDismiss=\{chip \? dismissChip : noop\} \/>/);
  for (const card of ['HomeHuntCard', 'TripGoalCard', 'HomeTicketProgress', 'HomeFocusCard', 'HomeMapStatusCard']) {
    assert.doesNotMatch(home, new RegExp(`<${card}\\b`), `${card} never renders on the home map`);
  }
  // A tapped far find: a one-line peek with its name, gone after about 4 s.
  assert.match(home, /const PEEK_TTL_MS = 5000;/);
  assert.match(home, /text: peekLine\(item\.name, distance\), ttlMs: PEEK_TTL_MS/);
  const chip = read('src/screens/ExploreScreen/HomeHuntChip.tsx');
  assert.match(chip, /Gesture\.Pan\(\)/, 'swipe to dismiss');
  assert.match(chip, /setTimeout\(\(\) => dismissRef\.current\(\), ms \?\? HUNT_CHIP_TTL_MS\)/, 'auto-dismiss');
  assert.match(chip, /numberOfLines=\{1\}/, 'one line');
  assert.match(chip, /wrap: \{ alignSelf: 'center', maxWidth: 320 \}/, 'sized to its content');
  // Ticket progress and the park story are small chips in the top HUD row; the park pill never shows at home.
  assert.match(home, /<HomeHudChips top=\{hudTop\} onWidth=\{setHudWidth\}/);
  assert.match(read('src/screens/ExploreScreen/HomeHudChips.tsx'), /height: 30,/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /pillHidden=\{!park \|\| suggestionSlots\.right !== 'project'\}/);
});

test('home map: peek and map-state lines', () => {
  assert.equal(look.peekLine('Golden Crisp Churro', 70), '70 m away · Golden Crisp Churro');
  assert.equal(look.peekLine(null, null), 'Walk closer');
  // Distance first: a 40-character name is what truncates (the line cuts at its tail), never the distance.
  const long = look.peekLine('Golden Crisp Churro Deluxe Bucket Supreme', 135);
  assert.ok(long.startsWith('135 m away · '), long);
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


const edges = loadTs('src/screens/ExploreScreen/findEdges.ts');

test('home map polish: the chip row and the peek keep clear of finds (and of the shark and edge tokens)', () => {
  const size = { width: 402, height: 690 };
  // A find right under the chip row's home spot pushes the row down a row; nothing there keeps it home.
  assert.equal(edges.hudRowTop([], 12, 200), 12);
  assert.equal(edges.hudRowTop([edges.findFootprint({ x: 60, y: 30 })], 12, 200), 12 + 2 * 38);
  assert.equal(edges.hudRowTop([edges.findFootprint({ x: 300, y: 30 })], 12, 200), 12, 'a find beside the row does not move it');
  // The peek docks at 190 unless something sits there; then the nearest clear slot.
  assert.equal(edges.peekBottom([], size, 190, 50, 240), 190);
  const timer = edges.findFootprint({ x: 201, y: 690 - 190 - 18 });
  const shark = edges.sharkFootprint({ x: 201, y: 345 });
  const moved = edges.peekBottom([timer, shark], size, 190, 50, 240);
  assert.notEqual(moved, 190);
  const rect = { x: (402 - 240) / 2, y: 690 - moved - 36, w: 240, h: 36 };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.ok(!hit(rect, timer), 'the peek never covers another find (its leaving-soon timer)');
  assert.ok(!hit(rect, shark), 'nor the shark');
  // The finger find reaches higher (the cue hovers above it).
  assert.ok(edges.findFootprint({ x: 0, y: 100 }, true).y < edges.findFootprint({ x: 0, y: 100 }).y);
});

test('home map polish: peek timing, hold and pan; status lines stay; edge tokens clear the chip row', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /const onUserPan = useCallback\(\(\) => setChip\(null\), \[\]\);/);
  assert.match(home, /onUserPan=\{onUserPan\}/);
  assert.match(read('src/components/Map.tsx'), /isUserInteraction\) return;\n\s*onUserPan\?\.\(\);/);
  const chip = read('src/screens/ExploreScreen/HomeHuntChip.tsx');
  assert.match(chip, /onPressIn=\{stop\} onPressOut=\{\(\) => start\(message\.ttlMs\)\}/, 'held while pressed');
  assert.match(chip, /Gesture\.Pan\(\)\.enabled\(message\?\.ttlMs !== 0\)/, 'status lines cannot be swiped away');
  // Layout animation and swipe on separate views (the "Open debugger to view warnings" toast).
  assert.match(chip, /style=\{styles\.wrap\}>\s*<Animated\.View style=\{slide\}>/);
  // Live boss bar: rowTop moves down, and the edge tokens (48 pt) centre below the chip row.
  assert.match(home, /const edgeTop = rowTop \+ 30 \+ 8 \+ 24;/);
  assert.match(home, /insetTop=\{edgeTop\}/);
  assert.match(read('src/screens/ExploreScreen/FindEdgeArrows.tsx'), /\{ top: insetTop, bottom: 190, side: 30 \}/);
});

test('home map polish: story chip wears Alex\'s paper-and-pencil; chip hit slops never overlap', () => {
  const hud = read('src/screens/ExploreScreen/HomeHudChips.tsx');
  assert.match(hud, /require\('..\/..\/..\/assets\/images\/home\/story-chip\.webp'\)/);
  assert.doesNotMatch(hud, /sparkle/);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../../assets/images/home/story-chip.webp')));
  const gap = Number(hud.match(/flexDirection: 'row', gap: (\d+)/)[1]);
  const slop = hud.match(/const HIT = \{ top: 8, bottom: 8, left: (\d+), right: (\d+) \}/);
  assert.ok(Number(slop[1]) + Number(slop[2]) < gap, 'the two chips\' hit slops stay apart');
});

test('home map chrome budget: at most 10% of the map, find tags and badges counted (committed captures)', () => {
  const { chromeCoverage, BUDGET } = require('../map-chrome-coverage.cjs');
  const dir = path.resolve(__dirname, 'fixtures/map-chrome');
  const rect = JSON.parse(fs.readFileSync(path.join(dir, 'map-chrome.json'), 'utf8'));
  const bare = fs.readFileSync(path.join(dir, 'bare.png'));
  for (const state of ['idle', 'peek']) {
    const { share } = chromeCoverage(fs.readFileSync(path.join(dir, `${state}.png`)), bare, rect);
    assert.ok(share <= BUDGET, `${state}: ${(share * 100).toFixed(1)}% of the map is chrome`);
    assert.ok(share > 0.02, `${state}: the capture shows chrome at all`);
  }
  // Markers' chrome is part of the bare pass, so tags count.
  assert.match(read('src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx'), /chromeless=\{BARE \|\|/);
});
