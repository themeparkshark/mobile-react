const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const ride = (id, owned = false) => ({ task_id: id, asset_id: id + 10, park_id: 1,
  park_name: 'Universal Studios Hollywood', ride_name: `Ride ${id}`, coin_url: '', coin_owned: owned, coin_level: owned ? 1 : null });
const data = (goal = null, parts = 0) => ({ rides: [ride(1), ride(2)], goal,
  goal_unavailable: false, wallet: { tickets: 7, energy: 185, tickets_needed: 0 },
  goal_plan: goal ? { current_level: 1, next_level: 2, parts_needed: parts,
    energy_needed: 0, maxed: false } : null });
function planner() {
  const reads = [], writes = [], navigations = [];
  const app = runtime('src/screens/ExploreScreen/TripGoalCard.tsx', {
    '../../design-system': { colors: {}, spacing: { sm: 4, md: 8, lg: 16 } },
    '../../context/LocationProvider': { LocationContext: { value: { location: null } } },
    '../../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound() {} } } },
    '../../helpers/hapticPatterns': { default: { selection() {} } },
    '../../hooks/useReducedGameMotion': { default: () => true },
    '../../RootNavigation': { navigate: (...args) => navigations.push(args) },
    'react-native-modal': { default: 'GoalModal' },
  }, { refreshVersion: 0, loadGoal: () => {
    const request = deferred(); reads.push(request); return request.promise;
  }, saveGoal: id => {
    const request = deferred(); writes.push({ id, ...request }); return request.promise;
  }, loadCollections: async () => [] });
  const button = label => app.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label);
  const open = () => { app.find(node => node.type === 'Pressable' && node.props.accessibilityLabel?.startsWith('Choose your next')).props.onPress(); app.render(); };
  const choose = id => button(`Ride ${id}. Uncollected coin. Choose as park goal.`);
  return { app, reads, writes, navigations, open, choose, button,
    modal: () => app.find(node => node.type === 'GoalModal') };
}

test('a delayed map refresh cannot overwrite a saved goal, and rapid choices submit once', async () => {
  const p = planner(); p.reads[0].resolve(data()); await p.app.settle();
  p.app.change({ refreshVersion: 1 }); // Request remains in flight when the player chooses.
  p.open();
  assert.equal(p.reads.length, 2, 'opening the planner does not trigger another goal refresh');
  const first = p.choose(1), second = p.choose(2);
  first.props.onPress(); second.props.onPress(); p.app.render();
  assert.equal(p.writes.length, 1); assert.equal(p.writes[0].id, 1);
  assert.equal(p.choose(2).props.disabled, true);
  p.writes[0].resolve(data(ride(1))); await p.app.settle();
  p.reads[1].resolve(data()); await p.app.settle();
  assert.ok(p.button('Next park goal: Ride 1. Open ride choices.'));
});

test('failed save retries the same ride instead of silently refreshing away the choice', async () => {
  const p = planner(); p.reads[0].resolve(data()); await p.app.settle(); p.open();
  p.choose(2).props.onPress(); p.app.render();
  p.writes[0].reject(new Error('offline')); await p.app.settle();
  const retry = p.button('Could not save this ride goal. Try again. Retry');
  assert.ok(retry); retry.props.onPress(); retry.props.onPress(); p.app.render();
  assert.equal(p.writes.length, 2); assert.equal(p.writes[1].id, 2);
  assert.equal(p.reads.length, 1);
  p.writes[1].resolve(data(ride(2))); await p.app.settle();
  assert.equal(p.modal().props.isVisible, false);
  assert.ok(p.button('Next park goal: Ride 2. Open ride choices.'));
});

test('upgrade navigation waits for the single native planner to finish closing', async () => {
  const p = planner(); p.reads[0].resolve(data(ride(1, true))); await p.app.settle();
  p.button('Next park goal: Ride 1. Open ride choices.').props.onPress(); p.app.render();
  assert.equal(p.modal().props.animationInTiming, 0, 'reduced motion receives a still presentation');
  const upgrade = p.app.find(node => node.type === 'Pressable' && node.props.onPress &&
    node.props.style?.backgroundColor === '#fff9e4');
  upgrade.props.onPress(); upgrade.props.onPress(); p.app.render();
  assert.equal(p.modal().props.isVisible, false); assert.equal(p.navigations.length, 0);
  p.modal().props.onModalHide(); p.modal().props.onModalHide();
  assert.equal(p.navigations.length, 1); assert.equal(p.navigations[0][0], 'CoinShelf');
  assert.equal(p.navigations[0][1].focusCoin.assetId, 11);
});

test('refresh arriving during a save waits for its completion; unmounted navigation is discarded', async () => {
  const p = planner(); p.reads[0].resolve(data()); await p.app.settle(); p.open();
  p.choose(1).props.onPress(); p.app.change({ refreshVersion: 1 });
  assert.equal(p.reads.length, 1);
  p.writes[0].resolve(data(ride(1, true))); await p.app.settle();
  assert.equal(p.reads.length, 2, 'deferred refresh resumes after mutation');
  p.reads[1].resolve(data(ride(1, true))); await p.app.settle();
  p.button('Next park goal: Ride 1. Open ride choices.').props.onPress(); p.app.render();
  p.app.find(node => node.type === 'Pressable' && node.props.style?.backgroundColor === '#fff9e4').props.onPress();
  p.app.render(); const modal = p.modal(); p.app.unmount(); modal.props.onModalHide();
  assert.equal(p.navigations.length, 0);
});
