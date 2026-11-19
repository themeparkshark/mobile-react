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

/* T046: an input lock that mashing keeps extending (hold-2: longer than a steady tapper's gap, see fix-w3-hold-2). */
test('T046 the result lock sleeps after the card appears and a tap during it restarts a quiet wait', () => {
  assert.equal(mash.RESULT_INPUT_LOCK_MS, 1200);
  assert.equal(mash.RESULT_QUIET_MS, 1500);
  assert.equal(mash.nextMashUnlock(1600, 1200), 2700, 'a tap at 1200 pushes the wake time to 1200 + 1500');
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
  assert.match(read('src/hooks/useAxiosSetup.ts'), /routeBroadcasts\(shown, messages => \{ const banners = takeLevelUps\(messages\); if \(banners\.length\) enqueueRef\.current\(banners\); \}\)/);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /flowState === 'minigame' \|\| flowState === 'postwin'/);
});

/* T033: a server-granted win always shows its win card. */
function memoryStorage() {
  const data = new Map();
  return { data, store: { __esModule: true, default: {
    getItem: async key => (data.has(key) ? data.get(key) : null), setItem: async (key, value) => { data.set(key, value); },
    removeItem: async key => { data.delete(key); }, getAllKeys: async () => [...data.keys()],
    multiGet: async keys => keys.map(key => [key, data.has(key) ? data.get(key) : null]),
  } } };
}
test('T033 a saved try the server says was won comes back as its win card; lost tries clear; a shown win never repeats', async () => {
  const { data, store } = memoryStorage();
  const statuses = { 501: 'won', 502: 'lost', 503: 'started' };
  const pending = loadTs('src/services/task-attempt/pendingWins.ts', {
    '@react-native-async-storage/async-storage': store,
    '../../api/endpoints/me/task-attempts': { getTaskAttempt: async id => ({ attempt: { id, status: statuses[id] } }) },
  });
  const cp = loadTs('src/services/task-attempt/checkpoint.ts', { '@react-native-async-storage/async-storage': store });
  const base = { version: 1, playerId: 96, requestId: 'tps-1234567890-abcdefgh', latitude: 33.81, longitude: -117.92, savedAt: Date.now() };
  await cp.writeTaskAttemptCheckpoint({ ...base, taskType: 'task', taskId: 11, attemptId: 501, card: { name: 'Walt Statue', coin_url: 'https://x/c.png', coins: 10 } });
  await cp.writeTaskAttemptCheckpoint({ ...base, taskType: 'task', taskId: 12, attemptId: 502, card: { name: 'Tiki Room' }, savedAt: base.savedAt + 1 });
  await cp.writeTaskAttemptCheckpoint({ ...base, taskType: 'task', taskId: 13, attemptId: 503, card: { name: 'Jungle Cruise' } });
  const found = await pending.findPendingWin(96);
  assert.equal(found.win.attempt.id, 501);
  assert.equal(found.win.checkpoint.card.name, 'Walt Statue');
  assert.equal(pending.pendingWinRedeemable(found.win).model.name, 'Walt Statue');
  assert.equal(data.has('task_attempt_checkpoint_v1_96_task_12'), false, 'a lost try is cleared quietly');
  assert.equal(data.has('task_attempt_checkpoint_v1_96_task_13'), true, 'a try still being played stays');
  pending.markWinShown(501);
  assert.equal((await pending.findPendingWin(96)).win, null, 'a win whose card showed never opens again');
  assert.equal(pending.pendingTryAction('expired'), 'clear');
  const delay = loadTs('src/services/task-attempt/reconcileDelay.ts');
  assert.deepEqual([0, 1, 2, 3, 9].map(delay.reconcileDelayMs), [2000, 4000, 8000, 15000, 15000]);
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /if \(!open \|\| flowState !== 'claim-error' \|\| proofRejected\)/, 'Checking your score asks again by itself');
  assert.match(modal, /card: \{ name: taskName, coin_url:/, 'the coin card rides in the checkpoint');
  assert.match(read('src/components/RedeemModal.tsx'), /void findPendingWin\(player\.id\)/);
});

