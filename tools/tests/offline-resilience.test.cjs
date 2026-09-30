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

test('the client reports reachability from real responses and retries GETs in the transport', () => {
  const source = read('src/api/client.ts');
  assert.match(source, /reportReachable\(\)/);
  assert.match(source, /isNetworkFailure\(error\)/);
  assert.doesNotMatch(source, /if \(!?error\.response\)/, "RN network errors carry a status-0 response");
  assert.match(source, /client\.defaults\.adapter = withGetRetry\(/);
  assert.doesNotMatch(source, /client\.request\(/, 'never retry from inside an interceptor');
});

test('one branded offline banner is mounted at the root', () => {
  const rootSource = read('src/Root.tsx');
  assert.match(rootSource, /<OfflineBanner \/>/);
  const banner = read('src/components/OfflineBanner.tsx');
  assert.match(banner, /useReducedMotion/);
  assert.doesNotMatch(banner, /saved park/i, 'never promise cached park data that is not cached');
  assert.match(banner, /HEADER_CLEARANCE/, 'sits below his header, not over it');
  assert.doesNotMatch(banner, /—/);
  assert.doesNotMatch(banner, /#000|black/i);
  // Icons are illustrated PNG art in Dustin's style, never flat vector shapes.
  assert.doesNotMatch(banner, /react-native-svg|react-native-skia/);
  for (const art of ['offline.png', 'back-online.png']) {
    assert.match(banner, new RegExp(`assets/images/offline/${art.replace('.', '\\.')}`));
    assert.ok(require('node:fs').existsSync(require('node:path').join(root, 'assets/images/offline', art)), art);
  }
});

// Real axios, a fake transport, and both response interceptors installed
// (client.ts, then useAxiosSetup), so a retried request is seen exactly as
// the running app sees it.
function realStack(transport) {
  const realAxios = require(path.join(root, 'node_modules/axios'));
  const events = [];
  const captured = [];
  const client = loadTs('src/api/client.ts', {
    axios: { create: cfg => realAxios.create({ ...cfg, adapter: transport }), isCancel: realAxios.isCancel },
    'expo-device': {},
    '../config': { apiUrl: 'http://api.test/api' },
    '../services/telemetry/coreLoopEvents': { classifyCoreLoopRequest: (_m, url) => (url === '/core' ? 'queue_play.complete' : null) },
    '../services/telemetry': { addBreadcrumb() {}, captureMessage: (_m, _l, extra) => captured.push(extra.status) },
    '../services/connectivity': { reportReachable: () => events.push('reachable'), reportUnreachable: () => events.push('unreachable') },
    './getRetry': loadTs('src/api/getRetry.ts', {}, { setTimeout: fn => { fn(); return 0; } }),
  }).default;
  const broadcasts = [];
  const toasts = [];
  const setup = loadTs('src/hooks/useAxiosSetup.ts', {
    react: { useContext: ctx => ctx.value, useRef: value => ({ current: value }), useEffect: fn => fn() },
    '../api/client': { __esModule: true, default: client },
    '../context/AuthProvider': { AuthContext: { value: { logout() {} } } },
    '../context/BroadcastProvider': { BroadcastContext: { value: { enqueue: list => broadcasts.push(list) } } },
    '../utils/toast': { showToast: message => toasts.push(message) },
  });
  setup.useAxiosSetup();
  return { client, events, captured, broadcasts, toasts, AxiosError: realAxios.AxiosError, SERVER_TROUBLE_TOAST: setup.SERVER_TROUBLE_TOAST };
}

const reply = (config, status, data = {}) => ({ data, status, statusText: String(status), headers: {}, config, request: {} });

test('real axios: a GET that succeeds on its 3rd try runs every interceptor once', async () => {
  let attempts = 0;
  let stack;
  stack = realStack(async config => {
    attempts += 1;
    if (attempts < 3) {
      const response = reply(config, 503);
      throw new stack.AxiosError('busy', 'ERR_BAD_RESPONSE', config, {}, response);
    }
    return reply(config, 200, { broadcasts: [{ id: 7 }] });
  });
  const res = await stack.client.get('/me');
  assert.equal(res.status, 200);
  assert.equal(attempts, 3, 'retried twice below the interceptors');
  assert.equal(stack.broadcasts.length, 1, 'broadcasts enqueued once');
  assert.deepEqual(stack.events, ['reachable']);
});

test('real axios: the 5xx counter goes up once per logical request, so one failed GET never toasts', async () => {
  let attempts = 0;
  let stack;
  stack = realStack(async config => {
    attempts += 1;
    throw new stack.AxiosError('busy', 'ERR_BAD_RESPONSE', config, {}, reply(config, 503));
  });
  await assert.rejects(stack.client.get('/me'));
  assert.equal(attempts, 3);
  assert.deepEqual(stack.toasts, [], 'three attempts of one request are one failure');
  await assert.rejects(stack.client.get('/me'));
  assert.deepEqual(stack.toasts, []);
  await assert.rejects(stack.client.get('/me'));
  assert.deepEqual(stack.toasts, [stack.SERVER_TROUBLE_TOAST], 'three failed requests in a row toast once');
});

test('real axios: a dropped POST is never retried and marks offline once', async () => {
  let attempts = 0;
  let stack;
  stack = realStack(async config => {
    attempts += 1;
    throw new stack.AxiosError('Network Error', 'ERR_NETWORK', config, { status: 0 }, { status: 0, config });
  });
  await assert.rejects(stack.client.post('/core', { a: 1 }));
  assert.equal(attempts, 1);
  assert.deepEqual(stack.events, ['unreachable']);
  assert.deepEqual(stack.captured, ['network']);
});

test('real axios: one timeout does not mark the app offline; two in a row do', async () => {
  let stack;
  let mode = 'timeout';
  stack = realStack(async config => {
    if (mode === 'ok') return reply(config, 200);
    throw new stack.AxiosError('timeout of 12000ms exceeded', 'ECONNABORTED', config, {});
  });
  await assert.rejects(stack.client.get('/slow'));
  assert.deepEqual(stack.events, [], 'a single slow endpoint is not an outage');
  mode = 'ok';
  await stack.client.get('/fast');
  mode = 'timeout';
  await assert.rejects(stack.client.get('/slow'));
  assert.deepEqual(stack.events, ['reachable'], 'a response in between resets the count');
  await assert.rejects(stack.client.get('/slow'));
  assert.deepEqual(stack.events, ['reachable', 'unreachable']);
});

test('React Native network errors (response with status 0) count as no response', async () => {
  const { httpStatus } = loadTs('src/api/getRetry.ts');
  const rnDropped = { code: 'ERR_NETWORK', response: { status: 0, data: undefined } };
  assert.equal(httpStatus(rnDropped), undefined);
  assert.equal(httpStatus({ response: { status: 422 } }), 422);
  assert.equal(httpStatus(undefined), undefined);
  assert.equal(nextGetRetryDelay({ method: 'get' }, rnDropped), GET_RETRY_DELAYS_MS[0], 'a dropped GET is retried');

  const events = [];
  let handlers = null;
  const instance = {
    defaults: { headers: { common: {} } },
    interceptors: { response: { use: (ok, bad) => { handlers = { ok, bad }; } } },
    request: async () => { throw new Error('unused'); },
  };
  const statuses = [];
  loadTs('src/api/client.ts', {
    axios: { create: () => instance, isCancel: () => false },
    'expo-device': {},
    '../config': { apiUrl: 'http://api.test/api' },
    '../services/telemetry/coreLoopEvents': { classifyCoreLoopRequest: () => 'queue_play.complete' },
    '../services/telemetry': { addBreadcrumb() {}, captureMessage: (_m, _l, extra) => statuses.push(extra.status) },
    '../services/connectivity': { reportReachable: () => events.push('reachable'), reportUnreachable: () => events.push('unreachable') },
    './getRetry': loadTs('src/api/getRetry.ts'),
  }, { setTimeout: (fn) => { fn(); return 0; } });
  await assert.rejects(handlers.bad({ ...rnDropped, config: { method: 'post', url: '/me/line-sessions/1/complete' } }));
  assert.deepEqual(events, ['unreachable'], 'status 0 shows the offline banner instead of marking the API reachable');
  assert.deepEqual(statuses, ['network']);
});

test('the offline banner is built from the WS0 kit: brand tokens and his yellow button', () => {
  const source = read('src/components/OfflineBanner.tsx');
  assert.match(source, /from '\.\.\/ui'/);
  assert.match(source, /<GameButton\s+label="Retry"/);
  assert.equal((source.match(/<Pressable/g) || []).length, 1, 'only the compact icon chip; the Retry CTA is his button');
  assert.match(source, /OFFLINE_COMPACT_AFTER_MS/, 'a long outage shrinks to the small chip');
  assert.doesNotMatch(source, /'#[0-9a-f]{6}'/i, 'colours come from BRAND tokens');
  assert.doesNotMatch(source, /—/);
});

test('on Explore the banner goes straight to the chip so it never covers the HUD cards', () => {
  const source = read('src/components/OfflineBanner.tsx');
  assert.match(source, /CHIP_ONLY_ROUTES[^=]*= new Set\(\['Explore'\]\)/);
  assert.match(source, /navigationRef\.addListener\('state'/, 'follows the current route');
  assert.match(source, /\{!chipOnly && \(/, 'no full card on a HUD screen');
  assert.match(source, /chipOnly \? styles\.chipAlone/, 'the chip is the whole banner there');
  assert.match(source, /chipOnly \? \[styles\.hostDocked/, 'docked on the right edge of the map, not over the HUD row');
  assert.match(source, /back \? BACK_ONLINE_ICON : OFFLINE_ICON\} style=\{styles\.chipIcon\}/, 'the chip also says back online');
});

test('offline icon provenance points at the saved raw outputs and review sheet', () => {
  const source = read('src/components/OfflineBanner.tsx');
  assert.match(source, /art-pilot\/raw\/ws9\/offline-v2/);
  assert.doesNotMatch(source, /art-ws9\/review-sheet-1/);
});
