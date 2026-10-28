'use strict';
/**
 * One shelf count everywhere (core loop blueprint 4.5 "Shelf counts", 5.4).
 * The shelf header, the coin guide search and the win card all read the
 * server's permanent-shelf numbers: the park's ride_coins_collected /
 * ride_coins_available on the shelf, and the milestone progress (the same
 * permanent catalog on the server, CollectionMilestoneService) on the win card.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const shelf = loadTs('src/services/collection/shelfModel.ts');

test('the shelf count is the server total, never a count of rows on screen', () => {
  assert.deepEqual(plain(shelf.shelfTotals({ ride_coins_collected: 9, ride_coins_available: 35 })), { collected: 9, available: 35 });
  assert.equal(shelf.shelfCountLabel({ collected: 9, available: 35 }), '9 of 35 coins');
  assert.equal(shelf.shelfCountLabel({ collected: 1, available: 1 }), '1 of 1 coin');
  // An older server without the totals: the shelf's own fallback, never NaN.
  assert.deepEqual(plain(shelf.shelfTotals({}, { collected: 2, available: 20 })), { collected: 2, available: 20 });
  assert.deepEqual(plain(shelf.shelfTotals(null)), { collected: 0, available: 0 });
  assert.deepEqual(plain(shelf.shelfTotals({ ride_coins_collected: 40, ride_coins_available: 35 })), { collected: 35, available: 35 }, 'never over 100%');
});

test('the shelf header, the coin guide search and the win card read the same numbers', () => {
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /const totals = shelfTotals\(currentPark,/);
  assert.match(park, /collected=\{totals\.collected\}\s*\n\s*available=\{totals\.available\}/, 'the header shows the one total');
  assert.match(park, /shelfCount=\{shelfCountLabel\(totals\)\}/, 'the search shows the same total');
  const directory = read('src/screens/ParkRideDirectory.tsx');
  assert.match(directory, /`FIND A COIN · \$\{shelfCount\.toUpperCase\(\)\}`/);
  assert.doesNotMatch(directory, /FIND A RIDE OR COIN \(\$\{rows\.length\}\)/, 'no second count of rows (it counted LinePlay rows too)');
  const header = read('src/screens/ParkCollectionHeader.tsx');
  assert.match(header, /`\$\{shownCollected\} of \$\{available\}`/);
  // The win card's milestone numbers come straight from the server progress (same permanent catalog).
  const win = read('src/components/rewards/postWinModel.ts');
  assert.match(win, /const \{ park_name: park, collected, available \} = result\.progress;/);
});

test('tabs: Rides and Sights split the permanent coins; a park without a ride list keeps one tab', () => {
  const coins = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const split = plain(shelf.shelfTabs(coins, [1, 3]));
  assert.deepEqual(split.rides.map(c => c.id), [1, 3]);
  assert.deepEqual(split.sights.map(c => c.id), [2, 4]);
  assert.equal(split.split, true);
  assert.deepEqual(plain(shelf.shelfTabs(coins, null)).rides.length, 4);
  assert.deepEqual(plain(shelf.visibleTabs(true, 2, 0, 0)), ['rides', 'sights']);
  assert.deepEqual(plain(shelf.visibleTabs(true, 2, 0, 3)), ['rides', 'sights', 'limited'], 'Past events live at the bottom of Limited');
  assert.deepEqual(plain(shelf.visibleTabs(false, 0, 1, 0)), ['rides', 'limited']);
});

test('the trophy shelf names the next trophy in wins (every coin win here counts)', () => {
  assert.equal(shelf.nextTrophyLine(9), '3 more wins here for Bronze');
  assert.equal(shelf.nextTrophyLine(11), '1 more win here for Bronze');
  assert.equal(shelf.nextTrophyLine(12), '38 more wins here for Silver');
  assert.equal(shelf.nextTrophyLine(100), 'All three trophies are yours!');
  assert.deepEqual(plain(shelf.nextTrophy(0)), { name: 'Bronze', at: 12, left: 12 });
  const modal = loadTs('src/components/ParkTrophyModal.tsx', {
    'expo-image': {}, react: { useState() {} }, 'react/jsx-runtime': { jsx() {}, jsxs() {} }, 'react-native': {}, 'react-native-modal': {},
    '../components/Button': {}, '../config': {}, '../ui/upper': {}, '../ui/modalLayers': {},
  });
  assert.equal(modal.trophyCopy({ unlocked: false, unlockCount: 12, wins: 9 }), '3 more wins here');
  assert.equal(modal.trophyCopy({ unlocked: true, unlockCount: 12, wins: 14 }), 'Yours! 14 wins here');
  assert.match(read('src/components/ParkTrophyModal.tsx'), /useNativeModalLayer\(visible, 'show'\)/, 'the trophy reveal goes through the modal layer');
});

test('the park day story card sits on top after a park day and on milestone days', () => {
  assert.equal(shelf.storyOnTop({ atPark: false, ridesWonToday: 2, milestone: false }), true, 'left the park with a win');
  assert.equal(shelf.storyOnTop({ atPark: true, ridesWonToday: 2, milestone: false }), false, 'still playing: it waits lower');
  assert.equal(shelf.storyOnTop({ atPark: true, ridesWonToday: 1, milestone: true }), true, 'a 25/50/75/100% day');
  assert.equal(shelf.storyOnTop({ atPark: false, ridesWonToday: 0, milestone: false }), false, 'no story without a win');
  assert.equal(shelf.milestoneToday({ collected: 9, available: 35 }, 1), true, '8 to 9 of 35 crosses 25%');
  assert.equal(shelf.milestoneToday({ collected: 10, available: 35 }, 1), false);
  assert.equal(shelf.milestoneToday({ collected: 35, available: 35 }, 1), true, 'the full shelf');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /\{storyTop && <ParkDayRecapCard/);
  assert.match(park, /\{canChooseGoal && !storyTop && <ParkDayRecapCard/, 'one card, never two');
  assert.doesNotMatch(read('src/screens/ParkDayRecapCard.tsx'), /flexRevealOnce/, 'nothing opens full screen by itself');
});

test('parts waiting show on a slot only when the server sends them', () => {
  assert.equal(shelf.partsWaiting({ parts_waiting: 3 }), 3);
  assert.equal(shelf.partsWaiting({}), 0);
  assert.equal(shelf.partsWaiting({ parts_waiting: 'x' }), 0);
});

test('every park store opens in one tap from the shelf, with its own icon art', () => {
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, />Shops at this park</);
  assert.match(park, /RootNavigation\.navigate\('Store', \{ store: store\.id \}\)/, 'the same route as the map store button');
  assert.match(park, /source=\{\{ uri: store\.icon_url \}\}/);
  assert.match(park, /const parkStores = inThisPark \? locationPark\?\.stores \?\? \[\] : \[\];/, 'the same list the map shows at this park');
});
