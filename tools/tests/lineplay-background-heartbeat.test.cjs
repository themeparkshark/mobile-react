const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/backgroundQueueHeartbeat.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(permission = true, post = null) {
  const values = new Map([['player', JSON.stringify({ id: 12 })]]);
  const calls = { posts: [], starts: 0, stops: 0 };
  let started = false;
  let task;
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  const location = {
    Accuracy: { High: 4 },
    getBackgroundPermissionsAsync: async () => ({ granted: permission }),
    hasStartedLocationUpdatesAsync: async () => started,
    startLocationUpdatesAsync: async () => { started = true; calls.starts++; },
    stopLocationUpdatesAsync: async () => { started = false; calls.stops++; },
  };
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: storage };
      if (name === 'expo-location') return location;
      if (name === 'expo-secure-store') return { getItemAsync: async () => 'test-token' };
      if (name === 'expo-task-manager') return { defineTask: (_, callback) => { task = callback; } };
      if (name === '../../api/client') return { default: {
        post: async (...args) => { calls.posts.push(args); return post ? post(...args) : { data: { status: 'active' } }; },
      } };
      if (name === './checkpointCredit') return require('./helpers/lineplay-checkpoint-credit.cjs');
      throw new Error(`Unexpected dependency: ${name}`);
    },
    Date,
    console,
  }, { filename: file });
  return {
    ...moduleRef.exports, calls, values,
    sample: (timestamp = Date.now(), accuracy = undefined) => task({ data: { locations: [{
      timestamp, coords: { latitude: 1, longitude: 2, accuracy },
    }] } }),
  };
}

test('background queue tracking is opt-in through existing OS permission', async () => {
  const denied = harness(false);
  assert.equal(await denied.activateQueueBackgroundHeartbeat('session-1', 12), false);
  assert.equal(denied.calls.starts, 0);
  assert.equal(denied.values.has('lineplay_active_background_session_v1'), false);
});

test('fresh samples heartbeat once, while stale and rapid samples do not', async () => {
  const run = harness();
  assert.equal(await run.activateQueueBackgroundHeartbeat('session-1', 12), true);
  assert.equal(run.calls.starts, 1);
  await run.sample(Date.now() - 91_000);
  assert.equal(run.calls.posts.length, 0);
  await run.sample();
  await run.sample();
  assert.equal(run.calls.posts.length, 1);
  assert.equal(run.calls.posts[0][0], '/me/line-sessions/session-1/heartbeat');
  assert.deepEqual(JSON.parse(JSON.stringify(run.calls.posts[0][1])), { latitude: 1, longitude: 2 });
  await run.deactivateQueueBackgroundHeartbeat('session-1');
  assert.equal(run.calls.stops, 1);
});

test('an account switch stops the task before another heartbeat', async () => {
  const run = harness();
  await run.activateQueueBackgroundHeartbeat('session-1', 12);
  run.values.set('player', JSON.stringify({ id: 99 }));
  await run.sample();
  assert.equal(run.calls.posts.length, 0);
  assert.equal(run.calls.stops, 1);
  assert.equal(run.values.has('lineplay_active_background_session_v1'), false);
});

test('L1: background fixes with no signal are kept for the foreground to sync', async () => {
  const offline = harness(true, async () => { throw new Error('Network Error'); });
  assert.equal(await offline.activateQueueBackgroundHeartbeat('session-dark', 12), true);
  const now = Date.now();
  await offline.sample(now - 5_000, 12);
  // The next callback inside the send throttle is not even attempted.
  await offline.sample(now - 1_000, 9);
  assert.equal(offline.calls.posts.length, 1);
  assert.equal(offline.calls.posts[0][1].accuracy_meters, 12);
  const trail = await offline.takeBackgroundTrail('session-dark');
  assert.equal(trail.length, 1);
  assert.equal(trail[0].accuracyMeters, 12);
  assert.equal(trail[0].at, now - 5_000);
  // Taken once: the foreground owns it now.
  assert.equal((await offline.takeBackgroundTrail('session-dark')).length, 0);
});

test('L1: a far answer or a server refusal is never kept as an offline fix', async () => {
  const far = harness(true, async () => {
    const error = new Error('far'); error.response = { status: 422, data: { code: 'NOT_NEAR_RIDE' } }; throw error;
  });
  await far.activateQueueBackgroundHeartbeat('session-far', 12);
  await far.sample(Date.now() - 1_000, 8);
  assert.equal(far.calls.posts.length, 1);
  assert.equal((await far.takeBackgroundTrail('session-far')).length, 0);
});
