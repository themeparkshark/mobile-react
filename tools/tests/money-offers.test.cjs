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
  assert.equal(offers.gearLine({ gear: 21, gear_price: 330 }, 38), 'Buys about 21 pieces of gear (38% more)');
  assert.equal(pass.winsAwayText(1220, [{ event: 'ride_coin_win', points: 120 }]), 'about 11 ride coin wins away');
  assert.equal(pass.setMixText([{ row: 'free' }, { row: 'pass' }, { row: 'pass' }, { row: 'plus' }]), '1 free, 2 on the Shark Pass, 1 with Plus');
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /main === 'coins' \? \[gearLine\(product\.buys, bonus\)/);
});

test('the season set counts every wearable, owned = claimed, and says where each one comes from', () => {
  const it = (art, slot = 'pin') => ({ type: 'item', name: art, art, slot, icon_url: null, ready: true });
  const coins = { type: 'coins', amount: 40, ready: true };
  const tiers = [
    { tier: 1, unlocked: true, free: coins, paid: it('scarf'), free_claimed: true, paid_claimed: true },
    { tier: 10, unlocked: true, free: it('mittens'), paid: it('beanie'), free_claimed: true, paid_claimed: false },
    { tier: 50, unlocked: false, free: it('finisher'), paid: it('lights', 'background'), free_claimed: false, paid_claimed: false },
  ];
  const set = pass.seasonSet(tiers, [it('crown')], false);
  assert.equal(set.pieces.length, 6);
  assert.equal(set.owned, 2);
  assert.deepEqual(plain(set.pieces.map(p => p.reward.art)), ['mittens', 'finisher', 'scarf', 'beanie', 'lights', 'crown'], 'free row first');
  assert.equal(pass.pieceSource(set.pieces[0]), 'Free at step 10');
  assert.equal(pass.pieceSource(set.pieces[3]), 'Shark Pass, step 10');
  assert.equal(pass.pieceSource(set.pieces[5]), 'Shark Pass Plus');
  assert.equal(pass.seasonSet(tiers, [it('crown')], true).owned, 3, 'Plus extras are owned with Plus');
  assert.match(read('src/screens/SharkPassScreen.tsx'), /YOUR SEASON SET/);
});

test('after a win the pass banner says what was gained, and a step crossed', () => {
  const st = (points, tier) => ({ enabled: true, season: { key: 's1', points_per_tier: 400 }, progress: { points, tier } });
  assert.equal(pass.passGain(null, st(500, 1)), null, 'first look: nothing to compare');
  assert.deepEqual(plain(pass.passGain({ season: 's1', points: 380, tier: 0 }, st(500, 1))), { gained: 120, stepUp: 1 });
  assert.deepEqual(plain(pass.passGain({ season: 's1', points: 420, tier: 1 }, st(540, 1))), { gained: 120, stepUp: null });
  assert.equal(pass.passGain({ season: 's0', points: 1, tier: 0 }, st(540, 1)), null, 'another season');
});

test('the once-ever Starter Pack: seen per player on the server, shown only with a price, one offer per sheet', () => {
  const card = read('src/components/money/StarterOfferCard.tsx');
  assert.match(card, /const visible = !!\(show && serverSeen === false && starter && price\);/, 'needs the server says unseen and a real price');
  assert.match(card, /trackMoney\('starter_seen', 'postwin\.starter', starter\.product_id\)/, 'seen is recorded on the server');
  assert.match(card, /serverSeen === true \? false/, 'seen on another phone: the sheet gets its VIP line back');
  const sheet = read('src/components/PostWinRewardsModal.tsx');
  assert.match(sheet, /\(starterShown === false \|\| coinsEarned <= 0\)/, 'no VIP line while the Starter Pack is still deciding (null)');
});

test('free trial: the end date comes from StoreKit, and one calm reminder goes to the grown-up a day before', () => {
  const rem = loadTs('src/services/money/trialReminder.ts', { '@react-native-async-storage/async-storage': { default: {} } });
  const end = new Date('2026-11-12T10:00:00Z');
  assert.equal(rem.trialReminderAt(end, new Date('2026-11-05T10:00:00Z')).toISOString(), '2026-11-11T10:00:00.000Z');
  assert.equal(rem.trialReminderAt(end, new Date('2026-11-11T12:00:00Z')), null, 'too late: no reminder');
  const t = rem.trialReminderText('$39.99 a year');
  assert.match(t.title, /^For grown-ups/);
  assert.match(t.body, /\$39\.99 a year unless it is turned off\. To cancel: Settings, your name, Subscriptions\./);
  const src = read('src/services/money/trialReminder.ts');
  assert.doesNotMatch(src, /requestPermissionsAsync/, 'never asks for permission');
  assert.match(read('src/services/purchases.ts'), /trialLength: freeTrial/);
});

test('VIP recap says only the player\'s own totals, and nothing when there is nothing', () => {
  const src = read('src/screens/MembershipScreen.tsx');
  assert.match(src, /THIS MONTH VIP GOT YOU/);
  assert.match(src, /Your closet is kept\. Every VIP piece you have stays yours\./);
  assert.doesNotMatch(src, /members (earn|average) about|on average/i, 'no invented averages');
});

