'use strict';
/**
 * Fix round w3, hold-fix 3 (Nov 18, 2026): items checker 3 rejected on the merged build 32e3d788.
 * Each test fails on 32e3d788 (T ids and regression names in the titles).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const strip = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const noStore = { '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } } };

test('regression: a server bank question plays exactly as written (no "The park company Studio")', () => {
  const trivia = loadTs('src/services/task-attempt/coinTrivia.ts', { ...noStore, '../../api/endpoints/lineplay/trivia': { default: async () => null } });
  const row = (id, extra = {}) => ({ id, park_id: 8, ride_id: 65, question: `Question ${id}?`, choices: ['A', 'B', 'C', 'D'],
    correct_index: 1, difficulty: 'easy', deck: 'history', fact: null, source: 'Disneyland', ...extra });
  const walt = row('dl-walt-3', {
    question: 'Walt first thought of building Disneyland on a strip of land across the street from what?',
    choices: ['Union Station', 'The Disney Studio', 'The Rose Bowl', 'The Hollywood Bowl'],
    fact: 'Walt Disney first pictured a small park beside the Disney Studio in Burbank.',
  });
  const round = trivia.dealtTriviaRound({ source: 'bank', questions: [row('a'), row('b'), walt] });
  assert.equal(round.pool[2].bank, true, 'server rows are marked as bank rows');
  const engine = loadTs('src/games/trivia-duel/engine/match.ts');
  const plan = engine.planFromIds('ride', 1304, ['a', 'b', 'dl-walt-3'], round.pool, 'deckhand', false);
  const q = plan.rounds[2].question;
  assert.equal(q.prompt, walt.question);
  assert.ok(q.choices.includes('The Disney Studio'), q.choices.join(' / '));
  assert.equal(q.choices[q.correctIndex], 'The Disney Studio', 'the right answer reads as the server wrote it');
  assert.equal(q.fact, walt.fact, 'Walt Disney stays Walt Disney');
  // The bundled pool (app copy) still goes through the labels: the IP rule for bundled lines is unchanged.
  const content = loadTs('src/games/trivia-duel/engine/content.ts');
  const bundled = content.materializeQuestion('x-1', [{ id: 'x-1', question: 'Which Universal ride is it?', choices: ['A', 'B', 'C', 'D'], correctIndex: 0, difficulty: 'easy' }], 1);
  assert.doesNotMatch(bundled.prompt, /Universal/);
});

test('regression: Gill\'s badge in Beat the Buzzer never shows a seconds readout', () => {
  const { LOCK_BADGE, lockBadge } = loadTs('src/games/trivia-duel/engine/lockBadge.ts');
  for (const kind of Object.keys(LOCK_BADGE)) assert.doesNotMatch(lockBadge(kind), /\d/, kind);
  const duel = strip(read('src/games/trivia-duel/TriviaDuel.tsx'));
  const lockLabel = duel.slice(duel.indexOf('const lockLabel = useCallback'), duel.indexOf('const resolveOppShown'));
  assert.doesNotMatch(lockLabel, /toFixed|\/ 1000/, 'the portrait chip is a word, not a time');
  assert.doesNotMatch(duel, /me: 'TIME'|BELL \$\{/, 'no clock words on the chip either');
});

test('T118: after the Daily 3 chest opens, the level chest waits for the next open of Rewards', () => {
  const model = loadTs('src/services/retention/rewardsModel.ts');
  const base = { dailyChest: null, trail: null, stamps: null, events: null, levelChest: { level: 2, waiting: 1 }, weekly: { claimable: true } };
  const claimed = { done: 3, total: 3, claimable: false, claimed: true, flame: 1, seen: true };
  const keys = input => model.rewardsRows(input).map(r => r.key);
  // Same visit, the Daily 3 chest just closed: no second chest in this open.
  const sameVisit = keys({ ...base, daily3: claimed, chestOpenedThisVisit: true });
  assert.ok(!sameVisit.includes('level_chest'), sameVisit.join(','));
  assert.ok(!sameVisit.includes('weekly_box'), sameVisit.join(','));
  assert.equal(model.emptyLine({ ...base, daily3: claimed, chestOpenedThisVisit: true }), 'Another chest waits for your next visit');
  // The sheet closed: the button counts the waiting chests, and the next open offers them.
  assert.equal(model.rewardsCount({ ...base, daily3: claimed }), 2);
  assert.ok(keys({ ...base, daily3: claimed }).includes('level_chest'));
  // The hook ends the visit when the overlay closes, and starts the hold when a chest has paid.
  const hook = strip(read('src/components/retention/useRetention.tsx'));
  assert.match(hook, /if \(!view\) setChestThisVisit\(false\);\s*else if \(view\.k === 'reveal' && view\.rewards\) setChestThisVisit\(true\);/);
  assert.match(hook, /chestOpenedThisVisit: chestThisVisit,/);
});

const P = (id, section, grants, extra = {}) => ({ product_id: `com.themeparkshark.app.${id}`, section, grants, available: true, title: id, badge: null, limit: null, deal_key: null, unavailable_reason: null, ...extra });
// The catalog :8012 serves on Nov 18 (be-economy dropped tickets.12 and tickets.25).
const LIVE = [
  P('pack.starter', 'featured', { tickets: 15, coins: 1500, energy: 150, rescue_passes: 2 }, { limit: 'once', title: 'Starter Pack' }),
  P('deal.daily', 'featured', { tickets: 9 }, { limit: 'daily', deal_key: 'ticket_stack', title: 'Ticket Stack' }),
  P('pack.parkday', 'featured', { tickets: 20, coins: 500, energy: 200, rescue_passes: 2 }, { limit: 'daily', title: 'Park Day Pack' }),
  P('pack.parktrip', 'featured', { tickets: 60, coins: 1500, energy: 400, rescue_passes: 6 }, { limit: 'daily', title: 'Park Trip Pack' }),
  P('tickets.5', 'tickets', { tickets: 5 }),
  P('coins.500', 'coins', { coins: 500 }), P('rescue.3', 'rescue', { rescue_passes: 3 }),
];
const USD = { 'pack.starter': 1.99, 'deal.daily': 0.99, 'pack.parkday': 2.99, 'pack.parktrip': 5.99, 'tickets.5': 0.99, 'coins.500': 0.99, 'rescue.3': 0.99 };
const PRICES = Object.fromEntries(Object.entries(USD).map(([k, v]) => [`com.themeparkshark.app.${k}`, { price: `$${v.toFixed(2)}`, amount: v }]));
const ids = list => Array.from(list, p => p.product_id.replace('com.themeparkshark.app.', ''));

test('T221: the Ticket row never shows 9 Tickets for $0.99 next to 5 Tickets for $0.99', () => {
  const m = loadTs('src/services/money/suppliesPlan.ts');
  const plan = over => m.planSupplies({ products: LIVE, prices: PRICES, focus: null, wallet: { tickets: 0 }, priced: () => true, ...over });
  const p = plan();
  assert.deepEqual(ids(p.ticketRow), ['deal.daily']);
  const onPage = [...p.ticketRow, ...p.more.bundles, ...p.more.deals, ...p.more.packs.flatMap(s => s.packs)];
  assert.ok(!ids(onPage).includes('tickets.5'), 'the outdone pack is not anywhere on the page today');
  // Every Tickets-only card on the page: a higher price always gives more Tickets.
  const ticketCards = onPage.filter(x => Object.keys(x.grants).every(k => k === 'tickets')).sort((a, b) => USD[ids([a])[0]] - USD[ids([b])[0]]);
  for (let i = 1; i < ticketCards.length; i++) assert.ok(ticketCards[i].grants.tickets > ticketCards[i - 1].grants.tickets);
  // The out-of-Tickets door: the smallest buy is today's 9 for $0.99.
  assert.deepEqual(ids([plan({ focus: 'tickets' }).handoff.pack]), ['deal.daily']);
  // Bought today (or a coin deal day): 5 Tickets for $0.99 comes back.
  const bought = LIVE.map(x => (x.deal_key ? { ...x, available: false, unavailable_reason: 'bought_today' } : x));
  assert.deepEqual(ids(plan({ products: bought }).ticketRow), ['deal.daily', 'tickets.5'], 'the bought pick says Back tomorrow beside it');
  const coinDay = LIVE.map(x => (x.deal_key ? { ...x, grants: { coins: 1000 } } : x));
  assert.deepEqual(ids(plan({ products: coinDay }).ticketRow), ['tickets.5']);
});

test('T228: plain pack names on every band (no ONE A DAY), and the need-a-Ticket offer is not a daily deal', () => {
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  const look = shop.slice(shop.indexOf('function heroLook'), shop.indexOf('function heroLook') + 600);
  assert.doesNotMatch(look, /ONE A DAY|FOR A PARK TRIP/);
  assert.match(look, /return \{ band: product\.title\.toUpperCase\(\), art: 'bag' \};/);
  const offers = loadTs('src/services/money/naturalOffers.ts', noStore);
  assert.doesNotMatch(offers.OFFER_COPY.need_ticket.title, /today/i);
});

test('regression: the gate summary says Tickets and Energy with capitals, like Shark Coins', () => {
  const { grantsText } = loadTs('src/services/money/supplies.ts', {
    react: { useEffect() {}, useState: v => [v, () => {}] }, '../../components/GrownUpGate': { askGrownUp: async () => false },
    '../../api/endpoints/me/shop': {}, '../purchases': {}, './track': { trackMoney() {} },
  });
  assert.match(grantsText({ tickets: 20, coins: 500, energy: 200 }), /^20 Tickets, 500 Shark Coins and 200 Energy$/);
  assert.equal(grantsText({ tickets: 1 }), '1 Ticket');
  const copy = loadTs('src/services/money/copy.ts');
  assert.equal(copy.topUpHeadline(1, 'tickets', 'ride'), 'Out of Tickets?');
});
