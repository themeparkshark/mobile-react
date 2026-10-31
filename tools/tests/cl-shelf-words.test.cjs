'use strict';
/**
 * Core loop wave, shelf-words lane (BLUEPRINT 4.4, 4.5, 5.4, 5.10, 5.11, 7, must-fix 4, 32, 35).
 * Runtime checks where the component runs under the reward-hook runtime, source
 * checks where a screen needs the whole app around it.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const coinTiers = loadTs('src/constants/coinTiers.ts');
const progressionModel = loadTs('src/components/coin/progressionModel.ts');
const progressionStubs = {
  '../../modules/flash-safety': { isDimFlashingLightsEnabled: () => false },
  './coin/progressionModel': progressionModel,
  '../gamekit/Haptics': { queueHaptic() {} },
  '../audio/sfxLimiter': { playLimited: (_name, _request, play) => { play(); return true; }, SFX_PRIORITY: { whoosh: 1, tap: 2, land: 3 } },
  '../hooks/usePresentationQueue': { usePresentationSlot: () => ({ visible: false, done() {} }) },
};

function levelSheet(props) {
  const closes = [];
  const view = runtime('src/components/CoinLevelingModal.tsx', {
    '../share/devDrive': { useDevAutoPress() {} }, '../share/handoff': { useModalHandoff: () => ({ handoff: async () => {}, onDismiss() {} }) },
    '../context/AuthProvider': { AuthContext: { value: { refreshPlayer: async () => {} } } },
    '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound() {} } } },
    '../hooks/useReducedGameMotion': { default: () => true },
    '../helpers/haptics': { impactAsync() {}, notificationAsync() {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
    '../constants/coinTiers': coinTiers,
    ...progressionStubs,
  }, { visible: true, rideCoin: { id: 13, ride_name: 'Jungle Cruise', current_level: 1, max_level: 5,
    is_unlocked: true, parts_to_next_level: 3, energy_to_next_level: 10, next_level_perks: [], current_perks: [] },
  playerEnergy: 160, playerParts: 1, onClose() { closes.push(1); }, onLevelUp: async () => false, ...props });
  const partsButton = () => view.find(node => node.type === './YellowButton' && /Ride Part/.test(node.props.text ?? ''));
  const modal = () => view.find(node => node.type === 'react-native-modal');
  return { view, partsButton, modal, closes };
}

test('GET RIDE PARTS at the park points the guide at the ride and starts the map on the press (must-fix 4, round 4)', () => {
  let sent = 0;
  const sheet = levelSheet({ onGetParts() { sent++; } });
  assert.equal(sheet.partsButton().props.text, 'Get 2 Ride Parts');
  sheet.partsButton().props.onPress();
  assert.equal(sheet.closes.length, 1, 'the sheet closes');
  assert.equal(sent, 1, 'the map starts sliding in under the 90 ms sheet exit, so the shelf never shows in between');
  sheet.modal().props.onModalHide();
  assert.equal(sent, 1, 'only once: the sheet hiding never runs it again');
});

test('GET RIDE PARTS away from the park opens a picture card in place (never a dead tap)', () => {
  const sheet = levelSheet({});
  const before = JSON.stringify(sheet.view.tree);
  sheet.partsButton().props.onPress();
  sheet.view.render();
  const card = sheet.view.find(node => typeof node.props?.accessibilityLabel === 'string' && /stand in its line/i.test(node.props.accessibilityLabel));
  assert.ok(card, 'a visible card says where Parts come from');
  assert.notEqual(JSON.stringify(sheet.view.tree), before, 'the screen changed');
  assert.equal(sheet.closes.length, 0);
});

test('the coin card wires GET RIDE PARTS to guide.setTarget and the map path, and LinePlay never wears the pocket watch', () => {
  const card = read('src/components/TaskCoinModal.tsx');
  assert.match(card, /guide\.setTarget\(task\.id, 'coin_parts'\)/);
  assert.match(card, /onGetParts=\{onShowOnMap \?/);
  assert.doesNotMatch(card, /name="queue"/, 'the pocket watch means Wait Times only');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /onShowOnMap=\{\(section === 'normal' \|\| section === 'limited'\) && canChooseGoal && inThisPark/);
  assert.doesNotMatch(read('src/components/CoinLevelingModal.tsx'), /name="queue"/);
});

/** A stand-in for any module: every property is another stand-in (module-level styles read deep keys). */
function anything() {
  const fn = function stub() { return anything(); };
  return new Proxy(fn, { get: (target, key) => (key === Symbol.toPrimitive ? () => '' : key === '__esModule' ? false : anything()) });
}

function suppliesModule() {
  return loadTs('src/screens/StoreScreen/SuppliesShop.tsx', new Proxy({
    react: { useCallback() {}, useContext() {}, useEffect() {}, useMemo() {}, useRef() {}, useState() {} },
    'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: v => v } },
    'react-native-reanimated': { default: {}, FadeInUp: { delay: () => ({ springify: () => ({ damping: () => ({}) }) }), springify: () => ({ damping: () => ({}) }) } },
  }, {
    // Every other import is an empty stub: only the pure helpers run.
    getOwnPropertyDescriptor: (target, key) => ({ configurable: true, enumerable: true, writable: true, value: key in target ? target[key] : anything() }),
    get: (target, key) => (key in target ? target[key] : anything()),
  }));
}

test('Supplies: the wallet is the header\'s live balances, never the catalog copy from the last shop load', () => {
  const { freshWallet } = suppliesModule();
  const wallet = freshWallet({ tickets: 7, coins: 1200, energy: 40, rescue_passes: 2 }, { tickets: 3, coins: 900, energy: 10, rescue_passes: 1 });
  assert.equal(wallet.tickets, 7);
  assert.equal(wallet.coins, 1200);
  assert.equal(wallet.rescue_passes, 2);
  assert.equal(freshWallet({ tickets: 5 }, { coins: 9 }).coins, 9, 'a balance the player row lacks falls back to the catalog');
  assert.equal(freshWallet(null, null).tickets, 0);
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /const wallet = freshWallet\(player, catalog\.wallet\);/);
  assert.doesNotMatch(shop, /countText\(catalog\.wallet\[w\.key\]/, 'no stale wallet on screen');
});

