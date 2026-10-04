'use strict';
// Coin Map 2.0: limited coin badges and shelf row, every ride in the Coin Guide, honest counts.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const { resolveEarnedShelfSlot } = require('./helpers/earned-shelf.cjs');

const limitedCoins = loadTs('src/services/collection/limitedCoins.ts');
const IN = { active: true, ends_at: '2026-11-01T07:00:00+00:00', ends_on: '2026-10-31', returns: false };
const OUT = { active: false, ends_at: null, ends_on: null, returns: true };

test('limited badges read as real dates: "Limited · leaves Oct 31" or "returns later"', () => {
  assert.equal(limitedCoins.limitedLabel(IN), 'Limited · leaves Oct 31');
  assert.equal(limitedCoins.limitedLabel({ ...IN, ends_on: '2026-12-01' }), 'Limited · leaves Dec 1');
  assert.equal(limitedCoins.limitedLabel(OUT), 'Limited · returns later');
  assert.equal(limitedCoins.limitedLabel({ ...IN, ends_on: null }), 'Limited');
  assert.equal(limitedCoins.limitedLabel(null), null, 'a permanent coin has no badge');
  assert.equal(limitedCoins.limitedDayLabel('2026-02-30'), null);
  assert.equal(limitedCoins.limitedDayLabel('2026-10-31T23:59:59Z'), null, 'only a park-local calendar day');
  assert.equal(limitedCoins.outOfRotation({ limited: OUT }), true);
  assert.equal(limitedCoins.outOfRotation({ limited: IN }), false);
  assert.equal(limitedCoins.outOfRotation({}), false);
});

test('the shelf splits permanent coins from a Limited row that keeps owned coins for good', () => {
  const permanent = { id: 1, name: 'Castle', limited: null };
  const inPlay = { id: 2, name: 'Peter Pan', limited: IN };
  const ownedPast = { id: 3, name: 'Autopia', limited: OUT };
  const missedPast = { id: 4, name: 'Dumbo', limited: OUT };
  const split = limitedCoins.splitParkShelf([permanent, inPlay], [inPlay, ownedPast, missedPast],
    [{ id: 3, name: 'Autopia', limited: OUT, times_completed: 1 }]);
  assert.deepEqual(plain(split.permanent.map(t => t.id)), [1]);
  assert.deepEqual(plain(split.limited.map(t => t.id)), [2, 3], 'in rotation first, then owned coins out of rotation');
  assert.deepEqual(plain(split.allLimited.map(t => t.id)), [2, 3, 4], 'the guide still lists a missed coin');
  // A server without the limited list: an owned limited coin still keeps its slot.
  const fallback = limitedCoins.splitParkShelf([permanent], [], [{ id: 3, name: 'Autopia', limited: OUT }]);
  assert.deepEqual(plain(fallback.limited.map(t => t.id)), [3]);
});

const guide = loadTs('src/services/collection/coinGuide.ts', {
  '../../api/endpoints/rides': { getRides: async () => [] },
});
const ride = (id, name, extra = {}) => ({ id, name, park_id: 8, type: 'attraction', task_id: null, ...extra });

