// Hotfix wave 5: a kid with a saved profile is never held on the Loading screen by a slow network.
// On device (slow-api-all-15-25s): /me used its whole 15 s timeout before the saved profile was used,
// so the map came up about 22 s after launch. Now the saved profile opens the game after 6 s and the
// fresh one keeps loading in the background; a fresh 401 still signs the player out.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file, mocks, extra = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, __DEV__: false, process: { env: {} }, console, Promise, setTimeout, clearTimeout, ...extra,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return module.exports;
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const lp = load('src/context/launchProfile.ts', {});
const manualSleep = () => { const gates = []; return { sleep: () => { const d = deferred(); gates.push(d); return d.promise; }, fire: () => gates.forEach(g => g.resolve()) }; };

test('a fresh profile that answers first is used, the saved one is never read', async () => {
  let reads = 0;
  const s = manualSleep();
  const out = await lp.loadLaunchProfile(async () => ({ id: 1, username: 'fresh' }), async () => { reads += 1; return { id: 1 }; }, 6000, s.sleep);
  assert.equal(out.kind, 'fresh');
  assert.equal(out.player.username, 'fresh');
  assert.equal(reads, 0);
  assert.equal(lp.LAUNCH_CACHED_PROFILE_MS, 6000);
});

test('a fast failure is reported as failed (the 401 and outage paths stay with the caller)', async () => {
  const s = manualSleep();
  const err = Object.assign(new Error('no'), { response: { status: 401 } });
  const out = await lp.loadLaunchProfile(async () => { throw err; }, async () => ({ id: 1 }), 6000, s.sleep);
  assert.equal(out.kind, 'failed');
  assert.equal(out.error, err);
});

test('slow /me with a saved profile: the saved one opens the game and the fresh one keeps loading', async () => {
  const me = deferred(); const s = manualSleep();
  const p = lp.loadLaunchProfile(() => me.promise, async () => ({ id: 7, username: 'saved' }), 6000, s.sleep);
  await tick(); s.fire();
  const out = await p;
  assert.equal(out.kind, 'cached');
  assert.equal(out.player.username, 'saved');
  me.resolve({ id: 7, username: 'fresh' });
  assert.equal((await out.late).username, 'fresh');
});

test('slow /me and no saved profile: wait for the fresh one exactly as before', async () => {
  const me = deferred(); const s = manualSleep();
  let done = false;
  const p = lp.loadLaunchProfile(() => me.promise, async () => null, 6000, s.sleep).then(v => { done = true; return v; });
  await tick(); s.fire(); await tick(); await tick();
  assert.equal(done, false, 'still waiting on /me');
  me.resolve({ id: 3, username: 'fresh' });
  assert.deepEqual({ ...(await p) }, { kind: 'fresh', player: { id: 3, username: 'fresh' } });
});

test('the fresh profile landing while the saved one is read wins', async () => {
  const me = deferred(); const s = manualSleep(); const read = deferred();
  const p = lp.loadLaunchProfile(() => me.promise, () => read.promise, 6000, s.sleep);
  await tick(); s.fire(); await tick();
  me.resolve({ id: 9, username: 'fresh' }); await tick();
  read.resolve({ id: 9, username: 'saved' });
  const out = await p;
  assert.equal(out.kind, 'fresh');
  assert.equal(out.player.username, 'fresh');
});

test('a broken saved profile read counts as none', async () => {
  const me = deferred(); const s = manualSleep();
  const p = lp.loadLaunchProfile(() => me.promise, async () => { throw new Error('storage'); }, 6000, s.sleep);
  await tick(); s.fire(); await tick();
  me.reject(new Error('timeout'));
  assert.equal((await p).kind, 'failed');
});

// The real AuthProvider launch effect, driven with a fast clock (6 s becomes 6 ms).
function provider({ me, cached }) {
  const events = [];
  let launchEffect = null;
  const fastLaunch = load('src/context/launchProfile.ts', {}, { setTimeout: (fn, ms) => setTimeout(fn, ms / 1000) });
  const exports = load('src/context/AuthProvider.tsx', {
    react: {
      createContext: () => ({ Provider: 'provider' }),
      // token is the only state that starts undefined: give it a saved session.
      useState: value => [value === undefined ? 'saved-session' : value, next => events.push(['state', typeof next === 'function' ? next(null) : next])],
      useRef: value => ({ current: value }),
      useEffect() {},
    },
    rooks: { useAsyncEffect(fn) { launchEffect = fn; } },
    'expo-secure-store': { async setItemAsync() {}, async deleteItemAsync() { events.push(['deleteToken']); }, async getItemAsync() { return null; } },
    '@react-native-async-storage/async-storage': {
      async setItem() {}, async removeItem() {},
      async getItem(key) { return key === 'player' && cached ? JSON.stringify(cached) : null; },
    },
    '../api/client': { defaults: { headers: { common: {} } }, get: async () => ({}) },
    '../api/endpoints/auth/login': async () => ({}),
    '../api/endpoints/me/me': me,
    '../RootNavigation': { navigate: route => events.push(['navigate', route]) },
    '../services/lineplay/backgroundQueueHeartbeat': { async clearQueueBackgroundHeartbeat() {} },
    '../utils/apiCache': { async clearCache() {} },
    '../utils/standalonePreview': { isStandalonePreviewMode: () => false },
    '../screens/LeaderboardsScreen/standingsCache': { endStandingsSession: () => undefined },
    '../screens/SetCollection/dexCache': { clearBook() {} },
    '../services/push': { refreshPushRegistration: async () => undefined, listenForPushTaps: () => () => undefined },
    './launchProfile': fastLaunch,
  });
  exports.AuthProvider({ children: null });
  return { events, run: () => launchEffect() };
}
const navs = events => events.filter(e => e[0] === 'navigate').map(e => e[1]);

test('AuthProvider: slow /me with a saved profile goes to Loading on the saved profile', async () => {
  const me = deferred();
  const { events, run } = provider({ me: () => me.promise, cached: { id: 5, username: 'Kid' } });
  await run();
  assert.deepEqual(navs(events), ['Loading']);
  assert.ok(events.some(e => e[0] === 'state' && e[1] && e[1].id === 5), 'saved profile set');
  assert.ok(events.some(e => e[0] === 'state' && e[1] === true), 'isReady');
  me.resolve({ id: 5, username: 'Kid' }); await tick();
  assert.deepEqual(navs(events), ['Loading'], 'the late fresh profile never navigates again');
});

test('AuthProvider: a late 401 after the saved profile still signs the player out', async () => {
  const me = deferred();
  const { events, run } = provider({ me: () => me.promise, cached: { id: 5, username: 'Kid' } });
  await run();
  me.reject(Object.assign(new Error('expired'), { response: { status: 401 } }));
  await tick(); await tick(); await tick();
  assert.ok(events.some(e => e[0] === 'deleteToken'), 'session dropped');
  assert.deepEqual(navs(events), ['Loading', 'Login']);
});

test('AuthProvider: a fast /me goes straight on and a new player goes to Welcome', async () => {
  const { events, run } = provider({ me: async () => ({ id: 6, username: null }), cached: { id: 6, username: 'Old' } });
  await run();
  assert.deepEqual(navs(events), ['Welcome']);
});

test('AuthProvider: /me fails fast with no saved profile shows sign-in', async () => {
  const { events, run } = provider({ me: async () => { throw new Error('Network Error'); }, cached: null });
  await run();
  assert.deepEqual(navs(events), ['Login']);
});
