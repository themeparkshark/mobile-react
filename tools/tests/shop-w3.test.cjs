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

const P = (id, section, grants, extra = {}) => ({ product_id: `com.themeparkshark.app.${id}`, section, grants, available: true, title: id, badge: null, limit: null, deal_key: null, unavailable_reason: null, ...extra });
const CATALOG = [
  P('pack.starter', 'featured', { tickets: 15, coins: 1500, energy: 150, rescue_passes: 2 }, { limit: 'once', title: 'Starter Pack' }),
  P('deal.daily', 'featured', { tickets: 9 }, { limit: 'daily', deal_key: 'ticket_stack', title: 'Ticket Stack' }),
  P('pack.parkday', 'featured', { tickets: 20, coins: 500, energy: 200, rescue_passes: 2 }, { limit: 'daily', title: 'Park Day Pack' }),
  P('pack.parktrip', 'featured', { tickets: 60, coins: 1500, energy: 400, rescue_passes: 6 }, { title: 'Park Trip Pack' }),
  P('tickets.5', 'tickets', { tickets: 5 }), P('tickets.12', 'tickets', { tickets: 12 }), P('tickets.25', 'tickets', { tickets: 25 }, { badge: 'Best value' }),
  P('coins.500', 'coins', { coins: 500 }), P('coins.1200', 'coins', { coins: 1200 }), P('coins.3250', 'coins', { coins: 3250 }),
  P('rescue.3', 'rescue', { rescue_passes: 3 }),
];
const USD = { 'pack.starter': 1.99, 'deal.daily': 0.99, 'pack.parkday': 2.99, 'pack.parktrip': 5.99, 'tickets.5': 0.99, 'tickets.12': 1.99, 'tickets.25': 3.99,
  'coins.500': 0.99, 'coins.1200': 1.99, 'coins.3250': 4.99, 'rescue.3': 0.99 };
const PRICES = Object.fromEntries(Object.entries(USD).map(([k, v]) => [`com.themeparkshark.app.${k}`, { price: `$${v.toFixed(2)}`, amount: v }]));
const ids = list => list.map(p => p.product_id.replace('com.themeparkshark.app.', ''));
const planModule = () => loadTs('src/services/money/suppliesPlan.ts');
const plan = (over = {}) => plain(planModule().planSupplies({ products: CATALOG, prices: PRICES, focus: null, wallet: { tickets: 3 }, priced: () => true, ...over }));
const boughtStarter = () => CATALOG.map(x => (x.limit === 'once' ? { ...x, available: false } : x));

