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
