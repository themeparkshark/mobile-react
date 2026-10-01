const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { loadTs } = require('./helpers/ts-module.cjs');

// Jenn at Disneyland: "I'm trying to open the buzz one in line but so far no
// luck". Buzz Lightyear Astro Blasters (ride 573) is 28 m from Star Tours and
// 37 m from Astro Orbitor, all with 60 m zones. The dwell card followed the
// first zone she walked through and needed a fix in the last 60 s, which iOS
// does not send while a guest stands still in an indoor queue. Her phone also
// kept heartbeating an abandoned Autopia session every 20 s for hours.
const BUZZ = { id: 573, name: 'Buzz Lightyear Astro Blasters', type: 'attraction', park_id: 8, lat: 33.812204, lng: -117.917806, radius: 60 };
const STAR_TOURS = { id: 634, name: 'Star Tours - The Adventures Continue', type: 'attraction', park_id: 8, lat: 33.8119970, lng: -117.9179780, radius: 60 };
const ORBITOR = { id: 572, name: 'Astro Orbitor', type: 'attraction', park_id: 8, lat: 33.8121084, lng: -117.9181900, radius: 60 };

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

test('the Buzz queue offers Buzz even after walking past Star Tours, and survives a still, fix-less wait', () => {
  const m = service(), s = m.default;
  s.setRides([BUZZ, STAR_TOURS, ORBITOR]);
  const realNow = Date.now;
  let now = 5_000_000; Date.now = () => now;
  try {
    // Walking in past the Star Tours entrance for two minutes.
    for (let i = 0; i < 8; i++) { s.processLocation(33.81198 + i * 0.000001, -117.91796); now += 15_000; }
    // Into the Buzz queue, shuffling forward a few metres at a time.
    for (let i = 0; i < 10; i++) { s.processLocation(33.81224 + (i % 2) * 0.00002, -117.91776); now += 12_000; }
    const dwell = s.currentDwell(90_000, now);
    assert.equal(dwell?.rideId, 573, 'the card names Buzz Lightyear Astro Blasters');
    // Standing still indoors: no fixes for three minutes.
    now += 180_000;
    assert.equal(s.currentDwell(90_000, now)?.rideId, 573, 'the card stays while iOS sends nothing');
    // Long gone without a fix: no stale card.
    now += m.QUEUE_DWELL_STALE_MS;
    assert.equal(s.currentDwell(90_000, now), null);
  } finally { Date.now = realNow; }
});

test('GPS jitter between overlapping zones does not reset the line timer', () => {
  const s = service().default;
  s.setRides([BUZZ, STAR_TOURS]);
  const realNow = Date.now;
  let now = 9_000_000; Date.now = () => now;
  try {
    for (let i = 0; i < 12; i++) {
      // Mostly at Buzz, every third fix drifts toward Star Tours.
      s.processLocation(i % 3 === 2 ? 33.81205 : 33.81224, i % 3 === 2 ? -117.91794 : -117.91776);
      now += 10_000;
    }
    assert.equal(s.currentDwell(90_000, now)?.rideId, 573);
  } finally { Date.now = realNow; }
});

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/backgroundQueueHeartbeat.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

test('an abandoned queue session stops background heartbeats after 20 minutes away', async () => {
  const values = new Map([['player', JSON.stringify({ id: 16 })]]);
  let started = false, stops = 0, posts = 0, now = 1_000_000;
  const FakeDate = class extends Date { static now() { return now; } };
  let task;
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef, exports: moduleRef.exports, Date: FakeDate, console,
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: {
        getItem: async key => values.get(key) ?? null,
        setItem: async (key, value) => { values.set(key, value); },
        removeItem: async key => { values.delete(key); },
      } };
      if (name === 'expo-location') return {
        Accuracy: { High: 4 },
        getBackgroundPermissionsAsync: async () => ({ granted: true }),
        hasStartedLocationUpdatesAsync: async () => started,
        startLocationUpdatesAsync: async () => { started = true; },
        stopLocationUpdatesAsync: async () => { started = false; stops++; },
      };
      if (name === 'expo-secure-store') return { getItemAsync: async () => 'test-token' };
      if (name === 'expo-task-manager') return { defineTask: (_, callback) => { task = callback; } };
      if (name === '../../api/client') return { default: { post: async () => {
        posts++;
        throw { response: { status: 422, data: { code: 'NOT_NEAR_RIDE' } } };
      } } };
      if (name === './checkpointCredit') return require('./helpers/lineplay-checkpoint-credit.cjs');
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  const { activateQueueBackgroundHeartbeat, MAX_AWAY_MS } = moduleRef.exports;
  assert.equal(await activateQueueBackgroundHeartbeat('autopia-session', 16), true);
  const sample = () => task({ data: { locations: [{ timestamp: now, coords: { latitude: 33.8122, longitude: -117.9178 } }] } });
  await sample();
  assert.equal(posts, 1);
  now += MAX_AWAY_MS / 2; await sample();
  assert.equal(started, true, 'ten minutes away keeps trying (a long switchback can read far)');
  now += MAX_AWAY_MS / 2; await sample();
  assert.equal(started, false, 'twenty minutes away ends the background task');
  assert.equal(values.has('lineplay_active_background_session_v1'), false);
  now += 60_000; await sample();
  assert.equal(posts, 3, 'no further heartbeats');
});
