const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/wow-ui-r5.test.cjs
// wow-ui round 5: "back online" never covers a header or a reward, a handful of big coins pour into the
// wallet and the digits roll on the frame the first one lands, digits that read as numbers on every
// frame of a roll, picture-first coin toasts, an underwater (not dirty) dialog backdrop, a prize that
// stamps onto gold rays, a crisp footer ring and a rare compass pick you notice, grids that fill like a
// vending machine, and a refresh shark that rides the content so it can never sit on the first row.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };
const rn = { View: 'View', Text: 'Text', StyleSheet: { create: v => v, absoluteFill: {}, flatten: v => v || {} },
  Dimensions: { get: () => ({ width: 402, height: 874 }) } };
const reanimated = { __esModule: true, default: { View: 'AnimatedView', Text: 'AnimatedText', createAnimatedComponent: c => c },
  Easing: { bezierFn: () => t => t } };

test('back online: a slim chip at most, and nothing right after a dive or over a sheet or reward', () => {
  const dive = loadTs('src/fx/diveActive.ts', { react: {} });
  assert.equal(dive.diveQuiet(Date.now()), false, 'no dive yet: not quiet');
  dive.setDiveActive(true);
  assert.equal(dive.diveQuiet(Date.now()), true, 'quiet while the water is up');
  dive.setDiveActive(false);
  assert.equal(dive.diveQuiet(Date.now()), true, 'and right after it');
  assert.equal(dive.diveQuiet(Date.now() + dive.AFTER_DIVE_QUIET_MS + 1), false, 'then the banner may speak again');
  const src = read('src/components/OfflineBanner.tsx');
  const fn = src.slice(src.indexOf('export function backOnlineForm'), src.indexOf('export function bannerCrossFade'));
  assert.match(fn, /return state\.quiet \|\| state\.modalUp \? 'skip' : 'chip';/);
  assert.match(src, /if \(phase === 'back'\) \{\n\s+setCompact\(true\);/, '"back online" keeps the slim chip, never the full card');
  assert.match(src, /if \(afterDive\) \{\n\s+setCompact\(true\);/, 'offline across a dive comes back as the chip');
  assert.match(src, /catchOpen \|\| diving \|\| afterDive \|\| modalUp \|\| markOwned\) return null;/);
});

test('rolling digits: a whole digit holds for most of every step, never a blank slot', () => {
  const rolling = loadTs('src/ui/RollingNumber.tsx', {
    react: { memo: c => c, useRef: v => ({ current: v }), useEffect() {} }, 'react/jsx-runtime': {}, 'react-native': rn,
    'react-native-reanimated': reanimated, '../gamekit/Haptics': {}, './motionEasing': easing, './useUiReducedMotion': {},
  });
  const { tickPos, tickSlide, ROLL_LOOK } = rolling;
  assert.equal(ROLL_LOOK.cellGap, 0, 'no gap on the strip: a sliding digit never shows an empty slot');
  let whole = 0; let n = 0;
  for (let p = 0; p <= 9; p += 0.01) {
    const at = tickPos(p);
    assert.ok(at >= Math.floor(p) - 1e-9 && at <= Math.floor(p) + 1 + 1e-9, 'monotonic within its step');
    if (Math.abs(at - Math.round(at)) < 0.08) whole++;
    n++;
  }
  assert.ok(whole / n >= 0.6, `a full digit reads on at least 60% of roll frames (got ${(whole / n).toFixed(2)})`);
  assert.equal(tickPos(3.2), 3);
  assert.ok(tickPos(3.99) > 3.95);
  assert.equal(tickSlide(3.2), 0, 'no stretch while a digit holds');
  assert.ok(tickSlide(3.8) > 0.5, 'a smear while it slides');
  const src = read('src/ui/RollingNumber.tsx');
  assert.doesNotMatch(src, /interpolateColor/, 'no animated text colour on every digit cell (one glow layer opacity per column)');
  assert.match(src, /readonly gate\?: SharedValue<number>;/, 'a roll can wait on a UI-thread gate (the first coin landing)');
  assert.match(src, /useAnimatedReaction\(\(\) => \(gate \? gate\.value >= 1 && armed\.value === 1 : false\)/);
});

test('wallet coins: a handful of big coins, digits roll on the first landing frame, a sparkle pop on the last', () => {
  const flight = loadTs('src/ui/CoinFlight.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    './GameIcon': {}, './motion': motion, './tokens': { Z: { toast: 2000 } }, './SparkleBurst': {}, './motionEasing': easing,
    '../fx/CoinTrails': {},
  });
  const F = flight.COIN_FLIGHT;
  assert.ok(F.size >= 22 && F.size <= 28, 'coins 22 to 28 pt');
  assert.ok(F.max >= 8 && F.max <= 10, 'up to 10 coins');
  assert.ok(F.endSparkles <= motion.PARTICLES.sparkles, 'the end pop stays inside the sparkle cap');
  assert.ok(flight.flightMs(8) <= 1100, 'eight coins all land inside about a second');
  assert.equal(flight.flightMs(1), F.flyMs);
  const xs = Array.from({ length: 8 }, (_, i) => flight.coinAt(0.5, i, 8, { x: 60, y: 700 }, { x: 340, y: 90 }).x);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 60, 'the coins fan out so a kid sees several, not one line');
  const src = read('src/ui/CoinFlight.tsx');
  assert.match(src, /if \(landed\) landed\.value \+= 1;/, 'landings are counted on the UI thread');
  assert.match(src, /flight\.sparkleEnd && <SparkleBurst/);
  const wallet = read('src/ui/WalletChange.tsx');
  assert.match(wallet, /useAnimatedReaction\(\(\) => landed\.value,/, 'the pill squashes on the frame each coin lands');
  assert.match(wallet, /if \(gate\.value < 1\) \{\n\s+gate\.value = 1;/, 'the first coin opens the roll');
  assert.match(wallet, /<RollingNumber value=\{released\} format=\{format\} style=\{textStyle\} hold=\{hold\} gate=\{gate\} celebrate \/>/);
  assert.match(wallet, /const gateBy = \(ms: number\)/, 'the digits are never stranded if the coins never land');
  assert.doesNotMatch(wallet, /startDelayMs=\{lead\.current\}/, 'no JS-timed roll start');
});

test('coin toasts: picture first (coin stack and a big gold amount), coins that tick the wallet', () => {
  const toast = loadTs('src/components/Toast.tsx', {
    react: { createContext: () => ({}), useContext() {}, useCallback: f => f }, 'react/jsx-runtime': {}, 'react-native': rn,
    'react-native-reanimated': reanimated, '../gamekit/Haptics': {}, '../ui/motionEasing': easing, '../ui/SparkleBurst': {},
    '../ui/GoldCheck': {}, '../ui/CoinFlight': {}, '../ui/motion': motion, '../power/PowerProvider': {},
    '../ui/useUiReducedMotion': {}, '../design-system': { colors: {}, shadows: {}, borderRadius: {}, spacing: { md: 12 }, typography: {} },
    '../utils/toast': {}, '../ui': { BRAND: {}, FONT: {}, iconForEmoji: () => null, resolveIconName: n => n },
  });
  assert.equal(toast.toastCoinAmount('+25 coins for your first ride today'), 25);
  assert.equal(toast.toastCoinAmount('+1,200 Coins!'), 1200);
  assert.equal(toast.toastCoinAmount('Saved'), 0);
  assert.equal(toast.toastCoinCaption('+25 coins for your first ride today'), 'for your first ride today');
  assert.equal(toast.toastCoinCount('+25 coins'), 5, 'five coins fly for +25');
  assert.ok(toast.TOAST_MOTION.coinIconPt >= 40, 'a big coin stack');
  assert.ok(toast.TOAST_MOTION.amountPt >= 28, 'a big gold number');
  const src = read('src/components/Toast.tsx');
  assert.match(src, /answer\?\.onIncoming\?\.\(/, 'the wallet hears the coins are coming, so a gain rolls under them');
  assert.match(src, /if \(toastCoinCount\(toast\.message\) > 0\) announceIncomingCoins\(TOAST_INCOMING_MS\);/,
    'announced the moment the toast is asked for, before a gain in the same tap can fly its own coins');
  assert.match(src, /landed: answer\?\.landed/);
});

test('dialog: an underwater backdrop that keeps colours clean, a prize on gold rays, the buzz on the stamp', () => {
  const src = read('src/ui/GameDialog.tsx');
  const stops = /DIALOG_SCRIM_STOPS = \[([^\]]+)\]/.exec(src)[1].match(/0\.\d+\)/g).map(s => Number(s.slice(0, -1)));
  const band = /DIALOG_SCRIM_STOPS = \[([^\]]+)\]/.exec(src)[1].match(/rgba\((\d+),(\d+),(\d+)/g).slice(1, 3)
    .map(c => c.slice(5).split(',').map(Number));
  assert.ok(band.every(([r, g, b]) => r >= 200 && g >= 230 && b >= 250) && stops[1] <= 0.32 && stops[2] <= 0.32,
    'wave 5: the middle band is a pale sky haze that lightens (never a dark tint that turns cream grey-green)');
  assert.match(src, /DIALOG_SCRIM_AT = \[0, 0\.2, 0\.82, 1\]/, 'and it covers most of the screen');
  assert.ok(stops[0] >= 0.4 && stops[3] >= 0.4, 'the edges read underwater');
  assert.match(src, /celebrates && <GoldBurst size=\{DIALOG_PRIZE\.raysPt\}/);
  assert.match(src, /export const DIALOG_PRIZE = \{ iconPt: 124,/, 'wave 5: the prize is about twice the size, rays past the card edge');
  assert.match(src, /stampArmed\.value === 1 && iconPop\.value >= ICON_STAMP\.peak - 0\.02/, 'wave 5: the buzz fires from the UI thread on the stamp frame');
  assert.match(src, /if \(hapticKind !== 'none'\) haptic\(hapticKind\); else queueHaptic\('hitMedium'\);/);
});

test('footer: a crisp bright ring on every pick, a rare compass pick you notice (and feel)', () => {
  const { FOOTER_MOTION: F, RARE_HAPTIC_AT } = loadTs('src/components/footerMotion.ts', {
    'react-native-reanimated': { makeMutable: v => ({ value: v }) }, '../ui/motionEasing': easing,
  });
  assert.ok(F.ringDiscPeak >= 0.7 && F.ringHold >= 0.3, 'the ring holds bright before it fades');
  assert.ok(F.smallSparkles >= 6 && F.smallSparkles <= motion.PARTICLES.sparkles);
  assert.ok(F.rareSize[0] >= 24 && F.rareRingTo >= 3, 'the rare pick: bold stars and a wide shock ring');
  assert.ok(RARE_HAPTIC_AT > 0);
  const wrapper = read('src/components/Wrapper.tsx');
  // Wave 5 round 2: the rare buzz is timed on the UI thread (footerMotion.rareBuzz), never a JS timer.
  assert.match(wrapper, /useAnimatedReaction\(\(\) => footerMotion\.rareBuzz\.value >= 1/);
  assert.doesNotMatch(wrapper, /setTimeout\(\(\) => queueHaptic\('hitMedium'\), RARE_HAPTIC_AT\)/);
  assert.match(wrapper, /borderColor: BRAND\.goldLip/, 'a crisp dark-gold outer edge on the ring');
  assert.match(wrapper, /rareRing2/);
});

test('grids fill like a vending machine: a further drop and a pop, row by row, first screenful only', () => {
  const stagger = loadTs('src/ui/stagger.ts', { 'react-native-reanimated': { Easing: { bezierFn: () => t => t }, FadeInDown: {} }, './motion': motion });
  const G = stagger.GRID_STAGGER;
  assert.ok(G.stepMs >= 50 && G.stepMs <= 70, 'wave 5: the fill spreads over about half a second');
  assert.ok(G.risePt >= 16 && G.risePt <= 24);
  for (let i = 0; i < G.maxItems; i++) assert.ok(stagger.gridDelay(i, G.heroLeadMs) < G.capMs, 'every start inside the cap');
  assert.equal(stagger.gridDelay(G.maxItems), null);
  assert.equal(stagger.gridRiseIn(0, { reduced: true }), undefined, 'Reduce Motion: simply there');
  assert.match(read('src/screens/StoreScreen/GearShelf.tsx'), /gridRiseIn\(i, \{ leadMs: star \? GRID_AFTER_HERO_MS : GRID_STAGGER\.headerLeadMs \}\) \?\? FadeIn\.delay\(GRID_STAGGER\.capMs\)\.duration\(160\)/);
});

test('refresh shark: anchored to the content, its bottom edge always clears the first row', () => {
  const { anchoredSharkTop, ANCHOR_BOX, PULL_SHOW } = loadTs('src/ui/SharkRefresh.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn, 'expo-image': {}, 'react-native-reanimated': reanimated,
    '../gamekit/Haptics': {}, './GoldCheck': {}, './motionEasing': easing, './tokens': { BRAND: {} }, './useUiReducedMotion': {},
  });
  for (let s = PULL_SHOW.fromScale; s <= 1; s += 0.02) {
    const bottom = anchoredSharkTop(s) + PULL_SHOW.artPt / 2 + (PULL_SHOW.artPt * s) / 2;
    assert.ok(Math.abs(bottom - (ANCHOR_BOX - PULL_SHOW.clearPt)) < 1e-6, 'drawn bottom sits clearPt above the content');
  }
  assert.match(read('src/screens/FriendsScreen.tsx'), /<SharkRefreshOverlay anchored shark=\{shark\} \/>/);
  assert.match(read('src/screens/NotificationsScreen.tsx'), /<SharkRefreshOverlay anchored shark=\{shark\} \/>/);
});

test('dive: once the game screen lays out, the open is timed on the UI thread (never a late JS timer)', () => {
  const dive = read('src/fx/DiveIris.tsx');
  assert.match(dive, /readyPatienceMs: 2500,/, 'wave 5: the water waits for the first round; the patience open is only a backstop');
  assert.match(dive, /openNow\(Math\.max\(DIVE\.readyPatienceMs \* devSlow\(\), T\.holdMs - \(Date\.now\(\) - coveredAt\)\)\);/);
  assert.match(dive, /if \(open\.value === 0\) openNow\(/, 'a round landing first brings the open forward');
  const lp = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(lp, /if \(!laidOut\.current\) notifyDiveLaidOut\(\);/);
  assert.doesNotMatch(lp, /setTimeout\(notifyDiveLanded, DIVE_READY_CAP_MS\)/);
});
