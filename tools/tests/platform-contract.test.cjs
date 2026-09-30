const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// Backend platform contract (WS1): App-Version header, 426/429 answers,
// feature flags, VIP sync, account deletion and the Apple authorization code.
// Run with: node --test tools/tests/platform-contract.test.cjs
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file, mocks) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return module.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));

function platform({ nativeVersion, configVersion } = {}) {
  return load('src/api/platform.ts', {
    'expo-application': { nativeApplicationVersion: nativeVersion },
    'expo-constants': { __esModule: true, default: { expoConfig: configVersion === undefined ? undefined : { version: configVersion } } },
  });
}

test('App-Version comes from the native build, falls back to app config, and is omitted when unreadable', () => {
  assert.deepEqual(plain(platform({ nativeVersion: '1.6.0', configVersion: '1.5.0' }).appVersionHeaders()), { 'App-Version': '1.6.0' });
  assert.deepEqual(plain(platform({ nativeVersion: null, configVersion: ' 1.6.1 ' }).appVersionHeaders()), { 'App-Version': '1.6.1' });
  assert.deepEqual(plain(platform({ nativeVersion: 'dev build', configVersion: undefined }).appVersionHeaders()), {});
  assert.equal(platform({ nativeVersion: '1.6.0.12' }).appVersion(), '1.6.0.12');
});

test('426 and 429 answers become actionable platform errors; everything else is left alone', () => {
  const { platformError } = platform({ nativeVersion: '1.6.0' });

  const update = platformError({ response: { status: 426, data: {
    code: 'APP_UPDATE_REQUIRED', message: 'Update the app to keep playing.', app_store_url: 'https://apps.apple.com/app/id1', min_app_version: '1.7.0',
  } } });
  assert.deepEqual(plain(update), {
    kind: 'update_required', message: 'Update the app to keep playing.', appStoreUrl: 'https://apps.apple.com/app/id1', minAppVersion: '1.7.0',
  });

  const bare = platformError({ response: { status: 426, data: '<html>' } });
  assert.equal(bare.kind, 'update_required');
  assert.match(bare.message, /Update the app/);
  assert.equal(bare.appStoreUrl, null);

  const limited = platformError({ response: { status: 429, data: { code: 'RATE_LIMITED' }, headers: { 'retry-after': '17' } } });
  assert.deepEqual(plain(limited), { kind: 'rate_limited', message: 'Too many requests. Wait a moment and try again.', retryAfterSeconds: 17 });
  assert.equal(platformError({ response: { status: 429, data: {}, headers: { 'retry-after': '9999' } } }).retryAfterSeconds, 120);
  assert.equal(platformError({ response: { status: 429, data: {} } }).retryAfterSeconds, 5);

  assert.equal(platformError({ response: { status: 500, data: {} } }), null);
  assert.equal(platformError(new Error('Network Error')), null);
  assert.equal(platformError(null), null);
});

test('platform copy has no emoji or em dashes', () => {
  const source = fs.readFileSync(path.join(root, 'src/api/platform.ts'), 'utf8');
  assert.doesNotMatch(source, /\p{Extended_Pictographic}/u);
  assert.doesNotMatch(source, /—/);
});

test('feature flags are read with a bounded timeout and a malformed answer rejects', async () => {
  let data = { data: { flags: { adventure_ticket: false, queue_tickets: true }, min_app_version: '1.6.0', update_required: false, app_store_url: 'x' } };
  const getFeatureFlags = load('src/api/endpoints/platform/feature-flags.ts', {
    '../../client': { async get(url, config) {
      assert.equal(url, '/feature-flags');
      assert.equal(config.timeout, 8000);
      assert.deepEqual(plain(config.headers), { 'App-Version': '1.6.0' });
      return { data };
    } },
    '../../platform': { appVersionHeaders: () => ({ 'App-Version': '1.6.0' }) },
  }).default;

  const flags = await getFeatureFlags();
  assert.equal(flags.flags.queue_tickets, true);
  assert.equal(flags.flags.adventure_ticket, false);

  for (data of [{}, { data: { flags: null } }, '<html>']) {
    await assert.rejects(getFeatureFlags(), /malformed/);
  }
});

