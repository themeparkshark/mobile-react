'use strict';
/**
 * WEAR IT opens Inventory with focusItemId; "See it in Inventory" uses
 * highlightItemId. Inventory must pin and pulse the item for either one
 * (regression: WEAR IT never pinned because Inventory only read highlightItemId).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const wardrobe = loadTs('src/helpers/wardrobe.ts');
const model = loadTs('src/screens/SetCollection/setHuntModel.ts');

test('inventoryPinTarget accepts highlightItemId or focusItemId', () => {
  assert.equal(wardrobe.inventoryPinTarget({ highlightItemId: 12 }), 12);
  assert.equal(wardrobe.inventoryPinTarget({ focusItemId: 34 }), 34);
  assert.equal(wardrobe.inventoryPinTarget({ itemTypeId: 3, focusItemId: '56' }), 56);
  assert.equal(wardrobe.inventoryPinTarget({ highlightItemId: 7, focusItemId: 8 }), 7, 'highlightItemId wins when both are sent');
  assert.equal(wardrobe.inventoryPinTarget({ highlightItemId: 0, focusItemId: 9 }), 9);
  for (const bad of [undefined, null, {}, { focusItemId: -1 }, { focusItemId: 1.5 }, { focusItemId: 'abc' }, { highlightItemId: NaN }]) {
    assert.equal(wardrobe.inventoryPinTarget(bad), undefined, JSON.stringify(bad));
  }
});

test('WEAR IT navigation params resolve to the worn item as the pin', () => {
  const params = plain(model.wearNavigationParams({ itemId: 41, itemTypeId: 2 }));
  assert.equal(wardrobe.inventoryPinTarget(params), 41);
  assert.equal(params.itemTypeId, 2);
});

test('pinnedItemIndex finds the pin on page 1 only', () => {
  const items = [{ id: 5 }, { id: 9 }, { id: 11 }];
  assert.equal(wardrobe.pinnedItemIndex(1, 5, items), 0);
  assert.equal(wardrobe.pinnedItemIndex(1, 11, items), 2, 'still lights when not first');
  assert.equal(wardrobe.pinnedItemIndex(2, 5, items), -1, 'never on a later page');
  assert.equal(wardrobe.pinnedItemIndex(1, 99, items), -1);
  assert.equal(wardrobe.pinnedItemIndex(1, undefined, items), -1);
  assert.equal(wardrobe.pinnedItemIndex(1, 5, []), -1);
});

test('InventoryScreen reads both params, pins through the API, and highlights the card', () => {
  const screen = fs.readFileSync('src/screens/InventoryScreen.tsx', 'utf8');
  assert.match(screen, /useRef\(inventoryPinTarget\(params\)\)\.current/);
  assert.doesNotMatch(screen, /useRef\(params\?\.highlightItemId\)/, 'must not read only highlightItemId');
  assert.match(screen, /getItems\(currentItemType\.id, page, pin\)/);
  assert.match(screen, /pinnedItemIndex\(page, pin, response\)/);
  assert.match(screen, /setHighlightedId\(pin\)/);
  assert.match(screen, /highlighted=\{highlightedId === item\.id\}/);
  assert.match(screen, /setParams\?\.\(\{ highlightItemId: undefined, focusItemId: undefined \}\)/);
  assert.doesNotMatch(screen, /—/);
});
