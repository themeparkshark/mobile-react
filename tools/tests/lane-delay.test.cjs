const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

test('lane slow server: a no-op outside lane bundles; in a lane bundle the answer waits, and past the timeout it times out', async () => {
  const L = loadTs('src/dev/laneDelay.ts', {}, {});
  const adapter = async config => ({ status: 200, config });
  // Store and OTA bundles never set the studio flag: the transport is returned untouched.
  assert.equal(L.withLaneDelay(adapter, () => new Error('t'), false), adapter);
  assert.equal(L.laneDelayMs('/me', false), 0);
  // In a lane bundle with no delay asked for, nothing changes either.
  L.setLaneDelay(undefined);
  const waits = [];
  const wait = async ms => { waits.push(ms); };
  const lane = L.withLaneDelay(adapter, config => Object.assign(new Error(`timeout of ${config.timeout}ms exceeded`), { code: 'ECONNABORTED' }), true, wait);
  assert.equal((await lane({ url: '/me', timeout: 8000 })).status, 200);
  assert.deepEqual(waits, []);
  L.setLaneDelay({ ms: 5000, match: 'feature-flags' });
  assert.equal((await lane({ url: '/feature-flags', timeout: 8000 })).status, 200);
  assert.deepEqual(waits, [5000]);
  assert.equal((await lane({ url: '/me', timeout: 8000 })).status, 200, 'only matching calls are slow');
  L.setLaneDelay({ ms: 30000 });
  await assert.rejects(lane({ url: '/me', timeout: 8000 }), err => err.code === 'ECONNABORTED');
  assert.deepEqual(waits, [5000, 8000], 'a 30 s answer times out at the call timeout');
  L.setLaneDelay({ ms: 9000, match: '/me$', method: 'put' });
  assert.equal((await lane({ url: '/me', method: 'get', timeout: 8000 })).status, 200, 'a GET is on time when only PUT is slow');
  await assert.rejects(lane({ url: '/me', method: 'put', timeout: 8000 }));
  L.setLaneDelay(undefined);
});
