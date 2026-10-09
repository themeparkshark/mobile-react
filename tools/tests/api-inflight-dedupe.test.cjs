const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/api-inflight-dedupe.test.cjs
// Identical GETs already in flight share one request; nothing is cached.

const root = path.resolve(__dirname, '../..');
const { inflightKey, withInflightDedupe } = loadTs('src/api/dedupeGet.ts');

function transport() {
  const calls = [];
  const adapter = config => new Promise((resolve, reject) => calls.push({ config, resolve, reject }));
  return { calls, adapter };
}
const get = (url, extra = {}) => ({ method: 'get', baseURL: 'https://api', url, headers: { Authorization: 'Bearer a' }, ...extra });

test('two identical GETs in flight make one request and each caller gets its own config', async () => {
  const t = transport(), adapter = withInflightDedupe(t.adapter);
  const a = get('/parks/8/gym'), b = get('/parks/8/gym');
  const first = adapter(a), second = adapter(b);
  assert.equal(t.calls.length, 1);
  t.calls[0].resolve({ data: '{"gym":1}', status: 200, config: a });
  const [ra, rb] = await Promise.all([first, second]);
  assert.equal(ra.config, a);
  assert.equal(rb.config, b);
  assert.equal(rb.data, '{"gym":1}', 'raw text: every caller parses its own copy');
  adapter(get('/parks/8/gym'));
  assert.equal(t.calls.length, 2, 'nothing is cached once the answer landed');
});

test('the leader parsing its body in place never changes what a joiner receives', async () => {
  const t = transport(), adapter = withInflightDedupe(t.adapter);
  // What axios dispatchRequest does with the leader's response.
  const leader = adapter(get('/me')).then(response => { response.data = JSON.parse(response.data); return response; });
  const joiner = adapter(get('/me'));
  t.calls[0].resolve({ data: '{"id":5}', status: 200 });
  const [a, b] = await Promise.all([leader, joiner]);
  assert.equal(a.data.id, 5);
  assert.equal(b.data, '{"id":5}');
});

test('a failure reaches every joined caller and frees the key', async () => {
  const t = transport(), adapter = withInflightDedupe(t.adapter);
  const p1 = adapter(get('/me')), p2 = adapter(get('/me'));
  t.calls[0].reject(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
  await assert.rejects(p1, /Network Error/);
  await assert.rejects(p2, /Network Error/);
  adapter(get('/me'));
  assert.equal(t.calls.length, 2);
});

test('writes, other players, other params and cancellable requests never share', () => {
  assert.equal(inflightKey({ ...get('/me'), method: 'post' }), null);
  assert.equal(inflightKey({ ...get('/me'), signal: {} }), null);
  assert.equal(inflightKey({ ...get('/me'), cancelToken: {} }), null);
  assert.equal(inflightKey({ ...get('/me'), tpsNoDedupe: true }), null);
  assert.notEqual(inflightKey(get('/me')), inflightKey(get('/me', { headers: { Authorization: 'Bearer b' } })));
  assert.notEqual(inflightKey(get('/rides', { params: { park: 1 } })), inflightKey(get('/rides', { params: { park: 2 } })));
  assert.equal(inflightKey(get('/rides', { params: { park: 1 } })), inflightKey(get('/rides', { params: { park: 1 } })));
});

test('the API client dedupes outside the GET retry, below the interceptors', () => {
  const src = fs.readFileSync(path.join(root, 'src/api/client.ts'), 'utf8');
  assert.match(src, /client\.defaults\.adapter = withInflightDedupe\(withGetRetry\(withNonJsonRetry\(client\.defaults\.adapter as AxiosAdapter\)\)\) as AxiosAdapter;/);
});