test('the Coin Guide lists every cataloged ride once: a coin row, else a Line Play row', () => {
  const coins = [
    { id: 57, name: 'Thunder Mountain' }, { id: 64, name: 'Haunted Mansion' }, { id: 70, name: 'Pirates' },
    { id: 71, name: 'Castle' }, { id: 200, name: "Peter Pan's Flight", limited: OUT },
  ];
  const rides = [
    ride(629, 'Big Thunder Mountain Railroad', { task_id: 57 }),
    ride(623, 'Haunted Mansion Holiday', { task_id: 64 }),
    ride(588, 'Pirates of the Caribbean'),
    ride(587, "Peter Pan's Flight"),
    ride(570, 'Star Wars: Rise of the Resistance'),
    ride(999, 'Star Wars: Rise of the Resistance'),
    ride(580, 'Indiana Jones Adventure', { type: 'ride' }),
    ride(585, 'Main Street Cinema', { type: 'show' }),
    ride(700, 'Bengal Barbecue', { type: 'restaurant' }),
    ride(701, 'Linked To An Archived Coin', { task_id: 4040 }),
  ];
  const rows = guide.buildCoinGuide({ parkId: 8, coins, rides });
  assert.deepEqual(plain(rows.filter(r => r.kind === 'coin').map(r => r.task.id)), [57, 64, 70, 71, 200]);
  assert.deepEqual(plain(rows.filter(r => r.kind === 'line').map(r => r.name)),
    ['Star Wars: Rise of the Resistance', 'Indiana Jones Adventure', 'Linked To An Archived Coin'],
    'task_id first, then name and alias; shows and food stay out; no ride twice');
  const search = query => rows.filter(r => r.search.includes(query)).map(r => r.name);
  assert.deepEqual(plain(search('big thunder')), ['Thunder Mountain'], 'a coin is found by its ride name too');
  assert.deepEqual(plain(search('pirates of the')), ['Pirates']);
  assert.deepEqual(plain(search('rise of')), ['Star Wars: Rise of the Resistance']);
  assert.ok(guide.isGuideRide({ type: 'Attraction' }));
  assert.ok(!guide.isGuideRide({ type: undefined }));
  // No catalog (offline or an older server): the guide is just its coins.
  assert.equal(guide.buildCoinGuide({ parkId: 8, coins, rides: [] }).length, coins.length);
});

