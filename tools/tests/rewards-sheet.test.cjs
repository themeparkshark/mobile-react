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
const screen0 = () => read('src/screens/SharkPassScreen.tsx');

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
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'freeze_saved' }), true);
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'freeze_saved', atPark: true }), false);
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'freeze_saved', dailyRungOpen: false }), false, 'the freeze card waits for rung 4');
  assert.equal(p.rewardMayAutoOpen({ ...base, kind: 'freeze_saved', dailyChestWaiting: true }), false,
    'the daily chest keeps the home open');
  for (const kind of ['level_chest', 'daily3_chest', 'weekly_box', 'event_chest', 'trail_box', 'stamps']) {
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

test('Daily 3: the chest goal says it waits in Rewards, not on the map', () => {
  const m = loadTs('src/services/retention/rewardsModel.ts');
  const chest = { kind: 'chest', park: false, target: 1, title: 'Open your daily chest', hint: 'Tap the chest on the map' };
  for (const atPark of [false, true]) {
    const g = m.homeSideGoal(chest, atPark);
    assert.equal(g.hint, 'In your Rewards');
    assert.equal(g.parkOnly, false);
  }
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
  assert.match(hook, /rewardMayAutoOpen\(\{ kind: 'freeze_saved', atPark/);
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

test('Trail Boxes: known contents in pictures with no percent sign anywhere, even from an older random-mode server', () => {
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
  // Dustin, Oct 28: no odds anywhere. An older server in random mode still shows only what boxes hold.
  assert.doesNotMatch(sheet, /percent\(|chance_bp|chances/i, 'the Trail sheet never shows a chance or a percent');
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
  // The Daily 3 link only once Daily 3 is really there (switch on, rung 4 open); before that a plain line, no tap.
  assert.equal(pass.dailyQuestsSlot({ daily: [] }, true), 'daily3');
  assert.equal(pass.dailyQuestsSlot({ daily: [] }, false), 'later');
  assert.equal(pass.dailyQuestsSlot({ daily: [{}] }, false), 'list');
  assert.equal(pass.dailyQuestsSlot(null, true), 'list');
  assert.doesNotMatch(pass.DAILY_GOALS_LATER, /Daily 3|\btap\b|\bGO\b/);
  const passSrc = read('src/screens/SharkPassScreen.tsx');
  assert.match(passSrc, /const daily3Ready = flagOn\(retentionFlags, 'daily_three'\) && dailyRungOpen;/);
  assert.match(passSrc, /dailyQuestsSlot\(state\.quests, daily3Ready\) === 'later' && \(\n\s*<View style=\{s\.questRow\}/, 'the later line is a View, never a Pressable');
  assert.match(passSrc, /dailyQuestsSlot\(state\.quests, daily3Ready\) === 'daily3' && \(\n\s*<Pressable/);
  // Quest bonuses say pass points, like the banner and the Daily 3 rows.
  assert.match(passSrc, /`\+\$\{q\.bonus\} pass points!`/);
  assert.match(passSrc, /: `\+\$\{q\.bonus\} pass points`\}/);
  assert.doesNotMatch(passSrc, /\} points!?`/);
  const banner = loadTs('src/components/money/SharkPassBanner.tsx', {
    '@react-navigation/native': {}, 'expo-image': {}, react: {}, 'react-native-reanimated': {}, 'react-native': { StyleSheet: { create: s => s } },
    'react/jsx-runtime': {}, '../../ui/useUiReducedMotion': {}, '../../api/endpoints/me/shark-pass': {}, '../../RootNavigation': {},
    '../../ui': { BRAND: {}, FONT: {} }, './moneyUi': {}, '../../services/reveal/revealLadder': {}, '../retention/RewardsSheet': {},
  });
  assert.equal(banner.bannerLine(state(false)), 'Next prize: Free Pin at step 3', 'banner and pass screen agree');
  // The pass leads with its steps: no points sums next to the step bar or the next prize.
  assert.doesNotMatch(screen0(), /points to step|points away/);
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
  const lanyard = read('src/screens/pins/ProfileLanyardCard.tsx');
  assert.match(lanyard, /useShownNewTag\('pins', own && !!data && focused\)/, 'the lanyard NEW retires once shown');
  assert.match(lanyard, /\{newTag && <NewPill \/>\}/, 'the shared pill, no copied styles');
  assert.doesNotMatch(lanyard, /newText|useRung\('pins'\)/);
  assert.match(read('src/screens/pins/BoxReveal.tsx'), /useNativeModalLayer\(!hidden, 'show'\)/);
  assert.match(read('src/screens/pins/PinsSheets.tsx'), /HELP\.filter\(h => mystery \|\| !h\.mystery\)/);
});

test('membership look dialogs: home first, through the modal layer, one automatic open', () => {
  const host = read('src/components/MemberLookHost.tsx');
  assert.match(host, /rewardMayAutoOpen\(\{ kind: 'member_look', atPark: atParkRef\.current/);
  assert.match(host, /const free = await whenNoLayer\(LAYER_WAIT_MS, alive\.current\);/, 'a capped wait, never forever');
  assert.match(host, /alive\.current\.abort\?\.\(\)/, 'unmount stops the wait and unsubscribes');
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
  // The chest is asked at once, but it presents only once the overlay is gone: its own layer waits ('wait').
  assert.match(hook, /case 'daily_chest': closeThen\(\(\) => undefined\); askForDailyChest\(Date\.now\(\), true\); o\.onOpenChest\(\); return;/);
  assert.match(read('src/components/DailyGiftModal.tsx'), /useNativeModalLayer\(visible, 'wait'\)/,
    'the chest card presents only once the closing Rewards sheet is gone');
  // The layer list itself: the closing sheet's layer stays first until UIKit says it is gone, so the chest waits.
  const { modalLayers } = loadTs('src/ui/modalLayers.ts', { react: require('react') });
  modalLayers.reset();
  const sheet = modalLayers.add();
  const chest = modalLayers.add();
  assert.equal(modalLayers.isFront(chest), false, 'the chest waits while the sheet is still dismissing');
  modalLayers.remove(sheet);
  assert.equal(modalLayers.isFront(chest), true, 'the chest presents the moment the sheet is gone');
  modalLayers.reset();
});

test("the map's attention gate: asked when guide-map publishes it, quiet fallback when this build has none", () => {
  const without = loadTs('src/services/retention/mapAttention.ts', { '../../screens/ExploreScreen/mapPresentationQueue': {} });
  assert.equal(without.mapAllows('membership'), null, 'no gate: callers keep their own calm rules');
  assert.equal(without.mapTake('reward'), true);
  const asked = [];
  let calm = false;
  const gate = {
    allowed: kind => { asked.push(`allowed ${kind}`); return calm; },
    request: kind => { asked.push(`request ${kind}`); return calm; },
  };
  const withGate = loadTs('src/services/retention/mapAttention.ts', { '../../screens/ExploreScreen/mapPresentationQueue': { attentionGate: gate } });
  assert.equal(withGate.mapAllows('membership'), false, 'a busy park moment (first 30 s, walking, play, fresh win card) waits');
  assert.equal(withGate.mapTake('reward'), false);
  calm = true;
  assert.equal(withGate.mapAllows('membership'), true);
  assert.equal(withGate.mapTake('membership'), true, 'takes the one automatic open');
  assert.deepEqual(asked, ['allowed membership', 'request reward', 'allowed membership', 'request membership']);
  // The member look host and the retention auto opens both ask it, ANDed with this lane's own counter.
  const host = read('src/components/MemberLookHost.tsx');
  assert.match(host, /parkBusy: mapSays === null \? undefined : !mapSays/);
  assert.match(host, /takeAutoOpen\('membership', ownNow\)/);
  assert.match(host, /autoOpenUsed: autoOpenUsed\(\)/);
  assert.doesNotMatch(host, /autoOpenUsed\(\) : false/, 'never swaps our counter for the gate');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /if \(!takeAutoOpen\('reward', ownFreeze\(\)\)\) return;/);
  assert.match(hook, /if \(!live \|\| !ok \|\| !takeAutoOpen\('reward', own\(\)\)\) return;/, 'the reminders ask too');
  assert.doesNotMatch(hook, /autoOpenUsed\(\) : false/);
  // Level chests never open by themselves: no auto-open path names them.
  assert.doesNotMatch(hook, /may\('level_chest'\)/);
});

test('the empty lanyard never promises boxes while mystery boxes are off (state A)', () => {
  const pins = loadTs('src/screens/pins/pinsModel.ts');
  const shared = n => (n > 0 ? 'Tap + to hang a pin' : 'Win pins from boxes and park sets');
  assert.equal(pins.lanyardHint(0, false, shared), 'Win pins from park sets');
  assert.equal(pins.lanyardHint(0, true, shared), 'Win pins from boxes and park sets');
  assert.equal(pins.lanyardHint(2, false, shared), 'Tap + to hang a pin');
  assert.match(read('src/screens/pins/PinsScreen.tsx'), /lanyardHint\(home\.counts\.pins, mysteryOn, lanyardEmptyHint\)/);
  assert.match(read('src/screens/pins/ProfileLanyardCard.tsx'), /lanyardHint\(data\.pins, mysteryOn, lanyardEmptyHint\)/);
});

test('NEW tags: each reward rung wears one NEW on its own surface, and a shown NEW is retired so the next rung gets its turn', () => {
  const tag = loadTs('src/services/retention/newTag.ts', { react: {}, 'react-native': {}, '../reveal/revealLadder': {} });
  assert.equal(tag.rowRung('daily3'), 'daily');
  assert.equal(tag.rowRung('level_chest'), 'daily');
  assert.equal(tag.rowRung('weekly_box'), 'daily');
  assert.equal(tag.rowRung('trail'), 'trail');
  assert.equal(tag.rowRung('events'), 'events');
  assert.equal(tag.rowRung('daily_chest'), null, 'the daily chest is rung 0: never NEW');
  assert.equal(tag.rowRung('stamps'), null);
  const rows = [{ key: 'daily_chest' }, { key: 'level_chest' }, { key: 'daily3' }, { key: 'trail' }];
  assert.equal(tag.newRowKey(rows, 'daily'), 'daily3', 'one pill, on Daily 3 itself (rung 4)');
  assert.equal(tag.newRowKey([{ key: 'level_chest' }, { key: 'weekly_box' }], 'daily'), 'level_chest', 'else the rung\'s first row');
  assert.equal(tag.newRowKey(rows, 'trail'), 'trail');
  assert.equal(tag.newRowKey(rows, 'events'), null, 'no row, no pill');
  assert.equal(tag.newRowKey(rows, null), null);
  // The ladder's one NEW slot: once the Daily 3 NEW is seen, the next open gives the slot to the next unseen rung (Pins at level 3).
  const ladder = loadTs('src/services/reveal/ladderRules.ts', {});
  const opened = { daily: 100, pins: 200 };
  assert.equal(ladder.pickNewTag(opened, {}, null, 'open-1'), 'daily');
  assert.equal(ladder.pickNewTag(opened, { daily: true }, { rung: 'daily', appOpenId: 'open-1' }, 'open-1'), null, 'one NEW per app open');
  assert.equal(ladder.pickNewTag(opened, { daily: true }, { rung: 'daily', appOpenId: 'open-1' }, 'open-2'), 'pins', 'next open: the Pins NEW');
  // Every reward surface draws and retires its NEW.
  const hook = read('src/services/retention/newTag.ts');
  assert.match(hook, /if \(s === 'background' && wasShown\.current\) \{ wasShown\.current = false; markRungSeen\(rung\); \}/);
  assert.match(hook, /if \(wasShown\.current\) \{ wasShown\.current = false; markRungSeen\(rung\); \}/, 'seen when the surface goes away');
  const sheet = read('src/components/retention/RewardsSheet.tsx');
  for (const rung of ['daily', 'trail', 'events']) assert.match(sheet, new RegExp(`useShownNewTag\\('${rung}', has\\('${rung}'\\)\\)`), rung);
  assert.match(sheet, /\{newKey === row\.key && <NewPill \/>\}/);
  const banner = read('src/components/money/SharkPassBanner.tsx');
  assert.match(banner, /const isNew = visibleNow && passRung && passLadder\.isNew && always !== true;/, 'the pass banner, never on the Supplies door');
  assert.match(banner, /\{isNew && <NewPill \/>\}/);
  assert.match(banner, /markRungSeen\('shark_pass'\)/);
  assert.match(read('src/screens/SharkPassScreen.tsx'), /if \(passRung\) markRungSeen\('shark_pass'\);/);
  assert.match(read('src/components/trail/TrailSheet.tsx'), /if \(visible\) markRungSeen\('trail'\);/);
  assert.match(read('src/components/liveEvents/EventSheet.tsx'), /if \(visible\) markRungSeen\('events'\);/);
  for (const chip of ['EventStatusChip', 'EventHomeChip']) {
    const src = read(`src/components/liveEvents/${chip}.tsx`);
    assert.match(src, /useShownNewTag\('events'\)/, chip);
    assert.match(src, /\{tag\.isNew && <NewPill \/>\}/, chip);
  }
  const retention = read('src/components/retention/useRetention.tsx');
  assert.match(retention, /markRungSeen\('daily'\);\n    setSheetFromRewards\(fromRewards\);/, 'opening Daily 3 clears its NEW');
  assert.match(retention, /const rung = rowRung\(key\);\n    if \(rung\) markRungSeen\(rung\);/, 'a row tap clears its NEW');
});

test('stamps row is honest: a fresh read on open, the server count, and no "Claimed!" when nothing was claimed', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /setView\(\{ k: 'rewards' \}\);\n    \/\/ A fresh stamp read[^\n]*\n    void refreshStamps\(true\);/);
  assert.match(hook, /const n = stampClaimableCount\(r\);/, 'the row and the Profile dot read the same count (summary.claimable first)');
  assert.match(hook, /if \(!o\.enabled \|\| o\.refreshKey === firstKey\.current\) return;\n    void refreshStamps\(true\);/, 'a win that earns a stamp raises the number at once');
  assert.match(read('src/screens/TrailPreviewScreen.tsx'), /mode: 'fixed', first_box: 'second_park_day'/, 'the known-contents preview scene');
  assert.match(hook, /if \(claimed === 0 && failed === 0\) \{ setRewardsNote\(null\); return; \}/);
  assert.match(hook, /coins \? `\+\$\{coins\} Shark Coins` : null/);
  const dot = loadTs('src/components/profile/stampDot.ts', {});
  assert.equal(dot.stampClaimableCount({ stamps: {}, summary: { claimable: 3 } }), 3);
});

test('Trail Boxes: no Mystery Pin Box where its switch is off, and an honest first park day line', () => {
  const m = loadTs('src/services/trail/trailModel.ts');
  const list = [{ kind: 'coins', amount: 50 }, { kind: 'mystery_box', amount: 1 }, { kind: 'tickets', amount: 1 }];
  assert.deepEqual(plain(m.withoutPinBoxes(list, false).map(r => r.kind)), ['coins', 'tickets']);
  assert.equal(m.withoutPinBoxes(list, true).length, 3);
  assert.equal(m.arriveLine({ first_box: 'second_park_day' }), 'From your second park day');
  assert.equal(m.arriveLine({ first_box: null }), 'A box each park day');
  assert.equal(m.arriveLine({}), 'A box each park day');
  assert.equal(m.exclusivesLine({ mode: 'fixed' }), 'Every Gold Box brings the next one. Wear them to show you walk the parks.');
  assert.doesNotMatch(m.exclusivesLine({ mode: 'fixed' }), /often|rarer|chance/, 'known contents: no chance words');
  const sheet = read('src/components/trail/TrailSheet.tsx');
  assert.match(sheet, /withoutPinBoxes\(t\.rewards, pinBoxes\)/, 'known contents');
  // Random mode (production until be-core-loop deploys): no chance words either, and the random bonus is not listed.
  for (const mode of [undefined, 'random']) {
    assert.doesNotMatch(m.exclusivesLine({ mode }), /often|rarer|chance|maybe|might/, `${mode}: no chance words`);
  }
  assert.doesNotMatch(sheet, /Plus one of these|t\.bonus/, 'random mode lists only what every box holds');
  assert.match(sheet, /withoutPinBoxes\(t\.always, pinBoxes\)/);
  assert.match(sheet, /sub=\{arriveLine\(state\)\}/);
  assert.doesNotMatch(sheet, /\d+ Coins`|`\$\{[^}]+\} Coins/, 'Shark Coins, never bare Coins');
});

test('the member look ask never waits forever on a stuck sheet', async () => {
  let count = 1;
  const subs = new Set();
  const layers = { count: () => count, subscribe: fn => { subs.add(fn); return () => subs.delete(fn); } };
  const host = loadTs('src/components/MemberLookHost.tsx', {
    react: {}, 'react-native': {}, 'react/jsx-runtime': {}, '../context/LocationProvider': {}, '../services/retention/rewardPresence': {},
    '../services/retention/mapAttention': {}, '../ui/modalLayers': { modalLayers: layers }, '../api/endpoints/me/member-look': {},
    '../context/AuthProvider': {}, '../services/memberLook': {}, '../ui': {}, './GrownUpGate': {},
  });
  assert.equal(await host.whenNoLayer(30), false, 'a layer that never closes: gives up after the cap');
  assert.equal(subs.size, 0, 'and unsubscribes');
  const freed = host.whenNoLayer(5000);
  count = 0; subs.forEach(fn => fn());
  assert.equal(await freed, true, 'frees as soon as the last layer closes');
  assert.equal(subs.size, 0);
  count = 1;
  const signal = { cancelled: false };
  const stopped = host.whenNoLayer(5000, signal);
  signal.cancelled = true; signal.abort();
  assert.equal(await stopped, false, 'unmount stops the wait');
  assert.equal(subs.size, 0);
});

test('Daily 3: an honest hero line at home while a goal waits for the park; BACK returns to the Rewards sheet', () => {
  const L = loadTs('src/services/retention/logic.ts');
  const st = { done: false, claimable: false, streak: { days: 4, best: 4 } };
  assert.equal(L.streakSubline(st, true), 'One goal waits for your next park day');
  assert.equal(L.streakSubline(st, false), 'Finish today to make it 5!');
  assert.equal(L.streakSubline({ ...st, done: true }, true), '4 days in a row!');
  const sheet = read('src/components/retention/Daily3Sheet.tsx');
  assert.match(sheet, /const parkGoalWaits = !atPark && state\.goals\.some\(g => !g\.done && homeSideGoal\(g, false\)\.parkOnly\);/);
  assert.match(sheet, /\{closeLabel\}/);
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /closeLabel=\{sheetFromRewards \? 'BACK' : 'BACK TO MAP'\}/);
  assert.match(hook, /if \(view\?\.k === 'sheet' && sheetFromRewards\) \{ setSheetFromRewards\(false\); setView\(\{ k: 'rewards' \}\); return; \}/);
  // The mode is never set during render.
  assert.doesNotMatch(hook, /\n  setRetentionMode\(atPark/);
  assert.match(hook, /useEffect\(\(\) => \{ atParkRef\.current = atPark; setRetentionMode\(atPark \? 'park' : 'home'\); \}, \[atPark\]\);/);
});

test('words: Shark Coins, Tickets and Energy in every reward line this lane owns', () => {
  const pass = loadTs('src/services/money/sharkPassModel.ts');
  assert.equal(pass.rewardWords({ type: 'coins', amount: 75 }), '75 Shark Coins');
  assert.equal(pass.rewardWords({ type: 'tickets', amount: 1 }), '1 Ticket');
  assert.equal(pass.rewardWords({ type: 'energy', amount: 20 }), '20 Energy');
  const L = loadTs('src/services/retention/logic.ts');
  assert.equal(L.rewardRows({ coins: 250 })[0].label, 'Shark Coins');
  assert.equal(loadTs('src/services/trail/trailModel.ts').rewardLabel({ kind: 'coins', amount: 75 }), '75 Shark Coins');
});

test('the lane-only ladder feed is inert in store and OTA bundles', () => {
  const fed = [];
  const stubs = { '@react-native-async-storage/async-storage': {}, '../reveal/revealLadder': { feedLadder: x => fed.push(x) } };
  const store = loadTs('src/services/retention/devLadderFeed.ts', stubs);
  assert.equal(store.devLadderFeedOn(), false);
  store.devLadderFeed({ flags: { daily_three: true }, level: 3, coinsWon: 9, hasTeam: true, atPark: false });
  assert.equal(fed.length, 0, 'no lane variables: never feeds');
  const g = {};
  const lane = loadTs('src/services/retention/devLadderFeed.ts', stubs,
    { process: { env: { EXPO_PUBLIC_STUDIO_MUTE: '1', EXPO_PUBLIC_CL_LADDER_FEED: 'manual' } }, globalThis: g });
  assert.equal(lane.devLadderFeedOn(), true);
  lane.devLadderFeed({ flags: { daily_three: true }, level: 3, coinsWon: 9, hasTeam: true, atPark: false });
  assert.equal(fed.length, 1);
  assert.equal(fed[0].progress.revealAll, false, 'manual mode climbs the ladder like a real player');
  assert.equal(fed[0].progress.coinsWon, 0, 'manual progress, not the profile');
});

test('a Trail or event row with no host on screen shows its line with no button (never a dead tap)', () => {
  const m = loadTs('src/services/retention/rewardsModel.ts');
  const base = { dailyChest: null, daily3: null, weekly: null, levelChest: null, stamps: null, events: null };
  const walking = { ready: 0, walking: 2, nearest: 0.4, atPark: false };
  assert.equal(m.rewardsRows({ ...base, trail: { ...walking, door: false } })[0].action, null);
  assert.equal(m.rewardsRows({ ...base, trail: { ...walking, door: true } })[0].action, 'go');
  assert.equal(m.rewardsRows({ ...base, trail: walking })[0].action, 'go', 'a build that does not say still offers it');
  assert.equal(m.rewardsRows({ ...base, trail: null, events: { chests: 1, door: false } })[0].action, null);
  const doors = loadTs('src/services/retention/rewardsSignals.ts');
  assert.equal(doors.rewardsDoorOpen('trail'), false);
  const off = doors.listenRewardsDoor('trail', () => undefined);
  assert.equal(doors.rewardsDoorOpen('trail'), true);
  off();
  assert.equal(doors.openRewardsDoor('trail'), false, 'nobody listening');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /else if \(!openRewardsDoor\('trail'\)\) setView\(\{ k: 'rewards' \}\);/);
});

test('Rewards sheet fits five rows whole on a 667 pt phone', () => {
  const sheet = read('src/components/retention/RewardsSheet.tsx');
  assert.match(sheet, /const compact = height < 720;/);
  assert.match(sheet, /const listMax = Math\.max\(240, Math\.min\(height \* 0\.62, height - 300\)\);/);
  const listMax = h => Math.max(240, Math.min(h * 0.62, h - 300));
  const fiveRows = 5 * 66 + 4 * 6 + 4;
  assert.ok(listMax(667) >= fiveRows, `SE list ${listMax(667)} holds five compact rows (${fiveRows})`);
  assert.ok(listMax(956) >= 5 * 70 + 4 * 8 + 4, 'Pro Max holds five full rows');
  assert.match(sheet, /rowCompact: \{ minHeight: 60/);
  assert.match(sheet, /numberOfLines=\{compact \? 1 : 2\}/, 'one line per row on a small phone');
});

test('one automatic open per app open in the integrated build: the gate exempts a repeated kind, our counter refuses it', () => {
  // The real gate when this tree has it (after guide-map merges); otherwise a mirror of its shape: attentionQueue.used()
  // exempts the kind that already took the open, so a second 'reward' passes the gate by itself.
  let gate = null;
  try {
    const q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
    if (q.attentionGate && q.attentionQueue) {
      q.attentionQueue.reset(); q.attentionGate.reset();
      q.attentionGate.publish({ atPark: false, arrivedAt: null, walkingToTarget: false, playing: false, winCardClosedAt: null }, 'open-1');
      gate = q.attentionGate;
    }
  } catch { gate = null; }
  if (!gate) {
    let usedBy = null;
    gate = {
      allowed: kind => usedBy === null || usedBy === kind,
      request: kind => { if (usedBy !== null && usedBy !== kind) return false; usedBy = kind; return true; },
    };
  }
  assert.equal(gate.request('reward'), true);
  assert.equal(gate.allowed('reward'), true, 'the gate alone lets the same kind through again');
  const presence = loadTs('src/services/retention/rewardPresence.ts');
  const att = loadTs('src/services/retention/mapAttention.ts', {
    '../../screens/ExploreScreen/mapPresentationQueue': { attentionGate: gate },
  });
  presence.resetAutoOpen(1000);
  const own = () => presence.rewardMayAutoOpen({ kind: 'freeze_saved', atPark: false, firstCatchDone: true,
    autoOpenUsed: presence.autoOpenUsed(), dailyRungOpen: true, dailyChestWaiting: false });
  // First ask in this app open: both agree.
  assert.equal(att.calmForAutoOpen('reward', own()), true);
  assert.equal(att.takeAutoOpen('reward', own()), true);
  presence.noteAutoOpen(2000);
  // Same kind asked again (a second card, the reminders ask): the gate would allow it, our counter refuses it.
  assert.equal(att.calmForAutoOpen('reward', own()), false);
  assert.equal(att.takeAutoOpen('reward', own()), false);
  assert.equal(att.takeAutoOpen('membership', presence.rewardMayAutoOpen({ kind: 'member_look', atPark: false,
    firstCatchDone: true, autoOpenUsed: presence.autoOpenUsed(), dailyRungOpen: true })), false, 'and so does every other kind');
  // A gate that says no always wins too.
  const no = loadTs('src/services/retention/mapAttention.ts', {
    '../../screens/ExploreScreen/mapPresentationQueue': { attentionGate: { allowed: () => false, request: () => false } },
  });
  presence.resetAutoOpen(5000);
  assert.equal(no.calmForAutoOpen('reward', true), false);
  assert.equal(no.takeAutoOpen('reward', true), false);
});

test('a shown NEW retires when its surface hides, unmounts or the app goes to the background (Pins lanyard)', () => {
  // A tiny hook harness: effects run after each render when their deps change; cleanups run on unmount.
  const seen = [];
  let ladderNew = true;
  let appListener = null;
  const effects = [];
  let slot = 0;
  const react = {
    useRef: init => { const i = slot++; effects[i] = effects[i] || { ref: { current: init } }; return effects[i].ref; },
    useEffect: (fn, deps) => {
      const i = slot++;
      const prev = effects[i];
      const changed = !prev || !prev.deps || deps.some((d, k) => d !== prev.deps[k]);
      if (changed) {
        if (prev && prev.cleanup) prev.cleanup();
        const cleanup = fn();
        effects[i] = { deps, cleanup };
      }
    },
  };
  const tag = loadTs('src/services/retention/newTag.ts', {
    react,
    'react-native': { AppState: { addEventListener: (_e, cb) => { appListener = cb; return { remove: () => { appListener = null; } }; } } },
    '../reveal/revealLadder': {
      useRung: () => ({ open: true, isNew: ladderNew, markSeen: () => { seen.push('tap'); ladderNew = false; } }),
      markRungSeen: r => { seen.push(r); ladderNew = false; },
    },
  });
  const render = shown => { slot = 0; return tag.useShownNewTag('pins', shown); };
  const unmount = () => { for (const e of effects) if (e && e.cleanup) e.cleanup(); effects.length = 0; };
  // Not on screen yet (no data, not focused): nothing is retired.
  assert.equal(render(false).isNew, false);
  assert.deepEqual(seen, []);
  // Shown on Profile, then the tab loses focus: it retires.
  assert.equal(render(true).isNew, true);
  render(false);
  assert.deepEqual(seen, ['pins']);
  // Shown, then the app goes to the background: it retires.
  unmount(); seen.length = 0; ladderNew = true;
  render(true);
  appListener('background');
  assert.deepEqual(seen, ['pins']);
  // Shown, then the card unmounts: it retires.
  unmount(); seen.length = 0; ladderNew = true;
  render(true);
  unmount();
  assert.deepEqual(seen, ['pins']);
  // A tap clears it at once.
  seen.length = 0; ladderNew = true;
  render(true).seen();
  assert.deepEqual(seen, ['tap']);
  unmount();
  // Then the next app open's NEW slot goes to the next rung (Daily 3, the pass or Trail), never stuck on Pins.
  const ladder = loadTs('src/services/reveal/ladderRules.ts', {});
  const opened = { pins: 100, daily: 200 };
  assert.equal(ladder.pickNewTag(opened, {}, null, 'open-1'), 'pins');
  assert.equal(ladder.pickNewTag(opened, { pins: true }, { rung: 'pins', appOpenId: 'open-1' }, 'open-2'), 'daily');
});

test('the daily chest opened from Rewards: BACK says BACK and the sheet comes back after it closes', () => {
  const p = loadTs('src/services/retention/rewardPresence.ts');
  p.askForDailyChest(1000, true);
  assert.equal(p.dailyChestFromRewards(1000 + 100), true);
  assert.equal(p.dailyChestFromRewards(1000 + p.CHEST_ASK_MS + 1), false, 'a stale ask is not from Rewards');
  p.askForDailyChest(2000);
  assert.equal(p.dailyChestFromRewards(2100), false, 'a push or Daily 3 ask goes back to the map');
  const sig = loadTs('src/services/retention/rewardsSignals.ts');
  assert.equal(sig.returnToRewards(), false, 'nobody listening: nothing happens');
  let back = 0;
  const off = sig.listenReturnToRewards(() => { back += 1; });
  assert.equal(sig.returnToRewards(), true);
  assert.equal(back, 1);
  off();
  assert.equal(sig.returnToRewards(), false);
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.match(chest, /fromRewards\.current = dailyChestFromRewards\(\);/);
  assert.match(chest, /if \(fromRewards\.current\) \{ fromRewards\.current = false; returnToRewards\(\); \}/);
  assert.match(chest, /\{fromRewards\.current \? 'BACK' : 'BACK TO MAP'\}/);
  assert.match(chest, /useNativeModalLayer\(visible, 'wait'\)/);
  assert.match(chest, /isVisible=\{layer\.present\}/);
  assert.match(chest, /onDismiss=\{layer\.onDismissed\}/);
  const hook = read('src/components/retention/useRetention.tsx');
  // Asked at once (the map mounts the chest while the sheet closes); the chest's 'wait' layer holds it until UIKit
  // says the sheet is gone.
  assert.match(hook, /case 'daily_chest': closeThen\(\(\) => undefined\); askForDailyChest\(Date\.now\(\), true\); o\.onOpenChest\(\); return;/);
  assert.match(hook, /useEffect\(\(\) => listenReturnToRewards\(/);
  // No fixed wait between the chest and the sheet: the overlay's 'wait' layer holds it until the chest's layer is gone.
  const back2 = hook.slice(hook.indexOf('listenReturnToRewards(() =>'), hook.indexOf('listenReturnToRewards(() =>') + 400);
  assert.match(back2, /\}, 0\);/);
  assert.doesNotMatch(back2, /NATIVE_GONE_FALLBACK_MS/);
  assert.match(hook, /useNativeModalLayer\(visible, 'wait'\)/);
});

test('Shark Pass grown-up notes stay short enough to never clip on a phone (seen: "Every reward is shown al")', () => {
  const src = read('src/screens/SharkPassScreen.tsx');
  const block = src.slice(src.indexOf('const PASS_GROWN_UP_NOTES = ['), src.indexOf('];', src.indexOf('const PASS_GROWN_UP_NOTES = [')));
  const notes = [...block.matchAll(/^\s+'([^']+)',$/gm)].map(m => m[1]);
  assert.equal(notes.length, 4);
  assert.ok(notes.includes('No random rewards: every Shark Pass reward is shown above.'));
  assert.ok(!notes.some(n => /Every reward is shown above/.test(n)));
});

test('Pins: an empty Park Sets or My Pins tab says what goes there, with a picture (never a blank page, state A)', () => {
  const src = read('src/screens/pins/PinsScreen.tsx');
  assert.match(src, /home\.park_sets\.length === 0 && \(\s*<EmptyTab art=\{PIN_ART\.seal\} title=\{PINS_COPY\.setsEmptyTitle\} line=\{PINS_COPY\.setsEmptyLine\} \/>/);
  assert.match(src, /owned\.length === 0 && <EmptyTab art=\{PINS_DOOR_ART\} title=\{PINS_COPY\.mineEmptyTitle\} line=\{PINS_COPY\.mineEmptyLine\} \/>/);
  assert.match(src, /owned\.length > 0 && <Text[^>]*>Tap a pin to wear it<\/Text>/);
  assert.match(src, /<View style=\{\[owned\.length > 0 && styles\.mine, tab !== 'mine' && styles\.hidden\]\}>/, 'no card inside a card');
  const model = read('src/screens/pins/pinsModel.ts');
  for (const k of ['setsEmptyTitle', 'setsEmptyLine', 'mineEmptyTitle', 'mineEmptyLine']) assert.match(model, new RegExp(`${k}: '[^']+'`));
  assert.doesNotMatch(model, /setsEmpty\w+: '[^']*(box|Mystery|soon)/i, 'no promise of a switched-off feature or a date');
});
