const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/api-non-json-guard.test.cjs
// A captive-portal page (HTTP 200 + HTML) must never reach a caller as data.

const root = path.resolve(__dirname, '../..');
const axios = require(path.join(root, 'node_modules/axios'));
const { isNonJsonBody, isNonJsonError, withNonJsonRetry, rawBodyIsNonJson } = loadTs('src/api/jsonGuard.ts');

const PORTAL = '<!DOCTYPE html><html><head><title>Hotel Wi-Fi</title></head><body>Accept terms</body></html>';

test('HTML, portal text and unparsed text are non-JSON; real answers are not', () => {
  assert.equal(isNonJsonBody({ data: PORTAL, headers: { 'content-type': 'text/html' } }), true);
  assert.equal(isNonJsonBody({ data: PORTAL, headers: { 'content-type': 'application/json' } }), true, 'markup lies about its type');
  assert.equal(isNonJsonBody({ data: 'Please sign in', headers: { 'content-type': 'text/plain' } }), true);
  assert.equal(isNonJsonBody({ data: { data: [] }, headers: { 'content-type': 'application/json' } }), false);
  assert.equal(isNonJsonBody({ data: [], headers: {} }), false);
  assert.equal(isNonJsonBody({ data: '', headers: { 'content-type': 'text/html' } }), false, '204 No Content');
  assert.equal(isNonJsonBody({ data: null, headers: {} }), false);
  assert.equal(isNonJsonBody({ data: 'ok', headers: { 'content-type': 'application/json' } }), false, 'a JSON string literal');
  assert.equal(isNonJsonBody({ data: PORTAL, headers: {}, config: { responseType: 'text' } }), false, 'a caller that asked for text');
  assert.equal(isNonJsonBody({ data: PORTAL, headers: { get: () => 'text/html; charset=utf-8' } }), true, 'AxiosHeaders');
});

function loadClient(adapter) {
  const connectivity = loadTs('src/services/connectivity.ts');
  const recorded = [];
  const mod = loadTs('src/api/client.ts', {
    axios,
    'expo-device': { isDevice: false },
    '../config': { __esModule: true, default: { apiUrl: 'https://api.test/api' } },
    '../services/telemetry/coreLoopEvents': { classifyCoreLoopRequest: () => 'core_test' },
    '../services/telemetry': { addBreadcrumb: () => undefined, captureMessage: (...a) => recorded.push(a) },
    '../services/connectivity': connectivity,
  });
  const client = mod.default;
  client.defaults.adapter = adapter;
  return { client, connectivity, recorded };
}

const reply = (data, contentType) => config => Promise.resolve({
  data, status: 200, statusText: 'OK', headers: { 'content-type': contentType }, config, request: {},
});

test('one portal reply is scoped to its request; a run of them marks the app offline', async () => {
  const { client, connectivity } = loadClient(reply(PORTAL, 'text/html'));
  await assert.rejects(client.get('/reaction-types'), error => {
    assert.equal(isNonJsonError(error), true);
    assert.equal(error.response, undefined, 'nothing can read into the portal page');
    return true;
  });
  assert.equal(connectivity.isOffline(), false, 'one odd reply is not an outage');
  await assert.rejects(client.get('/me'), error => isNonJsonError(error));
  assert.equal(connectivity.isOffline(), true, 'a captive portal answers everything: offline');
});

test('a good reply between odd ones resets the run', async () => {
  let n = 0;
  const { client, connectivity } = loadClient(config => (n++ % 2 === 0 ? reply(PORTAL, 'text/html') : reply('{"ok":1}', 'application/json'))(config));
  for (let i = 0; i < 3; i++) {
    await client.get('/a').catch(() => undefined);
    await client.get('/b').catch(() => undefined);
  }
  assert.equal(connectivity.isOffline(), false);
});

