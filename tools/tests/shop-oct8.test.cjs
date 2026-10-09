'use strict';
// Dustin's Oct 8 shop notes: Gear items higher with a small restock chip, and the Secret Shop as one showroom.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const shelves = loadTs('src/helpers/shopShelves.ts');
const room = loadTs('src/helpers/shopShowroom.ts');

test('restock chip names a day, never hours or seconds', () => {
  const now = Date.parse('2026-10-08T19:00:00-07:00'); // a Thursday evening
  assert.equal(shelves.restockPill(null, now), null);
  assert.equal(shelves.restockPill('nonsense', now), null);
  // Midnight Pacific on Monday Oct 12 (07:00Z): the weekday is read in park time.
  assert.equal(shelves.restockPill('2026-10-12T07:00:00Z', now).label, 'New gear on Monday');
  assert.equal(shelves.restockPill('2026-10-09T07:00:00Z', now).label, 'New gear tonight');
  assert.equal(shelves.restockPill('2026-10-10T07:00:00Z', now).label, 'New gear tomorrow');
  assert.equal(shelves.restockPill('2026-10-20T07:00:00Z', now).label, 'New gear in 12 days');
  assert.equal(shelves.restockPill('2026-10-08T01:00:00Z', now).label, 'New gear soon');
  for (const iso of ['2026-10-12T07:00:00Z', '2026-10-09T07:00:00Z', '2026-10-08T01:00:00Z']) {
    const p = shelves.restockPill(iso, now);
    assert.equal(p.urgent, false);
    assert.doesNotMatch(p.label, /\d+:\d+|sec|hrs?\b|hurry|last/i);
  }
});

test('the classic shelf sinks owned pieces, but a piece bought this visit stays put', () => {
  const items = [{ id: 1, has_purchased: true }, { id: 2 }, { id: 3, has_purchased: true }, { id: 4 }];
  assert.deepEqual(plain(shelves.shelfOrder(items).map(i => i.id)), [2, 4, 1, 3]);
  assert.deepEqual(plain(shelves.shelfOrder(items, [1]).map(i => i.id)), [1, 2, 4, 3]);
});

test('Gear on the live classic catalog: one scroll, the shelf over the shopkeeper, no big countdown', () => {
  const gear = src('src/screens/StoreScreen/GearShelf.tsx');
  assert.match(gear, /export const GEAR_STAGE_H = 128;/, 'the stage was 180 under a 90 pt countdown and a balance row');
  assert.match(gear, /marginTop: -COUNTER_TUCK/);
  assert.match(gear, /<TryOnSheet item=\{open\}/, 'a tile opens the try-on on your own shark');
  assert.doesNotMatch(gear, /StoreCountdown/);
  const store = src('src/screens/StoreScreen.tsx');
  assert.match(store, /const classicGear = !today && sharkShop && tab === 'gear' && !\(currentStore && isEventShop\(currentStore\)\);/);
  assert.match(store, /coins=\{v2 \|\| classicGear \? Number\(player\?\.coins \?\? 0\) : null\}/);
  // The Halloween event shop and park stores keep their own countdown and grid.
  assert.match(store, /<StoreCountdown nextRotationAt=\{currentStore\.event\.ends_at\}/);
});

const section = s => ({ key: 'x', type: 'daily', event_key: null, title: '', subtitle: null, color: null, ends_at: '2026-10-09T07:00:00Z',
  event_ends_at: null, time_left_label: null, last_chance: false, hero_id: null, set_slugs: [], items: [], ...s });
const item = id => ({ id, name: `#${id}`, cost: 140 });

test('the showroom lists every piece once: the Vault star first, then the Vault, the season drops, Tonight\'s Pick', () => {
  const sections = [
    section({ key: 'event:halloween', type: 'event', event_key: 'halloween', title: 'Halloween Nights', items: [item(6)] }),
    section({ key: 'featured', type: 'featured', hero_id: 3, items: [item(2), item(3), item(4)] }),
    section({ key: 'daily', type: 'daily', items: [item(5), item(2)] }),
  ];
  const entries = room.showroomEntries(sections, 3);
  assert.deepEqual(plain(entries.map(e => [e.item.id, e.kind])), [[3, 'vault'], [2, 'vault'], [4, 'vault'], [6, 'season'], [5, 'tonight']]);
  assert.deepEqual(plain(room.showroomEntries([], null)), []);
});

test('each shelf says when it changes in a few calm words', () => {
  const now = Date.parse('2026-10-08T19:00:00-07:00');
  assert.equal(room.shelfWhen({ kind: 'vault', section: section({ type: 'featured', ends_at: '2026-10-12T00:00:00-07:00' }) }, now), 'New on Monday');
  assert.equal(room.shelfWhen({ kind: 'vault', section: section({ type: 'featured', ends_at: '2026-10-09T00:00:00-07:00' }) }, now), 'New tomorrow');
  assert.equal(room.shelfWhen({ kind: 'tonight', section: section({}) }, now), 'New tonight');
  assert.equal(room.shelfWhen({ kind: 'season', section: section({ type: 'event', event_ends_at: '2026-11-02T00:00:00-07:00', event_last_day: '2026-11-01' }) }, now), 'Ends Nov 1');
});

