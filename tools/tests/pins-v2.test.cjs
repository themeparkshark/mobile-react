'use strict';
/**
 * Pins v2 (dustin-feedback-oct8/pins/DECISION.md): the page's pure rules.
 * Odds always shown as the server sends them, the chaser meter only shows real
 * progress, free boxes in the server's order, coin shortfall, honest end dates,
 * lanyard limits, and park pins never shown as tradable.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const m = loadTs('src/screens/pins/pinsModel.ts');

const pin = (o = {}) => ({ item_id: 1, name: 'Mermaid', icon_url: 'x', owned: false, spares: 0, kind: 'mystery', tradable: true, ...o });
const series = (o = {}) => ({
  id: 1, slug: 's', name: 'Shark Tales', tagline: null, open: true, ends_at: null, price: 250, bundle: { count: 5, price: 1100 },
  box_art_url: null, theme_color: '#1B6FD1', pity: 20, chaser_within: 20, opened: 0,
  free: { first: false, weekly: false, banked: 0, weekly_resets_at: '' }, free_now: false, chasers_pulled: 0, my_chaser_serials: [], tradable: true,
  pins: [pin({ item_id: 1, chance_bp: 1550, owned: true }), pin({ item_id: 2, chance_bp: 1550 }), pin({ item_id: 9, chance_bp: 700, is_chaser: true })],
  ...o,
});

test('chances read like the odds table: 15.5%, 7%, 1 in 14', () => {
  assert.equal(m.formatChance(1550), '15.5%');
  assert.equal(m.formatChance(700), '7%');
  assert.equal(m.formatChance(1860), '18.6%');
  assert.equal(m.formatChance(undefined), '0%');
  assert.equal(m.oneIn(700), '1 in 14');
  assert.equal(m.oneIn(0), '');
});

test('the chaser meter is real progress and never full before the guarantee box', () => {
  assert.equal(m.chaserMeter({ pity: 20, chaser_within: 20 }), 0);
  assert.equal(m.chaserMeter({ pity: 20, chaser_within: 1 }), 1);
  const mid = m.chaserMeter({ pity: 20, chaser_within: 12 });
  assert.ok(mid > 0.4 && mid < 0.45, String(mid));
});

test('series progress counts regular pins and the chaser apart', () => {
  assert.deepEqual(plain(m.seriesProgress(series())), { have: 1, total: 2, chaser: false });
  const { regular, chaser } = m.splitSeries(series());
  assert.equal(regular.length, 2);
  assert.equal(chaser.item_id, 9);
});

test('free boxes open in the server order: first, weekly, banked', () => {
  assert.equal(m.nextFreeBox(series()), null);
  assert.equal(m.nextFreeBox(series({ free_now: true, free: { first: true, weekly: true, banked: 2 } })), 'first');
  assert.equal(m.nextFreeBox(series({ free_now: true, free: { first: false, weekly: true, banked: 2 } })), 'weekly');
  assert.equal(m.nextFreeBox(series({ free_now: true, free: { first: false, weekly: false, banked: 1 } })), 'banked');
});

test('coin shortfall uses the bundle price for a bundle', () => {
  assert.equal(m.coinsShort(series(), 1, 300), 0);
  assert.equal(m.coinsShort(series(), 1, 100), 150);
  assert.equal(m.coinsShort(series(), 5, 1000), 100);
  assert.equal(m.coinsShort(series(), 5, -5), 1100);
});

test('end dates are real dates, never a countdown', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert.equal(m.endsLabel('2026-12-31T23:59:59-08:00', now), 'Ends Dec 31');
  assert.equal(m.endsLabel('2026-10-01T00:00:00Z', now), 'All done');
  assert.equal(m.endsLabel(null, now), null);
});

test('the lanyard holds at most 6 and taps toggle', () => {
  assert.deepEqual(plain(m.toggleLanyard([1, 2], 3, 6)), { ids: [1, 2, 3], full: false });
  assert.deepEqual(plain(m.toggleLanyard([1, 2, 3], 2, 6)), { ids: [1, 3], full: false });
  assert.deepEqual(plain(m.toggleLanyard([1, 2, 3, 4, 5, 6], 7, 6)), { ids: [1, 2, 3, 4, 5, 6], full: true });
});

test('My Pins lists every owned pin once: chasers, park pins, then tradable', () => {
  const home = {
    mystery: [series({ pins: [pin({ item_id: 1, owned: true, name: 'Mermaid' }), pin({ item_id: 9, owned: true, is_chaser: true, name: 'Golden' })] })],
    park_sets: [{ pins: [pin({ item_id: 3, owned: true, kind: 'park', tradable: false, name: 'Castle' }), pin({ item_id: 4, owned: false, kind: 'park', tradable: false })], reward: { completer: null } }],
    shop_pins: [pin({ item_id: 1, owned: true }), pin({ item_id: 5, owned: true, kind: 'shop', name: 'Beta' })],
  };
  assert.deepEqual(plain(m.myPins(home).map(p => p.item_id)), [9, 3, 5, 1]);
});

test('region comes from the locale (paid boxes are off in BE/NL on the server)', () => {
  assert.equal(m.deviceRegion('nl-BE'), 'BE');
  assert.equal(m.deviceRegion('en_US'), 'US');
  assert.equal(m.deviceRegion('en'), null);
});

test('a retried open reuses its request id (never charges twice)', () => {
  const src = fs.readFileSync('src/screens/pins/PinsScreen.tsx', 'utf8');
  assert.match(src, /pending\.current\[series\.id\] \?\? newRequestId\(\)/);
  assert.match(src, /delete pending\.current\[series\.id\]/);
  assert.notEqual(m.newRequestId(0.1), m.newRequestId(0.2));
});

test('the opening has no buy button and odds sit on the card before Open', () => {
  const reveal = fs.readFileSync('src/screens/pins/BoxReveal.tsx', 'utf8');
  assert.doesNotMatch(reveal, /openMysteryBoxes|icon="coins"|label="Buy/);
  const card = fs.readFileSync('src/screens/pins/MysteryCard.tsx', 'utf8');
  const odds = card.indexOf('<OddsTable');
  const button = card.indexOf('label="Open free"');
  assert.ok(odds > 0 && odds < button, 'odds render above the Open button');
});

test('park pins wear the seal, never the trade badge', () => {
  const art = m;
  assert.equal(art.badgeFor('park', false), 'seal');
  assert.equal(art.badgeFor('event', true), 'seal');
  assert.equal(art.badgeFor('mystery', true), 'trade');
  assert.equal(art.badgeFor('shop', true), 'trade');
});

test('warmer / colder words', () => {
  assert.equal(m.warmthView('cold').word, 'Cold');
  assert.equal(m.warmthView('here').fill, 1);
  assert.ok(m.warmthView(null).fill < 0.1);
});

test('the first tab: Mystery when a free box waits, Park Sets when a reward waits', () => {
  assert.equal(m.initialTab({ mystery: [series({ free_now: true })], park_sets: [] }), 'mystery');
  assert.equal(m.initialTab({ mystery: [series()], park_sets: [{ complete: true, claimed: false }] }), 'sets');
});

test('bundles build to the best pin: extras, then new, the chaser last', () => {
  const pulls = [{ id: 1, is_chaser: false, duplicate: false }, { id: 2, is_chaser: true, duplicate: false }, { id: 3, is_chaser: false, duplicate: true }];
  assert.deepEqual(plain(m.revealOrder(pulls).map(p => p.id)), [3, 1, 2]);
});

test('the "at least 1 new" note only shows while a regular pin is missing (the server rule)', () => {
  const card = fs.readFileSync('src/screens/pins/MysteryCard.tsx', 'utf8');
  assert.match(card, /progress\.have < progress\.total \? 'x5 = at least 1 new pin'/);
  const server = fs.existsSync(`${process.env.HOME}/apps/tps-ws/fb-pins-be/app/Domains/PinTrading/Services/MysteryBoxService.php`)
    ? fs.readFileSync(`${process.env.HOME}/apps/tps-ws/fb-pins-be/app/Domains/PinTrading/Services/MysteryBoxService.php`, 'utf8') : '';
  if (server) assert.match(server, /\$missing->isNotEmpty\(\)/);
});

test('pack pace: honest days left and how many pins are still out there', () => {
  const { packPace } = loadTs('src/screens/pins/pinsModel.ts');
  assert.equal(packPace({ have: 2, total: 5, ends_on: '2026-12-31' }, '2026-10-09'), '83 days left · 3 to find');
  assert.equal(packPace({ have: 4, total: 5, ends_on: '2026-12-31' }, '2026-12-31'), 'Last day! · 1 to find');
  assert.equal(packPace({ have: 5, total: 5, ends_on: '2026-12-31' }, '2026-10-09'), 'All found!');
  assert.equal(packPace({ have: 1, total: 5, ends_on: null }, '2026-10-09'), '4 to find');
});

test('the trading board keeps a gold copy\'s number on its card', () => {
  const { toCards, mergeBoard } = loadTs('src/screens/pinTrading/pinTradeModel.ts');
  const swap = { id: 68, pin: { item: { id: 482, name: 'Golden Magic Shark Pin' } }, held_from: null, held_to: null, serial: 1 };
  const cards = toCards([swap]);
  assert.equal(cards[0].serial, 1);
  assert.equal(mergeBoard(cards, [swap], [])[0].serial, 1);
  assert.equal(toCards([{ ...swap, serial: null }])[0].serial, undefined);
});

test('your numbered gold can go for the board\'s numbered copy of the same pin', () => {
  const { givablePins } = loadTs('src/screens/pinTrading/pinTradeModel.ts');
  const mine = [{ id: 482, serial: 3 }, { id: 10 }];
  assert.deepEqual(givablePins(mine, 482, 1).map(p => p.id), [482, 10]);
  assert.deepEqual(givablePins(mine, 482, null).map(p => p.id), [10]);
});

test('box odds row shows each pin as its real picture or silhouette, no "?" placeholders unless the art fails', () => {
  const card = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/pins/MysteryCard.tsx'), 'utf8');
  const art = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/pins/PinArt.tsx'), 'utf8');
  require('node:assert/strict').equal((card.match(/plainGhost \/>/g) || []).length, 2);
  require('node:assert/strict').match(art, /\(!plainGhost \|\| artFailed\) &&/);
});
