const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/wow-ui-w5r2.test.cjs
// wow-ui wave 5 round 2: the game dive opens in about half a second under water (and the wait is a loop-the-loop,
// never a parked shark), big gains throw a bigger fan with gold trails, a prize flies to the shelf, queued dialogs
// share one backdrop, the store fills header first, and the rare compass pick varies.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };
const rn = { View: 'View', Text: 'Text', Dimensions: { get: () => ({ width: 402, height: 874 }) },
  StyleSheet: { create: v => v, absoluteFill: {}, flatten: v => v || {} } };
const reanimated = { __esModule: true, default: { View: 'AnimatedView' }, Easing: { bezierFn: () => t => t } };

test('dive: the open starts on the UI runtime at once, never waiting in the JS batch behind the game screen render', () => {
  const src = read('src/fx/DiveIris.tsx');
  assert.match(src, /executeOnUIRuntimeSync\(openOnUi\)\(delay\)/);
  // The module loads after the water's first frame (it used to run before it and held the splash back).
  assert.match(src, /mark\('close-start'\);\n[\s\S]{0,400}timers\.push\(setTimeout\(loadPrewarm, 0\)\);/);
  assert.doesNotMatch(src, /if \(screen\) setTimeout\(\(\) => \{ try \{ screen\.load\(\);/);
});

test('dive: a wait past the held breath is a head-first loop-the-loop with a light sweep, never a parked pose', () => {
  const dive = loadTs('src/fx/DiveIris.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn, 'expo-image': {}, 'react-native-reanimated': reanimated, '../ui/SharkRefresh': {},
    '@shopify/react-native-skia': {}, '../gamekit/Haptics': {}, '../../modules/flash-safety': {}, '../power/PowerProvider': {},
    '../RootNavigation': {}, '../ui/lastTouch': {}, './diveActive': {}, '../ui/motionEasing': easing, '../ui/useUiReducedMotion': {},
    '../ui/tokens': { Z: { dialog: 9000 } },
  });
  const L = dive.DIVE.loop;
  assert.equal(dive.sharkLoop(0.3, 0, true, L.radiusPt).dx, 0, 'no loop until it blends in');
  // Over one loop the shark goes round and comes back; its pose changes every tenth of a loop (never parked).
  const poses = Array.from({ length: 11 }, (_, i) => dive.sharkLoop(i / 10, 1, true, L.radiusPt));
  assert.ok(Math.abs(poses[0].dx) < 1e-9 && Math.abs(poses[10].dx) < 1e-6 && Math.abs(poses[10].dy) < 1e-6, 'a closed loop');
  assert.ok(Math.min(...poses.map(p => p.dy)) <= -2 * L.radiusPt + 1, 'up and over the top');
  for (let i = 1; i < poses.length; i++) {
    const moved = Math.hypot(poses[i].dx - poses[i - 1].dx, poses[i].dy - poses[i - 1].dy);
    assert.ok(moved > 10, `it keeps moving (step ${i}: ${moved.toFixed(1)} pt per ${L.ms / 10} ms)`);
  }
  assert.ok(Math.abs(poses[5].rot) >= 170, 'upside down at the top: it turns head first through the loop');
  assert.ok(poses.every(p => Math.abs(p.rot) <= 180), 'the blend always turns the short way');
  assert.ok(dive.sharkLoop(0.25, 1, false, L.radiusPt).dx < 0, 'a shark swimming left loops to the left');
  assert.ok(L.ms <= 1600 && L.startMs <= 300, 'the loop starts within a third of a second of the held breath');
  const src = read('src/fx/DiveIris.tsx');
  assert.match(src, /<Path path=\{sweep\} opacity=\{sweepOpacity\}>/, 'a band of sunlight sweeps across while it waits');
  assert.match(src, /const run = close\.value \* 0\.4 \+ open\.value \* 0\.6 \+ clock\.value - b\.lag;/, 'bubbles keep rising');
});

test('LinePlay: the first two pages draw with the screen and the crew is read ahead, so the dive opens a render sooner', () => {
  const lp = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(lp, /initialNumToRender=\{2\}/);
  const hook = read('src/services/lineplay/useLineGroup.ts');
  assert.match(hook, /void warmLineGroup\(playerId\)/);
  assert.match(hook, /peekLineGroup\(playerId, waitKey\)/);
});

test('crew store: the warm read answers on the render the wait starts, follows every save, and drops a read that raced a save', async () => {
  const data = new Map();
  let release = null;
  const storage = {
    getItem: async key => {
      if (release) await release;
      return data.has(key) ? data.get(key) : null;
    },
    setItem: async (key, value) => { data.set(key, value); },
  };
  const G = loadTs('src/services/lineplay/lineGroup.ts');
  const store = loadTs('src/services/lineplay/lineGroupStore.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage }, './lineGroup': G,
  });
  const key = store.lineGroupWaitKey(77, 1700000000000);
  assert.equal(store.peekLineGroup(5, key), null, 'not read yet: the hook waits for storage as before');
  await store.warmLineGroup(5);
  assert.deepEqual(JSON.parse(JSON.stringify(store.peekLineGroup(5, key))), { chosen: false, group: null, lastCrew: null },
    'a fresh wait asks "Who\'s in line?" on the render it starts');
  const crew = G.createLineGroup('couple', [{ name: 'Ana' }, { name: 'Ben' }]);
  await store.saveWaitGroup(5, key, crew);
  const after = store.peekLineGroup(5, key);
  assert.equal(after.chosen, true, 'a save updates the warm read');
  assert.equal(JSON.stringify(after.lastCrew.players.map(p => p.name)), JSON.stringify(['Ana', 'Ben']));
  assert.equal(store.peekLineGroup(5, '77:1').chosen, false, 'a new wait asks again');
  // A read that started before a save never overwrites it with the older crew.
  let open;
  release = new Promise(r => { open = r; });
  const racing = store.warmLineGroup(6);
  await store.saveWaitGroup(6, key, crew);
  release = null; open();
  await racing;
  assert.equal(store.peekLineGroup(6, key), null, 'the raced read is dropped (the hook reads storage instead)');
});

test('wallet: its own coins never count as a reward toast\'s, and a gain of 100 or more throws the big fan', () => {
  const src = read('src/ui/WalletChange.tsx');
  assert.match(src, /landed: spend \? undefined : ownLanded,/, 'own flights count in ownLanded');
  assert.match(src, /useAnimatedReaction\(\(\) => ownLanded\.value,[\s\S]{0,140}if \(spendSv\.value === 0\) hit\(\);\n\s+\}\);/,
    'own coins squash the pill without marking a toast arrival (the +480 after a +25 rolled with no coins)');
  assert.doesNotMatch(src, /setTimeout\(go, wait\)/, 'the flight waits on the UI thread (delayMs), never a JS timer');
  assert.match(src, /big: kind === 'bigGain', delayMs: wait,/);
  const w = loadTs('src/ui/WalletChange.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    '../power/PowerProvider': {}, './GameIcon': {}, './RollingNumber': {}, './motionEasing': easing, './useUiReducedMotion': {},
    './CoinFlight': { COIN_FLIGHT: { staggerMs: 55, flyMs: 560 } }, './lastTouch': {}, './AmbientSwim': {}, './goalGlance': {},
  });
  assert.equal(w.walletFlightKind(690, 715), 'gain');
  assert.equal(w.walletFlightKind(715, 1195), 'bigGain');
  assert.equal(w.walletFlightKind(1195, 1055), 'spend');
  assert.equal(w.walletFlightKind(100, 200), 'bigGain', 'exactly 100 counts');
});

