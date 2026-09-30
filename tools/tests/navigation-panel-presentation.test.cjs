const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const logic = require('./helpers/navigation-panel.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
const tokens = loadTs('src/ui/tokens.ts');
const circuitTheme = loadTs('src/services/lineplay/circuitTheme.ts', {
  '../rideTheme': loadTs('src/services/rideTheme.ts') });
function card(initial = {}) {
  const turns = [], sounds = [], announcements = [], bursts = []; let reduced = true;
  const app = runtime('src/screens/LinePlay/components/NavigationPanelCard.tsx', {
    '../../../services/lineplay/navigationPanel': logic,
    '../../../services/lineplay/circuitTheme': circuitTheme,
    '../../../hooks/useReducedGameMotion': { default: () => reduced },
    '../../../helpers/hapticPatterns': { default: { selection() {}, success() {} } },
    '../../../gamekit/SFX': { playSfx: name => sounds.push(name) },
    '../../../gamekit/Particles': { ParticleField: 'ParticleField' },
    '../../../ui': { BRAND: tokens.BRAND, GameButton: 'GameButton', GameIcon: 'GameIcon' },
    'react-native-svg': { default: 'Svg', Circle: 'Circle', Path: 'Path' },
  }, { seed: 0, paused: false, completed: false,
    onTurn: index => turns.push(index), onNewRound() {}, onNext() {}, ...initial });
  app.native.AccessibilityInfo.announceForAccessibility = value => { announcements.push(value); return Promise.resolve(); };
  return { app, turns, sounds, announcements, bursts,
    preference(value) { reduced = value; app.render(); },
    tile: (row, column) => app.find(node => node.type === 'Pressable' &&
      node.props.accessibilityLabel?.startsWith(`Circuit tile row ${row}, column ${column}.`)) };
}
test('a manual pause keeps a visible board but blocks tile edits and shows saved progress', () => {
  const c = card(); const tile = c.tile(1, 1); tile.props.onPress();
  assert.deepEqual(c.turns, [0]); c.app.change({ paused: true });
  const paused = c.tile(1, 1); assert.equal(paused.props.disabled, true);
  paused.props.onPress(); assert.deepEqual(c.turns, [0]);
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'Paused. Your circuit is saved right where you left it.'));
});
test('every tile of a 4x4 replay board is a big labelled target and the relays are drawn art, not glyphs', () => {
  const c = card({ progress: logic.createNavigationPanelProgress(0, 1) });
  const board = logic.createNavigationPanel(0, 1);
  assert.equal(board.size, 4);
  for (let row = 1; row <= 4; row++) for (let column = 1; column <= 4; column++) assert.ok(c.tile(row, column));
  assert.equal(c.app.find(node => node.type === 'Text' && /[\u2190-\u21ff\u2600-\u27bf]/.test(String(node.props.children))), undefined);
  assert.ok(c.app.find(node => node.type === 'GameIcon' && node.props.name === 'star'));
});
test('a themed free-play circuit names its own place and next round', () => {
  const theme = circuitTheme.circuitThemeFor('Pirates of the Caribbean');
  const c = card({ mode: 'free', theme, nextLabel: 'Sharky Swim',
    progress: logic.createNavigationPanelProgress(0, 0, true), completed: true });
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'HARBOR · SIGNAL REPAIR'));
  assert.ok(c.app.find(node => node.props?.accessibilityLabel === 'Next: Sharky Swim'));
});
test('one solved repair celebrates once, keeps next action ready and respects a live motion preference', () => {
  const c = card(); c.preference(false);
  c.app.change({ progress: logic.createNavigationPanelProgress(0, 0, true), completed: true });
  assert.equal(c.sounds.filter(name => name === 'win').length, 1);
  assert.equal(c.announcements.length, 1);
  const next = c.app.find(node => node.props?.accessibilityLabel === 'Next mission: Find the missing signal');
  assert.ok(next); assert.equal(next.props.disabled, false);
  // With motion on, the payoff springs in after the flow reaches the exit.
  assert.ok(c.app.motions.includes('spring'));
  c.preference(true);
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
