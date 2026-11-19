'use strict';
/* Fix pass w4, lane rewards-pacing: new things arrive one at a time, each with a moment. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

/* T097: coin levels, Energy and Ride Parts wait for rung 3. */
test('T097 the first wins name coins, Tickets and XP only; Parts and Energy fly to the Shelf with no chip', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => false } });
  const row = input => [...win.winRewardChips(input)].map(c => c.label);
  const firstWin = { coins: 10, tickets: 1, parts: 1, energy: 10, xp: 25, lineParts: 1, coinLevelsOpen: false, dailyOpen: false };
  assert.deepEqual(row(firstWin), ['Shark Coins', 'Ticket', 'XP']);
  assert.equal(win.silentParts(firstWin), 2);
  assert.equal(win.silentEnergy(firstWin), 10);
  assert.deepEqual(row({ ...firstWin, coinLevelsOpen: true }), ['Shark Coins', 'Ticket', 'Ride Parts', 'Energy', 'XP']);
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.match(card, /if \(quietParts > 0\) fly\(FLY_ART\.parts, Math\.min\(quietParts, 3\), WIN_FLY_ROUTES\.parts\);/);
});

test('T097 the win that opens coin levels teaches them in one pictured line, only while the rung is new', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => false } });
  const line = win.coinLevelsIntro({ rungNew: true, parts: 1, energy: 10 });
  assert.match(line, /^\[icon:parts\] \[icon:energy\] /);
  assert.ok(line.replace(/\[icon:[a-z]+\] /g, '').split(' ').length <= 8, 'one short line');
  assert.equal(win.coinLevelsIntro({ rungNew: false, parts: 1, energy: 10 }), null);
  assert.equal(win.coinLevelsIntro({ rungNew: true, parts: 0, energy: 0 }), null, 'nothing to point at, no lesson');
  assert.match(read('src/components/PostWinRewardsModal.tsx'), /if \(levelsIntro\) coinLevelsRung\.markSeen\(\);/);
});

test('T097 before rung 3 the shelf shows no Level up button and your coin opens its simple card', () => {
  const arrival = read('src/components/CoinShelfArrival.tsx');
  assert.match(arrival, /const levelsOpen = useRung\('coin_levels'\)\.open;/);
  assert.match(arrival, /\{levelsOpen && <Pressable accessibilityRole="button" accessibilityLabel="Level up this coin"/);
  const coin = read('src/components/TaskCoinModal.tsx');
  assert.match(coin, /const simpleCard = readOnly \|\| coinUnavailable \|\| !levelsOpen;/);
  assert.match(coin, /\{simpleCard \? <Modal/);
  const book = read('src/screens/SetCollection/BookParts.tsx');
  assert.match(book, /\(levelsOpen \|\| chip\.icon !== 'energy'\)/);
  assert.doesNotMatch(book, /prizeChips\(reward\)\.filter\(chip => chip\.icon !== 'crown'\)\.map/, 'every prize list goes through useShownPrizes');
});

/* T098: live events wait for the day's first coin; home raids for the first coin and rung 3. */
function ladderStore() {
  const disk = new Map();
  let clock = Date.parse('2026-11-18T17:00:00Z');
  const R = loadTs('src/services/reveal/revealLadder.ts', {
    react: { useCallback: fn => fn, useSyncExternalStore: (_s, get) => get() },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => (disk.has(key) ? disk.get(key) : null), setItem: async (key, value) => { disk.set(key, value); },
    } },
    '../../gamekit/core/playerStorage': { gameSavesPlayer: () => '77' },
  });
  R.__ladderTest.reset(() => clock);
  return { R, tick: ms => { clock += ms; }, ready: () => R.__ladderTest.whenReady().then(() => new Promise(r => setImmediate(r))) };
}

test('T098 a park day has no live events until its first coin, preview ids included', async () => {
  const s = ladderStore();
  s.R.feedLadder({ flags: { live_events: true, reveal_all: true }, atPark: true, progress: { coinsWon: 12, revealAll: true } });
  await s.ready();
  s.R.feedLadder({ progress: { coinsWon: 12, revealAll: true } });
  assert.equal(s.R.rungState('events').open, true, 'reveal_all opens the rung');
  assert.equal(s.R.wonCoinToday(), false, 'but the day has no coin yet');
  s.tick(60000);
  s.R.feedLadder({ progress: { coinsWon: 13, revealAll: true } });
  assert.equal(s.R.wonCoinToday(), true);
  s.tick(24 * 3600000);
  assert.equal(s.R.wonCoinToday(), false, 'a new day waits for its own first coin');
  const map = read('src/screens/ExploreScreen.tsx');
  assert.match(map, /const raidOnMap = raidActive && coinLevelsRung\.open && parkOpenNow && liveDayStarted;/);
  assert.match(map, /const eventsShown = eventsRung\.open && liveDayStarted;/);
  assert.match(map, /const liveRushes = liveDayStarted \? rushes : NO_RUSHES;/);
  assert.doesNotMatch(map, /eventsRung\.open &&(?! liveDayStarted)/, 'every event surface reads eventsShown');
});