test('coin flight: a big gain is bigger coins in a wider, higher fan with a short gold trail on the UI thread', () => {
  const flight = loadTs('src/ui/CoinFlight.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated,
    './GameIcon': {}, './motion': motion, './tokens': { Z: { toast: 2000 } }, './SparkleBurst': {}, './motionEasing': easing,
    '../fx/CoinTrails': {},
  });
  const F = flight.COIN_FLIGHT;
  const from = { x: 200, y: 600 }; const to = { x: 340, y: 90 };
  const fan = big => Math.abs(flight.coinAt(0.5, 0, 8, from, to, big).x - flight.coinAt(0.5, 7, 8, from, to, big).x);
  assert.ok(fan(true) > fan(false) * 1.4, 'a wider fan');
  assert.ok(flight.coinAt(0.5, 0, 8, from, to, true).y < flight.coinAt(0.5, 0, 8, from, to, false).y, 'a higher arc');
  assert.ok(F.big.size >= 32 && F.big.size <= 40 && F.big.size > F.size, 'bigger coins');
  assert.ok(F.big.endSparkles <= motion.PARTICLES.sparkles, 'the landing stars stay inside the sparkle cap');
  const src = read('src/ui/CoinFlight.tsx');
  assert.match(src, /p\.value = withDelay\(flight\.delayMs \?\? 0, withTiming\(total/, 'a delayed flight waits on the UI thread');
  const trails = read('src/fx/CoinTrails.tsx');
  assert.match(trails, /useDerivedValue<SkPath>\(\(\) => \{/, 'trails are one Skia path drawn from the flight clock (no views per dot)');
});

test('reward dialog: the rays reach past the card behind the ribbon, and OK flies the prize to the shelf', () => {
  const src = read('src/ui/GameDialog.tsx');
  assert.match(src, /outerRaysPt: 660,/);
  assert.match(src, /<GoldBurst size=\{DIALOG_PRIZE\.outerRaysPt\} amount=\{s\.prizeGlow\} bloom=\{s\.prizeBloom\} reduced=\{reduced\} raysOnly \/>/);
  // The wide fan is drawn first inside the card's column: behind the ribbon (zIndex 2) and the card body.
  const col = src.slice(src.indexOf('<Animated.View ref={outerRef}'));
  assert.ok(col.indexOf('outerRaysStyle') < col.indexOf('<Ribbon'), 'behind the ribbon');
  // Round 3: the dialog flies the prize itself, above its backdrop, from shared values (OK never mounts a view).
  assert.match(src, /s\.prize\.value = withTiming\(1, \{ duration: DIALOG_PRIZE\.flyMs, easing: Easing\.linear \}/);
  assert.match(src, /if \(!button \|\| button\.style === 'cancel' \|\| button\.style === 'destructive'\) return;/, 'only taking the prize flies it');
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /registerShelfTarget\(done => \{/, 'the focused footer is the shelf');
  assert.match(wrapper, /\{ scaleX: s \* \(1 \+ F\.compassSquashX \* q\) \* \(1 \+ SHELF_SQUASH \* h\) \}/, 'the Profile icon squashes as it lands');
});

test('queued dialogs: one backdrop for the queue, the card swaps (the bare screen never flashes), and cards open solid', () => {
  const src = read('src/ui/GameDialog.tsx');
  // Round 3: the next card is drawn hidden under the open one and pops in on the UI thread at HANDOFF_AT of the shrink.
  assert.match(src, /s\.exit\.value = withTiming\(HANDOFF_AT, \{ duration: DIALOG_CLOSE\.cardMs \* HANDOFF_AT, easing: EASE\.in \}, done => \{\n\s+if \(!done\) return;\n[\s\S]{0,240}openSlot\(back, opts\);/);
  assert.match(src, /if \(!handedOver\) \{\n\s+scrim\.value = withTiming\(1,/, 'the backdrop only fades in for the first dialog');
  assert.match(src, /s\.fade\.value = o\.handedOver \? 1 : withTiming\(1, \{ duration: o\.reduced \? MOTION\.fadeMs : CARD_SOLID_MS/);
  assert.match(src, /<GameDialog contentKey=\{request\.id\} visible=\{visible\}/, 'the host keeps one dialog for the queue');
  assert.doesNotMatch(src, /<GameDialog key=\{request\.id\}/);
  assert.match(src, /runButtonHandlers=\{false\} next=\{next\}/, 'the host hands the dialog the request waiting behind');
});

test('store: the coin pile bounces in first, then the Shop Pick, then the shelf row by row', () => {
  const stagger = loadTs('src/ui/stagger.ts', { 'react-native-reanimated': { Easing: { bezierFn: () => t => t }, FadeInDown: {} }, './motion': motion });
  const G = stagger.GRID_STAGGER;
  assert.equal(stagger.GRID_AFTER_HERO_MS, G.headerLeadMs + G.heroLeadMs);
  assert.equal(typeof stagger.headerDropIn(), 'function');
  assert.equal(stagger.headerDropIn({ reduced: true }), undefined);
  const shelf = read('src/screens/StoreScreen/GearShelf.tsx');
  assert.match(shelf, /<Animated\.View entering=\{still \? undefined : headerDropIn\(\{ afterMs: GRID_STAGGER\.pushLeadMs \}\)\} style=\{\{ flex: 1 \}\}>\n\s+<Shopkeeper/);
  assert.match(shelf, /entering=\{still \? undefined : FadeIn\.duration\(GRID_STAGGER\.fadeMs\)\} style=\{styles\.panel\}/,
    'the panel is there at once; only its cells drop in');
});

test('rare compass pick: bigger stars up and out, a less countable beat, and a shark swim-by every third rare', () => {
  const fm = loadTs('src/components/footerMotion.ts', {
    'react-native-reanimated': { makeMutable: v => ({ value: v }) }, '../ui/motionEasing': easing,
  });
  const F = fm.FOOTER_MOTION;
  assert.ok(F.rareSize[0] >= 32 && F.rareSize[1] <= 40, 'stars a kid sees at arm\'s length');
  // Clear of the STANDINGS label and the Social icon: a star that reaches as far sideways as a neighbour is well above it.
  const reach = Math.cos((F.rareFanFrom * Math.PI) / 180) * F.rareDist[1];
  const lift = Math.sin((F.rareFanFrom * Math.PI) / 180) * F.rareDist[0];
  assert.ok(reach <= 90 && lift >= 30, `low stars sit ${lift.toFixed(0)} pt above the bar's icons at most ${reach.toFixed(0)} pt out`);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(fm.rareKind), ['stars', 'stars', 'swim', 'stars', 'stars', 'swim']);
  const gaps = []; let last = 0;
  for (let n = 1; n <= 60; n++) if (fm.isRareCompassPick(n)) { gaps.push(n - last); last = n; }
  assert.deepEqual(gaps.slice(0, 8), [4, 7, 5, 6, 4, 7, 5, 6], 'the same for everyone, but not one fixed beat');
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /function FooterSwim\(\)/);
  assert.match(wrapper, /<Image source=\{SHARK_ART\}/, 'existing shark art, no new art');
  assert.doesNotMatch(wrapper, /setTimeout\(/, 'no JS timers in the footer');
});

test('goal glance: coins home or a prize on the shelf give the Daily 3 button one small pop, never a count or a hurry', () => {
  const g = read('src/ui/goalGlance.ts');
  assert.match(g, /export function glanceGoal\(\): void/);
  const d3 = read('src/components/retention/Daily3MapButton.tsx');
  assert.match(d3, /\{ scale: reducedMotion \? 1 : 1 \+ GOAL_GLANCE\.scale \* goalGlance\.value \}/);
  assert.match(read('src/ui/WalletChange.tsx'), /onDone: spend \? undefined : glanceGoal/);
  assert.match(read('src/ui/GameDialog.tsx'), /if \(landed\) glanceGoal\(\);/, 'a prize landing on the shelf glances at the goal');
});