test('Supplies: free Ticket ways come before any pack; the line Ticket only while Queue Tickets is on', () => {
  const { freeTicketWays } = suppliesModule();
  const off = freeTicketWays(false).map(way => way.text);
  assert.ok(off.some(text => /3 treats/.test(text)));
  assert.ok(!off.some(text => /wait at a ride/.test(text)), 'no line Ticket promise while queue_tickets is off');
  assert.ok(freeTicketWays(true).some(way => /first wait at a ride earns a Ticket/.test(way.text)));
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  const render = shop.slice(shop.indexOf('<ScrollView ref={scroll}'));
  assert.ok(render.indexOf('>FREE TICKETS<') > 0 && render.indexOf('>FREE TICKETS<') < render.indexOf("onSection('featured')"),
    'the free ways sit above the packs');
});

test('Supplies: every purchase door is listed whenever its switch is on, regardless of rung (App Review path)', () => {
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /const passOn = useMoneyFlag\('shark_pass'\);/);
  assert.match(shop, /<SharkPassDoor switchOn=\{passOn\} playerId=\{player\?\.id \?\? null\} \/>/);
  assert.match(shop, /const value = !!state\?\.enabled && !!state\.season;[\s\S]{0,120}if \(live\) setSeason\(value\);/,
    'the door also trusts the player\'s own pass, so a switch read before sign-in never hides it');
  // Flags are read per signed-in player in the help glossary (no anonymous cache that could hide a preview switch).
  assert.doesNotMatch(read('src/components/help/HelpProvider.tsx'), /useMoneyFlag/);
  assert.match(shop, /The Shark Pass and Shark Pass Plus/);
  assert.match(shop, /\{!vip && <VipCard/);
  assert.match(shop, /\{vip && giftPlansOn && <VipGiftDoor \/>\}/);
  assert.doesNotMatch(shop, /useRung\(/, 'a purchase screen never waits for a rung');
  // VIP's page lists the gift plans for anyone who is not a member yet.
  assert.match(read('src/screens/MembershipScreen.tsx'), /\{!member && player && canBuy && plan && <GiftPlans \/>\}/);
  // One word per thing: held passes are Extra tries; the Park Day Pack has its own heading; worth only at the gate.
  assert.match(shop, /key === 'rescue' \? 'Extra tries'/);
  assert.match(shop, /'EXTRA TRY' : 'EXTRA TRIES'/);
  assert.match(shop, />Park day</);
  assert.doesNotMatch(read('src/components/money/BundleCard.tsx'), /\bWorth \$|worth\.worth\}/, 'Worth $X lives only in the grown-up sheet');
  assert.match(read('src/services/money/supplies.ts'), /rescue_passes: \['extra try', 'extra tries'\]/);
});

function tutorialApp(store, auth) {
  const stepsModule = loadTs('src/components/Tutorial/steps.ts');
  return runtime('src/components/Tutorial/TutorialProvider.tsx', {
    './steps': stepsModule,
    './tutorialLayout': loadTs('src/components/Tutorial/tutorialLayout.ts'),
    './tutorialStore': loadTs('src/components/Tutorial/tutorialStore.ts'),
    './TeacherShark': { default: 'Finn' }, './SpotlightOverlay': { default: 'Spotlight' },
    '../../games/memory/MemoryGame': { default: 'Memory' },
    '../../context/AuthProvider': { AuthContext: auth },
    '../../services/guestTaste': { claimGuestWarmup: async () => false },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async key => (store.has(key) ? store.get(key) : null),
      setItem: async (key, value) => { store.set(key, value); },
      removeItem: async key => { store.delete(key); },
    } },
  }, { children: 'map' }, { requestAnimationFrame: fn => { fn(); return 1; } });
}

test('Finn per account: a second shark on the same phone meets the park lesson (must-fix 32)', async () => {
  const store = new Map();
  const auth = { value: { player: { id: 5, total_experience: 0 } } };
  const app = tutorialApp(store, auth);
  await app.settle(); await app.settle();
  const state = () => app.tree.props.value;
  state().startTutorial('park_arrival'); app.render();
  assert.equal(state().isActive, true, 'the first kid meets Finn');
  state().skipTutorial(); app.render(); await app.settle();
  assert.equal(state().hasCompleted('park_arrival'), true);
  assert.ok(store.has('@tps_tutorial_completed@p5'), 'saved under the first kid\'s id');
  // The sibling signs in on the same phone.
  auth.value = { player: { id: 6, total_experience: 0 } }; app.render(); await app.settle(); await app.settle();
  assert.equal(state().hasCompleted('park_arrival'), false, 'the second account has its own record');
  state().startTutorial('park_arrival'); app.render();
  assert.equal(state().isActive, true, 'the second kid meets Finn too');
});

test('Finn per account: the phone\'s old record goes to the first account only; veterans still skip every lesson', async () => {
  const { loadCompleted, tutorialKey } = loadTs('src/components/Tutorial/tutorialStore.ts');
  const store = new Map([['@tps_tutorial_completed', JSON.stringify(['onboarding', 'park'])]]);
  const storage = { getItem: async key => (store.has(key) ? store.get(key) : null), setItem: async (key, value) => { store.set(key, value); } };
  const first = await loadCompleted(storage, 5);
  assert.equal(first.completed.has('park_arrival'), true, 'saw the park guide: no second arrival lesson');
  assert.equal(store.get('@tps_tutorial_completed_owner'), '5');
  const second = await loadCompleted(storage, 6);
  assert.equal(second.completed.size, 0);
  assert.equal(second.fresh, true, 'a sibling starts fresh (the provider still applies the veteran rule)');
  assert.equal((await loadCompleted(storage, 5)).completed.has('onboarding'), true, 'the first account keeps it');
  assert.equal(tutorialKey(null), null, 'signed out: nothing is read or written');
  const provider = read('src/components/Tutorial/TutorialProvider.tsx');
  assert.match(provider, /\(player\.completed_tasks_count \?\? 0\) > 0 \|\|/, 'the veteran auto-complete rule stays');
  assert.match(provider, /if \(!loadedFor\.fresh \|\| completedSequences\.size > 0\) return;/);
});

