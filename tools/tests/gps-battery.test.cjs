const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
// Run with: node --test tools/tests/gps-battery.test.cjs
// Battery pass: the GPS works only as hard as what is on screen needs.

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const gps = loadTs('src/context/gpsWatchPolicy.ts');
const parkPolicy = loadTs('src/context/parkLookupPolicy.ts');

const base = { mapOnScreen: false, queueTracking: false, inPark: false, confirmedOutside: false };

test('a map or a queue gets full precision; elsewhere in a park coarser steps; away from parks neighbourhood accuracy', () => {
  assert.equal(gps.gpsWatchTier({ ...base, mapOnScreen: true, inPark: true }), 'map');
  assert.equal(gps.gpsWatchTier({ ...base, mapOnScreen: true, confirmedOutside: true }), 'map', 'the home map keeps 50 m pickups exact');
  assert.equal(gps.gpsWatchTier({ ...base, queueTracking: true, inPark: true }), 'map', 'LinePlay advances need fixes under 20 m');
  assert.equal(gps.gpsWatchTier({ ...base, inPark: true }), 'park', 'ride detection still reads the stream');
  assert.equal(gps.gpsWatchTier(base), 'park', 'unknown presence never drops precision');
  assert.equal(gps.gpsWatchTier({ ...base, confirmedOutside: true }), 'away');
  assert.equal(gps.gpsWatchTier({ ...base, confirmedOutside: true, inPark: true }), 'park');

  const map = gps.gpsWatchSettings({ ...base, mapOnScreen: true });
  assert.deepEqual({ ...map }, { tier: 'map', accuracy: 'high', distanceInterval: 3, timeInterval: 500 }, 'unchanged on the map');
  const park = gps.gpsWatchSettings({ ...base, inPark: true });
  assert.equal(park.accuracy, 'high');
  assert.equal(park.distanceInterval, 10, 'the step background ride detection uses');
  const away = gps.gpsWatchSettings({ ...base, confirmedOutside: true });
  assert.equal(away.accuracy, 'balanced');
  assert.ok(away.distanceInterval < 80, 'still steps often enough to check in at a park gate');
  assert.equal(gps.gpsWatchSettings({ ...base, queueTracking: true, mapOnScreen: true }).timeInterval, 3000);
});

