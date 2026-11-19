'use strict';
/**
 * Fix round w3, lane rewards (November 2026): coming back is clear and rewards
 * are honest. Each test names the T id it holds.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rc = loadTs('src/services/retention/claimReconcile.ts');
const model = loadTs('src/services/retention/rewardsModel.ts');
const noSleep = { sleep: async () => undefined };

test('T093 T094: a lost claim answer is read back over the server window; a server answer reads once', async () => {
  const timeout = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
  const status409 = Object.assign(new Error('Already'), { response: { status: 409 } });
  const dropped = Object.assign(new Error('Network Error'), { response: { status: 0 } });
  assert.equal(rc.serverAnswered(timeout), false);
  assert.equal(rc.serverAnswered(dropped), false, 'React Native status 0 is no answer');
  assert.equal(rc.serverAnswered(status409), true);
  // The window covers the server's 30 s limit after the app's 12 s timeout.
  const total = rc.LOST_CLAIM_WAITS_MS.reduce((a, b) => a + b, 0);
  assert.ok(12000 + total >= 28000, `12 s + ${total} ms reaches the server's limit`);
  let reads = 0;
  const later = async () => (++reads >= 3 ? 'paid' : null);
  assert.equal(await rc.reconcileClaim(timeout, later, noSleep), 'paid');
  assert.equal(reads, 3, 'it kept reading until the server showed it paid');
  reads = 0;
  assert.equal(await rc.reconcileClaim(status409, later, noSleep), null);
  assert.equal(reads, 1, 'a server that answered is read once');
  reads = 0;
  const throwing = async () => { reads++; throw new Error('offline'); };
  assert.equal(await rc.reconcileClaim(timeout, throwing, noSleep), null);
  assert.equal(reads, rc.LOST_CLAIM_WAITS_MS.length, 'a read that throws tries again on the next wait');
  // Stops when the screen goes away.
  reads = 0;
  assert.equal(await rc.reconcileClaim(timeout, later, { ...noSleep, alive: () => false }), null);
  assert.equal(reads, 0);
});

test('T094: claimOrReconcile says whether the prize came from a read-back and whether the server answered', async () => {
  const timeout = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
  const ok = await rc.claimOrReconcile(async () => 'got', async () => null, noSleep);
  assert.deepEqual(plain(ok), { paid: 'got', lost: false, answered: true });
  const lost = await rc.claimOrReconcile(async () => { throw timeout; }, async () => 'read', noSleep);
  assert.deepEqual(plain(lost), { paid: 'read', lost: true, answered: false });
  const failed = await rc.claimOrReconcile(async () => { throw timeout; }, async () => null, noSleep);
  assert.equal(failed.paid, null);
});

test('T094: a stamp that did not come through stays on the row with RETRY, and the note says so', () => {
  const base = { dailyChest: null, daily3: null, weekly: null, levelChest: null, trail: null, events: null };
  const claim = model.rewardsRows({ ...base, stamps: { claimable: 3 } }).find(r => r.key === 'stamps');
  assert.equal(claim.action, 'claim_all');
  const retry = model.rewardsRows({ ...base, stamps: { claimable: 1, retry: true } }).find(r => r.key === 'stamps');
  assert.equal(retry.action, 'retry');
  assert.equal(retry.ready, 1);
  assert.equal(retry.line, 'Tickets from 1 stamp still waiting', 'merge w3: lane shelf T126 retires the words stamp prize');
  assert.equal(model.stampClaimNote({ coins: 0, tickets: 1, energy: 0, xp: 95 }, 1), '+1 Ticket, +95 XP. 1 stamp is still waiting. Tap RETRY.');
  assert.equal(model.stampClaimNote({ coins: 0, tickets: 0, energy: 0, xp: 0 }, 2), '2 stamps are still waiting. Tap RETRY.');
  assert.equal(model.stampClaimNote({ coins: 55, tickets: 0, energy: 20, xp: 95 }, 0), '+55 Shark Coins, +20 Energy, +95 XP');
  assert.match(read('src/components/retention/RewardsSheet.tsx'), /retry: 'RETRY'/);
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /claimOrReconcile\(\s*async \(\) => \(await claimStampReward\(st\.id\)\)/, 'each stamp claim reconciles a lost answer');
  assert.match(hook, /setStampRetry\(failed > 0 && waiting > 0\)/);
  assert.doesNotMatch(hook, /Those stamps did not go through/);
  assert.doesNotMatch(hook, /Check your internet and try again\.'\);\n    \} finally/, 'the reveal never blames the internet for a slow server');
});

test('T096: Daily 3 is met as its three goals, never first as "All 3 done!"; ticks say so on the map', () => {
  const base = { dailyChest: null, weekly: null, levelChest: null, trail: null, stamps: null, events: null };
  const d = { done: 3, total: 3, claimable: true, claimed: false, flame: 0 };
  const unseen = model.rewardsRows({ ...base, daily3: { ...d, seen: false } }).find(r => r.key === 'daily3');
  assert.equal(unseen.action, 'go', 'SEE: the goals first');
  assert.doesNotMatch(unseen.line, /All 3 done/);
  assert.equal(unseen.line, '3 of 3 goals done. See them');
  const seen = model.rewardsRows({ ...base, daily3: { ...d, seen: true } }).find(r => r.key === 'daily3');
  assert.equal(seen.action, 'open');
  const seenMod = loadTs('src/services/retention/daily3Seen.ts', { '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } } });
  assert.equal(seenMod.tickToast(1, 3), 'Daily 3: 1 of 3 done');
  assert.equal(seenMod.tickToast(3, 3), 'Daily 3: all 3 done! Your chest is in Rewards');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /if \(daily\?\.claimable && seenDate === daily\.date\) \{ backToRewards\.current = true;/, 'the row opens the chest only after the goals were shown');
  assert.match(hook, /noteDaily3Seen\(playerIdRef\.current, daily\.date\)/, 'opening Daily 3 is seeing its goals');
  assert.match(hook, /if \(mapClearRef\.current\) showToast\(tickToast\(/, 'a tick on the map says so');
});

test('T092: an opened chest reads Done in Daily 3 and GO never leads to a map with nothing to claim', () => {
  const goals = [{ kind: 'chest', done: false, progress: 0, target: 1 }, { kind: 'catch', done: false, progress: 0, target: 1 }];
  const shown = model.withChestOpened(goals, true);
  assert.equal(shown[0].done, true); assert.equal(shown[0].progress, 1);
  assert.equal(shown[1].done, false);
  assert.equal(model.withChestOpened(goals, false), goals, 'not opened: the same list');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.doesNotMatch(hook, /else closeThen\(\(\) => \{ askForDailyChest\(\); o\.onOpenChest\(\); \}\);/);
  assert.match(hook, /return !!gift\?\.redeemed_at && !!gift\.gift_date && gift\.gift_date\.slice\(0, 10\) === date;/, 'only today\'s chest counts');
});

test('T111: after the treat cards on this open, the daily chest waits for this visit\'s first catch (even with old catches)', () => {
  const q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  // A player the server remembers (2 old catches), on a new install: not a "first visit" by the server's count.
  const back = { firstVisit: false, catchesThisVisit: 0, huntStartedAt: null, now: 1000 };
  assert.equal(q.firstVisitChestWaits(back), false, 'without the intro this open, a returning player gets the chest');
  assert.equal(q.firstVisitChestWaits({ ...back, introThisOpen: true }), true, 'the intro just played: the chest waits');
  assert.equal(q.firstVisitChestWaits({ ...back, introThisOpen: true, catchesThisVisit: 1 }), false, 'the first catch lets it come');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /if \(\(homeIntroOwed \|\| homeIntroOpen\) && !park\) introThisOpen\.current = true;/);
  assert.match(explore, /introThisOpen: introThisOpen\.current && !park,/);
});

test('T109 T110: one calm flame line, keep it tomorrow or a kind welcome back, never a clock', () => {
  const d = { done: 3, total: 3, claimable: false, claimed: true, flame: 1, counted: true, best: 1 };
  assert.equal(model.flameNote(d), 'Open the game tomorrow to keep your flame');
  assert.equal(model.flameNote({ ...d, counted: false }), null, 'not lit today yet: the rows already say what to do');
  assert.equal(model.flameNote({ ...d, flame: 0, counted: false, best: 4 }), 'Welcome back! Finish Daily 3 to light a new flame');
  assert.equal(model.flameNote({ ...d, flame: 0, counted: false, best: 0 }), null, 'a new player sees "Start a flame"');
  assert.equal(model.flameNote(null), null);
  for (const line of [model.flameNote(d), model.flameNote({ ...d, flame: 0, best: 2 })]) {
    assert.doesNotMatch(line, /\d+\s*(h|m|s|hours?|minutes?)\b|left|hurry|before|ends/i, 'no countdown words');
  }
  assert.match(read('src/components/retention/RewardsSheet.tsx'), /\{flame != null && !!flameLine && <Text style=\{styles\.flameLine\}/);
});

function remindersModule({ status = 'granted', dev = false, os = 'ios' } = {}) {
  const scheduled = new Map(); const store = new Map(); let perm = status; const requests = [];
  const Notifications = {
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getPermissionsAsync: async () => ({ status: perm }),
    requestPermissionsAsync: async () => { requests.push(1); perm = 'granted'; return { status: perm }; },
    scheduleNotificationAsync: async req => { scheduled.set(req.identifier, req); return req.identifier; },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()].map(r => ({ identifier: r.identifier })),
    cancelScheduledNotificationAsync: async id => { scheduled.delete(id); },
  };
  const m = loadTs('src/services/retention/localReminders.ts', {
    '@react-native-async-storage/async-storage': { getItem: async k => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } },
    'expo-notifications': Notifications,
    'react-native': { Platform: { OS: os } },
    './flags': { flagOn: (f, n) => f?.all?.[n] === true },
  }, { __DEV__: dev, process: { env: dev ? { EXPO_PUBLIC_LOCAL_REMINDERS_DEV: '1' } : {} } });
  return { m, scheduled, store, requests, other: id => scheduled.set(id, { identifier: id }) };
}

test('T226: local reminders, one a day in the chest window, 3 at most when ignored, silent, kid words, no clock', async () => {
  const { m, scheduled, other } = remindersModule();
  const now = new Date(2026, 10, 18, 21, 5);
  const times = m.reminderTimes(now);
  assert.equal(times.length, 3, 'stops after 3 unanswered');
  times.forEach((t, i) => {
    assert.equal(t.getDate(), 19 + i, 'one a day, never today');
    assert.ok(t.getHours() >= 10 && t.getHours() < 12, 'inside the chest window (10 to 12)');
  });
  other('boss-push-1');
  assert.equal(await m.turnOnLocalReminders(), true);
  const ours = [...scheduled.values()].filter(r => r.identifier.startsWith('tps-local-reminder'));
  assert.equal(ours.length, 3);
  for (const r of ours) {
    assert.equal(r.content.sound, false, 'silent');
    assert.equal(r.content.title, 'Your daily chest is ready');
    assert.doesNotMatch(`${r.content.title} ${r.content.body}`, /\d|hurry|left|last chance|ends|before/i, 'no countdown, no urgency');
    assert.deepEqual(plain(r.content.data.route), { screen: 'Explore', params: { open: 'chest' } });
    assert.equal(r.trigger.type, 'date');
  }
  // Every app open replaces ours (so an everyday player only ever has the next 3, one a day).
  assert.equal(await m.refreshLocalReminders(true, false, new Date(2026, 10, 19, 9, 0)), 3);
  assert.equal([...scheduled.keys()].filter(k => k.startsWith('tps-local-reminder')).length, 3);
  assert.equal([...scheduled.values()].find(r => r.identifier === 'tps-local-reminder-1').trigger.date.getDate(), 20);
  // Turned off on the Daily 3 card, or the switch goes off: ours are cancelled, nobody else's.
  assert.equal(await m.refreshLocalReminders(true, true), 0);
  assert.deepEqual([...scheduled.keys()], ['boss-push-1']);
  await m.refreshLocalReminders(true, false);
  assert.equal(await m.refreshLocalReminders(false, false), 0);
  assert.deepEqual([...scheduled.keys()], ['boss-push-1']);
});

test('T226: the switch is the served local_reminders; the dev override never runs in a store or OTA bundle', async () => {
  const prod = remindersModule({ dev: false }).m;
  assert.equal(prod.localRemindersOn({ all: {} }), false);
  assert.equal(prod.localRemindersOn({ all: { local_reminders: true } }), true);
  assert.equal(prod.localRemindersDevOverride(), false, '__DEV__ false: the override is dead code');
  const dev = remindersModule({ dev: true }).m;
  assert.equal(dev.localRemindersOn({ all: {} }), true, 'lane testing only');
  const src = read('src/services/retention/localReminders.ts');
  assert.match(src, /return __DEV__ && process\.env\.EXPO_PUBLIC_LOCAL_REMINDERS_DEV === '1';/);
  // Not on this phone (Android) or not asked: nothing scheduled, never a prompt without a tap.
  const android = remindersModule({ os: 'android' });
  assert.equal(await android.m.scheduleLocalReminders(), 0);
  const undecided = remindersModule({ status: 'undetermined' });
  assert.equal(await undecided.m.mayAskForLocalReminders(), true);
  assert.equal(await undecided.m.refreshLocalReminders(true, false), 0, 'never chosen: an app open schedules nothing');
  assert.equal(undecided.requests.length, 0, 'an app open never prompts');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /if \(!\(flagOn\(flags, 'retention_push'\) \|\| local\) \|\| !calmForAutoOpen\('reward', own\(\)\)\) return;/, 'the same card, moment and one-automatic-open rule');
  assert.match(hook, /if \(localRemindersOn\(flags\)\) void turnOnLocalReminders\(\);/, 'CONTINUE turns them on');
  assert.match(read('src/services/push.ts'), /await cancelLocalReminders\(\);/, 'sign-out cancels them');
});

test('T119: the level chest footer beside the XP bar names the next level chest, never a flame prize', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /<Text style=\{styles\.nextText\}>\{`Next: Level \$\{lv \+ 1\} chest with new gear`\}<\/Text>/);
  assert.doesNotMatch(hook, /Next prize: \$\{daily\.streak\.next_milestone/);
});

test('T113: the Rewards badge shows once, settled; a claim drops it at once', () => {
  assert.equal(model.settleBadge(0, 1, 100), 0, 'a rising number waits');
  assert.equal(model.settleBadge(0, 5, model.BADGE_SETTLE_MS), 5, 'then shows the exact count');
  assert.equal(model.settleBadge(5, 4, 0), 4, 'a claim shows at once');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /rewards: settledSummary \}/);
});

test('T118: the level chest waits while the Daily 3 chest is ready, then takes its turn', () => {
  const base = { dailyChest: null, weekly: null, trail: null, stamps: null, events: null, levelChest: { level: 3, waiting: 1 } };
  const d = { done: 3, total: 3, claimed: false, flame: 1, seen: true };
  const both = model.rewardsRows({ ...base, daily3: { ...d, claimable: true } }).map(r => r.key);
  assert.deepEqual(plain(both), ['daily3']);
  const after = model.rewardsRows({ ...base, daily3: { ...d, claimable: false, claimed: true } }).map(r => r.key);
  assert.ok(after.includes('level_chest'));
});
