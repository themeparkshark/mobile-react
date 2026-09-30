const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { root, read } = require('./helpers/load-ts.cjs');
const target = require(path.join(root, 'tools/check-api-target.cjs'));

const response = (status, body, contentType = 'application/json') => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: name => (name.toLowerCase() === 'content-type' ? contentType : null) },
  json: async () => body,
});
const CRUMBS = { data: { labels: {}, errors: {} } };

test('store builds reject tunnels, localhost, private networks, plain HTTP and the dead dev host', () => {
  for (const bad of [
    'https://jackets-gap-families-country.trycloudflare.com/api',
    'https://abc123.ngrok-free.app/api',
    'https://abc.ngrok.io/api',
    'https://x.loca.lt/api',
    'https://localhost:8010/api',
    'https://127.0.0.1/api',
    'https://192.168.1.20/api',
    'https://10.0.0.4/api',
    'https://172.20.1.1/api',
    'https://[::1]/api',
    'https://mac.local/api',
    'http://tps-api.on-forge.com/api',
    'https://dev-app.themeparkshark.com/api',
    '',
    'not a url',
  ]) {
    assert.notEqual(target.storeUrlProblem(bad), null, bad);
  }
  assert.equal(target.storeUrlProblem('https://tps-api.on-forge.com/api'), null);
  assert.equal(target.storeUrlProblem('https://172.32.0.1/api'), null);
});

test('every store profile in eas.json points at a store-safe host and pins an Xcode 26 image', () => {
  const eas = JSON.parse(read('eas.json'));
  assert.equal(eas.cli.appVersionSource, 'remote');
  for (const name of Object.keys(eas.build)) {
    const profile = target.resolveProfile(eas.build, name);
    assert.match(profile.ios.image || '', /-xcode-2[6-9]\./, `${name} must pin an Xcode 26+ image`);
    assert.notEqual(profile.ios.image, 'latest', name);
    assert.equal(profile.developmentClient, undefined, `${name}: expo-dev-client is not installed`);
    if (target.isStoreProfile(profile)) {
      assert.equal(target.storeUrlProblem(profile.env.API_URL), null, name);
      assert.equal(profile.autoIncrement, true, `${name} must auto-increment the build number`);
    } else {
      assert.equal(profile.env?.API_URL, undefined, `${name} must not bake a dev API host`);
    }
  }
  assert.ok(target.isStoreProfile(target.resolveProfile(eas.build, 'testflight')));
  assert.ok(target.isStoreProfile(target.resolveProfile(eas.build, 'production')));
});

test('extends merges env and ios with the child winning', () => {
  const profiles = {
    base: { distribution: 'store', env: { API_URL: 'https://a.example.com/api', X: '1' }, ios: { image: 'img-a', resourceClass: 'm' } },
    child: { extends: 'base', env: { API_URL: 'https://b.example.com/api' }, ios: { image: 'img-b' } },
  };
  const resolved = target.resolveProfile(profiles, 'child');
  assert.deepEqual({ ...resolved.env }, { API_URL: 'https://b.example.com/api', X: '1' });
  assert.deepEqual({ ...resolved.ios }, { image: 'img-b', resourceClass: 'm' });
  assert.throws(() => target.resolveProfile({ a: { extends: 'a' } }, 'a'), /circular/);
});

test('the live probe requires crumbs and a 401 from the core-loop routes', async () => {
  const calls = [];
  const deployed = async url => {
    calls.push(url);
    return url.endsWith('/crumbs') ? response(200, CRUMBS) : response(401, { message: 'Unauthenticated.' });
  };
  await target.verifyLiveTarget('https://api.example.com/api/', deployed);
  assert.deepEqual(calls, [
    'https://api.example.com/api/crumbs',
    ...target.CORE_LOOP_PROBES.map(p => `https://api.example.com/api${p}`),
  ]);

  const oldServer = async url => (url.endsWith('/crumbs') ? response(200, CRUMBS) : response(404, {}));
  await assert.rejects(target.verifyLiveTarget('https://api.example.com/api', oldServer), /trip-goal returned HTTP 404, expected 401/);

  const htmlPage = async () => response(200, '<html>', 'text/html');
  await assert.rejects(target.verifyLiveTarget('https://api.example.com/api', htmlPage), /content type text\/html/);
});

test('checkProfile fails a tunnel before any network call and skips dev profiles', async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; return response(200, CRUMBS); };
  const easJson = { build: {
    tunnel: { distribution: 'store', env: { API_URL: 'https://jackets-gap-families-country.trycloudflare.com/api' }, ios: {} },
    dev: { distribution: 'internal', ios: { simulator: true, buildConfiguration: 'Debug' } },
    devBaked: { distribution: 'internal', env: { API_URL: 'https://dev-app.themeparkshark.com/api' }, ios: { buildConfiguration: 'Debug' } },
  } };
  await assert.rejects(target.checkProfile('tunnel', { easJson, fetchImpl, log() {} }), /ephemeral tunnel/);
  assert.equal(fetched, false);
  await target.checkProfile('dev', { easJson, fetchImpl, log() {} });
  await assert.rejects(target.checkProfile('devBaked', { easJson, fetchImpl, log() {} }), /must not bake API_URL/);
});
