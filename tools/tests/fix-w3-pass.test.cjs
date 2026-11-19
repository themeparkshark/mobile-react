/**
 * Fix round w3, lane pass (Nov 18 2026): the Shark Pass and VIP pages.
 * T091 not for sale yet, T105 calm page, T116 Plus in plain words, T117 the next prize counted from today.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const strip = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const pass = loadTs('src/services/money/sharkPassModel.ts');

const TODAY = [
  { event: 'ride_coin_win', points: 150, count_today: 0, points_today: 0, cap: 10 },
  { event: 'home_find', points: 43, count_today: 0, points_today: 0, cap: 20 },
  { event: 'coin_level_up', points: 75, count_today: 0, points_today: 0, cap: 5 },
  { event: 'daily3_complete', points: 250, count_today: 0, points_today: 0, cap: 1 },
  { event: 'first_win', points: 62, count_today: 0, points_today: 0, cap: 1 },
];

test('T091: the pass row is owned, for sale, not for sale yet, or over', () => {
  assert.equal(pass.passSale({ on_sale: true }, false), 'on_sale');
  assert.equal(pass.passSale({ on_sale: false }, false), 'soon', 'on_sale false while running: not a locked row');
  assert.equal(pass.passSale({ on_sale: false }, true), 'owned', 'an owner keeps the row');
  assert.equal(pass.passSale({ ended: true, on_sale: false }, false), 'ended');
  assert.equal(pass.passSale({}, false), 'on_sale', 'an older server without on_sale still sells');
  assert.equal(pass.passSale(null, false), 'ended');
});

test('T091: "opens soon" says why and, when the server knows it, the day', () => {
  const plainSoon = plain(pass.passSoonLines({}));
  assert.equal(plainSoon.title, 'THE SHARK PASS OPENS SOON');
  assert.match(plainSoon.body, /almost ready/);
  assert.match(plainSoon.body, /every step you reach now counts/);
  const dated = plain(pass.passSoonLines({ sale_opens_on: '2026-11-20' }));
  assert.equal(dated.title, 'THE SHARK PASS OPENS FRIDAY, NOVEMBER 20');
  assert.doesNotMatch(dated.body, /almost ready/);
  for (const line of [plainSoon.title, plainSoon.body, dated.title, dated.body]) {
    assert.doesNotMatch(line, /\$|buy|price|renew|Restore/i, 'no price or buy words while it cannot be bought');
  }
});

test('T091: with the pass not on sale the page shows no locked row, no price, no Restore and no "one buy" box', () => {
  const screen = strip(read('src/screens/SharkPassScreen.tsx'));
  assert.match(screen, /const sale = passSale\(season, premium\);/);
  assert.match(screen, /const paidShown = sale === 'owned' \|\| sale === 'on_sale';/);
  // The paid cell renders only while the row can be had.
  assert.match(screen, /\{paidShown && \(\s*<Cell reward=\{tier\.paid\}/);
  // The buy card, the grown-up "one buy" box and the price load are for sale only.
  assert.match(screen, /\{sale === 'on_sale' && \(\s*<Animated\.View[^>]*style=\{s\.buyLip\}>[\s\S]{0,200}UNLOCK THE SHARK PASS ROW/);
  assert.match(screen, /\{sale === 'on_sale' && \(\s*<View style=\{s\.grownUps\}/);
  assert.match(screen, /if \(!season \|\| sale !== 'on_sale' \|\| !storeAvailable\(\)\) return;/);
  assert.match(screen, /\{sale === 'soon' && \([\s\S]{0,400}soonLines\.title/);
  // The old "not for sale: only Restore" row is gone.
  assert.doesNotMatch(screen, /season\.on_sale === false/);
  const restores = screen.match(/void restore\(\)/g) || [];
  assert.equal(restores.length, 1, 'Restore lives only in the buy card');
});

test('T105: the first read is the climb, one next prize, one claim, the track and one buy; the rest folds under More', () => {
  const screen = strip(read('src/screens/SharkPassScreen.tsx'));
  const more = screen.indexOf('{moreOpen && <>');
  assert.ok(more > 0);
  const after = screen.slice(more);
  const before = screen.slice(0, more);
  for (const inside of ['PASS QUESTS', 'YOUR SEASON SET', 'HOW TO CLIMB', 'FOR GROWN-UPS', 'Catch-up boost on', 'style={s.topChip}']) {
    assert.ok(after.includes(inside), `${inside} sits behind More`);
    assert.ok(!before.slice(before.indexOf('<ScrollView')).includes(inside), `${inside} is not in the first read`);
  }
  // The counts sit under the track.
  const track = screen.indexOf('<FlatList ref={list}');
  const count = screen.indexOf('{countLine &&');
  assert.ok(track > 0 && count > track && count < more, 'count line under the track');
  // One clear buy: Plus is a quiet row, not a second big button.
  assert.match(screen, /plus: \{ alignSelf: 'stretch', flexDirection: 'row'/);
  // No lock on every Shark Pass cell: one on the row's name.
  assert.match(screen, /quietLock=\{!premium\}/);
  assert.match(screen, /\{!claimed && locked && !quietLock && <View style=\{s\.badge\}>/);
});

test('T105: the count line names each row once', () => {
  const it = (art) => ({ type: 'item', name: art, art, slot: 'pin', icon_url: null, ready: true });
  const coins = { type: 'coins', amount: 40, ready: true };
  const tiers = [
    { tier: 1, unlocked: true, free: coins, paid: it('scarf'), free_claimed: false, paid_claimed: false },
    { tier: 10, unlocked: false, free: it('mittens'), paid: it('beanie'), free_claimed: false, paid_claimed: false },
  ];
  assert.equal(pass.trackCountLine(tiers, true), '1 thing to wear on the free row, 2 on the Shark Pass row.');
  assert.equal(pass.trackCountLine(tiers, false), '1 thing to wear on the free row.');
  assert.equal(pass.trackCountLine([], true), null);
});

test('T116: Plus is said in plain words wherever it shows', () => {
  const extras = [{ type: 'coins', amount: 1500, ready: true }, { type: 'item', name: 'Aurora Sparkle Pin', art: 'aurora-crown', slot: 'pin', icon_url: null, ready: true }];
  assert.equal(pass.plusWords(extras), 'Shark Pass Plus is the Shark Pass row plus Aurora Sparkle Pin and 1500 Shark Coins right away.');
  assert.equal(pass.plusWords(extras, false), 'The Shark Pass row plus Aurora Sparkle Pin and 1500 Shark Coins right away.');
  assert.equal(pass.plusWords([]), null);
  assert.equal(pass.setMixText([{ row: 'free' }, { row: 'plus' }]), '1 free, 0 on the Shark Pass, 1 with Shark Pass Plus');
  const screen = strip(read('src/screens/SharkPassScreen.tsx'));
  // Plus pieces join the set only while Plus can be had or is owned, and then the set says what Plus is.
  assert.match(screen, /const plusShown = !!progress\?\.plus \|\| \(sale === 'on_sale' && !!plusPrice && !!plusLine\);/);
  assert.match(screen, /seasonSet\(tiers, plusShown \? season\.plus_rewards \?\? \[\] : \[\], !!progress\.plus\)/);
  assert.match(screen, /set\.pieces\.some\(p => p\.row === 'plus'\) && plusLine &&/);
});

test('T117: the next prize line counts what can still be done today, home first', () => {
  const at = (o) => pass.nextPrizeTodayText({ stepsAway: 10, pointsAway: 4000, perStep: 400, daily3Ready: true, today: TODAY, ...o });
  assert.equal(at(), '10 steps to go. Treats at home and your Daily 3 can climb up to 2 of them today.');
  assert.equal(at({ daily3Ready: false }), '10 steps to go. Treats at home can climb up to 2 of them today.');
  assert.equal(at({ stepsAway: 2, pointsAway: 700 }), '2 steps to go. Treats at home and your Daily 3 can get you there today!');
  assert.equal(at({ stepsAway: 1, pointsAway: 300, daily3Ready: false, today: [{ event: 'home_find', points: 43, count_today: 19, cap: 20 }] }),
    '1 step to go. Every treat at home climbs a little.');
  const doneHome = TODAY.map(e => (e.event === 'home_find' || e.event === 'daily3_complete' ? { ...e, count_today: e.cap } : e));
  assert.equal(at({ today: doneHome }), '10 steps to go. Home treats are done for today. Ride coin wins at a park still climb.');
  assert.equal(at({ stepsAway: 0 }), null);
  for (const line of [at(), at({ daily3Ready: false })]) assert.doesNotMatch(line, /ride coin wins away/, 'never a long count of park wins');
  const screen = strip(read('src/screens/SharkPassScreen.tsx'));
  assert.match(screen, /nextPrizeTodayText\(\{ stepsAway: nextStep - step, pointsAway: nextPrize\.pointsAway, perStep, daily3Ready, today: progress\.today \}\)/);
  assert.doesNotMatch(screen, /winsAwayText\(/);
});

test('T091 lane fixture: inert unless the lane mute and the fixture are both set', () => {
  const st = { enabled: true, season: { key: 's1', on_sale: true } };
  assert.equal(pass.lanePassFixture(st, { mute: undefined, fixture: 'not-on-sale' }), st, 'store and OTA bundles: untouched');
  assert.equal(pass.lanePassFixture(st, { mute: '1', fixture: undefined }), st);
  assert.equal(plain(pass.lanePassFixture(st, { mute: '1', fixture: 'not-on-sale' })).season.on_sale, false);
  assert.match(plain(pass.lanePassFixture(st, { mute: '1', fixture: 'not-on-sale-dated' })).season.sale_opens_on, /^\d{4}-\d{2}-\d{2}$/);
});

function gateModule() {
  return loadTs('src/components/GrownUpGate.tsx', {
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, runOnJS: f => f, useAnimatedStyle: f => f(), useSharedValue: v => ({ value: v }), withTiming: (v, c, cb) => { if (cb) cb(true); return v; } },
    '../ui/useUiReducedMotion': { __esModule: true, default: () => false },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
    react: { useEffect() {}, useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    '../ui/iconNames': {}, './RealMoneyMark': { default: 'RealMoneyMark' },
    'react-native': { Modal: 'Modal', Platform: { OS: 'ios' }, Pressable: 'Pressable', StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    '../RootNavigation': { navigate: () => {} },
    '../ui': { BRAND: { goldLip: '#d99a00', navy: '#05346e' }, FONT: {}, GameIcon: 'GameIcon' },
    '../ui/modalLayers': { useModalLayer: () => true },
  }, { __DEV__: true });
}

test('T161: a free trial starts its free time; a buy still says Continue to buy', () => {
  const gate = gateModule();
  const renews = trial => ({ kind: 'renews', what: 'VIP', price: '$39.99', period: 'year', trial });
  assert.equal(gate.gateContinueLabel(renews('One week free')), 'Start the free week');
  assert.equal(gate.gateContinueLabel(renews('Seven days free')), 'Start the free week');
  assert.equal(gate.gateContinueLabel(renews('1 month free')), 'Start the free month');
  assert.equal(gate.gateContinueLabel(renews('Three days free')), 'Start the 3 free days');
  assert.equal(gate.gateContinueLabel(renews(null)), 'Continue to buy', 'no trial: a real buy');
  assert.equal(gate.gateContinueLabel({ kind: 'money', price: '$4.99', gets: 'the Shark Pass' }), 'Continue to buy');
  const src = strip(read('src/components/GrownUpGate.tsx'));
  assert.match(src, /\{gateContinueLabel\(req\.reason\)\}<\/Text>/);
  assert.doesNotMatch(src, />Continue to buy<\/Text>/, 'no fixed buy word on the details card');
});

test('T162: SAVE on the yearly plan is the gold sticker, not a red pill', () => {
  const screen = read('src/screens/MembershipScreen.tsx');
  const badge = screen.match(/planBadge: \{[^}]*\}/)[0];
  assert.match(badge, /backgroundColor: '#ffcf3b'/);
  assert.match(badge, /color: '#6a3b00'/);
  assert.doesNotMatch(badge, /#e8322a/);
});

test('T171: VIP time that never renews is for this account, never "a gift"', () => {
  for (const file of ['src/screens/MembershipScreen.tsx', 'src/screens/StoreScreen/SuppliesShop.tsx', 'src/components/money/GrownUpsInfo.tsx']) {
    const visible = strip(read(file));
    assert.doesNotMatch(visible, /AS A GIFT|as a gift|VIP GIFT PLANS|VIP gift plans\.|Gift plans of VIP|This VIP gift belongs/, file);
  }
  assert.match(read('src/screens/MembershipScreen.tsx'), /VIP for this account for a set time\. Pay once, no renewing\./);
  assert.match(read('src/screens/StoreScreen/SuppliesShop.tsx'), /VIP for this account, no renewing/);
});

const offers = loadTs('src/services/money/offers.ts');

test('T230: the win card VIP line has its copy and numbers, and never shows for VIP, kids or a loss', () => {
  const o = plain(offers.vipWinOffer({ coins: 60, xp: 50, multiplier: 2, isVip: false }));
  assert.deepEqual(o, { where: 'win_vip', title: 'VIP doubles this', line: 'VIP doubles this: +60 Shark Coins, +50 XP', extraCoins: 60, extraXp: 50, gate: 'money' });
  assert.equal(plain(offers.vipWinOffer({ coins: 25, xp: 0, multiplier: 3, isVip: false })).line, 'VIP triples this: +50 Shark Coins');
  for (const off of [{ isVip: true }, { kid: true }, { loss: true }, { multiplier: null }, { multiplier: 1 }, { coins: 0, xp: 0 }]) {
    assert.equal(offers.vipWinOffer({ coins: 60, xp: 50, multiplier: 2, isVip: false, ...off }), null, JSON.stringify(off));
  }
  assert.doesNotMatch(o.line, /would|miss|lost|hurry/i, 'no loss framing, no pressure');
});

test('T156: three concrete VIP perks with the player own week, the rest folded', () => {
  const PERKS = [
    { key: 'ride', icon: 'xp', title: '2x XP and Shark Coins', body: 'Every time you win a ride coin at the park.' },
    { key: 'home', icon: 'search', title: '2 extra treats on every home hunt', body: '2x Energy, Tickets and XP from every treat.' },
    { key: 'daily_ticket', icon: 'ticket', title: 'A free Ticket every day', body: 'Claim it in Supplies.' },
    { key: 'monthly_gift', icon: 'gift', title: 'A gift every month', body: '500 Shark Coins and a pin, every month you are VIP.' },
    { key: 'pass_points', icon: 'star', title: '25% more Shark Pass points', body: 'On everything.' },
    { key: 'badge', icon: 'member', title: 'VIP badge on your profile', body: 'Everyone can see it.' },
  ];
  const r = plain(offers.vipHeroPerks(PERKS, { lastWeekWins: 4, thisWeekWins: 1, giftCoins: 500, giftPin: 'VIP November Pin' }));
  assert.deepEqual(r.hero.map(p => p.key), ['ride', 'daily_ticket', 'monthly_gift']);
  assert.equal(r.hero[0].body, 'Last week you won 4 ride coins. VIP doubles every one.');
  assert.equal(r.hero[1].body, 'That is 7 more Tickets every week. Claim it in Supplies.');
  assert.equal(r.hero[2].body, 'This month: 500 Shark Coins and the VIP November Pin.');
  assert.deepEqual(r.rest.map(p => p.key), ['home', 'pass_points', 'badge']);
  assert.equal(plain(offers.vipHeroPerks(PERKS, { thisWeekWins: 1 })).hero[0].body, 'This week you won 1 ride coin. VIP doubles every one.');
  assert.equal(plain(offers.vipHeroPerks(PERKS, {})).hero[0].body, 'Every ride coin you win at the park pays double.');
  assert.equal(plain(offers.vipHeroPerks(PERKS, {})).hero[2].body, PERKS[3].body, 'no gift numbers: the server line');
  // The perk list failed to load: the gift still shows from its own on answer, never invented without it.
  const fallback = PERKS.filter(p => p.key === 'ride' || p.key === 'home' || p.key === 'badge');
  assert.deepEqual(plain(offers.vipHeroPerks(fallback, { giftOn: true, giftCoins: 500, giftPin: 'VIP November Pin' })).hero.map(p => p.key), ['ride', 'monthly_gift']);
  assert.deepEqual(plain(offers.vipHeroPerks(fallback, { giftOn: false, giftCoins: 500, giftPin: 'VIP November Pin' })).hero.map(p => p.key), ['ride']);
  // An older server without keys: matched by its words.
  const nokey = PERKS.map(({ key, ...p }) => p);
  assert.equal(plain(offers.vipHeroPerks(nokey, {})).hero.length, 3);
  const screen = strip(read('src/screens/MembershipScreen.tsx'));
  assert.match(screen, /!member && hero\.hero\.length > 0 \?/);
  assert.match(screen, /<MemberStage pin=\{!member && gift\?\.pin && VIP_PIN_ART\[gift\.pin\.art\]/);
  assert.match(screen, /getStandings\('week'\)\.then\(b => \{ if \(live\) setWeek\(\{ last: b\.last_week\?\.score \?\? null, now: b\.me\?\.score \?\? null \}\); \}\)/);
  assert.doesNotMatch(screen, /Bigger rewards at home and at the park\./, 'no vague headline');
});
