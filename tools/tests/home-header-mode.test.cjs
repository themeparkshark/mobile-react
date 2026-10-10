const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/home-header-mode.test.cjs
// At home the map is Home Hunt; the header must say so, not "Travel Mode".
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('no player-facing screen says Travel Mode', () => {
  for (const f of ['src/screens/ExploreScreen.tsx', 'src/screens/ExploreScreen/HomeHuntPreviewScreen.tsx',
    'src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx']) {
    assert.doesNotMatch(read(f), />\s*(Travel Mode|TRAVEL MODE)\s*</, f);
  }
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /accessibilityLabel="Home Hunt" accessibilityHint="Explains Home Hunt"/);
  assert.match(explore, /\}\}>Home Hunt<\/Text>/);
});

test('the header term opens a Home Hunt explanation, and old names still resolve', () => {
  const g = loadTs('src/services/help/glossary.ts');
  const term = g.LOCAL_GLOSSARY.travel_mode;
  assert.equal(term.label, 'Home Hunt');
  assert.match(term.what, /away from a park/);
  assert.equal(g.glossaryKeyForName('Home Hunt'), 'travel_mode');
  assert.equal(g.glossaryKeyForName('Travel Mode'), 'travel_mode');
});
