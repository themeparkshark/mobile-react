const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/press-and-footer-motion.test.cjs
// One squishy press everywhere (src/ui/PressableScale) and the footer's pick-a-tab bounce.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };

function pressView(props, reduced = false) {
  const haptics = [];
  const view = runtime('src/ui/PressableScale.tsx', {
    './useUiReducedMotion': { default: () => reduced },
    '../gamekit/Haptics': { queueHaptic: intent => haptics.push(intent) },
    './motionEasing': easing,
  }, props);
  return { view, haptics, pressable: () => view.tree };
}

test('press look: a squash for buttons, a subtle one for rows, a dim with Reduce Motion', () => {
  const { pressLook, pressHapticAt } = loadTs('src/ui/PressableScale.tsx', {
    'react-native': {}, 'react-native-reanimated': {}, 'react/jsx-runtime': {}, react: {},
    '../gamekit/Haptics': {}, './motionEasing': easing, './useUiReducedMotion': {},
  });
  assert.deepEqual({ ...pressLook('button', false) }, { scale: 0.94, sinkPt: 1.5, heldOpacity: 1 });
  assert.deepEqual({ ...pressLook('subtle', false) }, { scale: 0.97, sinkPt: 0, heldOpacity: 1 });
  assert.deepEqual({ ...pressLook('button', true) }, { scale: 1, sinkPt: 0, heldOpacity: 0.85 }, 'Reduce Motion never moves');
  assert.deepEqual({ ...pressLook('none', false) }, { scale: 1, sinkPt: 0, heldOpacity: 1 });
  assert.equal(pressHapticAt('button'), 'pressIn', 'buttons buzz on touch-down so it feels instant');
  assert.equal(pressHapticAt('subtle'), 'press', 'rows buzz on release, so starting a scroll never buzzes');
  assert.equal(pressHapticAt('button', true), 'held', 'a button in a list waits a beat, so a scroll that starts on it stays silent');
  assert.equal(easing.PRESS.scrollHoldMs, 90);
});

test('PressableScale: one haptic per press, a squash and a spring back, a shake on a disabled tap', () => {
  let presses = 0;
  const { view, haptics, pressable } = pressView({ onPress: () => { presses += 1; }, children: 'Go' });
  assert.equal(pressable().type, 'Pressable');
  assert.equal(pressable().props.accessibilityRole, 'button');
  pressable().props.onPressIn({}); pressable().props.onPress({}); pressable().props.onPressOut({});
  assert.equal(presses, 1);
  assert.deepEqual(haptics, ['tapLight'], 'exactly one buzz');
  assert.ok(view.motions.includes('timing') && view.motions.includes('spring'), 'squash down, spring back');

  view.change({ disabled: true });
  const before = view.motions.length;
  pressable().props.onPressIn({}); pressable().props.onPress({});
  assert.equal(presses, 1, 'nothing fires');
  assert.deepEqual(haptics, ['tapLight', 'hitSoft'], 'a disabled tap is a soft nope in the hand, never a tap buzz or an error');
  assert.ok(view.motions.length > before, 'it shakes no');
  assert.equal(pressable().props.accessibilityState.disabled, true);
});

test('PressableScale: rows buzz on release; no haptic when asked', () => {
  const row = pressView({ variant: 'subtle', onPress() {} });
  row.pressable().props.onPressIn({});
  assert.deepEqual(row.haptics, [], 'touch-down on a row is silent (it may be a scroll)');
  row.pressable().props.onPress({});
  assert.deepEqual(row.haptics, ['tapLight']);
  const quiet = pressView({ haptic: false, onPress() {} });
  quiet.pressable().props.onPressIn({}); quiet.pressable().props.onPress({});
  assert.deepEqual(quiet.haptics, []);
});

