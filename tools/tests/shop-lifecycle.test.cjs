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
  assert.equal(life.leavingRibbon({ on: '2026-11-30', forever: true }), 'RETIRING');
  assert.equal(life.leavingIcon({ on: '2026-11-30', forever: true }), 'star');
  assert.equal(life.leavingIcon({ on: '2026-11-30', forever: false }), 'moon', 'a different picture for each case');
  assert.equal(life.leavingSay({ on: '2026-11-14', forever: false }), 'leaving after November 14');
  assert.equal(life.leavingSay({ on: '2026-11-30', forever: true }), "retiring after November 30, it won't come back");
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

test('tile ribbons: LEAVING / RETIRING outrank LAST CHANCE, BACK AGAIN and NEW, owned tiles stay clean', () => {
  const leaving = { on: '2026-11-30', forever: true };
  assert.equal(shelves.tileLanes({ id: 1, shop: { leaving, returning: true, is_new: true } }).ribbon, 'leaving');
  assert.equal(shelves.tileLanes({ id: 1, shop: { returning: true, is_new: true } }).ribbon, 'returning');
  assert.equal(shelves.tileLanes({ id: 1, shop: { leaving, is_owned: true } }).ribbon, null);
  assert.equal(shelves.tileLanes({ id: 1, shop: { last_chance: true, leaving } }).ribbon, 'leaving', 'one piece never says both');
  assert.equal(shelves.tileLanes({ id: 1, shop: { last_chance: true } }).ribbon, 'last_chance', 'the old event rule is unchanged');
  const tile = src('src/screens/StoreScreen/ShopTile.tsx');
  assert.match(tile, /leaving: \{ label: 'LEAVING', color: BRAND\.navy, ink: BRAND\.gold \}/, 'calm navy and gold, never red');
  assert.match(tile, /visibleLeaving\(item\.shop, \{ secret: isSecretItem\(item\), vipLocked \}\)/, 'no retiring nudge on members-only pieces for non-members');
  assert.match(tile, /leavingSay\(leaving\)/, 'VoiceOver says what is shown, with the date');
});

test('closet badges: RETIRED for a piece that will never return, a pearl alone for a rare one (no word that reads as the RARE tier chip)', () => {
  const rare = { tier: 'rare', label: 'Rare find: few sharks have this' };
  assert.deepEqual(plain(life.closetBadge({ retired: true, forever: true, rarity: rare })), { label: 'RETIRED', pearl: 'white' });
  assert.deepEqual(plain(life.closetBadge({ retired: true, forever: true })), { label: 'RETIRED', pearl: null });
  assert.deepEqual(plain(life.closetBadge({ retired: true, forever: false, rarity: { tier: 'ultra_rare', label: 'u' } })), { label: null, pearl: 'gold' });
  assert.equal(life.closetBadge({ retired: true, forever: false }), null, 'resting for a while is not news in the closet');
  assert.equal(life.closetBadge(null), null);
  assert.match(life.closetBadgeSay({ retired: true, forever: true, rarity: rare }), /retired: it won't come back to the shop\. Rare find: few sharks have this/);
  const item = src('src/components/Item.tsx');
  assert.match(item, /const life = useMemo\(\(\) => closetBadge\(item\.lifecycle\), \[item\.lifecycle\]\);/);
  assert.match(item, /closetBadgeSay\(item\.lifecycle\)/, 'VoiceOver hears it too');
  assert.match(item, /life && styles\.artInset/, 'the art steps down so nothing touches the badge');
});

test('the try-on says when it leaves, whether it comes back, and the forever promise', () => {
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /const goingAway = visibleLeaving\(item\.shop, \{ secret: secretItem, vipLocked \}\);/);
  assert.match(sheet, /const rarity = visibleRarity\(item\.shop, owned\);/);
  assert.match(sheet, /item\.shop\?\.last_chance && !owned && !goingAway/, 'never "comes back next Fall" beside "won\'t come back"');
  assert.match(sheet, /item\.shop\?\.returning && !owned && !goingAway/, 'no mixed messages on a returning piece that is leaving');
  assert.match(sheet, /goingAway\?\.forever \? retiringWishHint\(wished\) : wishHintCopy/, 'no "we\'ll tell you next time" on a piece that won\'t return');
  for (const tier of ['white', 'silver', 'gold']) assert.ok(fs.existsSync(path.join(root, `assets/shop-life/pearl-${tier}.webp`)));
  const bytes = ['white', 'silver', 'gold'].reduce((n, t) => n + fs.statSync(path.join(root, `assets/shop-life/pearl-${t}.webp`)).size, 0);
  assert.ok(bytes < 16 * 1024, `pearls are ${bytes} bytes`);
});

test('no catalog screens ship: the premise lives in the existing shops', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/screens/Catalog')), 'no catalog UI');
  assert.doesNotMatch(src('src/Root.tsx'), /name="Catalog"|CollectionLog/);
});

test('rarity shows only on pieces you own or pieces retiring forever, never on a fresh piece for sale', () => {
  const rarity = { tier: 'very_rare', label: 'Super rare find: hardly any sharks have this' };
  assert.equal(life.visibleRarity({ rarity }, false), null, 'new and for sale: no scarcity line');
  assert.equal(life.visibleRarity({ rarity }, true).tier, 'very_rare');
  assert.equal(life.visibleRarity({ rarity, leaving: { on: '2026-11-30', forever: true } }, false).tier, 'very_rare');
  assert.equal(life.visibleRarity({ rarity, leaving: { on: '2026-11-30', forever: false } }, false), null);
  assert.equal(life.retiringWishHint(false), 'Heart it to save it for later.');
  assert.doesNotMatch(life.retiringWishHint(true), /next time/);
  assert.equal(life.visibleLeaving({ leaving: { on: '2026-11-30', forever: true } }, { secret: true, vipLocked: true }), null);
  assert.equal(life.visibleLeaving({ leaving: { on: '2026-11-30', forever: true } }, { secret: true, vipLocked: false }).forever, true);
});
