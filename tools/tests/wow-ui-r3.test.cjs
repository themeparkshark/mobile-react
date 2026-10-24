const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/wow-ui-r3.test.cjs
// wow-ui round 3: the dive never holds (it opens on a light first frame), the quick repeat dive,
// dialogs never show an empty card, the offline card and chip never overlap, a footer you can
// feel, a refresh shark that stays in its gap, and wallet coins you can see.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };
const rn = { View: 'View', StyleSheet: { create: v => v, absoluteFill: {} }, Dimensions: { get: () => ({ width: 402, height: 874 }) },
  useWindowDimensions: () => ({ width: 402, height: 874 }) };
const reanimated = { __esModule: true, default: { View: 'AnimatedView', createAnimatedComponent: c => c } };

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

test('dive: once the game screen is there, the water opens after a short breath and is gone 560 to 700 ms after the cover', () => {
  const { DIVE, diveTiming } = loadDive();
  const first = diveTiming(0);
  const coverToOpen = first.holdMs + first.openMs;
  assert.ok(coverToOpen >= 560 && coverToOpen <= 700, `cover to fully open ${coverToOpen} ms`);
  assert.ok(first.closeMs + first.holdMs + first.openMs <= 1000, 'the whole first dive is under a second on a phone');
  assert.ok(DIVE.sharkPt >= 220 && DIVE.sharkPt <= 260, 'the shark is big enough to be the frame');
  assert.ok(DIVE.safetyMs <= 2600, 'a game already in the stack opens by its route inside the settle cap');
  const src = read('src/fx/DiveIris.tsx');
  assert.doesNotMatch(src, /openNow\(T\.maxWaitMs\)/, 'no blind timer opens onto the screen you left');
  assert.match(src, /withRepeat\(withTiming\(1, \{ duration: DIVE\.clockMs/, 'the hold keeps moving on its own clock');
});

test('dive: every dive after the first is the quick one (about 450 ms) and a tap skips the hold', () => {
  const { diveTiming } = loadDive();
  const first = diveTiming(0);
  const again = diveTiming(1);
  const total = again.closeMs + again.holdMs + again.openMs;
  assert.ok(total >= 400 && total <= 500, `repeat dive ${total} ms`);
  assert.ok(total < first.closeMs + first.holdMs + first.openMs, 'repeat is shorter than the first time');
  assert.deepEqual({ ...diveTiming(7) }, { ...again });
  const src = read('src/fx/DiveIris.tsx');
  assert.match(src, /onStartShouldSetResponder=\{skip\}/, 'a tap while the water is up skips the hold');
  assert.match(src, /queueHaptic\('hitMedium'\)/, 'the cover lands in the hand');
  assert.match(src, /queueHaptic\('tapLight'\)/, 'a softer answer as it opens');
  assert.match(src, /GOLD_FX\.rays/, 'a gold flash on the iris edge');
  assert.match(src, /clip=\{water\}/, 'rays, ripples and the trail stay inside the water');
});

test('dive: the shark swims in from the tap side and stays on screen while it is the frame', () => {
  const { sharkAt } = loadDive();
  const w = 402; const h = 874;
  assert.ok(sharkAt(0, true, w, h).x < 0, 'starts off screen on the left for a tap on the left');
  assert.ok(sharkAt(0, false, w, h).x > w, 'and on the right for a tap on the right');
  for (const t of [0.4, 0.5, 0.6]) {
    const at = sharkAt(t, true, w, h);
    assert.ok(at.x > 0 && at.x < w && at.y > 0 && at.y < h, `on screen at t=${t}`);
  }
});

// Round 4 replaced the light landing frame with the water as the loader (tools/tests/wow-ui-r4.test.cjs).

test('dialog: the ribbon is on the card from its first frame and parts are fully opaque', () => {
  const src = read('src/ui/GameDialog.tsx');
  assert.match(src, /export const RIBBON_AT = 0;/);
  assert.match(src, /export const PART_FROM_OPACITY = 1;/);
  assert.match(src, /opacity: Math\.min\(1, 0\.6 \+ r \* 3\)/, 'the ribbon is never invisible while the card is');
  const button = read('src/ui/GameButton.tsx');
  assert.match(button, /useState\(\(\) =>\n\s+look\.art \? Math\.min\(look\.maxWidth/, 'button labels are on the first frame (no wait for layout)');
});

test('offline banner: the card and the chip are never both visible', () => {
  const { bannerCrossFade } = loadTs('src/components/OfflineBanner.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn,
    'react-native-reanimated': { ...reanimated, makeMutable: value => ({ value }) },
    'react-native-safe-area-context': {}, '../screens/ExploreScreen/catchPresence': {}, '../api/client': {},
    '../RootNavigation': {}, '../helpers/haptics': {}, '../services/connectivity': {}, '../ui': { Z: {}, BRAND: {}, OUTLINE: {}, FONT: {}, HIT_SLOP: {} },
  });
  for (let s = -0.2; s <= 1.2; s += 0.01) {
    const { card, chip } = bannerCrossFade(s);
    assert.ok(!(card > 0.1 && chip > 0.1), `overlap at ${s.toFixed(2)}`);
    assert.ok(card >= 0 && card <= 1 && chip >= 0 && chip <= 1);
  }
  assert.equal(bannerCrossFade(0).card, 1);
  assert.ok(bannerCrossFade(1).chip > 0.999);
});

test('footer: a hop you can feel, a brighter glow, compass stars that clear its rim', () => {
  const { FOOTER_MOTION, isRareCompassPick, RARE_EVERY } = loadTs('src/components/footerMotion.ts', {
    'react-native-reanimated': { makeMutable: v => ({ value: v }) }, '../ui/motionEasing': easing,
  });
  assert.equal([1, 2, 3, 4, 5, 6, 10].filter(isRareCompassPick).length, 2, 'every fifth compass pick is the rare one');
  assert.equal(RARE_EVERY, 5);
  assert.ok(FOOTER_MOTION.compassSparkles + 3 <= motion.PARTICLES.sparkles, 'even the rare pick stays inside the sparkle cap');
  assert.ok(FOOTER_MOTION.hopPt >= 10 && FOOTER_MOTION.hopPt <= 12);
  assert.ok(FOOTER_MOTION.compassSparkles >= 8 && FOOTER_MOTION.compassSparkles <= 10);
  assert.ok(FOOTER_MOTION.compassSparkles <= motion.PARTICLES.sparkles);
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /dist=\{\[58, 82\]\}/, 'the stars fly past the 50 pt compass radius');
});

test('pull to refresh: the shark never reaches below the gap the pull opens', () => {
  const { pullLook, PULL_SHOW } = loadTs('src/ui/SharkRefresh.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn, 'expo-image': {}, 'react-native-reanimated': reanimated,
    '../gamekit/Haptics': {}, './GoldCheck': {}, './motionEasing': easing, './tokens': { BRAND: {} }, './useUiReducedMotion': {},
  });
  for (let pull = 0; pull <= 220; pull += 5) {
    const look = pullLook(pull);
    const bottom = look.y + (PULL_SHOW.artPt * (1 + look.scale)) / 2;
    assert.ok(bottom <= pull - PULL_SHOW.clearPt + 1e-9, `bottom ${bottom.toFixed(1)} under pull ${pull}`);
  }
  const restBottom = PULL_SHOW.restY + (PULL_SHOW.artPt * PULL_SHOW.restScale) / 2;
  assert.ok(restBottom <= 60, 'resting in the native refresh gap, above the first row');
  assert.match(read('src/ui/SharkRefresh.tsx'), /splash\.value = withTiming\(1/, 'a splash ring on release');
});

test('wallet: coins 18 to 22 pt, and the pill bumps again when the roll lands', () => {
  const { WALLET_FX, walletCoinPath } = loadTs('src/ui/WalletChange.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    '../power/PowerProvider': {}, './GameIcon': {}, './RollingNumber': {}, './motionEasing': easing, './useUiReducedMotion': {},
    './CoinFlight': { COIN_FLIGHT: { staggerMs: 70, flyMs: 560 } }, './lastTouch': {}, './AmbientSwim': {},
  });
  assert.ok(WALLET_FX.coinSize >= 18 && WALLET_FX.coinSize <= 22);
  assert.ok(WALLET_FX.coins <= 6);
  const spread = walletCoinPath(5, 6, true).dx - walletCoinPath(0, 6, true).dx;
  assert.ok(spread >= 80, 'the coins fan out wide enough to count');
  assert.match(read('src/ui/WalletChange.tsx'), /withTiming\(COUNT\.finalBump/);
});
