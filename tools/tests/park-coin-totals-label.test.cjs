const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
// Run with: node --test tools/tests/park-coin-totals-label.test.cjs
// One park, one labeled truth: 15/35 RIDE COINS is every permanent coin here;
// the chips are its parts (RIDES 9/25 + SIGHTS 6/10), never a second total.
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const parts = () => loadTs('src/screens/parkCoinParts.ts').parkCoinParts;

test('the chips are parts that add back up to the park total', () => {
  const split = parts();
  const p = plain(split(15, 35, 9, 25));
  assert.deepEqual(p, { rides: { collected: 9, available: 25 }, sights: { collected: 6, available: 10 } });
  assert.equal(p.rides.collected + p.sights.collected, 15);
  assert.equal(p.rides.available + p.sights.available, 35);
  assert.equal(split(15, 35, undefined, undefined), null, 'no reviewed ride list: just the total');
  assert.equal(plain(split(4, 20, 4, 20)).sights, null, 'all rides: no sights chip');
  assert.deepEqual(plain(split(3, 35, 9, 25)).sights, { collected: 0, available: 10 }, 'never negative');
});

test('the header labels: one RIDE COINS total, a RIDES part, a SIGHTS part', () => {
  const src = read('src/screens/ParkCollectionHeader.tsx');
  assert.match(src, />RIDE COINS</);
  assert.doesNotMatch(src, />PASSPORT \{/, 'no second "passport" total next to the park total');
  assert.match(src, /RIDES \{parts\.rides\.collected\}\/\{parts\.rides\.available\}/);
  assert.match(src, /SIGHTS \{parts\.sights\.collected\}\/\{parts\.sights\.available\}/);
});

test('the glossary explains the parts instead of claiming the passport is the whole shelf', () => {
  const g = read('src/services/help/glossary.ts');
  assert.doesNotMatch(g, /Every ride coin at one park\. Fill the shelf/);
  assert.match(g, /One for each ride, show and famous sight/);
  assert.match(g, /The rides part of a park\\'s shelf/);
});
