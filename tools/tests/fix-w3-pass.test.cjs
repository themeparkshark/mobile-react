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
