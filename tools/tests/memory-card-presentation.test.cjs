const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const setup = (props = {}) => {
  const forwardedRef = { current: null };
  const run = runtime('src/games/memory/MemoryCard.tsx', {
    '../../gamekit': { GAME_COLORS: { navy: '#123' }, JUICE: { settleSpring: {}, popSpring: {} } },
  }, { size: 72, slot: 0, symbolName: 'owl', glyph: 'OWL', tint: '#fff',
    entranceDelay: 120, onPress() {}, forwardedRef, ...props });
  return { run, forwardedRef };
};

test('reduced-motion cards show immediately and keep matching feedback without flips or shakes', () => {
  const { run, forwardedRef } = setup({ reducedMotion: true });
  assert.equal(run.timers.size, 0);
  forwardedRef.current.setFaceUp(true);
  forwardedRef.current.shake();
  forwardedRef.current.celebrate();
  run.render();
  assert.equal(run.tree.props.accessibilityLabel, 'Card 1, owl');
  assert.equal(run.motions.length, 0);
  run.change({ matched: true });
  assert.equal(run.tree.props.accessibilityState.disabled, true);
  assert.equal(run.tree.props.accessibilityLabel, 'Card 1, matched owl');
});

test('changing motion preferences preserves an open card and cancels every animation and delayed entrance', () => {
  const { run, forwardedRef } = setup({ reducedMotion: false });
  assert.equal(run.timers.size, 1);
  forwardedRef.current.setFaceUp(true);
  run.render();
  assert.ok(run.motions.length > 0);
  run.change({ reducedMotion: true });
  assert.equal(run.timers.size, 0);
  assert.equal(run.tree.props.accessibilityLabel, 'Card 1, owl');
  assert.ok(new Set(run.cancelled).size >= 5);
  run.change({ reducedMotion: false });
  assert.equal(run.timers.size, 0, 'already-visible cards do not hide and re-enter');
  run.unmount();
  assert.equal(forwardedRef.current, null);
});

test('failed artwork falls through once to a readable symbol, and replacement art remains usable', () => {
  const { run } = setup({ faceSheet: 'atlas', faceSource: 'individual', frameSource: 'frame', sheetSlot: 2 });
  run.find(node => node.type === 'Image' && node.props.source === 'atlas').props.onError(); run.render();
  run.find(node => node.type === 'Image' && node.props.source === 'individual').props.onError(); run.render();
  run.find(node => node.type === 'Image' && node.props.source === 'frame').props.onError(); run.render();
  assert.equal(run.find(node => node.type === 'Image'), undefined);
  assert.ok(run.find(node => node.type === 'Text' && node.props.children === 'OWL'));
  run.change({ faceSheet: 'replacement-atlas' });
  assert.ok(run.find(node => node.type === 'Image' && node.props.source === 'replacement-atlas'));
});
