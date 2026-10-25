// Hotfix wave 3 round 2: a slow network at launch must never strand a kid on the Loading screen.
// Root cause found on device: AuthProvider moves a signed-in player Splash -> Loading -> map by
// itself. When the copy (/crumbs) answered after that, Splash (still mounted at the bottom of the
// stack) fired navigate('Loading'), which popped the map back to a Loading screen that had already
// used its one navigate. The kid sat on a full bar for good (warmup-9dd03501-shared8010-load500 run 3).
const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

function harness() {
  const nav = [];
  const state = { focused: true };
  const auth = { value: { isReady: false, player: null } };
  const crumbs = { value: { crumbsLoaded: false } };
  let onceFired = new Set();
  const rooks = {
    useEffectOnceWhen(fn, when) { const key = fn.toString(); if (when && !onceFired.has(key)) { onceFired.add(key); fn(); } },
    useAsyncEffect() {},
    useTimeoutWhen(fn, ms, when) { if (when) state.timeouts.push({ fn, ms }); },
  };
  state.timeouts = [];
  const common = {
    '@react-navigation/native': { useIsFocused: () => state.focused },
    'rooks': rooks,
    '../RootNavigation': { navigate: (name) => nav.push(name) },
    '../context/AuthProvider': { AuthContext: auth },
    '../context/CrumbProvider': { CrumbContext: crumbs },
    '../context/ThemeProvider': { ThemeContext: { value: { theme: null } } },
    '../context/LocationProvider': { LocationStatusContext: { value: { requestPark: async () => {}, parkLoaded: true, permissionGranted: false } } },
    '../hooks/useCrumbs': { default: () => ({ labels: {} }) },
    '../components/Progress': { default: 'Progress' },
    'expo-av': { ResizeMode: { COVER: 'cover' }, Video: 'Video' },
    'lodash': { sample: list => list?.[0] },
    '../services/push': { openColdStartPush() {} },
  };
  return { nav, state, auth, crumbs, common };
}

test('Splash does not navigate from under the map when the copy arrives late', () => {
  const h = harness();
  const view = runtime('src/screens/SplashScreen.tsx', h.common, {});
  // Signed in on a slow network: AuthProvider already moved the player on, Splash is not on top.
  h.auth.value = { isReady: true, player: { id: 1, username: 'Kid' } };
  h.state.focused = false;
  view.render();
  h.crumbs.value = { crumbsLoaded: true }; // /crumbs answers late
  view.render();
  assert.deepEqual(h.nav, [], 'Splash stays quiet: the kid keeps the map');
});

test('Splash still moves a signed-out or first-launch player on once it is on top and ready', () => {
  const h = harness();
  const view = runtime('src/screens/SplashScreen.tsx', h.common, {});
  h.auth.value = { isReady: true, player: null };
  h.crumbs.value = { crumbsLoaded: true };
  view.render();
  assert.deepEqual(h.nav, ['Login']);
  h.auth.value = { isReady: true, player: { id: 2, username: 'Kid' } };
  view.render();
  assert.deepEqual(h.nav, ['Login'], 'only once');
});

test('Loading sends the player on again if anything brings it back to the top', () => {
  const h = harness();
  h.auth.value = { isReady: true, player: { id: 1, username: 'Kid' } };
  const view = runtime('src/screens/LoadingScreen.tsx', h.common, {});
  // The 5 s safety net (or the full bar) sends the player to the map once.
  const safety = h.state.timeouts.find(t => t.ms === 5000);
  assert.ok(safety, 'the safety net is armed for a ready player');
  safety.fn();
  assert.deepEqual(h.nav, ['Explore']);
  // The map covers Loading, then something navigates back to Loading.
  h.state.focused = false; view.render();
  h.state.focused = true; view.render();
  assert.deepEqual(h.nav, ['Explore', 'Explore'], 'back on the map, not stuck on a full bar');
  // A second safety-net fire for the same visit does nothing extra.
  safety.fn();
  assert.deepEqual(h.nav, ['Explore', 'Explore']);
});

test('Loading does not jump ahead on first mount or for a player with no name yet', () => {
  const h = harness();
  h.auth.value = { isReady: true, player: { id: 1, username: null } };
  const view = runtime('src/screens/LoadingScreen.tsx', h.common, {});
  assert.deepEqual(h.nav, ['Welcome']);
  h.state.focused = false; view.render();
  h.state.focused = true; view.render();
  assert.deepEqual(h.nav, ['Welcome'], 'no username: Welcome owns the next step');
});
