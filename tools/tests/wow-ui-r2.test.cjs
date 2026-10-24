const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/wow-ui-r2.test.cjs
// wow-ui round 2: star sparkles, the wallet coin beat, the pull-to-refresh shark, the game dive,
// celebrating dialogs and the rolling number's look.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };
const rn = { View: 'View', StyleSheet: { create: v => v, absoluteFill: {} }, Dimensions: { get: () => ({ width: 402, height: 874 }) },
  useWindowDimensions: () => ({ width: 402, height: 874 }) };
const reanimated = { __esModule: true, default: { View: 'AnimatedView', createAnimatedComponent: c => c } };

test('sparkle burst: capped at 12, inside the ranges, mostly gold, deterministic', () => {
  const { burstSpecs } = loadTs('src/ui/SparkleBurst.tsx', {
    react: { memo: c => c, useMemo: f => f() }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    '../power/PowerProvider': {}, './motion': motion, './useUiReducedMotion': {},
  });
  assert.equal(burstSpecs(40).length, 12, 'never more than PARTICLES.sparkles');
  assert.equal(burstSpecs(0).length, 0);
  const specs = burstSpecs(6, { spread: [-170, -10], dist: [34, 50], size: [14, 18], seed: 2 });
  assert.equal(specs.length, 6);
  for (const s of specs) {
    assert.ok(s.dist >= 34 && s.dist <= 50, 'distance in range');
    assert.ok(s.size >= 14 && s.size <= 18, 'size in range (14 to 18 pt, readable on a phone)');
    assert.ok(s.angle >= -190 && s.angle <= 10, 'angles stay on the arc');
    assert.ok(s.delay >= 0 && s.delay <= 0.3);
  }
  assert.ok(specs.filter(s => s.color === 'gold').length >= 4, 'mostly gold');
  assert.deepEqual(JSON.parse(JSON.stringify(burstSpecs(6, { seed: 2 }))), JSON.parse(JSON.stringify(burstSpecs(6, { seed: 2 }))));
  const src = read('src/ui/SparkleBurst.tsx');
  assert.match(src, /momentParticles\(/, 'budgeted through the power policy (none with Reduce Motion)');
  assert.doesNotMatch(src, /react-native-svg|onLayout/, 'no SVG, no layout callbacks');
});

test('wallet: a spend throws coins out and down, a gain brings them up and in; the roll waits for the coins', () => {
  const { walletCoinPath, WALLET_FX } = loadTs('src/ui/WalletChange.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    '../power/PowerProvider': {}, './GameIcon': {}, './RollingNumber': {}, './motionEasing': easing, './useUiReducedMotion': {},
    './CoinFlight': { COIN_FLIGHT: { staggerMs: 70, flyMs: 560 } }, './lastTouch': {}, './AmbientSwim': {},
  });
  for (let i = 0; i < 5; i++) {
    const spend = walletCoinPath(i, 5, true);
    assert.ok(spend.dy > 0, 'spent coins fall away below the chip');
    assert.ok(Math.abs(spend.spin) >= 160, 'and tumble');
  }
  assert.ok(walletCoinPath(4, 5, true).delay > walletCoinPath(0, 5, true).delay, 'one after another');
  assert.ok(WALLET_FX.rollAfterMs < WALLET_FX.flyMs, 'the coins lead the eye, the number follows inside the flight');
  assert.ok(WALLET_FX.coins <= 6);
  const store = read('src/screens/StoreScreen.tsx');
  assert.match(store, /hold=\{covered\}/, 'the shop wallet holds while the try-on covers it');
  const tryOn = read('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(tryOn, /queueHaptic\('hitMedium'\)/, 'YES, BUY IT answers in the hand');
});

test('pull to refresh: the shark grows with the pull, flips at 70 pt, never past full size', () => {
  const { pullLook, PULL_SHOW } = loadTs('src/ui/SharkRefresh.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn, 'expo-image': {}, 'react-native-reanimated': reanimated,
    '../gamekit/Haptics': {}, './GoldCheck': {}, './motionEasing': easing, './tokens': { BRAND: {} }, './useUiReducedMotion': {},
  });
  assert.equal(PULL_SHOW.thresholdPt, 70);
  assert.equal(pullLook(0).opacity, 0, 'nothing shows at rest');
  assert.equal(pullLook(0).scale, PULL_SHOW.fromScale);
  assert.ok(pullLook(70).scale >= 0.55 && pullLook(70).scale < 1, 'at the threshold it fills the 70 pt gap, not past it');
  assert.equal(pullLook(130).scale, 1, 'a long pull grows it to full size');
  assert.equal(pullLook(400).scale, 1, 'never past full size');
  assert.ok(pullLook(35).scale > pullLook(10).scale, 'grows with the pull');
  assert.ok(pullLook(70).y > pullLook(10).y, 'dives in from the top');
  for (const file of ['src/screens/FriendsScreen.tsx', 'src/screens/NotificationsScreen.tsx']) {
    const src = read(file);
    assert.match(src, /useSharkRefresh\(/, `${file} has the shark refresh`);
    assert.match(src, /tintColor="transparent"/, `${file} keeps the system refresh underneath, unseen`);
  }
  assert.match(read('src/ui/SharkRefresh.tsx'), /useAnimatedScrollHandler/, 'the pull is read on the UI thread');
});

test('game dive: grows from a fresh tap, else the middle; payoff inside 1.5 s; bubbles spread across', () => {
  const { diveOrigin, diveBubble, DIVE } = loadTs('src/fx/DiveIris.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn, '@shopify/react-native-skia': {}, 'react-native-reanimated': reanimated,
    '../gamekit/Haptics': {}, '../RootNavigation': {}, '../ui/motionEasing': easing, '../ui/useUiReducedMotion': {},
    'expo-image': {}, '../ui/SharkRefresh': { SHARK_ART: 1 }, '../../modules/flash-safety': { isDimFlashingLightsEnabled: () => false },
    '../power/PowerProvider': { usePowerBudget: () => ({}) }, '../ui/lastTouch': { recordLastTouch() {}, lastTouch: () => null },
    './diveActive': { setDiveActive() {}, useDiveActive: () => false },
  });
  assert.deepEqual({ ...diveOrigin({ x: 50, y: 700, at: 1000 }, 1500, 402, 874) }, { x: 50, y: 700 });
  assert.deepEqual({ ...diveOrigin({ x: 50, y: 700, at: 1000 }, 9000, 402, 874) }, { x: 201, y: 437 }, 'an old tap is not the origin');
  assert.deepEqual({ ...diveOrigin(null, 0, 402, 874) }, { x: 201, y: 437 });
  assert.ok(DIVE.closeMs + DIVE.holdMs + DIVE.openMs <= 1500, 'the game is on screen inside 1.5 s');
  assert.ok(DIVE.holdMs <= 600, 'no dead hold');
  const dive = read('src/fx/DiveIris.tsx');
  assert.match(dive, /landedListeners\.add\(onLanded\)/, 'the iris opens on the new screen (its landing signal), never on the one you left');
  assert.match(dive, /setTimeout\(\(\) => decide\('safety'\), DIVE\.safetyMs \* devSlow\(\)\)/, 'a lost signal never leaves the water up (the gate decides)');
  const xs = Array.from({ length: DIVE.bubbles }, (_, i) => diveBubble(i, DIVE.bubbles, 402).x);
  assert.ok(Math.min(...xs) < 100 && Math.max(...xs) > 300, 'bubbles rise across the whole screen');
  const rootSrc = read('src/Root.tsx');
  assert.match(rootSrc, /<DiveIrisHost \/>/);
  assert.match(rootSrc, /recordTouch\(/, 'the root view remembers where a touch landed');
  assert.match(read('src/screens/ExploreScreen.tsx'), /diveNavigate\('LinePlay'/, 'PLAY IN LINE dives');
});

test('dialogs: rewards celebrate, destructive and warning dialogs stay calm', () => {
  const { dialogCelebrates } = loadTs('src/ui/gameDialogModel.ts');
  assert.equal(dialogCelebrates({ icon: 'coin' }), true);
  assert.equal(dialogCelebrates({ haptic: 'success' }), true);
  assert.equal(dialogCelebrates({ icon: 'gift', buttons: [{ text: 'Leave', style: 'destructive' }] }), false);
  assert.equal(dialogCelebrates({ icon: 'coin', haptic: 'warning' }), false);
  assert.equal(dialogCelebrates({ icon: 'info' }), false);
  assert.equal(dialogCelebrates({}), false);
  const src = read('src/ui/GameDialog.tsx');
  assert.match(src, /withSpring\(1, SPRING\.stamp\)/, 'the ribbon stamps down on the stamp spring');
});

test('rolling number: clipped to the glyph, a stretch while rolling, cream on gains and sky on losses (never red)', () => {
  const { ROLL_LOOK } = loadTs('src/ui/RollingNumber.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': {}, 'react-native-reanimated': {},
    './motionEasing': easing, './useUiReducedMotion': {}, '../gamekit/Haptics': { queueHaptic() {} },
  });
  assert.ok(ROLL_LOOK.clipEm <= 1.05, 'the window is the digit height, no neighbour fragments');
  assert.ok(ROLL_LOOK.stretch > 0 && ROLL_LOOK.stretch <= 0.2);
  assert.ok(!/ef4a3c|b3261b/i.test(ROLL_LOOK.lossFlash), 'a loss is calm blue, never red');
  assert.match(read('src/ui/RollingNumber.tsx'), /queueHaptic\('tickSelection'\)/, 'a gain lands with a tick');
});

test('toasts: star sparkles live outside the clipped card; a reward pops bigger', () => {
  const src = read('src/components/Toast.tsx');
  assert.match(src, /<SparkleBurst/);
  assert.match(src, /rewardPop: 1\.35/);
  assert.doesNotMatch(src, /borderColor: BRAND\.green/, 'success is gold, never green');
  const card = src.indexOf('styles.toast,');
  const burst = src.indexOf('<SparkleBurst');
  const cardClose = src.indexOf('</View>', src.indexOf('</TouchableOpacity>', src.lastIndexOf('<TouchableOpacity')));
  assert.ok(card > 0 && burst > cardClose, 'the burst is drawn after the card closes (not inside overflow hidden)');
});

test('standings: your own row glows gold once, half a second in', () => {
  const src = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(src, /MY_ROW_GLOW = \{ atMs: 500/);
  assert.match(src, /row\.isMe && enter != null && <MyRowGlow/, 'first paint only (recycled rows never glow again)');
});

test('offline banner: a flaky offline-online-offline-online run never leaves Back online stuck on screen', () => {
  const src = read('src/components/OfflineBanner.tsx');
  assert.match(src, /else if \(phaseRef\.current !== 'hidden'\)/, 'every online call that finds the banner up schedules its hide');
  assert.match(src, /if \(hideTimer\.current\) clearTimeout\(hideTimer\.current\);\n\s+hideTimer\.current = setTimeout\(\(\) => setPhase\('hidden'\)/);
});
