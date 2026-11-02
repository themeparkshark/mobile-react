// The one native door (core loop fix round, November 2026). The device proof lives in core-loop/fix-w1/stability;
// these lock the rules so the family cannot come back quietly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/load-ts.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const D = () => loadTs('src/ui/nativeModalDoor.ts');

test('one sheet at a time: the second waits and presents the moment the first is really gone', () => {
  const door = D().createModalDoor({ setTimeout: () => undefined });
  const shown = [];
  door.request(1, () => shown.push(1));
  door.request(2, () => shown.push(2));
  door.request(3, () => shown.push(3));
  assert.deepEqual(shown, [1], 'UIKit never gets the chance to refuse a sibling');
  assert.equal(door.holder(), 1);
  door.release(1);
  assert.deepEqual(shown, [1, 2]);
  door.cancel(3);
  door.release(2);
  assert.deepEqual(shown, [1, 2], 'a sheet that stopped wanting to show never presents');
  assert.equal(door.holder(), null);
});

test('PLAY! then a second button, 20 of 20: whichever goes first, the other shows only after it, and the door is free after', () => {
  for (let i = 0; i < 20; i += 1) {
    const door = D().createModalDoor({ setTimeout: () => undefined });
    const shown = [];
    const [first, second] = i % 2 ? [1, 2] : [2, 1];
    door.request(first, () => shown.push(first));
    door.request(second, () => shown.push(second));
    door.release(first);
    door.release(second);
    assert.deepEqual(shown, [first, second]);
    assert.equal(door.holder(), null);
    assert.equal(door.waiting(), 0);
    door.request(3, () => shown.push(3));
    assert.equal(shown.at(-1), 3, 'PLAY! is alive after the race');
  }
});

test('a host torn out of the tree frees the slot only after UIKit has had time to take it down', () => {
  let run = null; let wait = 0;
  const door = D().createModalDoor({ setTimeout: (fn, ms) => { run = fn; wait = ms; } });
  const shown = [];
  door.request(1, () => shown.push(1));
  door.request(2, () => shown.push(2));
  door.releaseAfter(1, 380);
  assert.deepEqual(shown, [1]);
  assert.equal(wait, 380);
  run();
  assert.deepEqual(shown, [1, 2]);
});

test('a sheet UIKit never put up is presented again, a few times, then let go so the door moves on', () => {
  const M = D();
  assert.equal(M.doorPresentTimedOut(0, true), 'present_again');
  assert.equal(M.doorPresentTimedOut(M.DOOR_PRESENT_TRIES, true), 'let_go');
  assert.equal(M.doorPresentTimedOut(0, false), 'gone');
  assert.ok(M.DOOR_PRESENT_MS * (M.DOOR_PRESENT_TRIES + 1) <= 5000, 'a lost sheet never holds the door for long');
  assert.equal(M.doorNativeVisible('queued'), false);
  assert.equal(M.doorNativeVisible('closing'), false);
  assert.equal(M.doorNativeVisible('presenting'), true);
});

test('the door is every Modal on iOS, and a refused host can never take a touch', () => {
  const index = read('index.js');
  assert.ok(index.indexOf('./src/ui/installNativeGuards') < index.indexOf('registerRootComponent'), 'installed before anything renders');
  const install = read('src/ui/installNativeGuards.ts');
  assert.match(install, /Modal\/ModalInjection/);
  assert.match(install, /unstable_Modal = require\('\.\/DoorModal'\)/);
  const host = read('src/ui/DoorModal.tsx');
  assert.match(host, /pointerEvents="box-none"/, 'the frozen LinePlay was a refused host at 402 x 874 taking every touch');
  assert.match(host, /onDismiss=\{gone\}/);
  // The seam itself: React Native reads the injection when Modal is first required.
  assert.match(read('node_modules/react-native/Libraries/Modal/Modal.js'), /ModalInjection\.unstable_Modal \?\? Modal/);
});

test('no JS setNativeProps from animated digits: Reanimated keeps text and defaultValue on the UI thread', () => {
  assert.match(read('src/ui/installNativeGuards.ts'), /addWhitelistedNativeProps\(\{ text: true, defaultValue: true \}\)/);
  assert.doesNotMatch(read('src/gamekit/fx/LiveScore.tsx'), /setNativeProps/);
});

test('the paid game host has no pan responder on a tap: the swipe to close exists only on the card', () => {
  const calm = loadTs('src/components/retention/CalmModal.tsx', {
    react: { useEffect() {}, useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react-native': { Modal: 'Modal', PanResponder: { create: c => ({ panHandlers: c }) }, Pressable: 'Pressable', StyleSheet: { create: s => s, absoluteFill: {} }, useWindowDimensions: () => ({ width: 402 }) },
    'react-native-reanimated': { default: { View: 'AV' }, Easing: {}, cancelAnimation() {}, runOnJS: f => f, useAnimatedStyle: f => f, useSharedValue: v => ({ value: v }), withSpring: v => v, withTiming: v => v },
  });
  assert.equal(calm.calmSwipeCloses(120, 0), true);
  assert.equal(calm.calmSwipeCloses(40, 0.2), false);
  assert.equal(calm.calmSwipeCloses(4, 2), false, 'a tap never closes');
  const flow = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(flow, /onSwipeDown=\{flowState === 'preview' \? safeClose : undefined\}/);
});
