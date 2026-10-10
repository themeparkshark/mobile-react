const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const envelope = loadTs('src/services/telemetry/sentryEnvelope.ts');
const core = loadTs('src/services/telemetry/coreLoopEvents.ts');
const envelopeModule = envelope;
const flush = () => new Promise(resolve => setImmediate(resolve));

function loadTelemetry({ storage = new Map(), channel = 'testflight', globals = {} } = {}) {
  const mod = loadTs('src/services/telemetry/index.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    },
    'expo-application': { nativeApplicationVersion: '1.6.0', nativeBuildVersion: '42' },
    'expo-device': { osVersion: '18.6', modelName: 'iPhone 16 Pro', isDevice: false },
    'expo-updates': { channel, updateId: 'update-1', runtimeVersion: 'fp1', isEmbeddedLaunch: false },
    'react-native': { Platform: { OS: 'ios' } },
    './sentryEnvelope': envelopeModule,
    './releaseName': loadTs('src/services/telemetry/releaseName.ts'),
    '../../utils/hermesSafeError': loadTs('src/utils/hermesSafeError.ts'),
  }, { process: { env: {} }, ...globals });
  return { mod, storage };
}

const DSN = 'https://abc123@o9.ingest.sentry.io/4507';
const parseEnvelope = body => body.trim().split('\n').map(line => JSON.parse(line));

test('DSN parsing builds the envelope endpoint and rejects junk', () => {
  const dsn = envelope.parseDsn(DSN);
  assert.equal(dsn.projectId, '4507');
  assert.equal(dsn.envelopeUrl, 'https://o9.ingest.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7&sentry_client=tps-rn%2F1.0');
  assert.equal(envelope.parseDsn('http://k@localhost:9123/1').envelopeUrl.startsWith('http://localhost:9123/api/1/envelope/'), true);
  assert.equal(envelope.parseDsn(''), null);
  assert.equal(envelope.parseDsn('not a dsn'), null);
});

test('Hermes stacks become oldest-first Sentry frames with file names only', () => {
  const frames = envelope.parseStack([
    'Error: boom',
    '    at throwIt (address at index.android.bundle:1:2345)',
    '    at onPress (/var/containers/Bundle/Application/X/main.jsbundle:10:20)',
    '    at anonymous (native)',
  ].join('\n'));
  assert.deepEqual([...frames.map(f => f.function)], ['onPress', 'throwIt']);
  assert.equal(frames[0].filename, 'app:///main.jsbundle');
  assert.equal(frames[1].lineno, 1);
  assert.equal(frames[1].colno, 2346, 'Hermes offsets become 1-based Sentry columns');
  assert.equal(frames[0].colno, 20, 'JSC-style columns are already 1-based');
});

test('core-loop routes are classified from the API client, ids and queries stripped', () => {
  const cases = [
    ['post', '/auth/login', 'auth.sign_in'],
    ['post', '/me/task-attempts', 'ride_challenge.start'],
    ['post', '/me/task-attempts/88/resolve', 'ride_challenge.resolve'],
    ['post', 'https://tps-api.on-forge.com/api/me/ride-coins/5/level-up', 'coin.level_up'],
    ['post', '/me/line-sessions', 'queue_play.start'],
    ['post', '/me/line-sessions/12/complete', 'queue_play.complete'],
    ['post', '/raids/3/attack', 'raid.attack'],
    ['put', '/me/trip-goal', 'trip_goal.set'],
    ['post', '/redeemables/9/redeem', 'reward.redeem'],
    ['post', '/me/prep-item-sets/churro-cart/claim', 'reward.redeem'],
    ['put', '/daily-gifts/4', 'daily_gift.redeem'],
    ['post', '/me/inventory/items/7/purchase', 'store.purchase'],
    ['delete', '/me/force-delete', 'account.delete'],
  ];
  for (const [method, url, event] of cases) assert.equal(core.classifyCoreLoopRequest(method, url), event, url);
  assert.equal(core.classifyCoreLoopRequest('get', '/me/task-attempts/88'), null);
  assert.equal(core.classifyCoreLoopRequest('get', '/crumbs'), null);
  assert.equal(core.normalizeRoute('/api/me/task-attempts/42/resolve?lat=34.1&lng=-118'), '/me/task-attempts/:id/resolve');
  assert.equal(new Set(cases.map(c => c[2])).size >= 10, true, 'about ten core-loop events');
});

test('no DSN means no network and no storage', async () => {
  const { mod, storage } = loadTelemetry();
  let sent = 0;
  assert.equal(mod.initTelemetry({ dsn: '', transport: async () => { sent += 1; return true; }, installGlobalHandlers: false }), false);
  assert.equal(mod.captureMessage('hello'), null);
  await flush();
  assert.equal(sent, 0);
  assert.equal(storage.size, 0);
});