test('a cut-off reply that still says JSON is rejected, not handed over as a string', async () => {
  const { client } = loadClient(reply('{"data":[{"id":1},{"na', 'application/json'));
  await assert.rejects(client.get('/reaction-types'), error => isNonJsonError(error));
  assert.equal(isNonJsonBody({ data: '[1,2', headers: { 'content-type': 'application/json' } }), true);
  assert.equal(rawBodyIsNonJson({ data: '{"a":', headers: { 'content-type': 'application/json' } }), true);
  assert.equal(rawBodyIsNonJson({ data: '{"a":1}', headers: { 'content-type': 'application/json' } }), false);
  assert.equal(rawBodyIsNonJson({ data: '"ok"', headers: { 'content-type': 'application/json' } }), false);
});

test('transport: a non-JSON GET is tried once more after a short pause; writes never are', async () => {
  const waits = [];
  const answers = [{ data: PORTAL, headers: { 'content-type': 'text/html' } }, { data: '{"ok":1}', headers: { 'content-type': 'application/json' } }];
  let calls = 0;
  const adapter = withNonJsonRetry(async () => answers[Math.min(calls++, 1)], async ms => { waits.push(ms); });
  const res = await adapter({ method: 'get' });
  assert.equal(res.data, '{"ok":1}');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [600]);
  calls = 0;
  const post = withNonJsonRetry(async () => { calls++; return answers[0]; }, async () => {});
  await post({ method: 'post' });
  assert.equal(calls, 1, 'a write is never repeated');
  calls = 0;
  const twice = withNonJsonRetry(async () => { calls++; return answers[0]; }, async () => {});
  await twice({ method: 'get' });
  assert.equal(calls, 2, 'one retry only');
});

test('the client stacks the non-JSON retry under the GET retry and dedupe', () => {
  const src = fs.readFileSync(path.join(root, 'src/api/client.ts'), 'utf8');
  assert.match(src, /withInflightDedupe\(withGetRetry\(withNonJsonRetry\(client\.defaults\.adapter/);
  assert.match(src, /if \(consecutiveNonJson >= NON_JSON_BEFORE_OFFLINE\) reportUnreachable\(\);/);
});

test('the real API client still parses JSON and passes 204s', async () => {
  const { client, connectivity } = loadClient(reply('{"data":[{"id":1}]}', 'application/json'));
  const { data } = await client.get('/reaction-types');
  assert.equal(data.data[0].id, 1);
  assert.equal(connectivity.isOffline(), false);
  const empty = loadClient(reply('', 'text/html'));
  const res = await empty.client.delete('/reactions/1');
  assert.equal(res.data, '');
});

test('the default axios instance (News) gets the same guard', async () => {
  loadClient(reply('{}', 'application/json'));
  await assert.rejects(
    axios.get('https://themeparkshark.com/wp-json/wp/v2/posts', { adapter: reply(PORTAL, 'text/html') }),
    error => isNonJsonError(error),
  );
});

test('reaction types: a non-list reply becomes an empty list, never undefined', async () => {
  for (const body of [PORTAL, { message: 'oops' }, { data: null }, null]) {
    const { default: all } = loadTs('src/api/endpoints/reaction-types/all.ts', {
      '../../client': { __esModule: true, default: { get: async () => ({ data: body }) } },
    });
    const types = await all();
    assert.equal(Array.isArray(types), true, `body ${JSON.stringify(body).slice(0, 20)}`);
  }
});

test('ForumProvider only ever stores a list and its launch fetch is guarded', () => {
  const src = fs.readFileSync(path.join(root, 'src/context/ForumProvider.tsx'), 'utf8');
  assert.match(src, /if \(Array\.isArray\(types\)\) setReactionTypes\(types\)/);
  assert.match(src, /try \{\s*const types = await all\(\)/);
});

test('a portal reply counts as offline for retry-aware screens', () => {
  const { isNetworkFailure } = loadTs('src/api/getRetry.ts');
  assert.equal(isNetworkFailure({ code: 'ERR_NON_JSON' }), true);
});
