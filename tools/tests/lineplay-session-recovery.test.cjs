const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/LinePlaySession.ts';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const crewCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/lineplay/crewRelay.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const crewModule = { exports: {} };
vm.runInNewContext(crewCode, { module: crewModule, exports: crewModule.exports }, { filename: 'crewRelay.ts' });
const gridCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/lineplay/crewGrid.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const gridModule = { exports: {} };
vm.runInNewContext(gridCode, { module: gridModule, exports: gridModule.exports }, { filename: 'crewGrid.ts' });

function makeHarness(saved, server, chapter = null, readResponse = null, questSubmit = null,
  backgroundPermission = { granted: true }, completeResponse = null, heartbeatResponse = null) {
  const calls = { start: 0, read: 0, complete: 0, signal: 0, puzzle: 0,
    backgroundStarted: [], backgroundStopped: [], queued: [], written: [], removed: [], chapterArgs: [],
    currentQuest: [], completeArgs: [], selectedEpisodes: [], recordedEpisodes: [], triviaPrimed: [] };
  const asDefault = fn => ({ default: fn });
  const mocks = {
    '@react-native-async-storage/async-storage': { default: {} },
    '../../api/endpoints/me/inline-timer/start': asDefault(async () => {
      calls.start++;
      return typeof server === 'function' ? server() : server;
    }),
    '../../api/endpoints/me/inline-timer/complete': asDefault(async (...args) => {
      calls.complete++; calls.completeArgs.push(args);
      return completeResponse ? completeResponse(...args) : server;
    }),
    '../../api/endpoints/me/inline-timer/heartbeat': asDefault(async (...args) =>
      heartbeatResponse ? heartbeatResponse(...args) : server),
    '../../api/endpoints/me/inline-timer/read': asDefault(async () => {
      calls.read++;
      return readResponse ? readResponse(calls.read) : server;
    }),
    '../../api/endpoints/me/inline-timer/signal': asDefault(async () => { calls.signal++; return null; }),
    '../../api/endpoints/me/inline-timer/puzzle': asDefault(async () => { calls.puzzle++; return null; }),
    '../../api/endpoints/me/inline-timer/currentQuest': asDefault(async (...args) => {
      calls.currentQuest.push(args);
      return questSubmit ? questSubmit(...args) : { success: true, verified: true, bonus_pending: true };
    }),
    '../../api/endpoints/me/park-projects': { voteParkProject: async () => null },
    './rewardRecovery': {
      linePlayRewardQueue: {
        async enqueue(value, key) { calls.queued.push({ value, key }); },
        async drain() {},
      },
      subscribeLinePlayRewardRecovery: () => () => {},
    },
    './content': { buildPredictionCard: () => ({ id: 'new-prediction' }) },
    './chapters': {
      getLinePlayChapter: (...args) => { calls.chapterArgs.push(args); return chapter; },
    },
    './episodeRotation': { selectAdaptiveEpisode: async (...args) => {
      calls.selectedEpisodes.push(args); return 1;
    }, recordAdaptiveEpisode: async (...args) => { calls.recordedEpisodes.push(args); } },
    './crewRelay': crewModule.exports,
    './crewGrid': gridModule.exports,
    './navigationPanel': require('./helpers/navigation-panel.cjs'),
    './replay': require('./helpers/lineplay-replay.cjs'),
    './triviaDeck': { primeTriviaDeck: async (...args) => { calls.triviaPrimed.push(args); } },
    './checkpoint': {
      readCheckpoint: async () => saved,
      writeCheckpoint: async value => { calls.written.push(JSON.parse(JSON.stringify(value))); },
      removeCheckpoint: async (...args) => { calls.removed.push(args); },
    },
    './backgroundQueueHeartbeat': {
      activateQueueBackgroundHeartbeat: async (...args) => {
        calls.backgroundStarted.push(args);
        return backgroundPermission.granted;
      },
      deactivateQueueBackgroundHeartbeat: async id => { calls.backgroundStopped.push(id); },
    },
    '../../games/trivia/config': { LINEPLAY_ROUND_QUESTIONS: 5 },
  };
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console,
    Date,
    Math,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
  }, { filename: file });
  return { Session: moduleRef.exports.LinePlaySession,
    isRecentQueueSample: moduleRef.exports.isRecentQueueSample,
    generatePlaylist: moduleRef.exports.generatePlaylist, calls };
}

const ride = { rideId: 99, rideName: 'Test Ride', parkId: 2,
  postedWaitMinutes: 25, postedWaitObservedAt: Date.now() };
const startedAt = Date.now() - 120_000;
const saved = {
  version: 1, playerId: 12, rideId: 99,
  startRequestId: 'line-restore-request-001', serverSessionId: 'server-123',
  startedAt, endedAt: null, plannedWaitMinutes: 25,
  waitSource: 'posted',
  playlist: [{ kind: 'minigame', id: 'mg-1', gameId: 'memory', seed: 1 }],
  completedActivityIds: ['mg-1'],
  prediction: { card: { id: 'pred-1' }, guess: 'beat' },
  state: 'active', verifiedEligibleSeconds: 90,
  rewards: null, rewardsPending: false,
};

