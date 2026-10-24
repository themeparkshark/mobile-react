const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/wow-ui-r4.test.cjs
// wow-ui round 4: the water is the loader (it opens only onto the real game screen), the dive
// respects Battery Saver and Dim Flashing Lights, dialogs never read half there, a footer pick you
// can see in a contact sheet, coins that fly to where they live, a refresh shark that fills its gap.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };
const rn = { View: 'View', StyleSheet: { create: v => v, absoluteFill: {} }, Dimensions: { get: () => ({ width: 402, height: 874 }) },
  useWindowDimensions: () => ({ width: 402, height: 874 }) };
const reanimated = { __esModule: true, default: { View: 'AnimatedView', createAnimatedComponent: c => c },
  Easing: { bezierFn: () => t => t } };

function loadDive() {
  return loadTs('src/fx/DiveIris.tsx', {
    react: { useState: v => [typeof v === 'function' ? v() : v, () => {}], useEffect() {} }, 'react/jsx-runtime': {},
    'react-native': rn, '@shopify/react-native-skia': {}, 'react-native-reanimated': reanimated,
    '../gamekit/Haptics': {}, '../RootNavigation': {}, '../ui/motionEasing': easing, '../ui/useUiReducedMotion': {},
    'expo-image': {}, '../ui/SharkRefresh': { SHARK_ART: 1 }, '../../modules/flash-safety': { isDimFlashingLightsEnabled: () => false },
    '../power/PowerProvider': { usePowerBudget: () => ({}) }, '../ui/lastTouch': { recordLastTouch() {}, lastTouch: () => null },
    './diveActive': { setDiveActive() {}, useDiveActive: () => false },
  });
}

