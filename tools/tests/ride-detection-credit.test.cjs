const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

// QA playtest, Sep 30: after 33 minutes of Space Mountain LinePlay the ride
// prompt asked "Did you just ride Pixar Short Film Spotlight?". The two 60 m
// zones sit 15 m apart, the walk in passes Pixar first, and detection kept the
// first zone entered until it exited (it never did while the guest stood at
// Space Mountain). The queue card had the same walk-in bias.
const SPACE = { id: 635, name: 'Space Mountain', type: 'attraction', park_id: 8, lat: 33.811548, lng: -117.917056, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };
const PIXAR = { id: 640, name: 'Pixar Short Film Spotlight', type: 'attraction', park_id: 8, lat: 33.811604, lng: -117.917208, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };

function service() {
  const store = new Map();
  const m = loadTs('src/services/RideDetectionService.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => store.get(key) ?? null,
      setItem: async (key, value) => { store.set(key, value); },
      removeItem: async key => { store.delete(key); },
    },
    'expo-location': { Accuracy: { High: 6 } },
    'expo-task-manager': { defineTask() {}, isTaskDefined: () => false },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '../api/endpoints/rides': {},
  });
  const s = m.default, detections = [];
  s.onForegroundDetection = detection => detections.push(detection);
  return { m, s, detections, store };
}

async function withClock(start, run) {
  const realNow = Date.now;
  const clock = { now: start };
  Date.now = () => clock.now;
  try { await run(clock); } finally { Date.now = realNow; }
}

// Walking east from Tomorrowland: past Pixar, then onto the Space Mountain coin.
const WALK_IN = [-117.91775, -117.9176, -117.9175, -117.9174, -117.9173, -117.9172, -117.91715, -117.9171]
  .map(lng => [33.81160, lng]);
// Leaving west past Pixar: out of Space Mountain's zone, still inside Pixar's, then gone.
const WALK_OUT = [[33.81162, -117.91775], [33.81170, -117.91800], [33.81175, -117.91830]];

function walk(s, clock, points, stepMs) {
  for (const [lat, lng] of points) { s.processLocation(lat, lng); clock.now += stepMs; }
}

test('LinePlay for Space Mountain logs Space Mountain, not Pixar next door', async () => {
  const { s, detections } = service();
  s.setRides([SPACE, PIXAR]);
  await withClock(10_000_000, async clock => {
    walk(s, clock, WALK_IN, 5_000);
    s.setLinePlayRide(SPACE.id);
    // Twenty minutes in the switchbacks, half of them on Pixar's side of the queue.
    for (let i = 0; i < 80; i++) {
      s.processLocation(33.81158, i % 2 ? -117.91718 : -117.91708);
      clock.now += 15_000;
    }
    s.setLinePlayRide(null); // "I reached boarding"
    clock.now += 8 * 60_000; // on the ride, no fixes indoors
    walk(s, clock, WALK_OUT, 10_000);
    await s.writeQueue;
  });
  assert.equal(detections.length, 1, 'one prompt for one ride');
  assert.equal(detections[0].rideId, SPACE.id);
  assert.equal(detections[0].rideName, 'Space Mountain');
  assert.ok(detections[0].dwellTimeMs > 25 * 60_000);
});

test('without LinePlay the longest dwell wins, not the first zone entered', async () => {
  const { s, detections } = service();
  s.setRides([SPACE, PIXAR]);
  await withClock(20_000_000, async clock => {
    // Lingering at Pixar's door for a minute on the way in.
    for (let i = 0; i < 12; i++) { s.processLocation(33.81160, -117.91722); clock.now += 5_000; }
    // Twenty minutes standing at Space Mountain, iOS sending a fix now and then.
    for (let i = 0; i < 10; i++) { s.processLocation(33.81155, -117.91705); clock.now += 120_000; }
    walk(s, clock, WALK_OUT, 10_000);
    await s.writeQueue;
  });
  assert.deepEqual(detections.map(d => d.rideId), [SPACE.id]);
});

test('jitter into an overlapping zone cannot steal the credit', async () => {
  const { s, detections } = service();
  s.setRides([SPACE, PIXAR]);
  await withClock(30_000_000, async clock => {
    for (let i = 0; i < 60; i++) {
      // Every third fix lands right on Pixar's point.
      if (i % 3 === 2) s.processLocation(PIXAR.lat, PIXAR.lng);
      else s.processLocation(33.81155, -117.91704);
      clock.now += 20_000;
    }
    walk(s, clock, WALK_OUT, 10_000);
    await s.writeQueue;
  });
  assert.deepEqual(detections.map(d => d.rideName), ['Space Mountain']);
});