test('navigation repair pauses instantly, keeps rotations through remount and counts once without currency', async () => {
  const logic = require('./helpers/navigation-panel.cjs');
  const chapter = { id: 'mk-space-mountain', navigationPanel: true };
  const id = `${chapter.id}-trivia`, seed = 0;
  const { Session, calls } = makeHarness({ ...saved, playlist: [{ kind: 'trivia', id, seed }],
    completedActivityIds: [] }, server, chapter);
  const session = new Session(); await session.start(ride, undefined, 12);
  session.rotateNavigationPanel(id, 3); await session.checkpointWrites;
  const first = JSON.stringify(session.snapshot().navigationPanels);
  session.pause('manual'); session.rotateNavigationPanel(id, 3); session.startNextNavigationRound(id);
  assert.equal(JSON.stringify(session.snapshot().navigationPanels), first);
  session.resume(); session.rotateNavigationPanel('another-ride-trivia', 0);
  assert.equal(JSON.stringify(session.snapshot().navigationPanels), first);
  const checkpoint = calls.written.at(-1); session.dispose();
  const { Session: Restored, calls: restoredCalls } = makeHarness(checkpoint, server, chapter);
  const restored = new Restored(); await restored.start(ride, undefined, 12);
  assert.equal(JSON.stringify(restored.snapshot().navigationPanels), first);
  const board = logic.createNavigationPanel(seed);
  for (let step = 0; step < 24; step++) {
    const progress = restored.snapshot().navigationPanels[id];
    const index = logic.nextNavigationRepair(board, progress);
    if (index == null) break;
    restored.rotateNavigationPanel(id, index);
  }
  const solved = restored.snapshot().navigationPanels[id];
  assert.equal(logic.traceNavigationPanel(board, solved.rotations).solved, true);
  assert.equal(restored.snapshot().completedActivityIds.filter(value => value === id).length, 1);
  assert.equal(restored.snapshot().rewards, null); assert.equal(restoredCalls.complete, 0);
  restored.rotateNavigationPanel(id, 0);
  assert.equal(restored.snapshot().navigationPanels[id].taps, solved.taps);
  restored.startNextNavigationRound(id);
  const replay = restored.snapshot().navigationPanels[id];
  assert.equal(replay.round, 1); assert.equal(replay.taps, 0);
  assert.equal(logic.traceNavigationPanel(logic.createNavigationPanel(seed, 1), replay.rotations).solved, false);
  assert.equal(restored.snapshot().completedActivityIds.filter(value => value === id).length, 1);
  const isolated = restored.snapshot().navigationPanels[id]; isolated.rotations[0] = 99;
  assert.notEqual(restored.snapshot().navigationPanels[id].rotations[0], 99, 'published snapshots cannot change controller state');
  await restored.checkpointWrites;
  assert.equal(restoredCalls.written.at(-1).navigationPanels[id].round, 1);
  restored.dispose();
});
const server = {
  success: true, session_id: 'server-123', status: 'active',
  started_at: new Date(startedAt).toISOString(), ended_at: null,
  duration_seconds: 90, eligible_seconds: 90,
  part_interval_seconds: 600, session_part_cap: 12,
  ticket_interval_seconds: 600, ticket_available: true,
  signal: null, park_project: null, rewards: null,
};

test('a ride without queue rewards keeps solo play available and stops futile start retries', async () => {
  const { Session, calls } = makeHarness(null, () => {
    throw { response: { status: 404 } };
  });
  const session = new Session();
  const sample = { latitude: 1, longitude: 2, timestamp: Date.now() };
  await session.start(ride, sample, 12);
  const snap = session.snapshot();
  assert.equal(snap.state, 'active');
  assert.equal(snap.serverSessionId, null);
  assert.equal(snap.rewardUnavailable, true);
  assert.ok(snap.playlist.length > 0);
  await session.heartbeat(sample);
  assert.equal(calls.start, 1);
  session.dispose();
});

test('remount restores chapter progress and reads the same server session', async () => {
  const { Session, calls } = makeHarness(saved, server);
  const session = new Session();
  await session.start(ride, { latitude: 1, longitude: 2 }, 12);
  const snap = session.snapshot();
  assert.equal(snap.state, 'active');
  assert.deepEqual(JSON.parse(JSON.stringify(snap.playlist)), saved.playlist);
  assert.deepEqual(JSON.parse(JSON.stringify(snap.completedActivityIds)), ['mg-1']);
  assert.equal(snap.prediction.guess, 'beat');
  assert.equal(snap.serverSessionId, 'server-123');
  assert.equal(calls.read, 1);
  assert.equal(calls.start, 0);
  assert.equal(calls.complete, 0);
  assert.deepEqual(calls.backgroundStarted, [['server-123', 12]]);
  assert.equal(calls.written.at(-1).startRequestId, saved.startRequestId);
  assert.equal(calls.chapterArgs[0][3], undefined);
  session.dispose();
});