/* T037, T065: a ride win plays as one coin moment. */
test('T037 T065 a ride win shows one short stamp (no buttons, no Share), then the one win card; the full reveal is for a first coin only', () => {
  const stamp = loadTs('src/gamekit/results/rideWinStampModel.ts');
  assert.equal(stamp.RIDE_WIN_HANDOFF_MS, 1600);
  assert.notEqual(stamp.RIDE_WIN_STAMP_TITLE, 'COIN CAUGHT!', 'never the win card\'s own title twice in a row');
  assert.equal(stamp.rideWinStars(0), 1);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const gameResults = rideLoss \|\| rideWin \|\| isEmptyResultsNode\(ownSurface\) \? null : ownSurface;/, 'no game results card (score, NEW BEST, ALBUM, Share) on a ride win');
  assert.match(shell, /\{rideWin \? <RideWinStamp stars=\{stars\}/);
  assert.doesNotMatch(read('src/gamekit/results/RideWinStamp.tsx'), /Pressable|TouchableOpacity|onPress/, 'the stamp has no button to mis-tap');
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.match(card, /\{visible && hasCoin && !caught && revealNow && <CoinCatchReveal/);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /fullReveal=\{firstCoinEver\}/);
});

/* T048: honest win card. */
test('T048 the win card shows the Parts and XP granted, and the next coin by a short name with its distance', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => false } });
  const labels = [...win.winRewardChips({ coins: 10, tickets: 1, parts: 4, energy: 40, xp: 25, coinLevelsOpen: true, dailyOpen: false })].map(c => c.label);
  assert.deepEqual(labels, ['Shark Coins', 'Ticket', 'Ride Parts', 'Energy', 'XP']);
  // Fix w4 T097: before coin levels open, Parts and Energy fly to the Shelf with no chip (one new idea per win).
  const early = [...win.winRewardChips({ coins: 10, tickets: 1, parts: 4, energy: 40, xp: 25, coinLevelsOpen: false, dailyOpen: false })].map(c => c.label);
  assert.deepEqual(early, ['Shark Coins', 'Ticket', 'XP']);
  assert.equal(win.shortCoinName("Adventureland Treehouse inspired by Walt Disney's Swiss Family Robinson"), 'Adventureland Treehouse');
  assert.equal(win.shortCoinName('Star Wars: Rise of the Resistance'), 'Star Wars');
  assert.equal(win.nextCoinButton({ taskId: 9, name: "Adventureland Treehouse inspired by Walt Disney's Swiss Family Robinson", meters: 85, reason: 'nearest_open' }, 4).detail,
    'Adventureland Treehouse, 85 m');
});

/* T143: the coin flies to the Shelf. */
test('T143 on NEXT COIN the won coin arcs to the Shelf button', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => false } });
  assert.deepEqual([...win.WIN_FLY_ROUTES.coinToShelf], ['energy']);
  assert.match(read('src/components/PostWinRewardsModal.tsx'), /triggerFly\(\{ imageUrl: taskCoinUrl, amount: 1, startX: x, startY: SH \* 0\.3, targetPosition: shelf \}\)/);
});

/* T067 and T069. */
test('T067 the boss sheet names the Energy cost once (the FIGHT! pill); the line under it says what is left', () => {
  const join = loadTs('src/components/boss/joinModel.ts', {}, {});
  assert.equal(join.afterWords({ energyAfter: 110 }), "You'll have 110 Energy left");
  const card = read('src/components/boss/BossJoinCard.tsx');
  assert.match(card, /maxFontSizeMultiplier=\{1\.3\}>\{afterWords\(cost\)\}<\/Text>/);
});
test('T069 the unlock picture answers a tap with what it unlocks', () => {
  assert.match(read('src/gamekit/results/UnlockTile.tsx'), /\{told && detail \? <Text style=\{styles\.caption\} numberOfLines=\{2\}>\{detail\}<\/Text>/);
  assert.match(read('src/games/sharky/hud/SharkyUnlock.tsx'), /'SEA TREASURES': 'Sea Treasures now float in your swims\. Grab them!'/);
});

test('a tap beside the card while PLAY! spends the Ticket never closes it (the game would start with no card)', () => {
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /if \(flowStateRef\.current === 'preview' && !spendingRef\.current\) \{\n\s+close\(\);/);
});

test('T054 a tie on the win card says why the other flag stays and what takes it', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => false } });
  const name = t => `Team ${t}`;
  assert.equal(win.teamSentence({ team: 'shark', ride_name: 'Tiki Room', flipped: false, controller: 'mouse', scores: { mouse: 15, shark: 15 } }, name),
    'Tied! Win again or earn Parts to take it.');
  assert.equal(win.teamSentence({ team: 'shark', ride_name: 'Tiki Room', flipped: false, controller: 'mouse', scores: { mouse: 30, shark: 15 } }, name),
    'Your win helps Team shark at Tiki Room');
});
