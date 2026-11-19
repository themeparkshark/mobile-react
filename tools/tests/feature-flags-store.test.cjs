const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const payload = flags => ({ flags, min_app_version: '1.0.0', update_required: false, app_store_url: '' });
const slow = () => Promise.reject(Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' }));

/** The store plus the readers that sit on it, in one realm, with a fake clock for retries. */
function realm() {
  const timers = [];
  const globals = {
    setTimeout: (fn, ms) => { const t = { fn, ms, unref() {} }; timers.push(t); return t; },
    clearTimeout: t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  };
  const client = { defaults: { headers: { common: { Authorization: 'Bearer a' } } }, get: async () => ({ data: {} }) };
  const react = { useEffect() {}, useState: v => [typeof v === 'function' ? v() : v, () => {}] };
  const stubs = { '../../client': client, '../../platform': { appVersionHeaders: () => ({}) }, react };
  const store = loadTs('src/api/endpoints/platform/feature-flags.ts', stubs, globals);
  const guide = loadTs('src/services/guide/guideFlags.ts', { ...stubs, '../../api/endpoints/platform/feature-flags': store }, globals);
  const retention = loadTs('src/services/retention/flags.ts', { ...stubs, '../../api/endpoints/platform/feature-flags': store }, globals);
  const map = loadTs('src/services/mapFlags.ts', { ...stubs, '../api/endpoints/platform/feature-flags': store }, globals);
  return { store, guide, retention, map, timers, client };
}

test('T095: a slow first read never hides Daily 3 for the session; the retry and listeners turn it on', async () => {
  const { store, guide, retention, map, timers } = realm();
  let answer = slow;
  const timeouts = [];
  store.setFeatureFlagsFetcherForTests(timeout => { timeouts.push(timeout); return answer(); });
  store.setFeatureFlagWatch(true);

  // First read: the server is slow. Every reader falls back to off, but nothing is pinned.
  assert.equal((await guide.loadGuideFlags(7)).daily_three, undefined);
  assert.equal(await retention.loadRetentionFlags(), null);
  assert.equal((await map.loadMapFlags()).gymSwords, false);
  assert.equal(timers.length, 1, 'a failed read schedules its own retry');
  assert.equal(timers[0].ms, 2000);

  // The retry lands: every reader hears it (no app restart, no remount).
  const heard = [];
  retention.onRetentionFlags(f => heard.push(f.dailyThree));
  answer = async () => payload({ daily_three: true, level_chests: true, map_gym_swords: true });
  timers.shift().fn();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(heard, [true], 'the Rewards sheet hears Daily 3 turn on');
  assert.equal(retention.retentionFlagsNow().levelChests, true);
  assert.equal((await guide.loadGuideFlags(7)).daily_three, true, 'the guide reads the late answer');
  assert.equal((await map.loadMapFlags()).gymSwords, true);
  assert.ok(timeouts[1] > timeouts[0], 'the retry waits longer than the first try');
  assert.equal(timers.length, 0, 'no retry after a good answer');
});

test('T095: the last good answer is kept while a later read fails; focus re-reads only when due', async () => {
  const { store } = realm();
  let now = 1_000_000;
  let calls = 0;
  let answer = async () => payload({ daily_three: true });
  store.setFeatureFlagsFetcherForTests(() => { calls += 1; return answer(); }, () => now);
  assert.equal((await store.default()).flags.daily_three, true);
  assert.equal(calls, 1);
  await store.refreshFeatureFlags();
  assert.equal(calls, 1, 'a fresh good answer is not read again on focus');
  now += 6 * 60 * 1000;
  answer = slow;
  assert.equal((await store.default()).flags.daily_three, true, 'a failed refresh keeps the last good answer (never all off)');
  assert.equal(store.featureFlagFailuresForTests(), 1);
  answer = async () => payload({ daily_three: true, shark_pass: true });
  await store.refreshFeatureFlags();
  assert.equal(calls, 3, 'focus reads again because the last read failed');
  assert.equal(store.featureFlagsNow().flags.shark_pass, true);
});

test('T095: another session never reads the cached switches', async () => {
  const { store, client } = realm();
  store.setFeatureFlagsFetcherForTests(async () => payload({ reveal_all: true }));
  assert.equal((await store.default()).flags.reveal_all, true);
  client.defaults.headers.common.Authorization = 'Bearer b';
  assert.equal(store.featureFlagsNow(), null, 'a new token forgets the old answer');
});

test('T095: retries only while the app is open, and the root mounts the watch; the map re-reads on focus', async () => {
  const { store, timers } = realm();
  store.setFeatureFlagsFetcherForTests(slow);
  await store.default().catch(() => undefined);
  assert.equal(timers.length, 0, 'no retry timer unless the root watch is on (tests, previews)');
  store.setFeatureFlagWatch(true);
  assert.equal(timers.length, 1);
  store.setFeatureFlagsAppActive(false);
  assert.equal(timers.length, 0, 'background: no retries');
  assert.match(read('src/Root.tsx'), /useFeatureFlagWatch\(\);/);
  assert.match(read('src/services/flagWatch.ts'), /AppState\.addEventListener\('change', state => setFeatureFlagsAppActive\(state === 'active'\)\)/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /useEffect\(\(\) => \{ if \(mapFocused\) void refreshFeatureFlags\(\); \}, \[mapFocused\]\);/);
  // Every switch reader listens for the late answer.
  for (const file of ['src/services/guide/guideFlags.ts', 'src/services/retention/flags.ts', 'src/services/mapFlags.ts',
    'src/services/lineplay/lineFlags.ts', 'src/services/progression/progressionFlags.ts', 'src/services/money/flags.ts',
    'src/services/playPrefs.ts', 'src/components/help/HelpProvider.tsx']) {
    assert.match(read(file), /onFeatureFlags\??\.?\(/, `${file} hears a late answer`);
  }
  assert.match(read('src/components/retention/useRetention.tsx'), /useEffect\(\(\) => onRetentionFlags\(/);
});