test('an error event carries release, channel and core-loop breadcrumbs, never a player id or name (kids app)', async () => {
  const { mod } = loadTelemetry();
  const bodies = [];
  mod.initTelemetry({ dsn: DSN, transport: async (url, body) => { bodies.push([url, body]); return true; }, installGlobalHandlers: false, now: () => 1_700_000_000_000 });
  mod.addBreadcrumb('core', 'ride_challenge.start', { status: 201 });
  const id = mod.captureException(new Error('shelf exploded'), { source: 'error-boundary', handled: true });
  await flush();
  assert.equal(bodies.length, 1);
  const [header, item, event] = parseEnvelope(bodies[0][1]);
  assert.equal(header.event_id, id);
  assert.equal(item.type, 'event');
  assert.equal(event.release, 'com.themeparkshark.app@ota-fp1', 'an OTA launch is keyed by runtime and update id');
  assert.equal(event.environment, 'testflight');
  assert.equal(event.dist, 'update-1');
  assert.equal(event.user, undefined, 'no player id in any envelope');
  assert.equal(mod.setTelemetryUser, undefined, 'there is no way to attach one');
  assert.equal(event.exception.values[0].value, 'shelf exploded');
  assert.equal(event.breadcrumbs.values[0].message, 'ride_challenge.start');
  assert.doesNotMatch(bodies[0][1], /username|screen_name|email|Device-Name|Bearer|"user"/i);
});

test('repeat errors inside five minutes are sent once', async () => {
  const { mod } = loadTelemetry();
  let now = 0;
  let sent = 0;
  mod.initTelemetry({ dsn: DSN, transport: async () => { sent += 1; return true; }, installGlobalHandlers: false, now: () => now });
  mod.captureMessage('raid.attack failed', 'error');
  mod.captureMessage('raid.attack failed', 'error');
  now = 5 * 60 * 1000;
  mod.captureMessage('raid.attack failed', 'error');
  await flush();
  assert.equal(sent, 2);
});

test('offline events go to the outbox and are delivered on the next launch', async () => {
  const storage = new Map();
  const first = loadTelemetry({ storage }).mod;
  first.initTelemetry({ dsn: DSN, transport: async () => { throw new Error('offline'); }, installGlobalHandlers: false });
  first.captureMessage('queue_play.complete failed', 'error');
  await flush(); await flush();
  assert.equal(JSON.parse(storage.get('tps.telemetry.outbox.v1')).length, 1);

  const second = loadTelemetry({ storage }).mod;
  const delivered = [];
  second.initTelemetry({ dsn: DSN, transport: async (url, body) => { delivered.push(body); return true; }, installGlobalHandlers: false });
  await flush(); await flush(); await flush();
  assert.equal(delivered.length, 1);
  assert.match(delivered[0], /queue_play\.complete failed/);
  assert.deepEqual(JSON.parse(storage.get('tps.telemetry.outbox.v1')), []);
});

test('fatal JS errors are persisted before sending and chained to the previous handler', async () => {
  const storage = new Map();
  let handler = null;
  const previousCalls = [];
  const ErrorUtils = {
    getGlobalHandler: () => (error, fatal) => previousCalls.push([error.message, fatal]),
    setGlobalHandler: fn => { handler = fn; },
  };
  const { mod } = loadTelemetry({ storage, globals: { globalThis: { ErrorUtils } } });
  const sent = [];
  mod.initTelemetry({ dsn: DSN, transport: async (url, body) => { sent.push(body); return false; } });
  assert.equal(typeof handler, 'function');
  handler(new Error('fatal crash'), true);
  assert.equal(previousCalls.length, 0, 'the terminating default handler waits for the crash report to hit disk');
  await flush(); await flush(); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(previousCalls)), [['fatal crash', true]]);
  assert.match(storage.get('tps.telemetry.outbox.v1'), /fatal crash/);
  assert.equal(parseEnvelope(sent[0])[2].level, 'fatal');
});

test('the API client records core-loop breadcrumbs and reports server failures', () => {
  const crumbs = [];
  const messages = [];
  const client = loadTs('src/api/client.ts', {
    axios: { create: () => ({ defaults: { headers: { common: {} } }, interceptors: { response: { use() {} } } }), isCancel: () => false,
      interceptors: { response: { use() {} } } },
    'expo-device': {},
    '../config': { apiUrl: 'https://tps-api.on-forge.com/api' },
    '../services/telemetry/coreLoopEvents': core,
    '../services/telemetry': {
      addBreadcrumb: (...args) => crumbs.push(args),
      captureMessage: (...args) => messages.push(args),
    },
    '../services/connectivity': { reportReachable() {}, reportUnreachable() {} },
    '../utils/hermesSafeError': loadTs('src/utils/hermesSafeError.ts'),
    './getRetry': { nextGetRetryDelay: () => null },
    './dedupeGet': loadTs('src/api/dedupeGet.ts'),
    './jsonGuard': loadTs('src/api/jsonGuard.ts'),
  });
  client.recordCoreLoopResponse('post', '/me/task-attempts', 201);
  client.recordCoreLoopResponse('post', '/raids/3/attack', 503);
  client.recordCoreLoopResponse('post', '/me/line-sessions/1/complete', undefined);
  client.recordCoreLoopResponse('get', '/crumbs', 200);
  assert.deepEqual(crumbs.map(c => [c[1], c[3]]), [['ride_challenge.start', 'info'], ['raid.attack', 'error'], ['queue_play.complete', 'error']]);
  assert.deepEqual(messages.map(m => m[0]), ['raid.attack failed', 'queue_play.complete failed']);
});

test('App starts telemetry at module scope and reports ErrorBoundary crashes', () => {
  const app = read('App.tsx');
  assert.ok(app.indexOf('initTelemetry()') < app.indexOf('export default function App'));
  assert.match(app, /onError=\{reportBoundaryError\}/);
});
