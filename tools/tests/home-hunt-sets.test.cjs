'use strict';
/**
 * Set screens: hero row, exchange costs, gate badges, the milestone track
 * (8 / 20 / 30 / 40), pick sheet rules, the claim outcome and WEAR IT.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const model = loadTs('src/screens/SetCollection/setHuntModel.ts');

const item = (id, rarity, extra = {}) => ({ id, rarity, name: `Item ${id}`, is_collected: false, ...extra });
const milestone = (key, target, extra = {}) => ({
  key, label: `${target} finds`, target, collected: 0, is_unlocked: false, status: 'locked', rewards: {}, ...extra,
});

test('legacy sets (milestones null) keep the starter flow; authored sets use the track', () => {
  assert.equal(model.authoredMilestones({ milestones: null }), null);
  assert.equal(model.authoredMilestones({}), null);
  assert.equal(model.authoredMilestones({ milestones: [] }), null);
  assert.equal(model.authoredMilestones({}, { milestones: [milestone('starter', 8)] }).length, 1);
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(screen, /progress\.starter_milestone && !milestones/);
  assert.match(screen, /claimSetMilestone\(selectedSetSlug, view\.key, itemId\)/);
});

test('the track is ordered 8, 20 (Month goal), 30, 40', () => {
  const track = plain(model.milestoneTrack([
    milestone('master', 30), milestone('encore', 40), milestone('starter', 8),
    milestone('explorer', 20, { month_goal: true, status: 'claimable' }),
  ]));
  assert.deepEqual(track.map(view => view.target), [8, 20, 30, 40]);
  assert.equal(track[1].monthGoal, true);
  assert.equal(track[1].canClaim, true);
  assert.equal(track[0].canClaim, false);
});

test('a wearable_pick claim needs an unowned pick before it is sent', () => {
  const choices = [{ id: 1, name: 'Cap', item_type_id: 1, icon_url: null, paper_url: null, owned: true },
    { id: 2, name: 'Scarf', item_type_id: 3, icon_url: null, paper_url: null, owned: false }];
  const [view] = model.milestoneTrack([milestone('complete', 30, { status: 'claimable', rewards: { pick: true }, wearable_choices: choices })]);
  assert.equal(view.needsPick, true);
  assert.equal(model.validPick(view, null), false);
  assert.equal(model.validPick(view, 1), false, 'an owned choice is not a valid pick');
  assert.equal(model.validPick(view, 2), true);
  const [plainView] = model.milestoneTrack([milestone('starter', 8, { status: 'claimable', rewards: { energy: 10 } })]);
  assert.equal(plainView.needsPick, false);
  assert.equal(model.validPick(plainView, null), true);
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

test('hero row: the legendary first, then the epics', () => {
  const heroes = plain(model.heroItems([item(1, 1), item(2, 4), item(3, 5), item(4, 4), item(5, 3)]));
  assert.deepEqual(heroes.map(entry => entry.id), [3, 2, 4]);
  assert.equal(model.heroItems(null).length, 0);
});

test('exchange costs per rarity read from progress, then from the items', () => {
  const rows = plain(model.exchangeCostRows({ 1: 4, 2: 4, 3: 4, 4: 8, 5: 12 }, []));
  assert.deepEqual(rows.map(row => [row.rarity, row.cost]), [[5, 12], [4, 8], [3, 4], [2, 4], [1, 4]]);
  assert.equal(rows[0].label, 'Legendary');
  const fromItems = plain(model.exchangeCostRows(null, [item(1, 4, { exchange_cost: 8 }), item(2, 1, { exchange_cost: 4 })]));
  assert.deepEqual(fromItems.map(row => row.cost), [8, 4]);
  assert.equal(model.itemExchangeCost(item(1, 4, { exchange_cost: 8 }), { 4: 9 }, 4), 8);
  assert.equal(model.itemExchangeCost(item(1, 4), { 4: 9 }, 4), 9);
  assert.equal(model.itemExchangeCost(item(1, 2), null, 4), 4);
});

test('gate badges use existing icons and the server explainer verbatim', () => {
  assert.equal(model.gateIcon({ type: 'hours', explainer: 'x' }), 'timer');
  assert.equal(model.gateIcon({ type: 'evening', explainer: 'x' }), 'star');
  assert.equal(model.gateIcon({ type: 'weather', explainer: 'x' }), 'sparkle');
  assert.equal(model.gateIcon(null), null);
  assert.equal(model.gateExplainer({ type: 'hours', explainer: ' Opens 9 to 5. ' }), 'Opens 9 to 5.');
  assert.equal(model.gateExplainer(undefined), '');
});

test('the redeem find card shows the Hunt Points chip only when the server sends it', () => {
  const modal = read('src/components/PrepItemRedeemModal.tsx');
  assert.match(modal, /huntPointsChip\(pickupOutcome\?\.hunt_points\)/);
  assert.match(modal, /if \(!chip\) return null/);
});
