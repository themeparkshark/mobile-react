const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/LinePlaySession.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const values = new Map();
const storage = {
  getItem: async key => values.get(key) ?? null,
  setItem: async (key, value) => { values.set(key, value); },
};
const moduleRef = { exports: {} };
vm.runInNewContext(code, {
  module: moduleRef,
  exports: moduleRef.exports,
  require(name) {
    if (name === '@react-native-async-storage/async-storage') return { default: storage };
    if (name === '../../games/trivia/config') return { LINEPLAY_ROUND_QUESTIONS: 5 };
    return {};
  },
  Date,
}, { filename: file });

const { resolveSessionWait } = moduleRef.exports;
const ride = { rideId: 99, rideName: 'Test Ride', parkId: 2 };

test('recently fetched wait is posted and populates last-known cache', async () => {
  values.clear();
  const wait = await resolveSessionWait({ ...ride, postedWaitMinutes: 32, postedWaitObservedAt: Date.now() - 60_000 });
  assert.deepEqual(JSON.parse(JSON.stringify(wait)), { minutes: 32, source: 'posted' });
  assert.equal(JSON.parse(values.get('lineplay_wait_cache_99')).waitMinutes, 32);
});

test('stale wait is marked last-known and never silently refreshed', async () => {
  values.clear();
  const wait = await resolveSessionWait({ ...ride, postedWaitMinutes: 40, postedWaitObservedAt: Date.now() - 30 * 60_000 });
  assert.deepEqual(JSON.parse(JSON.stringify(wait)), { minutes: 40, source: 'last_known' });
  assert.equal(values.size, 0);
});

test('offline wait uses a bounded cache, then an explicit planning estimate', async () => {
  values.clear();
  values.set('lineplay_wait_cache_99', JSON.stringify({ waitMinutes: 18, cachedAt: Date.now() - 2 * 60 * 60_000 }));
  assert.deepEqual(JSON.parse(JSON.stringify(await resolveSessionWait(ride))), { minutes: 18, source: 'last_known' });
  values.set('lineplay_wait_cache_99', JSON.stringify({ waitMinutes: 18, cachedAt: Date.now() - 4 * 60 * 60_000 }));
  assert.deepEqual(JSON.parse(JSON.stringify(await resolveSessionWait(ride))), { minutes: 20, source: 'estimate' });
});
