'use strict';
/**
 * Fix round w3 (Nov 18, 2026), lane shelf: shelf, Profile and words.
 * Each test fails without its fix (T ids in the names).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('T122: the map, LinePlay, Wait Times and the shelf read one name for each ride', () => {
  const { plainRideName, withPlainField } = loadTs('src/helpers/plainRideName.ts');
  // [coin row on the map and shelf, ride catalog for LinePlay, wait-times feed] as the scratch data spells them.
  const rides = [
    ['Thunder Mountain', 'Big Thunder Mountain Railroad', 'Big Thunder Mountain Railroad', 'Big Thunder Mountain Railroad'],
    ['Tiki Room', "Walt Disney's Enchanted Tiki Room", 'Walt Disney’s Enchanted Tiki Room', 'Enchanted Tiki Room'],
    ['Haunted Mansion', 'Haunted Mansion Holiday', 'Haunted Mansion Holiday', 'Haunted Mansion'],
    ["It's A Small World", '"it\'s a small world"', '“it’s a small world”', "It's a Small World"],
    ['The Many Adventures Of Pooh', 'The Many Adventures of Winnie the Pooh', 'The Many Adventures of Winnie the Pooh', 'The Many Adventures of Winnie the Pooh'],
    ['Pirates', 'Pirates of the Caribbean', 'Pirates of the Caribbean', 'Pirates of the Caribbean'],
    ['Smugglers', 'Millennium Falcon: Smugglers Run', 'Millennium Falcon: Smugglers Run', 'Millennium Falcon: Smugglers Run'],
    ['Astro Blasters', 'Buzz Lightyear Astro Blasters', 'Buzz Lightyear Astro Blasters™', 'Buzz Lightyear Astro Blasters'],
    ['Matterhorn', 'Matterhorn Bobsleds', 'Matterhorn Bobsleds', 'Matterhorn Bobsleds'],
    ['Star Tours', 'Star Tours - The Adventures Continue', 'Star Tours – The Adventures Continue', 'Star Tours'],
    ['Mr. Toad', "Mr. Toad's Wild Ride", "Mr. Toad's Wild Ride", "Mr. Toad's Wild Ride"],
    ['Submarine Voyage', 'Finding Nemo Submarine Voyage', 'Finding Nemo Submarine Voyage', 'Finding Nemo Submarine Voyage'],
    ['Jungle Cruise', 'Jungle Cruise', 'Jungle Cruise', 'Jungle Cruise'],
  ];
  for (const [coin, catalog, feed, want] of rides) {
    assert.equal(plainRideName(coin), want, coin);
    assert.equal(plainRideName(catalog), want, catalog);
    assert.equal(plainRideName(feed), want, feed);
  }
  const rows = withPlainField([{ ride_name: 'Tiki Room', id: 1 }, { ride_name: 'Jungle Cruise', id: 2 }], 'ride_name');
  assert.equal(rows[0].ride_name, 'Enchanted Tiki Room');
  // Every source of ride names passes through it: coins, the catalog, the feed, Ride Coins, the shelf lists, the story.
  for (const file of ['src/api/endpoints/parks/getTasks.ts', 'src/api/endpoints/parks/getSecretTasks.ts',
    'src/api/endpoints/parks/getLimitedTasks.ts', 'src/api/endpoints/parks/getArchivedTasks.ts',
    'src/api/endpoints/players/parks/getCompletedTasks.ts', 'src/api/endpoints/players/parks/getCompletedSecretTasks.ts',
    'src/api/endpoints/players/parks/getCompletedArchivedTasks.ts', 'src/api/endpoints/rides/index.ts',
    'src/api/endpoints/parks/queue-times/getWikiTimes.ts', 'src/api/endpoints/me/current-redeemables.js',
    'src/api/endpoints/me/ride-coins/index.ts', 'src/api/endpoints/me/ride-coins/show.ts', 'src/api/endpoints/me/park-day-recap.ts',
    'src/api/endpoints/me/trip-goal.ts']) {
    assert.match(read(file), /plainRideName|withPlainNames|withPlainField|withPlainTaskNames/, file);
  }
  assert.doesNotMatch(read('src/screens/parkRideAvailability.ts'), /FEED_ALIASES/, 'no second alias table');
});

test('T132: one park name: the guide, the raid banner, Profile and the story say Disneyland', () => {
  const { parkLabel, shortParkName } = loadTs('src/helpers/parkName.ts');
  assert.equal(parkLabel({ name: 'Disneyland Park' }), 'Disneyland');
  assert.equal(parkLabel({ name: 'Disneyland Park', display_name: 'Disneyland' }), 'Disneyland');
  assert.equal(parkLabel({ name: 'Disney California Adventure Park' }), 'California Adventure');
  assert.equal(parkLabel({ name: "Universal's Islands of Adventure" }), 'Islands of Adventure');
  assert.equal(shortParkName('Universal Studios Hollywood'), 'Universal Studios Hollywood');
  assert.match(read('src/components/guide/useMapGuide.ts'), /parkName: park \? parkLabel\(park\) : null/);
  assert.match(read('src/components/home/HomeLive.tsx'), /\{parkLabel\(park\)\}<\/Text>/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /parkName=\{park\.name \? parkLabel\(park\) : null\}/, 'the guide card park chip');
  assert.match(read('src/screens/ParkDayRecapCard.tsx'), /shortParkName\(recap\.park_name\)/);
});

test('T132: copy slips: plural Tickets, the raid line, the Ride Part tip, and your Standings row in words', () => {
  const boss = read('src/components/boss/BossJoinCard.tsx');
  assert.doesNotMatch(boss, /\$\{tickets\} Tickets`/, 'never "1 Tickets"');
  assert.match(read('src/components/boss/BossWinCard.tsx'), /It got away with \$\{hpLeftPct\}% left\./);
  assert.doesNotMatch(read('src/components/boss/BossWinCard.tsx'), /Only \$\{hpLeftPct\}% left!/);
  assert.match(read('src/services/help/helpTopics.ts'), /first_ride_part: \{ title: 'You earned a Ride Part!'/);
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, /`\$\{score\} \$\{unitWord\(model\.metric, score\)\}`/, 'your row says "2 ride coins", not "2 of 211"');
  assert.match(board, /\{`\$\{plus\} more`\}/, 'the chase pill says "1 more", not "+1"');
});

test('T135: before a first coin the launch tip is about the first minute', () => {
  const { launchFactPool, pickLaunchFact, LATER_TIP } = loadTs('src/screens/launchFacts.ts');
  const shipped = require('../../src/api/defaults/crumbs.json').labels.splash_screen_facts;
  const fresh = launchFactPool(shipped, 0);
  assert.ok(fresh.includes('Walk to the glowing coin on the park map, then tap PLAY!'));
  assert.ok(fresh.every(f => !/level up|Ride Parts|Energy|LinePlay|Tap GO/i.test(f)), 'nothing the player has not met');
  assert.ok(LATER_TIP.test('Level up a ride coin with its Ride Parts and Energy!'));
  assert.equal(launchFactPool(shipped, 3).length, shipped.length, 'after a first coin every tip can show');
  assert.equal(pickLaunchFact([], 0, () => 0), 'Walk to the glowing coin on the park map, then tap PLAY!');
  assert.match(read('src/screens/LoadingScreen.tsx'), /pickLaunchFact\(labels\.splash_screen_facts, player\?\.completed_tasks_count\)/);
  assert.match(read('src/screens/SplashScreen.tsx'), /sample\(launchFactPool\(all, wins\)\)/);
});

test('T136: the shelf opened from home tells you to tap an empty slot, never "Tap GO"', () => {
  const steps = loadTs('src/components/Tutorial/steps.ts');
  assert.equal(steps.getStepsForSequence('park', { inPark: false })[0].subtitle, 'Tap an empty slot to plan your next coin.');
  assert.match(steps.getStepsForSequence('park', { inPark: true })[0].subtitle, /Tap GO/);
  assert.match(read('src/screens/ParkScreen.tsx'), /startTutorial\('park', \{ inPark: inThisPark \}\)/);
});

test('T127: the coin card tip sits above the cost box, so OK never lands on GET RIDE PARTS', () => {
  const modal = read('src/components/CoinLevelingModal.tsx');
  const tip = modal.indexOf('<OneTimeTip id="coin_card"');
  const cost = modal.indexOf('{/* ── Upgrade Cost Section ── */}');
  const button = modal.indexOf('{/* ── Level Up Button ── */}');
  assert.ok(tip > 0 && tip < cost && cost < button, 'tip, then cost box, then the button');
});

