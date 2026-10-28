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
  assert.match(shop, /\{passOn && <SharkPassDoor \/>\}/);
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