test('offline-first queue play connects its existing session when a fresh fix arrives later', async () => {
  const { Session, calls } = makeHarness(null, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(session.snapshot().state, 'active');
  assert.ok(session.snapshot().playlist.length > 0);
  assert.equal(session.snapshot().serverSessionId, null);
  assert.equal(session.snapshot().verifiedPresenceAt, null);
  assert.equal(calls.start, 0);

  const sample = { latitude: 34.1, longitude: -118.3, timestamp: Date.now() };
  session.ingestLocation(sample);
  await session.heartbeat(sample);
  assert.equal(calls.start, 1);
  assert.equal(session.snapshot().serverSessionId, 'server-123');
  assert.ok(session.snapshot().verifiedPresenceAt >= sample.timestamp);
  assert.equal(calls.complete, 0);
  session.dispose();
});

test('the line is always moving: walking, shuffles and GPS drift never pause play', async () => {
  const { Session } = makeHarness(null, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const start = Date.now() - 60_000;
  const fix = (step, seconds, accuracyMeters, speedMps) => ({
    latitude: 34.1 + step * 0.00003, longitude: -118.3,
    timestamp: start + seconds * 1000, accuracyMeters, speedMps,
  });
  // Noisy indoor fixes, a short shuffle, then sustained accurate walking.
  session.ingestLocation(fix(0, 0, 8, 0));
  session.ingestLocation(fix(1, 3, 45, 1.2));
  session.ingestLocation(fix(2, 6, 45, 1.2));
  session.ingestLocation(fix(4, 12, 8, 1.1));
  for (let step = 5; step < 12; step++) session.ingestLocation(fix(step, step * 3, 8, 1.2));
  assert.equal(session.snapshot().state, 'active');
  assert.equal(session.snapshot().pauseReason, null);
  session.markActivityCompleted('mg-walking');
  assert.ok(session.snapshot().completedActivityIds.includes('mg-walking'), 'input keeps working while walking');
  session.dispose();
});

test('a big forward advance raises one non-pausing heads up, then cools down', async () => {
  const { Session } = makeHarness(null, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const start = Date.now() - 120_000;
  // About 3.3m per step north: 6 accurate steps over 30s is a 20m jump forward.
  const fix = (step, seconds, accuracyMeters = 6) => ({
    latitude: 34.1 + step * 0.00003, longitude: -118.3, timestamp: start + seconds * 1000, accuracyMeters, speedMps: 0.9,
  });
  for (let step = 0; step <= 3; step++) session.ingestLocation(fix(step, step * 5));
  assert.equal(session.snapshot().queueAdvanceAt, null, 'a small shuffle is not worth a heads up');
  for (let step = 4; step <= 6; step++) session.ingestLocation(fix(step, step * 5));
  const advance = session.snapshot().queueAdvanceAt;
  assert.ok(advance != null);
  assert.equal(session.snapshot().state, 'active');
  session.acknowledgeQueueAdvance();
  assert.equal(session.snapshot().queueAdvanceAt, null);
  // Another jump right away stays quiet: the guest is playing, not being nagged.
  for (let step = 7; step <= 14; step++) session.ingestLocation(fix(step, step * 5));
  assert.equal(session.snapshot().queueAdvanceAt, null);
  // Inaccurate fixes never count toward a heads up.
  const noisy = makeHarness(null, server);
  const other = new noisy.Session();
  await other.start(ride, undefined, 12);
  for (let step = 0; step <= 10; step++) other.ingestLocation(fix(step * 3, step * 5, 40));
  assert.equal(other.snapshot().queueAdvanceAt, null);
  other.dispose();
  session.dispose();
});

test('leaving the queue area starts the wrap-up only after three minutes of fresh away fixes', async () => {
  let near = true;
  const { Session } = makeHarness(null, server, null, null, null, { granted: true }, null, async () => {
    if (near) return server;
    throw { response: { status: 422, data: { message: 'Queue rewards paused until you are near the ride.' } } };
  });
  const session = new Session();
  const sample = { latitude: 34.1, longitude: -118.3, timestamp: Date.now(), accuracyMeters: 8 };
  await session.start(ride, sample, 12);
  assert.equal(session.snapshot().serverSessionId, 'server-123');
  near = false;
  const heartbeatAway = at => session.heartbeat({ ...sample, timestamp: at });
  const t0 = Date.now();
  await heartbeatAway(t0);
  await heartbeatAway(t0 + 30_000);
  await heartbeatAway(t0 + 60_000);
  await heartbeatAway(t0 + 90_000);
  assert.equal(session.snapshot().state, 'active', 'a 90 second drift through an indoor queue is not enough');
  await heartbeatAway(t0 + 150_000);
  assert.equal(session.snapshot().state, 'active', 'still under three minutes');
  await heartbeatAway(t0 + 180_000);
  assert.equal(session.snapshot().state, 'ending');
  assert.equal(session.snapshot().endReason, 'left_queue');
  assert.equal(session.snapshot().boardingConfirmed, false, 'leaving never confirms boarding');
  // "Still in line" undoes it and clears the streak.
  session.undoEnd();
  assert.equal(session.snapshot().state, 'active');
  assert.equal(session.snapshot().endReason, null);
  await heartbeatAway(t0 + 210_000);
  assert.equal(session.snapshot().state, 'active');
  // A noisy fix never counts, and one near answer resets the streak.
  await session.heartbeat({ ...sample, accuracyMeters: 120, timestamp: t0 + 240_000 });
  assert.equal(session.awaySamples, 1);
  near = true;
  await session.heartbeat({ ...sample, timestamp: t0 + 270_000 });
  assert.equal(session.awaySamples, 0);
  session.dispose();
});

test('one out-of-radius ride detection mid-queue never ends the wait or confirms boarding', async () => {
  const { Session, calls } = makeHarness(null, server);
  const session = new Session();
  const sample = { latitude: 34.1, longitude: -118.3, timestamp: Date.now(), accuracyMeters: 8 };
  await session.start(ride, sample, 12);
  session.suggestBoarded();
  let snap = session.snapshot();
  assert.equal(snap.state, 'active', 'a detection only asks; play keeps going');
  assert.equal(snap.boardingSuggested, true);
  assert.equal(snap.boardingConfirmed, false, 'boarding is never inferred');
  assert.equal(snap.endReason, null);
  assert.equal(snap.graceMsRemaining, 0, 'no countdown runs');
  // "Still in line" clears the question; the session is untouched.
  session.dismissBoardingSuggestion();
  assert.equal(session.snapshot().boardingSuggested, false);
  assert.equal(session.snapshot().state, 'active');
  assert.equal(calls.complete, 0);
  // Only the guest's own answer records boarding.
  session.suggestBoarded();
  session.markActivityCompleted('mg-late');
  await session.endNow(true);
  snap = session.snapshot();
  assert.equal(snap.state, 'complete');
  assert.equal(snap.endReason, 'boarded');
  assert.equal(snap.boardingConfirmed, true);
  assert.equal(snap.boardingSuggested, false);
  assert.ok(snap.completedActivityIds.includes('mg-late'));
  assert.equal(calls.complete, 1);
  await session.forgetCheckpoint();
  session.dispose();
});

test('the wrap-up countdown holds while a mini-game is open and resumes where it left off', async () => {
  const { Session, calls } = makeHarness(null, server);
  const session = new Session();
  const sample = { latitude: 34.1, longitude: -118.3, timestamp: Date.now(), accuracyMeters: 8 };
  await session.start(ride, sample, 12);
  session.setGameOpen(true);
  session.beginEnding(false, 'left_queue');
  assert.equal(session.snapshot().state, 'ending');
  const held = session.snapshot().graceMsRemaining;
  assert.ok(held > 59_000);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(session.snapshot().graceMsRemaining, held, 'held while the game is open');
  assert.equal(session.graceTimer, null, 'no timer can complete the wait mid-game');
  // A round finished inside the game still lands in the recap.
  session.markActivityCompleted('mg-in-game');
  session.setGameOpen(false);
  assert.ok(session.graceTimer != null);
  assert.ok(session.snapshot().graceMsRemaining <= held);
  assert.ok(session.snapshot().graceMsRemaining > held - 1_000);
  assert.ok(session.snapshot().completedActivityIds.includes('mg-in-game'));
  assert.equal(calls.complete, 0);
  session.dispose();
});

test('"Still in line" after the wrap-up settled starts a fresh session that keeps the playlist', async () => {
  let starts = 0;
  const { Session, calls } = makeHarness(null, () => ({ ...server, session_id: `server-${++starts}` }));
  const session = new Session();
  const sample = { latitude: 34.1, longitude: -118.3, timestamp: Date.now(), accuracyMeters: 8 };
  await session.start(ride, sample, 12);
  session.ingestLocation(sample);
  const first = session.snapshot();
  assert.equal(first.serverSessionId, 'server-1');
  session.markActivityCompleted(first.playlist[0].id);
  session.beginEnding(false, 'left_queue');
  await session.complete();
  assert.equal(session.snapshot().state, 'complete');
  assert.equal(calls.complete, 1);
  await session.continueInLine();
  const next = session.snapshot();
  assert.equal(next.state, 'active');
  assert.equal(next.endReason, null);
  assert.equal(next.endedAt, null);
  assert.equal(next.serverSessionId, 'server-2', 'a new server session, the settled one keeps its rewards');
  assert.deepEqual(next.playlist.map(item => item.id), first.playlist.map(item => item.id));
  assert.ok(next.completedActivityIds.includes(first.playlist[0].id));
  assert.equal(next.startedAt, first.startedAt, 'the clock runs on until the new server session reports its start');
  session.dispose();
});

test('an episode checkpoint restores its original story seed', async () => {
  const episodeSave = { ...saved, playlist: [
    { kind: 'chapter_intro', id: 'queue-2-test-ride-episode-1-intro' },
    { kind: 'trivia', id: 'queue-2-test-ride-episode-1-trivia', seed: 1 },
  ] };
  const { Session, calls } = makeHarness(episodeSave, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(calls.chapterArgs[0][3], 1);
  assert.deepEqual(JSON.parse(JSON.stringify(session.snapshot().playlist)), episodeSave.playlist);
  session.dispose();
});

test('a new adaptive chapter is recorded only after its first activity, once', async () => {
  const chapter = { id: 'queue-2-test-ride-episode-1', adaptive: true, episodeCount: 3,
    fieldNotes: [], finale: { idSuffix: 'finale', title: 'Finale', preview: 'Play' } };
  const { Session, calls } = makeHarness(null, server, chapter);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(calls.selectedEpisodes.length, 1);
  assert.equal(calls.recordedEpisodes.length, 0);
  session.markActivityCompleted(`${chapter.id}-trivia`);
  session.markActivityCompleted(`${chapter.id}-finale`);
  assert.deepEqual(calls.recordedEpisodes, [[12, 2, 99, 1, 3]]);
  session.dispose();
});

test('an authored chapter starts new players on flight 1 and records flight 1 without a suffix', async () => {
  const chapter = { id: 'mk-space-mountain', episodeCount: 3, navigationPanel: true,
    fieldNotes: [], finale: { idSuffix: 'star-chart', title: 'Finale', preview: 'Play' } };
  const { Session, calls } = makeHarness(null, server, chapter);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(calls.selectedEpisodes.length, 1);
  // Authored stories never start mid-series: the no-history start is episode 0.
  assert.equal(calls.selectedEpisodes[0][4], 0);
  session.markActivityCompleted(`${chapter.id}-field-note`);
  assert.deepEqual(calls.recordedEpisodes, [[12, 2, 99, 0, 3]]);
  session.dispose();
});

test('a single-story chapter never touches episode history', async () => {
  const chapter = { id: 'dl-space-mountain', fieldNotes: [],
    finale: { idSuffix: 'launch-code', title: 'Finale', preview: 'Play' } };
  const { Session, calls } = makeHarness(null, server, chapter);
  const session = new Session();
  await session.start(ride, undefined, 12);
  session.markActivityCompleted(`${chapter.id}-field-note`);
  assert.equal(calls.selectedEpisodes.length, 0);
  assert.equal(calls.recordedEpisodes.length, 0);
  session.dispose();
});

test('queue presence accepts only recent raw position fixes', () => {
  const { isRecentQueueSample } = makeHarness(saved, server);
  const now = Date.now();
  const point = { latitude: 34.1, longitude: -118.3 };
  assert.equal(isRecentQueueSample({ ...point, timestamp: now - 30_000 }, now), true);
  assert.equal(isRecentQueueSample({ ...point, timestamp: now - 46_000 }, now), false);
  assert.equal(isRecentQueueSample({ ...point, timestamp: now + 6_000 }, now), false);
  assert.equal(isRecentQueueSample(point, now), false);
});

test('shared state refreshes without claiming queue time when GPS is unavailable', async () => {
  const response = { ...server, signal: null, eligible_seconds: 90 };
  const { Session, calls } = makeHarness(saved, response);
  const session = new Session();
  await session.start(ride, undefined, 12);
  response.signal = { park_day: 'today', route_a_votes: 4, route_b_votes: 6 };
  await session.refreshSharedState();
  assert.equal(calls.read, 1); // restored read starts a 60-second throttle
  session.lastSharedReadAttemptAt = 0;
  await session.refreshSharedState();
  assert.equal(calls.read, 2);
  assert.equal(session.snapshot().signal.route_b_votes, 6);
  assert.equal(session.snapshot().verifiedEligibleSeconds, 90);
  session.dispose();
});

test('an older shared read cannot replace a newer heartbeat result', async () => {
  const response = { ...server, signal: { route_a_votes: 1, route_b_votes: 1 } };
  let finishRead;
  const oldRead = new Promise(resolve => { finishRead = resolve; });
  const { Session } = makeHarness(saved, response, null,
    index => index === 1 ? response : oldRead);
  const session = new Session();
  await session.start(ride, undefined, 12);
  session.lastSharedReadAttemptAt = 0;
  const pending = session.refreshSharedState();
  response.signal = { route_a_votes: 8, route_b_votes: 12 };
  await session.heartbeat({ latitude: 34.1, longitude: -118.3,
    timestamp: Date.now() });
  finishRead({ ...response, signal: { route_a_votes: 2, route_b_votes: 2 } });
  await pending;
  assert.equal(session.snapshot().signal.route_b_votes, 12);
  session.dispose();
});

test('verified queue session starts background tracking once and stops it at completion', async () => {
  const { Session, calls } = makeHarness(saved, server);
  const session = new Session();
  await session.start(ride, { latitude: 1, longitude: 2 }, 12);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.snapshot().backgroundTrackingAvailable, true);
  await session.heartbeat({ latitude: 1, longitude: 2 });
  assert.equal(calls.backgroundStarted.length, 1);
  await session.complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.backgroundStopped, ['server-123']);
  assert.equal(session.snapshot().backgroundTrackingAvailable, null);
  session.dispose();
});

test('leaving a recap waits for the same in-flight reward settlement', async () => {
  let finishCompletion;
  const heldResponse = new Promise(resolve => { finishCompletion = resolve; });
  const { Session, calls } = makeHarness(saved, server, null, null, null,
    { granted: true }, () => heldResponse);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const first = session.complete();
  assert.equal(session.snapshot().state, 'complete');
  let secondFinished = false;
  const second = session.complete().then(() => { secondFinished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.complete, 1);
  assert.equal(secondFinished, false);
  finishCompletion(server);
  await Promise.all([first, second]);
  assert.equal(secondFinished, true);
  assert.equal(calls.complete, 1);
  session.dispose();
});

test('active queue retries background tracking after the guest grants access', async () => {
  const backgroundPermission = { granted: false };
  const { Session, calls } = makeHarness(saved, server, null, null, null, backgroundPermission);
  const session = new Session();
  await session.start(ride, { latitude: 1, longitude: 2 }, 12);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.snapshot().backgroundTrackingAvailable, false);
  assert.equal(calls.backgroundStarted.length, 1);

  backgroundPermission.granted = true;
  assert.equal(await session.retryBackgroundTracking(), true);
  assert.equal(session.snapshot().backgroundTrackingAvailable, true);
  assert.deepEqual(calls.backgroundStarted.map(([id, playerId]) => [id, playerId]),
    [['server-123', 12], ['server-123', 12]]);
  assert.equal(calls.complete, 0);
  session.dispose();
});

test('Current Quest sends a server-seeded route and records verification before completion', async () => {
  const response = { ...server, current_quest_bonus_enabled: true,
    current_quest_seed: 314159, current_quest_verified: false };
  const { Session, calls } = makeHarness(saved, response);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const paths = [[0, 1, 5, 9, 10, 11, 15], [0, 5, 6, 7, 8, 9, 14, 19, 24],
    [0, 5, 6, 7, 12, 13, 18, 19, 24]];
  session.recordCurrentQuest({ seed: 314159, score: 975, duration: 70, paths });
  await session.currentQuestSubmission;
  assert.equal(calls.currentQuest.length, 1);
  assert.equal(calls.currentQuest[0][0], 'server-123');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.currentQuest[0][1].paths)), paths);
  assert.equal(session.snapshot().currentQuestVerified, true);
  await session.complete();
  assert.equal(calls.completeArgs[0][3], undefined);
  session.dispose();
});

