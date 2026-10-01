// Regression: Oct 1 2026, internal-tunnel OTA 85456c04 (and every OTA since
// 6d486f38) was bundled with EXPO_PUBLIC_API_URL set to the bare tunnel host.
// A cold launch at home then sent /me, /me/current-park, /me/trip-goal to the
// site root, Laravel answered 404, no API call was logged, the outside-park
// check never confirmed and trip goals showed "unavailable".
//
// This drives the real client stack (axios, GET retry, in-flight dedupe,
// interceptors) against a fake tester backend that, like the real one, only
// serves routes under /api, through the launch sequence: me, park lookup,
// trip goal.
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { loadTs, root } = require('./helpers/load-ts.cjs');

const { resolveApiUrl, normalizeApiUrl } = loadTs('src/apiTarget.ts');
const { isConfirmedOutsidePark } = loadTs('src/context/parkLookupPolicy.ts');

const TUNNEL_HOST = 'https://jackets-gap-families-country.trycloudflare.com';
const HOME = { latitude: 33.88, longitude: -117.85 };

test('a bare API origin gets /api; a URL with a path is kept', () => {
  assert.equal(normalizeApiUrl(TUNNEL_HOST), `${TUNNEL_HOST}/api`);
  assert.equal(normalizeApiUrl(`${TUNNEL_HOST}/`), `${TUNNEL_HOST}/api`);
  assert.equal(normalizeApiUrl(`${TUNNEL_HOST}/api`), `${TUNNEL_HOST}/api`);
  assert.equal(normalizeApiUrl(`${TUNNEL_HOST}/api/`), `${TUNNEL_HOST}/api`);
  assert.equal(normalizeApiUrl('http://localhost:8010/api'), 'http://localhost:8010/api');
  assert.equal(normalizeApiUrl('http://192.168.1.5:8000'), 'http://192.168.1.5:8000/api');
  assert.equal(normalizeApiUrl(''), undefined);
  assert.equal(normalizeApiUrl(undefined), undefined);
  // The internal-tunnel channel is not pinned in code, so the bundle URL wins.
  assert.equal(resolveApiUrl({ isDev: false, channel: 'internal-tunnel', publicEnvUrl: TUNNEL_HOST, bakedUrl: TUNNEL_HOST }), `${TUNNEL_HOST}/api`);
  assert.equal(resolveApiUrl({ isDev: false, channel: 'internal-tunnel', publicEnvUrl: undefined, bakedUrl: TUNNEL_HOST }), `${TUNNEL_HOST}/api`);
});

function fakeTesterBackend(axios, log) {
  return async function adapter(config) {
    const fullPath = new URL(`${config.baseURL.replace(/\/$/, '')}${config.url}`).pathname;
    const method = (config.method || 'get').toUpperCase();
    log.push(`${method} ${fullPath}`);
    const respond = (status, body) => {
      const response = { data: JSON.stringify(body), status, statusText: String(status), headers: { 'content-type': 'application/json' }, config, request: {} };
      if (status >= 200 && status < 300) return response;
      throw new axios.AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response);
    };
    if (!fullPath.startsWith('/api/')) return respond(404, { message: 'Not Found' });
    if (config.headers?.Authorization !== 'Bearer test-token') return respond(401, { message: 'Unauthenticated.' });
    if (method === 'GET' && fullPath === '/api/me') return respond(200, { data: { id: 1, username: 'tpss' } });
    // Outside every park the server answers 422.
    if (method === 'POST' && fullPath === '/api/me/current-park') return respond(422, { message: 'Not in a park' });
    if (method === 'GET' && fullPath === '/api/me/trip-goal') return respond(200, { data: { goal: null, tickets: [] } });
    return respond(404, { message: 'Not Found' });
  };
}

