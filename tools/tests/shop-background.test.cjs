const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the Shark Shop sits on brand blue when its store has no background art', () => {
  const shop = fs.readFileSync(path.join(__dirname, '../../src/screens/StoreScreen.tsx'), 'utf8');
  // The floor is brand blue; only the Secret Shop (secret_shop_v2) swaps it for its midnight.
  assert.match(shop, /const floor = secretShelves \? SECRET_THEME\.floor : BRAND\.blue;/);
  assert.match(shop, /backgroundColor: floor,\s*\}\}\s*source=\{currentStore\?\.background_url && !secretShelves \?/);
});