test('a LinePlay queue that spills past the ride zone still logs the LinePlay ride', async () => {
  const NEIGHBOR = { id: 900, name: 'Snack Cart Show', type: 'attraction', park_id: 8, lat: 33.8129, lng: -117.917056, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };
  const run = async linePlay => {
    const { s, detections } = service();
    s.setRides([SPACE, NEIGHBOR]);
    await withClock(40_000_000, async clock => {
      if (linePlay) s.setLinePlayRide(SPACE.id);
      // 100 m north of the ride point, 50 m from the neighbor: the far end of the queue.
      for (let i = 0; i < 40; i++) { s.processLocation(33.81245, -117.917056); clock.now += 30_000; }
      if (linePlay) s.setLinePlayRide(null);
      walk(s, clock, [[33.8140, -117.917056], [33.8145, -117.917056]], 10_000);
      await s.writeQueue;
    });
    return detections.map(d => d.rideId);
  };
  assert.deepEqual(await run(true), [SPACE.id]);
  assert.deepEqual(await run(false), [NEIGHBOR.id], 'without LinePlay the zone the guest stood in wins');
});

test('a LinePlay session far from its ride does not rename an unrelated visit', async () => {
  const { s, detections } = service();
  s.setRides([SPACE, PIXAR]);
  await withClock(50_000_000, async clock => {
    s.setLinePlayRide(999); // "Play anytime" for a ride with no coordinates here
    for (let i = 0; i < 10; i++) { s.processLocation(33.81155, -117.91705); clock.now += 60_000; }
    walk(s, clock, WALK_OUT, 10_000);
    await s.writeQueue;
  });
  assert.deepEqual(detections.map(d => d.rideId), [SPACE.id]);
});

test('an ended LinePlay ride stops counting once its visit is logged', async () => {
  const { s, detections, store } = service();
  s.setRides([SPACE, PIXAR]);
  await withClock(60_000_000, async clock => {
    s.setLinePlayRide(SPACE.id);
    for (let i = 0; i < 10; i++) { s.processLocation(33.81155, -117.91705); clock.now += 60_000; }
    s.setLinePlayRide(null);
    walk(s, clock, WALK_OUT, 10_000);
    clock.now += 10 * 60_000;
    // Later, ten minutes standing at Pixar alone.
    for (let i = 0; i < 10; i++) { s.processLocation(33.81161, -117.91724); clock.now += 60_000; }
    s.processLocation(33.8125, -117.9190);
    await s.writeQueue;
  });
  assert.deepEqual(detections.map(d => d.rideName), ['Space Mountain', 'Pixar Short Film Spotlight']);
  assert.equal(store.has('ride_detection_lineplay_ride'), false, 'nothing left for the background task');
});

test('the queue card names the ride the guest stands at, not the walk-in neighbor', () => {
  const { s } = service();
  s.setRides([SPACE, PIXAR]);
  const realNow = Date.now;
  let now = 70_000_000; Date.now = () => now;
  try {
    // Two minutes of walking fixes on Pixar's side of the plaza.
    for (let i = 0; i < 24; i++) { s.processLocation(33.81160, -117.91722 + (i % 2) * 0.00001); now += 5_000; }
    // Standing on the Space Mountain coin: one fix, then nothing while still.
    s.processLocation(SPACE.lat, SPACE.lng);
    now += 90_000;
    assert.equal(s.currentDwell(90_000, now)?.rideId, SPACE.id);
    now += 120_000;
    assert.equal(s.currentDwell(90_000, now)?.rideId, SPACE.id, 'and it stays while the guest stands still');
  } finally { Date.now = realNow; }
});

test('the LinePlay screen tells ride detection which ride is in play', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/lineplay/useLinePlaySession.ts'), 'utf8');
  assert.match(src, /setLinePlayDetectionRide\(linePlayRideId\)/);
  assert.match(src, /return \(\) => setLinePlayDetectionRide\(null\)/);
  const bg = fs.readFileSync(path.join(__dirname, '../../src/services/RideDetectionService.ts'), 'utf8');
  assert.match(bg, /await rideDetectionService\.loadLinePlayFromCache\(\)/);
});

test('catalog entries marked other (Fortune Tellers, play areas) never prompt a ride or a queue card', async () => {
  const { s, detections } = service();
  const FORTUNE = { id: 569, name: 'Fortune Tellers', type: 'other', park_id: 8, lat: 33.811237, lng: -117.919057, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };
  s.setRides([FORTUNE]);
  await withClock(80_000_000, async clock => {
    for (let i = 0; i < 10; i++) { s.processLocation(FORTUNE.lat, FORTUNE.lng); clock.now += 30_000; }
    assert.equal(s.currentDwell(90_000, clock.now), null);
    s.processLocation(33.8135, -117.9190);
    await s.writeQueue;
  });
  assert.equal(detections.length, 0);
});