test('T155/T221: first look is the Starter Pack, one Ticket row and VIP; the rest waits under More', () => {
  const p = plan();
  assert.equal(p.handoff, null, 'no door focus: no hand-off card');
  assert.equal(p.hero.kind, 'starter');
  assert.deepEqual(ids([p.hero.product]), ['pack.starter']);
  assert.deepEqual(ids(p.ticketRow), ['deal.daily', 'tickets.5', 'tickets.12'], 'one row of at most 3');
  assert.deepEqual(ids(p.more.bundles), ['pack.parkday', 'pack.parktrip']);
  assert.deepEqual(p.more.packs.map(s => [s.key, ids(s.packs)]), [['tickets', ['tickets.25']], ['coins', ['coins.500', 'coins.1200', 'coins.3250']], ['rescue', ['rescue.3']]]);
  assert.ok(1 + p.ticketRow.length <= 4, 'a first look holds 4 price points, not 13');
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.doesNotMatch(shop, /scrollTo\(|onSection\(/, 'Supplies never opens scrolled to a section');
  const render = shop.slice(shop.indexOf('<ScrollView ref={scroll}'));
  assert.ok(render.indexOf('st.realMoney') < render.indexOf('<BundleCard product={plan.hero.product}'), 'the hero sits right under the real-money pill');
  assert.ok(render.indexOf('<VipCard') < render.indexOf('<MoreFold'), 'VIP before More');
  assert.ok(render.indexOf('<MoreFold') < render.indexOf('<SharkPassDoor'), 'the rest under More');
});

test('T154: the out-of-Tickets door opens on a hand-off card (smallest Ticket pack plus the free way), then the featured shelf', () => {
  const m = planModule();
  const p = plan({ focus: 'tickets', wallet: { tickets: 0 } });
  assert.equal(p.handoff.need, 'tickets');
  assert.equal(p.handoff.out, true);
  assert.deepEqual(ids([p.handoff.pack]), ['tickets.5']);
  assert.equal(m.handoffHead('tickets', true), 'Your shark is out of Tickets');
  assert.equal(m.handoffHead('tickets', false), 'Need more Tickets?');
  assert.equal(m.handoffFreeWay('tickets'), 'Or free: 3 treats at home = 1 Ticket');
  assert.equal(p.hero.kind, 'starter', 'Starter Pack first while unbought');
  assert.ok(!ids(p.ticketRow).includes('tickets.5'), 'the hand-off pack is not shown twice');
  const after = plan({ products: boughtStarter(), focus: 'tickets', wallet: { tickets: 0 } });
  assert.deepEqual(ids([after.hero.product]), ['pack.parkday'], 'after the Starter Pack, the out-of-Tickets door shows the Park Day Pack');
  const coins = plan({ focus: 'coins', wallet: { coins: 10 } });
  assert.equal(coins.handoff.need, 'coins');
  assert.deepEqual(ids([coins.handoff.pack]), ['coins.500']);
});

test('T168: after the Starter Pack, the Park Trip Pack is "Your next pack" (no timer, no discount)', () => {
  const p = plan({ products: boughtStarter() });
  assert.equal(p.hero.kind, 'next');
  assert.deepEqual(ids([p.hero.product]), ['pack.parktrip']);
  assert.ok(!ids(p.more.bundles).includes('pack.starter'), 'a bought Starter Pack is never a dead card');
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /band: `YOUR NEXT PACK · \$\{product\.title\.toUpperCase\(\)\}`/);
  const look = shop.slice(shop.indexOf('function heroLook'), shop.indexOf('function heroLook') + 600);
  assert.doesNotMatch(look, /OFF|SAVE|ENDS|LEFT|HURRY/);
});

test('T170: "Best Ticket deal today" only on days it is true, computed from prices', () => {
  const m = planModule();
  // The Park Trip Pack gives 60 Tickets for $5.99 (10 a dollar), so 9 for $0.99 is not the best that day.
  assert.equal(m.bestTicketDeal(CATALOG, PRICES), null, 'never claimed while a bigger pack gives more Tickets per dollar');
  const noTrip = CATALOG.filter(x => !x.product_id.endsWith('parktrip'));
  assert.equal(m.bestTicketDeal(noTrip, PRICES), 'com.themeparkshark.app.deal.daily', '9 for $0.99 beats every other Ticket rate');
  const coinDeal = CATALOG.map(x => (x.deal_key ? { ...x, grants: { coins: 1000 }, deal_key: 'coin_chest' } : x));
  assert.equal(m.bestTicketDeal(coinDeal, PRICES), null, 'a coin deal is never a Ticket deal');
  const weak = CATALOG.map(x => (x.deal_key ? { ...x, grants: { tickets: 4 } } : x));
  assert.equal(m.bestTicketDeal(weak, PRICES), null, '4 for $0.99 loses to 25 for $3.99');
  const mixed = CATALOG.map(x => (x.deal_key ? { ...x, grants: { tickets: 5, coins: 400 } } : x));
  assert.equal(m.bestTicketDeal(mixed, PRICES), null);
  assert.ok(!ids(plan({ products: mixed }).ticketRow).includes('deal.daily'), 'a mixed deal waits under More');
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /plan\.bestTicketDeal === p\.product_id \? 'BEST TICKET DEAL TODAY' : 'TODAY’S PICK'/);
});

test('T169: "Check again" re-runs the unfinished-purchase replay and says what happened', () => {
  const src = read('src/services/purchases.ts');
  assert.match(src, /export async function replayShopPurchases\(\)/);
  assert.match(src, /getAvailablePurchases\(\{ onlyIncludeActiveItems: true \}\)\)\s*\.filter\(p => isShopProduct\(p\.productId\) && !!jwsOf\(p\)\)/);
  assert.match(src, /await deliverShop\(store, purchase\)/, 'the same delivery path as launch');
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /replayShopPurchases\(\)/);
  assert.match(shop, /\{canBuy && <MissingPurchaseRow \/>\}/);
  assert.match(shop, /'Bought something that did not show up\? Check again'/);
});