test('Finn hands off to the guide with park help page 1\'s picture, and the shop coach never talks about ads', () => {
  const steps = loadTs('src/components/Tutorial/steps.ts');
  const park = steps.getStepsForSequence('park_arrival');
  const handoff = park[park.length - 1];
  assert.equal(handoff.title, 'Start your collection');
  assert.equal(handoff.picture, 'win_coins');
  assert.match(handoff.text, /Every ride has a coin/);
  assert.match(read('src/components/Tutorial/TeacherShark.tsx'), /picture === 'win_coins' && [\s\S]*?<HowToDemo art="park"/);
  const store = steps.getStepsForSequence('store')[0];
  assert.doesNotMatch(`${store.text} ${store.subtitle}`, /\bads?\b/i);
});

test('glossary lines follow the player\'s switches: line Tickets only with Queue Tickets, no boss promise while bosses are off', () => {
  const g = loadTs('src/services/help/glossary.ts');
  const off = g.glossaryForSwitches(g.LOCAL_GLOSSARY, { queueTickets: false, rideBoss: false });
  assert.doesNotMatch(off.tickets.earn, /wait|line/i);
  assert.match(off.tickets.earn, /3 treats at home = 1 Ticket/);
  const on = g.glossaryForSwitches(g.LOCAL_GLOSSARY, { queueTickets: true, rideBoss: false });
  assert.equal(on.tickets.earn, g.TICKETS_EARN_WITH_LINE);
  // An older server's energy line promises bosses: while bosses are off the local line wins.
  const server = g.mergeServerGlossary(g.LOCAL_GLOSSARY, { currencies: [{ key: 'energy', what: 'Powers boss raids and ride coin level-ups.', earn: 'Get it from home finds.' }] });
  assert.equal(g.glossaryForSwitches(server, { rideBoss: false }).energy.what, 'Levels up your ride coins.');
  assert.equal(g.glossaryForSwitches(server, { rideBoss: true }).energy.what, 'Powers boss raids and ride coin level-ups.');
  assert.equal(g.LOCAL_GLOSSARY.energy.what, 'Levels up your ride coins.', 'Energy says level-ups first');
  assert.match(read('src/components/help/HelpProvider.tsx'), /glossaryForSwitches\(serverGlossary, \{ queueTickets, rideBoss \}\)/);
});

test('first words teach the loop: the welcome line, the third home card, the splash tips', () => {
  assert.match(read('src/screens/WelcomeScreen.tsx'), /'Every ride has a coin\.\\nWin it and fill your park shelf\.'/);
  assert.doesNotMatch(read('src/screens/WelcomeScreen.tsx'), /Beat bosses/);
  const intro = read('src/screens/ExploreScreen/HomeIntro.tsx');
  assert.match(intro, /body: 'Every 3 treats = 1 Ticket for your park day\.'/);
  const crumbs = JSON.parse(read('src/api/defaults/crumbs.json'));
  const facts = crumbs.labels.splash_screen_facts;
  assert.equal(facts[0], 'Every ride has a coin. Win it and fill your park shelf!');
  for (const fact of facts) assert.doesNotMatch(fact, /boss|Rush|double|points|Shark Shop|Secret tasks/i, fact);
  assert.ok(!crumbs.labels.membership_benefits.some(line => /finds/.test(line)));
});

test('Standings counts "Wins this week" with the coin-and-check picture, and its clock never ticks or turns red', () => {
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, />Wins this week</);
  assert.doesNotMatch(board, /BRAND\.red\b/);
  assert.match(read('src/screens/LeaderboardsScreen/MiniPodium.tsx'), /<GameIcon name="check"/);
  const model = loadTs('src/screens/LeaderboardsScreen/standingsV2Model.ts');
  const end = '2026-10-05T07:00:00Z';
  assert.equal(model.weekDots(end, Date.parse('2026-10-05T05:59:00Z')).label, 'Ends tonight');
  assert.doesNotMatch(model.weekDots(end, Date.parse('2026-10-05T05:59:00Z')).spoken, /\d+ minutes/);
});