test('VIP sync posts once and trusts only a well-formed server answer', async () => {
  const calls = [];
  let data = { data: { subscribed: true, synced: true } };
  let failure;
  const syncVip = load('src/api/endpoints/me/vip-sync.ts', {
    '../../client': { async post(url, body, config) {
      calls.push([url, body, config.timeout]);
      if (failure) throw failure;
      return { data };
    } },
  }).default;

  assert.deepEqual(plain(await syncVip()), { subscribed: true, synced: true });
  assert.deepEqual(plain(calls), [['/me/vip/sync', null, 15000]]);
  data = { data: { subscribed: false } };
  assert.deepEqual(plain(await syncVip()), { subscribed: false, synced: false });
  data = { data: {} };
  await assert.rejects(syncVip(), /malformed/);
  failure = Object.assign(new Error('unavailable'), { response: { status: 503, data: { code: 'VIP_SYNC_UNAVAILABLE' } } });
  await assert.rejects(syncVip(), error => error === failure);
});

test('immediate deletion opts in explicitly, sends App-Version and the Apple code, and rejects anything unconfirmed', async () => {
  const calls = [];
  let data = { data: { deleted: true, apple_revoke_queued: true, subscription_notice: ' Cancel in Settings. ' } };
  let failure;
  const deleteNow = load('src/api/endpoints/me/delete-account.ts', {
    '../../client': { async delete(url, config) {
      calls.push([url, config.data, config.headers, config.timeout]);
      if (failure) throw failure;
      return { data };
    } },
    '../../platform': { appVersionHeaders: () => ({ 'App-Version': '1.6.0' }) },
  }).default;

  assert.deepEqual(plain(await deleteNow('apple-code')), { deleted: true, appleRevokeQueued: true, subscriptionNotice: 'Cancel in Settings.' });
  data = { data: { deleted: true, apple_revoke_queued: false, subscription_notice: null } };
  assert.deepEqual(plain(await deleteNow()), { deleted: true, appleRevokeQueued: false, subscriptionNotice: null });
  assert.deepEqual(plain(calls), [
    ['/me/force-delete', { mode: 'immediate', authorization_code: 'apple-code' }, { 'App-Version': '1.6.0' }, 15000],
    ['/me/force-delete', { mode: 'immediate' }, { 'App-Version': '1.6.0' }, 15000],
  ]);

  // A 204 (the email flow) or anything else is not a deletion.
  for (data of ['', {}, { data: { deleted: false } }, '<html>']) {
    await assert.rejects(deleteNow(), /not confirmed/);
  }
  failure = Object.assign(new Error('rate limited'), { response: { status: 429 } });
  await assert.rejects(deleteNow(), error => error === failure);
});

test('the shipped email-confirm client is unchanged: no body, no mode, resolves on 204', async () => {
  const calls = [];
  const forceDelete = load('src/api/endpoints/me/force-delete.ts', {
    '../../client': { async delete(...args) { calls.push(args); return { status: 204, data: '' }; } },
  }).default;

  assert.equal(await forceDelete(), undefined);
  assert.deepEqual(calls, [['/me/force-delete']]);
});

test('login forwards the Apple authorization code only when it exists', async () => {
  const bodies = [];
  const login = load('src/api/endpoints/auth/login.ts', {
    '../../client': { async post(url, body) {
      bodies.push(body);
      return { data: { data: { token: 'session' } } };
    } },
  }).default;

  await login('apple-user', 'identity');
  await login('apple-user', 'identity', null);
  await login('apple-user', 'identity', 'one-time-code');
  assert.deepEqual(plain(bodies), [
    { user: 'apple-user', identity_token: 'identity' },
    { user: 'apple-user', identity_token: 'identity' },
    { user: 'apple-user', identity_token: 'identity', authorization_code: 'one-time-code' },
  ]);
});
