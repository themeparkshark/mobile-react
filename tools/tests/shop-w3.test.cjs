/**
 * Fix round w3, lane shop (Nov 18 2026): the Shark Shop and Supplies.
 * Each test names the T id it holds and fails without its fix.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('T152: the Store opens on the Shark Shop with no params, bad params or a string id', () => {
  const { storeParams } = loadTs('src/screens/StoreScreen/storeParams.ts');
  assert.deepEqual(plain(storeParams(undefined)), { store: 'shark-shop' });
  assert.deepEqual(plain(storeParams(null)), { store: 'shark-shop' });
  assert.deepEqual(plain(storeParams({})), { store: 'shark-shop' });
  assert.deepEqual(plain(storeParams({ store: 'nonsense', tab: 'x', focus: 'y' })), { store: 'shark-shop' });
  assert.deepEqual(plain(storeParams({ store: '12' })), { store: 12 });
  assert.deepEqual(plain(storeParams({ store: 'shark-shop', focus: 'tickets' })), { store: 'shark-shop', tab: 'supplies', focus: 'tickets' });
  assert.deepEqual(plain(storeParams({ store: 4, secret: true, focus_item: '77' })), { store: 4, secret: true, focus_item: 77 });
  const screen = read('src/screens/StoreScreen.tsx');
  assert.match(screen, /storeParams\(props\.route\?\.params\)/);
  assert.match(screen, /storeParams\(route\?\.params\)/);
  assert.doesNotMatch(screen, /route\.params as \{/, 'no raw cast of route.params (undefined crashes)');
  assert.match(read('src/Root.tsx'), /name="Store"[\s\S]{0,120}initialParams=\{\{ store: 'shark-shop' \}\}/);
});

test('T153: real-money coin packs say gear only, and the grown-up box names Mystery Pin Boxes only while they are live', () => {
  const stub = { default: () => null };
  const info = loadTs('src/components/money/GrownUpsInfo.tsx', {
    react: { useEffect: () => undefined, useState: v => [v, () => undefined] },
    'react-native': { StyleSheet: { create: x => x }, Text: 'Text', View: 'View' },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
    '../../api/endpoints/me/money-spend': { getMoneySpend: async () => null },
    '../../services/money/wishlist': { useWishlist: () => [] },
    '../../services/money/flags': { useMoneyFlag: () => false },
    '../../ui': { FONT: {}, GameIcon: stub.default },
  });
  const off = plain(info.grownUpLines(false)).join(' ');
  assert.doesNotMatch(off, /Mystery|box/i, 'boxes off: no box sentence');
  assert.match(off, /Nothing random is sold for real money\./);
  const on = plain(info.grownUpLines(true)).join(' ');
  assert.match(on, /Mystery Pin Boxes cost Shark Coins and show their odds/);
  assert.match(read('src/components/money/GrownUpsInfo.tsx'), /grownUpLines\(useMoneyFlag\('pin_mystery_boxes'\)\)/);
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(shop, /boxesLine|Mystery Pin Boxes\. Odds/, 'no box math or box note on Supplies coin packs');
});
