// Fix round W3, lane flow: the cards around the games (loss, out of Tickets, coin card, win card).
// Pure rules run for real; wiring is checked in the source where React cannot run here.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

const loss = loadTs('src/components/rewards/lossNext.ts');
const mash = loadTs('src/components/rewards/mashGuard.ts');
const card = loadTs('src/components/rewards/coinCardModel.ts');
const pill = loadTs('src/components/rewards/playPill.ts');
const pips = loadTs('src/components/rewards/tryPipsModel.ts');
const flight = loadTs('src/components/rewards/claimFlightModel.ts');
const rideTry = loadTs('src/gamekit/results/rideTry.ts');

/* T029: every loss card has a forward button that plays. */
test('T029 a paid loss with Tickets left offers TRY AGAIN for 1 Ticket, says how many are left and the next coin', () => {
  const plan = loss.lossNext({ freeRetry: false, vipRetry: false, tickets: 3, ticketCost: 1, nextCoin: { name: 'Tiki Room', meters: 60.4 } });
  assert.equal(plan.kind, 'paid_retry');
  assert.equal(plan.label, 'Try Again');
  assert.equal(plan.note, '1 Ticket');
  assert.deepEqual(plain(plan.footnotes.map(n => n.text)), ['You have 3 Tickets', 'Next coin: Tiki Room, 60 m']);
});

test('T029 a free retry or a VIP try comes first; at 0 Tickets the way on is the free ways, never only the map', () => {
  assert.equal(loss.lossNext({ freeRetry: true, vipRetry: true, tickets: 0, ticketCost: 1 }).kind, 'free_retry');
  const vip = loss.lossNext({ freeRetry: false, vipRetry: true, tickets: 5, ticketCost: 1 });
  assert.equal(vip.kind, 'vip_retry');
  assert.equal(vip.note, 'VIP try');
  const out = loss.lossNext({ freeRetry: false, vipRetry: false, tickets: 0, ticketCost: 1, claimableTickets: 5 });
  assert.equal(out.kind, 'ways');
  assert.equal(out.label, 'Free Tickets');
  assert.equal(out.footnotes[0].text, '5 free Tickets are waiting');
  assert.equal(loss.lossNext({ freeRetry: false, vipRetry: false, tickets: 0, ticketCost: 1 }).label, 'Ways to Play');
  assert.equal(loss.distanceText(1530), '1.5 km');
  assert.equal(loss.distanceText(null), null);
});

test('T029 the loss card always shows the map as its small second button and its primary from the plan', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  const lost = modal.slice(modal.indexOf("{flowState === 'lost' && <ChallengeStatusCard"), modal.indexOf('{/* MINIGAME STATE'));
  assert.match(lost, /quiet=\{\{ label: BACK_TO_MAP, onPress: handleLostClose \}\}/);
  assert.match(lost, /label: lossPlan\.kind === 'vip_retry'/);
  assert.match(lost, /footnotes=\{lossPlan\.footnotes\}/);
  assert.doesNotMatch(lost, /: \{ label: BACK_TO_MAP, onPress: handleLostClose \}\}/, 'never a card whose only button is the map');
  assert.match(modal, /lossPlan\.kind === 'ways' \? backToCard : \(\) => \{ void handleProtectedRetry\(\); \}/);
});

/* T046: a 600 ms input lock that mashing keeps extending. */
test('T046 the result lock is 600 ms and a tap during it starts it again', () => {
  assert.equal(mash.RESULT_INPUT_LOCK_MS, 600);
  assert.equal(mash.nextMashUnlock(1600, 1200), 1800, 'a mash at 1200 pushes the wake time');
  assert.equal(mash.nextMashUnlock(1600, 1700), 1600, 'a tap after the lock is a real press');
  const status = read('src/components/rewards/ChallengeStatusCard.tsx');
  assert.match(status, /onStartShouldSetResponder=\{\(\) => \{ lockedTap\(\); return true; \}\}/);
  assert.match(status, /onPress=\{armed \? quiet\.onPress : undefined\}/);
});

/* T030 and T031: out of Tickets. */
test('T030 PLAY! dims with a ticket only when nothing plays now, and stays bright while the lookup is unknown', () => {
  const base = { isCoin: true, tickets: 0, ticketCost: 1, badge: null, rescueAvailable: false };
  assert.deepEqual(plain(pill.playPillState({ ...base, claimable: 0 })), { dim: true, needTicket: true });
  assert.equal(pill.playPillState({ ...base, claimable: null }).dim, false);
  assert.equal(pill.playPillState({ ...base, claimable: 3 }).dim, false, 'earned Tickets wait: PLAY! claims them');
  assert.equal(pill.playPillState({ ...base, claimable: 0, badge: 'free_try', rescueAvailable: true }).dim, false);
  assert.equal(pill.playPillState({ ...base, tickets: 2, claimable: 0 }).dim, false);
});

