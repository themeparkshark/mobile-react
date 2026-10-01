const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
const session = loadTs('src/gamekit/core/session.ts');
const scoring = loadTs('src/gamekit/core/scoring.ts');

function shell(paid, reduced = false, extra = {}, movement = null) {
  const calls = { start: 0, complete: 0, close: 0, pause: [], resume: 0, lineResume: 0, snapshots: [], cleared: [], music: [] };
  const preference = { reduced };
  const haptic = new Proxy({}, { get: () => () => {} });
  const movementContext = { value: movement };
  const view = runtime('src/gamekit/GameShellV2.tsx', {
    './theme': { GAME_COLORS: {}, COUNTDOWN: { stepMs: 600, goMs: 400 }, JUICE: {}, LINE_MOVING_TOAST: 'Moving' },
    './LinePlayMovementContext': { LinePlayMovementContext: movementContext, shouldPauseForMovement: c => Boolean(c && c.moving && c.lineMovePolicy === 'pause') },
    './RideChallengeContext': { RideChallengeContext: { value: paid } },
    './Haptics': { Haptic: haptic }, './SFX': { playSfx() {} },
    '../hooks/useReducedGameMotion': { default: () => preference.reduced },
    '../ui/GameIcon': { default: 'GameIcon' },
    './results/ResultsCard': { ResultsCard: 'ResultsCard' },
    './core/session': session,
    './core/scoring': scoring,
    './session/snapshotStore': { saveSnapshot: async snap => { calls.snapshots.push(snap); }, clearSnapshot: async key => { calls.cleared.push(key); } },
    './audio/GameAudio': { GameAudio: { music: {
      pause: async () => calls.music.push('pause'), resume: async () => calls.music.push('resume'),
      setTrimDb: db => calls.music.push(`trim ${db}`) } } },
  }, { visible: true, title: 'Memory Match', score: 0, onStart() { calls.start++; },
    onComplete(mult, meta) { calls.complete++; calls.mult = mult; calls.meta = meta; },
    onClose() { calls.close++; }, onPause(reason) { calls.pause.push(reason); }, onResume() { calls.resume++; },
    children: 'The game board', ...extra });
  return { view, calls, preference, movementContext };
}

/** Run every pending timer (in id order) and re-render. */
function flush(view) {
  for (let guard = 0; guard < 10 && view.timers.size; guard++) {
    const pending = Array.from(view.timers.entries());
    view.timers.clear();
    pending.forEach(([, fn]) => fn());
    view.render();
  }
}

function startPlaying(view) {
  view.find(node => node.type === 'Pressable').props.onPress();
  view.render();
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
  const card = view.find(node => node.type === 'ReanimatedView' && node.props.style?.[0]?.width === '86%' && node.props.style?.[1]?.opacity !== undefined);
  assert.equal(card.props.style[1].opacity, 1);
  assert.deepEqual(Array.from(card.props.style[1].transform, entry => entry.scale), [1]);
  assert.equal(calls.complete, 0);
  view.unmount();
});

test('QUEUE REALITY: the line moving never pauses play; it acknowledges LinePlay and shows a gentle heads-up', () => {
  const movement = { moving: false, onResume() { calls.lineResume++; } };
  const { view, calls, movementContext } = shell(false, false, {}, movement);
  startPlaying(view);
  assert.equal(calls.start, 1);
  for (let i = 0; i < 4; i++) {
    movementContext.value = { ...movement, moving: true }; view.render();
    movementContext.value = { ...movement, moving: false }; view.render();
  }
  assert.deepEqual(calls.pause, [], 'movement never pauses');
  assert.equal(calls.lineResume, 4, 'each movement episode is acknowledged so LinePlay keeps going');
  assert.ok(view.find(node => node.type === 'Text' && node.props.children === 'Heads up, the line moved'), 'the line advanced a lot: heads-up chip');
  assert.equal(view.find(node => node.type === 'View' && node.props.children?.props?.children === 'Paused'), undefined);
  assert.ok(calls.music.includes('trim -3'), 'music dips 3 dB while the line moves, never stops');
  view.unmount();
  assert.equal(view.timers.size, 0);
});

