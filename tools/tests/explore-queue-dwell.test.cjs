const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

function service() {
  const noop = async () => undefined;
  return loadTs('src/services/RideDetectionService.ts', {
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: noop, removeItem: noop },
    'expo-location': { Accuracy: { High: 6 } },
    'expo-task-manager': { defineTask() {}, isTaskDefined: () => false },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '../api/endpoints/rides': {},
  });
}

test('a 90 s dwell at one attraction suggests "In line here? Play"; shows and short stops do not', () => {
  const m = service(), s = m.default;
  s.setRides([
    { id: 1, name: 'Space Ride', type: 'dark_ride', park_id: 1, lat: 34.1381, lng: -118.3534, radius: 40 },
    { id: 2, name: 'Stunt Show', type: 'show', park_id: 1, lat: 34.1500, lng: -118.3534, radius: 40 },
  ]);
  const realNow = Date.now;
  let now = 1_000_000; Date.now = () => now;
  try {
    s.processLocation(34.1381, -118.3534);
    now += 60_000; s.processLocation(34.13811, -118.35341);
    assert.equal(s.currentDwell(90_000, now), null, 'one minute is not a line yet');
    now += 40_000; s.processLocation(34.13812, -118.3534);
    assert.equal(s.currentDwell(90_000, now).rideName, 'Space Ride');
    now += 1000; s.processLocation(34.1500, -118.3534); // walked away: zone exit
    now += 200_000; s.processLocation(34.15001, -118.3534);
    assert.equal(s.currentDwell(90_000, now), null, 'a show is not a queue to play in');
  } finally { Date.now = realNow; }
  assert.equal(m.DWELL_SUGGESTION_MS, 90_000);
});

test('the dwell takes the left slot ahead of the adventure and goal', () => {
  const q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  assert.equal(q.mapSuggestionSlots({ bossMoment: false, queueRide: false, dwell: true, adventure: true, goal: true, project: true }).left, 'dwell');
  assert.equal(q.mapSuggestionSlots({ bossMoment: true, queueRide: false, dwell: true, adventure: true, goal: true, project: true }).left, null);
});

test('DwellCard plays or dismisses, with haptics and a reduced-motion path', () => {
  const calls = [];
  const load = reduced => runtime('src/screens/ExploreScreen/DwellCard.tsx', {
    '../../gamekit/Haptics': { haptic: name => calls.push(name) },
    '../../hooks/useReducedGameMotion': { default: () => reduced },
    '../../ui': { BRAND: new Proxy({}, { get: () => '#fff' }), GameIcon: 'GameIcon', SHADOW: { card: {} } },
  }, { rideName: 'Space Ride', top: 64, onPlay: () => calls.push('play'), onDismiss: () => calls.push('dismiss') });
  const app = load(false);
  assert.ok(app.motions.includes('spring'));
  app.find(n => n.props?.accessibilityLabel === 'In line at Space Ride? Play queue games').props.onPress();
  app.find(n => n.props?.accessibilityLabel === 'Not now').props.onPress();
  assert.deepEqual(calls, ['tickSelection', 'tapLight', 'play', 'dismiss']);
  const still = load(true);
  assert.deepEqual(still.motions, []);
});
