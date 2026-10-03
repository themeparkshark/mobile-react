const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
// Run with: node --test tools/tests/account-recovery.test.cjs
// Find my original account: flow model, API mapping, session switch and wiring.

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const model = loadTs('src/services/accountRecovery/model.ts');

function api(post) {
  return loadTs('src/api/endpoints/me/account-recovery.ts', { '../../client': { post } });
}
const httpError = (status, data = {}, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data, headers } });

test('identifier check accepts usernames and emails, rejects junk', () => {
  assert.equal(model.checkIdentifier('  gr8scott ').value, 'gr8scott');
  assert.equal(model.checkIdentifier('gr8scott').error, null);
  assert.equal(model.checkIdentifier('@gr8scott').error, null);
  assert.equal(model.checkIdentifier('fan@example.com').error, null);
  assert.match(model.checkIdentifier(' ').error, /username or email/);
  assert.match(model.checkIdentifier('fan@nowhere').error, /email/);
  assert.match(model.checkIdentifier('x'.repeat(256)).error, /too long/);
});

test('codes are digits only and exactly six long', () => {
  assert.equal(model.normalizeCode(' 123 456 '), '123456');
  assert.equal(model.normalizeCode('12-34-56-78'), '123456');
  assert.equal(model.isCompleteCode('12345'), false);
  assert.equal(model.isCompleteCode('123 456'), true);
});

test('every code request answer leads to the right step', () => {
  const start = model.INITIAL_RECOVERY;
  assert.deepEqual(plain(model.afterRequest(start, { kind: 'status', status: 'sent' })),
    { step: 'code', error: null, supportReason: null, screenName: null });
  assert.deepEqual(plain(model.afterRequest(start, { kind: 'status', status: 'support' })).supportReason, 'relay');
  assert.equal(model.afterRequest(start, { kind: 'status', status: 'support' }).step, 'support');
  assert.equal(model.afterRequest(start, { kind: 'status', status: 'has_progress' }).supportReason, 'progress');
  const limited = model.afterRequest(start, { kind: 'rate_limited', retryAfter: 600 });
  assert.equal(limited.step, 'identify');
  assert.match(limited.error, /Wait 10 minutes/);
  assert.match(model.afterRequest(start, { kind: 'rate_limited', retryAfter: 30 }).error, /Wait 1 minute and/);
  assert.match(model.afterRequest(start, { kind: 'failed' }).error, /connection/);
});

test('every code check answer leads to the right step', () => {
  const atCode = { ...model.INITIAL_RECOVERY, step: 'code' };
  const linked = model.afterVerify(atCode, { kind: 'linked', token: 't', playerId: 319, screenName: 'gr8scott' });
  assert.equal(linked.step, 'linked');
  assert.match(model.linkedMessage(linked.screenName), /gr8scott again/);
  assert.equal(model.afterVerify(atCode, { kind: 'invalid_code' }).step, 'code');
  assert.match(model.afterVerify(atCode, { kind: 'invalid_code' }).error, /not right/);
  assert.equal(model.afterVerify(atCode, { kind: 'expired_code' }).step, 'identify');
  assert.equal(model.afterVerify(atCode, { kind: 'no_active_code' }).step, 'identify');
  assert.equal(model.afterVerify(atCode, { kind: 'has_progress' }).supportReason, 'progress');
  assert.equal(model.afterVerify(atCode, { kind: 'needs_support' }).supportReason, 'other');
  assert.equal(model.afterVerify(atCode, { kind: 'rate_limited', retryAfter: 900 }).step, 'code');
  assert.match(model.afterVerify(atCode, { kind: 'failed' }).error, /connection/);
  assert.equal(model.noCode(atCode).step, 'support');
  assert.equal(model.noCode(atCode).supportReason, 'no_code');
});