test('T124/T137: the coin card says something true about the ride: its land and one fan note', () => {
  const { rideFact } = loadTs('src/services/collection/rideFacts.ts');
  assert.equal(rideFact('Jungle Cruise').land, 'Adventureland');
  assert.match(rideFact('Jungle Cruise').note, /O2H is water backwards/);
  assert.equal(rideFact('Thunder Mountain').land, 'Frontierland', 'every spelling of a ride finds its note');
  assert.equal(rideFact('Tiki Room').land, 'Adventureland');
  assert.equal(rideFact('Castle', 8).land, 'Fantasyland');
  assert.equal(rideFact('Castle', 2), null, 'a short sight name only means Disneyland\'s castle at Disneyland');
  assert.equal(rideFact('Some New Ride'), null, 'no note is ever guessed');
  const src = read('src/services/collection/rideFacts.ts');
  for (const m of src.matchAll(/note: '((?:[^'\\]|\\.)*)'/g)) assert.ok(m[1].length <= 72, m[1]);
  assert.doesNotMatch(src, /\u2014/, 'no em dashes');
  assert.match(read('src/components/CoinLevelingModal.tsx'), /<RideFactLine rideName=\{rideCoin\.ride_name\}/);
});

test('T134: Ride Coins, the shelf and Profile read one server total per park', () => {
  const { mergeParkTotals, allParksTotal } = loadTs('src/services/collection/parkTotals.ts');
  // The catalog counts the Limited rotation too (40 rows); the server's permanent shelf says 35.
  const catalog = new Map([[8, { name: 'Disneyland', owned: 2, total: 40 }], [2, { name: 'Magic Kingdom', owned: 0, total: 30 }]]);
  const merged = mergeParkTotals(catalog, [{ id: 8, ride_coins_collected: 2, ride_coins_available: 35 }]);
  assert.deepEqual({ ...merged.get(8) }, { name: 'Disneyland', owned: 2, total: 35 });
  assert.deepEqual({ ...merged.get(2) }, { name: 'Magic Kingdom', owned: 0, total: 30 }, 'no server row: keep the catalog');
  assert.deepEqual({ ...allParksTotal(merged) }, { owned: 2, total: 65 });
  assert.deepEqual({ ...mergeParkTotals(catalog, [{ id: 8, ride_coins_collected: null, ride_coins_available: 35 }]).get(8) }, { name: 'Disneyland', owned: 2, total: 40 });
  const screen = read('src/screens/CoinShelfScreen.tsx');
  assert.match(screen, /return mergeParkTotals\(byPark, visited\);/);
  assert.match(screen, /`\$\{across\.owned\} of \$\{across\.total\}`/);
  assert.doesNotMatch(screen, /\$\{ownedCount\} of \$\{catalogRides\.length\}/);
});

