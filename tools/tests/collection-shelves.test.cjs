'use strict';
// WS3: collection data, tier tokens, park grouping, shelf prefetch and copy.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

test('coin tiers are brand blue, white and gold; level 1 is Classic; unknown levels clamp', () => {
  const tiers = loadTs('src/constants/coinTiers.ts');
  assert.deepEqual(plain(tiers.COIN_TIERS.map(t => t.name)), ['Classic', 'Silver', 'Gold', 'Prismatic', 'Legendary']);
  assert.equal(tiers.coinTier(0).name, 'Classic');
  assert.equal(tiers.coinTier(99).name, 'Legendary');
  assert.equal(tiers.coinLevelLabel(3), 'Level 3 · Gold');
  const neon = /#(ec4899|a78bfa|c4b5fd|c084fc|8b5cf6|f472b6|9c27b0)/i;
  for (const file of ['src/constants/coinTiers.ts', 'src/components/CoinUpgradeDemo.tsx', 'src/components/CoinLevelingModal.tsx',
    'src/components/PostWinRewardsModal.tsx', 'src/screens/CoinShelfScreen.tsx', 'src/components/TaskCoinModal.tsx'])
    assert.ok(!neon.test(fs.readFileSync(file, 'utf8')), `${file} has a neon or purple tier colour`);
});

function collectionStore(pages) {
  let reads = 0, singles = 0;
  const store = loadTs('src/context/CoinCollection.tsx', {
    react: { useCallback: fn => fn, useEffect() {}, useState: value => [value, () => {}] },
    '../api/endpoints/me/ride-coins': { __esModule: true, default: async () => { reads++; return { data: pages[Math.min(reads, pages.length) - 1] }; } },
    '../api/endpoints/me/ride-coins/show': { __esModule: true, default: async id => { singles++; const coin = pages.at(-1).find(c => c.id === id);
      if (!coin) { const error = new Error('404'); error.response = { status: 404 }; throw error; } return { data: coin }; } },
  });
  return { store, get reads() { return reads; }, get singles() { return singles; } };
}

test('one shared collection request serves every caller and a single coin read never refetches the list', async () => {
  const coins = [{ id: 1, park_id: 2, park_name: 'Alpha', current_level: 1 }, { id: 2, park_id: 1, park_name: 'Beta', current_level: 3 }];
  const h = collectionStore([coins]);
  const [a, b] = await Promise.all([h.store.loadCoinCollection(5), h.store.loadCoinCollection(5)]);
  assert.equal(h.reads, 1); assert.equal(a, b);
  assert.equal((await h.store.loadCoin(5, 2)).current_level, 3); assert.equal(h.singles, 0);
  assert.equal(await h.store.loadCoin(5, 9, { force: true }), null); assert.equal(h.singles, 1);
  h.store.upsertCoin(5, { id: 2, current_level: 4 });
  assert.equal(h.store.cachedCoin(5, 2).current_level, 4);
  h.store.setFeaturedCoin(5, 1);
  assert.deepEqual(plain(h.store.cachedCoins(5).map(c => !!c.is_featured)), [true, false]);
  assert.equal(h.store.cachedCoins(6), null, 'another player never sees this cache');
  await h.store.loadCoinCollection(5, { force: true }); assert.equal(h.reads, 2);
  h.store.resetCoinCollection();
});

test('the All Parks index groups coins by park in server order, with park-less coins last', () => {
  const { groupCoinsByPark, isUpgradeReady } = loadTs('src/context/CoinCollection.tsx', {
    react: {}, '../api/endpoints/me/ride-coins': {}, '../api/endpoints/me/ride-coins/show': {},
  });
  const groups = groupCoinsByPark([
    { id: 1, park_id: 2, park_name: 'Alpha' }, { id: 3, park_id: null }, { id: 2, park_id: 2, park_name: 'Alpha' },
    { id: 4, park_id: 1, park_name: 'Beta' },
  ]);
  assert.deepEqual(plain(groups.map(g => [g.parkName, g.coins.map(c => c.id)])), [['Alpha', [1, 2]], ['Beta', [4]], ['More coins', [3]]]);
  const coin = { is_unlocked: true, current_level: 1, max_level: 5, available_parts: 2, parts_to_next_level: 2, energy_to_next_level: 10 };
  assert.equal(isUpgradeReady(coin, 10), true);
  assert.equal(isUpgradeReady(coin, 9), false);
  assert.equal(isUpgradeReady({ ...coin, current_level: 5 }, 100), false);
});