test('QUEUE REALITY: backgrounding holds with an exact snapshot, and coming back resumes with a quick 3-2-1', () => {
  let listener;
  const snapshot = { score: 420, simMs: 18000, steps: 1080, state: { holes: [1, 0, 2], combo: 7 } };
  const { view, calls } = shell(false, false, { gameId: 'whack', sessionKey: 'whack:ride-9:1', getSnapshot: () => snapshot });
  view.native.AppState.addEventListener = (_name, fn) => { listener = fn; return { remove() { listener = undefined; } }; };
  view.change({ visible: false }); view.change({ visible: true });
  startPlaying(view);
  listener('background'); view.render();
  assert.deepEqual(calls.pause, ['Paused while away']);
  assert.equal(calls.snapshots.length, 1);
  const saved = calls.snapshots[0];
  assert.equal(saved.key, 'whack:ride-9:1');
  assert.equal(saved.game, 'whack');
  assert.equal(saved.reason, 'background');
  assert.deepEqual(JSON.parse(JSON.stringify(saved.state)), snapshot.state);
  assert.ok(calls.music.includes('pause'));
  listener('active'); view.render();
  assert.equal(calls.resume, 0, 'play waits for the 3-2-1');
  assert.ok(view.find(node => node.type === 'Text' && node.props.children === 'Back in!'));
  flush(view);
  assert.equal(calls.resume, 1, 'resumed exactly once after the count');
  assert.ok(calls.music.includes('resume'));
  view.unmount();
});

test('QUEUE REALITY: a manual pause is saved, and resume counts 3-2-1 quickly (about 1.1s)', () => {
  const { view, calls } = shell(false);
  startPlaying(view);
  const pause = view.find(node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Pause');
  pause.props.onPress(); view.render();
  assert.equal(calls.pause.length, 1);
  const resume = view.find(node => node.type === 'TouchableOpacity' && node.props.children?.props?.children === 'Resume');
  resume.props.onPress(); view.render();
  assert.ok(view.timers.size >= 4 && view.timers.size <= 6, 'three beats, GO, then play');
  flush(view);
  assert.equal(calls.resume, 1);
  view.unmount();
  assert.equal(view.timers.size, 0);
});

test('QUEUE REALITY: only a real queue event ends the run, with the result saved and handed on', () => {
  const movement = { moving: false, onResume() {} };
  const thresholds = { one: 100, two: 300, three: 600 };
  const { view, calls, movementContext } = shell(false, false, { score: 350, thresholds, sessionKey: 'k' }, movement);
  startPlaying(view);
  movementContext.value = { ...movement, queueEnded: 'boarding' }; view.render();
  assert.equal(calls.pause.at(-1), 'wrapUp');
  const card = view.find(node => node.type === 'ResultsCard');
  assert.equal(card.props.stars, 2, 'stars from the thresholds at the moment the ride came up');
  assert.equal(card.props.message, "YOUR RIDE'S UP!");
  assert.equal(card.props.note, 'Run saved. Enjoy the ride!');
  assert.deepEqual(calls.cleared, ['k']);
  view.find(node => node.type === 'TouchableOpacity' && node.props.children?.props?.children === 'Continue').props.onPress();
  assert.equal(calls.complete, 1);
  assert.equal(calls.meta.wrapUp, 'boarding');
  view.unmount();
});

test('results offer PLAY AGAIN and CHALLENGE in queue games, never in a paid ride challenge', () => {
  const rematch = () => {};
  const queue = shell(false, false, { onRematch: rematch, onChallenge() {} });
  startPlaying(queue.view);
  queue.view.change({ result: { score: 50, stars: 0 } });
  assert.ok(queue.view.find(node => node.type === 'TouchableOpacity' && node.props.onPress === rematch));
  const paid = shell(true, false, { onRematch: rematch });
  startPlaying(paid.view);
  paid.view.change({ result: { score: 50, stars: 1 } });
  assert.equal(paid.view.find(node => node.type === 'TouchableOpacity' && node.props.onPress === rematch), undefined);
  queue.view.unmount(); paid.view.unmount();
});
