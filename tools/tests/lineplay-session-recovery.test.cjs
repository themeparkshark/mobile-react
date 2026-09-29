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
  backgroundPermission = { granted: true }, completeResponse = null) {
  const calls = { start: 0, read: 0, complete: 0, signal: 0, puzzle: 0,
    backgroundStarted: [], backgroundStopped: [], queued: [], written: [], removed: [], chapterArgs: [],
    currentQuest: [], completeArgs: [], selectedEpisodes: [], recordedEpisodes: [] };
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
    '../../api/endpoints/me/inline-timer/heartbeat': asDefault(async () => server),
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
      adaptiveEpisodeCountForRide: () => 3,
    },
    './episodeRotation': { selectAdaptiveEpisode: async (...args) => {
      calls.selectedEpisodes.push(args); return 1;
    }, recordAdaptiveEpisode: async (...args) => { calls.recordedEpisodes.push(args); } },
    './crewRelay': crewModule.exports,
    './crewGrid': gridModule.exports,
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

test('queue GPS drift and a short shuffle do not interrupt play, but sustained walking does', async () => {
  const { Session } = makeHarness(null, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  const start = Date.now() - 30_000;
  const fix = (step, seconds, accuracyMeters, speedMps) => ({
    latitude: 34.1 + step * 0.00003, longitude: -118.3,
    timestamp: start + seconds * 1000, accuracyMeters, speedMps,
  });
  session.ingestLocation(fix(0, 0, 8, 0));
  session.ingestLocation(fix(1, 3, 45, 1.2));
  session.ingestLocation(fix(2, 6, 45, 1.2));
  session.ingestLocation(fix(3, 9, 45, 1.2));
  assert.equal(session.snapshot().state, 'active', 'inaccurate fixes cannot auto-pause');
  session.ingestLocation(fix(4, 12, 8, 1.1));
  session.ingestLocation(fix(4, 15, 8, 0));
  assert.equal(session.snapshot().state, 'active', 'one short queue shuffle is not sustained walking');
  session.ingestLocation(fix(5, 18, 8, 1.1));
  session.ingestLocation(fix(6, 21, 8, 1.1));
  session.ingestLocation(fix(7, 24, 8, 1.1));
  assert.equal(session.snapshot().state, 'paused');
  assert.equal(session.snapshot().pauseReason, 'lineMoving');
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
  const chapter = { id: 'queue-2-test-ride-episode-1', adaptive: true,
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
  session.pause('lineMoving');
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
  session.pause('lineMoving');
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
  assert.deepEqual(JSON.parse(JSON.stringify(generatePlaylist(25, 25, chapter).slice(0, 2).map(item => item.kind))),
    ['chapter_intro', 'crew_relay']);
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

test('moving-line pause prevents new activity credit, predictions, and shared input', async () => {
  const { Session, calls } = makeHarness({ ...saved, completedActivityIds: [], prediction: null }, server);
  const session = new Session();
  await session.start(ride, undefined, 12);
  session.pause('lineMoving');
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
  session.pause('lineMoving');
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
    relay: { routeNames: ['Follow the stars', 'Chart a new orbit'] } };
  const played = { ...saved, playlist: [{ kind: 'trivia',
    id: 'queue-2-test-ride-episode-0-trivia', seed: 1 }],
    completedActivityIds: ['queue-2-test-ride-episode-0-trivia'], prediction: null };
  const { Session, calls } = makeHarness(played, server, chapter, null, null,
    { granted: true }, async () => { throw new Error('offline'); });
  const session = new Session();
  await session.start(ride, undefined, 12);
  await session.complete();
  const expected = { chapter_id: chapter.id, chapter_title: chapter.title, route_name: null };
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
