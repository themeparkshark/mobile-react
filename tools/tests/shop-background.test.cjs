const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the Shark Shop sits on brand blue when its store has no background art', () => {
  const shop = fs.readFileSync(path.join(__dirname, '../../src/screens/StoreScreen.tsx'), 'utf8');
  assert.match(shop, /backgroundColor: BRAND\.blue,\s*\}\}\s*source=\{currentStore\?\.background_url \?/);
});
