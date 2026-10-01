const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

// Jenn (Disneyland, 1.6.0): "my shark wasn't moving with me until I force-closed
// the app". expo-location ends the iOS stream for good on any CoreLocation error
// and only reports it through watchPositionAsync's error callback, which the
// provider never passed, so the shark froze until relaunch.
function mount() {
  const watchers = [], appStateListeners = [];
  const Location = {
    Accuracy: { High: 4, Highest: 5, BestForNavigation: 6 },
    getForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    watchHeadingAsync: async () => ({ remove() {} }),
    watchPositionAsync: async (options, onLocation, onError) => {
      const sub = { options, onLocation, onError, removed: false, remove() { this.removed = true; } };
      watchers.push(sub);
      return sub;
    },
    getCurrentPositionAsync: async () => ({ coords: { latitude: 1, longitude: 2 } }),
  };
  const app = runtime('src/context/LocationProvider.tsx', {
    'expo-location': Location,
    'react-native': {
      Platform: { OS: 'ios' }, Linking: { openURL: async () => undefined },
      AppState: { currentState: 'active', addEventListener: (_, fn) => { appStateListeners.push(fn); return { remove() {} }; } },
    },
    rooks: { useAsyncEffect: () => undefined, useDebounce: fn => fn, useIntervalWhen: () => undefined },
    '../api/endpoints/me/current-park': { default: async () => null },
    './AuthProvider': { AuthContext: { value: { player: { id: 16, username: 'thedoc' }, refreshPlayer: async () => undefined } } },
    '../helpers/dev-location-store': { setDevModeEnabled() {}, setDevLocation() {} },
    './parkLookupPolicy': { shouldRefreshParkLookup: () => false },
  }, { children: 'map' }, {
    setInterval: () => 0, clearInterval() {},
    console: { ...console, warn() {}, error() {} },
  }, { exportName: 'LocationProvider' });
  const flushTimers = async () => {
    for (const [id, fn] of [...app.timers]) { app.timers.delete(id); fn(); app.render(); await app.settle(); }
  };
  return { app, watchers, appStateListeners, flushTimers, value: () => app.tree.props.value };
}

test('a CoreLocation error restarts the GPS watcher instead of freezing the shark', async () => {
  const { app, watchers, flushTimers, value } = mount();
  await value().requestPermission(); app.render(); await app.settle();
  assert.equal(watchers.length, 1, 'watcher starts once permission is granted');
  assert.equal(typeof watchers[0].onError, 'function', 'an error handler is registered');

  watchers[0].onError('kCLErrorLocationUnknown');
  app.render(); await app.settle();
  assert.equal(watchers[0].removed, true, 'the dead stream is released');
  await flushTimers();
  assert.equal(watchers.length, 2, 'a fresh watcher replaces the dead one');
  assert.equal(watchers[1].removed, false);

  watchers[1].onLocation({ coords: { latitude: 33.81, longitude: -117.92, accuracy: 5, speed: 1 }, timestamp: 1 });
  app.render(); await app.settle();
  assert.deepEqual({ ...value().location }, { latitude: 33.81, longitude: -117.92 }, 'the shark moves again');
});

test('returning to the foreground restarts the watcher iOS may have paused', async () => {
  const { app, watchers, appStateListeners, value } = mount();
  await value().requestPermission(); app.render(); await app.settle();
  assert.equal(watchers.length, 1);
  appStateListeners.forEach(fn => fn('background'));
  appStateListeners.forEach(fn => fn('active'));
  app.render(); await app.settle();
  assert.equal(watchers[0].removed, true);
  assert.equal(watchers.length, 2);
  assert.equal(watchers[1].removed, false);
});

test('the map pauses its compass and idle loops while its screen is not focused', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/Map.tsx'), 'utf8');
  assert.match(src, /useFocusEffect\(useCallback\(\(\) => \{\s*setScreenFocused\(true\);\s*setHeadingEnabled\(true\);\s*return \(\) => \{ setScreenFocused\(false\); setHeadingEnabled\(false\); \};/);
  assert.match(src, /if \(reducedMotion \|\| !screenFocused\)/);
});