test('coin links still pointing at the All Parks screen forward to the coin’s own park shelf', () => {
  const screen = fs.readFileSync('src/screens/CoinShelfScreen.tsx', 'utf8');
  const start = screen.indexOf('export function focusCoinDestination');
  const body = screen.slice(start, screen.indexOf('\n}\n', start) + 2).replace(/: readonly CollectedRideCoin\[\]|: number \| undefined/g, '');
  const focusCoinDestination = new Function(`${body.replace('export ', '')}; return focusCoinDestination;`)();
  const coins = [{ id: 7, park_id: 3, times_collected: 2 }, { id: 8, park_id: null, times_collected: 1 }];
  assert.deepEqual(focusCoinDestination(coins, 7, 5), { park: 3, player: 5, focusCoin: { assetId: 7 } });
  assert.equal(focusCoinDestination(coins, 8, 5), null);
  assert.equal(focusCoinDestination(coins, 99, 5), null);
  assert.equal(focusCoinDestination(coins, 7, undefined), null);
});

test('a park shelf prefetch is used once and only while fresh', async () => {
  let reads = 0;
  const stub = { __esModule: true, default: async () => { reads++; return []; } };
  const prefetch = loadTs('src/services/collection/parkShelfPrefetch.ts', {
    '../../api/endpoints/parks/getArchivedTasks': stub, '../../api/endpoints/parks/getSecretTasks': stub,
    '../../api/endpoints/parks/getTasks': stub, '../../api/endpoints/players/parks/getCompletedArchivedTasks': stub,
    '../../api/endpoints/players/parks/getCompletedSecretTasks': stub, '../../api/endpoints/players/parks/getCompletedTasks': stub,
    '../../api/endpoints/players/visited-parks/getPark': { __esModule: true, default: async () => { reads++; return { id: 1 }; } },
  });
  prefetch.prefetchParkShelf(1, 5, 1000); assert.equal(reads, 7);
  const first = await prefetch.loadParkShelf(1, 5, 1000 + prefetch.MAX_AGE_MS);
  assert.equal(first.visitedPark.id, 1); assert.equal(reads, 7, 'the prefetch was reused');
  await prefetch.loadParkShelf(1, 5, 1000 + prefetch.MAX_AGE_MS); assert.equal(reads, 14, 'a prefetch is consumed once');
  prefetch.prefetchParkShelf(1, 5, 0);
  await prefetch.loadParkShelf(1, 5, prefetch.MAX_AGE_MS + 1); assert.equal(reads, 28, 'a stale prefetch is ignored');
});

test('park days read as calendar dates, never raw ISO strings', () => {
  const { parkDayLabel } = loadTs('src/services/collection/parkDayLabel.ts');
  assert.equal(parkDayLabel('2026-09-27'), 'Sunday, September 27');
  assert.equal(parkDayLabel('2026-04-12', { withYear: true }), 'Sunday, April 12, 2026');
  assert.equal(parkDayLabel('2026-02-30'), '2026-02-30');
  assert.equal(parkDayLabel(null), '');
});

test('challenge copy: ride vs coin vs secret, and out-of-Tickets copy follows what really pays Tickets', () => {
  const copy = loadTs('src/components/rewards/challengeCopy.ts');
  assert.equal(copy.challengeRibbon('task', 'ride').title, 'Ride Challenge');
  assert.equal(copy.challengeRibbon('task', null).title, 'Coin Challenge');
  assert.equal(copy.challengeRibbon('secret_task', 'ride').title, 'Secret Challenge');
  for (const { title } of [copy.challengeRibbon('task', 'ride'), copy.challengeRibbon('task'), copy.challengeRibbon('secret_task')])
    assert.ok(title.length <= 22, `${title} fits the ribbon`);
  assert.match(copy.outOfTicketsCopy({ sources: { line: true, home: true }, rescuePassUsedToday: false }).body, /queue adventure while you wait/);
  assert.equal(copy.outOfTicketsCopy({ sources: { line: true, line_remaining_today: 0, home: true }, rescuePassUsedToday: true }).body,
    'Today’s Rescue Pass is used. Today’s queue Tickets are collected. Home finds earn Tickets for your next park day.');
  assert.doesNotMatch(copy.outOfTicketsCopy({ sources: { line: false, home: false }, rescuePassUsedToday: false }).body, /home|queue/i);
  assert.match(copy.outOfTicketsCopy({ rescuePassUsedToday: false }).body, /Queue adventures and home finds/);
});

