/**
 * Money stream (Oct 8 2026): every number an offer shows is computed from the
 * catalog and Apple's prices, never invented; one gated buy path; the Shark
 * Pass words and sums; pitch-first VIP with the gate on the Buy.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const offers = loadTs('src/services/money/offers.ts');
const copy = loadTs('src/services/money/copy.ts');
const pass = loadTs('src/services/money/sharkPassModel.ts');

const P = (id, section, grants, extra = {}) => ({ product_id: `com.themeparkshark.app.${id}`, section, grants, available: true, title: id, badge: null, limit: null, deal_key: null, unavailable_reason: null, ...extra });
const CATALOG = [
  P('pack.starter', 'featured', { tickets: 15, coins: 1500, energy: 150, rescue_passes: 2 }, { limit: 'once' }),
  P('deal.daily', 'featured', { coins: 1000 }, { limit: 'daily', deal_key: 'coin_chest' }),
  P('pack.parkday', 'featured', { tickets: 20, coins: 500, energy: 200, rescue_passes: 2 }, { limit: 'daily' }),
  P('tickets.5', 'tickets', { tickets: 5 }), P('tickets.12', 'tickets', { tickets: 12 }), P('tickets.25', 'tickets', { tickets: 25 }),
  P('coins.500', 'coins', { coins: 500 }), P('coins.1200', 'coins', { coins: 1200 }), P('coins.3250', 'coins', { coins: 3250 }), P('coins.7000', 'coins', { coins: 7000 }),
  P('rescue.3', 'rescue', { rescue_passes: 3 }),
];
const USD = { 'pack.starter': 1.99, 'deal.daily': 0.99, 'pack.parkday': 2.99, 'tickets.5': 0.99, 'tickets.12': 1.99, 'tickets.25': 3.99,
  'coins.500': 0.99, 'coins.1200': 1.99, 'coins.3250': 4.99, 'coins.7000': 9.99, 'rescue.3': 0.99 };
const PRICES = Object.fromEntries(Object.entries(USD).map(([k, v]) => [`com.themeparkshark.app.${k}`, { price: `$${v.toFixed(2)}`, amount: v }]));
const byId = id => CATALOG.find(p => p.product_id === `com.themeparkshark.app.${id}`);

test('base rates come from the smallest single pack; bonuses are honest and rounded down', () => {
  const rates = plain(offers.baseRates(CATALOG, PRICES));
  assert.ok(Math.abs(rates.coins - 0.99 / 500) < 1e-9);
  assert.ok(Math.abs(rates.tickets - 0.99 / 5) < 1e-9);
  assert.equal(offers.bonusPercent(byId('coins.500'), PRICES, rates), null, 'the base pack claims nothing');
  assert.equal(offers.bonusPercent(byId('coins.1200'), PRICES, rates), 19);
  assert.equal(offers.bonusPercent(byId('coins.7000'), PRICES, rates), 38);
  assert.equal(offers.bonusPercent(byId('tickets.25'), PRICES, rates), 24);
  assert.equal(offers.bonusPercent(byId('pack.starter'), PRICES, rates), null, 'bundles show worth, not a bonus');
});

test('a bundle shows its worth at regular prices, energy never priced in, multiples never overclaimed', () => {
  const rates = offers.baseRates(CATALOG, PRICES);
  const starter = plain(offers.bundleWorth(byId('pack.starter'), PRICES, rates));
  assert.deepEqual(starter, { worth: '$6.60', times: 3, plusEnergy: true });
  assert.deepEqual(plain(offers.bundleWorth(byId('deal.daily'), PRICES, rates)), { worth: '$1.98', times: 2, plusEnergy: false });
  assert.equal(offers.bundleWorth(byId('coins.1200'), PRICES, rates), null, 'regular packs never get a worth line');
  assert.equal(offers.bundleWorth(byId('pack.starter'), {}, rates), null, 'no price, no claim');
  // Apple's format, our number: euros with a comma stay euros with a comma.
  assert.equal(offers.formatLike('1,99 €', 6.6), '6,60 €');
  assert.equal(offers.formatLike('$1,234.00', 9876.5), '$9,876.50');
});

test('the top-up picks the cheapest pack that covers the gap, bundles included', () => {
  const id = p => p && p.product_id.replace('com.themeparkshark.app.', '');
  assert.equal(id(offers.pickTopUp(120, 'coins', CATALOG, PRICES)), 'deal.daily', 'same $0.99 price: the one that gives more');
  const noDeal = CATALOG.filter(p => !p.deal_key);
  assert.equal(id(offers.pickTopUp(120, 'coins', noDeal, PRICES)), 'coins.500');
  assert.equal(id(offers.pickTopUp(830, 'coins', CATALOG, PRICES)), 'deal.daily', 'the $0.99 deal covers 830 coins');
  assert.equal(id(offers.pickTopUp(1100, 'coins', CATALOG, PRICES)), 'pack.starter', '$1.99 either way: the Starter Pack gives more');
  assert.equal(id(offers.pickTopUp(1100, 'coins', noDeal.filter(p => p.limit !== 'once'), PRICES)), 'coins.1200', 'a 5-box bundle (1,100) needs the 1,200 pack');
  assert.equal(id(offers.pickTopUp(1, 'tickets', CATALOG, PRICES)), 'tickets.5');
  assert.equal(id(offers.pickTopUp(40, 'energy', CATALOG, PRICES)), 'pack.starter', 'energy is only in bundles');
  assert.equal(id(offers.pickTopUp(99999, 'coins', CATALOG, PRICES)), 'coins.7000', 'nothing covers it: the biggest');
  const bought = CATALOG.map(p => (p.limit ? { ...p, available: false } : p));
  assert.equal(offers.pickTopUp(40, 'energy', bought, PRICES), null, 'nothing sells it today: no card');
  assert.equal(offers.pickTopUp(120, 'coins', CATALOG, {}), null, 'no prices yet: no card');
});

test('VIP numbers: per month for yearly, the win line uses the server multiplier only', () => {
  assert.equal(offers.perMonthText({ price: '$39.99', amount: 39.99, period: 'year' }), '$3.33 a month');
  assert.equal(offers.perMonthText({ price: '$4.99', amount: 4.99, period: 'month' }), null);
  assert.equal(offers.vipRideMultiplier([{ title: '2x XP and coins' }]), 2);
  assert.equal(offers.vipRideMultiplier([{ title: 'VIP badge on your profile' }]), null);
  assert.equal(offers.vipWinLine(30, 20, 2), 'VIP would make this 60 coins and 40 XP');
  assert.equal(offers.vipWinLine(30, 20, null), null, 'no multiplier from the server: the generic line');
});

test('top-up headlines say what is missing in plain words', () => {
  assert.equal(copy.topUpHeadline(120, 'coins', 'gear'), 'Need 120 more coins for this?');
  assert.equal(copy.topUpHeadline(830, 'coins', 'mystery-box'), 'Need 830 more coins for this box?');
  assert.equal(copy.topUpHeadline(1, 'tickets', 'ride'), 'Out of tickets?');
  assert.equal(copy.topUpHeadline(40, 'energy', 'level-up'), 'Need 40 more energy to level up?');
});

test('Shark Pass words: the real last day, reward names and the pass row summed from the server', () => {
  assert.equal(pass.lastDayText('2026-12-27'), 'Sunday, December 27');
  assert.equal(pass.rewardWords({ type: 'mystery_box', boxes: 1, ready: true }), '1 Mystery Pin Box');
  assert.equal(pass.rewardWords({ type: 'coins', amount: 1500, ready: true }), '1,500 coins');
  const tiers = [
    { paid: { type: 'item', name: 'Frosty Scarf' } }, { paid: { type: 'mystery_box', boxes: 2 } },
    { paid: { type: 'coins', amount: 100 } }, { paid: { type: 'coins', amount: 150 } }, { paid: { type: 'energy', amount: 60 } },
  ];
  assert.equal(pass.passSummary(tiers), '1 season item, 2 Mystery Pin Boxes, 250 coins and more');
  for (const event of ['ride_coin_win', 'daily3_complete', 'trail_box_open', 'pin_of_day', 'mystery_box_open']) assert.ok(pass.EVENT_COPY[event], event);
});

test('Shark Pass: what the pass row adds for reached steps, and its sums', () => {
  const t = (tier, unlocked, paid, paidClaimed = false) => ({ tier, unlocked, paid, paid_claimed: paidClaimed, free: null, free_claimed: false });
  const tiers = [
    t(1, true, { type: 'item', name: 'Frosty Scarf Pin' }), t(2, true, { type: 'coins', amount: 100 }),
    t(3, true, { type: 'tickets', amount: 2 }), t(4, false, { type: 'rescue_passes', amount: 1 }),
  ];
  assert.equal(pass.passTwinLine(tiers, false), 'With the Shark Pass you’d also have Frosty Scarf Pin, 100 coins and 1 more.');
  assert.equal(pass.passTwinLine(tiers, true), null, 'owners see nothing extra');
  assert.equal(pass.claimedLine([{ type: 'energy', amount: 25 }, { type: 'coins', amount: 50 }, { type: 'item', name: 'Frosty Scarf Pin' }]),
    'Frosty Scarf Pin, 50 coins and 25 energy', 'best first, all named');
  assert.deepEqual(plain(pass.passGrants(tiers)), { coins: 100, tickets: 2, rescue_passes: 1, pins: 1 });
});

test('real money: Supplies packs, the Shark Pass and VIP each buy only after a grown-up answers', () => {
  const strip = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const screen = strip(read('src/screens/SharkPassScreen.tsx'));
  assert.match(screen, /if \(!\(await askGrownUp\(\{ kind: 'money', price: cost\.price,[\s\S]{0,160}?\}\)\)\) return;[\s\S]{0,260}await buySharkPass\(/);
  assert.equal((screen.match(/buySharkPass\(/g) || []).length, 1);
  for (const file of ['src/components/money/CoinTopUpOffer.tsx', 'src/components/money/StarterOfferCard.tsx', 'src/screens/StoreScreen/SuppliesShop.tsx']) {
    const code = strip(read(file));
    assert.match(code, /await buyPack\(/, file);
    assert.doesNotMatch(code, /buyShopProduct\(/, `${file} never reaches StoreKit directly`);
  }
  // A Shark Pass is never mistaken for a Supplies pack (it would be redeemed at the wrong door and never finished).
  const purchases = read('src/services/purchases.ts');
  assert.match(purchases, /&& !isSharkPassProduct\(productId\) && !isVipGiftProduct\(productId\);/);
  assert.match(screen, /It doesn’t renew/);
});

test('no countdown on a real-money offer, no pressure words in the money kit', () => {
  for (const file of ['src/screens/StoreScreen/SuppliesShop.tsx', 'src/components/money/CoinTopUpOffer.tsx', 'src/components/money/StarterOfferCard.tsx',
    'src/screens/SharkPassScreen.tsx', 'src/screens/MembershipScreen.tsx', 'src/components/money/SharkPassBanner.tsx']) {
    const code = read(file);
    assert.doesNotMatch(code, /untilText\(|hurry|last chance|only \d+ left|limited time|don.t miss/i, file);
    assert.doesNotMatch(code, /—/, `${file}: no em dashes`);
  }
});

test('coin packs say what they buy from the server median gear price, never invented', () => {
  assert.equal(offers.gearLine({ gear: 4, gear_price: 120 }), 'Buys about 4 pieces of gear');
  assert.equal(offers.gearLine({ gear: 1, gear_price: 400 }), 'Buys about 1 piece of gear');
  assert.equal(offers.gearLine(null), null);
  assert.equal(offers.gearLine(undefined), null);
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /main === 'coins' \? gearLine\(product\.buys\)/);
});