test('the whole room fits one iPhone screen, the stage never shrinks below 220', () => {
  const member = room.showroomStageH(402, 874, 62, 34, false);
  const guest = room.showroomStageH(402, 874, 62, 34, true);
  assert.ok(member >= 280 && member <= 330, `member stage ${member}`);
  assert.ok(guest < member && guest >= 220, `guest stage ${guest}`);
  assert.equal(room.showroomStageH(375, 667, 20, 0, true), 220);
});

test('the showroom keeps the member rules in the try-on and the grown-up gate for guests', () => {
  const code = src('src/screens/StoreScreen/SecretShowroom.tsx');
  // Get it / Wear it open the try-on (buy confirm, MEMBER_WEAR_LOCK, members_only refusal all live there).
  assert.match(code, /member \? <ShopCta label="Get it" width=\{170\} still=\{still\} onPress=\{\(\) => onOpen\(item, \{ confirm: true \}\)\} \/>/);
  assert.match(code, /<ShopCta label="Wear it" icon="check" width=\{170\} still=\{still\} onPress=\{\(\) => onOpen\(item, \{ bought: true \}\)\} \/>/);
  assert.match(code, /void openMembership\(\);/);
  assert.doesNotMatch(code, /buyShopProduct|purchase\(/, 'the showroom never buys on its own');
});

test('the shelf star is the rarest piece you can still get, and every slot has a kid line', () => {
  const items = [{ id: 1, rarity: 1 }, { id: 2, rarity: 4, has_purchased: true }, { id: 3, rarity: 3 }, { id: 4, rarity: 3 }, { id: 5, rarity: 4, is_member_item: true }];
  assert.equal(shelves.starPick(items, false).id, 3, 'owned and members-only pieces are skipped; first wins a tie');
  assert.equal(shelves.starPick(items, true).id, 5);
  assert.equal(shelves.starPick([{ id: 1, has_purchased: true }], false), null);
  for (let t = 1; t <= 8; t++) assert.match(shelves.slotLine(t), /^[A-Z].*\.$/);
  assert.equal(shelves.slotLine(99), null);
});

test('round 2: the try-on lands in one beat and opens on confirm only when asked', () => {
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /later\(land, 390\);/);
  assert.match(sheet, /setPhase\(startConfirm && !startBought \? 'confirm' : 'idle'\)/);
  assert.match(sheet, /accessibilityLabel=\{`\$\{formatCoins\(balanceAfter \?\? balance\)\} coins`\}/);
  const room = src('src/screens/StoreScreen/SecretShowroom.tsx');
  assert.match(room, /const resting = still \|\| paused \|\| covered \|\| !focused;/, 'the room rests under any sheet, dialog or the gate');
  assert.match(room, /<TileArt item=\{item\} size=\{TILE \+ 6\} still=\{still\} \/>/, 'every piece in the picker moves');
});

test('round 3: filter chips (All, each slot on the shelf, Can buy) and one word per slot', () => {
  const items = [
    { id: 1, item_type: { id: 7 }, cost: 50 }, { id: 2, item_type: { id: 7 }, cost: 50, has_purchased: true },
    { id: 3, item_type: { id: 6 }, cost: 80 }, { id: 4, item_type: { id: 5 }, cost: 280 },
  ];
  const f = shelves.shelfFilters(items, 100);
  assert.deepEqual(plain(f.map(x => [x.label, x.count])), [['All', 4], ['Can buy', 2], ['Held', 1], ['Backdrops', 1], ['Skins', 2]]);
  assert.equal(items.filter(i => shelves.passesFilter(i, 'can_buy', 100)).length, 2);
  assert.equal(items.filter(i => shelves.passesFilter(i, 'slot:7', 100)).length, 2);
  assert.deepEqual(plain(shelves.shelfFilters([{ id: 1, item_type: { id: 1 }, cost: 1 }], 10)), [], 'one slot, all affordable: no chips');
  assert.equal(shelves.slotWord(7), 'Skin');
  assert.equal(shelves.slotWord(null), null);
});

test('money stream hand-off: out of coins shows the need and the top-up offer, never jumps to the map; VIP doors say See VIP', () => {
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /case 'earn': break;/);
  assert.match(sheet, /<CoinTopUpOffer need=\{short\} reason="gear" tone="onBlue"/);
  assert.match(sheet, /return `VIP is \$\{priceText\(plan\)\}\.`;/, 'the VIP price only from the loaded App Store plans');
  assert.match(sheet, /accessibilityLabel="See VIP">\s*<GameIcon name="member"/);
  assert.equal(shelves.tryOnCta({ owned: false, worn: false, vipLocked: true, secret: true, short: 0, phase: 'idle', wear: 'idle', finishes: false, cost: 140, paused: false, wearLocked: false }).label, 'See VIP');
});