test('T229: fewer currencies on screen: the shop wallet shows Tickets and Shark Coins; Keys hide until held', () => {
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  const wallet = /const WALLET[^=]*= \[([\s\S]*?)\];/.exec(shop)[1];
  assert.deepEqual([...wallet.matchAll(/key: '(\w+)'/g)].map(m => m[1]), ['tickets', 'coins']);
  assert.match(read('src/components/Stats.tsx'), /keys !== null && keys > 0 \? \[\{ label: 'Keys'/);
});

test('T141: the coin flips over to its new level with a rim that reads at a glance (UI thread, Reduce Motion skips it)', () => {
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.match(modal, /\{ scaleX: Math\.max\(0\.04, coinFlip\.value\) \}/, 'a flat flip: a 3D turn cut the coin behind the header');
  assert.doesNotMatch(modal, /rotateY: `\$\{coinFlip/);
  const flipAt = modal.indexOf('coinFlip.value = uiSequence(');
  const reducedAt = modal.lastIndexOf('if (reducedMotionRef.current) {', flipAt);
  const elseAt = modal.indexOf('} else {', reducedAt);
  assert.ok(reducedAt > 0 && elseAt < flipAt, 'the flip runs only on the full-motion path');
  assert.match(modal, /uiTiming\(0\.04, \{ duration: 160, easing: EASE\.in \}\), uiSpring\(1, SPRING\.pop\)/, 'a spring, never linear movement');
  assert.match(modal, /coinShake, coinFlip\]\.forEach\(value => cancelUi\(value\)\); coinFlip\.value = 1;/, 'stopped and reset with the rest of the show');
  const { COIN_TIERS } = loadTs('src/constants/coinTiers.ts');
  assert.notEqual(COIN_TIERS[1].ring.toLowerCase(), '#ffffff', 'Shiny never looks like Classic white');
  assert.ok(COIN_TIERS[1].ringWidth > COIN_TIERS[0].ringWidth, 'a thicker rim from Level 2');
});

test('T128: the shelf opens on the tab holding your coins, fades in once, and Finn waits for a painted shelf', () => {
  const { openingTab } = loadTs('src/services/collection/shelfModel.ts');
  const split = { rides: [{ id: 1 }, { id: 2 }], sights: [{ id: 3 }] };
  assert.equal(openingTab(split, [], new Set([3]), ['rides', 'sights']), 'sights', 'a sights-only shelf never opens on Rides 0 of 25');
  assert.equal(openingTab(split, [{ id: 9 }], new Set([9]), ['rides', 'sights', 'limited']), 'limited');
  assert.equal(openingTab(split, [], new Set([1, 3]), ['rides', 'sights']), 'rides');
  assert.equal(openingTab(split, [], new Set(), ['rides', 'sights']), 'rides');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /entering=\{seed \|\| reducedMotion \? undefined : FadeIn\.duration\(240\)\}/, 'one fade under 300 ms');
  // Merge w3: lane platform T180 pins the same rule in its own order.
  assert.match(park, /!loading && !progressStale && !!currentPark && !tutorialActive/, 'no lesson over a failed or blank shelf');
  // Hold-fix 3: the newest coin (when known) picks the tab first; see fix-w3-hold-3 T128.
  assert.match(park, /const first = openingTab\(split, limitedShelf, ownedNormal, tabs, glowTaskId\(newest, ownedNormal\)\);/);
});

test('T219: News and the Stamp Books sit on the plain seabed plate; Standings keeps its OTA 2 plate (Dustin, Nov 19)', () => {
  const plates = read('src/constants/backdrops.ts');
  assert.match(plates, /SEABED_PLATE = require\('\.\.\/\.\.\/assets\/images\/screens\/park\/background-new\.png'\)/);
  assert.match(plates, /STANDINGS_PLATE = require\('\.\.\/\.\.\/assets\/images\/screens\/leaderboard\/standings-bg\.png'\)/);
  for (const file of ['src/screens/NewsScreen.tsx', 'src/screens/StampBookScreen.tsx', 'src/screens/FriendStampBookScreen.tsx']) {
    assert.doesNotMatch(read(file), /standings-bg\.png|STANDINGS_PLATE/, file);
    assert.match(read(file), /SEABED_PLATE/, file);
  }
  const standings = read('src/screens/LeaderboardScreen.tsx');
  assert.equal((standings.match(/source=\{STANDINGS_PLATE\}/g) || []).length, 2, 'both Standings shells');
  assert.doesNotMatch(standings, /SEABED_PLATE/);
});
