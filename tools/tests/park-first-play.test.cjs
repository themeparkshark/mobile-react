const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const moduleRef = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/Tutorial/steps.ts','utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: moduleRef, exports: moduleRef.exports });
const steps = moduleRef.exports;
function guide(preview = false, xp) {
  const writes = [], removals = [];
  const auth = { value: { player: { id: 5, total_experience: xp ?? (preview ? 200 : 0) } } };
  const app = runtime('src/components/Tutorial/TutorialProvider.tsx', {
    './steps': steps,
    './tutorialLayout': require('./helpers/ts-module.cjs').loadTs('src/components/Tutorial/tutorialLayout.ts'),
    './TeacherShark': { default: 'Finn' }, './SpotlightOverlay': { default: 'Spotlight' },
    '../../games/memory/MemoryGame': { default: 'Memory' },
    '../../context/AuthProvider': { AuthContext: auth },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async () => null, setItem: async (...args) => writes.push(args), removeItem: async key => removals.push(key),
    } },
  }, { children: 'Player map' }, preview ? { __DEV__: true, process: { env: { EXPO_PUBLIC_PARK_FIRST_PLAY_PREVIEW: '1' } } } : {});
  return { app, auth, writes, removals, state: () => app.tree.props.value,
    finn: () => app.find(n => n.type === 'Finn'), game: () => app.find(n => n.type === 'Memory') };
}
test('park guide opens a four-pair warm-up once, then hands off to the original coin shelves', async () => {
  const c = guide(); await c.app.settle(); c.state().startTutorial('onboarding', { inPark: true }); c.app.render();
  assert.equal(c.state().totalSteps, 2); assert.equal(c.state().currentStep.activity, 'memory_warmup');
  assert.equal(c.app.find(n => n.type === 'Spotlight').props.onPress, undefined);
  c.finn().props.onNext(); c.finn().props.onNext(); c.app.render();
  assert.equal(c.game().props.difficulty, 0); assert.equal(c.game().props.deckId, 'park'); assert.equal(c.finn(), undefined);
  const complete = c.game().props.onComplete; complete(2); complete(2); c.app.render();
  assert.equal(c.state().currentIndex, 1); assert.equal(c.game(), undefined);
  assert.match(c.finn().props.subtitle, /Profile.*scroll to your parks/i); assert.equal(c.writes.length, 0);
  c.finn().props.onNext(); c.app.render();
  assert.equal(c.state().isActive, false); assert.equal(c.state().hasCompleted('park_arrival'), true);
  assert.equal(c.writes.length, 1);
});
test('quit or loss returns to the playable welcome without claiming completion; late game callbacks are ignored', async () => {
  const c = guide(); await c.app.settle(); c.state().startTutorial('onboarding', { inPark: true }); c.app.render();
  c.finn().props.onNext(); c.app.render(); const done = c.game().props.onComplete;
  c.game().props.onClose(); c.app.render(); done(2); c.app.render();
  assert.equal(c.state().currentIndex, 0); assert.ok(c.finn()); assert.equal(c.writes.length, 0);
  c.finn().props.onNext(); c.app.render();
  done(2); c.app.render(); assert.equal(c.state().currentIndex, 0); assert.ok(c.game());
  const late = c.game().props.onComplete;
  c.app.unmount(); late(2); assert.equal(c.writes.length, 0);
});
test('home onboarding keeps its immediate real find; arrival uses the warm-up without resource lectures', () => {
  const home = steps.getStepsForSequence('onboarding'); assert.equal(home.length, 1); assert.equal(home[0].activity, undefined);
  const park = steps.getStepsForSequence('park_arrival'); assert.equal(park.length, 2); assert.equal(park[0].activity, 'memory_warmup');
  assert.ok(park.every(step => !/Energy|Ride Parts|Rescue Pass/.test(step.text+' '+step.subtitle)));
});
test('native first-player preview never overwrites the existing player’s tutorial progress', async () => {
  const c = guide(true); await c.app.settle(); assert.equal(c.state().isActive, false);
  c.state().startTutorial('onboarding', { inPark: true }); c.app.render(); assert.equal(c.state().isActive, true);
  c.state().skipTutorial(); c.app.render(); await c.state().resetAll(); c.app.render();
  assert.equal(c.writes.length, 0); assert.equal(c.removals.length, 0);
});

test('guide transitions cancel on skip, game opening, and unmount', async () => {
  const c = guide(); await c.app.settle(); c.state().startTutorial('onboarding', { inPark: true }); c.app.render();
  assert.equal(c.app.timers.size, 1);
  c.finn().props.onNext(); c.app.render(); assert.equal(c.app.timers.size, 0);
  c.game().props.onClose(); c.app.render(); assert.equal(c.app.timers.size, 1);
  c.state().skipTutorial(); c.app.render(); assert.equal(c.app.timers.size, 0);
  await c.state().resetAll(); c.app.render(); c.state().startTutorial('park_arrival'); c.app.render();
  assert.equal(c.app.timers.size, 1); c.app.unmount(); assert.equal(c.app.timers.size, 0);
});

test('Replay Tutorials works for an existing player: a deliberate reset is not auto-completed again', async () => {
  const c = guide(false, 900); await c.app.settle(); c.app.render();
  assert.equal(c.state().hasCompleted('friends'), true, 'a reinstall on an existing account skips the guides');
  await c.state().resetAll(); c.app.render(); await c.app.settle();
  // Leaving Settings refreshes the player, which re-runs the provider's effects.
  c.auth.value = { player: { ...c.auth.value.player } }; c.app.render(); await c.app.settle();
  assert.equal(c.state().hasCompleted('friends'), false);
  c.state().startTutorial('friends'); c.app.render();
  assert.equal(c.state().isActive, true, 'the friends guide plays again after Replay Tutorials');
});
