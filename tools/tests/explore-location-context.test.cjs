const assert = require('node:assert/strict'), test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

test('heading ticks update only the heading context; the location value keeps its identity', async () => {
  let onHeading, watchOptions;
  const Location = {
    Accuracy: { High: 4, Highest: 5, BestForNavigation: 6 },
    getForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    watchHeadingAsync: async fn => { onHeading = fn; return { remove() {} }; },
    watchPositionAsync: async options => { watchOptions = options; return { remove() {} }; },
    getCurrentPositionAsync: async () => ({ coords: { latitude: 1, longitude: 2 } }),
  };
  const app = runtime('src/context/LocationProvider.tsx', {
    'expo-location': Location,
    rooks: { useAsyncEffect: () => undefined, useDebounce: fn => fn, useIntervalWhen: () => undefined },
    '../api/endpoints/me/current-park': { default: async () => null },
    './AuthProvider': { AuthContext: { value: { player: { id: 3, username: 'finn' }, refreshPlayer: async () => undefined } } },
    '../helpers/dev-location-store': { setDevModeEnabled() {}, setDevLocation() {} },
    './parkLookupPolicy': { shouldRefreshParkLookup: () => false },
  }, { children: 'map' }, { AppState: undefined }, { exportName: 'LocationProvider' });
  const outer = () => app.tree;
  const inner = () => app.tree.props.children;
  // Permission arrives through the AppState path in the app; grant it through the requester here.
  await outer().props.value.requestPermission(); app.render(); await app.settle();
  inner().props.value.setHeadingEnabled(true); app.render(); await app.settle();
  const before = outer().props.value;
  assert.ok(onHeading, 'heading subscription started');
  onHeading({ trueHeading: 90, magHeading: 88 }); app.render();
  onHeading({ trueHeading: 140, magHeading: 138 }); app.render();
  assert.equal(outer().props.value, before, 'location consumers do not re-render per heading sample');
  assert.ok(inner().props.value.heading > 90);
  assert.equal('heading' in before, false);
  assert.equal(watchOptions.accuracy, Location.Accuracy.High);
  assert.equal(watchOptions.distanceInterval, 3);
});