test('dive gate: a fresh game screen opens only on its landing signal, never by a timer', () => {
  const { diveGate, DIVE } = loadDive();
  assert.equal(diveGate({ landed: true, sinceCoverMs: 10, targetShown: true, fresh: true }), 'open');
  for (const t of [0, 400, DIVE.safetyMs, DIVE.safetyMs + 2000, DIVE.giveUpMs - 1]) {
    assert.equal(diveGate({ landed: false, sinceCoverMs: t, targetShown: true, fresh: true }), 'hold',
      `a fresh screen that has not laid out keeps the water up at ${t} ms (even with its route in focus)`);
  }
  assert.equal(diveGate({ landed: false, sinceCoverMs: DIVE.giveUpMs, targetShown: false, fresh: true }), 'fade',
    'at the end of its patience the water fades (never an iris onto the old screen)');
  assert.equal(diveGate({ landed: false, sinceCoverMs: DIVE.safetyMs, targetShown: true, fresh: false }), 'open',
    'a game already in the stack opens by its route at the safety check');
  assert.equal(diveGate({ landed: false, sinceCoverMs: DIVE.safetyMs, targetShown: false, fresh: false }), 'hold');
  assert.equal(diveGate({ landed: false, sinceCoverMs: DIVE.safetyMs * 2, targetShown: true, fresh: false, slow: 4 }), 'hold',
    '__diveSlow scales the safety check too');
  const src = read('src/fx/DiveIris.tsx');
  assert.doesNotMatch(src, /addListener\('state'/, 'navigation state plus a few frames is no longer an open trigger');
  assert.match(src, /DIVE\.safetyMs \* devSlow\(\)/);
  assert.match(src, /DIVE\.recheckMs \* slow/, 'the water keeps swimming and re-checks while it holds');
});

test('dive: Battery Saver thins the water, Dim Flashing Lights turns off the gold rim flash', () => {
  const { diveLook, rimGold, DIVE } = loadDive();
  assert.deepEqual({ ...diveLook(false) }, { rays: DIVE.rays, trail: DIVE.trail, ripple: true, clock: true });
  assert.deepEqual({ ...diveLook(true) }, { rays: 2, trail: 4, ripple: false, clock: false });
  for (const o of [0, 0.05, 0.14, 0.3, 0.6, 1]) {
    assert.equal(rimGold(o, 0), 0, `no gold flash at ${o} with Dim Flashing Lights`);
    assert.ok(rimGold(o, DIVE.rimGoldPeak) <= DIVE.rimGoldPeak);
  }
  assert.ok(rimGold(DIVE.rimGoldRise, DIVE.rimGoldPeak) > 0.8, 'a real gold edge where flashes are allowed');
  assert.equal(rimGold(0.7, DIVE.rimGoldPeak), 0, 'gone before the iris is fully open');
  const src = read('src/fx/DiveIris.tsx');
  assert.match(src, /flashPeak\(isDimFlashingLightsEnabled\(\), reduced\)/);
  assert.match(src, /usePowerBudget\(\)/);
});

test('dive: LinePlay is the real screen under the water (no skeleton landing), the crew sheet springs up through the hole', () => {
  const src = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.doesNotMatch(src, /return <DiveLanding/, 'no placeholder landing frame');
  assert.doesNotMatch(src, /function DiveLanding/);
  assert.match(src, /onLayout=\{onRootLayout\}/, 'the real root says when it is laid out');
  assert.match(src, /const diveReady = snapshot\.startedAt != null && snapshot\.playlist\.length > 0;/,
    'the water waits for the wait card and the first round, so no skeleton shows under the opening hole');
  assert.match(src, /DIVE_READY_CAP_MS = 1500/);
  const gym = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.equal((gym.match(/onLayout=\{notifyDiveLanded\}/g) || []).length, 3, 'every GymBattle root tells the water it landed');
  const sheet = read('src/screens/LinePlay/group/WhosInLineSheet.tsx');
  assert.match(sheet, /if \(!visible \|\| !diveSettled\) return null;/);
  assert.match(sheet, /SPRING\.settle\.damping/);
  const dive = read('src/fx/DiveIris.tsx');
  assert.match(dive, /const onOpenStart = \(\) => \{[\s\S]*settleListeners\.forEach\(l => l\(true\)\)/,
    'settled turns true as the water starts to open');
  for (const file of ['src/screens/QueueTimesScreen.tsx', 'src/components/fright/FrightSheet.tsx', 'src/screens/ParkScreen.tsx']) {
    assert.doesNotMatch(read(file), /\.navigate\('LinePlay'/, `${file} dives into LinePlay`);
  }
});

test('offline chip steps aside while the water is up (a light store, no heavy imports)', () => {
  const banner = read('src/components/OfflineBanner.tsx');
  assert.match(banner, /if \(!mounted \|\| catchOpen \|\| diving \|\| markOwned\) return null;/);
  assert.match(banner, /from '\.\.\/fx\/diveActive'/);
  const store = read('src/fx/diveActive.ts');
  assert.doesNotMatch(store, /from '\.\/DiveIris'|react-native-skia|expo-image/);
  const dive = read('src/fx/DiveIris.tsx');
  assert.match(dive, /setDiveActive\(true\)/);
  assert.match(dive, /setDiveActive\(false\)/);
});

test('dialog: parts are fully opaque from the first frame and only move; the icon stamps with a glint; no blur', () => {
  const src = read('src/ui/GameDialog.tsx');
  const body = src.slice(src.indexOf('export function partStyle'), src.indexOf('export const ICON_STAMP'));
  assert.doesNotMatch(body, /opacity:/, 'parts never fade (a half-faded yellow button reads olive)');
  assert.match(src, /export const PART_FROM_SCALE = 0\.9;/);
  assert.match(src, /export const CARD_FADE_MS = DURATION\.tap;/, 'the card is fully visible inside 90 ms');
  assert.match(src, /export const ICON_STAMP = \{ at: 110, from: 0\.4, peak: 1\.22 \}/);
  assert.match(src, /celebrates && <SparkleBurst progress=\{iconSpark\}/);
  assert.doesNotMatch(src, /BlurView/);
  assert.match(src, /DIALOG_SCRIM = 'rgba\(8,56,128,0\.45\)'/, 'the brief backdrop: navy at 0.45');
});

test('footer: every pick squashes first, a gold disc and ring pulse under it, the rare compass pick is one big burst', () => {
  const { FOOTER_MOTION: F } = loadTs('src/components/footerMotion.ts', {
    'react-native-reanimated': { makeMutable: v => ({ value: v }) }, '../ui/motionEasing': easing,
  });
  assert.ok(Math.abs(1 + F.compassSquashX - 1.15) < 1e-9, '1.15 squash wide');
  assert.ok(F.ringTo >= 1.8, 'the ring clears the icon');
  assert.ok(F.rareSparkles <= motion.PARTICLES.sparkles, 'the rare burst stays inside the sparkle cap');
  assert.ok(F.rareDist[0] > 80, 'rare stars clear the footer wave');
  const src = read('src/components/footerMotion.ts');
  assert.match(src, /\/\/ Every pick: a quick squash wide and short \(anticipation\), then the hop and the pop\./);
  assert.match(src, /if \(rare\) \{\n\s+m\.burstRare\.value = burst;/, 'the rare burst replaces the normal one (never two at once)');
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /const q = picked \? m\.compassSquash\.value : 0;/);
  assert.match(wrapper, /progress=\{smallBurst\} count=\{F\.smallSparkles\}/);
});

test('coins fly to where they live: an arc from the tap into the wallet, a squash on each hit', () => {
  const flight = loadTs('src/ui/CoinFlight.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    './GameIcon': {}, './motion': motion, './tokens': { Z: { toast: 2000 } },
  });
  const from = { x: 60, y: 700 }; const to = { x: 340, y: 90 };
  for (let i = 0; i < 5; i++) {
    const a = flight.coinAt(0, i, 5, from, to); const b = flight.coinAt(1, i, 5, from, to);
    assert.ok(Math.abs(a.x - from.x) < 1e-6 && Math.abs(a.y - from.y) < 1e-6, 'starts at the source');
    assert.ok(Math.abs(b.x - to.x) < 1e-6 && Math.abs(b.y - to.y) < 1e-6, 'lands exactly in the chip');
    assert.ok(flight.coinAt(0.5, i, 5, from, to).y < (from.y + to.y) / 2 - 40, 'arcs up over the straight line');
    assert.ok(flight.coinAt(0.5, i, 5, from, to).scale > 1, 'pops past full size mid-air');
  }
  const lands = flight.coinLandTimes(5);
  assert.equal(lands.length, 5);
  assert.ok(lands[4] <= 1000, 'the last coin lands inside a second');
  assert.equal(flight.coinLandTimes(40).length, flight.COIN_FLIGHT.max, 'capped');
  assert.ok(flight.COIN_FLIGHT.size >= 18 && flight.COIN_FLIGHT.size <= 24);

  const wallet = loadTs('src/ui/WalletChange.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    '../power/PowerProvider': {}, './GameIcon': {}, './RollingNumber': {}, './motionEasing': easing, './useUiReducedMotion': {},
    './CoinFlight': { COIN_FLIGHT: flight.COIN_FLIGHT }, './lastTouch': {}, './AmbientSwim': {},
  });
  const chip = { x: 340, y: 90 };
  assert.deepEqual(plain(wallet.walletFlight(chip, { x: 200, y: 600 }, false)), { from: { x: 200, y: 600 }, to: chip }, 'a gain flies from the tap in');
  assert.deepEqual(plain(wallet.walletFlight(chip, { x: 200, y: 600 }, true)), { from: chip, to: { x: 200, y: 600 } }, 'a spend flies out to what you bought');
  assert.equal(wallet.walletFlight(chip, { x: 350, y: 95 }, true), null, 'a tap on the chip fans the coins right there');
  assert.equal(wallet.walletFlight(chip, null, false), null);
  assert.ok(wallet.WALLET_FX.flightCoins >= 3 && wallet.WALLET_FX.flightCoins <= 5);
  const src = read('src/ui/WalletChange.tsx');
  assert.match(src, /registerCoinTarget\('wallet', measureChip\)/, 'reward toasts can send coins to the chip');
  assert.match(read('src/Root.tsx'), /<CoinFlightHost \/>/);
});

function plain(v) { return JSON.parse(JSON.stringify(v)); }

test('toasts: picture first, spring up with an icon hop, a "+25 coins" toast flies coins, success is a gold check', () => {
  const toast = loadTs('src/components/Toast.tsx', {
    react: { createContext: () => ({}), useContext() {}, useCallback: f => f }, 'react/jsx-runtime': {}, 'react-native': { ...rn, Dimensions: { get: () => ({ width: 402 }) } },
    'react-native-reanimated': reanimated, '../gamekit/Haptics': {}, '../ui/motionEasing': easing, '../ui/SparkleBurst': {},
    '../ui/GoldCheck': {}, '../ui/CoinFlight': {}, '../ui/motion': motion, '../power/PowerProvider': {},
    '../ui/useUiReducedMotion': {}, '../design-system': { colors: {}, shadows: {}, borderRadius: {}, spacing: { md: 12 }, typography: {} },
    '../utils/toast': {}, '../ui': { BRAND: {}, iconForEmoji: () => null, resolveIconName: n => n },
  });
  assert.equal(toast.toastCoinCount('+25 coins'), 3);
  assert.equal(toast.toastCoinCount('You got +480 Coins!'), 5);
  assert.equal(toast.toastCoinCount('+1 coin'), 3, 'a single coin still reads as coins flying');
  assert.equal(toast.toastCoinCount('New ride story unlocked'), 0);
  assert.equal(toast.toastCoinCount('-140 coins'), 0, 'never flies coins for a spend message');
  assert.ok(toast.TOAST_MOTION.iconPt >= 34);
  const src = read('src/components/Toast.tsx');
  assert.match(src, /=== 'check'\n\s+\? <GoldCheck/, 'success uses the gold check, never the green one');
  assert.match(src, /enter\.value = withSpring\(1, SPRING\.stamp\)/);
});

test('pull to refresh: the shark fills the gap, a two-ring splash with droplets, it swims off to the side', () => {
  const { pullLook, PULL_SHOW, dropletAt } = loadTs('src/ui/SharkRefresh.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn, 'expo-image': {}, 'react-native-reanimated': reanimated,
    '../gamekit/Haptics': {}, './GoldCheck': {}, './motionEasing': easing, './tokens': { BRAND: {} }, './useUiReducedMotion': {},
  });
  assert.ok(PULL_SHOW.artPt >= 96, 'big enough to be a little show');
  for (let pull = 20; pull <= 220; pull += 10) {
    const look = pullLook(pull);
    const drawnBottom = look.y + PULL_SHOW.artPt / 2 + (PULL_SHOW.artPt * look.scale) / 2;
    assert.ok(drawnBottom <= pull - PULL_SHOW.clearPt + 1e-6, `stays in the gap at ${pull} pt`);
  }
  assert.ok(PULL_SHOW.artPt * pullLook(110).scale >= 90, 'a long pull shows a big shark');
  assert.ok(PULL_SHOW.artPt * PULL_SHOW.restScale <= 60, 'resting in the 60 pt refresh gap');
  assert.equal(dropletAt(0, 0).opacity, 0);
  assert.ok(dropletAt(2, 0.3).y < 0, 'droplets fly up first');
  assert.ok(dropletAt(2, 0.95).y > dropletAt(2, 0.4).y, 'then fall');
  assert.equal(PULL_SHOW.droplets, 5);
  assert.match(read('src/ui/SharkRefresh.tsx'), /<GoldCheck size=\{30\} \/>/);
});
