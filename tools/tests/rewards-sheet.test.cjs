'use strict';
/**
 * Core loop lane rewards-unlocks (BLUEPRINT 4.3, 4.4, 5.8; October 2026):
 * WEAR IT lands worn on the item's own tab, one streak, the Rewards sheet,
 * calm chests, Daily 3 at home, Trail Boxes, Shark Pass, events and Pins on
 * their rungs.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const wear = loadTs('src/services/retention/wearReward.ts');

test('WEAR IT: the slot that holds the item names its closet tab', () => {
  const slots = { head_item: { id: 3 }, face_item: null, pin_item: { id: 41 }, background_item: { id: 9 } };
  assert.equal(wear.slotHolding(slots, 41), 'pin_item');
  assert.equal(wear.slotHolding(slots, 3), 'head_item');
  assert.equal(wear.slotHolding(slots, 77), null);
  assert.equal(wear.slotHolding(null, 3), null);
  assert.deepEqual(plain(wear.closetParams(41, 'pin_item')), { itemTypeId: 8, focusItemId: 41 });
  assert.deepEqual(plain(wear.closetParams(5, 'face_item')), { itemTypeId: 2, focusItemId: 5 });
  assert.deepEqual(plain(wear.closetParams(5, null)), { focusItemId: 5 });
  // Same tab numbers as the closet's own slot map.
  const wardrobe = read('src/helpers/wardrobe.ts');
  for (const [slot, id] of Object.entries(plain(wear.SLOT_TYPE_ID))) {
    assert.match(wardrobe, new RegExp(`${id}: '${slot}'`), `${slot} is tab ${id}`);
  }
});

test('WEAR IT puts the piece on once and never takes it off', async () => {
  const calls = [];
  const deps = (worn, after) => ({
    readLook: async () => { calls.push('look'); return { slots: worn }; },
    toggle: async id => { calls.push(`toggle ${id}`); return after; },
  });
  // Not worn yet: one toggle, the answer names the slot.
  calls.length = 0;
  let r = await wear.wearReward(12, deps({ head_item: { id: 1 } }, { head_item: { id: 1 }, neck_item: { id: 12 } }));
  assert.deepEqual(plain(r), { worn: true, slot: 'neck_item' });
  assert.deepEqual(calls, ['look', 'toggle 12']);
  // Already worn: no toggle (a toggle would take it off).
  calls.length = 0;
  r = await wear.wearReward(12, deps({ neck_item: { id: 12 } }, {}));
  assert.deepEqual(plain(r), { worn: true, slot: 'neck_item' });
  assert.deepEqual(calls, ['look']);
  // An older server without /me/look still wears it through the toggle.
  r = await wear.wearReward(12, { readLook: async () => { throw new Error('404'); }, toggle: async () => ({ hand_item: { id: 12 } }) });
  assert.deepEqual(plain(r), { worn: true, slot: 'hand_item' });
  // A failed save never throws; the closet still opens with the item pinned.
  r = await wear.wearReward(12, { readLook: async () => ({ slots: {} }), toggle: async () => { throw new Error('offline'); } });
  assert.deepEqual(plain(r), { worn: false, slot: null });
  r = await wear.wearReward(0, deps({}, {}));
  assert.deepEqual(plain(r), { worn: false, slot: null });
});

test('every chest with gear wears it through the same helper', () => {
  const live = read('src/services/retention/wearRewardLive.ts');
  assert.match(live, /navigate\('Inventory', closetParams\(itemId, slot\)\)/);
  const retention = read('src/components/retention/useRetention.tsx');
  assert.doesNotMatch(retention, /navigate\('Inventory'\)\);/, 'no bare closet open after a chest');
  assert.match(retention, /wearAndOpenCloset\(itemId, refreshPlayer\)/);
  const trail = read('src/components/trail/TrailReveal.tsx');
  assert.match(trail, /wearAndOpenCloset\(wearable\.item_id, refreshPlayer\)/);
});

test('one flame: the Daily 3 streak is the only streak number', () => {
  const flags = loadTs('src/services/retention/flags.ts', { '../../api/endpoints/platform/feature-flags': { default: async () => ({ flags: {} }) } });
  assert.equal(flags.streakOwner({ dailyThree: true, levelChests: true }), 'daily3');
  assert.equal(flags.streakOwner({ dailyThree: false, levelChests: true }), null, 'no chest flame: never a second number');
  assert.equal(flags.streakOwner(null), null);
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.doesNotMatch(chest, /day streak|displayedGift\.streak|GameIcon name="streak"/, 'the chest ladder never shows a streak');
  assert.match(chest, /`Day \$\{day\} of \$\{ladder\.length\}`/, 'the chest says Day N of 7');
  // Profile reads the same server number as the Daily 3 sheet and friend rows (daily3_streak), and only after rung 4.
  const own = read('src/services/retention/useOwnStreak.ts');
  assert.match(own, /useRung\('daily'\)\.open/);
  assert.match(own, /return daily \? streak : null/);
  for (const f of ['src/screens/social/PlayerRow.tsx', 'src/screens/LeaderboardsScreen/StandingsRow.tsx', 'src/screens/PlayerScreen.tsx']) {
    assert.match(read(f), /StreakFlame streak=\{[a-zA-Z]+\.daily3_streak\}/, `${f} shows the Daily 3 number`);
  }
});

test('rewards open by themselves only at calm moments at home (BLUEPRINT 4.3)', () => {
  const p = loadTs('src/services/retention/rewardPresence.ts');
  const base = { atPark: false, firstCatchDone: true, autoOpenUsed: false, dailyRungOpen: true };
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'daily_chest' }), true, 'home, after the first catch');
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'daily_chest', firstCatchDone: false }), false);
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'daily_chest', atPark: true }), false, 'never at a park');
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'daily_chest', autoOpenUsed: true }), false, 'one automatic open per app open');
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'level_chest' }), true);
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'level_chest', atPark: true }), false);
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'level_chest', dailyRungOpen: false }), false, 'level chests wait for rung 4');
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'freeze_saved', atPark: true }), false);
  for (const kind of ['daily3_chest', 'weekly_box', 'event_chest', 'trail_box', 'stamps']) {
    assert.equal(p.rewardMayAutoOpen({ ...base, kind }), false, `${kind} waits in the Rewards button`);
  }
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'member_look', atPark: true }), false, 'member dialogs: home first');
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'member_look', atPark: true, parkBusy: false }), true);
  // The chest card at a park shows only when asked for.
  assert.equal(p.dailyChestMayShow({ atPark: false, asked: false }), true);
  assert.equal(p.dailyChestMayShow({ atPark: true, asked: false }), false);
  assert.equal(p.dailyChestMayShow({ atPark: true, requested: true, asked: false }), true);
  assert.equal(p.dailyChestMayShow({ atPark: true, asked: true }), true);
  p.askForDailyChest(1000);
  assert.equal(p.dailyChestAsked(1000 + p.CHEST_ASK_MS - 1), true);
  assert.equal(p.dailyChestAsked(1000 + p.CHEST_ASK_MS + 1), false);
});

const model = loadTs('src/services/retention/rewardsModel.ts');
const none = { dailyChest: null, daily3: null, weekly: null, levelChest: null, trail: null, stamps: null, events: null };

test('Rewards sheet: one list of what is ready, ready first, one number', () => {
  const input = {
    ...none,
    dailyChest: { unclaimed: true, day: 3, of: 7 },
    daily3: { done: 2, total: 3, claimable: false, claimed: false, flame: 6 },
    weekly: { claimable: true },
    levelChest: { level: 4, waiting: 1 },
    trail: { ready: 2, walking: 1, nearest: 0.4, atPark: true },
    stamps: { claimable: 3 },
    events: { chests: 1 },
  };
  const rows = plain(model.rewardsRows(input));
  assert.deepEqual(rows.map(r => r.key), ['daily_chest', 'level_chest', 'weekly_box', 'trail', 'stamps', 'events', 'daily3']);
  assert.equal(rows[0].line, 'Day 3 of 7 is ready', 'the chest ladder words, never a streak');
  assert.equal(rows.find(r => r.key === 'daily3').line, '2 of 3 done');
  assert.equal(rows.find(r => r.key === 'stamps').action, 'claim_all');
  assert.equal(model.rewardsCount(input), 1 + 1 + 1 + 2 + 3 + 1);
  const sum = plain(model.rewardsSummary(input));
  assert.equal(sum.flame, 6, 'the flame shows once Daily 3 is unlocked');
  assert.equal(sum.trailRing, null, 'ready boxes: the number speaks, no ring');
  // Nothing on for a brand-new player but the daily chest: no flame, no ring, Daily 3 absent.
  const fresh = { ...none, dailyChest: { unclaimed: true, day: 1, of: 7 }, stamps: { claimable: 0 } };
  assert.deepEqual(plain(model.rewardsRows(fresh)).map(r => r.key), ['daily_chest']);
  assert.deepEqual(plain(model.rewardsSummary(fresh)), { count: 1, flame: null, trailRing: null });
  // The ring fills as the nearest box walks.
  assert.equal(model.rewardsSummary({ ...none, trail: { ready: 0, walking: 2, nearest: 0.55, atPark: true } }).trailRing, 0.55);
  // Nothing ready: the sheet still names a reason to come back.
  assert.equal(model.emptyLine({ ...none, daily3: { done: 1, total: 3, claimable: false, claimed: false, flame: 0 } }), 'Finish your Daily 3 for a chest');
  assert.equal(model.emptyLine(none), 'Your next daily chest comes tomorrow');
  // Trail rows never say park words at home.
  assert.equal(plain(model.rewardsRows({ ...none, trail: { ready: 0, walking: 1, nearest: 0.2, atPark: false } }))[0].line,
    'They walk open on your next park day');
});

test('Daily 3 at home never sends GO to a park', () => {
  const catchPark = { kind: 'catch', park: true, target: 2, title: 'Win a ride coin', hint: 'or find 2 treats', done: false };
  const home = plain(model.homeSideGoal(catchPark, false));
  assert.equal(home.title, 'Find 2 treats');
  assert.equal(home.park, false);
  assert.equal(model.goalGo(home, false), 'snack');
  assert.equal(model.goalGo(catchPark, true), 'ride', 'at a park the ride coin is the goal');
  const play = { kind: 'play', park: true, target: 2, title: 'Play 2 ride games', hint: '', done: false };
  const playHome = plain(model.homeSideGoal(play, false));
  assert.equal(playHome.parkOnly, true);
  assert.equal(model.goalGo(playHome, false), null, 'no GO at home for a park-only goal');
  for (const kind of ['chest', 'look', 'heart', 'level', 'plan', 'catch', 'play', 'mystery']) {
    const go = model.goalGo({ kind, park: true, done: false }, false);
    assert.notEqual(go, 'ride', `${kind} at home never names a ride`);
  }
  // The sheet and the hook use these rules (no old park-first goalAction).
  assert.match(read('src/components/retention/Daily3Sheet.tsx'), /homeSideGoal\(g, atPark\)[\s\S]{0,80}goalGo\(shown, atPark\)/);
  assert.match(read('src/components/retention/useRetention.tsx'), /o\.onFind\(tap === 'ride' && !atPark \? 'snack' : tap\)/);
  // The app tells the server where it is.
  const api = read('src/api/endpoints/retention/index.ts');
  assert.match(api, /setRetentionMode/);
  assert.match(read('src/components/retention/useRetention.tsx'), /setRetentionMode\(atPark \? 'park' : 'home'\)/);
});

test('Daily 3: pass points per goal after rung 5, freezes after a 3-day flame, the week starts Monday', () => {
  const today = [{ event: 'home_find', points: 35 }, { event: 'ride_coin_win', points: 120 }];
  assert.equal(model.goalPassLine({ kind: 'catch', park: false, target: 3 }, today), '+35 pass points each');
  assert.equal(model.goalPassLine({ kind: 'catch', park: true, target: 1 }, today), '+120 pass points');
  assert.equal(model.goalPassLine({ kind: 'catch', park: true, target: 2 }, today), '+120 pass points', 'one ride coin wins it: no "each"');
  assert.equal(model.goalPassLine({ kind: 'chest', park: false, target: 1 }, today), null);
  assert.equal(model.goalPassLine({ kind: 'catch', park: false, target: 3 }, null), null);
  assert.equal(model.freezesShown({ days: 2, best: 2, freezes: 0 }), false);
  assert.equal(model.freezesShown({ days: 3, best: 3, freezes: 0 }), true);
  assert.equal(model.freezesShown({ days: 0, best: 1, freezes: 1 }), true, 'a freeze you hold always shows');
  assert.match(model.weekStartsLine({ claimed: false, claimable: false, done: 1, needed: 5 }), /Your week starts Monday/);
  assert.match(model.weekStartsLine({ claimed: true, claimable: false, done: 5, needed: 5 }), /Your week starts Monday/);
  const sheet = read('src/components/retention/Daily3Sheet.tsx');
  assert.match(sheet, /passToday && !shown\.parkOnly \? goalPassLine\(shown, passToday\) : null/, 'the home side earns home points');
  assert.match(read('src/components/retention/useRetention.tsx'), /passToday=\{passOn \? passToday : null\}/);
  assert.match(sheet, /New goals tomorrow/, 'a day in words, never a ticking clock');
  assert.doesNotMatch(sheet, /resetLabel/);
});

test('rungs: Daily 3, level chests, Trail Boxes, events and the pass banner wait for their unlock', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /const wantDaily = !!flags\?\.dailyThree && dailyOpen;/);
  assert.match(hook, /const wantChestsOn = !!flags\?\.levelChests && dailyOpen;/);
  assert.match(hook, /rewardMayAutoOpen\(\{ kind, atPark/);
  assert.doesNotMatch(hook, /if \(await mayAskForPush\(\)\) \{ setView\(\{ k: 'push' \}\); return; \}/, 'no reminders ask after a chest');
  assert.match(hook, /flagOn\(flags, 'retention_push'\)/, 'the ask stays off until reminder pushes work');
  const host = read('src/components/trail/TrailHost.tsx');
  assert.match(host, /useRung\('trail'\)/);
  assert.match(host, /listenRewardsDoor\('trail'/);
  assert.match(read('src/components/liveEvents/eventsRung.ts'), /useRung\('events'\)/);
  for (const f of ['EventStatusChip', 'EventHomeChip', 'FrenzyBanner', 'EventGainToast', 'StarRideBadge', 'StarRideStamp', 'FrenzySweep']) {
    assert.match(read(`src/components/liveEvents/${f}.tsx`), new RegExp(`return useEventsOpen\\(\\) \\? <${f}Inner`), f);
  }
  const banner = read('src/components/money/SharkPassBanner.tsx');
  assert.match(banner, /useRung\('shark_pass'\)/);
  assert.match(banner, /route\?\.name\?\.toLowerCase\(\) === 'store'/, 'Supplies keeps its own door (never waits for a rung)');
});

test('Trail Boxes: known contents in pictures with no percent sign; odds only collapsed in random mode', () => {
  const trail = loadTs('src/services/trail/trailModel.ts');
  const fixed = { mode: 'fixed', contents: [{ tier: 'blue', goal_steps: 1500, rewards: [{ kind: 'coins', amount: 40 }, { kind: 'tickets', amount: 1 }] }] };
  assert.equal(trail.knownContents(fixed).length, 1);
  assert.equal(trail.oddsTiers({ ...fixed, odds: { tiers: [{ tier: 'blue' }] } }), null, 'fixed mode never shows odds');
  assert.equal(trail.goldIn({ mode: 'fixed', gold_in: 3 }), null, 'no Gold meter in a fixed order');
  assert.equal(trail.knownContents({ mode: 'random', odds: { tiers: [] } }), null);
  assert.equal(trail.goldIn({ mode: 'random', gold_in: 3 }), 3);
  // The known-contents part of the sheet draws no percent.
  const sheet = read('src/components/trail/TrailSheet.tsx');
  const inside = sheet.slice(sheet.indexOf('function Inside('), sheet.indexOf('function TierCard('));
  const knownPart = inside.slice(inside.indexOf('{known ? ('), inside.indexOf(') : odds ? ('));
  assert.ok(knownPart.length > 200);
  assert.doesNotMatch(knownPart, /percent\(|%/, 'no percent anywhere in known contents');
  assert.doesNotMatch(sheet, /GrownUpGate|askGrownUp/, 'odds are never behind the grown-up gate');
  assert.match(inside, /showChances \? 'Hide the chances' : 'Show the chances'/, 'random mode: chances in a plain collapsed section');
  assert.match(sheet, /inPark \? 'Today at the park' : 'Your walking'/, 'never park words at home');
  assert.match(sheet, /STEPS NOT COUNTED/, 'says why steps did not count');
  // The host decides home or park from the player's location when the map does not say.
  assert.match(read('src/components/trail/TrailHost.tsx'), /const inPark = inParkProp \?\? !!parkNow;/);
});

test('Shark Pass: one next prize, Step N of 50, no upsell in free claims, Daily 3 as the daily list', () => {
  const pass = loadTs('src/services/money/sharkPassModel.ts');
  const item = name => ({ type: 'item', name, slot: 'pin', art: name, icon_url: null, ready: true });
  const coins = { type: 'coins', amount: 50, ready: true };
  const tiers = [
    { tier: 1, unlocked: true, free: coins, paid: coins, free_claimed: true, paid_claimed: false },
    { tier: 2, unlocked: false, free: coins, paid: item('Paid Pin'), free_claimed: false, paid_claimed: false },
    { tier: 3, unlocked: false, free: item('Free Pin'), paid: coins, free_claimed: false, paid_claimed: false },
  ];
  const state = premium => ({ enabled: true, season: { key: 's1', points_per_tier: 400, tier_count: 50 }, tiers,
    progress: { points: 500, tier: 1, premium, claimable: 0, today: [] } });
  assert.equal(pass.nextPassPrize(state(false)).reward.name, 'Free Pin', 'a free player sees their own next free prize');
  assert.equal(pass.nextPassPrize(state(true)).reward.name, 'Paid Pin', 'an owner sees the pass row first');
  const served = { ...state(false), progress: { ...state(false).progress, next_prize: { tier: 3, track: 'free', reward: item('Server Pin'), points_away: 700 } } };
  assert.equal(pass.nextPassPrize(served).reward.name, 'Server Pin', 'the server answer wins');
  assert.equal(pass.nextPassPrize(served).pointsAway, 700);
  assert.equal(pass.stepWords(4, 50), 'Step 4 of 50');
  assert.equal(pass.questsLinkDaily3({ daily: [] }), true);
  assert.equal(pass.questsLinkDaily3({ daily: [{}] }), false);
  const banner = loadTs('src/components/money/SharkPassBanner.tsx', {
    '@react-navigation/native': {}, 'expo-image': {}, react: {}, 'react-native-reanimated': {}, 'react-native': { StyleSheet: { create: s => s } },
    'react/jsx-runtime': {}, '../../ui/useUiReducedMotion': {}, '../../api/endpoints/me/shark-pass': {}, '../../RootNavigation': {},
    '../../ui': { BRAND: {}, FONT: {} }, './moneyUi': {}, '../../services/reveal/revealLadder': {},
  });
  assert.equal(banner.bannerLine(state(false)), '700 points to Free Pin', 'banner and pass screen agree');
  const screen = read('src/screens/SharkPassScreen.tsx');
  assert.doesNotMatch(screen, /passTwinLine\(|With the Shark Pass this step also gives/, 'no upsell inside a free claim');
  assert.match(screen, /const nextPrize = progress \? nextPassPrize\(state\) : null;/);
  assert.doesNotMatch(screen, /\bpts\b/);
  assert.doesNotMatch(read('src/components/money/SharkPassBanner.tsx'), /\bpts\b/);
  assert.match(screen, /navigate\('Explore', \{ open: 'daily3' \}\)/);
  // Gold editions are bought on the pass screen only.
  const callers = [];
  const walk = dir => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel); else if (/\.tsx?$/.test(e.name) && /buyGoldEdition\(/.test(read(rel))) callers.push(rel);
  } };
  walk('src');
  assert.deepEqual(callers.sort(), ['src/api/endpoints/me/shark-pass.ts', 'src/screens/SharkPassScreen.tsx']);
});

test('Pins: the door stays; mystery boxes, chaser meter and pips only where pin_mystery_boxes is on', () => {
  const pins = loadTs('src/screens/pins/pinsModel.ts', {});
  assert.equal(pins.initialTab({ mystery: [{ free_now: true }], park_sets: [] }, false), 'sets', 'no Mystery tab in state A');
  assert.equal(pins.initialTab({ mystery: [{ free_now: true }], park_sets: [] }, true), 'mystery');
  assert.equal(pins.pinsDoorShown({ pinOfTheDay: true, ownsPin: false }), true);
  assert.equal(pins.pinsDoorShown({ pinOfTheDay: false, ownsPin: true }), true, 'pins you own never hide');
  assert.equal(pins.mysteryShown({ mysteryBoxes: false }), false);
  const screen = read('src/screens/pins/PinsScreen.tsx');
  assert.match(screen, /\{mysteryOn && <TabButton label=\{PINS_COPY\.tabMystery\}/);
  assert.match(screen, /\{mysteryOn && home\.pips && \(/);
  assert.match(screen, /\{mysteryOn && visited\.has\('mystery'\) && \(/);
  assert.match(screen, /<BackButton \/>/, 'a visible back button (the footer is hidden here)');
  assert.match(screen, /pinsRung\.markSeen\(\)/, 'opening Pins clears the NEW tag');
  assert.match(read('src/screens/pins/ProfileLanyardCard.tsx'), /useRung\('pins'\)\.isNew && own/);
  assert.match(read('src/screens/pins/BoxReveal.tsx'), /useNativeModalLayer\(!hidden, 'show'\)/);
  assert.match(read('src/screens/pins/PinsSheets.tsx'), /HELP\.filter\(h => mystery \|\| !h\.mystery\)/);
});

test('membership look dialogs: home first, through the modal layer, one automatic open', () => {
  const host = read('src/components/MemberLookHost.tsx');
  assert.match(host, /rewardMayAutoOpen\(\{ kind: 'member_look', atPark: atParkRef\.current/);
  assert.match(host, /await whenNoLayer\(\);/);
  assert.match(host, /noteAutoOpen\(\);/);
  const p = loadTs('src/services/retention/rewardPresence.ts');
  p.resetAutoOpen(1000);
  assert.equal(p.autoOpenUsed(), false);
  p.noteAutoOpen(2000);
  assert.equal(p.autoOpenUsed(), true, 'one automatic open per app open');
  p.noteAppState('background', 3000);
  p.noteAppState('active', 3000 + 60 * 1000);
  assert.equal(p.autoOpenUsed(), true, 'a short trip away is the same app open');
  p.noteAppState('background', 10000);
  p.noteAppState('active', 10000 + 11 * 60 * 1000);
  assert.equal(p.autoOpenUsed(), false, 'back after 10 minutes is a new app open');
});

test('level chest: the pin box line only where mystery boxes are on; Energy says what it is for before rung 3', () => {
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /\.filter\(r => pinBoxes \|\| r\.kind !== 'mystery_boxes'\)/);
  assert.match(reveal, /energySaved && r\.kind === 'energy' \? \{ \.\.\.r, label: 'Energy for growing coins' \}/);
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /energySaved=\{!coinLevelsOpen\} pinBoxes=\{flagOn\(flags, 'pin_mystery_boxes'\)\}/);
  assert.match(hook, /onPins=\{flagOn\(flags, 'pin_mystery_boxes'\) \?/);
});

test('one door: the next native sheet waits for the overlay native dismiss, and a refused present heals', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /const layer = useNativeModalLayer\(visible, 'wait'\);/);
  assert.match(hook, /onDismiss=\{nativeGone\}/, 'after-hide work runs on the real native dismiss');
  assert.match(hook, /dismissFallback\.current = setTimeout\(nativeGone, NATIVE_GONE_FALLBACK_MS\);/);
  assert.match(hook, /onModalShow=\{\(\) => \{ shownRef\.current = true; \}\}/);
  assert.match(hook, /case 'daily_chest': askForDailyChest\(\); closeThen\(\(\) => o\.onOpenChest\(\)\); return;/);
});
