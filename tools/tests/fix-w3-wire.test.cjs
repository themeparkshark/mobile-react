/**
 * Fix round w3, cross-lane wiring (Nov 18 2026): the pieces lanes built for each other's screens are mounted.
 * T220 / T230 calm offers at their four placements, T124 the ride line on the win card.
 * Each test fails on the merged build before the wiring (7b48055a): the slots rendered nothing there.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const strip = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const offers = loadTs('src/services/money/naturalOffers.ts', {
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } },
});

test('T220 need_ticket: the NEED A TICKET card mounts the calm offer, and never right after a lost try', () => {
  const slots = strip(read('src/components/rewards/offerSlots.tsx'));
  assert.match(slots, /export function NeedTicketOfferSlot\(\{ loss = false \}: OfferSlotProps\)[^{]*\{\s*return <CalmOffer placement="need_ticket" loss=\{loss\}/);
  const modal = strip(read('src/components/RedeemRedeemableModal.tsx'));
  assert.match(modal, /<NeedTicketOfferSlot placement="need_ticket" taskId=\{taskId\} closeCard=\{close\} loss=\{cardAfterLoss\} \/>/);
  // The loss card's way on at 0 Tickets (backToCard) is a loss moment; a fresh open of the card is not.
  const back = modal.slice(modal.indexOf('const backToCard = useCallback'), modal.indexOf("setFlowState('preview');", modal.indexOf('const backToCard = useCallback')));
  assert.match(back, /setCardAfterLoss\(true\);/);
  const reset = modal.slice(modal.indexOf('setLostTicketCost(0);'), modal.indexOf('setRetryOffered(true);'));
  assert.match(reset, /setCardAfterLoss\(false\);/);
});

test('T220 first_win and T230 win_vip: one offer at most on a win card, mounted only once the card is up', () => {
  const card = strip(read('src/components/PostWinRewardsModal.tsx'));
  assert.match(card, /\{visible && caught && panel === 'win' && <WinOfferSlot firstWin=\{revealNow && isNewCoin\} coins=\{coinsEarned\} xp=\{xpEarned\}\s*winKey=\{attemptId \?\? null\} closeCard=\{closeCard\} \/>\}/);
  assert.doesNotMatch(card, /FirstWinOfferSlot/, 'the old empty slot is gone');
  const slots = strip(read('src/components/rewards/offerSlots.tsx'));
  // The Starter card decides first; the VIP line waits for its "not shown" and the win-card pacing.
  assert.match(slots, /useState<boolean \| null>\(firstWin \? null : false\)/);
  assert.match(slots, /const vipLine = starterShown === false && nudge && !!line;/);
  assert.match(slots, /\{firstWin && <CalmOffer placement="first_win" onShown=\{setStarterShown\} \/>\}/);
  assert.match(slots, /<CalmOffer placement="win_vip" vipLine=\{line\} beforeLeave=\{closeCard\}/);
  assert.match(slots, /const nudge = useVipNudge\(!isVip && winKey != null \? winKey : null\);/);
  assert.match(slots, /if \(shown\) markVipNudgeShown\(winKey\);/);
  assert.match(slots, /warmVipPerks\(\)/, 'the server multiplier is loaded, or the line never has numbers');
});

test('T230 the VIP line says this win\'s own numbers, and nothing for VIP or an empty win', () => {
  const slots = loadTs('src/components/rewards/offerSlots.tsx', {
    react: { useContext: () => ({}), useEffect() {}, useState: v => [v, () => undefined] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    'react-native': { View: 'View' },
    '../money/CalmOffer': { default: 'CalmOffer' },
    '../../context/AuthProvider': { AuthContext: {} },
    '../../services/money/vipNudge': { useVipNudge: () => false, markVipNudgeShown() {} },
    '../../services/money/vipPerks': { vipRideMultiplierNow: () => null, warmVipPerks: async () => undefined },
    '../../services/money/offers': loadTs('src/services/money/offers.ts', {}),
  });
  assert.equal(slots.winVipLine({ coins: 60, xp: 50, multiplier: 2, isVip: false }), 'VIP doubles this: +60 Shark Coins, +50 XP');
  assert.equal(slots.winVipLine({ coins: 60, xp: 50, multiplier: 2, isVip: true }), null);
  assert.equal(slots.winVipLine({ coins: 0, xp: 0, multiplier: 2, isVip: false }), null);
  assert.equal(slots.winVipLine({ coins: 60, xp: 50, multiplier: null, isVip: false }), null, 'no server multiplier, no claim');
});

test('T230 CalmOffer: a win_vip line with nothing to say stays away; the door closes its sheet first', () => {
  const card = strip(read('src/components/money/CalmOffer.tsx'));
  assert.match(card, /const vipText = vipLine === undefined \? OFFER_COPY\.win_vip\.line : vipLine;/);
  assert.match(card, /placement === 'win_vip' \? !vip && !!vipText/);
  assert.match(card, /if \(placement === 'win_vip'\) \{ beforeLeave\?\.\(\); void openMembership\(\); return; \}/);
  assert.match(card, /if \(placement === 'high_point'\) \{ beforeLeave\?\.\(\); RootNavigation\.navigate\('SharkPass'\); return; \}/);
  // The card itself never names a price (the gate on the buy does).
  assert.doesNotMatch(card, /\.price\b|prices\[/);
});

test('T220 high_point: the Shark Pass card on the Daily 3 sheet once the chest is open, only while the row is for sale', () => {
  const sheet = strip(read('src/components/retention/Daily3Sheet.tsx'));
  assert.match(sheet, /\{state\.claimed && <CalmOffer placement="high_point" style=\{styles\.offer\} beforeLeave=\{onLeaveSheet\} \/>\}/);
  assert.match(strip(read('src/components/retention/useRetention.tsx')), /onLeaveSheet=\{\(\) => setView\(null\)\}/);
  assert.equal(offers.passOfferReady({ enabled: true, season: { on_sale: true, product_id: 'pass.s1' }, progress: { premium: false } }), true);
  assert.equal(offers.passOfferReady({ enabled: true, season: { on_sale: true, product_id: 'pass.s1' }, progress: { premium: true } }), false, 'owned');
  assert.equal(offers.passOfferReady({ enabled: true, season: { on_sale: false, product_id: 'pass.s1' } }), false, 'not on sale yet');
  assert.equal(offers.passOfferReady({ enabled: true, season: null }), false);
  assert.equal(offers.passOfferReady({ enabled: false }), false);
  assert.equal(offers.passOfferReady(null), false);
  const card = strip(read('src/components/money/CalmOffer.tsx'));
  assert.match(card, /placement === 'high_point' \? passOn && passReady === true/);
});

test('T220: a buy from an offer inside a native sheet can show its grown-up gate (a slot inside each sheet)', () => {
  const modal = strip(read('src/components/RedeemRedeemableModal.tsx'));
  assert.match(modal, /\{open === true && <GrownUpGateSlot \/>\}\s*<\/CalmModal>/);
  const retention = strip(read('src/components/retention/useRetention.tsx'));
  assert.match(retention, /\{!!content && <GrownUpGateSlot \/>\}\s*<\/CalmModal>/);
});

test('T124: the ride line sits under the won coin name on the win card, with the coin\'s park', () => {
  const card = strip(read('src/components/PostWinRewardsModal.tsx'));
  assert.match(card, /\{hasCoin && <RideFactLine rideName=\{rideName\} parkId=\{parkId\} onDark style=\{styles\.rideFact\} \/>\}/);
  const title = card.indexOf('style={styles.heroTitle}');
  assert.ok(title > 0 && card.indexOf('<RideFactLine') > title, 'under the name');
  assert.match(strip(read('src/components/RedeemRedeemableModal.tsx')), /rideName=\{taskName\}\s*parkId=\{park\?\.id \?\? null\}/);
});

test('T158: the Just once sticker sits on both Shark Shop doors (Home menu row, Profile badge), nowhere in a reward', () => {
  const menu = strip(read('src/components/QuickAccessMenu.tsx'));
  assert.match(menu, /\{item\.id === 'shop' && <StarterSticker style=\{\{ top: -6, right: -10 \}\} \/>\}/);
  const profile = strip(read('src/screens/ProfileScreen.tsx'));
  const shop = profile.slice(profile.indexOf("key: 'shark-shop'"), profile.indexOf('as ProfileShortcut]'));
  assert.match(shop, /sticker: <StarterSticker style=\{\{ top: -6, right: -26 \}\} \/>/);
  assert.match(strip(read('src/components/profile/ProfileShortcuts.tsx')), /\{!item\.locked && item\.sticker\}/);
  assert.doesNotMatch(read('src/components/PostWinRewardsModal.tsx'), /StarterSticker/, 'a door, never inside a reward');
});

test('T232: when TRY AGAIN deals the other game, the loss card names it instead of "same game"', () => {
  const lost = loadTs('src/components/rewards/lostTryCard.ts');
  const base = { usedRescuePass: false, rescueRetryAvailable: false, firstCoinTicketReturned: true, lostTicketCost: 0, sameGame: true };
  assert.equal(lost.lostTryCopy(base).message, 'Your Ticket came back. Same game, try again!');
  assert.equal(lost.lostTryCopy({ ...base, nextGame: 'Whack-a-Shark' }).message, 'Your Ticket came back. New game: Whack-a-Shark!');
  assert.equal(lost.lostTryCopy({ ...base, firstCoinTicketReturned: false, usedRescuePass: true, rescueRetryAvailable: true, nextGame: 'Memory Match' }).message,
    'No Ticket used. One more free go! New game: Memory Match!');
  // No retry left: nothing to promise.
  assert.equal(lost.lostTryCopy({ ...base, firstCoinTicketReturned: false, lostTicketCost: 1, nextGame: 'Memory Match' }).message, '1 Ticket used.');
  assert.equal(lost.retryingLine('Whack-a-Shark'), 'Checking your Ticket and starting Whack-a-Shark.');
  assert.equal(lost.retryingLine(null), 'Checking your Ticket and starting the same game again.');
  const modal = strip(read('src/components/RedeemRedeemableModal.tsx'));
  assert.match(modal, /export function retryGameNameFor\(attempt[^)]*\): string \| null \{\s*const next = attempt\?\.retry_game;\s*if \(!next \|\| next === attempt\?\.game\) return null;/);
  assert.match(modal, /const retryGameName = retryGameNameFor\(attemptRef\.current\);/);
  assert.match(modal, /message=\{retryingLine\(retryGameName\)\}/);
});

test('T196 T197 T199: Beat the Buzzer on a coin plays the server\'s dealt round as dealt, bundled only without one', () => {
  const trivia = loadTs('src/services/task-attempt/coinTrivia.ts', {
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } },
    '../../api/endpoints/lineplay/trivia': { default: async () => null },
  });
  const row = (id, extra = {}) => ({ id, park_id: 8, ride_id: 65, question: `Question ${id}?`, choices: ['A', 'B', 'C', 'D'],
    correct_index: 1, difficulty: 'easy', deck: 'classic', fact: null, source: 'Disneyland', park_name: 'Disneyland', ...extra });
  const round = trivia.dealtTriviaRound({ source: 'bank', questions: [row('sw-3'), row('sw-1'), row('sw-2'), row('sw-9')] });
  assert.deepEqual([...round.ids], ['sw-3', 'sw-1', 'sw-2'], 'the dealt order, first three');
  assert.equal(round.pool[0].parkId, 8);
  assert.equal(trivia.dealtTriviaRound(null), null, 'an older server: the bundled pool plays');
  assert.equal(trivia.dealtTriviaRound({ questions: [row('a'), row('b')] }), null, 'too few to play a round');
  assert.equal(trivia.dealtTriviaRound({ questions: [row('a'), row('b'), row('c', { choices: ['x'] })] }), null, 'a broken row never plays');
  assert.equal(trivia.triviaCrewFor({ kind: 'family', players: [] }, true), 'family', 'Family with kids: the kids deck');
  assert.equal(trivia.triviaCrewFor({ kind: 'family', players: [] }, false), null, 'a grown-up family: the grown-up deck');
  assert.equal(trivia.triviaCrewFor({ kind: 'friends', players: [] }, false), 'friends');
  assert.equal(trivia.triviaCrewFor(null, false), null);

  const recovery = loadTs('src/services/task-attempt/recovery.ts', {
    '../../api/endpoints/me/task-attempts': {}, './checkpoint': {},
  });
  assert.deepEqual(JSON.parse(JSON.stringify(recovery.startExtras({}))), [], 'a plain start sends the old request');
  assert.deepEqual(JSON.parse(JSON.stringify(recovery.startExtras({ crew: 'family' }))), [{ crew: 'family' }]);
  assert.match(strip(read('src/api/endpoints/me/task-attempts.ts')), /\.\.\.\(extras\?\.crew \? \{ crew: extras\.crew \} : \{\}\),/);

  const duel = strip(read('src/games/trivia-duel/TriviaDuel.tsx'));
  assert.match(duel, /if \(!p && mode === 'ride' && props\.dealtIds\?\.length\) p = planFromIds\('ride', seed, props\.dealtIds, poolRef\.current, rank, !!mem\.relaxed\);/);
  assert.match(duel, /if \(props\.pool\) poolRef\.current = props\.pool;/, 'a new dealt round replaces a pool loaded earlier');
  const selector = strip(read('src/components/MiniGameSelector.tsx'));
  assert.match(selector, /pool=\{dealtRound\?\.pool\}\s*dealtIds=\{dealtRound\?\.ids\}/);
  const modal = strip(read('src/components/RedeemRedeemableModal.tsx'));
  assert.match(modal, /triviaDeal=\{attemptRef\.current\?\.trivia \?\? null\}/);
  assert.match(modal, /\.\.\.\(crew \? \{ crew \} : \{\}\),/);
});

test('T196: the dealt questions really plan as the ride round, in order', () => {
  const engine = loadTs('src/games/trivia-duel/engine/match.ts');
  const pool = ['sw-3', 'sw-1', 'sw-2'].map((id, i) => ({ id, parkId: 8, rideId: 65, question: `Which year is question ${i}?`,
    choices: ['1955', '1966', '1971', '1983'], correctIndex: 1, difficulty: 'easy' }));
  const plan = engine.planFromIds('ride', 1234, ['sw-3', 'sw-1', 'sw-2'], pool, 'firstmate', false);
  assert.ok(plan, 'planned');
  assert.deepEqual([...plan.rounds.map(r => r.question.id)], ['sw-3', 'sw-1', 'sw-2']);
});
