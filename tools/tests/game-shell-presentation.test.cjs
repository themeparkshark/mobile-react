const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
function shell(paid, reduced = false) {
  const calls = { start: 0, complete: 0, close: 0 };
  const preference = { reduced };
  const haptic = new Proxy({}, { get: () => () => {} });
  const view = runtime('src/gamekit/GameShellV2.tsx', {
    './theme': { GAME_COLORS: {}, COUNTDOWN: { stepMs: 600, goMs: 400 }, JUICE: {}, LINE_MOVING_TOAST: 'Moving' },
    './LinePlayMovementContext': { LinePlayMovementContext: { value: null },
      shouldPauseForMovement: context => Boolean(context?.moving && context.lineMovePolicy === 'pause') },
    './RideChallengeContext': { RideChallengeContext: { value: paid } },
    './Haptics': { Haptic: haptic }, './SFX': { playSfx() {} },
    '../hooks/useReducedGameMotion': { default: () => preference.reduced },
  }, { visible: true, title: 'Memory Match', score: 0, onStart() { calls.start++; },
    onComplete(mult, meta) { calls.complete++; calls.mult = mult; calls.meta = meta; },
    onClose() { calls.close++; }, children: 'The game board' });
  return { view, calls, preference };
}

test('paid ride games use their parent presentation while practice and queue games own a native modal', () => {
  const paid = shell(true), practice = shell(false);
  assert.equal(paid.view.tree.type, 'View');
  assert.equal(paid.view.find(node => node.type === 'Modal'), undefined);
  assert.equal(practice.view.tree.type, 'Modal');
  assert.equal(practice.view.tree.props.visible, true);
  paid.view.unmount(); practice.view.unmount();
});

test('the single paid presentation still starts once and hands off the same confirmed game proof once', () => {
  const { view, calls } = shell(true);
  const skip = view.find(node => node.type === 'Pressable');
  skip.props.onPress(); skip.props.onPress(); view.render();
  assert.equal(calls.start, 1);
  assert.equal(view.timers.size, 0);
  const meta = { game: 'memory-match-plus', score: 400, seed: 123 };
  view.change({ result: { score: 400, stars: 1, meta } });
  const complete = view.find(node => node.type === 'TouchableOpacity' && node.props.children?.props?.children === 'Continue');
  complete.props.onPress(); complete.props.onPress();
  assert.equal(calls.complete, 1);
  assert.equal(calls.mult, 1);
  assert.equal(calls.meta, meta);
  assert.equal(calls.close, 0);
  view.unmount();
  assert.equal(view.timers.size, 0, 'no delayed result burst or handoff survives closing');
});

test('changing motion preference keeps the countdown deadline and settles a result without replaying completion', () => {
  const { view, preference, calls } = shell(false);
  const countdown = Array.from(view.timers.keys());
  preference.reduced = true; view.render();
  assert.deepEqual(Array.from(view.timers.keys()), countdown, 'a visual preference change never restarts the game countdown');
  view.find(node => node.type === 'Pressable').props.onPress(); view.render();
  view.change({ result: { score: 400, stars: 1 } });
  assert.equal(view.timers.size, 0);
  assert.equal(view.tree.props.animationType, 'none');
  const card = view.find(node => node.type === 'ReanimatedView' && node.props.style?.[1]?.opacity !== undefined);
  assert.equal(card.props.style[1].opacity, 1);
  assert.deepEqual(Array.from(card.props.style[1].transform, entry => entry.scale), [1]);
  assert.equal(calls.complete, 0);
  view.unmount();
});