test('the Park Day Pack shows once per park day, only in a park, only when for sale and priced', () => {
  const po = loadTs('src/services/money/parkOffer.ts');
  const base = { inPark: true, shopDay: '2026-11-07', seen: null, packAvailable: true, priced: true };
  assert.equal(po.shouldShowParkOffer(base), true);
  assert.equal(po.shouldShowParkOffer({ ...base, inPark: false }), false, 'never at home');
  assert.equal(po.shouldShowParkOffer({ ...base, seen: { day: '2026-11-07' } }), false, 'once a day');
  assert.equal(po.shouldShowParkOffer({ ...base, seen: { day: '2026-11-06' } }), true, 'a new park day');
  assert.equal(po.shouldShowParkOffer({ ...base, packAvailable: false }), false, 'bought today');
  assert.equal(po.shouldShowParkOffer({ ...base, priced: false }), false, 'no price, no card');
  assert.match(read('src/components/money/ParkDayOffer.tsx'), /buyPack\(pack, \{ onStart: \(\) => setBusy\(true\), placement: 'park\.arrival' \}\)/, 'gated buy path');
});

test('the pass worth line is computed from the server row and Supplies prices, rounded down', () => {
  // The same math SharkPassScreen uses: regularValue of the row's coins, tickets and Rescue Passes.
  const rates = offers.baseRates(CATALOG, PRICES);
  const v = offers.regularValue({ coins: 2550, tickets: 25, rescue_passes: 6 }, rates);
  assert.ok(v > 0);
  assert.equal(offers.formatLike('$4.99', Math.floor(v * 100) / 100), `$${(Math.floor(v * 100) / 100).toFixed(2)}`);
  assert.match(read('src/screens/SharkPassScreen.tsx'), /regularValue\(\{ coins: g\.coins, tickets: g\.tickets, rescue_passes: g\.rescue_passes \}, baseRates\(supplies\.catalog\.products, supplies\.prices\)\)/);
  assert.match(read('src/screens/SharkPassScreen.tsx'), /if \(!value \|\| value < price\.amount \* 1\.5\) return null;/, 'shown only when clearly worth more');
});

test('the new-gear days come from the store rotation, read-only', () => {
  assert.deepEqual(plain(offers.dropDays('2026-10-13T07:00:00Z', 7, 2, 'America/Los_Angeles', new Date('2026-10-09T12:00:00Z'))), ['Tuesday, October 13', 'Tuesday, October 20']);
  assert.deepEqual(plain(offers.dropDays('2026-10-03T07:00:00Z', 1, 2, 'America/Los_Angeles', new Date('2026-10-09T20:00:00Z'))), ['Saturday, October 10', 'Sunday, October 11'], 'never a day already gone');
  assert.deepEqual(plain(offers.dropDays(null, 7)), []);
  assert.deepEqual(plain(offers.dropDays('2026-10-13T07:00:00Z', 0)), []);
});

test('the grown-up page: this account\'s spend this month and the kid\'s wishlist (nothing sent)', () => {
  const wl = loadTs('src/services/money/wishlist.ts', { '@react-native-async-storage/async-storage': { default: {} }, react: { useEffect() {}, useState: v => [v, () => {}] } });
  const a = wl.toggled([], { id: 'x', name: 'Starter Pack' });
  assert.equal(a.length, 1);
  assert.equal(wl.toggled(a, { id: 'x', name: 'Starter Pack' }).length, 0, 'tap again to remove');
  assert.doesNotMatch(read('src/services/money/wishlist.ts'), /client\.|fetch\(/, 'never sent anywhere');
  assert.match(read('src/components/money/GrownUpsInfo.tsx'), /none of these bought yet/);
  assert.match(read('src/components/money/GrownUpsInfo.tsx'), /US list prices before tax, refunds left out/);
  // The wishlist never imports anything that can send: no API client, no notifications, no links.
  assert.doesNotMatch(read('src/services/money/wishlist.ts'), /import .*(api\/|client|notifications|Linking|share|external)/);
  assert.doesNotMatch(read('src/components/money/WishHeart.tsx'), /import .*(api\/|client|notifications|Linking|share|external)/);
});

test('the season ring is earned on the free track (10/25/40/50), never bought', () => {
  const src = read('src/components/money/MemberFlex.tsx');
  assert.match(src, /if \(s >= 50\) return \{ color: '#7cf5d0', label: 'Season finisher' \}/);
  assert.match(src, /if \(s >= 10\) return \{ color: '#d08a4a', label: 'Bronze climber' \}/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /premium|\.plus\b|price/i, 'the ring never looks at money');
});

test('mystery boxes: coin packs say how many boxes they open, and a box top-up ends with "Open your box"', () => {
  assert.equal(offers.boxesLine(1200, 250), '= 4 boxes');
  assert.equal(offers.boxesLine(250, 250), '= 1 box');
  assert.equal(offers.boxesLine(100, 250), null);
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /boxesLive \? boxesLine\(n, MYSTERY_BOX_COINS\) : null/, 'only while boxes are live');
  const top = read('src/components/money/CoinTopUpOffer.tsx');
  assert.match(top, /return reason === 'mystery-box' && retries \? 'Open your box' : undefined;/);
  assert.match(top, /doneLabel=\{topUpDoneLabel\(reason, !!onDone\)\} onDone=\{\(\) => \{ setLanded\(null\); onDone\?\.\(\); \}\}/, 'the button retries the open');
});