test('support copy gives the new player id and the mail is prefilled for support', () => {
  assert.match(model.supportMessage('relay', 2051), /Hide My Email.*#2051\./s);
  assert.doesNotMatch(model.supportMessage('progress', null), /#/);
  const url = model.recoverySupportMailto('contact@themeparkshark.com', { playerId: 2051, typedIdentifier: 'gr8scott', reason: 'no_code' });
  assert.match(url, /^mailto:contact@themeparkshark\.com\?subject=Bring%20back%20my%20original%20account&body=/);
  const body = decodeURIComponent(url.split('body=')[1]);
  assert.match(body, /My new player ID: #2051/);
  assert.match(body, /My old username or email: gr8scott/);
});

test('copy has no em dashes and ribbon titles fit the ribbon', () => {
  const all = [...Object.values(model.RECOVERY_COPY), ...['relay', 'progress', 'no_code', 'other'].map(r => model.supportMessage(r, 1))];
  for (const text of all) assert.equal(text.includes('—'), false, text);
  for (const key of ['identifyTitle', 'codeTitle', 'supportTitle', 'linkedTitle']) {
    assert.ok(model.RECOVERY_COPY[key].length <= 22, key);
  }
});

test('code request maps server answers and never throws', async () => {
  let reply;
  const calls = [];
  const { requestRecoveryCode } = api(async (url, body, config) => {
    calls.push([url, plain(body), config.timeout]);
    if (reply instanceof Error) throw reply;
    return { data: reply };
  });
  reply = { data: { status: 'sent' } };
  assert.deepEqual(plain(await requestRecoveryCode('gr8scott')), { kind: 'status', status: 'sent' });
  assert.deepEqual(calls[0], ['/me/account-recovery/request', { identifier: 'gr8scott' }, 15000]);
  reply = { data: { status: 'has_progress' } };
  assert.equal((await requestRecoveryCode('x@y.com')).status, 'has_progress');
  reply = { data: { status: 'linked' } };
  assert.equal((await requestRecoveryCode('x@y.com')).kind, 'failed');
  reply = '<html>down</html>';
  assert.equal((await requestRecoveryCode('x@y.com')).kind, 'failed');
  reply = httpError(429, { retry_after: 120 });
  assert.deepEqual(plain(await requestRecoveryCode('x@y.com')), { kind: 'rate_limited', retryAfter: 120 });
  reply = httpError(500);
  assert.equal((await requestRecoveryCode('x@y.com')).kind, 'failed');
});

test('code check maps the link, every error code and network failures', async () => {
  let reply;
  const { verifyRecoveryCode } = api(async (url, body) => {
    assert.equal(url, '/me/account-recovery/verify');
    assert.deepEqual(plain(body), { code: '123456' });
    if (reply instanceof Error) throw reply;
    return { data: reply };
  });
  reply = { data: { status: 'linked', player: { id: 319, screen_name: 'gr8scott', token: '9|abc' } } };
  assert.deepEqual(plain(await verifyRecoveryCode('123456')), { kind: 'linked', token: '9|abc', playerId: 319, screenName: 'gr8scott' });
  reply = { data: { status: 'linked', player: { id: 319, token: '' } } };
  assert.equal((await verifyRecoveryCode('123456')).kind, 'failed');
  for (const [status, code, kind] of [
    [422, 'INVALID_CODE', 'invalid_code'], [422, 'EXPIRED_CODE', 'expired_code'], [422, 'NO_ACTIVE_CODE', 'no_active_code'],
    [409, 'HAS_PROGRESS', 'has_progress'], [409, 'NEEDS_SUPPORT', 'needs_support'], [422, 'SOMETHING_NEW', 'failed'],
  ]) {
    reply = httpError(status, { code });
    assert.equal((await verifyRecoveryCode('123456')).kind, kind, code);
  }
  reply = httpError(429, {}, { 'retry-after': '45' });
  assert.deepEqual(plain(await verifyRecoveryCode('123456')), { kind: 'rate_limited', retryAfter: 45 });
  reply = new Error('Network Error');
  assert.equal((await verifyRecoveryCode('123456')).kind, 'failed');
});

function provider({ me } = {}) {
  const events = [];
  const client = { defaults: { headers: { common: { Authorization: 'Bearer old-session' } } }, get: async () => ({}) };
  const output = ts.transpileModule(read('src/context/AuthProvider.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const mocks = {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    react: {
      createContext: () => ({ Provider: 'provider' }),
      useState: value => [value, next => events.push(['state', typeof next === 'object' && next ? next.id ?? next : next])],
      useRef: value => ({ current: value }),
      useEffect() {},
    },
    rooks: { useAsyncEffect() {} },
    'expo-secure-store': { async setItemAsync(key, value) { events.push(['saveToken', value]); }, async deleteItemAsync() { events.push(['deleteToken']); } },
    '@react-native-async-storage/async-storage': { async setItem() { events.push(['cachePlayer']); }, async removeItem() {} },
    '../api/client': client,
    '../api/endpoints/auth/login': async () => ({}),
    '../api/endpoints/me/me': me,
    '../RootNavigation': { navigate: route => events.push(['navigate', route]) },
    '../services/lineplay/backgroundQueueHeartbeat': { async clearQueueBackgroundHeartbeat() {} },
    '../utils/apiCache': { async clearCache() { events.push(['clearAccountCache']); } },
    '../utils/standalonePreview': { isStandalonePreviewMode: () => false },
    '../screens/LeaderboardsScreen/standingsCache': { endStandingsSession: () => undefined },
    '../screens/SetCollection/dexCache': { clearBook() {} },
    '../services/push': { refreshPushRegistration: async () => undefined, listenForPushTaps: () => () => undefined },
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, __DEV__: false, process: { env: {} }, console,
    require(name) { if (name in mocks) return mocks[name]; throw new Error(`Unexpected dependency: ${name}`); },
  });
  return { auth: module.exports.AuthProvider({ children: null }).props.value, events, client };
}

test('adoptSession validates the new session, drops the old cache, and can hold navigation', async () => {
  const seen = [];
  const { auth, events, client } = provider({ me: async options => { seen.push(options.token); return { id: 319, username: 'gr8scott' }; } });
  const adopted = await auth.adoptSession('9|original', { navigate: false });
  assert.equal(adopted.id, 319);
  assert.deepEqual(seen, ['9|original']);
  assert.equal(client.defaults.headers.common.Authorization, 'Bearer 9|original');
  assert.deepEqual(events.filter(([kind]) => kind !== 'state'), [['clearAccountCache'], ['saveToken', '9|original'], ['cachePlayer']]);

  const second = provider({ me: async () => ({ id: 319, username: 'gr8scott' }) });
  await second.auth.adoptSession('9|original');
  assert.deepEqual(second.events.filter(([kind]) => kind === 'navigate'), [['navigate', 'Loading']]);
});

test('adoptSession saves nothing when the new session cannot be verified', async () => {
  const { auth, events, client } = provider({ me: async () => { throw new Error('offline'); } });
  await assert.rejects(auth.adoptSession('9|original'), /offline/);
  await assert.rejects(auth.adoptSession('  '), /No session/);
  assert.deepEqual(events, []);
  assert.equal(client.defaults.headers.common.Authorization, 'Bearer old-session');
});

test('the flow is offered after first sign-in and in Settings, with the UI kit only', () => {
  const welcome = read('src/screens/WelcomeScreen.tsx');
  const settings = read('src/screens/SettingsScreen.tsx');
  const dialog = read('src/components/FindOriginalAccount.tsx');
  assert.match(welcome, /<FindOriginalAccount visible=\{findingOriginal\}/);
  assert.match(welcome, /RECOVERY_COPY\.welcomeLink/);
  assert.match(settings, /<FindOriginalAccount visible=\{findingOriginal\}/);
  assert.match(settings, /title=\{RECOVERY_COPY\.entryDetail\}/);
  assert.match(dialog, /<GameDialog/);
  assert.match(dialog, /<GameButton/);
  assert.doesNotMatch(dialog, /Alert\.alert|ActivityIndicator|react-native-svg/);
  // The new account is merged away on a link, so the dialog switches sessions before celebrating.
  assert.match(dialog, /adoptSession\(result\.token, \{ navigate: false \}\)/);
});
