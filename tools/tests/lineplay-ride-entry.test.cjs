const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function loadResolver(getRides, now = () => Date.now()) {
  const file = 'src/services/lineplay/resolveRide.ts';
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, {
    module: moduleRef,
    exports: moduleRef.exports,
    Date: { now },
    require(name) {
      if (name === '../../api/endpoints/rides') return { getRides };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return moduleRef.exports;
}

function loadQueuePlayPolicy() {
  const file = 'src/services/lineplay/queuePlayPolicy.ts';
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
  return moduleRef.exports.queuePlayPolicy;
}

function loadWaitPresentation() {
  const file = 'src/services/lineplay/queueWaitPresentation.ts';
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
  return moduleRef.exports;
}

test('map queue entry uses verified catalog ride id for Parts eligibility', async () => {
  const resolver = loadResolver(async parkId => [{
    id: 384, name: 'Haunted Mansion', slug: 'haunted-mansion-8', park_id: parkId,
    image_url: 'https://example.com/ride.png',
    line_rewards_ready: true,
  }]);
  const ride = await resolver.resolveRideContextOrOffline(8, 'Haunted Mansion');
  assert.equal(ride.rideId, 384);
  assert.equal(ride.rideSlug, 'haunted-mansion-8');
  assert.equal(ride.parkId, 8);
  assert.equal(ride.postedWaitMinutes, null);
  assert.equal(ride.lineRewardsReady, true);
});

test('park checklist prefetch lets simultaneous ride entries reuse one catalog lookup', async () => {
  let requests = 0;
  const resolver = loadResolver(async parkId => {
    requests += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    return [
      { id: 384, name: 'Haunted Mansion', park_id: parkId, line_rewards_ready: true },
      { id: 385, name: 'Space Mountain', park_id: parkId, line_rewards_ready: true },
    ];
  });
  const prefetch = resolver.prefetchRideCatalog(8);
  const [haunted, space] = await Promise.all([
    resolver.resolveRideContextOrOffline(8, 'Haunted Mansion'),
    resolver.resolveRideContextOrOffline(8, 'Space Mountain'),
  ]);
  await prefetch;
  assert.equal(requests, 1);
  assert.equal(haunted.rideId, 384);
  assert.equal(space.rideId, 385);
});

test('catalog outage keeps queue games available without inventing a rewardable ride id', async () => {
  const resolver = loadResolver(async () => { throw new Error('offline'); });
  const ride = await resolver.resolveRideContextOrOffline(8, 'Haunted Mansion', 25, 1234, 'feed-1');
  assert.equal(ride.rideId, 0);
  assert.equal(ride.rideName, 'Haunted Mansion');
  assert.equal(ride.parkId, 8);
  assert.equal(ride.postedWaitMinutes, 25);
  assert.equal(ride.waitFeedRideId, 'feed-1');
  assert.equal(ride.lineRewardsReady, false);
});

test('a name mismatch cannot accidentally credit another ride', async () => {
  const resolver = loadResolver(async parkId => [{
    id: 384, name: 'Haunted Mansion', slug: 'haunted-mansion-8', park_id: parkId,
  }]);
  const ride = await resolver.resolveRideContextOrOffline(8, 'Space Mountain');
  assert.equal(ride.rideId, 0);
  assert.equal(ride.rideName, 'Space Mountain');
});

test('legacy coin labels link only to the named ride in the same park', async () => {
  const resolver = loadResolver(async parkId => [{
    id: parkId === 1 ? 11 : 82,
    name: parkId === 1 ? 'Studio Tour' : 'Pirates of the Caribbean',
    slug: parkId === 1 ? 'studio-tour-1' : 'pirates-of-the-caribbean-8',
    park_id: parkId,
  }]);
  assert.equal((await resolver.resolveRideContext(1, 'World Famous Studio Tour', null)).rideId, 11);
  assert.equal((await resolver.resolveRideContext(8, 'Pirates', null)).rideId, 82);
  assert.equal(await resolver.resolveRideContext(8, 'World Famous Studio Tour', null), null);
});

test('Disneyland Thunder Mountain coin opens its Big Thunder queue chapter and linked Parts', async () => {
  const resolver = loadResolver(async parkId => [{
    id: 384, name: 'Big Thunder Mountain Railroad', slug: 'big-thunder-mountain-railroad-8',
    park_id: parkId, line_rewards_ready: true,
  }]);
  const ride = await resolver.resolveMapQueueContext(8, 'Thunder Mountain');
  assert.equal(ride.rideId, 384);
  assert.equal(ride.rideName, 'Big Thunder Mountain Railroad');
  assert.equal(ride.lineRewardsReady, true);
  assert.equal(await resolver.resolveMapQueueContext(2, 'Thunder Mountain'), null);
});

test('queue ride reward readiness refreshes during an open park day', async () => {
  let nowMs = 1000;
  let ready = false;
  let calls = 0;
  const resolver = loadResolver(async parkId => {
    calls += 1;
    return [{ id: 384, name: 'Big Thunder Mountain Railroad', park_id: parkId,
      line_rewards_ready: ready }];
  }, () => nowMs);
  assert.equal((await resolver.resolveMapQueueContext(8, 'Thunder Mountain')).lineRewardsReady, false);
  ready = true;
  nowMs += 30_000;
  assert.equal((await resolver.resolveMapQueueContext(8, 'Thunder Mountain')).lineRewardsReady, false);
  assert.equal(calls, 1);
  nowMs += 31_000;
  assert.equal((await resolver.resolveMapQueueContext(8, 'Thunder Mountain')).lineRewardsReady, true);
  assert.equal(calls, 2);
});

test('a non-ride coin and an uncataloged ride do not show a rewardable map action', async () => {
  const resolver = loadResolver(async parkId => [{
    id: 82, name: 'Pirates of the Caribbean', slug: 'pirates-of-the-caribbean-8',
    park_id: parkId,
  }]);
  assert.equal(await resolver.resolveRideContext(8, 'Fire Department', null), null);
  assert.equal(await resolver.resolveRideContext(8, 'Jungle Cruise', null), null);
});

test('a cataloged ride without a coin link remains playable but explicitly unready for Parts', async () => {
  const resolver = loadResolver(async parkId => [{
    id: 384, name: 'Haunted Mansion', slug: 'haunted-mansion-8', park_id: parkId,
    line_rewards_ready: false,
  }]);
  const ride = await resolver.resolveRideContext(8, 'Haunted Mansion', null);
  assert.equal(ride.rideId, 384);
  assert.equal(ride.lineRewardsReady, false);
});

test('Disneyland Jungle Cruise map marker opens its authored games without inventing a ride id', async () => {
  const resolver = loadResolver(async () => []);
  const ride = await resolver.resolveMapQueueContext(8, 'Jungle Cruise');
  assert.equal(ride.rideId, 0);
  assert.equal(ride.rideSlug, 'jungle-cruise-8');
  assert.equal(ride.lineRewardsReady, false);
  assert.equal(await resolver.resolveMapQueueContext(8, 'Fire Department'), null);
  assert.equal(await resolver.resolveMapQueueContext(2, 'Jungle Cruise'), null);
});

test('a temporarily down ride keeps queue games while closing rewards for that session', () => {
  const policy = loadQueuePlayPolicy();
  assert.deepEqual({ ...policy('OPERATING') }, { canPlay: true, canRequestParts: true });
  assert.deepEqual({ ...policy('DOWN') }, { canPlay: true, canRequestParts: false });
  assert.deepEqual({ ...policy('CLOSED') }, { canPlay: false, canRequestParts: false });
  assert.deepEqual({ ...policy('REFURBISHMENT') }, { canPlay: false, canRequestParts: false });
});

test('missing wait data never becomes a false zero-minute recommendation', () => {
  const { postedStandbyWait, compareQueueWaits } = loadWaitPresentation();
  const knownZero = { name: 'A', status: 'OPERATING', queue: { STANDBY: { waitTime: 0 } } };
  const knownLong = { name: 'B', status: 'OPERATING', queue: { STANDBY: { waitTime: 45 } } };
  const missing = { name: 'C', status: 'OPERATING' };
  const invalid = { name: 'D', status: 'OPERATING', queue: { STANDBY: { waitTime: -1 } } };
  assert.equal(postedStandbyWait(knownZero), 0);
  assert.equal(postedStandbyWait(missing), null);
  assert.equal(postedStandbyWait(invalid), null);
  assert.deepEqual([knownZero, missing, knownLong].sort((a, b) => compareQueueWaits(a, b, 'wait-asc'))
    .map(entry => entry.name), ['A', 'B', 'C']);
  assert.deepEqual([knownZero, missing, knownLong].sort((a, b) => compareQueueWaits(a, b, 'wait-desc'))
    .map(entry => entry.name), ['B', 'A', 'C']);
});