test('the guide plays a coinless ride in line, badges limited coins and searches every row', () => {
  const directory = fs.readFileSync('src/screens/ParkRideDirectory.tsx', 'utf8');
  assert.match(directory, /buildCoinGuide\(\{ parkId: parkId \?\? 0, coins: \[\.\.\.rides, \.\.\.limited\]/,
    'rides match against every coin, even in the RIDES view');
  assert.match(directory, /row\.search\.includes\(normalizedQuery\)/);
  assert.match(directory, /LINEPLAY · GAMES WHILE YOU WAIT/);
  assert.match(directory, /onPlayRideInLine\?\.\(ride\)/);
  assert.match(directory, /limitedLabel\(task\.limited\)/);
  assert.match(directory, /onChooseGoal && !resting/, 'an out-of-rotation coin offers no goal or play');
  const park = fs.readFileSync('src/screens/ParkScreen.tsx', 'utf8');
  assert.match(park, /resolveRideContextOrOffline\(Number\(park\), catalogRide\.name\)/, 'Line Play opens through resolveRide');
  assert.match(park, /loadParkRides\(Number\(park\)\)/);
  assert.match(park, /<Ribbon text="Limited Coins" \/>/);
  assert.match(park, /shelfRows\('limited', limitedShelf\)/);
  assert.match(park, /shelfRows\('normal', passportMode\s*\n?\s*\? permanentTasks/);
  assert.match(park, /rides=\{permanentTasks\}/, 'the passport count stays permanent coins only');
});

test('the park header counts the limited rotation apart from the permanent X/Y', () => {
  const header = fs.readFileSync('src/screens/ParkCollectionHeader.tsx', 'utf8');
  assert.match(header, /LIMITED \{limitedCollected\}\/\{limitedAvailable\}/);
  assert.match(header, /\{limitedAvailable > 0 && /);
  const park = fs.readFileSync('src/screens/ParkScreen.tsx', 'utf8');
  assert.match(park, /limitedAvailable=\{currentPark\.limited_coins_available\}/);
});

test('map markers: the limited badge sits under rush, adventure and goal', () => {
  const m = loadTs('src/screens/ExploreScreen/mapMarkerPresentation.ts');
  assert.equal(m.markerBadge({ rush: false, adventure: false, goal: false, owned: false, limited: true }), 'limited');
  assert.equal(m.markerBadge({ rush: false, adventure: false, goal: false, owned: true, limited: true }), 'limited');
  assert.equal(m.markerBadge({ rush: false, adventure: false, goal: true, owned: false, limited: true }), 'goal');
  assert.equal(m.markerBadge({ rush: true, adventure: false, goal: false, owned: false, limited: true }), 'rush');
  assert.equal(m.markerBadge({ rush: false, adventure: false, goal: false, owned: false }), 'new');
  const marker = fs.readFileSync('src/screens/ExploreScreen/TaskMarker.tsx', 'utf8');
  assert.match(marker, /task\.limited\?\.active \? limitedLabel\(task\.limited\)/);
  // One chip per island (the declutter places it): rush, adventure and goal outrank the leave date.
  assert.match(marker, /tagKind === 'limited' && limited/);
});

test('a limited coin out of rotation explains itself and cannot be played', () => {
  const { unfoundCoinCopy } = loadTs('src/components/UnfoundCoinModal.tsx', {
    react: { useContext() {}, useState() {} }, 'react/jsx-runtime': { jsx() {}, jsxs() {} },
    'react-native': { StyleSheet: { create: v => v } }, 'react-native-modal': {}, 'expo-haptics': {}, 'expo-image': {},
    '../context/SoundEffectProvider': {}, './Ribbon': {}, './YellowButton': {}, './MysteryCoinArtwork': {},
    './collection/CoinSocket': {}, '../ui/GameIcon': {}, '../hooks/useReducedGameMotion': {},
  });
  const base = { isSecret: false, isArchived: false, isResting: false, kind: 'ride' };
  assert.equal(unfoundCoinCopy({ ...base, limited: IN }).ribbon, 'Limited Coin');
  assert.equal(unfoundCoinCopy({ ...base, limited: IN }).hint, 'Here until Oct 31. Win its challenge before it rotates out.');
  assert.match(unfoundCoinCopy({ ...base, limited: OUT }).hint, /returns in a later rotation/);
  assert.equal(unfoundCoinCopy({ ...base, limited: OUT }).challenge, 'Ride Challenge');
  assert.equal(unfoundCoinCopy(base).ribbon, 'Ride Coin');
  const source = fs.readFileSync('src/components/UnfoundCoinModal.tsx', 'utf8');
  assert.match(source, /const playable = !isSecret && !isArchived && !outOfRotation;/);
});

test('a won limited coin flies to its slot on the Limited row', () => {
  const request = { attemptId: 4, assetId: 50, taskId: 5, taskType: 'task', firstCollection: true };
  const empty = { normal: [], normalCompleted: [], secret: [], secretCompleted: [], archived: [], archivedCompleted: [] };
  const limited = [{ id: 2, asset_id: 20 }, { id: 5, asset_id: 50 }];
  const slot = resolveEarnedShelfSlot(request, { ...empty, normal: [{ id: 1, asset_id: 10 }], normalCompleted: [{ id: 5, asset_id: 50, times_completed: 1 }],
    limited, limitedCompleted: [{ id: 5, asset_id: 50, times_completed: 1 }] });
  assert.deepEqual(plain({ section: slot.section, row: slot.row, column: slot.column }), { section: 'limited', row: 0, column: 1 });
  assert.equal(resolveEarnedShelfSlot(request, empty), null, 'older callers without a Limited row still resolve');
});

test('Line Play shares one catalog request with the guide and its alias matching', async () => {
  let requests = 0;
  const resolver = loadTs('src/services/lineplay/resolveRide.ts', {
    '../../api/endpoints/rides': { getRides: async parkId => { requests++; return [
      { id: 588, name: 'Pirates of the Caribbean', park_id: parkId, type: 'attraction', task_id: 70 },
      { id: 570, name: 'Star Wars: Rise of the Resistance', park_id: parkId, type: 'attraction', task_id: null },
    ]; } },
  });
  assert.deepEqual(plain(resolver.rideKeysForTask(8, 'Pirates')), ['pirates', 'pirates of the caribbean']);
  assert.deepEqual(plain(resolver.rideKeysForTask(8, 'Rise')), ['rise']);
  const rides = await resolver.loadParkRides(8);
  assert.equal(rides.length, 2);
  const rise = await resolver.resolveRideContextOrOffline(8, 'Star Wars: Rise of the Resistance');
  assert.equal(rise.rideId, 570);
  assert.equal((await resolver.resolveRideContext(8, 'Pirates', null)).rideId, 588);
  assert.equal(requests, 1);
});
