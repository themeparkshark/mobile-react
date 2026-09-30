const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');

const calm = { tutorialActive: false, findOpen: false, findPending: false, firstCatchDone: true, boss: false,
  rideOpen: false, adventureOpen: false, otherModalOpen: false };

test('daily chest comes last: never before the first catch, never alongside a find or another overlay', () => {
  assert.equal(q.chestMayPresent(calm), true);
  for (const key of ['tutorialActive', 'findOpen', 'findPending', 'boss', 'rideOpen', 'adventureOpen', 'otherModalOpen']) {
    assert.equal(q.chestMayPresent({ ...calm, [key]: true }), false, key);
  }
  assert.equal(q.chestMayPresent({ ...calm, firstCatchDone: false }), false);
  assert.equal(q.hasFirstCatch({ completed_tasks_count: 0 }, false, false), false);
  assert.equal(q.hasFirstCatch({ completed_tasks_count: 0 }, false, true), true);
  assert.equal(q.hasFirstCatch({ completed_tasks_count: 3 }, false, false), true, 'veterans are not held back');
  assert.equal(q.hasFirstCatch(null, true, false), true);
});

test('one suggestion per slot: boss > ride > adventure > project', () => {
  const all = { bossMoment: false, queueRide: true, adventure: true, goal: true, project: true };
  assert.deepEqual({ ...q.mapSuggestionSlots(all) }, { left: 'adventure', right: 'ride', lead: 'ride' });
  assert.deepEqual({ ...q.mapSuggestionSlots({ ...all, bossMoment: true }) }, { left: null, right: null, lead: 'boss' });
  assert.deepEqual({ ...q.mapSuggestionSlots({ ...all, queueRide: false }) }, { left: 'adventure', right: 'project', lead: 'adventure' });
  assert.deepEqual({ ...q.mapSuggestionSlots({ ...all, queueRide: false, adventure: false }) }, { left: 'goal', right: 'project', lead: 'goal' });
  assert.deepEqual({ ...q.mapSuggestionSlots({ bossMoment: false, queueRide: false, adventure: false, goal: false, project: true }) },
    { left: null, right: 'project', lead: 'project' });
});

test('avatar falls back to the bundled TPS shark instead of an empty ring', () => {
  const app = runtime('src/components/Avatar.tsx', { '../config': { default: { primary: '#0768b9' } } },
    { player: { avatar_url: null, inventory: null } });
  const image = app.find(n => n.type === 'Image');
  assert.match(String(image.props.source), /pin-collections\/shark\.png/);
});
