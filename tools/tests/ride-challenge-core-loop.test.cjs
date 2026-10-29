'use strict';
/**
 * Ride challenge, core loop wave (blueprint 5.3, 5.13 and the must-fix ledger):
 * PLAY! to the win card as one clear, kind path that never freezes, never
 * dead-ends at 0 Tickets, never deals trivia to a child who cannot read,
 * keeps VIP perks without upselling anyone, and ends by pointing at the next
 * coin. Traps first: the PLAY RIDE freeze (must-fix 1) and the team welcome
 * dead end (must-fix 2).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const memoryStore = () => {
  const data = new Map();
  return {
    data,
    getItem: async key => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => { data.set(key, String(value)); },
    removeItem: async key => { data.delete(key); },
  };
};

/** A tiny hook renderer for the modal layer hooks (same idea as map-attention.test.cjs). */
function layerHarness() {
  let slots = [];
  let index = 0, dirty = false, pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createContext: value => ({ value }),
    useContext: () => false,
    useState(init) {
      const own = slots, i = index++;
      if (!own[i]) own[i] = { value: typeof init === 'function' ? init() : init };
      return [own[i].value, update => {
        const value = typeof update === 'function' ? update(own[i].value) : update;
        if (!Object.is(value, own[i].value)) { own[i].value = value; dirty = true; }
      }];
    },
    useRef(init) { const i = index++; if (!slots[i]) slots[i] = { current: init }; return slots[i]; },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) {
      const own = slots, i = index++;
      const prev = own[i];
      if (prev && deps && same(prev.deps, deps)) return;
      own[i] = { deps, effect: true, cleanup: prev?.cleanup };
      pending.push(() => { prev?.cleanup?.(); own[i].cleanup = fn(); });
    },
    useSyncExternalStore(subscribe, get) {
      const i = index++;
      if (!slots[i]) slots[i] = { unsubscribe: subscribe(() => { dirty = true; }) };
      return get();
    },
  };
  const timers = [];
  const M = loadTs('src/ui/modalLayers.ts', { react }, {
    setTimeout: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.live = false; },
  });
  function mount(hook) {
    const own = [];
    let out;
    const render = () => {
      for (let guard = 0; guard < 20; guard += 1) {
        slots = own; dirty = false; index = 0; pending = [];
        out = hook();
        const run = pending; pending = [];
        run.forEach(effect => effect());
        if (!dirty) return out;
      }
      throw new Error('render loop');
    };
    render();
    return { get value() { return out; }, render };
  }
  return { M, mount };
}

/* ---------- Trap 1: the PLAY RIDE freeze (must-fix 1) ---------- */

test('the challenge card and the win card both join the native modal layers and free them only on native dismiss', () => {
  const challenge = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(challenge, /useNativeModalLayer\(open === true && flowState !== 'postwin' && !!redeemable, 'wait'\)/);
  assert.match(challenge, /isVisible=\{challengeLayer\.present\}/);
  assert.match(challenge, /onModalHide=\{\(\) => \{ setChallengeModalHidden\(true\); challengeLayer\.onDismissed\(\); \}\}/);
  assert.doesNotMatch(challenge, /isVisible=\{showModal\}/, 'never a bare visible flag that ignores the layers');
  const win = read('src/components/PostWinRewardsModal.tsx');
  assert.match(win, /useNativeModalLayer\(visible, 'wait'\)/);
  assert.match(win, /isVisible=\{layer\.present\}/);
  assert.match(win, /onModalHide=\{\(\) => \{\n\s+layer\.onDismissed\(\);/);
});

test('PLAY! after a swipe-closed sheet: the card waits, opens, wins, and the win card waits for it, 20 out of 20', () => {
  const h = layerHarness();
  h.M.modalLayers.reset();
  let sheet = false, card = false, win = false;
  const sheetLayer = h.mount(() => h.M.useNativeModalLayer(sheet, 'show'));
  const cardLayer = h.mount(() => h.M.useNativeModalLayer(card, 'wait'));
  const winLayer = h.mount(() => h.M.useNativeModalLayer(win, 'wait'));
  const all = () => { sheetLayer.render(); cardLayer.render(); winLayer.render(); };
  for (let run = 0; run < 20; run += 1) {
    sheet = true; all();
    sheet = false; all();                          // swiped closed; UIKit still dismissing
    for (let tap = 0; tap < 4; tap += 1) { card = true; all(); }
    assert.equal(cardLayer.value.present, false, `run ${run}: never into a half-dismissed sheet`);
    sheetLayer.value.onDismissed(); all();
    assert.equal(cardLayer.value.present, true, `run ${run}: the challenge card opens`);
    // A win: the card hides, the win card wants to show but waits for UIKit to finish the card.
    card = false; win = true; all();
    assert.equal(winLayer.value.present, false, `run ${run}: the win card never presents into the closing card`);
    cardLayer.value.onDismissed(); all();
    assert.equal(winLayer.value.present, true, `run ${run}: the win card opens`);
    win = false; all();
    winLayer.value.onDismissed(); all();
    assert.equal(h.M.modalLayers.count(), 0, `run ${run}: nothing left behind to swallow taps`);
  }
});

/* ---------- Trap 2: the team welcome dead end (must-fix 2) ---------- */

const teamOffer = () => loadTs('src/components/rewards/teamOffer.ts', {
  '@react-native-async-storage/async-storage': { default: memoryStore(), __esModule: true },
});

test('LET\'S GO always takes the player somewhere: back, home, or on to the shelf', () => {
  const { teamExit } = teamOffer();
  // From Profile (with its refresh callback): back to Profile, the old dead end.
  assert.deepEqual({ ...teamExit({ onTeamSelected: () => undefined }, true) }, { kind: 'back' });
  assert.deepEqual({ ...teamExit({}, true) }, { kind: 'back' });
  assert.deepEqual({ ...teamExit({ isOnboarding: true }, true) }, { kind: 'reset' });
  assert.deepEqual({ ...teamExit(undefined, false) }, { kind: 'reset' }, 'nowhere to go back to: home');
  const next = teamExit({ firstCoin: true, next: { name: 'Park', params: { park: 8 } } }, true);
  assert.equal(next.kind, 'next');
  assert.equal(next.name, 'Park');
});

test('the team screen runs the callback and then always leaves; the first-coin step has a Later button', () => {
  const screen = read('src/screens/GymBattle/TeamSelectionScreen.tsx');
  const finish = screen.slice(screen.indexOf('const finish = () => {'), screen.indexOf('const firstCoin ='));
  assert.match(finish, /onTeamSelected\?\.\(\)/);
  assert.match(finish, /leave\(\);/, 'the callback never replaces the way out');
  assert.doesNotMatch(finish, /else navigation\?\.goBack/, 'no if/else that skips leaving');
  assert.match(screen, /onPress=\{leave\} accessibilityRole="button" accessibilityLabel="Close"/);
  assert.match(screen, /\{firstCoin && \(/);
  assert.match(screen, />LATER</);
  assert.doesNotMatch(screen, /bosses/i, 'no promise of a switched-off feature');
});

/* ---------- PLAY! and the challenge card (blueprint 4.1, 4.5, 5.2, 5.3) ---------- */

const copy = loadTs('src/components/rewards/challengeCopy.ts');

test('PLAY! is the one action word, with the coin and place under it, and press feedback at once', () => {
  const redeem = read('src/components/RedeemModal.tsx');
  assert.match(redeem, /redeemable\.type === 'task' \? 'PLAY!'/);
  assert.doesNotMatch(redeem, /'Play Ride!'/);
  assert.match(redeem, /<Image source=\{\{ uri: coin\.coin_url \}\} style=\{styles\.captionCoin\}/, 'the coin picture rides with the place name');
  // Inside 100 ms: a haptic and a squash on the native driver, before the card has its turn.
  assert.match(redeem, /onPress=\{async \(\) => \{\n\s+pressNow\(\);/);
  assert.match(redeem, /Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Medium\)/);
  assert.match(redeem, /press\.setValue\(0\.9\);\n\s+Animated\.spring\(press, \{[^}]*useNativeDriver: true \}\)/);
  // Secret coins arrive with coin levels (rung 3).
  assert.match(redeem, /const secretLocked = redeemable\?\.type === 'secret_task' && !coinLevels\.open;/);
});

test('out of Tickets PLAY! never vanishes: today\'s free try wears a gift, a held extra try a ticket-gift', () => {
  const base = { tickets: 0, ticketCost: 1, rescueAvailable: true, rescueSource: 'daily' };
  assert.equal(copy.playBadge(base), 'free_try');
  assert.equal(copy.playBadge({ ...base, rescueSource: 'held' }), 'extra_try');
  assert.equal(copy.playBadge({ ...base, rescueSource: 'held_retry' }), 'extra_try');
  assert.equal(copy.playBadge({ ...base, tickets: 1 }), null, 'a Ticket in hand: no badge');
  assert.equal(copy.playBadge({ ...base, rescueAvailable: false }), null);
  assert.equal(copy.playBadge({ ...base, claimable: 5 }), null, 'earned Tickets wait: the card claims them first, so no gift yet');
  const play = read('src/components/RedeemModal.tsx');
  assert.match(play, /claimable: short && claimWaiting\?\.tickets !== ticketsNow \? 1 : claimWaiting\?\.count \?\? 0/,
    'no gift until the Stamp Book lookup answers, so PLAY! and the card always agree');
  const redeem = read('src/components/RedeemModal.tsx');
  // The pill shows for an open ride whatever the Ticket count (no ticket check hides it).
  assert.match(redeem, /const available = !otherSelected && !secretLocked && nearbyOpportunityOpen\(redeemable, liveStatus\);/);
  assert.doesNotMatch(redeem, /tickets\s*(>|>=|<=|<)\s*\d.*available/);
});

test('the challenge card: "Win the X coin", the how-it-works picture strip in its header, Shark Coins until rung 3', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /<Ribbon text=\{isTaskType \? title : 'Congratulations'\} \/>/);
  assert.match(modal, /const title = challengeTitle\(taskType, taskName\);/);
  assert.match(modal, /style=\{styles\.howStrip\} accessible\n\s+accessibilityLabel="One Ticket buys one game\. Win the game to win this coin\."/);
  assert.match(modal, /howStrip: \{[^}]*height: 40/, 'a fixed height: the button never moves');
  assert.doesNotMatch(modal, /OneTimeTip id="ride_challenge"/, 'no tip that pushes the button down');
  assert.match(modal, /show: rideRewardTask\.coins > 0 \}/);
  // From rung 3 a coin on the shelf shows its Parts ring; one not won yet shows the Parts its first win brings.
  assert.match(modal, /'RIDE PARTS'[^\n]*\n\s+show: coinLevelsOpen && !cardParts \}/);
  // A ride's Energy is spent on the coin card and never promised here; a secret coin's first win after rung 3 brings
  // +2 Parts and +15 Energy (blueprint 5.13), so only a secret coin shows the Energy tile.
  assert.match(modal, /\{ label: 'ENERGY', amount: rideRewardTask\.energy_reward \?\? 15, icon: 'energy' as const,\n\s+show: coinLevelsOpen && !cardParts && taskType === 'secret_task' \}/);
  assert.equal((modal.match(/label: 'ENERGY'/g) ?? []).length, 1);
  assert.match(modal, /const cardParts = cardCoin && coinLevelsOpen \? partsProgress\(cardCoin, player\?\.energy \?\? null, 0\) : null;/);
  assert.match(modal, /\{!needTicket && cardParts && !cardParts\.maxed && <View style=\{styles\.partsLine\}/);
  assert.match(modal, /times_completed \?\? 0\) > 0 \? \(redeemable\.model as TaskType\)\.asset_id/, 'the ring only for a coin already won');
  assert.match(modal, /'XP'[^\n]*show: dailyOpen \}/);
  assert.doesNotMatch(modal, /Rescue Pass|RESCUE PASS|Spend \$\{ticketCost\} Ticket/);
});

