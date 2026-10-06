'use strict';
/**
 * Items that come and go (next-wave/cp-catalogs/DESIGN.md): leaving dates, last runs,
 * seasonal returns, rarity, and the closet's RETIRED / RARE badges, in the existing shop style.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const life = loadTs('src/helpers/shopLifecycle.ts');
const shelves = loadTs('src/helpers/shopShelves.ts', {}, {});

test('leaving copy: a date, honest about coming back, never a countdown or pressure', () => {
  assert.equal(life.leavingLine({ on: '2026-11-30', forever: true }), "Leaving after Nov 30. Won't come back.");
  assert.equal(life.leavingLine({ on: '2026-11-14', forever: false }), 'Leaving after Nov 14. It might come back someday.');
  assert.equal(life.leavingRibbon({ on: '2026-11-30', forever: true }), 'LAST RUN');
  assert.equal(life.leavingRibbon({ on: '2026-11-30', forever: false }), 'LEAVING');
  assert.equal(life.KEEP_LINE, 'Every piece you buy is yours forever.');
  for (const s of [life.leavingLine({ on: '2026-11-30', forever: true }), life.leavingLine({ on: '2026-11-30', forever: false })]) {
    assert.doesNotMatch(s, /hurry|only|tonight|last chance|left|\d+\s*(h|m|hours|minutes)\b|!/i);
  }
});

test('bad or missing data never shows a label', () => {
  assert.equal(life.leavingOf(null), null);
  assert.equal(life.leavingOf({ leaving: { on: 'soon', forever: true } }), null);
  assert.deepEqual(plain(life.leavingOf({ leaving: { on: '2026-11-30', forever: false } })), { on: '2026-11-30', forever: false });
  assert.equal(life.rarityOf({ rarity: { tier: 'legendary', label: 'x' } }), null);
  assert.equal(life.rarityOf({ rarity: { tier: 'rare', label: ' ' } }), null);
  assert.equal(life.rarityOf({ rarity: { tier: 'rare', label: 'Rare find: few sharks have this' } }).tier, 'rare');
});

test('tile ribbons: LEAVING SOON / LAST RUN outrank BACK AGAIN and NEW, owned tiles stay clean', () => {
  const leaving = { on: '2026-11-30', forever: true };
  assert.equal(shelves.tileLanes({ id: 1, shop: { leaving, returning: true, is_new: true } }).ribbon, 'leaving');
  assert.equal(shelves.tileLanes({ id: 1, shop: { returning: true, is_new: true } }).ribbon, 'returning');
  assert.equal(shelves.tileLanes({ id: 1, shop: { leaving, is_owned: true } }).ribbon, null);
  assert.equal(shelves.tileLanes({ id: 1, shop: { last_chance: true, leaving } }).ribbon, 'last_chance', 'the old event rule is unchanged');
  const tile = src('src/screens/StoreScreen/ShopTile.tsx');
  assert.match(tile, /leaving: \{ label: 'LEAVING', color: BRAND\.navy, ink: BRAND\.gold \}/, 'calm navy and gold, never red');
});

test('closet badges: RETIRED for a piece that will never return, RARE FIND for a rare one (never confused with the RARE tier chip)', () => {
  const rare = { tier: 'rare', label: 'Rare find: few sharks have this' };
  assert.deepEqual(plain(life.closetBadge({ retired: true, forever: true, rarity: rare })), { label: 'RETIRED', pearl: 'white' });
  assert.deepEqual(plain(life.closetBadge({ retired: true, forever: true })), { label: 'RETIRED', pearl: null });
  assert.deepEqual(plain(life.closetBadge({ retired: true, forever: false, rarity: { tier: 'ultra_rare', label: 'u' } })), { label: 'RARE FIND', pearl: 'gold' });
  assert.equal(life.closetBadge({ retired: true, forever: false }), null, 'resting for a while is not news in the closet');
  assert.equal(life.closetBadge(null), null);
  assert.match(life.closetBadgeSay({ retired: true, forever: true, rarity: rare }), /retired: it won't come back to the shop\. Rare find: few sharks have this/);
  const item = src('src/components/Item.tsx');
  assert.match(item, /const life = closetBadge\(item\.lifecycle\);/);
  assert.match(item, /closetBadgeSay\(item\.lifecycle\)/, 'VoiceOver hears it too');
});

test('the try-on says when it leaves, whether it comes back, and the forever promise', () => {
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /leavingLine\(leavingOf\(item\.shop\)!\)/);
  assert.match(sheet, /owned \? 'It’s yours\. Forever\.' : KEEP_LINE/);
  assert.match(sheet, /rarityOf\(item\.shop\)!\.label/);
  assert.match(sheet, /item\.shop\?\.returning && !owned && !leavingOf\(item\.shop\)/, 'no mixed messages on a returning piece that is leaving');
  for (const tier of ['white', 'silver', 'gold']) assert.ok(fs.existsSync(path.join(root, `assets/shop-life/pearl-${tier}.webp`)));
  const bytes = ['white', 'silver', 'gold'].reduce((n, t) => n + fs.statSync(path.join(root, `assets/shop-life/pearl-${t}.webp`)).size, 0);
  assert.ok(bytes < 16 * 1024, `pearls are ${bytes} bytes`);
});

test('no catalog screens ship: the premise lives in the existing shops', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/screens/Catalog')), 'no catalog UI');
  assert.doesNotMatch(src('src/Root.tsx'), /name="Catalog"|CollectionLog/);
});
