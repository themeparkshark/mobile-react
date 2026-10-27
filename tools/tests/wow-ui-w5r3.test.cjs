const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/wow-ui-w5r3.test.cjs
// wow-ui wave 5 round 3: a dialog's open and close stay in the view tree (no stale card after a render elsewhere), the
// prize flies from the card to the shelf inside the dialog, a queued card is drawn under the open one and pops in on
// the UI thread, the shop opens already stocked, the dive's held breath is a plunge, the swim-by leaps out of the
// wave, and Daily 3 rings gold when coins or a prize land.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };
const rn = { View: 'View', Text: 'Text', Image: 'Image', Dimensions: { get: () => ({ width: 402, height: 874 }) },
  StyleSheet: { create: v => v, absoluteFill: {}, flatten: v => v || {} } };
// EASE.out as a real curve (a cubic ease out), so the prize's path is checked as it is drawn.
const outCurve = t => 1 - (1 - t) * (1 - t) * (1 - t);
const reanimated = { __esModule: true, default: { View: 'AnimatedView' }, Easing: { bezierFn: () => outCurve },
  makeMutable: v => ({ value: v }), withDelay: (_, v) => v, withTiming: v => v, withSequence: (...v) => v[v.length - 1], withSpring: v => v };

const coinFlight = () => loadTs('src/ui/CoinFlight.tsx', {
  react: { memo: c => c, useEffect() {}, useState: v => [v, () => undefined] }, 'react/jsx-runtime': {}, 'react-native': rn, 'react-native-reanimated': reanimated, '../fx/CoinTrails': {},
  './GameIcon': { ICON_SOURCES: {} }, './iconNames': { resolveIconName: n => n }, './SparkleBurst': {}, './motionEasing': easing,
  './motion': { BEZIER: { out: [0, 0, 0.58, 1], inOut: [0.42, 0, 0.58, 1] } }, './tokens': { Z: { toast: 100 } },
});

