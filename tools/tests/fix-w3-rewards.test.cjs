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
  assert.equal(retry.line, '1 stamp prize is still waiting');
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
