const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const logic = require('./helpers/navigation-panel.cjs');
function card(initial = {}) {
  const turns = [], sounds = [], announcements = []; let reduced = true;
  const app = runtime('src/screens/LinePlay/components/NavigationPanelCard.tsx', {
    '../../../services/lineplay/navigationPanel': logic,
    '../../../hooks/useReducedGameMotion': { default: () => reduced },
    '../../../helpers/hapticPatterns': { default: { selection() {}, success() {} } },
    '../../../gamekit/SFX': { playSfx: name => sounds.push(name) },
    'react-native-svg': { default: 'Svg', Circle: 'Circle', Path: 'Path' },
  }, { seed: 0, paused: false, completed: false,
    onTurn: index => turns.push(index), onNewRound() {}, onNext() {}, ...initial });
  app.native.AccessibilityInfo.announceForAccessibility = value => { announcements.push(value); return Promise.resolve(); };
  return { app, turns, sounds, announcements,
    preference(value) { reduced = value; app.render(); },
    tile: (row, column) => app.find(node => node.type === 'Pressable' &&
      node.props.accessibilityLabel?.startsWith(`Circuit tile row ${row}, column ${column}.`)) };
}
test('moving-line pause keeps a visible board but blocks tile edits and shows saved progress', () => {
  const c = card(); const tile = c.tile(1, 1); tile.props.onPress();
  assert.deepEqual(c.turns, [0]); c.app.change({ paused: true });
  const paused = c.tile(1, 1); assert.equal(paused.props.disabled, true);
  paused.props.onPress(); assert.deepEqual(c.turns, [0]);
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'Your circuit is saved. Continue when the line stops.'));
});
test('one solved repair celebrates once, keeps next action ready and respects a live motion preference', () => {
  const c = card(); c.preference(false);
  c.app.change({ progress: logic.createNavigationPanelProgress(0, 0, true), completed: true });
  assert.equal(c.sounds.filter(name => name === 'win').length, 1);
  assert.equal(c.announcements.length, 1);
  const next = c.app.find(node => node.props?.accessibilityLabel === 'Next mission: Find the missing signal');
  assert.ok(next); assert.equal(next.props.disabled, false);
  const fade = c.app.animations.at(-1); assert.equal(fade.started, true);
  c.preference(true); assert.equal(fade.stopped, true);
  assert.equal(c.sounds.filter(name => name === 'win').length, 1);
  c.app.unmount();
});
test('restored completion is quiet, and replay is an uncompleted new puzzle without losing the chapter', () => {
  const c = card({ completed: true }); assert.equal(c.sounds.includes('win'), false);
  assert.equal(c.tile(1, 1).props.disabled, true);
  c.app.change({ progress: logic.createNavigationPanelProgress(0, 1) });
  assert.equal(c.tile(1, 1).props.disabled, false);
  assert.equal(c.app.find(node => node.props?.accessibilityLabel === 'Next mission: Find the missing signal'), undefined);
  assert.equal(c.sounds.includes('win'), false);
});

test('a new repair reveals its next action once after layout; restored wins leave the reader in place', () => {
  const c = card(), scrolls = [];
  c.app.tree.props.ref.current = { scrollToEnd: options => scrolls.push(options.animated) };
  c.app.tree.props.onContentSizeChange(); assert.equal(scrolls.length, 0);
  c.app.change({ progress: logic.createNavigationPanelProgress(0, 0, true), completed: true });
  c.app.tree.props.onContentSizeChange(); c.app.tree.props.onContentSizeChange();
  assert.deepEqual(scrolls, [false]);
  const restored = card({ completed: true });
  restored.app.tree.props.ref.current = { scrollToEnd: () => { throw Error('Old win must not move the reader'); } };
  restored.app.tree.props.onContentSizeChange();
});
test('a new repair scrolls smoothly only while motion is allowed', () => {
  const c = card(), scrolls = []; c.preference(false);
  c.app.tree.props.ref.current = { scrollToEnd: options => scrolls.push(options.animated) };
  c.app.change({ progress: logic.createNavigationPanelProgress(0, 0, true), completed: true });
  c.app.tree.props.onContentSizeChange(); assert.deepEqual(scrolls, [true]);
});
