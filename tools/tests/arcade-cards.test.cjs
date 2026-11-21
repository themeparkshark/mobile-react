// T3, T4, T7, T9 (arcade plan, Nov 20 2026): the coin card, the loss card and Get Tickets, on both servers.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { read } = require('./helpers/load-ts.cjs');

const loss = loadTs('src/components/tickets/lossCard.ts');
const ways = loadTs('src/components/tickets/getTicketsModel.ts');
const price = loadTs('src/components/tickets/coinCardPriceModel.ts');
const card = loadTs('src/components/rewards/coinCardModel.ts');
const copy = loadTs('src/components/rewards/challengeCopy.ts');

test('T4 a loss at a 3 Ticket ride: Nice try!, +3 Parts into its slot, no Ticket back, TRY AGAIN at 3', () => {
  const m = loss.lossCardModel({ attempt: { status: 'lost', ticket_cost: 3, loss_parts: 3, losses_here_today: 1,
    first_coin_ticket_returned: false, rescue_retry_available: false, loss: { parts: 3, parts_full: false, task_name: 'Space Mountain' } },
  coinName: 'Space Mountain', price: 3, tickets: 4, practice: true });
  assert.equal(m.title, 'Nice try!');
  assert.equal(m.parts.line, '+3 Ride Parts for Space Mountain');
  assert.equal(m.freeRetry, false);
  assert.equal(m.price, 3);
  assert.equal(m.short, false);
  assert.equal(m.soft, false, 'one loss: TRY AGAIN and BACK TO MAP the same size');
  assert.equal(m.practiceLink, 'Practice this game free');
  assert.doesNotMatch(m.message, /came back|So close|Next coin/i);
});

test('T4 the soft stop after 2 losses here today, and short on Tickets TRY AGAIN shows outlines', () => {
  const second = loss.lossCardModel({ attempt: { status: 'lost', ticket_cost: 3, loss_parts: 3, losses_here_today: 2 },
    coinName: 'Space Mountain', price: 3, tickets: 1, practice: false });
  assert.equal(second.soft, true);
  assert.equal(second.short, true);
  assert.equal(second.practiceLink, null);
});

test('T4 Parts full here today when the 12 cap took them all', () => {
  const m = loss.lossCardModel({ attempt: { status: 'lost', ticket_cost: 3, loss_parts: 0, loss: { parts: 0, parts_full: true } },
    coinName: 'Space Mountain', price: 3, tickets: 9, practice: false });
  assert.deepEqual({ ...m.parts }, { amount: 0, full: true, line: 'Parts full here today' });
});

test('T4 today\'s server: a Ticket it really gave back still says so (both servers work); a plain loss names the Tickets used', () => {
  const back = loss.lossCardModel({ attempt: { first_coin_ticket_returned: true, ticket_cost: 1 }, coinName: 'Dumbo', price: 1, tickets: 1, practice: false });
  assert.equal(back.freeRetry, true);
  assert.equal(back.price, null, 'no price pictures on a free retry');
  assert.equal(back.title, 'Nice try!');
  const plain = loss.lossCardModel({ attempt: { ticket_cost: 2 }, coinName: 'Dumbo', price: 2, tickets: 5, practice: false });
  assert.equal(plain.parts, null);
  assert.equal(plain.message, '2 Tickets used.');
});

test('T4 a began try that timed out counts as played; a never-begun one says its Tickets are back (arcade only)', () => {
  assert.equal(loss.lossCardModel({ attempt: { status: 'lost', abandoned: true, ticket_cost: 1, loss_parts: 1 }, coinName: 'X', price: 1, tickets: 0, practice: false }).message,
    'That game timed out. It counts as played.');
  assert.equal(loss.expiredLine({ status: 'lost', abandoned: true }, true), 'That game timed out. It counts as played.');
  assert.equal(loss.expiredLine({ status: 'expired' }, true), 'That game never started. Your Tickets are back.');
  assert.equal(loss.expiredLine({ status: 'expired' }, false), null, 'today\'s server keeps its own words');
});

