'use strict';
/**
 * Release 3 coordinator wiring: Shark Events and the Next Up rail on the map.
 * Off (no event, no rail item, an old server) renders exactly nothing new.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const { exploreScreen } = require('./helpers/explore-screen.cjs');

const hud = loadTs('src/components/map/statusStack.ts');
const route = loadTs('src/components/nextUp/nextUpRoute.ts');
const fx = loadTs('src/services/liveEvents/fixture.ts');
const named = name => node => typeof node.type === 'function' && node.type.name === name;
const task = { id: 11, name: 'Big Ride', latitude: 34.1382, longitude: -118.3535, asset_id: 7, active_from: null };
const redeemables = { tasks: [task], coins: [], keys: [], redeemables: [], items: [], pins: [], vaults: [] };

test('status row: a ready chest leads right after a live raid; an event on sits above Ride Control; absent = unchanged', () => {
  const base = { live: false, show: null, nightMode: false, control: true };
  assert.deepEqual(plain([...hud.statusOrder(base)]), ['control']);
  assert.deepEqual(plain([...hud.statusOrder({ ...base, event: null })]), ['control']);
  assert.deepEqual(plain([...hud.statusOrder({ ...base, live: true, event: 'ready' })]), ['live', 'event', 'control']);
  assert.deepEqual(plain([...hud.statusOrder({ ...base, nightMode: true, event: 'on', show: 'teaser' })]), ['fright', 'event', 'show', 'control']);
});

test('Next Up actions route to the right map surface; unknown or broken actions do nothing', () => {
  assert.equal(route.nextUpRoute({ type: 'open_event', event_id: 3 }).kind, 'event');
  assert.equal(route.nextUpRoute({ type: 'daily_chest' }).kind, 'daily_chest');
  assert.deepEqual(plain(route.nextUpRoute({ type: 'level_chest', level: 4 })), { kind: 'retention', open: 'chest' });
  assert.deepEqual(plain(route.nextUpRoute({ type: 'daily_three' })), { kind: 'retention', open: 'daily3' });
  assert.equal(route.nextUpRoute({ type: 'trail' }).kind, 'trail');
  assert.deepEqual(plain(route.nextUpRoute({ type: 'show_ride', task_id: 11 })), { kind: 'task', taskId: 11 });
  assert.equal(route.nextUpRoute({ type: 'show_ride' }).kind, 'none');
  assert.equal(route.nextUpRoute({ type: 'ride' }).kind, 'nearest_ride');
  assert.equal(route.nextUpRoute({ type: 'home_find' }).kind, 'home_find');
  assert.equal(route.nextUpRoute({ type: 'mystery_from_v9' }).kind, 'none');
  assert.equal(route.nextUpRoute(null).kind, 'none');
});

test('flag off / old server: no event sheet, toast, banner, recap, rail or star on the map', async () => {
  const app = exploreScreen({ redeemables });
  await app.settle(); await app.settle();
  for (const name of ['EventSheet', 'EventRecapCard', 'EventGainToast', 'FrenzyBanner', 'FrenzySweep', 'NextUpRail', 'EventStatusChip']) {
    assert.equal(app.find(named(name)), undefined, `${name} stays away`);
  }
  const marker = app.find(node => named('TaskMarker')(node) && node.props.task?.id === 11);
  assert.ok(marker, 'the ride marker');
  assert.equal(marker.props.star, false);
});

test('an event on: one sheet, the toast and banner under the HUD row, and the Star Ride on its coin', async () => {
  const event = fx.goldenReefFixture({ now: Date.now() });
  const app = exploreScreen({ redeemables, liveEvent: event, starRides: new Set([11]),
    modules: { '../services/liveEvents/model': loadTs('src/services/liveEvents/model.ts') } });
  await app.settle(); await app.settle();
  assert.ok(app.find(named('EventSheet')));
  assert.ok(app.find(named('EventGainToast')));
  assert.ok(app.find(named('FrenzyBanner')));
  const marker = app.find(node => named('TaskMarker')(node) && node.props.task?.id === 11);
  assert.equal(marker.props.star, true);
});

test('Next Up rail shows in the park suggestion slot when it has an item and the slot is free', async () => {
  const app = exploreScreen({ redeemables, nextUp: { kind: 'ride', icon: 'coin', title: 'Catch a ride coin', action: { type: 'ride' } } });
  await app.settle(); await app.settle();
  const rail = app.find(named('NextUpRail'));
  assert.ok(rail);
  assert.equal(typeof rail.props.onAction, 'function');
});

test('sign-out clears the live event next to the Secret Shop flag; the badge stays a small isolated TaskMarker edit', () => {
  const auth = fs.readFileSync('src/context/AuthProvider.tsx', 'utf8');
  assert.match(auth, /resetSecretShopFlag\(\);[^\n]*\n\s*try \{ require\('\.\.\/services\/liveEvents\/useLiveEvent'\)\.resetLiveEvent\(\)/);
  const marker = fs.readFileSync('src/screens/ExploreScreen/TaskMarker.tsx', 'utf8');
  assert.match(marker, /\{star && !parked && <View pointerEvents="none" style=\{styles\.starRide\}><StarRideBadge paused=\{!alive\.running\} \/><\/View>\}/);
});

test('MemberFlex in Standings: only when the row payload carries flex fields; is_subscribed alone changes nothing', () => {
  const m = loadTs('src/services/money/memberFlex.ts');
  assert.equal(m.memberFlexOf({ id: 1, is_subscribed: true }), null);
  assert.equal(m.memberFlexOf({ flex: {} }), null);
  assert.equal(m.memberFlexOf({ flex: { frame: '', vip: 'yes', step: 0 } }), null);
  assert.deepEqual(plain(m.memberFlexOf({ flex: { frame: 's1:aurora-frame', vip: true, step: 41.7 } })), { frame: 's1:aurora-frame', vip: true, step: 41 });
  assert.deepEqual(plain(m.memberFlexOf({ flex: { step: 50 } })), { frame: null, vip: false, step: 50 });
  const row = fs.readFileSync('src/screens/LeaderboardsScreen/StandingsRow.tsx', 'utf8');
  assert.match(row, /\{flex \? <MemberFlex [^>]*still \/> : \(/);
});

test('money on the map and Profile: Park Day Pack in the free suggestion slot only, Shark Pass banner on Profile', () => {
  const explore = fs.readFileSync('src/screens/ExploreScreen.tsx', 'utf8');
  assert.match(explore, /const parkOfferSlot = !!player && !!park && !railShowing && suggestionSlots\.left == null && suggestionSlots\.right == null\n\s*&& !parkTip && !isActive && !liveEvt\.event;/);
  assert.equal((explore.match(/<ParkDayOffer \/>/g) ?? []).length, 1);
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.equal((profile.match(/<SharkPassBanner /g) ?? []).length, 1);
});

test('StreakFlame: own streak only from an enabled Daily 3 payload; friend rows, Player page and Standings only when the field is present', () => {
  const s = loadTs('src/services/retention/useOwnStreak.ts', {
    '@react-navigation/native': { useFocusEffect: () => undefined }, react: { useCallback: f => f, useState: v => [v, () => undefined] },
    '../../api/endpoints/retention': { getDailyThree: async () => ({ enabled: false }) } });
  assert.equal(s.ownStreakOf(null), null);
  assert.equal(s.ownStreakOf({ enabled: false }), null);
  assert.deepEqual(plain(s.ownStreakOf({ enabled: true, streak: { days: 4, best: 9 } })), { days: 4, best: 9 });
  for (const [file, re] of [
    ['src/screens/social/PlayerRow.tsx', /\{player\.daily3_streak != null \? \(/],
    ['src/screens/LeaderboardsScreen/StandingsRow.tsx', /\{player\.daily3_streak != null \? \(/],
    ['src/screens/PlayerScreen.tsx', /\{currentPlayer\.daily3_streak != null && <StreakFlame /],
    ['src/screens/ProfileScreen.tsx', /\{ownStreak && <StreakFlame /],
  ]) assert.match(fs.readFileSync(file, 'utf8'), re, file);
});
