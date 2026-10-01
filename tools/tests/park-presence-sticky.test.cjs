const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

// Jenn (Disneyland, 1.6.0 build 20260930.6): the map loaded in park mode, then
// about 10 seconds later the header flipped to TRAVEL MODE and the map went
// blank grey. The server answered every /me/current-park with Disneyland. The
// loading screen's requestPark() ran before the first GPS fix, awaited a slow
// getCurrentPositionAsync, then cleared the park the watcher had already found
// (park undefined, parkLoaded false), which also hid the home map.
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const policySource = fs.readFileSync(path.join(root, 'src/context/parkLookupPolicy.ts'), 'utf8');
const policy = { exports: {} };
vm.runInNewContext(ts.transpileModule(policySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: policy, exports: policy.exports, Date, Math, Number });
const { nextParkPresence, NO_PARK_PRESENCE, LEAVE_PARK_MIN_MS } = policy.exports;

const DISNEYLAND = { id: 8, name: 'Disneyland Park', stores: [] };
const DCA = { id: 13, name: 'Disney California Adventure Park', stores: [] };
const atPark = nextParkPresence(NO_PARK_PRESENCE, { outcome: 'park', park: DISNEYLAND, at: 0 });

test('one outside reading, an error or a coarse fix never drops the park', () => {
  assert.equal(atPark.park, DISNEYLAND);
  const once = nextParkPresence(atPark, { outcome: 'outside', at: 10_000, accuracyMeters: 20 });
  assert.equal(once.park, DISNEYLAND, 'one outside reading is not enough');
  assert.equal(nextParkPresence(atPark, { outcome: 'error', at: 10_000 }), atPark, 'errors keep the park');
  const coarse = nextParkPresence(atPark, { outcome: 'outside', at: 10_000, accuracyMeters: 400 });
  assert.equal(coarse, atPark, 'an indoor 400 m fix does not count');
  const quick = nextParkPresence(once, { outcome: 'outside', at: 20_000, accuracyMeters: 20 });
  assert.equal(quick.park, DISNEYLAND, 'two readings close together are not sustained');
  const back = nextParkPresence(quick, { outcome: 'park', park: DISNEYLAND, at: 30_000 });
  assert.deepEqual({ ...back }, { park: DISNEYLAND, outsideSince: null, outsideChecks: 0 }, 'a park reading resets the streak');
});

test('sustained outside readings leave the park; a new park is entered at once', () => {
  const first = nextParkPresence(atPark, { outcome: 'outside', at: 100_000, accuracyMeters: 10 });
  const left = nextParkPresence(first, { outcome: 'outside', at: 100_000 + LEAVE_PARK_MIN_MS, accuracyMeters: 10 });
  assert.equal(left.park, undefined);
  const hopped = nextParkPresence(atPark, { outcome: 'park', park: DCA, at: 5_000 });
  assert.equal(hopped.park, DCA, 'park hopping switches immediately');
  assert.equal(nextParkPresence(NO_PARK_PRESENCE, { outcome: 'outside', at: 1 }).park, undefined);
});

function mount() {
  const watchers = [];
  let resolveFix;
  const Location = {
    Accuracy: { High: 4, Highest: 5, BestForNavigation: 6 },
    getForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    watchHeadingAsync: async () => ({ remove() {} }),
    watchPositionAsync: async (options, onLocation, onError) => {
      const sub = { onLocation, onError, remove() {} };
      watchers.push(sub);
      return sub;
    },
    // A slow first fix: it resolves only when the test says so.
    getCurrentPositionAsync: () => new Promise(resolve => { resolveFix = resolve; }),
  };
  const lookups = [];
  let answer = async () => DISNEYLAND;
  const app = runtime('src/context/LocationProvider.tsx', {
    'expo-location': Location,
    'react-native': {
      Platform: { OS: 'ios' }, Linking: { openURL: async () => undefined },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    },
    rooks: { useAsyncEffect: () => undefined, useDebounce: fn => fn, useIntervalWhen: () => undefined },
    '../api/endpoints/me/current-park': { default: async (lat, lng) => { lookups.push([lat, lng]); return answer(); } },
    './AuthProvider': { AuthContext: { value: { player: { id: 16, username: 'thedoc' }, refreshPlayer: async () => undefined } } },
    '../helpers/dev-location-store': { setDevModeEnabled() {}, setDevLocation() {} },
    './parkLookupPolicy': policy.exports,
  }, { children: 'map' }, {
    setInterval: () => 0, clearInterval() {},
    console: { ...console, warn() {}, error() {} },
  }, { exportName: 'LocationProvider' });
  const settle = async () => { for (let i = 0; i < 4; i++) { app.render(); await app.settle(); } };
  return { app, watchers, lookups, settle, resolveFix: fix => resolveFix(fix),
    setAnswer: fn => { answer = fn; }, value: () => app.tree.props.value };
}

const fix = (latitude, longitude, accuracy = 8) => ({ coords: { latitude, longitude, accuracy, speed: 0 }, timestamp: 1 });

test('a slow launch GPS fix never clears the park the watcher already found', async () => {
  const { watchers, lookups, settle, resolveFix, value } = mount();
  await value().requestPermission(); await settle();
  // LoadingScreen calls requestPark before any fix exists.
  const pending = value().requestPark();
  await settle();
  watchers[0].onLocation(fix(33.8121, -117.9190));
  await settle();
  assert.equal(value().park?.id, 8, 'the watcher fix checks in at Disneyland');
  assert.equal(value().parkLoaded, true);
  // Ten seconds later the launch fix finally lands.
  resolveFix({ coords: { latitude: 33.8122, longitude: -117.9191 } });
  await pending; await settle();
  assert.equal(value().park?.id, 8, 'still at Disneyland, not Travel Mode');
  assert.equal(value().parkLoaded, true, 'the map stays rendered');
  assert.ok(lookups.length >= 1);
});

test('a launch with no fix yet looks up the park from the first fix instead of clearing it', async () => {
  const { lookups, settle, resolveFix, value } = mount();
  await value().requestPermission(); await settle();
  const pending = value().requestPark();
  resolveFix({ coords: { latitude: 33.8121, longitude: -117.9190 } });
  await pending; await settle();
  assert.equal(value().park?.id, 8);
  assert.deepEqual(lookups[0], [33.8121, -117.9190]);
});

test('network failures and a single outside answer keep the park', async () => {
  const { watchers, settle, setAnswer, value } = mount();
  await value().requestPermission(); await settle();
  watchers[0].onLocation(fix(33.8121, -117.9190));
  await settle();
  assert.equal(value().park?.id, 8);
  setAnswer(async () => { throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }); });
  await value().requestPark(); await settle();
  assert.equal(value().park?.id, 8, 'a timeout keeps the park');
  setAnswer(async () => null);
  await value().requestPark(); await settle();
  assert.equal(value().park?.id, 8, 'one outside answer keeps the park');
});

test('the home map renders whenever there is no park, even before the first park check', () => {
  const src = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(src, /\{player && !park && permissionGranted && \(\s*<HomeExplore/);
  assert.doesNotMatch(src, /parkLoaded && !park && permissionGranted && \(\s*<HomeExplore/);
  const provider = fs.readFileSync(path.join(root, 'src/context/LocationProvider.tsx'), 'utf8');
  const requestPark = provider.slice(provider.indexOf('const requestPark = async'), provider.indexOf('// A different account'));
  assert.doesNotMatch(requestPark, /setParkState\(undefined\)|clearPark\(\)|setParkLoaded\(false\)/);
});
