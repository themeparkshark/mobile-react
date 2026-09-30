const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs, read, root } = require('./helpers/load-ts.cjs');

const { nextGetRetryDelay, GET_RETRY_DELAYS_MS } = loadTs('src/api/getRetry.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: async key => map.get(key) ?? null,
    setItem: async (key, value) => { map.set(key, value); },
  };
}

const lastGood = storage => loadTs('src/api/lastGood.ts', { '@react-native-async-storage/async-storage': storage });

test('GET retry is bounded, reads only, and skips timeouts and client errors', () => {
  const network = { code: 'ERR_NETWORK' };
  assert.equal(nextGetRetryDelay({ method: 'get' }, network), GET_RETRY_DELAYS_MS[0]);
  assert.equal(nextGetRetryDelay({ method: 'get', tpsRetryCount: 1 }, network), GET_RETRY_DELAYS_MS[1]);
  assert.equal(nextGetRetryDelay({ method: 'get', tpsRetryCount: GET_RETRY_DELAYS_MS.length }, network), null);
  assert.equal(nextGetRetryDelay({ method: 'get' }, { response: { status: 503 } }), GET_RETRY_DELAYS_MS[0]);
  assert.equal(nextGetRetryDelay({ method: 'get' }, { response: { status: 500 } }), null);
  assert.equal(nextGetRetryDelay({ method: 'get' }, { response: { status: 404 } }), null);
  assert.equal(nextGetRetryDelay({ method: 'get' }, { code: 'ECONNABORTED' }), null);
  assert.equal(nextGetRetryDelay({ method: 'post' }, network), null);
  assert.equal(nextGetRetryDelay({ method: 'get', tpsNoRetry: true }, network), null);
  assert.equal(nextGetRetryDelay(undefined, network), null);
});

test('last-good: network data is saved, then served while offline, then bundled on a first offline launch', async () => {
  const storage = memoryStorage();
  const { getWithLastGood } = lastGood(storage);
  const unwrap = body => (Array.isArray(body?.data) && body.data.length ? body.data : undefined);
  const online = await getWithLastGood({ key: 'currencies', request: async () => ({ data: { data: [{ id: 1 }] } }), unwrap, bundled: [{ id: 'bundled' }], storage });
  assert.equal(online.source, 'network');
  await flush();
  const offline = await getWithLastGood({ key: 'currencies', request: async () => { throw new Error('Network Error'); }, unwrap, bundled: [{ id: 'bundled' }], storage });
  assert.equal(offline.source, 'saved');
  assert.equal(offline.data[0].id, 1);
  const fresh = await getWithLastGood({ key: 'currencies', request: async () => { throw new Error('Network Error'); }, unwrap, bundled: [{ id: 'bundled' }], storage: memoryStorage() });
  assert.equal(fresh.source, 'bundled');
  const badPayload = await getWithLastGood({ key: 'currencies', request: async () => ({ data: '<html>' }), unwrap, bundled: [], storage });
  assert.equal(badPayload.source, 'saved', 'an HTML error page never replaces good data');
});

test('crumbs fall back to bundled copy so Splash and Login never render blank', async () => {
  const storage = memoryStorage();
  const bundled = JSON.parse(read('src/api/defaults/crumbs.json'));
  const getCrumbs = loadTs('src/api/endpoints/crumbs/getCrumbs.ts', {
    '../../client': { get: async () => { throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }); } },
    '../../lastGood': lastGood(storage),
    '../../defaults/crumbs.json': bundled,
  }).default;
  const crumbs = await getCrumbs();
  assert.ok(Object.keys(crumbs.labels).length > 20);
  assert.equal(typeof crumbs.labels.continue_as_guest, 'string');
});

test('a partial crumbs payload still has every group', async () => {
  const storage = memoryStorage();
  const getCrumbs = loadTs('src/api/endpoints/crumbs/getCrumbs.ts', {
    '../../client': { get: async () => ({ data: { data: { labels: { a: 'A' }, errors: {} } } }) },
    '../../lastGood': lastGood(storage),
    '../../defaults/crumbs.json': {},
  }).default;
  const crumbs = await getCrumbs();
  for (const group of ['labels', 'errors', 'messages', 'prompts', 'urls', 'warnings']) assert.equal(typeof crumbs[group], 'object', group);
});

test('bundled defaults are real payloads with no emoji or em dashes', () => {
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  for (const file of ['crumbs', 'currencies', 'theme']) {
    const raw = fs.readFileSync(path.join(root, `src/api/defaults/${file}.json`), 'utf8');
    assert.doesNotMatch(raw, emoji, file);
    assert.doesNotMatch(raw, /—/, file);
  }
  assert.ok(JSON.parse(read('src/api/defaults/currencies.json')).length >= 1);
  assert.ok(JSON.parse(read('src/api/defaults/theme.json')).id);
});

test('connectivity store notifies only on change', () => {
  const connectivity = loadTs('src/services/connectivity.ts');
  const seen = [];
  const off = connectivity.onConnectivityChange(value => seen.push(value));
  connectivity.reportUnreachable();
  connectivity.reportUnreachable();
  connectivity.reportReachable();
  off();
  connectivity.reportUnreachable();
  assert.deepEqual(seen, [true, false]);
  assert.equal(connectivity.isOffline(), true);
});

test('useAxiosSetup registers once, reads fresh callbacks and has no em dash toasts', () => {
  const effects = [];
  const refs = [];
  const toasts = [];
  let handlers = null;
  const mod = loadTs('src/hooks/useAxiosSetup.ts', {
    react: {
      useContext: ctx => ctx.value,
      useRef: value => { const ref = { current: value }; refs.push(ref); return ref; },
      useEffect: (fn, deps) => effects.push([fn, deps]),
    },
    '../api/client': { interceptors: { response: { use: (ok, bad) => { handlers = { ok, bad }; return 1; }, eject() {} } } },
    '../context/AuthProvider': { AuthContext: { value: { logout: () => toasts.push('stale-logout') } } },
    '../context/BroadcastProvider': { BroadcastContext: { value: { enqueue() {} } } },
    '../utils/toast': { showToast: message => toasts.push(message) },
  });
  mod.useAxiosSetup();
  assert.equal(effects.length, 1);
  assert.equal(effects[0][1].length, 0, 'registered once');
  effects[0][0]();
  refs[1].current = () => toasts.push('fresh-logout');
  handlers.bad({ response: { status: 401 } }).catch(() => {});
  assert.deepEqual(toasts, ['fresh-logout']);
  for (let i = 0; i < 3; i += 1) handlers.bad({ response: { status: 502 } }).catch(() => {});
  assert.equal(toasts[1], mod.SERVER_TROUBLE_TOAST);
  const source = read('src/hooks/useAxiosSetup.ts');
  assert.doesNotMatch(source, /—/);
  assert.doesNotMatch(source, /showToast\([^)]*offline/i, 'offline is the banner, not a toast');
});

test('the client reports reachability from real responses and retries GETs', () => {
  const source = read('src/api/client.ts');
  assert.match(source, /reportReachable\(\)/);
  assert.match(source, /if \(!error\.response\) reportUnreachable\(\)/);
  assert.match(source, /nextGetRetryDelay\(config, error\)/);
});

test('one branded offline banner is mounted at the root', () => {
  const rootSource = read('src/Root.tsx');
  assert.match(rootSource, /<OfflineBanner \/>/);
  const banner = read('src/components/OfflineBanner.tsx');
  assert.match(banner, /useReducedMotion/);
  assert.doesNotMatch(banner, /—/);
  assert.doesNotMatch(banner, /#000|black/i);
});