test('failed Current Quest submission travels with the idempotent completion request', async () => {
  const response = { ...server, current_quest_bonus_enabled: true,
    current_quest_seed: 314159, current_quest_verified: false };
  const { Session, calls } = makeHarness(saved, response, null, null,
    async () => { throw new Error('network unavailable'); });
  const session = new Session();
  await session.start(ride, undefined, 12);
  const paths = [[0, 1, 5, 9, 10, 11, 15], [0, 5, 6, 7, 8, 9, 14, 19, 24],
    [0, 5, 6, 7, 12, 13, 18, 19, 24]];
  session.recordCurrentQuest({ seed: 314159, score: 975, duration: 70, paths });
  await session.complete();
  assert.equal(session.snapshot().currentQuestProofPending, true);
  assert.equal(calls.completeArgs[0][3].score, 975);
  assert.equal(calls.completeArgs[0][3].duration_seconds, 70);
  session.dispose();
});

test('a queue clue choice survives a remount and cannot change while the line is moving', async () => {
  const clueSave = { ...saved,
    playlist: [...saved.playlist, { kind: 'lore', id: 'lo-2', seed: 2 }],
    loreChoices: { 'lo-2': 1 },
  };
  const { Session, calls } = makeHarness(clueSave, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(session.snapshot().loreChoices['lo-2'], 1);
  session.chooseLore('lo-2', 2);
  assert.equal(session.snapshot().loreChoices['lo-2'], 2);
  session.pause('manual');
  session.chooseLore('lo-2', 0);
  assert.equal(session.snapshot().loreChoices['lo-2'], 2);
  session.resume();
  session.chooseLore('lo-2', -1);
  assert.equal(session.snapshot().loreChoices['lo-2'], undefined);
  session.chooseLore('mg-1', 0);
  assert.equal(session.snapshot().loreChoices['mg-1'], undefined);
  await session.forgetCheckpoint();
  assert.equal(calls.written.some(entry => entry.loreChoices['lo-2'] === 2), true);
  session.dispose();
});

test('crew grid marks survive a remount and a completed row counts once without server rewards', async () => {
  const gridSave = { ...saved, completedActivityIds: [], crewGridMarks: [],
    playlist: [...saved.playlist, { kind: 'crew_grid', id: 'chapter-crew-grid', seed: 77 }],
  };
  const { Session, calls } = makeHarness(gridSave, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  session.chooseCrewGridSquare(0);
  session.pause('manual');
  session.chooseCrewGridSquare(1);
  assert.deepEqual(JSON.parse(JSON.stringify(session.snapshot().crewGridMarks)), [0]);
  session.resume();
  session.chooseCrewGridSquare(1);
  session.chooseCrewGridSquare(2);
  session.chooseCrewGridSquare(3);
  assert.deepEqual(JSON.parse(JSON.stringify(session.snapshot().crewGridMarks)), [0, 1, 2]);
  assert.equal(session.snapshot().completedActivityIds.filter(id => id === 'chapter-crew-grid').length, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.written.at(-1).crewGridMarks)), [0, 1, 2]);
  assert.equal(calls.complete, 0);
  const { Session: Restored } = makeHarness(calls.written.at(-1), server);
  const restored = new Restored();
  await restored.start(ride, undefined, 12);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.snapshot().crewGridMarks)), [0, 1, 2]);
  assert.equal(restored.snapshot().completedActivityIds.includes('chapter-crew-grid'), true);
  restored.dispose();
  session.dispose();
});