test('T218: extra tries wear their own life-ring picture in every chip', () => {
  const ui = read('src/components/money/moneyUi.tsx');
  assert.match(ui, /if \(kind === 'rescue_passes'\) \{\s*return <Image source=\{ART\.rescue\}/);
  assert.doesNotMatch(ui.slice(ui.indexOf('export function Contents')), /<GameIcon name=\{CURRENCY_ICON\[k\]\}/, 'Contents uses CurrencyPicture');
  assert.match(read('src/screens/StoreScreen/SuppliesShop.tsx'), /<CurrencyPicture kind=\{w\.key\} size=\{22\} \/>/);
  // And one word: a pack's chips and its payoff say extra tries, never passes.
  const copy = loadTs('src/services/money/copy.ts');
  assert.equal(copy.unitWord('rescue_passes', 2), 'extra tries');
  assert.equal(copy.unitWord('rescue_passes', 1), 'extra try');
});

test('T163: the Starter Pack card shows the player\'s own shark in the Starter Frame', () => {
  const card = read('src/components/money/BundleCard.tsx');
  assert.match(card, /<MemberFlex inventory=\{player\?\.inventory as InventoryType \| undefined\} frame=\{product\.frame\.key\}/);
  assert.doesNotMatch(card, /width: 30, height: 30/, 'not a tiny ring');
});

test('T240: the single-packs sum is for the Starter Pack only', () => {
  assert.match(read('src/services/money/supplies.ts'), /if \(!catalog \|\| product\.limit !== 'once'\) return null;/);
});

test('T159: a late restock names the next drop day from the store interval, never a dateless soon', () => {
  const shelves = loadTs('src/helpers/shopShelves.ts');
  const now = Date.parse('2026-11-18T13:55:00-08:00'); // Wednesday afternoon
  const late = '2026-11-18T08:00:00Z'; // midnight PT, nearly 6 hours ago (the restock job never ran)
  assert.equal(shelves.restockPill(late, now).label, 'New gear soon', 'no interval known: unchanged');
  assert.equal(shelves.restockPill(late, now, 1).label, 'New gear tonight', 'daily shop: the next midnight');
  assert.equal(shelves.restockPill(late, now, 7).label, 'New gear in 7 days');
  const justDue = new Date(now - 20 * 60_000).toISOString();
  assert.equal(shelves.restockPill(justDue, now, 1).label, 'New gear soon', 'a restock a few minutes late is still soon');
  const shelf = read('src/screens/StoreScreen/GearShelf.tsx');
  assert.match(shelf, /restockPill\(nextAt, now, intervalDays\)/);
  assert.match(read('src/screens/StoreScreen.tsx'), /intervalDays=\{rotation\?\.interval_days \?\? 0\}/);
});

test('T140: the Gear stage shows the Shark Shop stall art, never the catalog promo coin pile', () => {
  const shelf = read('src/screens/StoreScreen/GearShelf.tsx');
  assert.match(shelf, /SHOP_STALL_ART = require\('\.\.\/\.\.\/\.\.\/assets\/images\/screens\/profile\/shark_shop\.png'\)/);
  assert.match(shelf, /<Image source=\{SHOP_STALL_ART\}/);
  assert.doesNotMatch(shelf, /imageUrl=\{promoUrl\}/);
  assert.doesNotMatch(read('src/screens/StoreScreen.tsx'), /promoUrl=\{catalog\?\.promotion_image_url\}/);
});

test('T157: wearing a new piece holds a real moment on the stage, then names the next gear in reach', () => {
  const shelves = loadTs('src/helpers/shopShelves.ts');
  const items = [
    { id: 1, name: 'Duck', cost: 100, has_purchased: true },
    { id: 2, name: 'Hook', cost: 370, has_purchased: false },
    { id: 3, name: 'Helmet', cost: 2400, has_purchased: false },
    { id: 4, name: 'Crown', cost: 50, has_purchased: false, is_member_item: true },
    { id: 5, name: 'Cup', cost: 65, has_purchased: false },
  ];
  assert.equal(shelves.nextGearGoal(items, 5), 'Next gear in reach: Hook, 370', 'never the piece just worn, never a member piece for a guest');
  assert.equal(shelves.nextGearGoal(items, 2, true), 'Next gear in reach: Crown, 50');
  assert.equal(shelves.nextGearGoal([{ id: 1, name: 'Duck', cost: 100, has_purchased: true }], 1), null);
  const sheet = read('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /export const WEAR_MOMENT_MS = 1100;/);
  assert.match(sheet, /new Promise\(r => setTimeout\(r, WEAR_MOMENT_MS\)\)/);
  const shelf = read('src/screens/StoreScreen/GearShelf.tsx');
  assert.match(shelf, /const goal = nextGearGoal\(itemsRef\.current, item\.id, memberRef\.current\);/);
  assert.match(shelf, /useShopToast\(3400\)/);
});

test('T164: the short try-on says the need once (the pill), the offer under it has no second need line', () => {
  const sheet = read('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /<CoinTopUpOffer need=\{short\} reason="gear" tone="onBlue" headline=\{false\}/);
  assert.match(read('src/components/money/CoinTopUpOffer.tsx'), /\{headline && \(<View style=\{st\.head\}>/);
});

test('T165: the buy math holds the balance from before the buy until the sheet closes', () => {
  const sheet = read('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /setMathFrom\(balance\);\s*setPhase\('buying'\);/);
  assert.match(sheet, /const mathBalance = mathFrom != null && \(phase === 'buying' \|\| phase === 'landing' \|\| phase === 'checking'\) \? mathFrom : balance;/);
  assert.match(sheet, /\$\{formatCoins\(mathBalance\)\} - \$\{formatCoins\(item\.cost\)\} =/);
  assert.doesNotMatch(sheet, /\$\{formatCoins\(balance\)\} - \$\{formatCoins\(item\.cost\)\} =/);
});

test('T166: the confirm step is its own state: the price on the button, a gold rim on the math, a hop', () => {
  const shelves = loadTs('src/helpers/shopShelves.ts');
  const base = { owned: false, worn: false, vipLocked: false, short: 0, phase: 'idle', wear: 'idle', finishes: false, cost: 140 };
  assert.equal(shelves.tryOnCta(base).label, 'Buy for 140');
  assert.equal(shelves.tryOnCta({ ...base, phase: 'confirm' }).label, 'Yes, buy for 140');
  assert.equal(shelves.tryOnCta({ ...base, phase: 'buying' }).label, 'Yes, buy for 140', 'no word swap while it buys');
  const sheet = read('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /phase === 'confirm' && styles\.equationConfirm/);
  assert.match(sheet, /if \(!still\) stageScale\.value = withSequence\(withTiming\(1\.09, \{ duration: DURATION\.tap \}\), withSpring\(1, SPRING\.pop\)\);\s*setPhase\('confirm'\);/);
});

const offersModule = () => loadTs('src/services/money/naturalOffers.ts', {
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => undefined } },
});

test('T220/T230: one calm offer decision for every placement (switch, loss, kid paths, once a day, remembered dismiss)', () => {
  const m = offersModule();
  const now = Date.parse('2026-11-18T12:00:00-08:00');
  const base = { placement: 'need_ticket', switchOn: true, today: '2026-11-18', now, record: null };
  assert.equal(m.offerDecision(base), 'show');
  assert.equal(m.offerDecision({ ...base, switchOn: false }), 'switch_off', 'only while natural_offers is served');
  assert.equal(m.offerDecision({ ...base, loss: true }), 'loss', 'never on a loss card');
  assert.equal(m.offerDecision({ ...base, familyWithKids: true }), 'kids', 'never with a Family with kids crew');
  assert.equal(m.offerDecision({ ...base, pictureGames: true }), 'picture', 'never while Picture games is on');
  assert.equal(m.offerDecision({ ...base, placement: 'win_vip', vip: true }), 'vip', 'VIP line only for non-members');
  const shown = plain(m.markShown(null, '2026-11-18', now));
  assert.equal(m.offerDecision({ ...base, record: shown }), 'today', 'at most once per placement per day');
  assert.equal(m.offerDecision({ ...base, today: '2026-11-19', now: now + 86_400_000, record: shown }), 'show', 'back the next day');
  assert.equal(m.offerDecision({ ...base, placement: 'first_win', today: '2026-12-01', record: shown }), 'once', 'the Starter Pack card once ever');
  const dismissed = plain(m.markDismissed(shown, now));
  assert.equal(m.offerDecision({ ...base, today: '2026-11-20', now: now + 2 * 86_400_000, record: dismissed }), 'dismissed', 'a Not now is remembered');
  assert.equal(m.offerDecision({ ...base, today: '2026-11-26', now: now + 8 * 86_400_000, record: dismissed }), 'show');
  assert.deepEqual(plain(m.parseRecords('{"need_ticket":{"day":"2026-11-18","restUntil":5},"bogus":1}')), { need_ticket: { day: '2026-11-18', firstShownAt: null, restUntil: 5 } });
  assert.deepEqual(plain(m.parseRecords('not json')), {});
  // No urgency, no price on any card.
  const words = JSON.stringify(plain(m.OFFER_COPY));
  assert.doesNotMatch(words, /hurry|limited|last chance|ends|only \d|don.t miss|sale|\$|left|now or never|before it/i);
  const card = read('src/components/money/CalmOffer.tsx');
  assert.doesNotMatch(card, /PriceBar|\.price\b|prices\[/, 'the card never shows a price; the gate does');
  assert.match(card, /await buyPack\(pack, \{ onStart: \(\) => setBusy\(true\), placement: `offer\.\$\{placement\}` \}\)/, 'the one gated buy path');
  assert.match(card, /if \(placement === 'win_vip'\) \{ beforeLeave\?\.\(\); void openMembership\(\); return; \}/, 'VIP opens through the one door (its Buy is gated)');
  assert.match(card, /flagOn\(retentionFlagsNow\(\), 'natural_offers'\)/, 'read the way daily_three is read');
  assert.match(card, /crew\?\.kind === 'family' && hasKids\(crew\)/);
  assert.match(card, /pictureOnlyFor\(/);
});

test('T220: the dev override for natural_offers can never run in a production bundle', () => {
  const card = read('src/components/money/CalmOffer.tsx');
  assert.match(card, /function devSwitch\(\): boolean \{\s*if \(!__DEV__\) return false;/);
  const cap = read('tools/capture/moneyCapture.ts');
  assert.match(cap, /return __DEV__ && process\.env\.EXPO_PUBLIC_CAPTURE_NATURAL_OFFERS === '1';/);
  // With __DEV__ false (a store bundle) the capture file says off whatever the env holds.
  const ts = require(path.join(root, 'node_modules/typescript'));
  const vm = require('node:vm');
  const src = ts.transpileModule(cap, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(`(function (module, exports, require) {${src}\n})`, { __DEV__: false, process: { env: { EXPO_PUBLIC_CAPTURE_NATURAL_OFFERS: '1' } } })(mod, mod.exports, () => ({}));
  assert.equal(mod.exports.captureNaturalOffers(), false);
});

test('T158: a Just once sticker for the Shark Shop doors while the Starter Pack is unbought (no price)', () => {
  const sticker = loadTs('src/components/money/StarterSticker.tsx', {
    react: { useContext: () => ({}) }, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    '../../context/AuthProvider': { AuthContext: {} }, '../../services/money/supplies': { useSupplies: () => ({}) },
    '../../services/purchases': { storeAvailable: () => true }, './moneyUi': { Sticker: 'Sticker' },
  });
  assert.equal(sticker.starterUnbought({ enabled: true, products: CATALOG }), true);
  assert.equal(sticker.starterUnbought({ enabled: true, products: boughtStarter() }), false);
  assert.equal(sticker.starterUnbought({ enabled: false, products: CATALOG }), false);
  assert.equal(sticker.STARTER_STICKER_TEXT, 'JUST ONCE');
  const src = read('src/components/money/StarterSticker.tsx');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /price/i, 'the sticker never names a price');
  // Not on the GEAR/SUPPLIES tab: on SE it covered the SUPPLIES word. The Home menu row and the Profile door mount it (needs_wire).
  assert.doesNotMatch(read('src/screens/StoreScreen.tsx'), /<StarterSticker/);
});

test('T220: two placements saving at once both keep their record (writes go one at a time)', async () => {
  const store = new Map();
  const slow = ms => new Promise(r => setTimeout(r, ms));
  const m = loadTs('src/services/money/naturalOffers.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async k => { await slow(5); return store.get(k) ?? null; },
      setItem: async (k, v) => { await slow(5); store.set(k, v); },
    } },
  });
  await Promise.all(m.OFFER_PLACEMENTS.map(p => m.saveOfferRecord(7, p, { day: '2026-11-18', firstShownAt: 1, restUntil: null })));
  const saved = plain(m.parseRecords(store.get(m.offerKey(7))));
  assert.deepEqual(Object.keys(saved).sort(), [...m.OFFER_PLACEMENTS].sort(), 'no placement lost its shown-today mark');
});
