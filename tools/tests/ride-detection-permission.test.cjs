const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/RideDetectionService.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function makeHarness({ backgroundGranted = false, deferredPermissionCheck = false } = {}) {
  const calls = { backgroundRequests: 0, backgroundStarts: 0, backgroundStops: 0,
    watcherStarts: 0 };
  let releasePermissionCheck;
  let now = 1_000_000;
  const storage = new Map();
  let failNextRead = false;
  class TestDate extends Date { static now() { return now; } }
  const permissionGate = deferredPermissionCheck && new Promise(resolve => {
    releasePermissionCheck = resolve;
  });
  const location = {
    Accuracy: { High: 6 },
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestBackgroundPermissionsAsync: async () => {
      calls.backgroundRequests++;
      return { granted: backgroundGranted };
    },
    getBackgroundPermissionsAsync: async () => {
      if (permissionGate) await permissionGate;
      return { granted: backgroundGranted };
    },
    watchPositionAsync: async () => {
      calls.watcherStarts++;
      return { remove: () => {} };
    },
    hasStartedLocationUpdatesAsync: async () => calls.backgroundStarts > calls.backgroundStops,
    startLocationUpdatesAsync: async () => { calls.backgroundStarts++; },
    stopLocationUpdatesAsync: async () => { calls.backgroundStops++; },
  };
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: {
        getItem: async key => {
          if (failNextRead) { failNextRead = false; throw new Error('storage temporarily unavailable'); }
          return storage.get(key) ?? null;
        },
        setItem: async (key, value) => { storage.set(key, value); },
        removeItem: async key => { storage.delete(key); },
      } };
      if (name === 'expo-location') return location;
      if (name === 'expo-task-manager') return { defineTask: () => {} };
      if (name === '../constants/queueRideTypes') return { QUEUE_RIDE_TYPES: ['attraction', 'coaster', 'dark_ride', 'flat_ride', 'water_ride'] };
      if (name === 'react-native') return { AppState: {
        currentState: 'active', addEventListener: () => ({ remove: () => {} }),
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console,
    Date: TestDate,
    Math,
  }, { filename: file });
  return { service: moduleRef.exports.default, calls, storage,
    failRead: () => { failNextRead = true; },
    grantBackground: () => { backgroundGranted = true; },
    releasePermissionCheck: () => releasePermissionCheck?.(),
    advance: milliseconds => { now += milliseconds; } };
}

test('opening ride detection does not ask for Always permission', async () => {
  const { service, calls, grantBackground } = makeHarness();
  assert.equal(await service.startDetection(), true);
  assert.equal(calls.backgroundRequests, 0);
  assert.equal(calls.backgroundStarts, 0);
  assert.equal(calls.watcherStarts, 0);
  let samples = 0;
  service.processLocation = () => { samples++; };
  service.processForegroundLocation(1, 2);
  assert.equal(samples, 1);
  grantBackground();
  assert.equal(await service.syncBackgroundTracking(), true);
  assert.equal(calls.backgroundStarts, 1);
  assert.equal(calls.backgroundRequests, 0);
  await service.stopDetection();
  assert.equal(calls.backgroundStops, 1);
  service.processForegroundLocation(1, 2);
  assert.equal(samples, 1);
});

test('removing one reviewed ride keeps other and newer pending detections', async () => {
  const { service, storage } = makeHarness();
  const key = 'pending_ride_detections';
  storage.set(key, JSON.stringify([{ id: 'reviewed' }, { id: 'newer' }]));
  await service.removePendingDetection('reviewed');
  assert.deepEqual(JSON.parse(storage.get(key)).map(d => d.id), ['newer']);
});

test('a failed pending-detection read rejects removal without erasing the queue', async () => {
  const { service, storage, failRead } = makeHarness();
  const key = 'pending_ride_detections';
  storage.set(key, JSON.stringify([{ id: 'keep-me' }]));
  failRead();
  await assert.rejects(service.removePendingDetection('keep-me'));
  assert.deepEqual(JSON.parse(storage.get(key)).map(d => d.id), ['keep-me']);
});

test('a late permission check cannot start tracking after detection stops', async () => {
  const { service, calls, releasePermissionCheck } = makeHarness({
    backgroundGranted: true, deferredPermissionCheck: true,
  });
  const starting = service.startDetection();
  await new Promise(resolve => setImmediate(resolve));
  await service.stopDetection();
  releasePermissionCheck();
  assert.equal(await starting, false);
  assert.equal(service.isRunning(), false);
  assert.equal(calls.watcherStarts, 0);
  assert.equal(calls.backgroundStarts, 0);
});

