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
  assert.deepEqual({ ...q.mapSuggestionSlots(all) }, { left: 'adventure', right: 'ride', lead: 'ride', leftStub: true, rightStub: false });
  assert.deepEqual({ ...q.mapSuggestionSlots({ ...all, bossMoment: true }) }, { left: null, right: null, lead: 'boss', leftStub: false, rightStub: false });
  assert.deepEqual({ ...q.mapSuggestionSlots({ ...all, queueRide: false }) }, { left: 'adventure', right: 'project', lead: 'adventure', leftStub: false, rightStub: true });
  assert.deepEqual({ ...q.mapSuggestionSlots({ ...all, queueRide: false, adventure: false }) }, { left: 'goal', right: 'project', lead: 'goal', leftStub: false, rightStub: true });
  assert.deepEqual({ ...q.mapSuggestionSlots({ bossMoment: false, queueRide: false, adventure: false, goal: false, project: true }) },
    { left: null, right: 'project', lead: 'project', leftStub: false, rightStub: false });
});

test('avatar falls back to the bundled TPS shark instead of an empty ring', () => {
  const app = runtime('src/components/Avatar.tsx', { '../config': { default: { primary: '#0768b9' } },
    '../context/AuthProvider': { AuthContext: { value: { player: null } } },
    '../helpers/wardrobe': loadTs('src/helpers/wardrobe.ts') },
    { player: { avatar_url: null, inventory: null } });
  const image = app.find(n => n.type === 'Image');
  assert.match(String(image.props.source), /pin-collections\/shark\.png/);
});

test('only the lead suggestion is full size; the other slot shows its stub', () => {
  const all = { bossMoment: false, queueRide: true, adventure: true, goal: true, project: true };
  const pick = s => ({ left: s.left, right: s.right, lead: s.lead, leftStub: s.leftStub, rightStub: s.rightStub });
  assert.deepEqual(pick(q.mapSuggestionSlots(all)), { left: 'adventure', right: 'ride', lead: 'ride', leftStub: true, rightStub: false });
  assert.deepEqual(pick(q.mapSuggestionSlots({ ...all, queueRide: false })),
    { left: 'adventure', right: 'project', lead: 'adventure', leftStub: false, rightStub: true });
  assert.deepEqual(pick(q.mapSuggestionSlots({ ...all, adventureSlam: true })),
    { left: 'adventure', right: 'ride', lead: 'adventure', leftStub: false, rightStub: true }, 'a stamp slam leads until it lands');
  assert.deepEqual(pick(q.mapSuggestionSlots({ ...all, bossMoment: true })),
    { left: null, right: null, lead: 'boss', leftStub: false, rightStub: false });
  for (const state of [all, { ...all, queueRide: false }, { ...all, adventure: false, goal: false }, { ...all, dwell: true }]) {
    const s = q.mapSuggestionSlots(state);
    const full = [s.left && !s.leftStub, s.right && !s.rightStub].filter(Boolean);
    assert.equal(full.length, 1, JSON.stringify(state));
  }
});

test('the map stub is 56pt, springs in from its side, and holds still with reduced motion', () => {
  const calls = [];
  const load = reduced => runtime('src/screens/ExploreScreen/MapSuggestionStub.tsx', {
    '../../gamekit/Haptics': { haptic: name => calls.push(name) },
    '../../hooks/useReducedGameMotion': { default: () => reduced },
    '../../ui': { BRAND: new Proxy({}, { get: () => '#fff' }), SHADOW: { card: {} } },
  }, { side: 'right', top: 124, label: 'Park story', badge: '0/100', onPress: () => calls.push('open'), children: null });
  const app = load(false);
  assert.ok(app.motions.includes('spring'));
  app.find(n => n.props?.accessibilityLabel === 'Park story').props.onPress();
  assert.deepEqual(calls, ['tapLight', 'open']);
  assert.deepEqual(load(true).motions, []);
});
