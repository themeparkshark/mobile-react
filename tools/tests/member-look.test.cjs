'use strict';
/**
 * Member items: owned forever, worn only while a member (secret-shop/DESIGN.md 4.3).
 * The server is the authority; the app shows the lock, explains it, and never
 * breaks on the refusal.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const react = { useEffect: () => undefined, useState: v => [v, () => undefined] };

function memberLook(read) {
  return loadTs('src/services/memberLook.ts', {
    react,
    '../api/endpoints/me/member-look': { getMemberLook: read ?? (async () => null) },
  });
}

const COPY = 'VIP members can wear this. It stays in your closet forever.'; // RC glossary: one name for VIP

test('the lock is off until the server says so, and an older server keeps it off', async () => {
  const m = memberLook();
  assert.equal(m.memberWearLockOn(), false);
  assert.equal(m.memberWearLocked({ is_member_item: true }, false), false, 'off: nothing locks');

  await m.refreshMemberLook(async () => null);
  assert.equal(m.memberWearLockOn(), false, '404 route: still off');
  await m.refreshMemberLook(async () => { throw new Error('offline'); });
  assert.equal(m.memberWearLockOn(), false, 'a hiccup never turns it on');

  await m.refreshMemberLook(async () => ({ wear_lock: true, member: false, note: null, restore: null }));
  assert.equal(m.memberWearLockOn(), true);
  assert.equal(m.MEMBER_WEAR_COPY, COPY);
});

test('member pieces are VIP gear and every Secret Shop piece, the same test as the server', () => {
  const m = memberLook();
  assert.equal(m.isMemberWearItem({ is_member_item: true, source: 'vip' }), true, 'legacy VIP (Jetpack 436)');
  assert.equal(m.isMemberWearItem({ is_member_item: 1 }), true);
  assert.equal(m.isMemberWearItem({ is_member_item: false, source: 'secret' }), true);
  assert.equal(m.isMemberWearItem({ is_member_item: false, source: 'shop' }), false);
  assert.equal(m.memberWearLocked({ source: 'secret' }, false, true), true, 'lapsed: locked');
  assert.equal(m.memberWearLocked({ source: 'secret' }, true, true), false, 'member: wears it');
  assert.equal(m.memberWearLocked({ source: 'shop' }, false, true), false, 'ordinary pieces never lock');
});

test('a 422 member_wear_locked becomes a member_locked notice, not "not in your closet"', async () => {
  const fail = (data) => { const e = new Error('422'); e.response = { status: 422, data }; return e; };
  let reply;
  const look = loadTs('src/api/endpoints/me/look.ts', { '../../client': { __esModule: true, default: { put: async () => { throw reply; } } } });
  reply = fail({ code: 'member_wear_locked', message: COPY, errors: { 'slots.neck_item': [COPY], item_id: [COPY] } });
  assert.deepEqual(plain(await look.putLook(3, { neck_item: 436 })), { kind: 'rejected', slots: ['neck_item'], memberLocked: true });
  reply = fail({ errors: { 'slots.neck_item': ["That item isn't in your closet."] } });
  assert.deepEqual(plain(await look.putLook(3, { neck_item: 9 })), { kind: 'rejected', slots: ['neck_item'] });

  const { LookQueue } = loadTs('src/helpers/lookQueue.ts');
  const notices = [];
  const q = new LookQueue({
    now: () => 0, schedule: (fn) => { fn(); return 1; }, cancel: () => {}, onChange: () => {}, onSaved: () => {},
    onNotice: n => notices.push(plain(n)), load: async () => ({ version: 0, slots: {} }), legacyToggle: async () => ({}),
    save: async () => ({ kind: 'rejected', slots: ['neck_item'], memberLocked: true }),
  }, { neck_item: null }, 0);
  q.intend('neck_item', { id: 436, item_type: { id: 3 } });
  await q.flushNow();
  for (let i = 0; i < 6; i += 1) await new Promise(r => setImmediate(r));
  assert.equal(notices.at(-1).kind, 'member_locked');
  assert.equal(q.display().neck_item, null, 'the shark goes back to what the server saved');
});

test('the legacy toggle (older backend) maps the same refusal', () => {
  const s = src('src/helpers/lookQueue.ts');
  assert.match(s, /response\.data\?\.code === 'member_wear_locked' \? \{ memberLocked: true \}/);
});

test('try-on: an owned member piece while lapsed asks a grown-up instead of failing to wear', () => {
  const shelves = loadTs('src/helpers/shopShelves.ts');
  const base = { owned: true, worn: false, vipLocked: true, short: 0, phase: 'idle', wear: 'idle', finishes: false, cost: 140 };
  assert.deepEqual(plain(shelves.tryOnCta({ ...base, wearLocked: true })),
    { label: 'Ask a grown-up', action: 'vip', note: COPY, look: 'go' });
  assert.equal(shelves.tryOnCta({ ...base, wearLocked: false }).action, 'wear');
  assert.equal(shelves.tryOnCta({ ...base, wearLocked: true, worn: true }).action, 'close', 'taking it off always works');
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /phase === 'confirm' && memberItem && !fxKey \? \{ \.\.\.lapsedCta, note: MEMBER_PROMISE \}/, 'buy confirmation says it (a Secret piece says it once, in its card)');
  assert.match(sheet, /\{!fxKeyOf\(item\) && memberItem && \(/, 'the item card says it on VIP gear too');
  assert.match(sheet, /const keepLine = player\?\.is_subscribed \? MEMBER_KEEP : MEMBER_PROMISE;/, 'and on every Secret piece');
});

test('Inventory: lock badge on owned member pieces, a tap explains and offers the gated join', () => {
  const inv = src('src/screens/InventoryScreen.tsx');
  assert.match(inv, /memberLocked=\{memberWearLocked\(item, isMember, memberLockOn\)\}/);
  assert.match(inv, /if \(!isWorn && memberWearLocked\(item, isMember, memberLockOn\)\) \{[\s\S]*?explainMemberLock\(\);\s*return;/);
  const card = src('src/components/Item.tsx');
  assert.match(card, /showMemberLock && \(/);
  const host = src('src/components/MemberLookHost.tsx');
  assert.match(host, /if \(choice === 0\) await openMembership\(\);/, 'join goes through the grown-up gate');
  assert.match(host, /title: 'Put back on your member look\?'/);
  assert.match(host, /memberLookNoteSeen\(\)/, 'the lapse note shows once');
  assert.match(src('src/Root.tsx'), /<MemberLookHost \/>/);
});