function mountProvider() {
  const watchers = [];
  const Location = {
    Accuracy: { Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
    getForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    watchHeadingAsync: async () => ({ remove() {} }),
    watchPositionAsync: async (options, onLocation, onError) => {
      const sub = { options, onLocation, onError, removed: false, remove() { this.removed = true; } };
      watchers.push(sub);
      return sub;
    },
    getCurrentPositionAsync: async () => ({ coords: { latitude: 1, longitude: 2 } }),
  };
  let answer = null;
  const app = runtime('src/context/LocationProvider.tsx', {
    'expo-location': Location,
    'react-native': {
      Platform: { OS: 'ios' }, Linking: { openURL: async () => undefined },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    },
    rooks: { useAsyncEffect: () => undefined, useDebounce: fn => fn, useIntervalWhen: () => undefined },
    '../api/endpoints/me/current-park': { default: async () => answer },
    './AuthProvider': { AuthContext: { value: { player: { id: 16, username: 'thedoc' }, refreshPlayer: async () => undefined } } },
    '../helpers/dev-location-store': { setDevModeEnabled() {}, setDevLocation() {} },
    './parkLookupPolicy': parkPolicy,
  }, { children: 'map' }, {
    setInterval: () => 0, clearInterval() {},
    console: { ...console, warn() {}, error() {} },
  }, { exportName: 'LocationProvider' });
  const settle = async () => { for (let i = 0; i < 4; i++) { app.render(); await app.settle(); } };
  const live = () => watchers.filter(w => !w.removed);
  const heading = () => app.tree.props.children.props.children.props.value;
  return { app, settle, live, heading, Location, setAnswer: value => { answer = value; },
    value: () => app.tree.props.value, fix: (lat, lng) => live().at(-1).onLocation({ coords: { latitude: lat, longitude: lng, accuracy: 8, speed: 1 }, timestamp: Date.now() }) };
}

test('the watcher steps 3 m on a map, 10 m elsewhere in a park, and drops to Balanced away from parks', async () => {
  const h = mountProvider();
  await h.value().requestPermission(); await h.settle();
  assert.equal(h.live().length, 1);
  assert.equal(h.live()[0].options.distanceInterval, 10, 'no map yet and park unknown: full accuracy, 10 m steps');
  assert.equal(h.live()[0].options.accuracy, h.Location.Accuracy.High);

  h.heading().setHeadingEnabled(true); await h.settle();
  assert.equal(h.live().length, 1, 'the old watcher is released when the settings change');
  assert.equal(h.live()[0].options.distanceInterval, 3);
  assert.equal(h.live()[0].options.accuracy, h.Location.Accuracy.High);

  // Home, verified outside every park.
  h.setAnswer(null);
  h.fix(40.0, -100.0); await h.settle();
  assert.equal(h.value().parkLookupRecord?.outcome, 'outside');
  assert.equal(h.live()[0].options.distanceInterval, 3, 'the home map keeps full precision');
  h.heading().setHeadingEnabled(false); await h.settle();
  assert.equal(h.live()[0].options.accuracy, h.Location.Accuracy.Balanced, 'reading news at home: neighbourhood accuracy');
  assert.equal(h.live()[0].options.distanceInterval, 50);

  // LinePlay always gets full precision.
  h.value().setAccuracyMode('queue'); await h.settle();
  assert.equal(h.live()[0].options.accuracy, h.Location.Accuracy.High);
  assert.equal(h.live()[0].options.distanceInterval, 3);
  h.value().setAccuracyMode('navigation'); await h.settle();
  assert.equal(h.live().length, 1, 'never two watchers at once');
});

function heartbeatHarness() {
  const file = 'src/services/lineplay/backgroundQueueHeartbeat.ts';
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const values = new Map([['player', JSON.stringify({ id: 12 })]]);
  const calls = { posts: 0, reads: 0, startOptions: null };
  let started = false, task;
  const storage = {
    getItem: async key => { calls.reads++; return values.get(key) ?? null; },
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  const location = {
    Accuracy: { High: 4 },
    getBackgroundPermissionsAsync: async () => ({ granted: true }),
    hasStartedLocationUpdatesAsync: async () => started,
    startLocationUpdatesAsync: async (_, options) => { started = true; calls.startOptions = options; },
    stopLocationUpdatesAsync: async () => { started = false; },
  };
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef, exports: moduleRef.exports, Date, console,
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: storage };
      if (name === 'expo-location') return location;
      if (name === 'expo-secure-store') return { getItemAsync: async () => 'token' };
      if (name === 'expo-task-manager') return { defineTask: (_, callback) => { task = callback; } };
      if (name === '../../api/client') return { default: { post: async () => { calls.posts++; return { data: { status: 'active' } }; } } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return { ...moduleRef.exports, calls, sample: () => task({ data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 2 } }] } }) };
}

test('LinePlay background fixes arrive in batches and rapid fixes never touch storage', async () => {
  const h = heartbeatHarness();
  assert.equal(await h.activateQueueBackgroundHeartbeat('s-1', 12), true);
  assert.equal(h.calls.startOptions.distanceInterval, 0, 'a guest standing in line still gets fixes');
  assert.equal(h.calls.startOptions.accuracy, 4);
  assert.ok(h.calls.startOptions.deferredUpdatesInterval >= 20_000, 'iOS batches background fixes for at least the send gap');
  assert.ok(h.calls.startOptions.deferredUpdatesInterval <= 30_000, 'and never past the foreground heartbeat cadence');
  await h.sample();
  assert.equal(h.calls.posts, 1);
  const readsAfterFirst = h.calls.reads;
  for (let i = 0; i < 30; i++) await h.sample(); // 30 s of 1 Hz foreground fixes
  assert.equal(h.calls.posts, 1, 'still one heartbeat inside the send gap');
  assert.equal(h.calls.reads, readsAfterFirst, 'no AsyncStorage read per fix');
  await h.activateQueueBackgroundHeartbeat('s-2', 12);
  await h.sample();
  assert.equal(h.calls.posts, 2, 'a new session sends at once');
});

test('ride detection skips its background stream while the foreground feeds it', () => {
  const src = read('src/services/RideDetectionService.ts');
  assert.match(src, /if \(AppState\.currentState === 'active' && rideDetectionService\.onForegroundDetection\) return;\s*\n\s*\/\/ BUG 3 fix/);
});
