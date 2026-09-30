'use strict';
/**
 * Settings account deletion (WS8, P0-5, App Review 5.1.1(v)) and support rows.
 * Nothing is deleted without confirmation, a failure keeps the player signed in
 * with a retry, the Apple code is forwarded for the grant revoke, and the Help
 * and bug rows open one support address.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const flow = loadTs('src/screens/Settings/accountDeletion.ts');

function steps(overrides = {}) {
  const calls = [];
  return {
    calls,
    steps: {
      confirm: async () => { calls.push('confirm'); return true; },
      reconfirmWithApple: async () => { calls.push('apple'); return { kind: 'code', code: 'fresh-code' }; },
      deleteNow: async code => { calls.push(['delete', code]); return { deleted: true, appleRevokeQueued: true, subscriptionNotice: null }; },
      setBusy: busy => calls.push(['busy', busy]),
      ...overrides,
    },
  };
}

test('confirmed deletion forwards the fresh Apple code and reports deleted', async () => {
  const { calls, steps: s } = steps();
  const result = await flow.runAccountDeletion(s);
  assert.equal(result.outcome, 'deleted');
  assert.deepEqual(calls, ['confirm', 'apple', ['busy', true], ['delete', 'fresh-code'], ['busy', false]]);
});

test('declining the confirm sheet or the Apple sheet deletes nothing', async () => {
  for (const override of [
    { confirm: async () => false },
    { reconfirmWithApple: async () => ({ kind: 'cancelled' }) },
  ]) {
    let deleted = false;
    const { steps: s } = steps({ ...override, deleteNow: async () => { deleted = true; } });
    assert.equal((await flow.runAccountDeletion(s)).outcome, 'cancelled');
    assert.equal(deleted, false);
  }
});

test('no Apple Account on the device still deletes, without a revoke code', async () => {
  for (const reconfirm of [async () => ({ kind: 'unavailable' }), async () => { throw new Error('boom'); }]) {
    const { calls, steps: s } = steps({ reconfirmWithApple: reconfirm });
    assert.equal((await flow.runAccountDeletion(s)).outcome, 'deleted');
    assert.deepEqual(calls.find(c => Array.isArray(c) && c[0] === 'delete'), ['delete', null]);
  }
});

test('a failed delete returns failed and clears the busy overlay', async () => {
  const failure = new Error('500');
  const { calls, steps: s } = steps({ deleteNow: async () => { throw failure; } });
  const result = await flow.runAccountDeletion(s);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.error, failure);
  assert.deepEqual(calls.at(-1), ['busy', false]);
});

test('Apple errors: only a cancel stops the flow', () => {
  assert.equal(flow.appleReconfirmFromError({ code: 'ERR_REQUEST_CANCELED' }).kind, 'cancelled');
  assert.equal(flow.appleReconfirmFromError({ code: 'ERR_REQUEST_UNKNOWN' }).kind, 'unavailable');
  assert.equal(flow.appleReconfirmFromError(null).kind, 'unavailable');
});

test('the done message carries the VIP billing notice from the server', () => {
  assert.equal(flow.deletionDoneMessage({ subscriptionNotice: null }), flow.DELETION_COPY.doneMessage);
  assert.match(flow.deletionDoneMessage({ subscriptionNotice: ' Cancel VIP in Settings. ' }), /deleted\.[^]*\n\nCancel VIP in Settings\.$/);
});

test('Help and bug rows open one support address with useful details', () => {
  const help = flow.supportMailto('help');
  assert.match(help, /^mailto:contact@themeparkshark\.com\?subject=Theme%20Park%20Shark%20help&body=/);
  const bug = decodeURIComponent(flow.supportMailto('bug', { appVersion: '1.6.0', osVersion: '18.6', playerId: 42 }));
  assert.match(bug, /subject=Bug report/);
  assert.match(bug, /App version: 1\.6\.0\niOS: 18\.6\nPlayer ID: 42$/);
});

test('Settings uses the brand kit: no icon font, no system alerts, no email-confirm deletion', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
  assert.doesNotMatch(source, /fortawesome|Alert\.alert|force-delete'|check your email/i);
  assert.match(source, /delete-account/);
  assert.match(source, /runAccountDeletion/);
  for (const copy of Object.values(flow.DELETION_COPY)) assert.doesNotMatch(copy, /—/);
  for (const art of ['music', 'sound', 'mail', 'trash']) {
    assert.ok(fs.existsSync(path.join(root, `assets/images/screens/settings/${art}.png`)), `${art} art`);
  }
});