test('a completed server session restores confirmed rewards without minting twice', async () => {
  const endedAt = new Date().toISOString();
  const confirmed = {
    ...server, status: 'completed', ended_at: endedAt,
    rewards: { ride_parts: [{ ride_part: 'test', quantity: 1 }], bonus_energy: 10, experience: 5, tickets: 1 },
  };
  const { Session, calls } = makeHarness({ ...saved, state: 'complete', endedAt: Date.now(), rewardsPending: true }, confirmed);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const snap = session.snapshot();
  assert.equal(snap.state, 'complete');
  assert.equal(snap.rewards.rideParts[0].quantity, 1);
  assert.equal(snap.rewards.tickets, 1);
  assert.equal(snap.rewardsPending, false);
  assert.equal(calls.read, 1);
  assert.equal(calls.complete, 0);
  assert.equal(calls.queued.length, 0);
  session.dispose();
});

test('wait prediction needs explicit boarding and survives a remount', async () => {
  const { Session, calls } = makeHarness(saved, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(session.snapshot().boardingConfirmed, false);
  session.beginEnding(true);
  assert.equal(session.snapshot().boardingConfirmed, true);
  assert.ok(session.snapshot().boardingAt >= startedAt);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.written.at(-1).boardingConfirmed, true);
  assert.equal(calls.written.at(-1).boardingAt, session.snapshot().boardingAt);
  session.undoEnd();
  assert.equal(session.snapshot().boardingConfirmed, false);
  assert.equal(session.snapshot().boardingAt, null);
  session.beginEnding(false);
  await session.complete();
  assert.equal(session.snapshot().boardingConfirmed, false);
  assert.equal(session.snapshot().boardingAt, null);
  session.dispose();

  const { Session: Restored } = makeHarness({
    ...saved, state: 'complete', endedAt: Date.now(), boardingConfirmed: true,
    boardingAt: Date.now() - 30_000,
  }, server);
  const restored = new Restored();
  await restored.start(ride, undefined, 12);
  assert.equal(restored.snapshot().boardingConfirmed, true);
  assert.ok(restored.snapshot().boardingAt > startedAt);
  restored.dispose();
});