test('dialog: never an older frame left on screen (open after the views are on screen, final look said again, gone means out of the layout)', () => {
  const src = read('src/ui/GameDialog.tsx');
  const k = l => (l >= 2 ? 0.99995 : l >= 1 ? 0.9999 : 1);
  assert.match(src, /return l >= 2 \? 0\.99995 : l >= 1 \? 0\.9999 : 1;/);
  assert.ok(k(0.5) === 1 && k(1) !== 1 && k(2) !== k(1) && Math.abs(1 - k(2)) < 1e-3, 'twice, never visible');
  assert.match(src, /s\.life\.value = withTiming\(2, \{ duration: 2 \* OPEN_SETTLE_MS, easing: Easing\.linear \}\);/);
  assert.match(src, /opacity: s\.shown\.value \* s\.fade\.value \* closeOpacity\(s\.exit\.value\) \* k,/, 'the card');
  assert.match(src, /display: s\.exit\.value >= 1 \? 'none' : 'flex',/, 'a card that has gone is out of the layout');
  assert.match(src, /opacity: scrim\.value \* settleFactor\(scrimLife\.value\),\n\s+display: scrim\.value <= 0 && scrimLife\.value > 0 \? 'none' : 'flex'/, 'the backdrop');
  assert.match(src, /display: raw >= 1 \? 'none' : 'flex',/, 'a landed prize');
  // The first card animates only once the dialog's own views have laid out natively (an iOS modal presents late).
  assert.match(src, /if \(shown && mounted && onScreen\.current && openedFor\.current !== key\) \{/);
  assert.match(src, /onLayout=\{\(\) => \{ if \(!onScreen\.current\) \{ onScreen\.current = true; setLaidOut\(n => n \+ 1\); \} \}\}/);
  assert.doesNotMatch(src, /keepInTree/, 'motion stays on the fast path (a layout prop every frame stalled behind map renders)');
  // Only the gift lifts out; the rays stay and soften.
  assert.match(src, /const giftStyle = useAnimatedStyle\(\(\) => \(\{ opacity: \(1 - s\.iconGone\.value\)/);
  assert.match(src, /s\.prizeGlow\.value = withTiming\(0\.4, \{ duration: DIALOG_CLOSE\.cardMs, easing: EASE\.out \}\);/);
});

test('prize to the shelf: drawn by the dialog above its backdrop from shared values, from the icon spot to the Profile tab', () => {
  const { prizeAt, PRIZE_FLIGHT } = coinFlight();
  const from = { x: 201, y: 420 };
  const to = { x: 344, y: 818 };
  const start = prizeAt(0, from, to);
  assert.ok(Math.abs(start.x - from.x) < 1e-9 && Math.abs(start.y - from.y) < 1e-9, 'it leaves exactly where the card icon stood');
  assert.ok(Math.abs(start.scale - 1) < 1e-9, 'at the card icon size (no jump)');
  const end = prizeAt(1, from, to);
  assert.ok(Math.abs(end.x - to.x) < 1e-9 && Math.abs(end.y - to.y) < 1e-9, 'and lands in the Profile icon');
  assert.equal(Number(end.scale.toFixed(6)), PRIZE_FLIGHT.endScale, 'shrinking into the footer icon');
  // Visibly on its way at once (EASE.out): a quarter of the flight in, it has covered well over a quarter of the way.
  const q = prizeAt(0.25, from, to);
  assert.ok(Math.hypot(q.x - from.x, q.y - from.y) > 0.3 * Math.hypot(to.x - from.x, to.y - from.y), 'it never parks first');
  // A low arc: never more than arcPt over the start.
  const ys = Array.from({ length: 41 }, (_, i) => prizeAt(i / 40, from, to).y);
  assert.ok(Math.min(...ys) >= from.y - PRIZE_FLIGHT.arcPt, 'a low arc, never up and away');
  // At 60 fps a 460 ms flight is about 28 frames: the trail shows in many distinct places.
  const frames = Math.round(460 / 16.7);
  const spots = new Set(Array.from({ length: frames }, (_, i) => {
    const p = prizeAt(i / frames - PRIZE_FLIGHT.trailStep, from, to);
    return `${Math.round(p.x / 8)}:${Math.round(p.y / 8)}`;
  }));
  assert.ok(spots.size >= 8, `the gold trail is seen in at least 8 places (${spots.size})`);

  const src = read('src/ui/GameDialog.tsx');
  assert.match(src, /export const DIALOG_PRIZE = \{[\s\S]*?flyMs: 460 \} as const;/);
  // OK never mounts a view: the flight starts by setting shared values, the card's own icon hides on that frame.
  const launch = src.slice(src.indexOf('const launchPrize = '), src.indexOf('const pendingLaunch'));
  assert.doesNotMatch(launch, /\bset(?!Timeout)[A-Z]\w*\(/, 'no React state on OK');
  assert.match(launch, /s\.iconGone\.value = 1;/);
  assert.match(launch, /if \(done\) hits\.value \+= 1;/, 'the shelf squashes on the landing frame (UI thread)');
  assert.doesNotMatch(src, /flyCoins\(/, 'the prize is not handed to the root flight host (it was under the dialog)');
  // Where it leaves from and lands is measured as the card settles, so OK flies it on the press frame.
  assert.match(src, /useAnimatedReaction\(\(\) => s\.shown\.value === 1 && s\.life\.value >= 1 && s\.exit\.value === 0,/);
  // The prizes are drawn after every card (above them and the backdrop), and the dialog stays until they land.
  assert.ok(src.indexOf('<PrizeFlight key=') > src.indexOf('<DialogCard key='));
  assert.match(src, /if \(flight\.current\.flying\.size > 0 \|\| !flight\.current\.scrimGone\) return;/);
  // The Profile icon on screen squashes and throws gold stars as it lands (only the focused footer).
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /useAnimatedReaction\(\(\) => prizeHits\.value, \(now, before\) => \{\n\s+if \(before !== null && now > before && shelfLive\.value === 1\) landOnShelf\(\);/);
  assert.match(wrapper, /\{stars && <SparkleBurst progress=\{stars\} count=\{10\}/);
  // The trail is plain dots moved on the UI thread (a canvas's first draw stalled the start of the flight).
  assert.doesNotMatch(read('src/ui/GameDialog.tsx'), /@shopify\/react-native-skia/);
  assert.match(src, /\{Array\.from\(\{ length: PRIZE_FLIGHT\.trailDots \}, \(_, k\) => <PrizeDot key=\{k\} s=\{s\} k=\{k \+ 1\} \/>\)\}/);
  assert.match(launch, /runOnUI\(\(\) => \{\n\s+'worklet';\n\s+s\.iconGone\.value = 1;/, 'the gift hides on the frame the flying one appears');
});

test('queued dialogs: the next card is drawn hidden under the open one and pops in on the UI thread (no empty frame)', () => {
  const model = loadTs('src/ui/gameDialogModel.ts');
  const store = model.createDialogStore(() => undefined);
  const shown = [];
  const behind = [];
  store.attach(r => shown.push(r && r.title), n => behind.push(n && n.title));
  void store.show({ title: 'One' });
  void store.show({ title: 'Two' });
  void store.show({ title: 'Three' });
  assert.deepEqual(shown, [null, 'One'], 'the open dialog is told once');
  assert.deepEqual(behind, [null, null, 'Two'], 'the host learns which card waits behind it');
  assert.equal(store.peek(1).title, 'Two');
  store.answer(1, 0);
  assert.deepEqual(shown.slice(-1), ['Two']);
  assert.deepEqual(behind.slice(-1), ['Three'], 'after a hand-over the next one waits behind');

  const src = read('src/ui/GameDialog.tsx');
  assert.match(src, /export function openSlot\(s: CardSlot,[\s\S]*?\{\n\s+'worklet';/, 'opening a card is a worklet');
  const close = src.slice(src.indexOf('const close = (index: number | null) => {'), src.indexOf('useEffect(() => {\n    if (!visible && mounted'));
  assert.match(close, /openSlot\(back, opts\);\n\s+runOnJS\(nextOpened\)\(\);/, 'the waiting card pops on the UI thread mid-shrink');
  assert.match(close, /openSlot\(back, opts\);\n\s+runOnJS\(nextOpened\)\(\);\n\s+s\.exit\.value = 1;\n\s+runOnJS\(finishHandOff\)\(nextKey\);/,
    'the old card goes on the frame the next one pops in under it (never one card seen through another)');
  // Card slots are made only once a dialog first shows (screens keep closed dialogs mounted).
  assert.match(src, /if \(mounted && !slotsRef\.current\) slotsRef\.current = \[makeCardSlot\(\), makeCardSlot\(\), makeCardSlot\(\)\];/);
  assert.match(src, /setLeaving\(current\);\n\s+openedFor\.current = nextKey;/, 'the card already showing is never opened twice');
  assert.match(src, /\{card\.role === 'front' \? children : null\}/);
  assert.match(src, /pointerEvents=\{isFront \? 'box-none' : 'none'\} accessibilityElementsHidden=\{!isFront\}/, 'a waiting card takes no touches');
  // The waiting card pops from CARD_FROM, solid, with its ribbon stamp (the same open as any card).
  assert.match(src, /s\.fade\.value = o\.handedOver \? 1 : withTiming/);
  assert.match(src, /s\.ribbon\.value = o\.reduced \? 1 : withDelay\(RIBBON_AT, withSpring\(1, SPRING\.stamp\)\);/);
});

test('shop: Profile reads the shelf ahead, the first render already has it, and only the first screenful mounts at once', () => {
  const calls = [];
  const api = name => ({ __esModule: true, default: async (...args) => { calls.push(name); return answers[name](...args); } });
  const answers = {
    stores: () => [{ id: '5', name: 'Shark Shop' }],
    store: id => ({ id: String(id), is_secret_store: false, current_catalog_id: 9 }),
    rotation: () => null,
    catalog: () => ({ id: 9, promotion_image_url: 'promo.png' }),
    today: () => null,
    items: () => Array.from({ length: 15 }, (_, i) => ({ id: i + 1, icon_url: `i${i}.png` })),
  };
  const warmed = [];
  const prefetch = loadTs('src/screens/StoreScreen/shopPrefetch.ts', {
    'expo-image': { Image: { prefetch: async urls => { warmed.push(...urls); return true; } } },
    '../../api/endpoints/catalogs/get': api('catalog'), '../../api/endpoints/catalogs/items': api('items'),
    '../../api/endpoints/stores/get': api('store'), '../../api/endpoints/stores/stores': api('stores'),
    '../../api/endpoints/stores/rotation': api('rotation'), '../../api/endpoints/stores/today': api('today'),
    '../../services/secretShopFlag': { loadSecretShopFlag: async () => false },
  });
  return (async () => {
    prefetch.prefetchShop(5, 0);
    prefetch.prefetchShop(5, 10);
    assert.equal(prefetch.takeShop(5, 20), null, 'not ready yet');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.filter(c => c === 'store').length, 1, 'one read at a time');
    assert.ok(warmed.includes('promo.png') && warmed.length === 1 + prefetch.SHOP_PREFETCH.warmImages, 'the first shelf images are warmed');
    const load = prefetch.takeShop('5');
    assert.equal(load.firstPage.length, 15);
    assert.equal(prefetch.takeShop('5'), null, 'used once: the next open reads the shop again');
    prefetch.prefetchShop(5);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(prefetch.takeShop(5, Date.now() + prefetch.SHOP_PREFETCH.freshMs + 1), null, 'a stale read is never shown');

    const screen = read('src/screens/StoreScreen.tsx');
    assert.match(screen, /if \(ahead\.current === undefined\) ahead\.current = takeShop\(store\);/);
    assert.match(screen, /useState<'loading' \| 'error' \| 'ready' \| 'away'>\(pre \? 'ready' : 'loading'\)/, 'no loading screen when the shelf is in hand');
    assert.match(screen, /takePendingShop\(store\) \?\? loadShop\(store\)/, 'a read under way is waited for, never asked twice');
    const profile = read('src/screens/ProfileScreen.tsx');
    assert.match(profile, /InteractionManager\.runAfterInteractions\(\(\) => prefetchShop\(/, 'Profile reads it once it has settled');
    const shelf = read('src/screens/StoreScreen/GearShelf.tsx');
    assert.match(shelf, /const shownCells = allIn \|\| filter !== 'all' \? cells : cells\.slice\(0, GRID_STAGGER\.maxItems\);/);
    assert.match(shelf, /setTimeout\(\(\) => setAllIn\(true\), GRID_STAGGER\.pushLeadMs \+ GRID_STAGGER\.capMs \+ 120\)/, 'the rest mount once the fill has landed');
  })();
});

test('dive: the held breath is a head-first plunge from the surface with a bubble burst and a light sweep', () => {
  const dive = loadTs('src/fx/DiveIris.tsx', {
    react: {}, 'react/jsx-runtime': {}, 'react-native': rn, 'expo-image': {}, 'react-native-reanimated': reanimated, '../ui/SharkRefresh': {},
    '@shopify/react-native-skia': {}, '../gamekit/Haptics': {}, '../../modules/flash-safety': {}, '../power/PowerProvider': {},
    '../RootNavigation': {}, '../ui/lastTouch': {}, './diveActive': {}, '../ui/motionEasing': easing, '../ui/useUiReducedMotion': {},
    '../ui/tokens': { Z: { dialog: 9000 } },
  });
  const { w, h } = { w: 402, h: 874 };
  const at = e => dive.sharkPlunge(e, true, w, h);
  assert.deepEqual([at(1).dx, at(1).dy, at(1).rot], [-0, -0, 0].map(v => v * 1), 'levels out exactly where it swims on');
  assert.ok(at(0).dy <= -0.6 * h, 'it starts up at the surface');
  assert.ok(at(0).rot >= 60, 'nose down, head first');
  // Over the time it is under water (the plunge from the cover on), it keeps moving: never a pose.
  const ease = t => 1 - (1 - t) * (1 - t);
  const close = 260;
  const total = close + dive.DIVE.plunge.moveMs;
  const steps = Array.from({ length: 6 }, (_, i) => at(ease(Math.min(1, (close + i * 80) / total))));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].dy - steps[i - 1].dy > 8, `still plunging ${i * 80} ms after the cover`);
  assert.ok(dive.sharkPlunge(0.5, false, w, h).dx > 0 && at(0.5).dx < 0, 'it comes from behind on either side');
  assert.equal(dive.DIVE.openMs, 360, 'a quicker iris so splash to play lands under 1.2 s');
  const src = read('src/fx/DiveIris.tsx');
  assert.match(src, /<Path path=\{plungeSweep\} opacity=\{plungeSweepOpacity\}>/);
  assert.match(src, /<Path path=\{burst\} color="rgba\(214,240,255,0\.6\)" \/>/);
});

test('rare swim-by: bigger, leaps out of the wave with a splash, swims the crest over the icons, dives back in', () => {
  const fm = loadTs('src/components/footerMotion.ts', { 'react-native-reanimated': reanimated, '../ui/motionEasing': easing,
    '../ui/motion': motion, '../gamekit/Haptics': {}, '../ui/tokens': {} });
  const F = fm.FOOTER_MOTION;
  assert.ok(F.swimPt >= 46 * 1.3 - 0.5, 'about 1.3 times the old size');
  const w = 402;
  const a = fm.footerSwimAt(0.02, w, F.swimPt);
  const mid = fm.footerSwimAt(0.5, w, F.swimPt);
  const b = fm.footerSwimAt(0.98, w, F.swimPt);
  assert.ok(a.y > F.swimCrestY && b.y > F.swimCrestY, 'under the crest where it leaps out and dives in');
  assert.ok(mid.y < F.swimCrestY - F.swimLiftPt + 6, 'over the crest (above the icons) in between');
  assert.ok(a.rot < -20 && b.rot > 20, 'nose up out of the water, nose down back in');
  assert.ok(a.x >= 0 && b.x <= w, 'on screen');
  assert.equal(fm.footerSwimAt(0, w, F.swimPt).opacity, 0);
  assert.equal(fm.footerSwimAt(0.5, w, F.swimPt).opacity, 1);
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /<SwimSplash at=\{FOOTER_MOTION\.swimEnter \* width\} from=\{0\} \/>/);
  assert.match(wrapper, /<SwimSplash at=\{FOOTER_MOTION\.swimLeave \* width\} from=\{1 - FOOTER_MOTION\.swimSplashSpan\} \/>/);
  // Drawn after the icon row (over the icons), not behind them.
  assert.ok(wrapper.indexOf('{!previewMode && <FooterSwim />}') > wrapper.indexOf('{items.map((item, key) => {'));
});

test('goal glance: a gold ring rings out off Daily 3 and a glint crosses it when coins or a prize land', () => {
  const g = loadTs('src/ui/goalGlance.ts', { 'react-native-reanimated': reanimated, './motion': motion });
  const rest = g.goalGlint(0);
  assert.equal(rest.ringOpacity, 0);
  assert.equal(rest.glintOpacity, 0);
  const early = g.goalGlint(0.1);
  const late = g.goalGlint(0.9);
  assert.ok(early.ringOpacity > 0.5 && late.ringOpacity < early.ringOpacity, 'bright, then fades as it grows');
  assert.ok(late.ringScale > early.ringScale && late.ringScale <= g.GOAL_GLANCE.ringTo, 'rings out');
  assert.ok(g.goalGlint(0.3).glintOpacity > 0 && g.goalGlint(0.3).glintX > -1, 'the glint crosses the face');
  const d3 = read('src/components/retention/Daily3MapButton.tsx');
  assert.match(d3, /const g = goalGlint\(reducedMotion \? 0 : glint\.value\);/, 'never with Reduce Motion');
  assert.doesNotMatch(d3, /Text[^>]*>\s*\+?\d/, 'no counts or words added');
});