function loadClient(apiUrl, log) {
  const axios = require(path.join(root, 'node_modules/axios'));
  const previousAdapter = axios.defaults.adapter;
  axios.defaults.adapter = fakeTesterBackend(axios, log);
  const reachability = [];
  try {
    const client = loadTs('src/api/client.ts', {
      axios,
      'expo-device': {},
      '../config': { apiUrl },
      '../services/telemetry/coreLoopEvents': { classifyCoreLoopRequest: () => null },
      '../services/telemetry': { addBreadcrumb() {}, captureMessage() {} },
      '../services/connectivity': { reportReachable: () => reachability.push('up'), reportUnreachable: () => reachability.push('down') },
      './getRetry': loadTs('src/api/getRetry.ts'),
      './dedupeGet': loadTs('src/api/dedupeGet.ts'),
      '../utils/hermesSafeError': loadTs('src/utils/hermesSafeError.ts'),
    }).default;
    client.defaults.headers.common.Authorization = 'Bearer test-token';
    return { client, reachability };
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
}

async function coldLaunchAtHome(client) {
  const currentPark = loadTs('src/api/endpoints/me/current-park.ts', { '../../client': client }).default;
  const { getTripGoal } = loadTs('src/api/endpoints/me/trip-goal.ts', { '../../client': client });
  const me = await client.get('/me');
  // LocationProvider.lookupParkAt: a 422 means outside, an error means unknown.
  let record;
  try {
    const park = await currentPark(HOME.latitude, HOME.longitude, 12);
    record = { ...HOME, at: Date.now(), outcome: park ? 'park' : 'outside' };
  } catch {
    record = { ...HOME, at: Date.now(), outcome: 'error' };
  }
  const tripGoal = await getTripGoal().then(data => ({ data }), error => ({ error }));
  return { me: me.data.data, record, tripGoal };
}

test('cold launch at home with the bare tunnel host OTA env: requests reach /api, home confirms, trip goals load', async () => {
  const log = [];
  const apiUrl = resolveApiUrl({ isDev: false, channel: 'internal-tunnel', publicEnvUrl: TUNNEL_HOST, bakedUrl: TUNNEL_HOST });
  const { client, reachability } = loadClient(apiUrl, log);
  const { me, record, tripGoal } = await coldLaunchAtHome(client);

  assert.deepEqual(log, ['GET /api/me', 'POST /api/me/current-park', 'GET /api/me/trip-goal']);
  assert.equal(me.id, 1);
  assert.equal(record.outcome, 'outside');
  assert.equal(isConfirmedOutsidePark(HOME, record), true, 'LOCATION CHECK card must clear');
  assert.ok(tripGoal.data, `trip goal failed: ${tripGoal.error?.message}`);
  assert.ok(!reachability.includes('down'));
});

test('the pre-fix base URL reproduces the outage, so this test guards the right thing', async () => {
  const log = [];
  const { client } = loadClient(TUNNEL_HOST, log);
  await assert.rejects(client.get('/me'), error => error?.response?.status === 404);
  const { getTripGoal } = loadTs('src/api/endpoints/me/trip-goal.ts', { '../../client': client });
  await assert.rejects(getTripGoal());
  assert.ok(log.every(line => !line.includes(' /api/')), log.join(', '));
});

test('OTA publishing takes the API env from eas.json, not the shell, and checks the bundle', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const { publishEnv, assertBundleTargets } = require(path.join(root, 'tools/publish-update.cjs'));
  const env = publishEnv('internal-tunnel', { PATH: '/bin', EXPO_PUBLIC_API_URL: TUNNEL_HOST, API_URL: TUNNEL_HOST });
  assert.match(env.EXPO_PUBLIC_API_URL, /^https:\/\/[^/]+\/api$/);
  assert.equal(env.API_URL, env.EXPO_PUBLIC_API_URL);
  assert.equal(env.TPS_INTERNAL_TUNNEL_BUILD, '1');
  // Store channels pin the API in code; a stray shell value never reaches the bundle.
  assert.equal(publishEnv('production', { EXPO_PUBLIC_API_URL: TUNNEL_HOST }).EXPO_PUBLIC_API_URL, undefined);

  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tps-dist-'));
  const ios = path.join(dist, '_expo/static/js/ios');
  fs.mkdirSync(ios, { recursive: true });
  fs.writeFileSync(path.join(ios, 'index-x.hbc'), Buffer.from(`\0${TUNNEL_HOST}.android.voicemail\0`));
  assert.throws(() => assertBundleTargets(dist, `${TUNNEL_HOST}/api`), /does not contain/);
  fs.writeFileSync(path.join(ios, 'index-x.hbc'), Buffer.from(`\0${TUNNEL_HOST}/apiToLocal\0`));
  assertBundleTargets(dist, `${TUNNEL_HOST}/api`);
  fs.rmSync(dist, { recursive: true, force: true });
});