test('out of Tickets the card offers the free ways in one order, and the grown-up shop comes last', () => {
  const wallet = { tickets: 0, ticketCost: 1, claimable: [], rescueAvailable: true, rescueSource: 'daily', heldPasses: 0, queueTicketsOn: false };
  const stamps = copy.stampClaimSources([
    { id: 9, is_earned: true, reward_claimed: false, rewards: { tickets: 5 } },
    { id: 10, is_earned: true, reward_claimed: true, rewards: { tickets: 5 } },
    { id: 11, is_earned: false, reward_claimed: false, rewards: { tickets: 3 } },
    { id: 12, is_earned: true, reward_claimed: false, rewards: { tickets: 0 } },
  ]);
  assert.deepEqual(stamps.map(s => s.id), [9], 'only earned, unclaimed stamps that pay Tickets');
  const order = steps => [...steps].map(s => s.kind);
  assert.deepEqual(order(copy.challengeFreeSteps({ ...wallet, claimable: stamps })), ['claim', 'free_try', 'treats']);
  assert.deepEqual(order(copy.challengeFreeSteps({ ...wallet, rescueSource: 'held', heldPasses: 2, queueTicketsOn: true })),
    ['extra_try', 'line_ticket', 'treats']);
  assert.equal(copy.challengeNextStep({ ...wallet, claimable: stamps }).kind, 'claim', 'claim earned Tickets before the free try');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /if \(freeStep\?\.kind === 'claim'\) \{ void handleClaimTickets\(\); return; \}/);
  assert.match(modal, /await claimStampReward\(source\.id\)/, 'claimed right here, in place');
  const card = modal.slice(modal.indexOf('{needTicket && <View style={styles.ticketHelpCard}>'), modal.indexOf('{startError && <Text style={styles.ticketError}>'));
  const shop = card.indexOf('onPress={openSupplies}');
  assert.ok(shop > 0 && card.indexOf('treats at home = 1 Ticket') < shop, 'the shop sits under every free way');
  assert.doesNotMatch(card, /<CoinTopUpOffer|\$\d/, 'no price inside the card: one small row to Supplies, where the grown-up gate is');
  assert.doesNotMatch(card, /name=\{step\.kind === 'line_ticket' \? 'queue'/, 'the pocket watch means Wait Times only');
  assert.match(modal, /\{!needTicket && <View style=\{\{ marginLeft: -4/, 'the help card takes the reward tiles\' room so the card fits an SE');
  assert.match(card, /step\.kind === 'line_ticket'/, 'the line Ticket only when Queue Tickets is on (freeTickets contract)');
  assert.doesNotMatch(card, /LinePlay while you wait|home finds/i);
});

test('the Ticket Punch says "This ride\'s game" and never names Rhythm Tap or Snap the Ride', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  const games = modal.slice(modal.indexOf('export const CHALLENGE_GAMES = ['), modal.indexOf('const GAMES = CHALLENGE_GAMES;'));
  assert.deepEqual([...games.matchAll(/id: '(\w+)'/g)].map(m => m[1]), ['tap', 'memory', 'trivia']);
  assert.doesNotMatch(games, /RHYTHM|SNAP|Rhythm Tap|Snap the Ride/i);
  assert.match(games, /'Beat the Buzzer'/);
  assert.equal(copy.punchLines('The Sword in the Stone').win, 'Win the Sword in the Stone coin!');
  const punch = read('src/components/TicketPunch.tsx');
  assert.match(punch, /kicker = "THIS RIDE'S GAME"/);
  assert.doesNotMatch(punch, /YOUR CHALLENGE|Win to catch the \{rideName\}/);
  const selector = read('src/components/MiniGameSelector.tsx');
  assert.doesNotMatch(selector, /SnapTheRide/);
  assert.match(selector, /if \(selectedGame === 'photo'\) return null;/);
});

test('TRY AGAIN sends retry_of (the same game) and every paid try sends picture_only when it is on', async () => {
  const sent = [];
  const api = loadTs('src/api/endpoints/me/task-attempts.ts', {
    '../../client': { __esModule: true, default: { post: async (url, body) => { sent.push(body); return { data: { data: { attempt: { id: 2 } } } }; } } },
    '../../../screens/LeaderboardsScreen/standingsCache': { markStandingsStale() {}, parkWinNote() {} },
    '../../../screens/LeaderboardsScreen/standingsV2Model': { winNote: () => null },
    '../../../utils/toast': { showToast() {} },
  });
  await api.startTaskAttempt('tps-req-0000000000000001', 'task', 91, 33.8, -117.9);
  await api.startTaskAttempt('tps-req-0000000000000002', 'task', 91, 33.8, -117.9, { retry_of: 77, picture_only: true });
  assert.equal('retry_of' in sent[0] || 'picture_only' in sent[0], false, 'a plain start is exactly the old request');
  assert.equal(sent[1].retry_of, 77);
  assert.equal(sent[1].picture_only, 1);
  const recovery = loadTs('src/services/task-attempt/recovery.ts', {
    '../../api/endpoints/me/task-attempts': {}, './checkpoint': {},
  });
  assert.deepEqual([...recovery.startExtras({})], []);
  assert.deepEqual(JSON.parse(JSON.stringify(recovery.startExtras({ retryOf: 77, pictureOnly: true }))), [{ retry_of: 77, picture_only: true }]);
  assert.deepEqual([...recovery.startExtras({ retryOf: -1, pictureOnly: false })], []);
  const cp = loadTs('src/services/task-attempt/checkpoint.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: memoryStore() } });
  const saved = { version: 1, playerId: 7, taskType: 'task', taskId: 91, requestId: 'tps-paid-attempt-0001', attemptId: null,
    latitude: 33.8, longitude: -117.9, savedAt: Date.now(), retryOf: 77, pictureOnly: true };
  const back = cp.parseTaskAttemptCheckpoint(JSON.stringify(saved), 7, 'task', 91);
  assert.equal(back.retryOf, 77, 'a relaunch replays the same game request');
  assert.equal(back.pictureOnly, true);
  assert.equal(cp.parseTaskAttemptCheckpoint(JSON.stringify({ ...saved, retryOf: 'x' }), 7, 'task', 91).retryOf, undefined,
    'a broken extra is dropped, never the paid request');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /retryOfRef\.current = attemptRef\.current\?\.id \?\? retryOfRef\.current;/);
  assert.match(modal, /await pictureOnlyFor\(player\.id\)/);
});

/* ---------- Picture games only (blueprint 5.1 Settings, 5.3 Trivia, must-fix 33) ---------- */

test('picture games only: per player, sent only while the server deals picture games', async () => {
  const store = memoryStore();
  let flags = { picture_games: true, retention_push: false, queue_tickets: false };
  const prefs = loadTs('src/services/playPrefs.ts', {
    react: { useCallback: f => f, useEffect() {}, useSyncExternalStore: (_s, get) => get() },
    '@react-native-async-storage/async-storage': { __esModule: true, default: store },
    '../api/endpoints/platform/feature-flags': { __esModule: true, default: async () => ({ flags }) },
  });
  assert.equal(prefs.playPrefsKey(7), 'tps.playPrefs.v1@p7');
  assert.equal(prefs.pictureOnlyRequest({ pictureGames: true }, { pictureOnly: true }), true);
  assert.equal(prefs.pictureOnlyRequest({ pictureGames: false }, { pictureOnly: true }), false, 'an old server: never sent');
  assert.equal(prefs.pictureOnlyRequest({ pictureGames: true }, { pictureOnly: false }), false);
  assert.equal(await prefs.pictureOnlyFor(7), false);
  await prefs.setPlayPrefs(7, { pictureOnly: true });
  assert.equal(await prefs.pictureOnlyFor(7), true);
  assert.equal(await prefs.pictureOnlyFor(8), false, 'a second shark on the family phone keeps its own choice');
  assert.equal(store.data.get('tps.playPrefs.v1@p7'), '{"pictureOnly":true}');
  assert.deepEqual({ ...prefs.parsePlayPrefs('not json') }, { pictureOnly: false });
  prefs.resetPlayPrefsForTests();
  flags = {};
  assert.deepEqual({ ...(await prefs.loadPlayFlags()) }, { pictureGames: false, pushWorks: false, queueTickets: false }, 'absent reads as off');
});

test('Settings shows Picture games only while the server deals them, and hides Favorites Alerts while push does not work', () => {
  const settings = read('src/screens/SettingsScreen.tsx');
  assert.match(settings, /const play = usePlayPrefs\(player\?\.id \?\? null\);/);
  assert.match(settings, /\{play\.available && <SettingsRow\n\s+art="shark"\n\s+title="Picture games only"/);
  assert.match(settings, /\{play\.flags\.pushWorks && <SettingsRow/);
  // A row that toggles by itself shows its switch as a picture: a tap on the switch reached both and flipped twice.
  assert.match(settings, /<BrandSwitch label="Picture games only" value=\{play\.prefs\.pictureOnly\} rowToggles/);
  assert.match(settings, /<BrandSwitch label="Battery saver" value=\{batterySaver\} rowToggles/);
  assert.match(settings, /if \(rowToggles\) \{\n\s+return \(\n\s+<View pointerEvents="none"/);
  const intro = read('src/components/help/GameIntroCard.tsx');
  assert.match(intro, /const offerPictures = kind === 'trivia' && play\.available;/);
  assert.match(intro, /Can't read yet\?/);
  assert.match(intro, /play\.setPictureOnly\(!play\.prefs\.pictureOnly\)/);
});

/* ---------- Results and the one loss card (blueprint 5.3, 5.13) ---------- */

test('one honest line per lost try: right answers lead, so close only at 75%', () => {
  const rt = loadTs('src/gamekit/results/rideTry.ts');
  const trivia = rt.rideTrySummary({ stars: 0, meta: { mode: 'task', correctCount: 1, totalAnswered: 3 } });
  assert.equal(trivia.line, '1 of 3 right. 2 wins the coin.');
  assert.equal(trivia.near, true, 'one right answer away');
  assert.equal(rt.rideTrySummary({ stars: 0, meta: { mode: 'task', correctCount: 0 } }).near, false);
  const whack = rt.rideTrySummary({ stars: 0, meta: { game: 'tap', ridePercent: 62 } });
  assert.equal(whack.line, '8 of 13 bonks.');
  assert.equal(whack.near, false, '62% to go is not so close');
  assert.equal(rt.rideTrySummary({ stars: 0, meta: { game: 'tap', ridePercent: 80 } }).near, true);
  assert.equal(rt.rideTrySummary({ stars: 0, meta: { game: 'memory', pairs: 6, pairsTotal: 8 } }).line, '6 of 8 pairs.');
  assert.equal(rt.rideTrySummary({ stars: 0, meta: { game: 'memory', pairs: 6, pairsTotal: 8 } }).near, true);
  for (const s of [trivia, whack]) assert.doesNotMatch(s.line, /%|,\d{3}|points|\u2014/, 'no percentages, no commas, no points');
  rt.noteRideTry({ stars: 0, meta: { game: 'tap', ridePercent: 10 } }, 1000);
  assert.equal(rt.takeRideTry(1000 + 5000).line, '1 of 13 bonks.');
  assert.equal(rt.takeRideTry(1000 + 6000), null, 'read once');
  rt.noteRideTry({ stars: 0, meta: { game: 'tap', ridePercent: 10 } }, 0);
  assert.equal(rt.takeRideTry(10 * 60 * 1000), null, 'a stale note is dropped');
});

test('a ride loss skips the game\'s own card: one loss card, with TRY AGAIN, the same game and the Ticket flying home', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const showSharedCard = !rideLoss && phase === 'results'/);
  assert.match(shell, /const gameResults = rideLoss \|\| isEmptyResultsNode\(ownSurface\) \? null : ownSurface;/);
  const memory = read('src/games/memory/MemoryGame.tsx');
  assert.match(memory, /if \(r\.mode === 'ride' && left <= 0 && rideChallengeRef\.current\) \{/, 'the last Memory try goes straight to the one card');
  assert.match(memory, /if \(rideChallenge && r\?\.mode === 'ride'\) \{\n\s+\/\/ The ride's one loss card says how far this try got \("3 of 8 pairs\."\)\.\n\s+noteRideTry\(/, 'DONE on a try card notes the try too');
  const lost = loadTs('src/components/rewards/lostTryCard.ts');
  assert.equal(lost.lostTryCopy({ usedRescuePass: false, rescueRetryAvailable: false, firstCoinTicketReturned: true, lostTicketCost: 1 }).message,
    'Your Ticket came back. Same game, try again!');
  const card = read('src/components/rewards/ChallengeStatusCard.tsx');
  assert.match(card, /\{ticket > 0 && <TicketFlyBack to=\{ticketFlyTo \?\? null\} reduced=\{reduced\} \/>\}/);
  assert.match(card, /withTiming\(1, \{ duration: 650/, 'one UI-thread flight, then it rests');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /line=\{rideTry\?\.line \?\? null\} ticketFlyTo=\{ticketTarget\}/);
});

test('a VIP member\'s retry lives inside TRY AGAIN; nobody else sees a VIP or ad line on a loss', () => {
  const lost = loadTs('src/components/rewards/lostTryCard.ts');
  assert.equal(lost.VIP_RETRY_ACTION.label, 'Try Again');
  assert.equal(lost.VIP_RETRY_ACTION.note, 'VIP try');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /const vipRetryCase = taskType !== null && lostTicketCost > 0 && !usedRescuePass\n\s+&& !firstCoinTicketReturned && !rescueRetryAvailable && vip;/);
  assert.match(modal, /const canOfferRetry = retryOffered && vipRetryCase && !vipOutToday;/);
  assert.doesNotMatch(modal, /AD_RETRY_ACTION|adsAvailable|gameAlert/);
  const buttons = read('src/gamekit/results/ResultButtons.tsx');
  assert.match(buttons, /\{note \? <View style=\{styles\.note\}><Text style=\{styles\.noteText\} numberOfLines=\{1\}>\{note\}<\/Text><\/View> : null\}/);
});

test('the quit warning is the branded dialog, nested in the challenge card\'s own sheet', () => {
  const selector = read('src/components/MiniGameSelector.tsx');
  assert.doesNotMatch(selector, /Alert\.alert/);
  assert.match(selector, /<ModalLayerContext\.Provider value>\n\s+<GameDialog visible=\{quitAsk\} title="Leave\?" message="This try will end\."/);
  // Keep playing is the big gold button (the last button is the dialog's primary); Leave sits under it.
  assert.match(selector, /buttons=\{\[\{ text: 'Leave', style: 'destructive' \}, \{ text: 'Keep playing' \}\]\}/);
  assert.match(selector, /if \(index === 0\) onClose\(\);\n\s+else resume\?\.\(\);/);
});

test('results stay kind and true: no NEW BEST on a loss, no Too fast!, no QUICK count, Memory tries as shells', () => {
  const feelings = loadTs('src/gamekit/results/feelings.ts');
  assert.equal(feelings.bestOnWin(0, true), false);
  assert.equal(feelings.bestOnWin(1, true), true);
  assert.match(read('src/gamekit/results/ResultsCard.tsx'), /saved \|\| stars <= 0 \? compareBest\(0, personalBest\)/);
  assert.match(read('src/games/trivia-duel/TriviaDuel.tsx'), /if \(won && t\.me\.score > prevBest && prevBest > 0\) banners\.push\('NEW BEST'\);/);
  assert.match(read('src/games/sharky/hud/SharkyResults.tsx'), /const newBest = data\.newBest && !saved && data\.stars > 0;/);
  assert.doesNotMatch(read('src/games/whack/useWhackJuice.ts'), /text: 'Too fast!'/);
  assert.doesNotMatch(read('src/games/whack/WhackAShark.tsx'), /label: 'QUICK'/);
  assert.match(read('src/games/memory/TryCard.tsx'), /const SHELL = require\('\.\.\/\.\.\/assets\/games\/current-quest\/conch\.png'\);/);
});

test('paid trivia: at least 10 s a question, one even tone, the Final a no-risk bonus, IP-safe lines that read right', () => {
  const config = loadTs('src/games/trivia-duel/engine/config.ts');
  assert.ok(config.RIDE_ROUND.windowMs >= 10000, 'at least 10 s per paid question');
  assert.equal(config.POINTS.rideWindowMs, 8000, 'the speed bonus horizon (and the shared scoring vectors) unchanged');
  const content = loadTs('src/games/trivia-duel/engine/content.ts');
  assert.equal(content.isKidsDeck({ id: 'kid-76' }), true);
  assert.equal(content.isKidsDeck({ id: 'dl-12' }), false);
  const labels = loadTs('src/games/trivia-duel/engine/labels.ts');
  assert.equal(labels.genericize('Where did the original 1987 Star Tours flight head?'), 'Where did the original 1987 space flight simulator head?');
  assert.doesNotMatch(labels.genericize('The original 1987 Star Tours ride'), /\bthe the\b|original 1987 the/i);
  const duel = read('src/games/trivia-duel/TriviaDuel.tsx');
  assert.match(duel, /the Final is a no-risk bonus question worth double points/, 'kid rule: no betting');
  assert.match(duel, /A right answer is worth double; a miss costs nothing\./);
});

/* ---------- The win card (blueprint 5.3, 5.13) ---------- */

const win = loadTs('src/components/rewards/postWinModel.ts');

test('the win card\'s shelf line names the next trophy: "1 of 35 coins. Bronze at 12"', () => {
  const at = (collected, available) => win.shelfLine({ milestones: [], progress: { park_id: 8, park_name: 'Disneyland', before: 0, collected, available }, next: null });
  assert.equal(at(1, 35), '1 of 35 coins. Bronze at 12');
  assert.equal(at(12, 35), '12 of 35 coins. Full shelf at 35', 'Silver needs 50: this shelf names its end instead');
  assert.equal(at(13, 60), '13 of 60 coins. Silver at 50');
  assert.equal(at(35, 35), '35 of 35 coins. Shelf complete!');
  assert.equal(win.shelfLine(null), null);
});

test('one reward row on the ladder; a member\'s double coins as one +N VIP chip; every reward flies home', () => {
  const row = input => [...win.winRewardChips(input)].map(c => `${c.label}:${c.amount}:${c.flyTo}`);
  const base = { coins: 10, tickets: 1, parts: 1, energy: 10, xp: 25, coinLevelsOpen: false, dailyOpen: false };
  assert.deepEqual(row(base), ['Shark Coins:10:coins', 'Ticket:1:tickets', 'saved for growing coins:10:energy']);
  assert.deepEqual(row({ ...base, vipCoins: 10, coinLevelsOpen: true, dailyOpen: true }),
    ['Shark Coins:10:coins', 'VIP:10:coins', 'Ticket:1:tickets', 'Ride Part:1:energy', 'Energy:10:energy', 'XP:25:xp']);
  assert.deepEqual(row({ ...base, coins: 0, tickets: 0, energy: 0 }), [], 'never a +0');
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.match(card, /if \(!daily && xpEarned > 0\) fly\(FLY_ART\.xp, 2, WIN_FLY_ROUTES\.xp\);/, 'XP flies to the Profile tab before rung 4');
  assert.match(card, /if \(earnedStamp\) fly\(FLY_ART\.stamp, 1, WIN_FLY_ROUTES\.stamp\);/, 'the stamp flies to the Rewards button');
  assert.doesNotMatch(card, /NEW STAMP|TAP TO COLLECT|StarterOfferCard|SharkPassBanner|vipWinLine|openMembership|DoubleCoinsOffer|bonus_ads/);
  assert.match(card, /watchForReward\('double_coins', attemptId, true\)/);
});

test('one team sentence after a team pick, never points or Captain; nothing before a pick', () => {
  const name = t => ({ shark: 'Team Shark', mouse: 'Team Gold' }[t]);
  assert.equal(win.teamSentence({ team: 'shark', ride_name: 'Main Street', flipped: true, controller: 'shark' }, name), 'Team Shark took Main Street');
  assert.equal(win.teamSentence({ team: 'shark', ride_name: 'Main Street', flipped: false, controller: 'shark' }, name), 'Team Shark holds Main Street');
  assert.equal(win.teamSentence({ team: 'mouse', ride_name: 'Main Street', flipped: false, controller: 'shark' }, name), 'Your win helps Team Gold at Main Street');
  assert.equal(win.teamSentence({ needs_team: true, ride_name: 'Main Street' }, name), null);
  for (const line of ['Team Shark took Main Street']) assert.doesNotMatch(line, /points|Captain/);
  assert.equal(win.weekLine({ counted: true, week_rides: 1 }), '1 coin this week');
  assert.equal(win.weekLine({ counted: true, week_rides: 3 }), '3 coins this week');
  assert.equal(win.weekLine({ counted: false }), null);
});

test('exactly one primary and one secondary: NEXT COIN (or the Adventure\'s line story) and See my shelf', () => {
  assert.deepEqual({ ...win.nextCoinButton({ taskId: 5, name: 'Jungle Cruise', meters: 120.4, reason: 'nearest_open' }, 4) },
    { kind: 'next', label: 'NEXT COIN', detail: 'Jungle Cruise, 120 m' });
  assert.deepEqual({ ...win.nextCoinButton({ taskId: 4, name: 'Tiki Room', meters: 0, reason: 'line_story' }, 4) },
    { kind: 'line_story', label: 'Play its line story', detail: null });
  assert.equal(win.nextCoinButton(null, 4).kind, 'map');
  // No coin to point at (night, a resting park, every coin owned): the big button never promises one.
  assert.deepEqual({ ...win.nextCoinButton(null, 4) }, { kind: 'map', label: 'Back to Map', detail: null });
  assert.equal(win.nextCoinButton({ taskId: 4, name: 'Walt Statue', meters: 0, reason: 'in_range' }, 4).kind, 'map', 'never the coin just won');
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.equal((card.match(/<YellowButton /g) ?? []).length, 1, 'one big button');
  assert.equal((card.match(/<TouchableOpacity /g) ?? []).length, 1, 'one quiet button');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /if \(button\.kind === 'next' && target\) guide\.setTarget\(target\.taskId, 'win_card'\);/, 'the guide is the one pointer');
  assert.match(modal, /const ride = await storyWithin\(resolveQueueStoryContext\(park\.id, 0, taskName, wonTaskId\),/);
});

test('the first coin has one fixed order: the win card, the team step (once ever), then the map', async () => {
  const store = memoryStore();
  const team = loadTs('src/components/rewards/teamOffer.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: store } });
  const want = o => team.wantsTeamStep({ needsTeam: true, isNewCoin: true, firstCoinEver: true, offeredBefore: false, ...o });
  assert.equal(want({}), true);
  assert.equal(want({ needsTeam: false }), false, 'already on a team');
  assert.equal(want({ firstCoinEver: false }), false);
  assert.equal(want({ offeredBefore: true }), false, 'once ever');
  assert.equal(await team.teamOffered(7), false);
  await team.markTeamOffered(7);
  assert.equal(await team.teamOffered(7), true);
  assert.equal(await team.teamOffered(8), false, 'per player');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /RootNavigation\.navigate\('TeamSelection', \{ firstCoin: true, \.\.\.\(then \? \{ next: then \} : \{\}\) \}\);/);
  // Read when the win card opens, so the team step slides in under the fading card (no map frames between).
  assert.match(modal, /const postWinOpen = open === true && flowState === 'postwin';/);
  assert.match(modal, /teamStepReady\.current = \(needsTeamNow \? teamOffered\(player\?\.id\) : Promise\.resolve\(true\)\)/);
  const handler = name => modal.slice(modal.indexOf(`const ${name} = useCallback(`), modal.indexOf('}, [', modal.indexOf(`const ${name} = useCallback(`)));
  for (const name of ['handlePostWinClose', 'handleNextCoin', 'handleViewCoin']) {
    const body = handler(name);
    assert.ok(body.indexOf('openTeamStep(') > 0 && body.indexOf('openTeamStep(') < body.lastIndexOf('close();'), `${name}: the team step opens before the card closes`);
    assert.match(body, /if \(leavingWinRef\.current\) return;\n\s+leavingWinRef\.current = true;/, `${name}: one way out per win`);
  }
  assert.doesNotMatch(modal, /withTeamStep/, 'never after the card has faded');
});

/* ---------- Teaching, names and small fixes (blueprint 5.3, 5.13) ---------- */

test('every game\'s how-to leads with pictures: shark with a check, anglerfish with a cross', () => {
  const intro = read('src/components/help/GameIntroCard.tsx');
  assert.match(intro, /tap: \[\[\{ art: ART\.shark, mark: 'check' \}\], \[\{ art: ART\.angler, mark: 'close' \}\]\]/);
  for (const kind of ['tap', 'memory', 'trivia', 'banana', 'shark', 'current', 'timing']) assert.match(intro, new RegExp(`\\n  ${kind}: \\[`), kind);
  assert.match(intro, /<IntroPictures kind=\{kind\} \/>/);
  assert.match(intro, /<GameButton label="Play" icon="play"/);
  const topics = loadTs('src/services/help/helpTopics.ts', { '../adConfig': { AD_AUDIENCE_13_PLUS_KNOWN: false } });
  assert.match(topics.GAME_INTROS.tap.how, /anglerfish/);
  assert.equal(topics.GAME_INTROS.timing.name, 'Parade Beat');
  assert.equal(topics.TIP_COPY.coin_in_range.title, 'Tap PLAY!');
  const selector = read('src/components/MiniGameSelector.tsx');
  assert.match(selector, /win=\{paidTrivia \? '2 right answers win the coin\.' : undefined\}/);
  const introSrc = read('src/components/help/GameIntroCard.tsx');
  assert.match(introSrc, /SIDE_BY_SIDE: ReadonlySet<MiniGameKind> = new Set<MiniGameKind>\(\['tap'\]\)/,
    'Whack shows its do and never-do pictures side by side, never an arrow from the shark to the anglerfish');
});

test('Parade Beat is the rhythm game\'s one name; Home Defend has its own title and stamp; Prize Boxes is plain text', () => {
  assert.match(read('src/components/TimingMiniGame.tsx'), /title="Parade Beat!"/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /export const HOME_DEFEND = \{ title: 'Home Defend', win: 'DEFENDED!'/);
  assert.match(whack, /const defend = ride && !rideChallenge;/);
  assert.match(whack, /text: defendRef\.current \? HOME_DEFEND\.win : 'COIN CAUGHT!'/);
  assert.match(read('src/games/whack/render/WhackBoard.tsx'), /return s\.win \? winWord : `\$\{left\} BONKS TO WIN`;/);
  assert.match(whack, /return text\.replace\(\/\\bWATCH THE TEETH\\b\/, 'NOT THE ANGLERFISH'\);/, 'the anglerfish, never teeth');
  assert.match(whack, /const callout = playerCallout\(t\.callout\);/);
  const unlock = read('src/gamekit/results/UnlockTile.tsx');
  assert.match(unlock, /tileFlat: \{ backgroundColor: 'transparent', borderWidth: 0 \}/);
  assert.match(unlock, /accessibilityRole="text"/);
  assert.match(read('src/games/sharky/hud/SharkyUnlock.tsx'), /caption=\{`\$\{unlockName\(card\)\} unlocked`\}/);
});

test('a card that UIKit refused to present comes back: the watchdog presents it again, a few times at most', () => {
  const w = loadTs('src/components/rewards/usePresentWatchdog.ts', { react: { useCallback: f => f, useEffect() {}, useRef: v => ({ current: v }), useState: v => [v, () => {}] } });
  assert.equal(w.presentWatchdogNext({ shown: false, tries: 0 }, true), 'retry');
  assert.equal(w.presentWatchdogNext({ shown: true, tries: 0 }, true), 'wait', 'on screen: nothing to do');
  assert.equal(w.presentWatchdogNext({ shown: false, tries: 0 }, false), 'wait', 'not wanted: nothing to do');
  assert.equal(w.presentWatchdogNext({ shown: false, tries: w.PRESENT_WATCHDOG_TRIES }, true), 'give_up');
  assert.ok(w.PRESENT_WATCHDOG_MS >= 1000 && w.PRESENT_WATCHDOG_MS <= 2000, 'longer than the zoom-in, short enough to feel instant');
  for (const file of ['src/components/RedeemRedeemableModal.tsx', 'src/components/PostWinRewardsModal.tsx']) {
    const src = read(file);
    assert.match(src, /key=\{`(challenge|win)-\$\{(challengeWatch|watch)\.key\}`\}\n\s+onShow=\{(challengeWatch|watch)\.onShow\}/, file);
  }
});

test('a tap anywhere off the challenge card closes it: the wide card row lets scrim taps through', () => {
  const src = read('src/components/RedeemRedeemableModal.tsx');
  // Without box-none the row beside the card swallowed the tap (react-native-modal's swipe handler took it).
  assert.match(src, /<View pointerEvents="box-none"\n\s+style=\{\{ width: Dimensions\.get\('window'\)\.width - 40/);
  assert.match(src, /onBackdropPress=\{closeFromScrim\}/);
});

/* ---------- Ledger 36: the bot rival is Captain Gill ---------- */

test('no UI string or accessibility label in src/games names Captain Fin or Admiral Fin; the ladder is Gill', () => {
  const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []);
  const hits = [];
  for (const file of walk('src/games')) {
    read(file).split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/(Captain|Admiral|Deckhand|First Mate) Fin\b|FIN'S FINAL|Fin's Final|FIN BEATEN|Fin is now|: 'Fin'/.test(line)) hits.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
  const config = read('src/games/trivia-duel/engine/config.ts');
  for (const label of ['Deckhand Gill', 'First Mate Gill', 'Captain Gill', 'Admiral Gill']) assert.ok(config.includes(`label: '${label}'`), label);
  const duel = read('src/games/trivia-duel/TriviaDuel.tsx');
  assert.match(duel, /ghost\.name : 'Gill'/);
  assert.match(duel, /oppName=\{ghost \? oppName : 'Captain Gill'\}/);
  assert.match(duel, /GILL'S FINAL/);
  assert.match(read('src/games/trivia-duel/ui/DuelResults.tsx'), /Rank up! Gill is now/);
});

/* ---------- Walk fixes on a 375 x 667 phone (round 1) ---------- */

test('on an iPhone SE the team step keeps LATER on screen, and the win card chips shrink instead of cutting words', () => {
  const team = read('src/screens/GymBattle/TeamSelectionScreen.tsx');
  assert.match(team, /const compact = useWindowDimensions\(\)\.height < 720;/);
  for (const style of ['titleCompact', 'cardsCompact', 'helpBtnCompact', 'laterCompact']) assert.ok(team.includes(`compact && s.${style}`), style);
  assert.doesNotMatch(team, /Go all in/);
  const win = read('src/components/PostWinRewardsModal.tsx');
  assert.match(win, /styles\.chipLabelQuiet\]\} numberOfLines=\{2\} adjustsFontSizeToFit minimumFontScale=\{0\.7\}/);
});

/* ---------- Round 2: the grader's blockers and fixes ---------- */

test('every place a win card reward flies is a name the map registers (blueprint 4.2), and a stamp always lands', () => {
  const routes = win.WIN_FLY_ROUTES;
  // The map's names: the header pills (Topbar Currency flyTarget), the Shelf button ('energy') and the
  // Profile tab ('xp') from guide-map's flyAnchors, the Rewards button ('rewards').
  const mapNames = new Set(['coins', 'tickets', 'energy', 'xp', 'rewards']);
  for (const [kind, route] of Object.entries(routes)) {
    assert.ok(route.length > 0, `${kind} has a place to fly`);
    for (const name of route) assert.ok(mapNames.has(name), `${kind} flies to '${name}', a name the map registers`);
  }
  assert.deepEqual([...routes.xp], ['xp'], 'XP flies to the Profile tab by the name guide-map registers (not "profile")');
  assert.deepEqual([...routes.stamp], ['rewards', 'xp'], 'the stamp lands on the Rewards button, or the Profile tab (the Stamp Book) before one is drawn');
  const registered = names => name => names.includes(name);
  assert.equal(win.flyTargetFor(routes.stamp, registered(['coins', 'tickets', 'xp'])), 'xp', 'no Rewards button yet: the Profile tab');
  assert.equal(win.flyTargetFor(routes.stamp, registered(['coins', 'xp', 'rewards'])), 'rewards');
  assert.equal(win.flyTargetFor(routes.xp, registered([])), null, 'nothing drawn: skipped, never a crash');
  for (const chip of win.winRewardChips({ coins: 5, tickets: 1, parts: 2, energy: 10, xp: 9, vipCoins: 5, coinLevelsOpen: true, dailyOpen: true })) {
    assert.ok(mapNames.has(chip.flyTo), `${chip.label} flies to a registered name`);
  }
  // Where the names are registered, on any build that has them (guide-map's flyAnchors and the header pills).
  const anchors = path.join(root, 'src/components/guide/flyAnchors.ts');
  if (fs.existsSync(anchors)) {
    const src = fs.readFileSync(anchors, 'utf8');
    assert.match(src, /registerTarget\('xp'/, 'the Profile tab registers as xp');
  }
  assert.match(read('src/components/Topbar/Currency.tsx'), /registerTarget\(flyTarget/);
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.doesNotMatch(card, /targetPosition: '(profile|rewards)'/, 'no fixed target name that the map may not register');
  assert.match(card, /const target = flyTargetFor\(route, getTarget\);/);
  // The stamp gets its moment on the card itself too: a sticker on the hero coin (no button, no extra row).
  assert.match(card, /\{!!earnedStamp && <Animated\.View style=\{\[styles\.stampSticker, textStyle\]\} accessible/);
  assert.match(card, /stampSticker: \{ position: 'absolute'/, 'it takes no height of its own');
  assert.doesNotMatch(card, /stampBadge/, 'never in the reward row, where it wrapped to a second row on a 375 pt screen');
  assert.match(card, /\{\(chips\.length > 0 \|\| \(rush && coinLevels\) \|\| starRide\) && <View style=\{styles\.chips\}>/);
  assert.match(card, /accessibilityLabel=\{`New stamp: \$\{earnedStamp\.name\}\. It waits in Rewards\.`\}/);
});

test('the challenge card reads the guide only while its win card is up, so walking never re-renders it', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /const watchGuide = open === true && flowState === 'postwin';/);
  assert.match(modal, /if \(!watchGuide\) return undefined;\n\s+setGuideTarget\(guide\.current\(\)\);\n\s+return guide\.subscribe\(\(\) => setGuideTarget\(guide\.current\(\)\)\);\n\s+\}, \[watchGuide\]\);/);
  assert.equal((modal.match(/guide\.subscribe\(/g) || []).length, 1, 'one subscription, and only inside that effect');
  assert.doesNotMatch(modal, /useState<GuideTarget \| null>\(\(\) => guide\.current\(\)\)/);
  assert.doesNotMatch(modal, /void showModal|const GAMES = /, 'leftovers removed');
});

test('PLAY! taps queued behind a leaving sheet open the card and never close it: the scrim waits a moment', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /export const SCRIM_GRACE_MS = 900;/);
  assert.match(modal, /onModalWillShow=\{\(\) => \{ cardShownAt\.current = Date\.now\(\); setChallengeModalHidden\(false\); \}\}/);
  assert.match(modal, /const closeFromScrim = useCallback\(\(\) => \{\n\s+if \(Date\.now\(\) - cardShownAt\.current < SCRIM_GRACE_MS\) return;\n\s+safeClose\(\);/);
  // The wide scrim Pressable under the card follows the same rule.
  assert.match(modal, /onPress=\{\(\) => \{\n\s+if \(Date\.now\(\) - cardShownAt\.current < SCRIM_GRACE_MS\) return;\n\s+playSound\(require\('\.\.\/\.\.\/assets\/sounds\/redeem_modal_close\.mp3'\)\);\n\s+safeClose\(\);/);
  assert.doesNotMatch(modal, /onBackdropPress=\{safeClose\}/);
});

test('after a trivia loss with Picture games on, TRY AGAIN sends retry_of and picture_only=1 together', async () => {
  const sent = [];
  const api = loadTs('src/api/endpoints/me/task-attempts.ts', {
    '../../client': { __esModule: true, default: { post: async (url, body) => { sent.push({ url, body }); return { data: { data: { attempt: { id: 902, game: 'memory', status: 'started' } } } }; } } },
    '../../../screens/LeaderboardsScreen/standingsCache': { markStandingsStale() {}, parkWinNote() {} },
    '../../../screens/LeaderboardsScreen/standingsV2Model': { winNote: () => null },
    '../../../utils/toast': { showToast() {} },
  });
  const writes = [];
  const recovery = loadTs('src/services/task-attempt/recovery.ts', {
    '../../api/endpoints/me/task-attempts': api,
    './checkpoint': { writeTaskAttemptCheckpoint: async cp => { writes.push(cp); } },
  });
  // The checkpoint the challenge card writes for TRY AGAIN after trivia attempt 901 was lost, Picture games on.
  const lostTrivia = { id: 901, game: 'trivia', status: 'lost' };
  const checkpoint = { version: 1, playerId: 7, taskType: 'task', taskId: 91, requestId: 'tps-retry-req-0000000001', attemptId: null,
    latitude: 33.81, longitude: -117.91, savedAt: Date.now(), retryOf: lostTrivia.id, pictureOnly: true };
  const result = await recovery.recoverTaskAttempt(checkpoint);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.retry_of, 901, 'names the lost trivia attempt');
  assert.equal(sent[0].body.picture_only, 1, 'and still asks for picture games (the server lets picture games win over the same game)');
  assert.equal(result.attempt.id, 902);
  assert.equal(writes[0].attemptId, 902, 'the new attempt id is saved for a relaunch');
  // The card builds exactly that checkpoint: the lost attempt id on TRY AGAIN, the player's picture setting on every paid try.
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /retryOfRef\.current = attemptRef\.current\?\.id \?\? retryOfRef\.current;\n\s+try \{\n\s+await clearAttemptCheckpoint\(\);/);
  assert.match(modal, /\.\.\.\(\(saved\?\.retryOf \?\? retryOfRef\.current\) \? \{ retryOf: saved\?\.retryOf \?\? retryOfRef\.current \} : \{\}\),\n\s+\.\.\.\(pictureOnly \? \{ pictureOnly: true \} : \{\}\),/);
});

test('one card per Memory miss in a ride challenge: the mid card has TRY AGAIN only (no DONE into a second card)', () => {
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /onDone=\{rideChallenge && tryScreen\.left > 0 \? undefined : giveUp\} \/>/);
  const card = read('src/games/memory/TryCard.tsx');
  assert.match(card, /onDone\?: \(\) => void;/);
  assert.match(card, /\{onDone \|\| !canRetry \? \(/, 'DONE shows only when it has somewhere to go, or the tries are used up');
});

test('kid test: the Trivia toggle shows a question with a cross, the ball a check, the treats line the churro', () => {
  const intro = read('src/components/help/GameIntroCard.tsx');
  assert.match(intro, /<Picture pic=\{\{ art: ART\.question, mark: 'close' \}\} \/>/);
  assert.doesNotMatch(intro, /art: ART\.fin, mark: 'close'/, 'never the rival with a cross ("wrong shark")');
  assert.match(intro, /question: require\('\.\.\/\.\.\/\.\.\/assets\/images\/screens\/community-center-question\.png'\)/, 'existing art only');
  assert.match(intro, /banana: \[\[\{ art: ART\.basket \}, \{ art: ART\.banana, mark: 'check' \}\], \[\{ art: ART\.ball, mark: 'check' \}\]\]/);
  assert.ok(fs.existsSync(path.join(root, 'assets/images/screens/community-center-question.png')));
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /const TREAT_ART = require\('\.\.\/\.\.\/assets\/images\/prep-items\/churros\/churro_18\.png'\);/);
  assert.match(modal, /: <Image source=\{TREAT_ART\} style=\{styles\.treatArt\} contentFit="contain" \/>/);
  assert.doesNotMatch(modal, /name=\{step\.kind === 'line_ticket' \? 'ride' : 'map'\}/, 'the treats line never wears the compass');
  assert.match(modal, /export const BACK_TO_MAP = 'Back to Map';/);
  assert.match(modal, /export const NEED_TICKET_BUTTON = BACK_TO_MAP;/);
  assert.doesNotMatch(modal, /needTicket \? 'OK'/, 'never a bare OK');
  assert.ok(fs.existsSync(path.join(root, 'assets/images/prep-items/churros/churro_18.png')));
});

test('short lines draw their digits in the number face, so "1" never reads "I"', () => {
  assert.match(read('src/components/PostWinRewardsModal.tsx'), /<Text style=\{styles\.weekText\}>\{withNumberFont\(weekLine\)\}<\/Text>/);
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /withNumberFont\(step\.kind === 'line_ticket'/);
  assert.match(modal, /<Text style=\{styles\.stepLine\}>\{withNumberFont\(challengeStepLine\(freeStep\) \?\? ''\)\}<\/Text>/);
  assert.match(read('src/games/trivia-duel/ui/Card.tsx'), /\{withNumberFont\(roundLabel\)\}/, '"QUESTION 1 OF 3" never reads "I OF 3"');
  // The loss card's try line ("1 of 3 right.") is already in the number face; its message ("1 Ticket used.") now too.
  const status = read('src/components/rewards/ChallengeStatusCard.tsx');
  assert.match(status, /line: \{ fontFamily: 'Shark'/);
  assert.match(status, /<Text style=\{styles\.messageSmall\}>\{withNumberFont\(message\)\}<\/Text>/);
  assert.match(status, /<Text style=\{styles\.message\}>\{withNumberFont\(message\)\}<\/Text>/);
});

test('Settings switch rows speak as switches with On or Off, even when the row does the toggling', () => {
  const src = read('src/screens/SettingsScreen.tsx');
  assert.match(src, /accessibilityRole=\{checked === undefined \? 'button' : 'switch'\}\n\s+accessibilityState=\{checked === undefined \? undefined : \{ checked \}\}/);
  assert.match(src, /checked=\{play\.prefs\.pictureOnly\}/);
  assert.match(src, /checked=\{batterySaver\}/);
});

test('today\'s Adventure coin won: the big button plays its line story, even before the map\'s guide catches up', () => {
  const ticket = { park_id: 8, phase: 'play', play: null, ride: { task_id: 77 } };
  assert.equal(win.adventureLineStoryNext(ticket, 77, 8), true);
  assert.equal(win.adventureLineStoryNext({ ...ticket, play: { kind: 'queue_story' } }, 77, 8), false, 'line story already played');
  assert.equal(win.adventureLineStoryNext({ ...ticket, phase: 'discover' }, 77, 8), false);
  assert.equal(win.adventureLineStoryNext(ticket, 59, 8), false, 'another coin');
  assert.equal(win.adventureLineStoryNext(ticket, 77, 2), false, 'another park');
  assert.equal(win.adventureLineStoryNext(null, 77, 8), false);
  const story = win.nextCoinButton({ taskId: 60, name: 'Frontierland', meters: 52, reason: 'nearest_open' }, 77, true);
  assert.deepEqual({ ...story }, { kind: 'line_story', label: 'Play its line story', detail: null });
  const next = win.nextCoinButton({ taskId: 60, name: 'Frontierland', meters: 52, reason: 'nearest_open' }, 77, false);
  assert.deepEqual({ ...next }, { kind: 'next', label: 'NEXT COIN', detail: 'Frontierland, 52 m' });
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /setLineStoryNext\(adventureLineStoryNext\(goal\.adventure_ticket, attempt\.task_id, park\.id\)\);/);
  assert.match(modal, /adventureLineStory=\{lineStoryNext\}/);
  // A first coin that was also today's Adventure coin: the team step first, then the line story.
  assert.match(modal, /if \(!\(await openTeamStep\(\{ name: 'LinePlay', params: \{ ride \} \}\)\)\) \{\n\s+afterRewardsHidden\.current = \(\) => RootNavigation\.navigate\('LinePlay', \{ ride \}\);/);
});

/* ---------- Round 3 (grader fixes 1 to 10) ---------- */

test('one phrase back to the map: every card that leads to the map says Back to Map', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.doesNotMatch(modal, /Return to [Mm]ap|label: 'Continue'|label: 'DONE'/);
  assert.ok((modal.match(/label: BACK_TO_MAP/g) ?? []).length >= 8);
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.doesNotMatch(card, /Back to the Park/);
  assert.match(card, /label: BACK_TO_MAP_LABEL/);
  assert.equal(win.BACK_TO_MAP_LABEL, 'Back to Map');
});

test('a limited coin won as a first coin gets its own one-line home, with no date math or countdown', () => {
  assert.equal(win.limitedWinLine({ active: true, ends_at: null, ends_on: '2026-10-31', returns: false }), 'Limited coin. Yours to keep!');
  assert.equal(win.limitedWinLine({ active: false, ends_at: null, returns: true }), 'Limited coin. Yours to keep!');
  assert.equal(win.limitedWinLine(null), null, 'a permanent coin keeps the shelf line');
  assert.equal(win.limitedWinLine(undefined), null);
  const card = read('src/components/PostWinRewardsModal.tsx');
  // The server's shelf count leaves limited coins out (progress null), so the limited line fills that gap only.
  assert.match(card, /const shelf = shelfLine\(milestones \?\? null\) \?\? \(isNewCoin \? limitedWinLine\(limited\) : null\);/);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'),
    /limited=\{redeemable\?\.type === 'task' \? \(redeemable\.model as TaskType\)\?\.limited \?\? null : null\}/);
  assert.doesNotMatch(card, /days left|hours left|left!/i);
});

test('battery: the challenge card runs no endless animation while it sits mounted, and keeps no dead styles', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.doesNotMatch(modal, /Animated\.loop|new Animated\.Value/);
  for (const name of ['rescueCard', 'rescueEyebrow', 'rescueCopy', 'getTickets', 'getTicketsText', 'WHEEL_SIZE']) {
    assert.doesNotMatch(modal, new RegExp(`\\b${name}\\b`), name);
  }
});

test('how-to pictures teach the action: Parade Beat taps on the line, Sharky holds to swim up, one line each', () => {
  const intro = read('src/components/help/GameIntroCard.tsx');
  assert.match(intro, /timing: \[\[\{ art: ART\.note, line: true \}\], \[\{ art: ART\.drum, tap: true, mark: 'check' \}\]\]/);
  assert.match(intro, /shark: \[\[\{ art: ART\.hand, hold: true \}\], \[\{ art: ART\.swimmer, up: true, mark: 'check' \}\]\]/);
  assert.doesNotMatch(intro, /shark: \[\[\{ icon: 'play' \}\]/, 'never a play icon where hold is meant');
  // Beat the Buzzer: a question, then the hand on the bell (the rival's thinking face taught nothing to a non-reader).
  assert.match(intro, /trivia: \[\[\{ art: ART\.question \}\], \[\{ art: ART\.bell, tap: true, mark: 'check' \}\]\]/);
  assert.doesNotMatch(intro, /ART\.fin\b/);
  assert.match(intro, /hand: require\('\.\.\/\.\.\/\.\.\/assets\/images\/ride-photo\/tap-hand\.webp'\)/, 'existing app art only');
  assert.ok(fs.existsSync(path.join(root, 'assets/images/ride-photo/tap-hand.webp')));
  const topics = loadTs('src/services/help/helpTopics.ts', { '../adConfig': { AD_AUDIENCE_13_PLUS_KNOWN: false } });
  for (const [kind, intro] of Object.entries(topics.GAME_INTROS).filter(([kind]) => kind !== 'photo')) { // Snap the Ride is retired
    assert.ok(intro.how.length <= 44, `${kind} how-to is one short line: "${intro.how}"`);
    assert.ok(intro.win.length <= 44, `${kind} win line is one short line: "${intro.win}"`);
  }
  assert.equal(topics.GAME_INTROS.timing.how, 'Tap the drum when a note hits the line.');
});

test('a win card that hands off to the team step lets its rewards land quietly (no coins over that screen)', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  const open = modal.slice(modal.indexOf('const openTeamStep = useCallback('), modal.indexOf('const handlePostWinClose'));
  assert.match(open, /flyAfterHideRef\.current = false;/);
  assert.match(modal, /if \(postWinOpen\) \{ leavingWinRef\.current = false; flyAfterHideRef\.current = true; \}/, 'every new win flies again');
  assert.match(modal, /shouldFly=\{\(\) => flyAfterHideRef\.current\}/);
  assert.match(read('src/components/PostWinRewardsModal.tsx'), /if \(shouldFly\?\.\(\) !== false\) flyRewards\(\);/);
});

test('a member whose VIP tries are used today sees "comes back tomorrow", never a VIP try that is not there', () => {
  const lost = loadTs('src/components/rewards/lostTryCard.ts');
  assert.equal(lost.VIP_TRY_TOMORROW, 'Your VIP try comes back tomorrow.');
  assert.equal(lost.vipTriesLeft({ placements: { retry: { daily_cap: 3, used: 3, remaining: 0 } } }), 0);
  assert.equal(lost.vipTriesLeft({ placements: { retry: { daily_cap: 3, used: 1, remaining: 2 } } }), 2);
  assert.equal(lost.vipTriesLeft({ placements: { retry: { remaining: -1 } } }), 0);
  assert.equal(lost.vipTriesLeft(null), null, 'no answer: the try is offered and the server decides');
  assert.equal(lost.vipTriesLeft({ placements: {} }), null);
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  // Read while the game plays (members only), so the loss card's big button never swaps under a finger.
  assert.match(modal, /if \(!vip \|\| flowState !== 'minigame'\) return undefined;\n\s+let alive = true;\n\s+void getAdSummary\(\)\.then\(summary => \{ if \(alive\) setVipLeft\(vipTriesLeft\(summary\)\); \}\)/);
  assert.match(modal, /const vipOutToday = vipRetryCase && vipLeft === 0;\n\s+const canOfferRetry = retryOffered && vipRetryCase && !vipOutToday;/);
  assert.match(modal, /message=\{vipNote \?\? \(vipOutToday \? VIP_TRY_TOMORROW : lostCopy\.message\)\}/);
  assert.match(modal, /setRetryOffered\(true\);\n\s+setVipLeft\(null\);\n\s+setVipNote\(null\);/, 'a new card starts with no old note');
  assert.match(modal, /const vipRetryCase = taskType !== null && lostTicketCost > 0 && !usedRescuePass\n\s+&& !firstCoinTicketReturned && !rescueRetryAvailable && vip;/, 'members only');
});

test('Memory\'s loss line tells the best of the Ticket\'s three tries, never only a last try that found nothing', () => {
  const rt = loadTs('src/gamekit/results/rideTry.ts');
  const best = rt.rideTrySummary({ stars: 0, meta: { game: 'memory', pairs: 0, pairsTotal: 8, bestPairs: 5 } });
  assert.equal(best.line, 'Best try: 5 of 8 pairs.');
  assert.equal(best.near, false, '5 of 8 is not 75%');
  assert.equal(rt.rideTrySummary({ stars: 0, meta: { game: 'memory', pairs: 6, pairsTotal: 8, bestPairs: 6 } }).line, '6 of 8 pairs.');
  assert.equal(rt.rideTrySummary({ stars: 0, meta: { game: 'memory', pairs: 3, pairsTotal: 8 } }).line, '3 of 8 pairs.', 'no best: the last try');
  assert.equal(rt.rideTrySummary({ stars: 0, meta: { game: 'memory', pairs: 1, pairsTotal: 8, bestPairs: 6 } }).near, true);
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /rideBestPairsRef\.current = r\.tryIndex === 0 \? r\.eng\.pairs : Math\.max\(rideBestPairsRef\.current, r\.eng\.pairs\);/);
  assert.match(game, /\.\.\.\(r\.mode === 'ride' \? \{ bestPairs: Math\.max\(rideBestPairsRef\.current, e\.pairs\) \} : \{\}\),/);
});

test('first coin: the win card waits on top until the team step has slid in, then fades into it (no map frame between)', async () => {
  const team = loadTs('src/components/rewards/teamOffer.ts', { '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => undefined } });
  let shown = false;
  const waiting = team.whenTeamStepShown(5000).then(() => { shown = true; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(shown, false, 'still waiting for the step');
  team.teamStepShown();
  await waiting;
  assert.equal(shown, true, 'the step reported it is on screen');
  const t0 = Date.now();
  await team.whenTeamStepShown(30);
  assert.ok(Date.now() - t0 >= 25, 'never waits forever: a capped wait');
  assert.equal(team.TEAM_STEP_SHOWN_MAX_MS, 900);
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /const shown = whenTeamStepShown\(\);\n\s+RootNavigation\.navigate\('TeamSelection', \{ firstCoin: true, \.\.\.\(then \? \{ next: then \} : \{\}\) \}\);\n\s+await shown;\n\s+return true;/,
    'listens before it navigates, so a fast slide is never missed');
  const screen = read('src/screens/GymBattle/TeamSelectionScreen.tsx');
  assert.match(screen, /navigation\?\.addListener\?\.\('transitionEnd', \(event: \{ data\?: \{ closing\?: boolean \} \}\) => \{\n\s+if \(!event\?\.data\?\.closing\) teamStepShown\(\);/);
});

test('the returned-Ticket line promises "same game" only on a server that deals it (prod-mirror dealt Trivia after a Whack loss)', () => {
  const lost = loadTs('src/components/rewards/lostTryCard.ts');
  const base = { usedRescuePass: false, rescueRetryAvailable: false, firstCoinTicketReturned: true, lostTicketCost: 1 };
  assert.equal(lost.lostTryCopy({ ...base, sameGame: false }).message, 'Your Ticket came back. Try again!');
  assert.equal(lost.lostTryCopy({ ...base, sameGame: true }).message, 'Your Ticket came back. Same game, try again!');
  assert.equal(lost.lostTryCopy(base).message, 'Your Ticket came back. Same game, try again!', 'callers that do not say keep the line');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /retryOffered: canOfferRetry, near: rideTry\?\.near === true, sameGame: playFlagsNow\(\)\.pictureGames \}\);/);
});
