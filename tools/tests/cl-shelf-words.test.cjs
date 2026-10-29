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

test('GET RIDE PARTS at the park points the guide at the ride and opens the map after the sheet hides (must-fix 4)', () => {
  let sent = 0;
  const sheet = levelSheet({ onGetParts() { sent++; } });
  assert.equal(sheet.partsButton().props.text, 'Get 2 Ride Parts');
  sheet.partsButton().props.onPress();
  assert.equal(sheet.closes.length, 1, 'the sheet closes');
  assert.equal(sent, 0, 'nothing navigates under a closing sheet');
  sheet.modal().props.onModalHide();
  assert.equal(sent, 1, 'the guide and map step runs once the sheet is gone');
  sheet.modal().props.onModalHide();
  assert.equal(sent, 1, 'only once');
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
  assert.match(sheet, /pendingGetPartsRef\.current = true; setFastExit\(true\); stopUpgradeEffects\(\); onClose\(\);/);
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
  assert.match(hero, /<PodiumSteps steps=\{steps\} gap=\{gap\} \/>/);
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
  assert.match(park, /const guidePick = guideTarget \?\? \(guidePlan != null \? \{ taskId: guidePlan, parkId: Number\(park\), reason: 'plan' \} : null\);/,
    'before the map resolves (or while it rests) the plan GET RIDE PARTS or GO set stands in');
  assert.match(park, /const guideTask = canChooseGoal \? guideShelfPick\(guidePick, Number\(park\), inThisPark, \[\.\.\.tasks, \.\.\.limitedTasks\]\) : null;/);
  assert.match(park, /const nextCoinTask = guideTask \?\? \(/, 'GO goes where the card says');
  assert.match(park, /nearbyRideName=\{guideOverGoal \? guideTarget\?\.name \?\? guideTask\?\.name : nearbySuggestion\?\.task\.name\}/);
  assert.match(park, /nextRideName=\{guideOverGoal \? null : parkTripGoal\?\.ride_name\}/);
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
