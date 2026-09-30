const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

function loadHook({ isEnabled = true, dev = false, updates = {} } = {}) {
  const effects = [];
  const listeners = [];
  const calls = [];
  const refs = [];
  const mod = loadTs('src/hooks/useAppUpdates.ts', {
    react: {
      useRef: value => { const ref = { current: value }; refs.push(ref); return ref; },
      useEffect: fn => effects.push(fn),
    },
    'react-native': {
      AppState: { addEventListener: (event, fn) => { listeners.push(fn); return { remove: () => calls.push('remove') }; } },
    },
    'expo-updates': {
      isEnabled,
      checkForUpdateAsync: async () => { calls.push('check'); return { isAvailable: true }; },
      fetchUpdateAsync: async () => { calls.push('fetch'); return { isNew: true }; },
      reloadAsync: async () => { calls.push('reload'); },
      ...updates,
    },
  }, { __DEV__: dev });
  return { mod, effects, listeners, calls, refs };
}

test('mounting the hook never checks: the native launch check is the only one', () => {
  const { mod, effects, listeners, calls } = loadHook();
  mod.useAppUpdates();
  assert.equal(effects.length, 1);
  effects[0]();
  assert.equal(listeners.length, 1);
  listeners[0]('active');
  listeners[0]('active');
  assert.deepEqual(calls, [], 'a quick foreground after launch does not hit the update server');
});

test('a long background fetches once, never reloads, and repeated foregrounds do not loop', async () => {
  const { mod, effects, listeners, calls, refs } = loadHook();
  mod.useAppUpdates();
  effects[0]();
  refs[0].current -= mod.FOREGROUND_CHECK_INTERVAL_MS + 1;
  listeners[0]('active');
  listeners[0]('active');
  listeners[0]('background');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['check', 'fetch']);
  assert.ok(!calls.includes('reload'));
});

test('policy: throttled by interval and in-flight state', () => {
  const { mod } = loadHook();
  const h = mod.FOREGROUND_CHECK_INTERVAL_MS;
  assert.equal(mod.shouldCheckOnForeground(0, h - 1, false), false);
  assert.equal(mod.shouldCheckOnForeground(0, h, false), true);
  assert.equal(mod.shouldCheckOnForeground(0, h, true), false);
});

test('disabled updates and development builds attach nothing', () => {
  for (const options of [{ isEnabled: false }, { dev: true }]) {
    const { mod, effects, listeners } = loadHook(options);
    mod.useAppUpdates();
    effects[0]();
    assert.equal(listeners.length, 0);
  }
});

test('source has no restart prompt or in-session reload', () => {
  const source = read('src/hooks/useAppUpdates.ts');
  assert.doesNotMatch(source, /reloadAsync\(|Alert\.alert|Restart Now/);
});
