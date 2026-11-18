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