test('map location samples still queue a ride after a real dwell and exit', async () => {
  const { service, calls, advance } = makeHarness();
  service.setRides([{ id: 42, name: 'Test Ride', type: 'ride', park_id: 1,
    lat: 34, lng: -118, radius: 50, ride_duration_minutes: 2, min_dwell_minutes: 1 }]);
  assert.equal(await service.startDetection(), true);
  service.processForegroundLocation(34, -118);
  advance(121_000);
  service.processForegroundLocation(34.002, -118);
  await new Promise(resolve => setImmediate(resolve));
  const detections = await service.getPendingDetections();
  assert.equal(detections.length, 1);
  assert.equal(detections[0].rideId, 42);
  assert.equal(detections[0].dwellTimeMs, 121_000);
  assert.equal(calls.watcherStarts, 0);
  await service.stopDetection();
});


test('dining, shops and unsupported catalog types never become ride suggestions', async () => {
  const { service, advance } = makeHarness();
  service.setRides(['restaurant', 'shop', 'store', 'unknown'].map((type, i) => ({ id: i+1,
    name: type, type, park_id: 1, lat: 34, lng: -118, radius: 50, min_dwell_minutes: 1 })));
  await service.startDetection(); service.processForegroundLocation(34, -118);
  advance(300_000); service.processForegroundLocation(34.002, -118);
  await new Promise(resolve => setImmediate(resolve)); assert.equal((await service.getPendingDetections()).length, 0);
});
test('overlapping attraction zones track only the clear nearest ride, not every neighbor', async () => {
  const { service, advance } = makeHarness();
  service.setRides([0, .0003, .0004].map((offset, i) => ({ id: i+1, name: 'Ride '+i,
    type: 'attraction', park_id: 1, lat: 34+offset, lng: -118, radius: 60, min_dwell_minutes: 1 })));
  await service.startDetection(); service.processForegroundLocation(34, -118);
  advance(300_000); service.processForegroundLocation(34.002, -118);
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(Array.from(await service.getPendingDetections(), d=>d.rideId), [1]);
});
test('an ambiguous overlap starts no dwell until a clear attraction is available', async () => {
  const { service, advance } = makeHarness();
  service.setRides([-.0001, .0001].map((offset,i) => ({ id: i+1, name: 'Ride '+i,
    type: 'show', park_id: 1, lat: 34+offset, lng: -118, radius: 60, min_dwell_minutes: 1 })));
  await service.startDetection(); service.processForegroundLocation(34, -118); advance(300_000);
  service.processForegroundLocation(34.002, -118); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await service.getPendingDetections()).length, 0);
  service.processForegroundLocation(34.0001, -118); advance(300_000); service.processForegroundLocation(34.002, -118);
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(Array.from(await service.getPendingDetections(), d=>d.rideId), [2]);
});
test('stopping a stationary visit creates no synthetic ride exit and keeps pending reviews', async () => {
  const { service, advance, storage } = makeHarness();
  storage.set('pending_ride_detections', JSON.stringify([{id:'review-me'}]));
  service.setRides([{id:1,name:'Nearby Ride',type:'coaster',park_id:1,lat:34,lng:-118,radius:50,min_dwell_minutes:1}]);
  await service.startDetection(); service.processForegroundLocation(34,-118); advance(300_000);
  await service.stopDetection(); assert.deepEqual(JSON.parse(storage.get('pending_ride_detections')), [{id:'review-me'}]);
});


test('old background caches exclude dining and invalid GPS samples cannot manufacture an exit', async () => {
  const { service, advance, storage } = makeHarness();
  storage.set('ride_detection_rides_cache',JSON.stringify([
    {id:1,name:'Diner',type:'restaurant',park_id:1,lat:34,lng:-118,radius:50,min_dwell_minutes:1},
    {id:2,name:'Ride',type:'attraction',park_id:1,lat:34,lng:-118,radius:50,min_dwell_minutes:1}
  ]));
  await service.loadRidesFromCache(); await service.startDetection(); service.processForegroundLocation(34,-118);
  advance(300_000); service.processForegroundLocation(NaN,-118);
  await new Promise(resolve => setImmediate(resolve)); assert.equal((await service.getPendingDetections()).length,0);
  service.processForegroundLocation(34.002,-118); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(await service.getPendingDetections(), d=>d.rideId),[2]);
});
