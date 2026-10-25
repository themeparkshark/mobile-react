// Hotfix wave 3 round 2: the results card must fade in only after it has mounted.
// On device the fade used to start in the same effect that switched phase to 'results'.
// A busy JS thread (a kid still tapping at the buzzer) mounted the card after the 220 ms
// fade had already finished on the UI thread, so the card stayed at opacity 0 over a
// dimmed board (Whack Ride Challenge, 3 of 5 late-tap runs on 9dd03501).
const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
const session = loadTs('src/gamekit/core/session.ts');
const scoring = loadTs('src/gamekit/core/scoring.ts');

function shell(extra = {}, reduced = false) {
  const haptic = new Proxy({}, { get: () => () => {} });
  return runtime('src/gamekit/GameShellV2.tsx', {
    './theme': { GAME_COLORS: {}, COUNTDOWN: { stepMs: 600, goMs: 400 }, JUICE: {}, LINE_MOVING_TOAST: 'Moving' },
    './LinePlayMovementContext': { LinePlayMovementContext: { value: null }, shouldPauseForMovement: () => false },
    './RideChallengeContext': { RideChallengeContext: { value: false } },
    './Haptics': { Haptic: haptic }, './SFX': { playSfx() {} },
    '../hooks/useReducedGameMotion': { default: () => reduced },
    '../ui/GameIcon': { default: 'GameIcon' },
    './results/ResultsCard': { ResultsCard: 'ResultsCard' },
    './core/session': session,
    './core/scoring': scoring,
    './session/snapshotStore': { saveSnapshot: async () => {}, clearSnapshot: async () => {} },
    './audio/GameAudio': { GameAudio: { music: { pause: async () => {}, resume: async () => {}, setTrimDb() {} } } },
  }, { visible: true, title: 'Whack-a-Shark', score: 0, onStart() {}, onComplete() {}, onClose() {},
    children: 'The game board', ...extra });
}
const isCard = node => node.type === 'ResultsCard';
const opacityOf = view => {
  const wrap = view.find(node => node.type === 'ReanimatedView' && node.props.style?.[0]?.width === '86%');
  return wrap?.props.style?.[1]?.opacity;
};

test('the results fade starts only after a render that already shows the card', () => {
  const view = shell();
  view.find(node => node.type === 'Pressable').props.onPress(); view.render(); // skip the count: playing
  assert.equal(view.find(isCard), undefined, 'no card while playing');
  const startedWithCard = [];
  const push = view.motions.push.bind(view.motions);
  view.motions.push = (kind) => { if (kind === 'timing') startedWithCard.push(!!view.find(isCard)); return push(kind); };
  view.change({ result: { score: 500, stars: 0 } });
  assert.ok(startedWithCard.length >= 1, 'the card fades in');
  assert.ok(startedWithCard.every(Boolean), 'every results fade starts after the card is in the tree');
  view.render();
  assert.equal(opacityOf(view), 1, 'the card ends fully visible');
  view.unmount();
});

test('leaving results (play again) puts the card back to hidden from the same place', () => {
  const view = shell({ onRematch() {} });
  view.find(node => node.type === 'Pressable').props.onPress(); view.render();
  view.change({ result: { score: 500, stars: 2 } }); view.render();
  assert.equal(opacityOf(view), 1);
  view.change({ result: null });
  assert.equal(view.find(isCard), undefined, 'a fresh countdown, no card');
  view.find(node => node.type === 'Pressable').props.onPress(); view.render();
  view.change({ result: { score: 900, stars: 3 } }); view.render();
  assert.equal(opacityOf(view), 1, 'the second card shows too');
  view.unmount();
});

test('Reduce Motion: the card is fully visible at once, no fade', () => {
  const view = shell({}, true);
  view.find(node => node.type === 'Pressable').props.onPress(); view.render();
  const before = view.motions.filter(k => k === 'timing').length;
  view.change({ result: { score: 100, stars: 0 } }); view.render();
  assert.equal(opacityOf(view), 1);
  assert.equal(view.motions.filter(k => k === 'timing').length, before, 'no fade animation under Reduce Motion');
  view.unmount();
});
