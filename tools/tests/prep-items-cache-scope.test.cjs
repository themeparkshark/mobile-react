const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      esModuleInterop: true },
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef, exports: moduleRef.exports,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    Date, JSON, Number,
  }, { filename: file });
  return moduleRef.exports;
}

test('home finds cache never serves one player another player’s nearby progress', async () => {
  const storage = new Map();
  const cache = load('src/utils/apiCache.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
      getAllKeys: async () => [...storage.keys()],
      multiRemove: async keys => { keys.forEach(key => storage.delete(key)); },
    } },
  });
  let currentPlayer = 1;
  const response = id => ({ data: [{ id, name: `Player ${id} find` }],
    player_stats: { tickets: id, energy: id * 10 } });
  const prep = load('src/api/endpoints/me/prep-items/index.ts', {
    '../../../client': { __esModule: true, default: { get: async (url, { params }) => {
      assert.equal(url, '/me/prep-items');
      assert.equal(params.playerId, undefined);
      return { data: response(currentPlayer) };
    } } },
    '../../../../utils/apiCache': cache,
    '../../../../screens/ExploreScreen/ridePhoto': { setRidePhotoServerEnabled() {} },
    '../../../../helpers/deviceTimeZone': { __esModule: true,
      default: () => 'America/Los_Angeles' },
  });
  const lat = 34.18, lng = -118.31;

  await cache.setCache('/me/prep-items', { latitude: lat, longitude: lng }, response(999));
  assert.equal(await prep.getCachedPrepItems(lat, lng, 1), null);
  assert.equal(await prep.getCachedPrepItems(lat, lng, 2), null);

  await prep.default(lat, lng, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await prep.getCachedPrepItems(lat, lng, 1)).player_stats.tickets, 1);
  assert.equal(await prep.getCachedPrepItems(lat, lng, 2), null);

  currentPlayer = 2;
  await prep.default(lat, lng, 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await prep.getCachedPrepItems(lat, lng, 2)).player_stats.tickets, 2);
  assert.equal((await prep.getCachedPrepItems(lat, lng, 1)).player_stats.tickets, 1);

  assert.equal(await prep.getCachedPrepItems(lat, lng, 0), null);
  await assert.rejects(prep.default(lat, lng, 0), /signed-in player/);
  await cache.clearCache();
  assert.equal(await prep.getCachedPrepItems(lat, lng, 1), null);
  assert.equal(await prep.getCachedPrepItems(lat, lng, 2), null);
});
