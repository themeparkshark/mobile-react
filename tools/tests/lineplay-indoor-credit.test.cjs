/**
 * L1: two-checkpoint, offline-first crediting (next-wave/l1/DESIGN.md).
 * Indoor dropouts, airplane mode, a single GPS jump, a bench cheater and a
 * guest who never sends an exit, through the pure module, the session
 * controller and the reward queue.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const credit = require('./helpers/lineplay-checkpoint-credit.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

function compile(file, imports, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef, exports: moduleRef.exports,
    require(name) {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: { warn() {}, info() {}, error() {}, log() {} }, Math, JSON,
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {},
    ...globals,
  }, { filename: file });
  return moduleRef.exports;
}

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 1, 17, 0, 0);
const NEAR = { latitude: 34.1381, longitude: -118.3534 };

// ── pure module ─────────────────────────────────────────────────────────────

test('trail keeps one fix a minute, the more accurate of close fixes, oldest first', () => {
  let trail = [];
  trail = credit.appendTrail(trail, { ...NEAR, accuracyMeters: 30, at: T0 });
  trail = credit.appendTrail(trail, { ...NEAR, accuracyMeters: 8, at: T0 + 20_000 });
  trail = credit.appendTrail(trail, { ...NEAR, accuracyMeters: 50, at: T0 + 40_000 });
  assert.deepEqual(plain(trail).map(fix => [fix.at, fix.accuracyMeters]), [[T0 + 20_000, 8]]);
  trail = credit.appendTrail(trail, { ...NEAR, at: T0 - MIN }); // older: ignored
  trail = credit.appendTrail(trail, { latitude: 'x', longitude: 2, at: T0 + 5 * MIN });
  assert.equal(trail.length, 1);
  for (let i = 1; i <= 200; i++) trail = credit.appendTrail(trail, { ...NEAR, at: T0 + i * MIN });
  assert.equal(trail.length, credit.TRAIL_MAX_FIXES);
  assert.equal(trail.at(-1).at, T0 + 200 * MIN);
  const merged = credit.mergeTrails([{ ...NEAR, at: T0 + 3 * MIN }], [{ ...NEAR, at: T0 + MIN }, { ...NEAR, at: T0 + 2 * MIN }]);
  assert.deepEqual(plain(merged).map(fix => fix.at), [T0 + MIN, T0 + 2 * MIN, T0 + 3 * MIN]);
  assert.deepEqual(plain(credit.trimSynced(merged, T0 + 2 * MIN)).map(fix => fix.at), [T0 + 3 * MIN]);
});

test('indoor dropout: the phone clock shows Parts saved, never more than the server cap', () => {
  const base = { startedAt: T0, endedAt: null, postedWaitMinutes: 45, verifiedEligibleSeconds: 120,
    creditedParts: 0, partIntervalSeconds: 600, sessionPartCap: 12, partsRemainingToday: 12, syncing: true };
  // 40 minutes with no GPS or signal after a 2-minute verified start.
  const dark = credit.offlineCreditEstimate({ ...base, now: T0 + 40 * MIN });
  assert.deepEqual(plain(dark), { seconds: 2400, pendingParts: 4, syncing: true });
  // The server confirms them: nothing left pending.
  assert.equal(credit.offlineCreditEstimate({ ...base, now: T0 + 40 * MIN, verifiedEligibleSeconds: 2400,
    creditedParts: 4 }).pendingParts, 0);
  // Bench cheater: two hours beside a 20-minute ride shows the 40-minute cap.
  assert.equal(credit.offlineCreditEstimate({ ...base, postedWaitMinutes: 20, now: T0 + 120 * MIN }).seconds, 2400);
  assert.equal(credit.localCreditCapSeconds(20), 2400);
  assert.equal(credit.localCreditCapSeconds(5), 1800);
  // The server's own cap wins, and the daily cap limits what can be promised.
  assert.equal(credit.offlineCreditEstimate({ ...base, serverCapSeconds: 1800, now: T0 + 60 * MIN }).seconds, 1800);
  assert.equal(credit.offlineCreditEstimate({ ...base, partsRemainingToday: 1, now: T0 + 60 * MIN }).pendingParts, 1);
  // Unknown wait: dark time capped at an hour past what the server verified.
  assert.equal(credit.offlineCreditEstimate({ ...base, postedWaitMinutes: null, now: T0 + 300 * MIN }).seconds, 3720);
  // Never below verified time, and a finished wait stops the clock.
  assert.equal(credit.offlineCreditEstimate({ ...base, endedAt: T0 + 10 * MIN, now: T0 + 90 * MIN,
    verifiedEligibleSeconds: 700 }).seconds, 700);
});

test('exit checkpoint: boarding, a fix at the exit, the away detector and the next app open', () => {
  const base = { endReason: 'boarded', boardingAt: T0 + 40 * MIN, endedAt: T0 + 41 * MIN, firstAwayAt: null,
    reopenedAt: null, nearSinceReopen: false, recentFix: null };
  assert.deepEqual(plain(credit.buildExit(base)), { method: 'confirm', at: T0 + 40 * MIN });
  const fix = { ...NEAR, accuracyMeters: 9, at: T0 + 40 * MIN };
  assert.equal(credit.buildExit({ ...base, recentFix: fix }).method, 'geofence');
  assert.deepEqual(plain(credit.buildExit({ ...base, endReason: 'left_queue', firstAwayAt: T0 + 35 * MIN })),
    { method: 'left_queue', at: T0 + 35 * MIN });
  // Reopened after the phone died, and never near the ride again.
  assert.deepEqual(plain(credit.buildExit({ ...base, endReason: 'left_queue', firstAwayAt: T0 + 90 * MIN,
    reopenedAt: T0 + 88 * MIN })), { method: 'app_open', at: T0 + 88 * MIN });
  assert.equal(credit.buildExit({ ...base, endReason: 'left_queue', reopenedAt: T0 + 88 * MIN,
    nearSinceReopen: true, firstAwayAt: T0 + 95 * MIN }).method, 'left_queue');
});

test('wire format sends the phone clock, valid fixes and honest step readings only', () => {
  const body = credit.checkpointBody({
    exit: { method: 'geofence', at: T0 + 40 * MIN, fix: { ...NEAR, accuracyMeters: 20000, at: T0 + 40 * MIN } },
    samples: [{ ...NEAR, accuracyMeters: 12, at: T0 + MIN }, { latitude: 200, longitude: 1, at: T0 }],
    steps: { count: 500, from: T0, to: T0 + 30_000 },
  }, T0 + 41 * MIN);
  assert.deepEqual(plain(body), {
    client_now: T0 + 41 * MIN,
    samples: [{ ...NEAR, accuracy_meters: 12, at: T0 + MIN }],
    exit: { method: 'geofence', at: T0 + 40 * MIN, ...NEAR, accuracy_meters: 10000 },
  });
  assert.deepEqual(plain(credit.checkpointBody(null, T0)), {});
  assert.deepEqual(plain(credit.usableSteps({ count: 600, from: T0, to: T0 + 40 * MIN })),
    { count: 600, from: T0, to: T0 + 40 * MIN });
  assert.equal(credit.usableSteps({ count: -1, from: T0, to: T0 + 40 * MIN }), null);
});

// ── session controller ──────────────────────────────────────────────────────

function sessionHarness({ start, heartbeat, complete, saved = null, steps = null } = {}) {
  const clock = { now: T0 };
  const FakeDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  };
  const calls = { start: [], heartbeat: [], complete: [], sync: [], queued: [], written: [], steps: [] };
  const offline = () => { throw new Error('Network Error'); };
  const server = (extra = {}) => ({ success: true, session_id: 'srv-1', status: 'active',
    started_at: new Date(T0).toISOString(), ended_at: null, duration_seconds: 0, eligible_seconds: 0,
    part_interval_seconds: 600, session_part_cap: 12, signal: null, park_project: null, rewards: null, ...extra });
  const asDefault = fn => ({ default: fn });
  const Session = compile('src/services/lineplay/LinePlaySession.ts', {
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
    '../../api/endpoints/me/inline-timer/start': asDefault(async (...args) => {
      calls.start.push(args); return (start ?? offline)(...args) ?? server();
    }),
    '../../api/endpoints/me/inline-timer/complete': asDefault(async (...args) => {
      calls.complete.push(args); return (complete ?? offline)(...args);
    }),
    '../../api/endpoints/me/inline-timer/heartbeat': asDefault(async (...args) => {
      calls.heartbeat.push(args); return (heartbeat ?? offline)(...args);
    }),
    '../../api/endpoints/me/inline-timer/sync': asDefault(async (...args) => {
      calls.sync.push(plain(args)); return server({ eligible_seconds: 2400 });
    }),
    '../../api/endpoints/me/inline-timer/read': asDefault(async () => server()),
    '../../api/endpoints/me/inline-timer/signal': asDefault(async () => null),
    '../../api/endpoints/me/inline-timer/puzzle': asDefault(async () => null),
    '../../api/endpoints/me/inline-timer/currentQuest': asDefault(async () => ({ success: true })),
    '../../api/endpoints/me/park-projects': { voteParkProject: async () => null },
    './rewardRecovery': {
      linePlayRewardQueue: { async enqueue(value, key) { calls.queued.push({ value: plain(value), key }); }, async drain() {} },
      subscribeLinePlayRewardRecovery: () => () => {},
    },
    './content': { buildPredictionCard: () => ({ id: 'prediction' }) },
    './chapters': { getLinePlayChapter: () => null },
    './episodeRotation': { selectAdaptiveEpisode: async () => 1, recordAdaptiveEpisode: async () => {} },
    './crewRelay': { createCrewRelay: () => null, isCrewRelayProgress: () => false },
    './crewGrid': { crewGridHasLine: () => false },
    './navigationPanel': require('./helpers/navigation-panel.cjs'),
    './replay': require('./helpers/lineplay-replay.cjs'),
    './bonusRounds': require('./helpers/lineplay-bonus-rounds.cjs'),
    './triviaDeck': { primeTriviaDeck: async () => {} },
    './triviaHistory': { primeTriviaHistory: async () => {} },
    './checkpoint': {
      readCheckpoint: async () => saved,
      writeCheckpoint: async value => { calls.written.push(plain(value)); },
      removeCheckpoint: async () => {},
    },
    './backgroundQueueHeartbeat': {
      activateQueueBackgroundHeartbeat: async () => true,
      deactivateQueueBackgroundHeartbeat: async () => {},
      takeBackgroundTrail: async () => [],
    },
    './checkpointCredit': credit,
    './queuePedometer': {
      prepareQueuePedometer: async () => {},
      readQueueSteps: async (from, to) => { calls.steps.push([from, to]); return steps ? steps(from, to) : null; },
    },
    '../../games/trivia/config': { LINEPLAY_ROUND_QUESTIONS: 5 },
  }, { Date: FakeDate }).LinePlaySession;
  return { Session, calls, clock, server };
}

const ride = { rideId: 7, rideName: 'Indoor Coaster', parkId: 2, postedWaitMinutes: 45,
  postedWaitObservedAt: T0 - MIN, lineRewardsReady: true };
const fixAt = (clock, extra = {}) => ({ ...NEAR, accuracyMeters: 8, timestamp: clock.now, ...extra });

test('airplane mode: the whole wait offline is queued with its entry checkpoint and exit', async () => {
  const { Session, calls, clock } = sessionHarness();
  const session = new Session();
  await session.start(ride, fixAt(clock), 12);
  assert.equal(session.snapshot().serverSessionId, null);
  assert.equal(session.snapshot().offlineCredit.syncing, true);
  // GPS still works in airplane mode: fixes are kept, one a minute.
  for (let minute = 5; minute <= 35; minute += 10) {
    clock.now = T0 + minute * MIN;
    session.ingestLocation(fixAt(clock));
    await session.heartbeat(fixAt(clock));
  }
  clock.now = T0 + 40 * MIN;
  session.ingestLocation(fixAt(clock));
  assert.equal(session.snapshot().offlineCredit.pendingParts, 4);
  await session.endNow(true);
  // Every start attempt sent the entry fix and its phone-clock time.
  const late = calls.start.at(-1);
  assert.equal(late[4].clientStartedAt, T0);
  assert.deepEqual([late[2], late[3]], [NEAR.latitude, NEAR.longitude]);
  assert.equal(calls.queued.length, 1);
  const { value, key } = calls.queued[0];
  assert.equal(key, value.offlineStart.startRequestId.replace(/^/, 'offline_'));
  assert.equal(value.sessionId, '');
  assert.equal(value.offlineStart.rideId, 7);
  assert.equal(value.offlineStart.entry.at, T0);
  assert.equal(value.checkpoint.exit.method, 'geofence');
  assert.equal(value.checkpoint.exit.at, T0 + 40 * MIN);
  assert.ok(value.checkpoint.samples.length >= 3);
  assert.equal(session.snapshot().rewardsPending, true);
  const persisted = calls.written.at(-1);
  assert.equal(persisted.entryFix.at, T0);
  session.dispose();
});

test('indoor dropout: an online wait goes dark, then the next answer sends steps and syncs the trail', async () => {
  let online = true;
  const { Session, calls, clock, server } = sessionHarness({
    start: () => server(),
    heartbeat: () => { if (!online) throw new Error('Network Error'); return server({ eligible_seconds: 2430 }); },
    steps: (from, to) => ({ count: 600, from, to }),
  });
  const session = new Session();
  await session.start(ride, fixAt(clock), 12);
  assert.equal(session.snapshot().serverSessionId, 'srv-1');
  clock.now = T0 + 30_000;
  await session.heartbeat(fixAt(clock));
  // Inside the building: weak fixes, no signal.
  online = false;
  for (let minute = 10; minute <= 30; minute += 10) {
    clock.now = T0 + minute * MIN;
    await session.heartbeat(fixAt(clock, { accuracyMeters: 40 }));
  }
  assert.equal(session.snapshot().state, 'active', 'a dark queue never ends the wait');
  online = true;
  clock.now = T0 + 40 * MIN + 30_000;
  await session.heartbeat(fixAt(clock));
  // Steps covered the dark gap since the last nearby answer.
  assert.deepEqual(calls.steps.at(-1), [T0 + 30_000, T0 + 40 * MIN + 30_000]);
  assert.deepEqual(plain(calls.heartbeat.at(-1)[4]), { count: 600, from: T0 + 30_000, to: T0 + 40 * MIN + 30_000 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.sync.length, 1);
  assert.equal(calls.sync[0][1].length, 3);
  assert.equal(session.snapshot().offlineCredit.syncing, false);
  session.dispose();
});

test('a single far answer never ends the wait or drops the trail', async () => {
  let far = false;
  const { Session, clock, server } = sessionHarness({
    start: () => server(),
    heartbeat: () => {
      if (far) throw { response: { status: 422, data: { code: 'NOT_NEAR_RIDE' } } };
      return server();
    },
  });
  const session = new Session();
  await session.start(ride, fixAt(clock), 12);
  far = true;
  clock.now = T0 + MIN;
  await session.heartbeat(fixAt(clock, { latitude: 34.15 }));
  far = false;
  clock.now = T0 + 90_000;
  await session.heartbeat(fixAt(clock));
  assert.equal(session.snapshot().state, 'active');
  assert.equal(session.snapshot().offlineCredit.syncing, false, 'a far answer is not an offline fix');
  session.dispose();
});

test('a guest who never comes back: the next app open is the exit checkpoint', async () => {
  const savedAt = T0;
  const saved = {
    version: 1, playerId: 12, rideId: 7, startRequestId: 'line-reopen-request-0001', serverSessionId: 'srv-1',
    startedAt: savedAt, endedAt: null, plannedWaitMinutes: 45, waitSource: 'posted',
    playlist: [{ kind: 'trivia', id: 't-1', seed: 1 }], completedActivityIds: [], prediction: null,
    state: 'active', verifiedEligibleSeconds: 30, rewards: null, rewardsPending: false,
    entryFix: { ...NEAR, accuracyMeters: 8, at: savedAt },
  };
  const { Session, calls, clock, server } = sessionHarness({
    saved,
    heartbeat: () => { throw { response: { status: 422, data: { code: 'NOT_NEAR_RIDE' } } }; },
    complete: () => server({ status: 'completed', rewards: { ride_parts: [], bonus_energy: 0, experience: 0 } }),
  });
  // The phone died indoors; the app opens again at dinner, far away.
  clock.now = T0 + 150 * MIN;
  const session = new Session();
  await session.start(ride, undefined, 12);
  for (let i = 0; i < 4; i++) {
    clock.now = T0 + 150 * MIN + i * MIN;
    await session.heartbeat(fixAt(clock, { latitude: 34.2 }));
  }
  assert.equal(session.snapshot().state, 'ending');
  assert.equal(session.snapshot().endReason, 'left_queue');
  await session.complete();
  const checkpoint = calls.complete.at(-1)[5];
  assert.deepEqual(plain(checkpoint.exit), { method: 'app_open', at: T0 + 150 * MIN });
  session.dispose();
});

test('a late start with signal back uses the saved entry fix, not the current one', async () => {
  let online = false;
  const { Session, calls, clock, server } = sessionHarness({
    start: () => { if (!online) throw new Error('Network Error'); return server(); },
  });
  const session = new Session();
  await session.start(ride, fixAt(clock), 12);
  online = true;
  clock.now = T0 + 12 * MIN;
  await session.heartbeat(fixAt(clock, { latitude: 34.1385 }));
  const args = calls.start.at(-1);
  assert.equal(args[2], NEAR.latitude);
  assert.equal(args[4].clientStartedAt, T0);
  assert.equal(session.snapshot().serverSessionId, 'srv-1');
  session.dispose();
});

// ── reward queue ────────────────────────────────────────────────────────────

function recoveryHarness(start, complete) {
  const store = new Map();
  const storage = {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async key => { store.delete(key); },
  };
  const queue = compile('src/services/lineplay/RedeemRetryQueue.ts', {
    '@react-native-async-storage/async-storage': { default: storage },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  }, { Date });
  return compile('src/services/lineplay/rewardRecovery.ts', {
    '../../api/endpoints/me/inline-timer/complete': { default: complete },
    '../../api/endpoints/me/inline-timer/start': { default: start },
    './RedeemRetryQueue': queue,
  }, { Date });
}

test('the reward queue starts an offline wait late, then completes it with its exit', async () => {
  const starts = [], completes = [], heard = [];
  let online = false;
  const recovery = recoveryHarness(async (...args) => {
    starts.push(args);
    if (!online) throw new Error('Network Error');
    return { success: true, session_id: 'srv-late', status: 'active' };
  }, async (...args) => {
    completes.push(args);
    return { success: true, session_id: args[0], status: 'completed' };
  });
  recovery.subscribeLinePlayRewardRecovery((id, _response, requestId) => heard.push([id, requestId]));
  const entry = { ...NEAR, accuracyMeters: 9, at: T0 };
  await recovery.linePlayRewardQueue.enqueue({ sessionId: '',
    offlineStart: { rideId: 7, startRequestId: 'line-offline-request-01', entry },
    checkpoint: { exit: { method: 'confirm', at: T0 + 40 * MIN }, samples: [], steps: null } },
  'offline_line-offline-request-01');
  recovery.setLinePlayRecoverySignedIn(true);
  await new Promise(resolve => setImmediate(resolve));
  await recovery.linePlayRewardQueue.drain();
  assert.equal(await recovery.linePlayRewardQueue.size(), 1, 'kept while there is no signal');
  online = true;
  await recovery.linePlayRewardQueue.drain();
  assert.equal(await recovery.linePlayRewardQueue.size(), 0);
  assert.deepEqual(plain(starts.at(-1)), [7, 'line-offline-request-01', NEAR.latitude, NEAR.longitude,
    { clientStartedAt: T0, accuracyMeters: 9 }]);
  assert.equal(completes.length, 1);
  assert.equal(completes[0][0], 'srv-late');
  assert.equal(plain(completes[0][5]).exit.method, 'confirm');
  assert.deepEqual(heard, [['srv-late', 'line-offline-request-01']]);
});

test('an offline entry the server refuses (not near the ride) is dropped, not retried forever', async () => {
  const recovery = recoveryHarness(async () => {
    throw { response: { status: 422, data: { code: 'NOT_NEAR_RIDE' } } };
  }, async () => { throw new Error('never called'); });
  await recovery.linePlayRewardQueue.enqueue({ sessionId: '',
    offlineStart: { rideId: 7, startRequestId: 'line-offline-refused-1', entry: { ...NEAR, at: T0 } } }, 'offline_x');
  recovery.setLinePlayRecoverySignedIn(true);
  await new Promise(resolve => setImmediate(resolve));
  await recovery.linePlayRewardQueue.drain();
  assert.equal(await recovery.linePlayRewardQueue.size(), 0);
});

test('L1 stays OTA-safe: no new native modules, the pedometer is the linked expo-sensors', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['expo-sensors'], 'expo-sensors is already a dependency');
  const pods = fs.readFileSync(path.join(root, 'ios/Podfile.lock'), 'utf8');
  assert.match(pods, /ExpoSensors/);
  const pedometer = fs.readFileSync(path.join(root, 'src/services/lineplay/queuePedometer.ts'), 'utf8');
  const imports = [...pedometer.matchAll(/from '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(imports.sort(), ['./checkpointCredit', 'expo-sensors', 'react-native']);
  const pure = fs.readFileSync(path.join(root, 'src/services/lineplay/checkpointCredit.ts'), 'utf8');
  assert.doesNotMatch(pure, /^import /m, 'the crediting helpers stay pure');
  assert.doesNotMatch(pure + pedometer, /\u2014/, 'no em dashes');
});
