'use strict';
/**
 * Fix pass w5, lane host (Nov 19 2026): the sheet host, at the root.
 * Round w4 proved with the phase log that the last lost presses died inside UIKit's own dismissal of a native sheet
 * (no touch reaches JS between the native hide and onDismiss). Root fix: every iOS sheet is drawn in-tree inside a
 * window overlay (src/ui/OverlaySheet.tsx), so no sheet is ever presented or dismissed by UIKit; the round w4 native
 * door stays behind one kill switch. W4-SMOKE-2: a leaving gate holds touches until it is gone, then hands the first
 * one to what is under it. Every test here fails on 104da83c (no sheetHost, no OverlaySheet, a leaving layer let taps
 * through at once).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const H = loadTs('src/ui/sheetHost.ts');
const T = loadTs('src/ui/tapThrough.ts');

test('the kill switch: iOS draws sheets in-tree by default; the switch or the server flag puts it back on native', () => {
  assert.equal(H.SHEET_HOST_DEFAULT, 'overlay');
  assert.equal(H.chooseSheetHost({ os: 'ios' }), 'overlay');
  assert.equal(H.chooseSheetHost({ os: 'ios', flags: { sheet_host_native: true } }), 'native');
  assert.equal(H.chooseSheetHost({ os: 'ios', flags: { sheet_host_native: false } }), 'overlay');
  assert.equal(H.chooseSheetHost({ os: 'ios', fallback: 'native' }), 'native', 'flipping SHEET_HOST_DEFAULT is the OTA kill switch');
  assert.equal(H.chooseSheetHost({ os: 'android' }), 'native', 'Android keeps its native Modal');
  assert.equal(H.chooseSheetHost({ os: 'ios', laneOverride: 'native' }), 'native');
});

test('the host is chosen once per launch and never flips while the app runs', () => {
  H.resetSheetHostForTests();
  let reads = 0;
  assert.equal(H.sheetHostMode(() => { reads += 1; return 'overlay'; }), 'overlay');
  assert.equal(H.sheetHostMode(() => { reads += 1; return 'native'; }), 'overlay');
  assert.equal(reads, 1);
  H.resetSheetHostForTests();
});

test('a sheet asked for from a card 300 pt down measures its children in window points, like the finger', () => {
  const style = H.overlayNodeStyle({ x: 0, y: 0, pageX: 12, pageY: 300 });
  assert.deepEqual(JSON.parse(JSON.stringify(style)), { left: 0, top: 0, transform: [{ translateX: -12 }, { translateY: -300 }] });
  // A parent with a 2 pt border: the container still sits at the window's top left (left/top), children at 0.
  const bordered = H.overlayNodeStyle({ x: 2, y: 2, pageX: 14, pageY: 302 });
  assert.equal(bordered.left, -2);
  assert.equal(bordered.top, -2);
  assert.deepEqual(JSON.parse(JSON.stringify(bordered.transform)), [{ translateX: -12 }, { translateY: -300 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(H.overlayNodeStyle({ x: 0, y: 0, pageX: 0, pageY: 0 }).transform)), []);
  assert.equal(H.ownerMoved(null, { x: 0, y: 0, pageX: 0, pageY: 0 }), true);
  assert.equal(H.ownerMoved({ x: 0, y: 0, pageX: 0, pageY: 10 }, { x: 0, y: 0, pageX: 0.2, pageY: 10.3 }), false);
});

test('enter and leave follow the caller: none at once, fade, a slide that leaves fast; Reduce Motion is a quick fade', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(H.sheetMotion(undefined, false))), { kind: 'none', inMs: 0, outMs: 0 });
  assert.equal(H.sheetMotion('fade', false).outMs, H.SHEET_FADE_OUT_MS);
  assert.equal(H.sheetMotion('slide', false).kind, 'slide');
  assert.ok(H.sheetMotion('slide', false).outMs < 300, 'exits are faster than entrances');
  assert.deepEqual(JSON.parse(JSON.stringify(H.sheetMotion('slide', true))), { kind: 'fade', inMs: H.SHEET_REDUCED_MS, outMs: H.SHEET_REDUCED_MS });
  assert.equal(H.sheetLeaveFallbackMs(H.sheetMotion('none', false)), 0);
  assert.ok(H.sheetLeaveFallbackMs(H.sheetMotion('fade', false)) > H.SHEET_FADE_OUT_MS, 'a stalled leave still ends');
});

test('a sheet over a sheet: the newest is on top, and only the screen under every sheet gets a replayed tap', () => {
  const stack = H.createOverlayStack();
  let heard = 0;
  stack.subscribe(() => { heard += 1; });
  stack.add(1); stack.add(2);
  assert.equal(stack.top(), 2);
  assert.equal(stack.others(2), true);
  stack.remove(2);
  assert.equal(stack.top(), 1);
  assert.equal(stack.others(1), false);
  stack.add(1);
  assert.equal(stack.count(), 1, 'a sheet is listed once');
  assert.equal(heard, 3);
});

test('a hit inside an in-tree sheet is on that sheet: never replayed onto the screen, but pressed when meant for it', () => {
  const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].return = nodes[i + 1]; return nodes[0]; };
  const press = () => 1;
  const hit = chain({ tag: 5, type: 'RCTView', memoizedProps: {} }, { tag: 11, memoizedProps: { onPress: press } },
    { tag: 5, type: 'RNSFullWindowOverlay', memoizedProps: {} }, { tag: 5, type: 'RCTView', memoizedProps: {} });
  assert.equal(T.pressTargetFromChain(hit), null);
  assert.equal(T.pressTargetFromChain(hit, { withinSheet: true }).onPress, press);
  const pressed = [];
  const row = { tag: 11, memoizedProps: { onPress: e => pressed.push(e.nativeEvent.pageY) } };
  const sheetRoot = { tag: 5, type: 'RCTView', stateNode: { node: 'sheet-node' } };
  const calls = [];
  const how = T.pressInside(sheetRoot, 120, 640, (node, x, y, cb) => { calls.push([node, x, y]); cb(row); }, 5);
  assert.equal(how, 'pending');
  assert.deepEqual(calls, [['sheet-node', 120, 640]]);
  assert.deepEqual(pressed, [640]);
  assert.equal(T.pressInside(null, 1, 1, () => undefined), 'no_hit_test');
  assert.equal(T.internalHandle(null), null);
});

test('W4-SMOKE-2: a leaving gate holds the first tap (never lets it through), and hands it to the sheet once gone', () => {
  const L = loadTs('src/ui/SheetOverlayLayer.tsx', {
    react: { useContext: () => null, useEffect() {}, useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { absoluteFill: {} }, View: 'View' },
    'react-native-reanimated': { default: { View: 'Animated.View' }, Easing: { in: f => f, out: f => f, quad: 1 }, runOnJS: f => f, useAnimatedStyle: f => f, useSharedValue: v => ({ value: v }), withTiming: v => v },
    './pressTrace': { pressTrace() {} },
    './sheetOverlay': { sheetPressContext: () => ({}) },
    './useUiReducedMotion': { default: () => false },
  });
  assert.equal(L.holdLeavingTap(null, false, 10, 20), null, 'a layer that is up does not hold taps for later');
  const first = L.holdLeavingTap(null, true, 10, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), { x: 10, y: 20 });
  assert.equal(L.holdLeavingTap(first, true, 99, 99), first, 'a second tap in the same leave is the same press');
  const layer = src('src/ui/SheetOverlayLayer.tsx');
  assert.doesNotMatch(layer, /<View style=\{StyleSheet\.absoluteFill\} pointerEvents=\{leaving \? 'none'/, 'the outer view never lets a drawn, leaving layer pass a tap');
  assert.match(layer, /<View style=\{StyleSheet\.absoluteFill\} pointerEvents=\{released \? 'none' : 'auto'\}/, 'only once its fade has ended');
  assert.match(layer, /done => \{ if \(done && leaving\) runOnJS\(setReleased\)\(true\); \}/, 'a stalled fade never releases it');
  assert.match(layer, /pointerEvents=\{leaving \? 'none' : 'auto'\}>\{children\}/, 'its own buttons rest while it leaves');
  assert.match(layer, /press\(tap\.x, tap\.y\)/);
});

test('every iOS Modal goes through the door, and the door draws in-tree unless the kill switch says native', () => {
  const guards = src('src/ui/installNativeGuards.ts');
  assert.match(guards, /injection\.unstable_Modal = require\('\.\/DoorModal'\)\.default/);
  assert.match(guards, /setWrapperComponentProvider\(\(\) => SheetScreenRoot\)/, 'the screen behind a sheet is hidden from VoiceOver');
  const door = src('src/ui/DoorModal.tsx');
  assert.match(door, /sheetHostMode\(readSheetHost\) === 'overlay' \? <OverlaySheet \{\.\.\.props\} \/> : <NativeDoorModal \{\.\.\.props\} \/>/);
  assert.match(door, /function NativeDoorModal\(props: DoorModalProps\)/, 'the round w4 native door is kept whole behind the switch');
  assert.match(door, /<RCTModalHostView/);
  const sheet = src('src/ui/OverlaySheet.tsx');
  assert.doesNotMatch(sheet, /RCTModalHostView/, 'an in-tree sheet never goes through a UIKit presentation');
  assert.match(sheet, /FullWindowOverlayNativeComponent/);
  assert.match(sheet, /withSpring\(1, \{ \.\.\.SPRING\.settle, overshootClamping: true \}\)/, 'a slide in is a spring with no overshoot');
  assert.match(sheet, /pointerEvents=\{leaving \? 'none' : 'box-none'\}/, 'a leaving sheet\'s buttons rest');
  assert.match(sheet, /leavingSheetTap\.note\(/, 'a tap on a leaving sheet is kept for the screen under it');
  assert.match(sheet, /if \(!nested && !overlayStack\.others\(id\.current\)\) \{\s*const how = tapThrough\.deliver\(\)/);
  assert.match(sheet, /onAccessibilityEscape=/);
  // A sheet is released (invisible, touches pass natively) before it leaves the tree, never removed while it blocks.
  assert.match(sheet, /pointerEvents=\{shownReleased \? 'none' : 'auto'\}/);
  assert.match(sheet, /if \(motion\.outMs === 0\) \{ release\(\); return undefined; \}/);
  assert.match(sheet, /\} else if \(phase === 'up' && !wants\) \{\s*cancelAnimationFrame\(showFrame\.current\);\s*setPhase\('closing'\);/, 'even an instant leave goes through the release');
  // ROOT-GATE: the enter starts in the commit that first draws the sheet, not one re-render later.
  assert.match(sheet, /opener\.current = openerNow\(\);\s*enterNow\(\);\s*setPhase\('up'\);/);
  assert.ok(H.SHEET_RELEASE_FRAMES >= 2 && H.SHEET_RELEASE_FALLBACK_MS <= 300);
  assert.match(sheet, /<SheetOverlay\.Provider value=\{setOverlay\}>/, 'the in-sheet gate layer still draws in the sheet');
});

test('the root grown-up gate fades with the in-tree sheet, so its fade can never eat the next tap', () => {
  const gate = src('src/components/GrownUpGate.tsx');
  assert.match(gate, /if \(inTreeRef\.current\) \{ closeAfterFade\(ok\); return; \}/);
  assert.match(gate, /animationType=\{inTreeRef\.current && !reduced \? 'fade' : 'none'\}/);
});

test('N01: a tap on a card that its owner is already shrinking away is the screen\'s (kept, replayed once, never on the card too)', () => {
  // Phase log, release-like JS (rel-loop-pre-release-fix): the map PLAY! press landed on the coin card 0.6 s after
  // CalmModal began to shrink it; the door still had it wanted and no layer was listed as leaving, so it was lost.
  const calm = src('src/components/retention/CalmModal.tsx');
  assert.match(calm, /leaving=\{!visible\}/);
  const dialog = src('src/ui/GameDialog.tsx');
  assert.match(dialog, /leaving=\{fading\}/);
  assert.match(dialog, /const fadeOut = \(token: number\) => \{\s*setFading\(true\);/);
  const sheet = src('src/ui/OverlaySheet.tsx');
  assert.match(sheet, /now\.current\.props\.leaving === true( \|\| event\.nativeEvent\.tpsLeaving === true)?, !now\.current\.nested\);/);
  assert.match(sheet, /const leaving = phase === 'closing' \|\| \(phase === 'up' && !wants\) \|\| props\.leaving === true;/);
  const door = src('src/ui/DoorModal.tsx');
  assert.match(door, /now\.current\.props\.leaving === true( \|\| event\.nativeEvent\.tpsLeaving === true)?, !now\.current\.nested\);/);
  assert.match(door, /pointerEvents=\{props\.leaving === true \? 'box-only' : undefined\}/);
});

test('N01 on every sibling: react-native-modal\'s own leave reaches the door as leaving, so a tap then is the screen\'s', () => {
  // 34 sheets use react-native-modal: it keeps its Modal visible through its own out animation, so a tap then died on
  // its backdrop with the door none the wiser. Fails on 104da83c (no rnModalLeaving, nothing installed it).
  const isValidElement = v => !!v && typeof v === 'object' && 'type' in v;
  const cloneElement = (el, extra) => ({ ...el, props: { ...el.props, ...extra } });
  const R = loadTs('src/ui/rnModalLeaving.ts', { react: { default: { isValidElement, cloneElement }, isValidElement, cloneElement } });
  assert.equal(R.rnModalLeaving({ isVisible: false }, { isVisible: true }), true, 'asked to hide, still on screen');
  assert.equal(R.rnModalLeaving({ isVisible: true }, { isVisible: true }), false);
  assert.equal(R.rnModalLeaving({ isVisible: false }, { isVisible: false }), false, 'gone: the door is off anyway');
  assert.equal(R.rnModalLeaving({ isVisible: true }, { isVisible: false }), false, 'coming in is never leaving');
  const NativeModal = function Modal() {};
  const View = 'View';
  class Fake { render() { return this.cover ? { type: NativeModal, props: { visible: this.state.isVisible } } : { type: View, props: {} }; } }
  assert.equal(R.installRnModalLeaving(Fake, NativeModal), true);
  assert.equal(R.installRnModalLeaving(Fake, NativeModal), false, 'wrapped once');
  assert.equal(R.installRnModalLeaving(null, NativeModal), false, 'a missing package is left alone');
  const leavingOf = (isVisible, shown, cover = true) => Object.assign(new Fake(), { cover, props: { isVisible }, state: { isVisible: shown } }).render().props.leaving;
  assert.equal(leavingOf(false, true), true);
  assert.equal(leavingOf(true, true), undefined, 'up: untouched');
  assert.equal(leavingOf(false, true, false), undefined, 'coverScreen false renders a plain View: untouched');
  const guards = src('src/ui/installNativeGuards.ts');
  assert.match(guards, /installRnModalLeaving\(require\('react-native-modal'\)\.default, require\('react-native'\)\.Modal\)/);
  const rnm = fs.readFileSync(path.join(root, 'node_modules/react-native-modal/dist/modal.js'), 'utf8');
  assert.match(rnm, /React\.createElement\(Modal, Object\.assign\(\{ transparent: true, animationType: 'none', visible: this\.state\.isVisible/, 'the render this wraps');
});

test('W4-SMOKE-2: a released sheet is hidden by a plain view, never by the animated style a stalled frame clock keeps mid-fade', () => {
  const sheet = src('src/ui/OverlaySheet.tsx');
  assert.match(sheet, /<View collapsable=\{false\} style=\{\[StyleSheet\.absoluteFill, shownReleased && styles\.released\]\} pointerEvents=\{shownReleased \? 'none' : 'box-none'\}>/);
  assert.doesNotMatch(sheet, /enter, (shownR|r)eleased && styles\.released/, 'the release is not on the Reanimated view');
  assert.match(sheet, /released: \{ opacity: 0 \}/);
});

test('N01: a held tap is pressed under the sheet the moment it is released, not two frames and a tree removal later', () => {
  // Phase log, Rewards, release-like JS: 0.75 to 1.7 s between the release and the sheet leaving the tree on a busy
  // phone, all of it added to a kept press. Fails on 535be9b0 (the held tap waited for the tree removal).
  const sheet = src('src/ui/OverlaySheet.tsx');
  assert.match(sheet, /const shownReleased = released \|\| \(motion\.outMs === 0 && !wants && phase !== 'off'\);/, 'no leave motion: released in the commit that stops wanting it');
  assert.match(sheet, /if \(shownReleased && !now\.current\.wants\) deliverAtRelease\('release'\);/);
  assert.match(sheet, /if \(now\.current\.nested \|\| overlayStack\.others\(id\.current\)\) return;/, 'never onto another sheet');
  assert.match(sheet, /if \(releasedRef\.current\) setTimeout\(\(\) => deliverAtRelease\('touch'\), 0\);/);
  assert.match(sheet, /<FullWindowOverlayNative style=\{\[styles\.overlay, \{ width, height \}, place\]\} pointerEvents=\{shownReleased \? 'box-none' : undefined\}>/);
  // The hit test this relies on skips a node that is neither a touch target nor holds one (React Native 0.76).
  const cpp = fs.readFileSync(path.join(root, 'node_modules/react-native/ReactCommon/react/renderer/core/LayoutableShadowNode.cpp'), 'utf8');
  assert.match(cpp, /if \(!layoutableShadowNode->canBeTouchTarget\(\) &&\s*!layoutableShadowNode->canChildrenBeTouchTarget\(\)\) \{\s*return nullptr;/);
  assert.match(cpp, /return layoutableShadowNode->canBeTouchTarget\(\) \? node : nullptr;/, 'a box-none overlay is never the hit itself');
});

test('ROOT-GATE N02: a gate ask reads the saved rest once per launch, and a gate in a sheet is drawn in the commit that asked for it', () => {
  // Phase log, need_ticket row: 179 ms from the row's touch to the gate's request (two storage reads on every ask),
  // then a passive-effect flush before the sheet drew it. Fails on 535be9b0.
  const gate = src('src/components/GrownUpGate.tsx');
  assert.match(gate, /open = \(restDone \? start\(\) : restLoaded\(\)\.then\(start\)\)\.finally/, 'asked inside the press once the rest is read');
  assert.doesNotMatch(gate, /open \?\?= loadRest\(\)/, 'never two storage round trips per ask');
  assert.match(gate, /function restLoaded\(\): Promise<void> \{\s*restReady \?\?= loadRest\(\)\.finally\(\(\) => \{ restDone = true; \}\);\s*return restReady;\s*\}/);
  assert.match(gate, /useLayoutEffect\(\(\) => \{\s*if \(!sheetOverlay \|\| bodyRef\.current === sentRef\.current\) return;/);
});

test('SAFETY-first-press: no endless JS-driven pulse on a card (each frame re-committed the whole screen and held taps 3 to 12 s)', () => {
  // Sampled on the simulator (release-like JS, coin card with 0 Tickets): the JS thread spent 3 s of 3 in Animated's
  // flush calling setNativeProps, each a full shadow tree commit through Reanimated's commit hook, and the UI thread 93%
  // in Reanimated's mount hook. The coin card's coin pulse (react-native-animatable, no native driver) was the loop.
  const box = src('src/components/RedeemModal/Box.tsx');
  assert.doesNotMatch(box, /from 'react-native-animatable'/, 'the coin pulse is not a JS-driven loop');
  assert.match(box, /withRepeat\(withTiming\(BOX_PULSE_SCALE/, 'it runs on the UI thread');
  assert.match(box, /useAmbientLoop\(/, 'and rests with Reduce Motion, Battery Saver and an idle phone');
  // The whole app: every endless Animatable animation runs on the native driver.
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []);
  for (const file of walk(path.join(root, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<Animatable\.[A-Za-z]+[\s\S]*?>/g)) {
      if (/iterationCount=("infinite"|\{'infinite'\})/.test(m[0])) assert.match(m[0], /useNativeDriver/, `${path.relative(root, file)}: an endless Animatable loop must use the native driver`);
    }
  }
});

test('W4-SMOKE-2: a tap that lands on the gate after Not now but before the gate is leaving on screen is held for what is under it', () => {
  // Phase log (try 3 of 20): Not now and a quick tap on the row reached the app in one batch (416 and 417 ms), before
  // the gate's leave was committed, so the row's tap fell on the gate and was lost. Fails on 598c8bd9.
  const L = loadTs('src/ui/SheetOverlayLayer.tsx', {
    react: { useContext: () => null, useEffect() {}, useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { absoluteFill: {} }, View: 'View' },
    'react-native-reanimated': { __esModule: true, default: { View: 'Animated.View' }, Easing: { in: f => f, out: f => f, quad: 1 }, runOnJS: f => f, useAnimatedStyle: f => f, useSharedValue: v => ({ value: v }), withTiming: v => v },
    './pressTrace': { pressTrace() {} },
    './sheetOverlay': { sheetPressContext: () => ({}) },
    './useUiReducedMotion': { __esModule: true, default: () => false },
  });
  const el = L.default({ leaving: false, children: null });
  const asked = { nativeEvent: { pageX: 199, pageY: 679, tpsLeaving: true } };
  el.props.onTouchStart(asked);
  assert.equal(asked.nativeEvent.tpsSheetNoted, true, 'held by the layer, not noted by the sheet as its own');
  const plain = { nativeEvent: { pageX: 199, pageY: 679 } };
  el.props.onTouchStart(plain);
  assert.equal(plain.nativeEvent.tpsSheetNoted, undefined, 'a gate that is up and not closing keeps its own taps');
  const gate = src('src/components/GrownUpGate.tsx');
  assert.match(gate, /if \(answerRef\.current !== null\) \(event\.nativeEvent as \{ tpsLeaving\?: boolean \}\)\.tpsLeaving = true;/);
  assert.match(gate, /const press = \(k: typeof KEYS\[number\]\) => \{\s*\/\/[^\n]*\n\s*if \(answerRef\.current !== null\) return;/, 'a key never acts on a closing gate');
  assert.match(src('src/ui/OverlaySheet.tsx'), /now\.current\.props\.leaving === true \|\| event\.nativeEvent\.tpsLeaving === true, !now\.current\.nested\);/, 'the root gate\'s sheet keeps it for the screen');
});