test('T030 T031 the NEED A TICKET card plays: LinePlay at a line ride with the line Ticket on, else a practice game', () => {
  assert.equal(card.needTicketMain({ queueTicketsOn: true, rideHasLine: true, practice: true }), 'lineplay');
  assert.equal(card.needTicketMain({ queueTicketsOn: false, rideHasLine: true, practice: true }), 'practice');
  assert.equal(card.needTicketMain({ queueTicketsOn: true, rideHasLine: false, practice: true }), 'practice');
  assert.equal(card.needTicketMain({ queueTicketsOn: false, rideHasLine: false, practice: false }), 'map');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /<GameIcon name="moon" size=\{26\} \/>/, 'tomorrow\'s free try is a moon picture');
  assert.match(modal, /<GameIcon name="line" size=\{26\} \/>/, 'the line Ticket wears LinePlay\'s own picture');
  assert.match(modal, /<NeedTicketOfferSlot placement="need_ticket"/, 'one clean place for a later calm offer row');
  assert.match(read('src/components/RedeemModal.tsx'), /<HomeArcade visible=\{practiceOpen\}/);
});

/* T035: one consistent preview. */
test('T035 the card before PLAY promises the same tiles on every visit (Shark Coins only for a ride)', () => {
  const tiles = [{ label: 'SHARK COINS', amount: 10 }, { label: 'RIDE PARTS', amount: 4 }, { label: 'XP', amount: 25 }];
  assert.deepEqual(plain(card.previewRewardTiles(tiles, 'task').map(t => t.label)), ['SHARK COINS']);
  assert.deepEqual(plain(card.previewRewardTiles(tiles, 'secret_task').map(t => t.label)), ['SHARK COINS', 'RIDE PARTS']);
});

/* T055: stepping back into range. */
test('T055 a "move closer" answer clears once the player has moved a few meters', () => {
  const at = { latitude: 33.8114, longitude: -117.919 };
  assert.equal(card.rangeErrorCleared(at, at), false);
  assert.equal(card.rangeErrorCleared(at, { latitude: 33.8112, longitude: -117.919 }), true);
  assert.equal(card.rangeErrorCleared(null, at), false);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /startErrorAt\.current = startLocation;/);
});

/* T053: the try as a picture. */
test('T053 the loss line has a pip row: bonks, pairs or right answers got of needed', () => {
  assert.deepEqual(plain(pips.pipFill(8, 13)), { need: 13, have: 8, share: 8 / 13, bar: false });
  assert.equal(pips.pipFill(3, 0), null);
  assert.equal(pips.pipFill(30, 40).bar, true);
  const tap = rideTry.rideTrySummary({ meta: { game: 'tap', ridePercent: 62 } });
  assert.equal(tap.have, 8);
  assert.equal(tap.need, 13);
  const mem = rideTry.rideTrySummary({ meta: { game: 'memory', pairs: 3, pairsTotal: 8 } });
  assert.deepEqual([mem.have, mem.need], [3, 8]);
});

/* T142: the claim flight. */
test('T142 claimed Tickets fly (at most 4 pictures) and count up to the exact total', () => {
  const plan = flight.claimFlightPlan(15);
  assert.equal(plan.pictures, 4);
  assert.equal(plan.steps.at(-1), 1);
  assert.ok(plan.steps.every((v, i, a) => i === 0 || v >= a[i - 1]), 'never counts down');
  assert.equal(flight.claimFlightPlan(0), null);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /setClaimedFlight\(\{ id: Date\.now\(\), amount: got \}\)/);
});

/* T047 and T062: one press, a visible close, a wider hit area. */
test('T047 T062 the coin card has a close X, starts at once when seen before, and its big button takes edge taps', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /accessibilityLabel="Close">\n\s+<GameIcon name="close" size=\{34\} \/>/);
  assert.match(modal, /if \(!open \|\| !quickStart \|\| quickStarted\.current \|\| flowState !== 'preview'/);
  assert.match(modal, /hitSlop=\{MAIN_BUTTON_HIT_SLOP\}/);
  assert.match(read('src/components/RedeemModal.tsx'), /coinCardSeenNow\(player\?\.id, redeemable\?\.type \?\? '', coin\.id\)/);
});

/* T068: no toast behind the win card. */
test('T068 a win\'s Ride Parts banner folds (the card shows it) and server news waits until the challenge lets go', () => {
  const b = loadTs('src/api/broadcastFilter.ts');
  assert.deepEqual(plain(b.visibleBroadcasts(['You earned 1 Main Street U.S.A. Ride Parts!', 'Level up!'], true)), ['Level up!']);
  b.resetBroadcastHoldForTests();
  const shown = [];
  b.holdBroadcasts(true);
  b.routeBroadcasts(['Level up!'], m => shown.push(...m));
  assert.deepEqual(shown, [], 'held while the card is up');
  b.holdBroadcasts(false);
  assert.deepEqual(shown, ['Level up!'], 'shows once the card has closed');
  b.routeBroadcasts(['News'], m => shown.push(...m));
  assert.deepEqual(shown, ['Level up!', 'News']);
  assert.match(read('src/hooks/useAxiosSetup.ts'), /routeBroadcasts\(shown, messages => enqueueRef\.current\(messages\)\)/);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /flowState === 'minigame' \|\| flowState === 'postwin'/);
});