test('T4 the ride modal has no VIP try, no ad retry and no next coin line on its loss card', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.doesNotMatch(modal, /vipRetryCase|watchForReward|lossNext\(|Next coin:/);
  assert.match(modal, /lead=\{loss\.parts \? <LossParts /);
  const actions = read('src/components/tickets/LossActions.tsx');
  assert.match(actions, /styles\.half/, 'TRY AGAIN and BACK TO MAP share one row, the same size');
  assert.match(actions, /<TicketPips price=\{price\} held=\{held\} size="button" \/>/);
});

test('T3 the coin card: this ride\'s game, Win coin + 4 Parts, Lose 3 Parts, the price, and a leave date', () => {
  const m = price.coinCardPrice({ game: 'tap', price: 3, winParts: 4, arcade: true, leavesOn: 'Monday, Nov 30' });
  assert.deepEqual({ ...m.game }, { id: 'tap', name: 'Whack-a-Shark' });
  assert.equal(m.win.text, 'coin + 4 Parts');
  assert.equal(m.lose.text, '3 Parts');
  assert.equal(m.price, 3);
  assert.equal(m.leaves, 'Leaves Monday, Nov 30');
  const today = price.coinCardPrice({ game: null, price: undefined, winParts: 1, arcade: false });
  assert.equal(today.game, null, 'no dealt game: no game row');
  assert.equal(today.lose, null, 'today\'s server pays nothing on a loss: no lose row');
  assert.equal(today.price, null, 'no served price: no pictures, never a guessed 1');
});

test('T3 PLAY! says PLAY! at every price (the pictures carry the price) and no price defaults to 1', () => {
  assert.equal(copy.challengeButtonLabel(null, 3), 'PLAY!');
  const modal = read('src/components/RedeemModal.tsx');
  assert.doesNotMatch(modal, /ticket_cost \?\? 1/);
  assert.match(modal, /<TicketPips price=\{price\} held=\{ticketsNow\} size="button" \/>/);
  assert.doesNotMatch(read('src/components/UnfoundCoinModal.tsx'), /free try works/);
});

test('T7 Get Tickets lists only rows that work now, in order, and ends with tomorrow\'s gift', () => {
  const base = { price: 3, tickets: 1, stampTickets: 0, rideHasLine: true, queueTicketsOn: true, affordableNear: 14, canPick: true, storeOn: true, arcade: true };
  const full = ways.getTicketsRows({ ...base, sources: { home: true, queue: true, queue_per_park_day: 3, stamps_waiting_tickets: 13,
    line_tickets_left_today: 3, trail_box_steps_left: 400 } });
  assert.deepEqual([...full.rows].map(r => r.kind), ['claim', 'line', 'trail', 'near', 'pick', 'grownups']);
  assert.equal(full.rows[0].text, 'Stamps waiting: +13');
  assert.equal(full.rows[1].text, '+1 Ticket and its Ride Parts');
  assert.equal(full.rows[3].text, '14 coins near you cost what you have');
  assert.equal(full.have, 'You have 1 of 3');
  assert.equal(full.footer, 'Tomorrow at any park: +3');
  const lean = ways.getTicketsRows({ ...base, tickets: 0, rideHasLine: false, canPick: false, storeOn: false,
    sources: { home: true, queue: true, queue_per_park_day: 3, line_tickets_left_today: 0 } });
  assert.deepEqual([...lean.rows].map(r => r.kind), [], 'nothing that would not work');
  const today = ways.getTicketsRows({ ...base, sources: null, arcade: false, affordableNear: null });
  assert.equal(today.footer, null, 'today\'s server has no park day gift: no promise');
  assert.equal(today.rows.find(r => r.kind === 'near').text, 'Coins you can play now');
  for (const row of full.rows) assert.doesNotMatch(row.text + row.a11y, /only today|hurry|minutes left|\$/i);
});

test('T9 Memory Match is one game of 3 boards, never tries per Ticket', () => {
  assert.equal(card.dealTries({ game: 'memory', tries_per_ticket: 3 }).label, 'One game, 3 boards of Memory Match');
  assert.deepEqual({ ...price.coinCardPrice({ game: 'memory', price: 2, winParts: 2, arcade: true, boards: 3 }).boards },
    { count: 3, text: 'One game, 3 boards' });
  for (const file of ['src/components/rewards/coinCardModel.ts', 'src/components/tickets/CoinCardPrice.tsx', 'src/games/memory/MemoryGame.tsx']) {
    assert.doesNotMatch(read(file), /tries per Ticket|1 Ticket = /, file);
  }
});

test('T5 the win card: the shelf gift bar names no ride, +3 lands on the 5th coin, no Next coin and no setTarget', () => {
  const gift = loadTs('src/components/tickets/shelfGift.ts');
  const ninth = gift.shelfGiftLine({ won: 9, total: 40, next_at: 10, tickets: 3, paid_now: 0 });
  assert.equal(ninth.line, '9 of 40 · 1 more: +3 Tickets');
  assert.equal(ninth.paidNow, 0);
  const fifth = gift.shelfGiftLine({ won: 5, total: 40, next_at: 10, tickets: 3, paid_now: 3 });
  assert.equal(fifth.line, '5 of 40 · 5 more: +3 Tickets');
  assert.equal(fifth.paidNow, 3);
  assert.equal(gift.shelfGiftLine(null), null, 'today\'s server: no bar');
  gift.noteShelfGift(901, { won: 10, total: 40, next_at: 15, tickets: 3, paid_now: 3 });
  assert.equal(gift.shelfGiftFor(901).won, 10);
  assert.equal(gift.shelfGiftFor(902), null, 'another win never shows this one');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.doesNotMatch(modal, /setTarget\([^)]*'win_card'\)/);
  assert.match(modal, /nextTarget=\{null\}/);
  assert.match(read('src/components/rewards/offerSlots.tsx'), /\{gift && <ShelfGiftBar gift=\{gift\} flyKey=\{winKey\} \/>\}/);
  assert.doesNotMatch(read('src/components/rewards/ChallengeStatusCard.tsx'), /Next coin:/);
});