test('confirmed line exit settles immediately without grace-period reward time', async () => {
  const { Session, calls } = makeHarness(saved, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  await session.endNow(true);
  assert.equal(session.snapshot().state, 'complete');
  assert.equal(session.snapshot().boardingConfirmed, true);
  assert.ok(session.snapshot().endedAt - session.snapshot().boardingAt < 1000);
  assert.equal(calls.complete, 1);
  session.dispose();
});

test('legacy checkpoint does not revive an unverified wait prediction', async () => {
  const legacy = { ...saved, waitSource: undefined, playlist: [
    ...saved.playlist, { kind: 'prediction', id: 'pred-4', card: { id: 'pred-1' } },
  ] };
  const { Session, generatePlaylist } = makeHarness(legacy, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(session.snapshot().waitSource, 'estimate');
  assert.equal(session.snapshot().prediction, null);
  assert.equal(session.snapshot().playlist.some(item => item.kind === 'prediction'), false);
  assert.equal(generatePlaylist(20, 20, null, false).some(item => item.kind === 'prediction'), false);
  session.dispose();
});

test('a remount with an aged wait drops an unchosen prediction', async () => {
  const { Session } = makeHarness({ ...saved, prediction: null, playlist: [
    ...saved.playlist, { kind: 'prediction', id: 'pred-4', card: { id: 'pred-1' } },
  ] }, server);
  const session = new Session();
  await session.start({ ...ride, postedWaitObservedAt: Date.now() - 20 * 60_000 }, undefined, 12);
  assert.equal(session.snapshot().waitSource, 'last_known');
  assert.equal(session.snapshot().prediction, null);
  assert.equal(session.snapshot().playlist.some(item => item.kind === 'prediction'), false);
  session.dispose();
});

test('a prediction already chosen at the entrance survives a stale-wait remount', async () => {
  const { Session } = makeHarness({ ...saved, playlist: [
    ...saved.playlist, { kind: 'prediction', id: 'pred-4', card: { id: 'pred-1' } },
  ] }, server);
  const session = new Session();
  await session.start({ ...ride, postedWaitObservedAt: Date.now() - 20 * 60_000 }, undefined, 12);
  assert.equal(session.snapshot().waitSource, 'last_known');
  assert.equal(session.snapshot().prediction.guess, 'beat');
  assert.equal(session.snapshot().playlist.filter(item => item.kind === 'prediction').length, 1);
  session.dispose();
});

test('a crew relay result is checkpointed and counted once after completion', async () => {
  const chapter = { id: 'mk-space-mountain', finale: {
    idSuffix: 'star-chart', title: 'Rebuild the Star Chart', preview: 'Match space symbols.',
  } };
  const { Session, generatePlaylist, calls } = makeHarness({ ...saved, crewRelay: crewModule.exports.createCrewRelay(555) }, server, chapter);
  // The three story missions come first; the one-phone Crew Relay follows the finale.
  const opening = JSON.parse(JSON.stringify(generatePlaylist(25, 25, chapter).slice(0, 5).map(item => item.kind)));
  assert.deepEqual(opening, ['chapter_intro', 'trivia', 'lore', 'minigame', 'crew_relay']);
  const session = new Session();
  await session.start(ride, undefined, 12);
  let relay = session.snapshot().crewRelay;
  relay = crewModule.exports.chooseCrewSize(relay, 1);
  relay = crewModule.exports.readyForCrewTurn(relay);
  relay = crewModule.exports.answerCrewTrivia(relay, 0, 0);
  relay = crewModule.exports.readyForCrewTurn(relay);
  relay = crewModule.exports.chooseCrewObservation(relay, 'color');
  relay = crewModule.exports.readyForCrewTurn(relay);
  relay = crewModule.exports.hideCrewMemory(relay);
  for (const symbol of relay.memorySequence) relay = crewModule.exports.pickCrewMemory(relay, symbol);
  relay = crewModule.exports.readyForCrewTurn(relay);
  relay = crewModule.exports.chooseCrewRoute(relay, 'alpha');
  session.updateCrewRelay(relay);
  assert.equal(session.snapshot().crewRelay.step, 'complete');
  assert.equal(session.snapshot().completedActivityIds.filter(id => id === 'mk-space-mountain-crew-relay').length, 1);
  await session.forgetCheckpoint();
  assert.equal(calls.written.at(-1).crewRelay.route, 'alpha');
  session.dispose();
});

test('a different ride chapter keeps its own finale in the queue playlist', () => {
  const chapter = { id: 'dl-pirates', finale: {
    idSuffix: 'compass', title: 'Rebuild the Compass', preview: 'Match nautical symbols.',
  } };
  const { generatePlaylist } = makeHarness(null, server, chapter);
  const finale = generatePlaylist(25, 25, chapter).find(item => item.id === 'dl-pirates-compass');
  assert.equal(finale?.gameId, 'memory');
  assert.equal(finale?.title, 'Rebuild the Compass');
  assert.equal(finale?.preview, 'Match nautical symbols.');
  assert.equal(generatePlaylist(25, 25, chapter).some(item => item.id === 'dl-pirates-star-chart'), false);
});

test('a manual pause prevents new activity credit, predictions, and shared input', async () => {
  const { Session, calls } = makeHarness({ ...saved, completedActivityIds: [], prediction: null }, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  session.pause('manual');
  session.markActivityCompleted('new-trivia');
  session.choosePrediction({ id: 'wait-guess' }, 'beat');
  await session.chooseSignal('route_a');
  session.puzzleRequest = { id: 'pending-guess', stage: 1, symbols: [0, 1, 2] };
  await session.guessPuzzle([0, 1, 2]);
  assert.equal(session.snapshot().completedActivityIds.length, 0);
  assert.equal(session.snapshot().prediction, null);
  assert.equal(calls.signal, 0);
  assert.equal(calls.puzzle, 0);

  session.resume();
  session.markActivityCompleted('new-trivia');
  session.choosePrediction({ id: 'wait-guess' }, 'beat');
  assert.equal(session.snapshot().completedActivityIds.length, 1);
  assert.equal(session.snapshot().prediction.guess, 'beat');
  session.dispose();
});

test('live entrance wait adds optional tail rounds without moving existing or completed cards', async () => {
  const { Session, calls } = makeHarness(null, server);
  const session = new Session();
  await session.start({ ...ride, postedWaitMinutes: 20, postedWaitObservedAt: Date.now() - 60_000 }, undefined, 12);
  const before = session.snapshot().playlist;
  session.markActivityCompleted(before[0].id);
  const firstUpdate = Date.now() - 30_000;
  session.updateEntranceWait(35, firstUpdate);
  const after = session.snapshot();
  assert.equal(after.entranceWaitMinutes, 35);
  assert.equal(after.entranceWaitChangeMinutes, 15);
  assert.ok(after.extraRoundsAdded > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(after.playlist.slice(0, before.length))),
    JSON.parse(JSON.stringify(before)));
  assert.ok(after.completedActivityIds.includes(before[0].id));
  assert.equal(after.playlist.filter(item => item.kind === 'prediction').length, 1);
  assert.equal(new Set(after.playlist.map(item => item.id)).size, after.playlist.length);
  await session.checkpointWrites;
  assert.equal(calls.written.at(-1).extraRoundsAdded, after.extraRoundsAdded);
  const extendedCheckpoint = calls.written.at(-1);

  session.updateEntranceWait(40, firstUpdate - 1000);
  assert.equal(session.snapshot().playlist.length, after.playlist.length);
  session.updateEntranceWait(25, Date.now() - 20_000);
  assert.equal(session.snapshot().entranceWaitChangeMinutes, -10);
  assert.equal(session.snapshot().playlist.length, after.playlist.length);
  session.updateEntranceWait(35, Date.now() - 10_000);
  assert.equal(session.snapshot().playlist.length, after.playlist.length);
  session.dispose();

  const { Session: RestoredSession } = makeHarness(extendedCheckpoint, server);
  const restored = new RestoredSession();
  await restored.start({ ...ride, postedWaitMinutes: 20,
    postedWaitObservedAt: Date.now() - 5_000 }, undefined, 12);
  assert.equal(restored.snapshot().playlist.length, after.playlist.length);
  assert.equal(restored.snapshot().extraRoundsAdded, after.extraRoundsAdded);
  restored.updateEntranceWait(35, Date.now());
  assert.equal(restored.snapshot().playlist.length, after.playlist.length);
  restored.dispose();
});

test('a solo guest can request fresh rounds, pause safely, and restore the longer queue plan', async () => {
  const { Session, calls } = makeHarness({ ...saved, completedActivityIds: [] }, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const opening = session.snapshot().playlist[0];
  session.pause('manual');
  assert.equal(session.addMoreRounds(), null);
  session.resume();
  const firstId = session.addMoreRounds();
  assert.ok(firstId?.startsWith('encore-'));
  assert.equal(session.snapshot().playlist[0].id, opening.id);
  assert.equal(session.snapshot().playlist.find(item => item.id === firstId)?.kind, 'minigame');
  while (session.snapshot().playlist.length < 80) assert.ok(session.addMoreRounds());
  assert.equal(session.snapshot().playlist.length, 80);
  assert.equal(session.addMoreRounds(), null);
  assert.equal(new Set(session.snapshot().playlist.map(item => item.id)).size, 80);
  await session.checkpointWrites;
  const extended = calls.written.at(-1);
  assert.equal(extended.playlist.length, 80);
  session.dispose();

  const { Session: RestoredSession } = makeHarness(extended, server);
  const restored = new RestoredSession();
  await restored.start(ride, undefined, 12);
  assert.equal(restored.snapshot().playlist.length, 80);
  assert.equal(restored.snapshot().playlist[1].id, firstId);
  restored.dispose();
});

test('a played queue chapter keeps its private story choice through offline completion', async () => {
  const chapter = { id: 'queue-2-test-ride-episode-0', title: 'The Lost Star Chart',
    relay: { routeNames: ['Follow the stars', 'Chart a new orbit'] }, finale: { idSuffix: 'star-chart' } };
  const played = { ...saved, playlist: [{ kind: 'trivia',
    id: 'queue-2-test-ride-episode-0-trivia', seed: 1 }],
    completedActivityIds: ['queue-2-test-ride-episode-0-trivia'], prediction: null };
  const { Session, calls } = makeHarness(played, server, chapter, null, null,
    { granted: true }, async () => { throw new Error('offline'); });
  const session = new Session();
  await session.start(ride, undefined, 12);
  await session.complete();
  const expected = { chapter_id: chapter.id, chapter_title: chapter.title, route_name: null, completed_missions: ['signal'] };
  assert.deepEqual(JSON.parse(JSON.stringify(calls.completeArgs[0][4])), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.queued[0].value.storyMemento)), expected);
  assert.equal(calls.queued[0].key, 'complete_server-123');
  session.dispose();
});

test('a nearby check keeps games playable and clears after the same reward request connects', async () => {
  let nearby = false;
  const { Session, calls } = makeHarness(null, () => {
    if (!nearby) throw { response: { status: 422, data: { code: 'NOT_NEAR_RIDE' } } };
    return server;
  });
  const session = new Session();
  const sample = { latitude: 1, longitude: 2, timestamp: Date.now() };
  await session.start(ride, sample, 12);
  assert.equal(session.snapshot().state, 'active');
  assert.equal(session.snapshot().rewardConnectionIssue, 'nearby');
  assert.equal(session.snapshot().rewardUnavailable, false);
  assert.equal(session.snapshot().creditedParts, null);
  const opening = session.snapshot().playlist[0].id;
  nearby = true;
  await session.connectServer(sample, true);
  assert.equal(session.snapshot().serverSessionId, server.session_id);
  assert.equal(session.snapshot().rewardConnectionIssue, null);
  assert.equal(session.snapshot().playlist[0].id, opening);
  assert.equal(calls.start, 2);
  session.dispose();
});

test('queue connection failures distinguish sign-in from network outages without awarding Parts', async () => {
  for (const [error, expected] of [
    [{ response: { status: 401 } }, 'sign_in'],
    [new Error('Network offline'), 'network'],
  ]) {
    const { Session } = makeHarness(null, () => { throw error; });
    const session = new Session();
    await session.start(ride, { latitude: 1, longitude: 2, timestamp: Date.now() }, 12);
    assert.equal(session.snapshot().rewardConnectionIssue, expected);
    assert.equal(session.snapshot().creditedParts, null);
    assert.equal(session.snapshot().serverSessionId, null);
    assert.equal(session.snapshot().state, 'active');
    session.dispose();
  }
});

test('every replay deals a new board, and the plays counter survives a restart', async () => {
  const { Session, calls } = makeHarness({ ...saved, completedActivityIds: [],
    playlist: [{ kind: 'minigame', id: 'mg-1', gameId: 'memory', seed: 41 },
      { kind: 'minigame', id: 'mg-2', gameId: 'trivia', seed: 10 }] }, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const game = session.snapshot().playlist[0];
  const first = session.beginGame(game);
  const second = session.beginGame(game);
  const third = session.beginGame(game);
  assert.equal(first.seed, 41, 'the first play keeps the saved board');
  assert.notEqual(second.seed, first.seed);
  assert.notEqual(third.seed, second.seed);
  assert.equal(session.snapshot().gamePlays['mg-1'], 3);
  // Trivia walks its deck: each replay starts after the previous five questions.
  const trivia = session.snapshot().playlist[1];
  assert.equal(session.beginGame(trivia).seed, 10);
  assert.equal(session.beginGame(trivia).seed, 15);
  await session.checkpointWrites;
  const checkpoint = calls.written.at(-1);
  assert.equal(checkpoint.gamePlays['mg-1'], 3);
  session.dispose();

  const { Session: Restored } = makeHarness(checkpoint, server);
  const restored = new Restored();
  await restored.start(ride, undefined, 12);
  const fourth = restored.beginGame(restored.snapshot().playlist[0]);
  assert.equal(fourth.plays, 3);
  assert.notEqual(fourth.seed, third.seed, 'a restart never re-deals the last board');
  assert.notEqual(fourth.seed, first.seed);
  restored.dispose();
});

test('a 2+ star run steps the next round up, and the best stars feed NEW pills', async () => {
  const { Session, calls } = makeHarness({ ...saved, completedActivityIds: [] }, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  assert.equal(session.snapshot().gameBestStars.memory, undefined);
  session.recordGameResult('memory', 1);
  assert.equal(session.snapshot().gameDifficulty.memory, undefined, 'one star keeps the level');
  assert.equal(session.snapshot().gameBestStars.memory, 1);
  session.recordGameResult('memory', 3);
  session.recordGameResult('memory', 2);
  assert.equal(session.snapshot().gameDifficulty.memory, 3);
  assert.equal(session.snapshot().gameBestStars.memory, 3, 'a weaker run never lowers the best');
  session.recordGameResult('memory', 3);
  assert.equal(session.snapshot().gameDifficulty.memory, 3, 'difficulty never passes 3');
  assert.equal(session.beginGame({ kind: 'minigame', id: 'mg-1', gameId: 'memory', seed: 1 }).difficulty, 3);
  await session.checkpointWrites;
  assert.equal(calls.written.at(-1).gameBestStars.memory, 3);
  session.dispose();
});