test('every art button uses the one shared press (no legacy JS-thread Animated left)', () => {
  for (const file of ['src/ui/GameButton.tsx', 'src/components/YellowButton.tsx', 'src/components/RedButton.tsx', 'src/components/Button.tsx']) {
    const source = read(file);
    assert.match(source, /usePressScale\(/, `${file} uses the shared press`);
    assert.doesNotMatch(source, /new Animated\.Value|Animated\.timing/, `${file} has no legacy Animated press`);
  }
});

const finished = [];
const footer = loadTs('src/components/footerMotion.ts', {
  'react-native-reanimated': { makeMutable: value => ({ value }), cancelAnimation() {}, withDelay: (ms, v) => v,
    withSequence: (...v) => v.at(-1), withSpring: v => v, withTiming: (v, cfg, cb) => { if (cb) finished.push(cb); return v; } },
  '../ui/motionEasing': easing,
});

test('footer: tab order matches the bar, taps pick or re-pick', () => {
  assert.deepEqual([...footer.FOOTER_TABS], ['News', 'Leaderboard', 'Explore', 'Social', 'Profile']);
  assert.equal(footer.footerIndex('Explore'), footer.COMPASS_INDEX);
  assert.equal(footer.footerIndex('Inventory'), -1);
  assert.equal(footer.footerTapKind(0, 1), 'select');
  assert.equal(footer.footerTapKind(1, 1), 'reselect');
  assert.equal(footer.footerTapKind(-1, 3), 'select', 'from a non-tab screen');
  assert.equal(footer.footerTapKind(0, 9), 'none');
});

test('footer: the bounce follows the director numbers and everything returns to rest', () => {
  const F = footer.FOOTER_MOTION;
  assert.equal(F.hopPt, 11);
  assert.equal(F.popScale, 1.25);
  assert.equal(F.sinkScale, 0.92);
  assert.equal(F.compassSquashMs, 80, 'the compass squashes before it pops (anticipation)');
  assert.ok(F.compassWobbleDeg <= 10, 'a small wobble on its base, never a full turn of the baked shadow');
  assert.equal(F.wiggleScale, 1.08);
  const m = footer.footerMotion;
  footer.playFooterTap(0, 2, false);
  finished.splice(0).forEach(cb => cb(true));
  // The stub lands every animation at its final value: the footer at rest is identity (pixel-identical bar).
  assert.equal(m.hopIndex.value, 2);
  assert.equal(m.hopY.value, 0);
  assert.equal(m.hopScale.value, 1);
  assert.equal(m.sinkScale.value, 1);
  assert.equal(m.glowOpacity.value, 0, 'the glow never stays lit');
  assert.equal(m.glowX.value, 2);
  assert.equal(m.compassSquash.value, 0, 'the squash springs back to rest');
  assert.equal(m.compassWobble.value, 0, 'the wobble ends upright');
  assert.equal(m.ring.value, 1, 'the ring pulse ran to its end (drawn invisible at 1)');
  assert.equal(m.burst.value, 1, 'the sparkle burst ran to its end (drawn invisible at 1)');
  assert.equal(m.labelLift.value, 0);
  assert.equal(m.labelOpacity.value, 1);
  m.hopIndex.value = -1;
  footer.playFooterTap(0, 3, true);
  assert.equal(m.hopIndex.value, -1, 'Reduce Motion: no bounce (the haptic still comes from the press)');
});

test('footer: positions and sizes of the five icons are unchanged (motion only)', () => {
  const source = read('src/components/Wrapper.tsx');
  for (const needle of ["width: item.size === 'normal' ? 50 : 100", "top: item.size === 'normal' ? 0 : -45", 'paddingLeft: 32',
    "justifyContent: 'space-between'", 'aspectRatio: 5.3']) assert.ok(source.includes(needle), `footer lost: ${needle}`);
  assert.match(source, /pressHaptic="tickSelection"/, 'a tab pick is a selection tick');
  assert.doesNotMatch(source, /react-native-svg/, 'no animated SVG in the footer');
  assert.doesNotMatch(source, /compassSpin|shadowRadius: 14/, 'no spinning compass art, no animated iOS shadow under the glow');
  assert.match(source, /cachePolicy="memory-disk"/, 'footer icons stay decoded in memory, so a tab switch never blanks them');
  assert.match(source, /transformOrigin: 'bottom'/, 'the compass wobbles on its base');
});

test('rolling number: digits roll the short way up for gains and down for losses, ones column first', () => {
  const { planRoll, defaultFormat } = loadTs('src/ui/RollingNumber.tsx', {
    react: { memo: c => c }, 'react/jsx-runtime': {}, 'react-native': {}, 'react-native-reanimated': {},
    './motionEasing': easing, './useUiReducedMotion': {}, '../gamekit/Haptics': { queueHaptic() {} },
  });
  assert.equal(defaultFormat(12345), '12,345');
  const up = JSON.parse(JSON.stringify(planRoll('375', '855', true, false)));
  assert.deepEqual(up.map(c => [c.from, c.to]), [[3, 8], [7, 15], [5, 5]], 'tens rolls 7 up through 9 to 5');
  assert.ok(up[1].delay < up[0].delay, 'each column to the left starts later');
  assert.equal(up[2].delay, 0);
  const down = JSON.parse(JSON.stringify(planRoll('855', '715', false, false)));
  assert.deepEqual(down.map(c => [c.from, c.to]), [[8, 7], [5, 1], [5, 5]]);
  const comma = JSON.parse(JSON.stringify(planRoll('999', '1,024', true, false)));
  assert.equal(comma[1].from, null, 'commas never roll');
  assert.equal(comma[0].from, 0, 'a new column rolls up from 0');
  const big = JSON.parse(JSON.stringify(planRoll('100', '25,100', true, true)));
  assert.deepEqual(big.filter(c => c.from !== null && c.from !== c.to).length, 2, 'a big jump rolls only the top columns');
});

test('toasts: one at a time, a calm wait, a win buzzes and a problem never error-buzzes', () => {
  const source = read('src/components/Toast.tsx');
  assert.match(source, /current\.id === shownId/, 'only the front toast shows');
  assert.doesNotMatch(source, /failBuzz|NotificationFeedbackType\.Error/, 'no error buzz for a kid');
  assert.doesNotMatch(source, /useNativeDriver/, 'toast motion runs on Reanimated');
  assert.match(source, /showMs: 2600/);
  assert.match(source, /gapMs: 120/);
});
