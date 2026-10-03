const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// Run with: node --test tools/tests/auth-login.test.cjs
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const jsx = (type, props) => ({ type, props });
function load(file, mocks) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, __DEV__: false,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
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
function provider({ login, me, failCache = false, apiCheck } = {}) {
  const events = [];
  const client = {
    defaults: { headers: { common: {} } },
    get: apiCheck || (async (url, config) => {
      assert.equal(url, '/crumbs');
      assert.equal(config.timeout, 10000);
      return { data: { data: { labels: {}, errors: {} } } };
    }),
  };
  const exports = load('src/context/AuthProvider.tsx', {
    react: {
      createContext: () => ({ Provider: 'provider' }),
      useState: value => [value, value => events.push(['state', value])],
      useRef: value => ({ current: value }),
      useEffect() {},
    },
    rooks: { useAsyncEffect() {} },
    'expo-secure-store': {
      async setItemAsync() { events.push(['saveToken']); },
      async deleteItemAsync() { events.push(['deleteToken']); },
    },
    '@react-native-async-storage/async-storage': {
      async setItem() { events.push(['cachePlayer']); if (failCache) throw new Error('cache unavailable'); },
      async removeItem() { events.push(['removePlayer']); },
    },
    '../api/client': client,
    '../api/endpoints/auth/login': login || (async () => ({ token: 'test-session' })),
    '../api/endpoints/me/me': me || (async () => ({ id: 1, username: 'test-player' })),
    '../RootNavigation': { navigate: route => events.push(['navigate', route]) },
    '../services/lineplay/backgroundQueueHeartbeat': {
      async clearQueueBackgroundHeartbeat() { events.push(['stopQueue']); },
    },
    '../utils/apiCache': {
      async clearCache() { events.push(['clearAccountCache']); },
    },
    '../utils/standalonePreview': { isStandalonePreviewMode: () => false },
    // Standings v2: sign-out and account switches drop every cached board.
    '../screens/LeaderboardsScreen/standingsCache': { endStandingsSession: () => events.push(['standings-session-ended']) },
    '../services/push': {
      refreshPushRegistration: async () => undefined,
      listenForPushTaps: () => () => undefined,
    },
  });
  return { auth: exports.AuthProvider({ children: null }).props.value, events, client };
}
const credential = { user: 'test-user', identityToken: 'test-identity' };
test('login request is bounded and rejects missing token or HTTP failure', async () => {
  let data = { data: { token: 'test-session' } };
  let failure;
  const login = load('src/api/endpoints/auth/login.ts', {
    '../../client': { async post(url, body, config) {
      assert.equal(url, '/auth/login'); assert.equal(config.timeout, 15000);
      assert.equal(body.user, 'test-user');
      if (failure) throw failure;
      return { data };
    } },
  }).default;
  assert.equal((await login('test-user', 'test-identity')).token, 'test-session');
  for (data of [{ data: {} }, { data: { token: '' } }, '<html>unavailable</html>']) {
    await assert.rejects(login('test-user', 'test-identity'), /session/);
  }
  failure = Object.assign(new Error('unavailable'), { response: { status: 522 } });
  await assert.rejects(login('test-user', 'test-identity'), error => error === failure);
});
test('strict profile fetch uses candidate token, times out, and rejects malformed or failed response', async () => {
  let data = { data: { id: 1, username: 'test-player' } };
  let failure;
  const me = load('src/api/endpoints/me/me.ts', {
    '../../client': { async get(url, config) {
      assert.equal(url, '/me'); assert.equal(config.timeout, 15000);
      if (config.headers) assert.equal(config.headers.Authorization, 'Bearer test-session');
      if (failure) throw failure;
      return { data };
    } },
  }).default;
  assert.equal((await me({ token: 'test-session', throwOnError: true })).id, 1);
  data = '<html>unavailable</html>';
  await assert.rejects(me({ throwOnError: true }), /profile/);
  failure = new Error('timeout');
  await assert.rejects(me({ throwOnError: true }), error => error === failure);
  assert.equal(await me(), null);
});
test('Apple credential and backend failures stay rejected without saving or navigating', async () => {
  let calls = 0;
  const failure = new Error('server unavailable');
  const { auth, events } = provider({ login: async () => { calls++; throw failure; } });
  await assert.rejects(auth.login({ user: 'test-user', identityToken: null }), /credential/);
  assert.equal(calls, 0);
  await assert.rejects(auth.login(credential), error => error === failure);
  assert.deepEqual(events, []);
});
test('a non-app API response blocks Apple token transmission', async () => {
  let loginCalls = 0;
  const { auth, events } = provider({
    apiCheck: async () => ({ data: '<html>unrelated website</html>' }),
    login: async () => { loginCalls++; return { token: 'should-not-be-issued' }; },
  });
  await assert.rejects(auth.login(credential), /sign-in service is unavailable/);
  assert.equal(loginCalls, 0);
  assert.deepEqual(events, []);
});
test('profile failure after Apple succeeds does not save a token or navigate', async () => {
  const { auth, events, client } = provider({ me: async () => { throw new Error('profile unavailable'); } });
  await assert.rejects(auth.login(credential), /profile unavailable/);
  assert.deepEqual(events, []);
  assert.equal(client.defaults.headers.common.Authorization, undefined);
});
test('session is committed only after profile resolves and existing user navigates once', async () => {
  const pending = deferred();
  const { auth, events, client } = provider({ me: () => pending.promise });
  const result = auth.login(credential);
  await Promise.resolve();
  assert.deepEqual(events, []);
  pending.resolve({ id: 1, username: 'test-player' });
  await result;
  assert.deepEqual(events.slice(0, 2), [['saveToken'], ['cachePlayer']]);
  assert.deepEqual(events.filter(e => e[0] === 'navigate'), [['navigate', 'Loading']]);
  assert.equal(client.defaults.headers.common.Authorization, 'Bearer test-session');
});
test('new user navigates to Welcome and cache failure removes uncommitted token', async () => {
  const newcomer = provider({ me: async () => ({ id: 2, username: null }) });
  await newcomer.auth.login(credential);
  assert.deepEqual(newcomer.events.filter(e => e[0] === 'navigate'), [['navigate', 'Welcome']]);
  const failure = provider({ failCache: true });
  await assert.rejects(failure.auth.login(credential), /cache unavailable/);
  assert.deepEqual(failure.events, [['saveToken'], ['cachePlayer'], ['deleteToken']]);
  assert.equal(failure.client.defaults.headers.common.Authorization, undefined);
});
test('logging out stops queue tracking before clearing the account session', async () => {
  const { auth, events, client } = provider();
  client.defaults.headers.common.Authorization = 'Bearer old-session';
  await auth.logout();
  assert.deepEqual(events.filter(event => ['stopQueue', 'removePlayer', 'deleteToken',
    'clearAccountCache', 'navigate'].includes(event[0])), [
    ['stopQueue'], ['removePlayer'], ['deleteToken'], ['clearAccountCache'], ['navigate', 'Login'],
  ]);
  assert.equal(client.defaults.headers.common.Authorization, undefined);
});
function button({ apple, login, crumbs = { labels: {}, warnings: {} } }) {
  const states = [], alerts = [];
  const Component = load('src/components/SignInButtons.tsx', {
    react: { useContext: () => ({ login }), useState: initial => [initial, value => states.push(value)], useRef: value => ({ current: value }) },
    'react-native': { View: 'view', Text: 'text', ActivityIndicator: 'spinner', Alert: { alert: (...args) => alerts.push(args) } },
    'expo-blur': { BlurView: 'blur' },
    'expo-apple-authentication': { AppleAuthenticationButton: 'apple', AppleAuthenticationButtonType: { SIGN_IN: 0 }, AppleAuthenticationButtonStyle: { BLACK: 0 }, AppleAuthenticationScope: { EMAIL: 0 }, signInAsync: apple },
    '../context/AuthProvider': { AuthContext: {} },
    '../hooks/useCrumbs': () => crumbs,
    '../ui': { gameAlert: (title, message) => alerts.push([title, message]), SharkLoader: 'loader' },
    './signInErrors': load('src/components/signInErrors.ts', {}),
  }).default;
  const tree = Component({});
  return { press: tree.props.children.props.children[0].props.onPress, states, alerts };
}
test('button awaits backend, suppresses duplicate presses, shows friendly failure, and allows retry', async () => {
  let appleCalls = 0;
  const pending = deferred();
  const result = button({ apple: async () => { appleCalls++; return credential; }, login: () => pending.promise });
  const first = result.press();
  await Promise.resolve();
  await result.press();
  assert.equal(appleCalls, 1);
  assert.deepEqual(result.states, [true]);
  pending.reject(new Error('internal server details must not appear'));
  await first;
  assert.deepEqual(result.states, [true, false]);
  assert.equal(result.alerts[0][0], "Couldn't sign in");
  assert.match(result.alerts[0][1], /try again/);
  assert.doesNotMatch(result.alerts[0][1], /internal/);
  await result.press();
  assert.equal(appleCalls, 2);
});
test('Apple cancellation is silent and missing crumb/error data still gets fallback alert', async () => {
  const canceled = button({ apple: async () => { throw { code: 'ERR_REQUEST_CANCELED' }; } });
  await canceled.press();
  assert.deepEqual(canceled.alerts, []);
  assert.deepEqual(canceled.states, [true, false]);
  const unavailable = button({ apple: async () => { throw null; }, crumbs: {} });
  await unavailable.press();
  assert.deepEqual(unavailable.alerts, [["Couldn't sign in", 'Please try again.']]);
});
test('the Apple authorization code reaches the login request so deletion can revoke the grant', async () => {
  const seen = [];
  const { auth } = provider({ login: async (...args) => { seen.push(args); return { token: 'test-session' }; } });
  await auth.login({ ...credential, authorizationCode: 'apple-code' });
  await auth.login(credential);
  assert.deepEqual(seen.map(args => args[2]), ['apple-code', undefined]);
});
