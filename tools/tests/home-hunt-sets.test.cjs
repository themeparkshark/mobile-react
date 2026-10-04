'use strict';
/**
 * Collection book rewards: pick sheet rules, the claim outcome and WEAR IT.
 * The book's own model (sets, rewards, tiles, Ride Photos) is covered in
 * hh3-dex.test.cjs.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const model = loadTs('src/screens/SetCollection/setHuntModel.ts');


test('a wearable_pick claim needs an unowned pick before it is sent', () => {
  const choices = [{ id: 1, name: 'Cap', item_type_id: 1, icon_url: null, paper_url: null, owned: true },
    { id: 2, name: 'Scarf', item_type_id: 3, icon_url: null, paper_url: null, owned: false }];
  const view = { needsPick: true, choices };
  assert.equal(model.validPick(view, null), false);
  assert.equal(model.validPick(view, 1), false, 'an owned choice is not a valid pick');
  assert.equal(model.validPick(view, 2), true);
  assert.equal(model.validPick({ needsPick: false, choices: [] }, null), true);
});

test('claim outcome: Added to your Inventory with WEAR IT, or the wearable on the way', () => {
  const outcome = plain(model.claimOutcome({ rewards_granted: { item: { id: 9, name: 'Scarf', item_type_id: 3 } } }));
  assert.equal(outcome.toast, 'Added to your Inventory');
  assert.deepEqual(outcome.wear, { itemId: 9, itemTypeId: 3, name: 'Scarf' });
  const pending = plain(model.claimOutcome({ rewards_granted: { pending_wearable: 'Scarf' } }));
  assert.equal(pending.pendingLine, 'Your wearable is on the way');
  assert.equal(pending.toast, null);
  assert.equal(pending.wear, null);
  assert.equal(model.WEAR_IT, 'WEAR IT');
  assert.deepEqual(plain(model.wearNavigationParams({ itemId: 9, itemTypeId: 3 })), { itemTypeId: 3, focusItemId: 9 });
  const note = model.claimOutcome({ rewards_granted: { ticket_note: 'Ticket pouch full. Converted to 50 coins.' } });
  assert.equal(note.ticketNote, 'Ticket pouch full. Converted to 50 coins.');
});

test('WEAR IT equips through the existing inventory call, then opens Inventory on the item', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(screen, /equipInventoryItem\(\{ id: wear\.itemId \} as ItemType\)/);
  assert.match(screen, /RootNavigation\.navigate\('Inventory', wearNavigationParams\(wear\)\)/);
  const equipAt = screen.indexOf('equipInventoryItem({ id: wear.itemId }');
  const navAt = screen.indexOf("RootNavigation.navigate('Inventory', wearNavigationParams(wear))");
  assert.ok(equipAt > 0 && navAt > equipAt, 'equip first, then navigate');
});

test('the redeem find card shows the Hunt Points chip only when the server sends it', () => {
  const modal = read('src/components/PrepItemRedeemModal.tsx');
  assert.match(modal, /huntPointsChip\(pickupOutcome\?\.hunt_points\)/);
  assert.match(modal, /if \(!chip\) return null/);
});
