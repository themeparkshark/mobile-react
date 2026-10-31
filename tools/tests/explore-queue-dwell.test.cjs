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

test('DwellCard plays or dismisses, with haptics and a reduced-motion path', async () => {
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
  await app.settle();
  assert.deepEqual(calls, ['tickSelection', 'tapLight', 'dismiss', 'play']);
  const still = load(true);
  assert.deepEqual(still.motions, []);
});

test('a malformed rides payload leaves detection empty instead of crashing the map', () => {
  const s = service().default;
  assert.doesNotThrow(() => s.setRides(undefined));
  assert.equal(s.currentDwell(90_000, Date.now()), null);
});

test('home prep items only accept an array from the cache or the server', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen/HomeExplore.tsx'), 'utf8');
  const sets = src.match(/setPrepItems\(([^)]*\))?[^;]*\);/g) ?? [];
  const loads = sets.filter(line => /data/.test(line));
  assert.ok(loads.length >= 2);
  for (const line of loads) assert.match(line, /Array\.isArray/);
});

test('DwellCard Play that cannot load says so instead of failing silently', async () => {
  const calls = [];
  const app = runtime('src/screens/ExploreScreen/DwellCard.tsx', {
    '../../gamekit/Haptics': { haptic: name => calls.push(name) },
    '../../hooks/useReducedGameMotion': { default: () => true },
    '../../ui': { BRAND: new Proxy({}, { get: () => '#fff' }), GameIcon: 'GameIcon', SHADOW: { card: {} } },
  }, { rideName: 'Space Ride', top: 64, onPlay: async () => { throw new Error('no ride'); }, onDismiss: () => undefined });
  app.find(n => n.props?.accessibilityLabel === 'In line at Space Ride? Play queue games').props.onPress();
  await app.settle(); await app.settle();
  assert.ok(calls.includes('warning'));
  assert.ok(app.find(n => n.props?.children === 'Could not open this line. Tap to try again.'), 'the chip shows a readable reason');
});

test('the dwell and Adventure Ticket Play resolve by ride id, then name, then the template story, and never throw', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  // The in-line card folded into the guide's in-line state (core loop 4.1): its LINEPLAY resolves the dwell ride.
  const block = src.slice(src.indexOf('const openLinePlayFor = useCallback('), src.indexOf('const onGuideAction = useCallback('));
  assert.match(block, /resolveQueueStoryContext\(park\.id, queueDwell\.rideId, queueDwell\.rideName\)/);
  assert.doesNotMatch(block, /throw new Error/);
  const ticket = src.slice(src.indexOf('<AdventureTicketCard'), src.indexOf('onShelf={() => {', src.indexOf('<AdventureTicketCard')));
  assert.match(ticket, /resolveQueueStoryContext\(adventure\.park_id, adventure\.ride\.ride_id,/);
  assert.doesNotMatch(ticket, /throw new Error/);
});

test('dwell queue types match the server Adventure Ticket ride types', () => {
  const { QUEUE_RIDE_TYPES } = require('./helpers/ts-module.cjs').loadTs('src/constants/queueRideTypes.ts');
  // Mirrors backend config/adventure.php ADVENTURE_TICKET_RIDE_TYPES default.
  assert.deepEqual([...QUEUE_RIDE_TYPES], ['attraction', 'coaster', 'dark_ride', 'flat_ride', 'water_ride']);
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/RideDetectionService.ts'), 'utf8');
  assert.match(src, /QUEUE_TYPES = new Set<string>\(QUEUE_RIDE_TYPES\)/);
  assert.match(src, /overlapping attractions\nconst AMBIGUOUS_DISTANCE_MARGIN/);
});

test('core loop 4.1: "In line?" needs the player nearly still for 90 s, and never asks about a wait that just ended', () => {
  const D = loadTs('src/screens/ExploreScreen/useQueueDwell.ts', { react: {}, '../../services/RideDetectionService': {} });
  const at = (s, m) => ({ at: s * 1000, latitude: 33.81 + m / 111320, longitude: -117.919 });
  const shuffling = [at(0, 0), at(30, 8), at(60, 15), at(90, 22)];
  assert.equal(D.nearlyStill(shuffling, 90_000), true, 'a line shuffles a few meters');
  const walking = [at(0, 0), at(30, 40), at(60, 80), at(90, 120)];
  assert.equal(D.nearlyStill(walking, 90_000), false, 'a walker passing the ride is not in line');
  assert.equal(D.nearlyStill([], 90_000), true, 'no fixes while standing still (iOS) is still');
  const dwell = { rideId: 80, rideName: 'Jungle Cruise', parkId: 8 };
  assert.equal(D.dwellShows(dwell, { still: true, endedRideId: null, endedAt: null, now: 0 }), true);
  assert.equal(D.dwellShows(dwell, { still: false, endedRideId: null, endedAt: null, now: 0 }), false);
  assert.equal(D.dwellShows(dwell, { still: true, endedRideId: 80, endedAt: 0, now: D.WAIT_ENDED_QUIET_MS - 1 }), false, 'the wait just ended');
  assert.equal(D.dwellShows(dwell, { still: true, endedRideId: 80, endedAt: 0, now: D.WAIT_ENDED_QUIET_MS }), true);
  assert.equal(D.dwellShows(dwell, { still: true, endedRideId: 81, endedAt: 0, now: 1 }), true, 'another ride\'s line still asks');
});
