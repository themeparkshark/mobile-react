const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function loadPlain(file) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
  return moduleRef.exports;
}

function loadResolver(getRides, now = () => Date.now()) {
  const file = 'src/services/lineplay/resolveRide.ts';
  const coinIndex = loadPlain('src/services/lineplay/coinRideIndex.ts');
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
      if (name === '../../constants/queueRideTypes') return { QUEUE_RIDE_TYPES: ['attraction', 'coaster', 'dark_ride', 'flat_ride', 'water_ride'] };
      if (name === './lineZone') return require('./helpers/lineplay-zone.cjs');
      if (name === './coinRideIndex') return coinIndex;
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

test('an Adventure Ticket coin label that differs from the ride title still opens its story (Tiki Room)', async () => {
  const resolver = loadResolver(async parkId => [
    { id: 578, name: "Walt Disney's Enchanted Tiki Room", slug: '8-walt-disneys-enchanted-tiki-room', park_id: parkId,
      task_id: 77, type: 'attraction', line_rewards_ready: true },
    { id: 609, name: 'Tiki Juice Bar', park_id: parkId, task_id: 77, type: 'restaurant', line_rewards_ready: false },
  ]);
  // The old name-only lookup returned null here, and the ticket showed "Could not open this ride's adventure".
  assert.equal(await resolver.resolveRideContext(8, 'Tiki Room', null), null);
  const byId = await resolver.resolveQueueStoryContext(8, 578, 'Tiki Room', 77);
  assert.equal(byId.rideId, 578);
  assert.equal(byId.rideName, "Walt Disney's Enchanted Tiki Room");
  assert.equal(byId.lineRewardsReady, true);
  // The map's PLAY IN LINE chip finds the same ride by its coin task, never the snack bar.
  const byTask = await resolver.resolveMapQueueContext(8, 'Tiki Room', 77);
  assert.equal(byTask.rideId, 578);
});

test('a queue story never fails: no catalog match or no catalog at all plays the template story under the server ride id', async () => {
  const empty = loadResolver(async () => []);
  const missing = await empty.resolveQueueStoryContext(8, 593, 'Castle', 71);
  assert.equal(missing.rideId, 593);
  assert.equal(missing.rideName, 'Castle');
  assert.equal(missing.parkId, 8);
  assert.equal(missing.lineRewardsReady, undefined, 'the server, not the phone, decides Parts');
  const down = loadResolver(async () => { throw new Error('offline'); });
  const offline = await down.resolveQueueStoryContext(8, 622, 'Mr. Lincoln');
  assert.equal(offline.rideId, 622);
  assert.equal(offline.rideName, 'Mr. Lincoln');
  const unnamed = await down.resolveQueueStoryContext(8, 0, 'Some Ride');
  assert.equal(unnamed.rideId, 0);
});

// P2 (RIDE_PARTS_BUGS 9): every LinePlay door finds the ride by the coin id or the wait feed id, never by a name.
// The fixture is the :8012 catalog (rides with task_id and metadata.themeparks_id, and each park's coins) on Nov 20.
const catalog = require('./fixtures/parts-ride-catalog.json');
const QUEUE = new Set(['attraction', 'coaster', 'dark_ride', 'flat_ride', 'water_ride']);
const catalogResolver = () => loadResolver(async parkId => catalog.parks[parkId].rides.map(ride => ({
  ...ride, image_url: null, metadata: ride.themeparks_id ? { themeparks_id: ride.themeparks_id } : null,
})));
const queueCoins = () => Object.entries(catalog.parks).flatMap(([parkId, park]) => {
  const coins = new Map(park.coins.map(coin => [coin.id, coin]));
  return park.rides.filter(ride => ride.task_id && QUEUE.has(ride.type) && coins.has(ride.task_id))
    .map(ride => ({ parkId: Number(parkId), ride, coin: coins.get(ride.task_id), coins: park.coins }));
});

test('P2: every queue coin in all 7 parks opens its own ride by coin id, whatever the names say', async () => {
  const rows = queueCoins();
  assert.ok(rows.length >= 133, `queue coins in the fixture: ${rows.length}`);
  const resolver = catalogResolver();
  const misses = [];
  for (const { parkId, ride, coin } of rows) {
    const byCoin = await resolver.resolveCoinRideContext(parkId, coin);
    const onMap = await resolver.resolveMapQueueContext(parkId, coin.name, coin.id);
    if (byCoin.rideId !== ride.id || onMap?.rideId !== ride.id) misses.push(`${parkId} ${coin.name} -> ${byCoin.rideId}/${onMap?.rideId}, want ${ride.id}`);
  }
  assert.deepEqual(misses, []);
});

test('P2: the shelf passing only a coin name still resolves by that coin id once the shelf loaded', async () => {
  const resolver = catalogResolver();
  const before = await resolver.resolveRideContextOrOffline(2, "Buzz Lightyear's Space Ranger Spin");
  for (const [parkId, park] of Object.entries(catalog.parks)) resolver.rememberParkCoins(Number(parkId), park.coins);
  const misses = [];
  for (const { parkId, ride, coin } of queueCoins()) {
    const got = await resolver.resolveRideContextOrOffline(parkId, coin.name);
    if (got.rideId !== ride.id) misses.push(`${parkId} ${coin.name} -> ${got.rideId}, want ${ride.id}`);
  }
  assert.deepEqual(misses, []);
  // Buzz Lightyear (Magic Kingdom): the catalog row has a curly apostrophe; the name fallback folds it too.
  assert.equal(before.rideId, 315);
});

test('P2: a wait-times row finds its ride by the feed id, so a holiday name still pays its coin', async () => {
  const resolver = catalogResolver();
  const misses = [];
  for (const { parkId, ride } of queueCoins()) {
    if (!ride.themeparks_id) continue;
    const holiday = `Holiday ${ride.name} Jingle`;
    const got = await resolver.resolveWaitRowRideContext(parkId, { id: ride.themeparks_id, name: holiday }, 25, 1);
    const old = await resolver.resolveRideContextOrOffline(parkId, holiday, 25, 1, ride.themeparks_id);
    const coin = await resolver.coinTasksByRideName(parkId, [{ id: ride.themeparks_id, name: holiday }]);
    if (got.rideId !== ride.id || old.rideId !== ride.id || coin.get(holiday) !== ride.task_id) misses.push(`${parkId} ${ride.name}`);
  }
  assert.deepEqual(misses, []);
  const jungle = await resolver.resolveWaitRowRideContext(2, { id: '796b0a25-c51e-456e-9bb8-50a324e301b3', name: 'Jingle Cruise' }, 30, 1);
  assert.equal(jungle.rideId, 348);
  assert.equal(jungle.lineRewardsReady, true);
});