test('T098 home shows no raid before the first ride coin and coin levels', () => {
  const bar = loadTs('src/components/home/homeLiveBar.ts');
  assert.equal(bar.homeRaidsAllowed({ coinLevelsOpen: true, coinsWon: 0 }), false, 'preview id, day 1, no coin');
  assert.equal(bar.homeRaidsAllowed({ coinLevelsOpen: false, coinsWon: 2 }), false);
  assert.equal(bar.homeRaidsAllowed({ coinLevelsOpen: true, coinsWon: 1 }), true);
  const live = { parks: [{ park_id: 8, raid: { boss: 'kraken' } }], next_boss: { at: 'x', park_name: 'Disneyland' }, team_names: null };
  const quiet = bar.withoutRaids(live);
  assert.equal(quiet.parks[0].raid, null);
  assert.equal(quiet.next_boss, null);
  assert.equal(bar.homeLiveBar(quiet, false), null);
  assert.match(read('src/components/home/HomeLive.tsx'), /const live = sentLive && !raidsAllowed \? withoutRaids\(sentLive\) : sentLive;/);
});

/* T101: Ticket grants are seen, and the meter math reads right. */
test('T101 one treat meter line everywhere: the count is the most it takes', () => {
  const free = loadTs('src/services/guide/freeTickets.ts');
  assert.equal(free.treatMeterLine(3), 'Up to 3 treats = 1 Ticket');
  assert.equal(free.treatMeterLine(2), 'Up to 2 treats = 1 Ticket');
  assert.equal(free.treatMeterLine(1), '1 more treat = 1 Ticket', 'the next one is the sure one');
  assert.equal(free.treatMeterLine(null), 'Up to 3 treats = 1 Ticket');
  for (const file of ['src/services/guide/guideCopy.ts', 'src/screens/ExploreScreen/homeFindCopy.ts', 'src/screens/ExploreScreen/HomeTicketProgress.tsx']) {
    const src = read(file);
    assert.match(src, /treatMeterLine\(/, `${file} uses the one meter line`);
    assert.doesNotMatch(src, /more \$\{[^}]+\} = 1 Ticket|treats = 1 Ticket`/, `${file} has no second copy`);
  }
});

test('T101 the park day starter plays as a moment: fly to the header with its reason, banner folded', () => {
  const g = loadTs('src/services/rewards/ticketGrants.ts');
  g.resetTicketGrantsForTests();
  let heard = 0;
  g.onTicketGrant(() => { heard += 1; });
  g.announceTicketGrant({ amount: 2, reason: 'Park day starter' });
  g.announceTicketGrant({ amount: 0, reason: 'nothing' });
  assert.equal(heard, 1, 'a zero grant is never a moment');
  const next = g.takeTicketGrant();
  assert.equal(g.ticketGrantLine(next), '+2 Tickets: Park day starter');
  assert.equal(g.takeTicketGrant(), null);
  assert.match(read('src/context/LocationProvider.tsx'), /announceTicketGrant\(\{ amount: newPark\?\.welcome_tickets_granted \?\? 0, reason: 'Park day starter' \}\);/);
  const b = loadTs('src/api/broadcastFilter.ts');
  assert.deepEqual(plain(b.visibleBroadcasts(['Park day starter: +2 Tickets. Start a ride challenge!', 'Welcome to Disneyland Park!'], true)),
    ['Welcome to Disneyland Park!']);
  // T097 (device run): the first coin's "You gained 10 Energy!" banner showed on the shelf; it folds like coins and Parts.
  assert.deepEqual(plain(b.visibleBroadcasts(['You gained 10 Energy!', 'You reached Level 3!'], true)), ['You reached Level 3!']);
  const host = read('src/components/rewards/TicketGrantMoment.tsx');
  assert.match(host, /targetPosition: 'tickets'/);
  assert.match(host, /gap\.current = setTimeout/, 'the gap timer survives re-renders');
  assert.match(host, /return \(\) => clearTimeout\(settle\);/, 'a cover coming up during the settle beat cancels it');
  assert.match(read('src/screens/ExploreScreen.tsx'), /<TicketGrantMoment calm=\{mapFocused && mapCalm && !finnOwnsMap && !mapCovered/);
});

/* T102: a level-up has its moment. */
test('T102 level lines become one moment (in their turn), and a stamp claim\'s level counts too', () => {
  const lv = loadTs('src/services/rewards/levelUps.ts');
  lv.resetLevelUpsForTests();
  let heard = 0;
  lv.onLevelUp(() => { heard += 1; });
  const banners = lv.takeLevelUps(['You earned 25 XP!', 'You reached Level 3!', 'Welcome to Disneyland Park!']);
  assert.deepEqual(plain(banners), ['You earned 25 XP!', 'Welcome to Disneyland Park!'], 'the level line leaves the banner list');
  assert.equal(heard, 1);
  assert.equal(lv.takeLevelMoment(), 3);
  lv.noteLevelUp(3);
  assert.equal(heard, 1, 'never the same level twice');
  lv.noteLevelUp(4); lv.noteLevelUp(5);
  assert.equal(lv.takeLevelMoment(), 5, 'two quick levels fold into one moment');
  assert.equal(lv.levelUpLine(5, true), 'Level 5! Your Level 5 Chest is in Rewards');
  assert.equal(lv.levelUpLine(5, false), 'You reached Level 5!');
  assert.match(read('src/hooks/useAxiosSetup.ts'), /routeBroadcasts\(shown, messages => \{ const banners = takeLevelUps\(messages\);/,
    'routed through the win card hold, so it waits behind the card');
  assert.match(read('src/components/retention/useRetention.tsx'), /if \(\(answer\.levels_gained \?\? 0\) > 0\) noteLevelUp\(answer\.level \?\? null\);/);
  assert.match(read('src/Root.tsx'), /\{!!player && <LevelUpMoment \/>\}/);
});

/* T100, T224, T242: a stamp claim shows the stamps, every prize, and a title. */
test('T100 CLAIM ALL opens the stamps face up; the tap claims, prizes land with pictures, fly home, one result line', () => {
  const model = loadTs('src/services/retention/rewardsModel.ts', { '../words/playerWords': { kidWords: s => s, passGainWords: () => '' } });
  assert.equal(model.stampRevealSubtitle(['Disneyland']), 'Disneyland stamp. Tap it!');
  assert.equal(model.stampRevealSubtitle(['Disneyland', 'Night Show']), 'Disneyland, Night Show. Tap to claim!');
  assert.equal(model.stampRevealSubtitle(['A', 'B', 'C', 'D', 'E']), 'A, B, C and 2 more. Tap to claim!');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /case 'stamps': void openStampClaim\(\); return;/);
  assert.match(hook, /closedArt=\{face\} openArt=\{face\}/, 'the stamp itself is what you tap');
  assert.match(hook, /const face = first\?\.art \? \{ uri: first\.art \} : STAMP_FALLBACK_ART;/, 'no uploaded art: the Stamp Book passport, never a gift');
  assert.match(hook, /onOpen=\{\(\) => \{ void claimStamps\(\); \}\} onDone=\{\(\) => finishStamps\(v\)\}/);
  assert.match(hook, /send\('xp', paid\.xp, 'xp', 240\);/, 'XP flies home too');
  assert.match(hook, /setRewardsNote\(stampClaimNote\(sum, v\.waiting\)\);/);
});

test('T224 T242 a stamp title shows as New title, worn when the server says so', () => {
  const model = loadTs('src/services/retention/rewardsModel.ts', { '../words/playerWords': { kidWords: s => s, passGainWords: () => '' } });
  assert.equal(model.stampTitleLine('Explorer', false), 'New title: Explorer');
  assert.equal(model.stampTitleLine('Explorer', true), "New title: Explorer. You're wearing it!");
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /answer\.title_worn === true \|\| nested === true/);
  assert.match(hook, /\{!!v\.title && <View style=\{styles\.nextRow\}>/);
  assert.match(read('src/api/endpoints/me/stamps.ts'), /title_worn\?: boolean/);
});

/* T106: a veteran never gets beginner sheets; one lesson per app open. */
test('T106 the help pages and the treats intro skip veterans, and never share one app open', async () => {
  const s = ladderStore();
  s.R.feedLadder({ flags: {}, atPark: false, progress: { coinsWon: 4 } });
  await s.ready();
  assert.equal(s.R.isVeteranNow(), false);
  s.R.feedLadder({ progress: { coinsWon: 5 } });
  assert.equal(s.R.isVeteranNow(), true);
  const map = read('src/screens/ExploreScreen.tsx');
  assert.match(map, /const helpPageDue = !!park && atParkNow && !veteran && !introThisOpen\.current && helpPageSeen === false/);
  assert.match(map, /const homeIntroAllowed = homeIntroMayPresent\(homeIntroQueue\) && !veteran && lessonOpen\.current !== appOpenId;/);
  assert.match(map, /lessonOpen\.current = appOpenId;\n\s+setHelpPageSeen\(true\);/);
});

/* T115 and N12: day one shows one thing to claim at a time. */
test('T115 N12 a fresh player sees the chest first, then the stamps as one claim; never 5 to claim', () => {
  const model = loadTs('src/services/retention/rewardsModel.ts', { '../words/playerWords': { kidWords: s => s, passGainWords: () => '' } });
  const none = { dailyChest: null, daily3: null, weekly: null, levelChest: null, trail: null, stamps: null, events: null };
  const dayOne = { ...none, dailyChest: { unclaimed: true, day: 1, of: 7 }, stamps: { claimable: 4 } };
  assert.deepEqual(plain(model.rewardsRows(dayOne)).map(r => r.key), ['daily_chest']);
  assert.equal(model.rewardsCount(dayOne), 1, 'the walk-lc-new badge said 5');
  const opened = { ...dayOne, dailyChest: { unclaimed: false, day: 1, of: 7 } };
  assert.deepEqual(plain(model.rewardsRows(opened)).map(r => [r.key, r.ready]), [['stamps', 1]]);
  assert.equal(model.rewardsCount(opened), 1);
  const retry = { ...dayOne, stamps: { claimable: 2, retry: true } };
  assert.deepEqual(plain(model.rewardsRows(retry)).map(r => r.key), ['daily_chest', 'stamps'], 'a stamp owed after a failed claim never hides');
});

/* T114: a Trail Box finished while walking has a moment. */
test('T114 a Trail Box that finishes walking pulses Rewards once with a Box ready! label', () => {
  const src = read('src/components/map/TrailReadyPulse.tsx');
  const pure = loadTs('src/components/map/RewardsButton.tsx', {
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
    'expo-image': { Image: () => null },
    'react-native': { Pressable: () => null, StyleSheet: { create: x => x }, Text: () => null, View: () => null },
    'react-native-svg': { __esModule: true, default: () => null, Circle: () => null },
    '../../gamekit/Haptics': { haptic() {} }, '../../ui': { BRAND: {}, GameIcon: () => null, SHADOW: { card: {} } },
    './NewTag': { __esModule: true, default: () => null }, '../guide/flyAnchors': { useFlyAnchor: () => ({}) },
  });
  assert.equal(pure.trailBoxJustReady(null, 1, true), false, 'the first read of the map is not a new box');
  assert.equal(pure.trailBoxJustReady(0, 1, true), true);
  assert.equal(pure.trailBoxJustReady(1, 1, true), false);
  assert.equal(pure.trailBoxJustReady(1, 0, true), false, 'opening a box is not a pulse');
  assert.equal(pure.trailBoxJustReady(0, 1, false), false, 'before Trail Boxes unlock, nothing');
  assert.match(src, /withSequence\(withSpring\(1\.18, SPRING\.pop\), withSpring\(1, SPRING\.settle\)\)/, 'a spring on the UI thread');
  assert.match(src, /if \(!reduced\) pulse\.value =/, 'Reduce Motion keeps only the label');
  assert.match(read('src/screens/ExploreScreen.tsx'), /<TrailReadyPulse pulseKey=\{trailPulse\}>/);
});

/* T120: no blocking card after a catch. */
test('T120 the first catch shows a 2 s toast (no card, no button); later catches show nothing', () => {
  const map = read('src/screens/ExploreScreen.tsx');
  assert.match(map, /const FIRST_CATCH_TOAST_MS = 2000;/);
  assert.match(map, /completeSequence\('home_first_find'\);\n\s+showMapToast\(\{ type: 'reward', icon: 'sparkle', duration: FIRST_CATCH_TOAST_MS,/);
  assert.match(map, /if \(collectedOnce\.current && hasCompleted\('onboarding'\) && !hasCompleted\('home_first_find'\)\)/, 'once per player');
  const provider = read('src/components/Tutorial/TutorialProvider.tsx');
  assert.match(provider, /const completeSequence = useCallback\(\(sequence: TutorialSequence\) => \{/);
  assert.match(provider, /persistCompleted\(newCompleted\);\n  \}, \[completedSequences, persistCompleted\]\);/, 'saved like a finished card');
});

test('T100 a slow stamp read never leaves CLAIM ALL doing nothing: the newest read shows the stamps, else a line says so', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /try \{ read = await getStamps\(\); lastStampsRead\.current = read; \} catch \{ read = lastStampsRead\.current; \}/);
  assert.match(hook, /if \(!read\) \{ setRewardsNote\(`Your stamps did not load\. \$\{tryAgainLine\(\)\}`\); return; \}/);
  assert.match(hook, /for \(const st of current\.claims\) \{/, 'the stamps on screen are the ones claimed');
  assert.match(hook, /catch \{ left = Math\.max\(failed, stamps - claimed\); \}/);
});