test('unfound coin copy is type-aware and leads with the gameplay action', () => {
  const source = fs.readFileSync('src/components/UnfoundCoinModal.tsx', 'utf8');
  assert.match(source, /text=\{onPlayInLine \? 'Play in Line' : 'Show on Park Map'\}/);
  const { unfoundCoinCopy } = loadTs('src/components/UnfoundCoinModal.tsx', {
    react: { useContext() {}, useState() {} }, 'react/jsx-runtime': { jsx() {}, jsxs() {} },
    'react-native': { StyleSheet: { create: v => v } }, 'react-native-modal': {}, 'expo-haptics': {}, 'expo-image': {},
    '../context/SoundEffectProvider': {}, './Ribbon': {}, './YellowButton': {}, './MysteryCoinArtwork': {},
    './collection/CoinSocket': {}, '../ui/GameIcon': {}, '../hooks/useReducedGameMotion': {},
  });
  assert.equal(unfoundCoinCopy({ isSecret: false, isArchived: false, isResting: false, kind: 'ride' }).ribbon, 'Ride Coin');
  assert.equal(unfoundCoinCopy({ isSecret: false, isArchived: false, isResting: false }).challenge, 'Coin Challenge');
  assert.match(unfoundCoinCopy({ isSecret: true, isArchived: false, isResting: true }).hint, /resting this week/);
});

test('missing coins show their own art as a quiet socket; secret coins stay a mystery', () => {
  const unfound = fs.readFileSync('src/components/UnfoundCoinModal.tsx', 'utf8');
  assert.match(unfound, /isSecret \|\| !task\.coin_url\s*\n?\s*\? <MysteryCoinArtwork/);
  const park = fs.readFileSync('src/screens/ParkScreen.tsx', 'utf8');
  assert.match(park, /const coinSize = Math\.min\(60, shelfCoinSize\)/, 'earned and missing slots share one size');
  assert.doesNotMatch(park, /size=\{shelfCoinSize\}/);
});

test('park header only calls a reviewed ride coin a ride; food stands get neutral goal copy', () => {
  const copy = loadTs('src/services/collection/nextCoinCopy.ts');
  assert.equal(copy.nextCoinEyebrow('ride'), 'YOUR NEXT RIDE COIN');
  assert.equal(copy.nextCoinEyebrow(null), 'YOUR NEXT COIN');
  assert.equal(copy.ticketsReadyHint(undefined), 'Tickets ready. Head there to play.');
  assert.equal(copy.ticketsReadyHint('ride'), 'Tickets ready. Head to the ride.');
  const open = [{ id: 1, coin_kind: null }], done = [{ id: 7, coin_kind: 'ride' }];
  assert.equal(copy.goalCoinKind(7, open, done), 'ride');
  assert.equal(copy.goalCoinKind(1, open, done), null);
  assert.equal(copy.goalCoinKind(99, open, done), null);
  assert.equal(copy.goalCoinKind(undefined, open), null);
  const header = fs.readFileSync('src/screens/ParkCollectionHeader.tsx', 'utf8');
  assert.ok(!header.includes("'YOUR NEXT RIDE COIN'"), 'header must take the eyebrow from nextCoinEyebrow');
  assert.match(fs.readFileSync('src/screens/ParkScreen.tsx', 'utf8'), /nextCoinKind=\{goalCoinKind\(/);
});

test('stamp book cards and detail are bright parchment, never dark or purple', () => {
  const src = fs.readFileSync('src/screens/StampBookScreen.tsx', 'utf8');
  for (const dark of ['#1a1510', 'rgba(60,40,20', '#9C27B0', "backgroundColor: 'rgba(0,0,0,0.4)'"])
    assert.ok(!src.includes(dark), `StampBookScreen still has ${dark}`);
  assert.match(src, /card: \{\n\s+backgroundColor: '#fff8e4'/);
});

test('unfound coin copy: rescue pass wording follows the coin kind and Ride Part is singular for one', () => {
  const src = fs.readFileSync('src/components/UnfoundCoinModal.tsx', 'utf8');
  assert.ok(!src.includes("may be available at the ride.'"), 'rescue pass copy must not assume a ride');
  assert.match(src, /kind === 'ride' \? 'at the ride' : 'at this spot'/);
  assert.match(src, /Ride Part\{task\.ride_parts_reward === 1 \? '' : 's'\}/);
});

test('park shelf loads on its underwater art, not a grey page', () => {
  const src = fs.readFileSync('src/screens/ParkScreen.tsx', 'utf8');
  assert.match(src, /\{loading && <ImageBackground[^]*?background-new\.png[^]*?<Loading \/>/);
});
