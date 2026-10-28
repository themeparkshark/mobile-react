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
  assert.match(modal, /'RIDE PARTS'[^\n]*show: coinLevelsOpen \}/);
  assert.match(modal, /'ENERGY'[^\n]*show: coinLevelsOpen \}/);
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
  assert.ok(card.indexOf('treats at home = 1 Ticket') < card.indexOf('<CoinTopUpOffer'), 'the shop sits under every free way');
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
  assert.match(modal, /const canOfferRetry = retryOffered && taskType !== null && lostTicketCost > 0 && !usedRescuePass\n\s+&& !firstCoinTicketReturned && !rescueRetryAvailable && vip;/);
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
    ['Shark Coins:10:coins', 'VIP:10:coins', 'Ticket:1:tickets', 'Ride Part:1:energy', 'Energy:10:energy', 'XP:25:profile']);
  assert.deepEqual(row({ ...base, coins: 0, tickets: 0, energy: 0 }), [], 'never a +0');
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.match(card, /triggerFly\(\{ imageSource: FLY_ART\.xp, amount: 2, startX: x, startY: y, targetPosition: 'profile' \}\)/, 'XP flies to the Profile tab before rung 4');
  assert.match(card, /targetPosition: 'rewards' \}\)/, 'the stamp flies to the Rewards button');
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
  assert.equal(win.nextCoinButton({ taskId: 4, name: 'Walt Statue', meters: 0, reason: 'in_range' }, 4).kind, 'map', 'never the coin just won');
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.equal((card.match(/<YellowButton /g) ?? []).length, 1, 'one big button');
  assert.equal((card.match(/<TouchableOpacity /g) ?? []).length, 1, 'one quiet button');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /if \(button\.kind === 'next' && target\) guide\.setTarget\(target\.taskId, 'win_card'\);/, 'the guide is the one pointer');
  assert.match(modal, /resolveQueueStoryContext\(park\.id, 0, taskName, wonTaskId\)\n\s+\.then\(ride => RootNavigation\.navigate\('LinePlay', \{ ride \}\)\)/);
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
  assert.match(modal, /afterRewardsHidden\.current = \(\) => \{ void withTeamStep\(null, \(\) => undefined\); \};/, 'after the card is gone, never on top of it');
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
  assert.match(src, /onBackdropPress=\{safeClose\}/);
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