test('the Community Center Finn tip runs once on the first visit, waiting its turn; the Shark Shop has a back button where the footer was', () => {
  const center = read('src/screens/CommunityCenterScreen.tsx');
  assert.match(center, /useTutorialWhenReady\('community_center', !loading && !!center && !sheetUp\)/);
  const shop = read('src/screens/StoreScreen.tsx');
  assert.match(shop, /testID="shop-bottom-back"/);
  // Its own solid strip where the footer was, in the layout: it never covers a pack, a VIP tile or a gear card.
  assert.match(shop, /testID="shop-bottom-back" style=\{\{ marginTop: 'auto'/);
  assert.match(shop, /height: SHOP_BACK_STRIP \+ insets\.bottom, paddingBottom: insets\.bottom/);
  assert.doesNotMatch(shop, /position: 'absolute', left: 14, bottom: insets\.bottom/, 'no floating button over the shop');
  assert.match(read('src/screens/StoreScreen/GearShelf.tsx'), /paddingBottom: insets\.bottom \+ 48/, 'the gear shelf pads its last row clear of the strip');
});

test('one word per thing in the shelf-words files: no Mastery, no RIDE COINS, no Rescue Pass, no home finds', () => {
  const v = require('./vocabulary.test.cjs');
  const mine = v.scanVocabulary().filter(f => f.owner === 'shelf-words');
  assert.deepEqual(mine.map(f => `${f.file}: ${f.hits.map(h => h.rule).join(', ')}`), []);
});

test('the coin card hides the park gym line while gyms are off; Energy shows on the shelf header once coin levels open', () => {
  const perks = [{ id: 1, type: 'gym_points', name: 'Park Gym Power', description: 'Place this coin in a park gym for 40 team points.' },
    { id: 2, type: 'cosmetic', name: 'Gold rim', description: 'A gold rim.' }];
  const sheet = levelSheet({ rideCoin: { id: 13, ride_name: 'Jungle Cruise', current_level: 1, max_level: 5, is_unlocked: true,
    parts_to_next_level: 3, energy_to_next_level: 10, next_level_perks: perks, current_perks: perks } });
  const text = JSON.stringify(sheet.view.tree);
  assert.doesNotMatch(text, /park gym/i, 'gyms are off: no gym promise');
  assert.match(text, /A gold rim/);
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /energy=\{canChooseGoal && coinLevels\.open \? viewer\?\.energy \?\? 0 : null\}/);
});

test('the vocabulary test is strict: shelf-words and every unowned file fail the build on a retired word', () => {
  const v = require('./vocabulary.test.cjs');
  assert.equal(v.STRICT, true);
  assert.equal(v.PENDING_LANES.has('shelf-words'), false);
  assert.equal(v.ownerOf('src/screens/SomeNewScreen.tsx').owner, 'shelf-words', 'a new unowned file is strict at once');
  assert.equal(v.scanSource("const a = <Text>Rescue Pass</Text>;", 'x.tsx')[0].rule, 'rescue-pass');
});

test('round 2 (ledger 38): no coin piles on the Starter Pack or Standings, existing Alex art only', () => {
  const ui = read('src/components/money/moneyUi.tsx');
  assert.match(ui, /chest: require\('\.\.\/\.\.\/\.\.\/assets\/images\/screens\/redeem\/chest_closed\.png'\)/, "the Starter Pack shows Alex's closed chest");
  assert.doesNotMatch(ui, /supplies\/chest\.webp/, 'not the overflowing gold chest');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/images/screens/redeem/chest_closed.png')), 'an existing file');
  for (const file of ['MiniPodium.tsx', 'StandingsPodium.tsx', 'StandingsBoardV2.tsx']) {
    const src = read(`src/screens/LeaderboardsScreen/${file}`);
    assert.doesNotMatch(src, /barrel(-flipped)?\.png/, `${file}: no gold barrels`);
    assert.match(src, /<PodiumSteps /, `${file}: plain podium steps`);
  }
  const steps = read('src/screens/LeaderboardsScreen/PodiumSteps.tsx');
  assert.doesNotMatch(steps, /require\(/, 'the steps are drawn from the board UI, no new art');
});

test('round 2 (ledger 37, 39): help pages show LinePlay\'s own icon; the app never names the Green Train Toy', () => {
  const glossary = read('src/services/help/glossary.ts');
  assert.match(glossary, /export const LINEPLAY_ICON: GameIconName = resolveIconName\('line'\) \?\? 'ride';/);
  assert.match(glossary, /\{ key: 'lineplay', label: 'LinePlay', icon: LINEPLAY_ICON,/);
  const sheets = read('src/services/help/helpSheets.ts');
  assert.equal((sheets.match(/\{ icon: LINEPLAY_ICON, text: '[^']*LinePlay/g) || []).length, 2);
  assert.doesNotMatch(glossary + sheets, /icon: 'timer'[^}]*LinePlay|LinePlay[^}]*icon: 'queue'/, 'the pocket watch is Wait Times only');
  const v = require('./vocabulary.test.cjs');
  assert.equal(v.scanSource("const a = 'Green Train Toy';", 'x.ts')[0].rule, 'green-train');
});

test('round 2: one word for money: Shark Coins, never bare coins beside ride coins', () => {
  const g = read('src/services/help/glossary.ts');
  assert.match(g, /\{ key: 'coins', label: 'Shark Coins', icon: 'coins'/);
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /coins: 'Shark Coins buy gear for your shark in the Shark Shop\.'/);
  assert.match(shop, /key === 'coins' \? 'Shark Coins'/);
  assert.match(read('src/services/money/copy.ts'), /coins: \['Shark Coin', 'Shark Coins'\]/);
  assert.match(read('tools/clarity/rules.cjs'), /key: 'coins', use: 'Shark Coins'/);
  // The pure helper, read straight from the file: "2x XP and coins" reads Shark Coins, ride coins stay.
  const fnSrc = shop.match(/export function sharkCoinsWord[\s\S]*?\n\}/)[0];
  const ts = require(path.join(ROOT, 'node_modules/typescript'));
  const js = ts.transpileModule(fnSrc.replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const sharkCoinsWord = new Function(`${js}; return sharkCoinsWord;`)();
  assert.equal(sharkCoinsWord('2x XP and coins'), '2x XP and Shark Coins');
  assert.equal(sharkCoinsWord('Win ride coins'), 'Win ride coins');
  assert.equal(sharkCoinsWord('Shark Coins'), 'Shark Coins');
});

test('round 2: GET RIDE PARTS leaves for the map at once (no card fade, quick sheet exit)', () => {
  const sheet = read('src/components/CoinLevelingModal.tsx');
  assert.match(sheet, /setFastExit\(true\); stopUpgradeEffects\(\); onGetParts\(\); onClose\(\);/);
  assert.doesNotMatch(sheet, /pendingGetPartsRef/, 'round 4: nothing waits for onModalHide');
  assert.match(sheet, /animationOutTiming=\{fastExit \? 90 :/);
  assert.match(sheet, /backdropTransitionOutTiming=\{fastExit \? 90 : undefined\}/);
});

test('round 2: Standings says wins (BLUEPRINT 5.9); help reads flags once per signed-in player', () => {
  const m = read('src/screens/LeaderboardsScreen/standingsV2Model.ts');
  assert.match(m, /\(one \? 'win' : 'wins'\)/);
  assert.doesNotMatch(m, /void hours|void minutes/);
  assert.doesNotMatch(read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx'), /const pulse = useSharedValue/);
  // Help keeps its one per-player read (the shared cache may hold a signed-out answer); it is one root provider.
  const help = read('src/components/help/HelpProvider.tsx');
  assert.equal((help.match(/getFeatureFlags\(\)/g) || []).length, 1);
  assert.match(help, /\}, \[playerId\]\);/);
  assert.match(read('src/screens/StoreScreen/SuppliesShop.tsx'), /passSeasonCache\?\.playerId === playerId/, 'the pass read is cached per player');
});

test('round 2: a sight coin card never sends you to a line it does not have', () => {
  const sheet = read('src/components/CoinLevelingModal.tsx');
  assert.match(sheet, /'Each new win of this coin earns a Ride Part\. Tap to see the way there\.'/);
  assert.match(sheet, /\{sight \? 'Win it again' : 'Stand in its line'\}/);
  assert.match(read('src/components/TaskCoinModal.tsx'), /sight=\{sight\}/);
  assert.match(read('src/screens/ParkScreen.tsx'), /sight=\{section === 'normal' && rideKind\(task\.id\) === 'coin'\}/);
});

test('round 3, ledger 38: the Standings help page stands on the plain podium steps too (no barrels, no coin pile)', () => {
  const hero = read('src/components/help/HelpHero.tsx');
  assert.doesNotMatch(hero, /podium-barrels/, 'the barrels-on-coins picture is gone from the help hero');
  assert.doesNotMatch(hero, /ART\.barrel/);
  assert.match(hero, /import PodiumSteps, \{ type PodiumStep \} from '\.\.\/\.\.\/screens\/LeaderboardsScreen\/PodiumSteps';/);
  assert.match(hero, /<PodiumSteps steps=\{steps\} gap=\{gap\} numberAt="top" \/>/, 'round 4: 2, 1, 3 sit under the top edges, above the stage frame');
  // The sheet page that draws it is still the Standings "Top 3 win each week" page.
  assert.match(read('src/services/help/helpSheets.ts'), /key: 'podium', hero: 'standings_podium', headline: 'Top 3 win each week'/);
  // No Standings surface (screens or help) points at a barrel file.
  for (const file of ['src/screens/LeaderboardScreen.tsx', 'src/components/help/HelpHero.tsx']) {
    assert.doesNotMatch(read(file), /barrel(-flipped)?\.(png|webp)|podium-barrels/, file);
  }
});

test('round 3: the shelf NEXT COIN names the coin the map guide holds, so the shelf and the map card agree', () => {
  const copy = loadTs('src/services/collection/nextCoinCopy.ts');
  const rows = [{ id: 1, name: 'Tiki Room' }, { id: 2, name: 'Haunted Mansion' }];
  const target = { taskId: 2, parkId: 8, name: 'Haunted Mansion', reason: 'chosen' };
  assert.equal(copy.guideShelfPick(target, 8, true, rows).name, 'Haunted Mansion', 'GET RIDE PARTS on Haunted Mansion: both name it');
  assert.equal(copy.guideShelfPick(target, 2, true, rows), null, 'another park keeps the shelf pick');
  assert.equal(copy.guideShelfPick(target, 8, false, rows), null, 'away from the park the shelf plans on its own');
  assert.equal(copy.guideShelfPick(null, 8, true, rows), null, 'no guide target yet: the shelf pick');
  assert.equal(copy.guideShelfPick({ ...target, taskId: 9 }, 8, true, rows), null, 'a coin this shelf does not list');
  assert.equal(copy.guideShelfHint('in_line'), 'You are in its line. Play while you wait!');
  assert.equal(copy.guideShelfHint('level_up'), 'Ready to level up!');
  assert.equal(copy.guideShelfHint('nearest_open'), 'The map shows the way.');
  assert.equal(copy.guideShelfHint('plan'), 'Your plan. The map shows the way.');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /const guideTarget = useSyncExternalStore\(guide\.subscribe, guide\.current, guide\.current\);/);
  assert.match(park, /const nextCoinTask = levelUpTask \?\? guideTask \?\? \(/, 'GO goes where the card says');
  assert.match(park, /nearbyRideName=\{guideTask \? guideTask\.name : guideOverGoal \? null : nearbySuggestion\?\.task\.name\}/);
  assert.match(park, /nextRideName=\{levelUpTask \? levelUpTask\.name : guideOverGoal \? null : parkTripGoal\?\.ride_name\}/);
});

test('round 3: money next to a price says Shark Coins in the Community Center, Finn and the bundled crumbs', () => {
  const center = read('src/screens/CommunityCenterScreen.tsx');
  assert.match(center, /Not Enough Shark Coins!/);
  assert.match(center, /<Text style=\{styles\.exchangeLabel\}>Shark Coins<\/Text>/);
  assert.match(center, /A gift costs \$\{GIFT_COST\} Shark Coins/);
  assert.match(center, /Leave a gift for \$\{GIFT_COST\} Shark Coins/);
  assert.match(center, /includes\('Not enough coins'\)/, 'the server error match stays');
  assert.match(read('src/components/Tutorial/steps.ts'), /Leaving a gift costs 350 Shark Coins and gives you 2 Tickets\./);
  const crumbs = JSON.parse(read('src/api/defaults/crumbs.json'));
  const all = JSON.stringify(crumbs);
  assert.doesNotMatch(all, /XP and coins|free coins|\d+ coins\./);
  assert.match(all, /2x XP and Shark Coins/);
  assert.match(all, /earn 25 free Shark Coins/);
});

test('round 4: a coin you own is never the shelf NEXT COIN (GO on X, win X, the shelf names a new coin)', () => {
  const copy = loadTs('src/services/collection/nextCoinCopy.ts');
  const rows = [{ id: 1, name: 'Tiki Room' }, { id: 2, name: 'Haunted Mansion' }, { id: 3, name: 'Jungle Cruise' }];
  const base = { target: null, plan: null, levelUpGoal: null, parkId: 8, atPark: true, rows, owned: new Set() };
  // GO on Tiki Room: the plan names it while you do not own it.
  assert.equal(copy.shelfGuidePick({ ...base, plan: 1 }).row.name, 'Tiki Room');
  assert.equal(copy.shelfGuidePick({ ...base, plan: 1 }).levelUp, false);
  assert.equal(copy.shelfGuidePick({ ...base, plan: 1 }).reason, 'plan');
  // Win Tiki Room: the plan on an owned coin never shows, and it is the plan to forget.
  const won = new Set([1]);
  assert.equal(copy.shelfGuidePick({ ...base, plan: 1, owned: won }), null, 'the shelf falls back to its own next coin');
  assert.equal(copy.stalePlan(1, won, null, 1), 1, 'guide.clearPlan() runs for it (the shelf watched it unowned)');
  assert.equal(copy.stalePlan(3, won, null, 3), null, 'an unowned plan stays');
  assert.equal(copy.stalePlan(null, won, null, null), null);
  // The map's target on an owned coin (not a level up) never shows either.
  assert.equal(copy.shelfGuidePick({ ...base, owned: won, target: { taskId: 1, parkId: 8, reason: 'chosen' } }), null);
  assert.equal(copy.shelfGuidePick({ ...base, owned: won, target: { taskId: 3, parkId: 8, reason: 'nearest_open' } }).row.name, 'Jungle Cruise');
  // The old helper skips owned rows too.
  assert.equal(copy.guideShelfPick({ taskId: 1, parkId: 8 }, 8, true, rows, won), null);
  assert.equal(copy.guideShelfPick({ taskId: 2, parkId: 8 }, 8, true, rows, won).name, 'Haunted Mansion');
});

test('round 4: GET RIDE PARTS on an owned coin shows LEVEL UP GOAL with the parts picture and GO to its line', () => {
  const copy = loadTs('src/services/collection/nextCoinCopy.ts');
  const rows = [{ id: 1, name: 'Tiki Room' }, { id: 2, name: 'Haunted Mansion' }];
  const owned = new Set([2]);
  const base = { target: null, plan: 2, levelUpGoal: 2, parkId: 8, atPark: true, rows, owned };
  const pick = copy.shelfGuidePick(base);
  assert.equal(pick.row.name, 'Haunted Mansion');
  assert.equal(pick.levelUp, true, 'LEVEL UP GOAL, never NEXT COIN');
  assert.equal(pick.reason, 'coin_parts');
  assert.equal(copy.levelUpGoalHint(pick.reason, false), 'Its line earns Ride Parts.');
  assert.equal(copy.levelUpGoalHint(pick.reason, true), 'Win it again for Ride Parts.');
  assert.equal(copy.levelUpGoalHint('level_up', false), 'Ready to level up!');
  assert.equal(copy.stalePlan(2, owned, 2, 2), null, 'a level-up goal is not a finished plan');
  // After guide-map merges, the map may resolve elsewhere; the shelf keeps its own LEVEL UP GOAL card.
  assert.equal(copy.shelfGuidePick({ ...base, target: { taskId: 1, parkId: 8, reason: 'nearest_open' } }).row.name, 'Haunted Mansion');
  // ...unless the guide holds a coin right here right now (in range, in its line, the line story).
  assert.equal(copy.shelfGuidePick({ ...base, target: { taskId: 1, parkId: 8, reason: 'in_range' } }).row.name, 'Tiki Room');
  // The map's own level-up target on that coin says ready.
  assert.equal(copy.shelfGuidePick({ ...base, target: { taskId: 2, parkId: 8, reason: 'level_up' } }).reason, 'level_up');
  // Any other GO moves the plan: the level-up goal ends.
  assert.equal(copy.shelfGuidePick({ ...base, plan: 1 }).row.name, 'Tiki Room');
  assert.equal(copy.shelfGuidePick({ ...base, plan: 1 }).levelUp, false);
  assert.equal(copy.shelfGuidePick({ ...base, atPark: false }), null, 'away from the park the shelf plans on its own');

  const goal = loadTs('src/services/collection/levelUpGoal.ts').levelUpGoal;
  let heard = 0;
  const off = goal.subscribe(() => { heard++; });
  goal.set(2); goal.set(2);
  assert.equal(goal.get(), 2); assert.equal(heard, 1, 'one change, one emit');
  goal.clear(1); assert.equal(goal.get(), 2, 'clearing another coin keeps it');
  goal.clear(2); assert.equal(goal.get(), null);
  off();

  const card = read('src/components/TaskCoinModal.tsx');
  assert.match(card, /levelUpGoal\.set\(task\.id, player\?\.id\);\n\s*guide\.setTarget\(task\.id, 'coin_parts'\);/);
  assert.match(card, /levelUpGoal\.clear\(task\.id\);/, 'a level-up ends the goal');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /shelfGuidePick\(\{ target: guideTarget, plan: guidePlan, levelUpGoal: levelUpId,/);
  assert.match(park, /owned: ownedIds \}\)/);
  assert.match(park, /guide\.clearPlan\(\)/, 'a won plan is forgotten (contract API, import only)');
  assert.match(park, /nextRideOwned=\{levelUpTask \? true :/);
  assert.match(park, /ownedGo=\{!!levelUpTask\}/);
  const header = read('src/screens/ParkCollectionHeader.tsx');
  assert.match(header, /nextRideOwned \? 'LEVEL UP GOAL'/);
  assert.match(header, /name=\{nextRideOwned \? 'parts' : 'coin'\}/);
  assert.match(header, /\(!nextRideOwned \|\| ownedGo\)/, 'GO stays for a level-up goal');
});

test('round 4: the unfound sight card says Sight Coin (the tab word) and its prize says Shark Coins', () => {
  const card = read('src/components/UnfoundCoinModal.tsx');
  assert.match(card, /ribbon: kind === 'coin' \? 'Sight Coin' : 'Spot Coin'/);
  assert.match(card, /\+\$\{task\.coins\} Shark Coins/);
  assert.doesNotMatch(card, /\+\$\{task\.coins\} coins/);
  assert.match(card, /`Costs \$\{task\.ticket_cost\} Ticket\$\{/, 'Tickets are a named thing: capital T');
});

test('round 5: the shelf NEXT COIN never names a closed, down or refurbishing ride; at night the sights stay open', () => {
  const copy = loadTs('src/services/collection/nextCoinCopy.ts');
  // Nearest first: Tiki Room, then Jungle Cruise, then Walt Statue (a sight).
  const rows = [{ id: 1, name: 'Tiki Room' }, { id: 2, name: 'Jungle Cruise' }, { id: 3, name: 'Walt Statue', sight: true }];
  const nearest = eligible => rows.find(eligible) ?? null;
  const pick = (status, extra = {}) => copy.shelfNearbyPick({ feedFresh: true, isSight: row => !!row.sight, nearest,
    status: row => status[row.name] ?? null, anyRideOpen: Object.values(status).includes('OPERATING'), ...extra });
  // Daytime: Tiki Room is CLOSED, Jungle Cruise is open. The shelf names Jungle Cruise, reported open.
  let next = pick({ 'Tiki Room': 'CLOSED', 'Jungle Cruise': 'OPERATING' });
  assert.equal(next.row.name, 'Jungle Cruise'); assert.equal(next.reportedOpen, true);
  assert.equal(next.hint, 'Nearest coin, reported open.');
  for (const shut of ['CLOSED', 'DOWN', 'REFURBISHMENT']) {
    next = pick({ 'Tiki Room': shut, 'Jungle Cruise': 'OPERATING' });
    assert.notEqual(next.row.name, 'Tiki Room', `${shut} is never the nearest coin you can win next`);
  }
  // A ride with no live answer comes after every open ride, with a check-it line.
  next = pick({ 'Tiki Room': null, 'Jungle Cruise': 'OPERATING' });
  assert.equal(next.row.name, 'Jungle Cruise');
  next = pick({ 'Tiki Room': 'CLOSED', 'Jungle Cruise': 'DOWN', 'Space Mountain': 'OPERATING' });
  assert.equal(next.row.name, 'Walt Statue', 'no open coin ride left: the sight, always open');
  assert.equal(next.hint, 'Sights are always open.');
  // Night capture: every ride CLOSED. Rides rest, the sight stays open with GO.
  next = pick({ 'Tiki Room': 'CLOSED', 'Jungle Cruise': 'CLOSED' });
  assert.equal(next.kind, 'coin'); assert.equal(next.row.name, 'Walt Statue');
  assert.equal(next.hint, 'Rides are resting. Sights stay open.');
  // Night with the sight already won: the park is closed (no GO).
  const noSight = copy.shelfNearbyPick({ feedFresh: true, anyRideOpen: false, isSight: row => !!row.sight,
    status: () => 'CLOSED', nearest: eligible => rows.filter(r => !r.sight).find(eligible) ?? null });
  assert.deepEqual({ ...noSight }, { kind: 'closed', title: 'The park is closed', hint: 'See you next park day.' });
  // No live feed yet: the nearest coin, as before.
  next = copy.shelfNearbyPick({ feedFresh: false, anyRideOpen: false, isSight: () => false, status: () => null, nearest });
  assert.equal(next.row.name, 'Tiki Room'); assert.equal(next.hint, 'The nearest coin you can win next.');

  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /shelfNearbyPick<TaskType>\(\{/);
  assert.match(park, /anyRideOpen: !!freshWaitEntries\?\.some\(entry => entry\.status === 'OPERATING'\)/);
  assert.match(park, /parkResting=\{/);
  const header = read('src/screens/ParkCollectionHeader.tsx');
  assert.match(header, /\} : parkResting \? \{\n\s*eyebrow: 'NEXT COIN', name: parkResting\.title, hint: parkResting\.hint,/);
});

test('round 5: GET RIDE PARTS never leaves the old coin on the outgoing shelf, and the map starts 34 ms later', () => {
  const card = read('src/components/TaskCoinModal.tsx');
  assert.match(card, /shelfLeaving\.value = 1;\n\s*setTimeout\(\(\) => \{ shelfLeaving\.value = 0; \}, 1500\);\n\s*setTimeout\(\(\) => \{\n\s*onShowOnMap\(\);\n\s*levelUpGoal\.set\(task\.id, player\?\.id\);\n\s*guide\.setTarget\(task\.id, 'coin_parts'\);\n\s*\}, LEAVE_FADE_MS\);/,
    'fade first (UI thread), then the map, then the pointer: the shelf never re-renders before the map');
  const header = read('src/screens/ParkCollectionHeader.tsx');
  assert.match(header, /useAnimatedStyle\(\(\) => \(\{ opacity: 1 - shelfLeaving\.value \}\)\)/, 'a UI-thread fade, no React render');
  assert.match(header, /goal && <Animated\.View style=\{\[styles\.goal, leavingStyle\]\}>/);
  assert.match(header, /useEffect\(\(\) => \{ shelfLeaving\.value = 0; \}, \[\]\);/, 'a new shelf shows its card');
  assert.match(read('src/services/collection/shelfLeaving.ts'), /export const shelfLeaving = makeMutable\(0\);/);
  assert.match(read('src/services/collection/shelfLeaving.ts'), /export const LEAVE_FADE_MS = 34;/);
});

test('round 5: the shelf forgets only a plan it watched you win; the level-up goal belongs to one player', () => {
  const copy = loadTs('src/services/collection/nextCoinCopy.ts');
  const owned = new Set([1, 2]);
  assert.equal(copy.stalePlan(1, owned, null, 1), 1, 'watched unowned, now won: forget it');
  assert.equal(copy.stalePlan(2, owned, null, 1), null, 'another surface pointed at an owned coin: not ours to clear');
  assert.equal(copy.stalePlan(2, owned, null, null), null);
  assert.equal(copy.stalePlan(1, owned, 1, 1), null, 'a level-up goal stays');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /stalePlan\(guidePlan, ownedIds, levelUpId, watchedPlan\.current\)/);
  assert.match(park, /watchedPlan\.current = guidePlan != null && !ownedIds\.has\(guidePlan\) \? guidePlan : null;/);
  assert.match(park, /levelUpGoal\.getFor\(viewerId\)/);
  assert.match(park, /levelUpGoal\.forPlayer\(viewerId\)/);

  const goal = loadTs('src/services/collection/levelUpGoal.ts').levelUpGoal;
  goal.set(5, 101);
  assert.equal(goal.getFor(101), 5);
  assert.equal(goal.getFor(202), null, 'a second account on the phone never sees it');
  assert.equal(goal.getFor(null), null, 'signed out: none');
  goal.forPlayer(101); assert.equal(goal.getFor(101), 5, 'same player keeps it');
  goal.forPlayer(202); assert.equal(goal.get(), null, 'a different player forgets it');
  goal.set(5, 101); goal.forPlayer(null); assert.equal(goal.get(), null, 'sign-out forgets it');
});

test('round 5: Profile counts shelf coins in the shelf word with the coin picture', () => {
  const stats = read('src/components/Stats.tsx');
  assert.match(stats, /label: 'Shelf Coins',\n\s*value: rideCoins \?\? visibleCount\(player\.park_coins_count\),\n\s*iconIndex: 1,\n\s*gameIcon: 'coin'/);
  assert.doesNotMatch(stats, /label: 'Ride Coins'/);
  assert.match(read('src/components/Tutorial/steps.ts'), /Then follow the glowing coin on the map\./);
  assert.match(read('src/screens/LeaderboardsScreen/PodiumSteps.tsx'), /numberAt === 'top' \? 'rgba\(5,52,110,0\.55\)'/);
});

test('round 5: the park day story waits on top after park_day_done', () => {
  const model = loadTs('src/services/collection/shelfModel.ts');
  assert.equal(model.storyOnTop({ atPark: true, ridesWonToday: 0, milestone: false, justLeft: true }), true,
    'guide-map says the day is done: on top even before the place check moves');
  assert.equal(model.storyOnTop({ atPark: false, ridesWonToday: 2, milestone: false }), true, 'left the park with wins');
  assert.equal(model.storyOnTop({ atPark: true, ridesWonToday: 2, milestone: false }), false, 'still at the park: lower');
});

test('after park_day_done the shelf puts the park day story on top, with fresh numbers, and opens nothing by itself', () => {
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /parkDaySignal\.subscribe/, 'ParkScreen subscribes to park_day_done');
  assert.match(park, /dayDone\.parkId === Number\(park\) && dayDone\.day === localDay\(Date\.now\(\)\)/, 'only this park, only today');
  assert.match(park, /storyOnTop\(\{ atPark: inThisPark, justLeft,/, 'storyOnTop gets justLeft from the signal');
  assert.match(park, /recapCache\.current = null;\n\s*void loadRecap\(Number\(park\)\)/, 'the story is read fresh when the day ends');
  // The card keeps its own rule: Flex reveals never open by themselves.
  assert.doesNotMatch(read('src/screens/ParkDayRecapCard.tsx'), /shareDay\(\);/);
  const ladder = read('src/components/guide/useParkDayLadder.ts');
  assert.match(ladder, /parkDaySignal\.publish\(/, 'the map publishes the signal');
});

test('round 5: the shelf opens with the last live answer, so NEXT COIN never flashes an unchecked ride', () => {
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /let lastWaitSnapshot: WaitSnapshot \| null = null;/);
  assert.match(park, /useState<WaitSnapshot \| null>\(\(\) => lastWaitSnapshot\)/);
  assert.match(park, /lastWaitSnapshot = \{ parkId: Number\(park\), entries, checkedAt: Date\.now\(\) \};/);
  // The 2 minute fresh rule still guards it.
  assert.match(park, /Date\.now\(\) - waitSnapshot\.checkedAt < 120_000/);
});

test('round 5: VIP perk lines say treats, Shark Coins and Ticket on Supplies and the VIP page', () => {
  const ts = require(path.join(ROOT, 'node_modules/typescript'));
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  const src = shop.match(/export function sharkCoinsWord[\s\S]*?\n\}/)[0] + '\n' + shop.match(/export function vipPerkWords[\s\S]*?\n\}/)[0];
  const js = ts.transpileModule(src.replace(/export /g, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const words = new Function(`${js}; return vipPerkWords;`)();
  assert.equal(words('2 extra finds on every home hunt'), '2 extra treats on every home hunt');
  assert.equal(words('2x energy, tickets and XP from every find.'), '2x Energy, Tickets and XP from every treat.');
  assert.equal(words('2x XP and coins'), '2x XP and Shark Coins');
  assert.equal(words('A free ticket every day'), 'A free Ticket every day');
  assert.equal(words('Win ride coins'), 'Win ride coins');
  assert.match(shop, /title: vipPerkWords\(p\.title\)/);
  const vip = read('src/screens/MembershipScreen.tsx');
  assert.match(vip, /title: vipPerkWords\(p\.title\), body: vipPerkWords\(p\.body\)/);
});