test('T8 the treat meter fills to a Ticket in the jar; a full jar pays Shark Coins; the daily cap says so', () => {
  const jar = loadTs('src/components/tickets/treatJarModel.ts');
  const one = jar.treatJarModel({ treat_meter: { pips: 1, of: 3 }, home_jar: { held: 12, cap: 20, full: false }, home_tickets_today: { earned: 1, cap: 4 }, rewards: { tickets: 0 } });
  assert.equal(one.pips, 1); assert.equal(one.dropped, false); assert.equal(one.line, null);
  assert.equal(one.a11y, '2 more treats make 1 Ticket. 12 in your jar.');
  const third = jar.treatJarModel({ treat_meter: { pips: 0, of: 3, filled: true }, home_jar: { held: 13, cap: 20 }, rewards: { tickets: 1 } });
  assert.equal(third.dropped, true); assert.equal(third.pips, 3, 'the full meter shows as the Ticket drops');
  const full = jar.treatJarModel({ treat_meter: { pips: 0, of: 3, filled: true }, home_jar: { held: 20, cap: 20, full: true }, jar_overflow_coins: 25, rewards: { tickets: 0 } });
  assert.equal(full.line, 'Jar full! Save them for your park day'); assert.equal(full.overflowCoins, 25);
  const capped = jar.treatJarModel({ treat_meter: { pips: 2, of: 3 }, home_jar: { held: 9, cap: 20 }, home_tickets_today: { earned: 4, cap: 4 }, rewards: { tickets: 0 } });
  assert.equal(capped.line, "That's today's treat Tickets. More tomorrow!");
  assert.equal(jar.treatJarModel({ rewards: { tickets: 1 } }), null, 'today\'s server: the card is as today');
  assert.match(read('src/components/PrepItemRedeemModal.tsx'), /\{jar && <View style=\{\{ marginTop: 10 \}\}><TreatJar model=\{jar\} reduced=\{reducedMotion\} \/><\/View>\}/);
  assert.match(read('src/screens/ExploreScreen/HomeCatchMoment.tsx'), /setJar\(data\.replayed \? null : treatJarModel\(data as unknown as TreatJarAnswer\)\);/);
});

test('T7 on the arcade server a short card is Get Tickets (the stamp claim is its first row); a held Extra try keeps its PLAY!', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /const needTicket = outOfTickets && stepReady && \(arcade\n\s+\? freeStep\?\.kind !== 'free_try' && freeStep\?\.kind !== 'extra_try'\n\s+: freeStep\?\.kind === 'line_ticket' \|\| freeStep\?\.kind === 'treats'\);/);
});
