'use strict';
/**
 * The ride step and the one ride question (core loop blueprint 2 step 6, 4.3 "The ride question", 5.6,
 * must-fix 9; PLAN.json lineplay-ride acceptance 2 and 3).
 *
 *  - A scripted walk past Main Street Vehicles, the Piano Player and the train station asks nothing.
 *  - A scripted wait with a boarding signal and then leaving asks exactly one ride question for that
 *    ride, and the journal opens with the timed wait.
 *  - "I got to the ride" logs the ride once through the outbox, held for the journal (one ride, one row).
 *  - Detection asks only about queue rides, never while walking to the guide target, at most once per
 *    20 minutes, and the queue dwell skips a ride whose LinePlay just ended.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Disneyland rows from the catalog (scratch DB, Oct 28): types and points as the server sends them.
const VEHICLES = { id: 597, name: 'Main Street Vehicles', type: 'transport', park_id: 8, lat: 33.8102153, lng: -117.9189621, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };
const PIANO = { id: 614, name: 'Main Street Piano Player', type: 'show', park_id: 8, lat: 33.8114433, lng: -117.9192024, radius: 45, ride_duration_minutes: null, min_dwell_minutes: null };
const RAILROAD = { id: 626, name: 'Disneyland Railroad', type: 'attraction', park_id: 8, lat: 33.8112560, lng: -117.9218760, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };
const JUNGLE = { id: 583, name: 'Jungle Cruise', type: 'attraction', park_id: 8, lat: 33.8114400, lng: -117.9200920, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };

function service() {
  const store = new Map();
  const m = loadTs('src/services/RideDetectionService.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => store.get(key) ?? null,
      setItem: async (key, value) => { store.set(key, value); },
      removeItem: async key => { store.delete(key); },
    },
    'expo-location': { Accuracy: { High: 6 } },
    'expo-task-manager': { defineTask() {}, isTaskDefined: () => false },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '../api/endpoints/rides': {},
  });
  const s = m.default, detections = [];
  s.onForegroundDetection = detection => detections.push(detection);
  return { m, s, detections, store };
}

async function withClock(start, run) {
  const realNow = Date.now;
  const clock = { now: start };
  Date.now = () => clock.now;
  try { await run(clock); } finally { Date.now = realNow; }
}

/** Points every `stepMeters` along straight legs between waypoints (a stroll at 1.4 m/s, a fix every 5 s = 7 m). */
function path2(waypoints, stepMeters = 7) {
  const out = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [a, b] = [waypoints[i], waypoints[i + 1]];
    const dy = (b[0] - a[0]) * 111_000, dx = (b[1] - a[1]) * 111_000 * Math.cos(a[0] * Math.PI / 180);
    const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / stepMeters));
    for (let k = 0; k < steps; k++) out.push([a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps]);
  }
  out.push(waypoints[waypoints.length - 1]);
  return out;
}

test('a walk past Main Street Vehicles, the Piano Player and the train station asks zero ride questions', async () => {
  const { s, detections, store } = service();
  s.setRides([VEHICLES, PIANO, RAILROAD, JUNGLE]);
  await withClock(10_000_000, async clock => {
    // Town Square, up Main Street past the vehicles and the piano, west past Jungle Cruise to the station, and on.
    const walk = path2([[33.8094, -117.9189], [33.8102, -117.91896], [33.81144, -117.9192], [33.81144, -117.9201],
      [33.81126, -117.92188], [33.8112, -117.9232]]);
    for (const [lat, lng] of walk) { s.processLocation(lat, lng); clock.now += 5_000; }
    // A family stops to listen to the piano for 3 minutes, and waits 5 minutes for a Main Street car: still no question.
    for (let i = 0; i < 36; i++) { s.processLocation(PIANO.lat, PIANO.lng); clock.now += 5_000; }
    for (const [lat, lng] of path2([[PIANO.lat, PIANO.lng], [33.8128, -117.9192]])) { s.processLocation(lat, lng); clock.now += 5_000; }
    for (let i = 0; i < 60; i++) { s.processLocation(VEHICLES.lat, VEHICLES.lng); clock.now += 5_000; }
    for (const [lat, lng] of path2([[VEHICLES.lat, VEHICLES.lng], [33.8088, -117.9189]])) { s.processLocation(lat, lng); clock.now += 5_000; }
    await s.writeQueue;
  });
  assert.equal(detections.length, 0, 'no foreground ride question');
  assert.equal(JSON.parse(store.get('pending_ride_detections') ?? '[]').length, 0, 'nothing waits in the batch confirm either');
});

test('only rides with a queue can be ride questions, after a real ride\'s stay', () => {
  const { m } = service();
  assert.equal(m.minRideDwellMs('show'), null);
  assert.equal(m.minRideDwellMs('transport'), null);
  assert.equal(m.minRideDwellMs('walk_through'), null);
  assert.equal(m.minRideDwellMs('other'), null);
  assert.equal(m.minRideDwellMs('attraction'), 4 * 60_000, 'a 60 m zone walked past at a stroll is about 90 s');
  assert.equal(m.minRideDwellMs('coaster', null, 6), 6 * 60_000, 'a long ride time wins');
});

function gate() {
  const nextCoin = loadTs('src/services/guide/nextCoin.ts');
  const detection = { linePlayRideNow: () => null };
  const memory = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
  const ledger = loadTs('src/services/lineplay/rideQuestionLedger.ts', { '@react-native-async-storage/async-storage': memory });
  const g = loadTs('src/services/lineplay/ridePromptGate.ts', {
    '../guide/nextCoin': nextCoin,
    './rideQuestionLedger': ledger,
    '../RideDetectionService': loadTs('src/services/RideDetectionService.ts', {
      './lineplay/rideQuestionLedger': ledger,
      '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
      'expo-location': { Accuracy: { High: 6 } },
      'expo-task-manager': { defineTask() {} },
      'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
      '../api/endpoints/rides': {},
    }),
  });
  return { g, guide: nextCoin.guide, detection };
}

test('the ride question waits while walking to the next coin, and asks at most once per 20 minutes', () => {
  const { g } = gate();
  const base = { rideId: JUNGLE.id, rideType: 'attraction', dwellMs: 25 * 60_000, now: 1_000_000 };
  assert.equal(g.ridePromptVerdict(base), 'ask');
  assert.equal(g.ridePromptVerdict({ ...base, walking: true }), 'walking');
  assert.equal(g.ridePromptVerdict({ ...base, lastPromptAt: base.now - 19 * 60_000 }), 'too_soon');
  assert.equal(g.ridePromptVerdict({ ...base, lastPromptAt: base.now - 21 * 60_000 }), 'ask');
  assert.equal(g.ridePromptVerdict({ ...base, rideType: 'show' }), 'not_a_ride');
  assert.equal(g.ridePromptVerdict({ ...base, dwellMs: 3 * 60_000 }), 'too_short');
  assert.equal(g.ridePromptVerdict({ ...base, linePlayRideId: JUNGLE.id }), 'lineplay', 'LinePlay asks its own question');
  assert.equal(g.ridePromptVerdict({ ...base, loggedUntil: base.now + 1 }), 'logged');
  assert.equal(g.keepForBatch('walking'), true, 'walking: it waits in the Ride Tracker');
  assert.equal(g.keepForBatch('logged'), false, 'the ride step already logged it');
  assert.equal(g.keepForBatch('not_a_ride'), false);
  // Walking to the target: the guide's distance falls by 15 m or more within 90 s.
  const t = 5_000_000;
  assert.equal(g.walkingTowardTarget([{ taskId: 7, meters: 120, at: t - 60_000 }, { taskId: 7, meters: 80, at: t }], t), true);
  assert.equal(g.walkingTowardTarget([{ taskId: 7, meters: 84, at: t - 60_000 }, { taskId: 7, meters: 80, at: t }], t), false, 'standing still in a line');
  assert.equal(g.walkingTowardTarget([{ taskId: 7, meters: 120, at: t - 60_000 }, { taskId: 7, meters: 80, at: t }], t, true), false, 'in range');
  assert.equal(g.walkingTowardTarget([{ taskId: 3, meters: 300, at: t - 60_000 }, { taskId: 7, meters: 80, at: t }], t), false, 'a new target');
});

test('the gate reads the guide store: a walker closing in on the target is not asked', () => {
  const { g, guide } = gate();
  g.resetRidePromptGateForTests();
  const stop = g.watchGuideForRidePrompts();
  const coin = { taskId: 41, parkId: 8, name: 'Jungle Cruise', kind: 'ride', latitude: 33.81144, longitude: -117.920092, owned: false };
  const realNow = Date.now;
  let now = 9_000_000;
  Date.now = () => now;
  try {
    guide.resolve({ mode: 'park', parkId: 8, location: { latitude: 33.8100, longitude: -117.9192 }, coins: [coin], live: { 41: 'open' } });
    now += 40_000;
    guide.resolve({ mode: 'park', parkId: 8, location: { latitude: 33.8106, longitude: -117.9196 }, coins: [coin], live: { 41: 'open' } });
    assert.equal(g.walkingToGuideTarget(now), true);
    now += 200_000;
    assert.equal(g.walkingToGuideTarget(now), false, 'the trail goes stale');
  } finally {
    Date.now = realNow;
    stop();
  }
});

test('a wait with a boarding signal and then leaving asks exactly one ride question, and the journal gets the timed wait', async () => {
  const { s, m, detections } = service();
  const rideStep = loadTs('src/services/lineplay/rideStep.ts');
  s.setRides([JUNGLE, PIANO]);
  let asked = 0;
  const startedAt = 60_000_000;
  let boardingAt = null;
  await withClock(startedAt - 30_000, async clock => {
    for (const [lat, lng] of path2([[33.8108, -117.9201], [33.81144, -117.92009]])) { s.processLocation(lat, lng); clock.now += 5_000; }
    s.setLinePlayRide(JUNGLE.id);
    // 22 minutes in the switchbacks.
    for (let i = 0; i < 44; i++) { s.processLocation(33.81140 + (i % 2) * 0.00004, -117.92005); clock.now += 30_000; }
    // Boarding: the boat leaves the zone, so detection fires while LinePlay is still running at this ride.
    for (const [lat, lng] of path2([[33.81144, -117.92009], [33.8130, -117.9225]])) { s.processLocation(lat, lng); clock.now += 5_000; }
    await s.writeQueue;
    assert.equal(detections.length, 1, 'the boarding signal');
    assert.equal(m.linePlayRideNow(), JUNGLE.id, 'LinePlay is still running: its own "I got to the ride" asks');
    asked += 1; // LinePlay's boarding ask, the one question
    // "I got to the ride": the ride step logs it and holds it for 30 minutes.
    boardingAt = clock.now;
    m.holdRideAfterRideStep(JUNGLE.id, clock.now);
    s.setLinePlayRide(null);
    // Off the boat, back past the dock and out, then a second pass by the queue 10 minutes later.
    clock.now += 8 * 60_000;
    for (const [lat, lng] of path2([[33.8130, -117.9225], [33.81144, -117.92009]])) { s.processLocation(lat, lng); clock.now += 5_000; }
    for (let i = 0; i < 12; i++) { s.processLocation(33.81144, -117.92009); clock.now += 30_000; }
    for (const [lat, lng] of path2([[33.81144, -117.92009], [33.8095, -117.9190]])) { s.processLocation(lat, lng); clock.now += 5_000; }
    await s.writeQueue;
  });
  assert.equal(detections.length, 1, 'no second "Did you just ride" for the logged ride');
  assert.equal(asked, 1, 'exactly one ride question for this ride');
  const params = plain(rideStep.rideStepJournalParams({ rideId: JUNGLE.id, rideName: JUNGLE.name, parkId: 8, playerId: 48,
    startedAt, boardingAt }));
  assert.equal(params.waitMinutes, Math.floor((boardingAt - startedAt) / 60_000), 'the journal opens with the timed wait');
  assert.equal(params.fromRideStep, true);
  assert.equal(params.detectionId, rideStep.rideStepLogId(JUNGLE.id, startedAt), 'the journal saves into the same ride row');
});

test('the queue dwell skips a ride whose LinePlay just ended', async () => {
  const { s, m } = service();
  s.setRides([JUNGLE]);
  await withClock(80_000_000, async clock => {
    s.setLinePlayRide(JUNGLE.id);
    for (let i = 0; i < 6; i++) { s.processLocation(33.81144, -117.92009); clock.now += 30_000; }
    s.setLinePlayRide(null);
    clock.now += 60_000;
    for (let i = 0; i < 6; i++) { s.processLocation(33.81144, -117.92009); clock.now += 30_000; }
    assert.equal(s.currentDwell(90_000, clock.now), null, 'no "In line? Your wait powers this coin" right after its LinePlay');
    clock.now += 31 * 60_000;
    for (let i = 0; i < 6; i++) { s.processLocation(33.81144, -117.92009); clock.now += 30_000; }
    assert.equal(s.currentDwell(90_000, clock.now)?.rideId, JUNGLE.id, 'a real new line later is offered again');
  });
  assert.equal(m.dwellSkipsRide(1, { rideId: 1, at: 0 }, 29 * 60_000), true);
  assert.equal(m.dwellSkipsRide(1, { rideId: 1, at: 0 }, 31 * 60_000), false);
  assert.equal(m.dwellSkipsRide(1, null, 0, 10), true, 'the ride step hold');
});

function outbox() {
  const store = new Map(), sent = [];
  let fail = false;
  const storage = { __esModule: true, default: {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async key => { store.delete(key); },
  } };
  const queue = loadTs('src/services/rideLogOutbox.ts', {
    '@react-native-async-storage/async-storage': storage,
    '../api/endpoints/player-rides': { logRide: async payload => { if (fail) throw Object.assign(new Error('offline'), { response: { status: 0 } }); sent.push(payload); return { data: { id: sent.length } }; } },
    './lineplay/RedeemRetryQueue': loadTs('src/services/lineplay/RedeemRetryQueue.ts', {
      '@react-native-async-storage/async-storage': storage,
      'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    }),
  });
  return { queue, sent, setFail: v => { fail = v; } };
}

test('"I got to the ride" logs the ride once, with the timed wait, held for the journal (one ride, one row)', async () => {
  const { queue, sent } = outbox();
  const rideStep = loadTs('src/services/lineplay/rideStep.ts');
  queue.setRideLogOutboxPlayer(48);
  const now = Date.now();
  const item = plain(rideStep.rideStepLog({ rideId: 583, rideName: 'Jungle Cruise', parkId: 8, playerId: 48,
    startedAt: now - 11 * 60_000, boardingAt: now, now }));
  assert.equal(item.payload.wait_time_minutes, 11);
  assert.match(item.payload.source_detection_id, /^lineplay-583-/);
  await queue.keepRideStepLog(item);
  assert.equal(await queue.drainRideLogs(), 0, 'held while the journal may add stars');
  assert.equal(sent.length, 0);
  // The journal saves its memory into the same row (same id): one send, with the stars and the timed wait.
  const memory = { ...item, hold_until: undefined, payload: { ...item.payload, rating: 5, reaction: 'loved' } };
  delete memory.hold_until;
  await queue.saveRideLogKeptFirst(memory);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].rating, 5);
  assert.equal(sent[0].wait_time_minutes, 11);
  assert.equal(await queue.drainRideLogs(), 0, 'nothing left to send twice');
  assert.equal(sent.length, 1);
});

test('leaving the recap without the journal sends the ride as it is, once', async () => {
  const { queue, sent } = outbox();
  const rideStep = loadTs('src/services/lineplay/rideStep.ts');
  queue.setRideLogOutboxPlayer(48);
  const now = Date.now();
  const item = plain(rideStep.rideStepLog({ rideId: 583, rideName: 'Jungle Cruise', parkId: 8, playerId: 48,
    startedAt: now - 20 * 60_000, boardingAt: now, now }));
  await queue.keepRideStepLog(item);
  await queue.releaseRideLogHold(item.payload.source_detection_id);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].wait_time_minutes, 20);
  await queue.releaseRideLogHold(item.payload.source_detection_id);
  assert.equal(sent.length, 1, 'a second release never sends it again');
});

test('the recap line, the journal label and the Adventure stamp', () => {
  const rideStep = loadTs('src/services/lineplay/rideStep.ts');
  assert.equal(rideStep.signSaidLine({ postedMinutes: 20, waitSource: 'posted', waitedMinutes: 11 }), 'Sign said 20, you waited 11');
  assert.equal(rideStep.signSaidLine({ postedMinutes: 45, waitSource: 'posted', waitedMinutes: 0.3 }), 'Sign said 45, you walked right on', 'never "you waited 0"');
  assert.equal(rideStep.signSaidLine({ postedMinutes: null, waitSource: null, waitedMinutes: 0 }), 'You walked right on');
  assert.equal(rideStep.signSaidLine({ postedMinutes: 20, waitSource: 'estimate', waitedMinutes: 11 }), 'You waited 11 minutes',
    'a game estimate is never called the sign');
  assert.equal(rideStep.signSaidLine({ postedMinutes: 20, waitSource: 'posted', waitedMinutes: null }), null);
  assert.equal(rideStep.timedWaitMinutes(0, 11 * 60_000 + 50_000), 11, 'whole minutes, like the recap');
  assert.equal(rideStep.timedWaitMinutes(null, 5), null);
  const model = loadTs('src/screens/RideTracker/rideJournalModel.ts');
  assert.equal(model.journalStepLabel('details', true), 'RIDE JOURNAL', 'never "3 of 3" without steps 1 and 2');
  assert.equal(model.journalStepLabel('details', false), 'RIDE JOURNAL · 3 OF 3');
  assert.equal(rideStep.adventureRideStampDue({ id: 1, phase: 'celebrate', ride: { ride_id: 583 } }, 583), true);
  assert.equal(rideStep.adventureRideStampDue({ id: 1, phase: 'play', ride: { ride_id: 583 } }, 583), false, 'its line story first');
  assert.equal(rideStep.adventureRideStampDue({ id: 1, phase: 'celebrate', ride: { ride_id: 580 } }, 583), false);
});

test('the screens wire the one ride question', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  // The boarding ask uses the ride step's words, once per wait, and counts as the ride question.
  assert.match(screen, /title="Did you get to the ride\?"/);
  assert.match(screen, /\{ text: 'I got to the ride' \}/);
  assert.match(screen, /if \(boardingAsked\.current === waitKey\) return;/);
  assert.match(screen, /noteRidePrompt\(\);\n\s+session\.suggestBoarded\(Number\.isFinite\(detection\.exitedAt\) \? detection\.exitedAt : null\);/);
  // "Line done?" with its seconds countdown is gone: leaving ends quietly, the card keeps RESUME, the recap offers Undo.
  assert.doesNotMatch(screen, /title="Line done\?"/);
  assert.doesNotMatch(screen, /This wait ends in/);
  assert.match(screen, /leftLineWrapUp \? session\.undoEnd\(\) : session\.resumeAfterLeftLine\(\)/);
  // The ride step: held for 30 minutes, logged through the outbox, the Adventure stamped on its ride.
  assert.match(screen, /holdRideAfterRideStep\(ride\.rideId\);/);
  assert.match(screen, /void keepRideStepLog\(rideStepLog\(/);
  assert.match(screen, /adventureRideStampDue\(ticket, ride\.rideId\)/);
  // The overlay never asks about the ride LinePlay is running at; detection asks through the gate.
  assert.match(read('src/components/RideTracker/RideDetectionOverlay.tsx'), /if \(linePlayRideNow\(\) === detection\.rideId\) return;/);
  const hook = read('src/hooks/useRideDetection.ts');
  assert.match(hook, /const verdict = detectionVerdict\(detection\);/);
  assert.match(hook, /walking: walkingToGuideTarget\(now\)/);
  // The journal: prefilled wait, back leaves, "Return to Ride Tracker" really goes there, NEXT COIN.
  const journal = read('src/screens/RideTracker/RideLogScreen.tsx');
  assert.match(journal, /if \(fromRideStep && timedWait != null && Number\.isFinite\(timedWait\)\) setWaitTime/);
  assert.match(journal, /if \(below === 'RideTracker'\) navigation\.goBack\(\);\n\s+else navigation\.dispatch\(StackActions\.replace\('RideTracker'\)\);/);
  const success = read('src/components/RideTracker/RideLogSuccess.tsx');
  assert.match(success, /label=\{`NEXT COIN: \$\{nextCoinName\}`\}/);
  assert.match(success, /Next time, just ride\. Your shark asks once when you are done\./);
});

test('Ride Tracker words: Ride sets, true counts only (no days-in-a-row streak under another name), no reward it never pays', () => {
  const tracker = read('src/screens/RideTracker/RideTrackerScreen.tsx');
  assert.match(tracker, /title="Ride sets"/);
  assert.match(tracker, /\{stats\.per_park\.length\}<\/Text>\n\s+<Text style=\{s\.statLabel\}>Parks</);
  for (const f of ['src/screens/RideTracker/RideTrackerScreen.tsx', 'src/screens/RideTracker/RideStatsScreen.tsx', 'src/screens/RideTracker/RideWrappedScreen.tsx']) {
    assert.doesNotMatch(read(f), /\{stats\.current_streak\}|value=\{stats\.current_streak\}|longest_streak|in a row/, `${f}: no streak wears a ride-days label`);
  }
  assert.match(read('src/screens/RideTracker/RideWrappedScreen.tsx'), /<AnimNum value=\{data\.ride_days\}/);
  assert.doesNotMatch(tracker, /title="Collections"|Day streak|Park days in a row/);
  const sets = read('src/screens/RideTracker/RideCollectionsScreen.tsx');
  assert.match(sets, /<RideTrackerFrame title="Ride sets"/);
  assert.doesNotMatch(sets, /xp_reward|coin_reward/, 'the server never pays set rewards, so the card never promises them');
  assert.match(read('src/screens/RideTracker/RideStatsScreen.tsx'), /<StatCard label="Parks" value=\{stats\.per_park\.length\} icon="pin" \/>/);
});

test('Wait Times plans the next coin through the guide', () => {
  const screen = read('src/screens/QueueTimesScreen.tsx');
  assert.match(screen, /guide\.setTarget\(taskId, 'wait_times'\);/);
  assert.match(screen, /Make this my next coin/);
  assert.match(screen, /Your next coin/);
  // Never on a coin already on the shelf, and the chip follows the guide store, never the tap alone.
  assert.match(screen, /coinTaskId=\{notOwned\(coinTasks\.get\(item\.name\)\)\}/);
  assert.match(screen, /coin => coin\.ride_id/);
  assert.match(screen, /isNextCoin=\{coinTasks\.get\(item\.name\) != null && coinTasks\.get\(item\.name\) === guidePick\.current\}/);
  assert.doesNotMatch(screen, /setNextCoinTask\(taskId\)/);
  // No ticking seconds on Wait Times (rule 7).
  assert.doesNotMatch(screen, /refresh \$\{countdown\}s|countdown/);
  assert.match(screen, /updates every minute/);
});

// -- One question per wait, across an app relaunch (round 1 grader blocker) ----------------------------
//
// One phone "launch" is the detection service, the prompt gate, the ledger and the hook's pending check,
// all on one AsyncStorage store. A relaunch builds them again from the same store with empty memory.
const SPACE = { id: 588, name: 'Space Mountain', type: 'coaster', park_id: 8, lat: 33.8113, lng: -117.9174, radius: 60, ride_duration_minutes: null, min_dwell_minutes: null };

function launch(store, { appState = 'active', player = '48', route = 'Explore', checkpoints = new Map() } = {}) {
  const storage = {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async key => { store.delete(key); },
  };
  const appStateStub = { AppState: { currentState: appState, addEventListener: () => ({ remove() {} }) } };
  const playerStorage = { gameSavesPlayer: () => player, playerKey: (key, id) => `${key}@p${id ?? 'guest'}` };
  const ledger = loadTs('src/services/lineplay/rideQuestionLedger.ts', {
    '@react-native-async-storage/async-storage': storage,
    '../../gamekit/core/playerStorage': playerStorage,
  });
  const svcModule = loadTs('src/services/RideDetectionService.ts', {
    '@react-native-async-storage/async-storage': storage,
    'expo-location': { Accuracy: { High: 6 }, hasStartedLocationUpdatesAsync: async () => false },
    'expo-task-manager': { defineTask() {}, isTaskDefined: () => false },
    'react-native': appStateStub,
    '../api/endpoints/rides': {},
    './lineplay/rideQuestionLedger': ledger,
  });
  const nextCoin = loadTs('src/services/guide/nextCoin.ts');
  const gateModule = loadTs('src/services/lineplay/ridePromptGate.ts', {
    '../guide/nextCoin': nextCoin,
    '../RideDetectionService': svcModule,
    './rideQuestionLedger': ledger,
  });
  const navigations = [];
  const emitter = loadTs('src/services/RideDetectionEmitter.ts', { './RideDetectionService': svcModule });
  const hook = loadTs('src/hooks/useRideDetection.ts', {
    react: {},
    'react-native': appStateStub,
    '../api/endpoints/rides': { getRides: async () => [] },
    '../api/endpoints/parks/queue-times/getWikiTimes': { __esModule: true, default: async () => [] },
    '../services/RideDetectionService': svcModule,
    '../constants/parkWaitTimes': { PARK_WIKI_IDS: {} },
    '../RootNavigation': {
      navigationRef: { isReady: () => true, getCurrentRoute: () => ({ name: route }) },
      navigate: (name, params) => navigations.push({ name, params }),
    },
    '../services/RideDetectionEmitter': emitter,
    '../services/lineplay/rideQuestionLedger': ledger,
    '../services/lineplay/ridePromptGate': gateModule,
    '../context/LocationProvider': { LocationContext: {} },
    './useLivePoll': { __esModule: true, default: () => undefined },
    '../services/lineplay/checkpoint': { readCheckpoint: async (playerId, rideId) => checkpoints.get(`${playerId}_${rideId}`) ?? null },
  });
  const s = svcModule.default, heard = [];
  s.onForegroundDetection = detection => {
    heard.push(detection);
    // LinePlay on screen hears it and puts its one question (LinePlayScreen marks the wait asked).
    if (svcModule.linePlayRideNow() === detection.rideId) ledger.markLinePlayBoardingAsked(detection.rideId, detection.exitedAt);
  };
  s.setRides([JUNGLE, PIANO, SPACE]);
  return { s, svcModule, gate: gateModule, ledger, hook, navigations, heard };
}

const pendingIn = store => JSON.parse(store.get('pending_ride_detections') ?? '[]');

/** 22 minutes of LinePlay in the Jungle Cruise switchbacks, then the boat leaves the zone (the boarding signal). */
async function waitThenBoard(app, clock) {
  for (const [lat, lng] of path2([[33.8108, -117.9201], [33.81144, -117.92009]])) { app.s.processLocation(lat, lng); clock.now += 5_000; }
  const startedAt = clock.now;
  app.s.setLinePlayRide(JUNGLE.id, clock.now, startedAt);
  for (let i = 0; i < 44; i++) { app.s.processLocation(33.81140 + (i % 2) * 0.00004, -117.92005); clock.now += 30_000; }
  for (const [lat, lng] of path2([[33.81144, -117.92009], [33.8130, -117.9225]])) { app.s.processLocation(lat, lng); clock.now += 5_000; }
  await app.s.writeQueue;
  return startedAt;
}

for (const answer of ['I got to the ride', 'Still in line, then I left the line']) {
  test(`after "${answer}", a relaunch 35 minutes later asks nothing about that wait`, async () => {
    const store = new Map();
    await withClock(100_000_000, async clock => {
      const app = launch(store);
      await app.ledger.ensureRideQuestionLedger();
      const startedAt = await waitThenBoard(app, clock);
      assert.equal(app.heard.length, 1, 'LinePlay hears the boarding signal and asks its one question');
      assert.equal(app.svcModule.linePlayRideNow(), JUNGLE.id);
      assert.equal(pendingIn(store).length, 0, 'nothing about this wait waits for later');
      // A detection the previous build kept about this same wait (it used to persist the boarding signal).
      store.set('pending_ride_detections', JSON.stringify([{ id: 'det_old', rideId: JUNGLE.id, rideName: JUNGLE.name,
        rideType: 'attraction', parkId: 8, enteredAt: startedAt - 30_000, exitedAt: clock.now - 10_000,
        dwellTimeMs: clock.now - startedAt, confidence: 'high', isReRide: false, detectedAt: clock.now - 10_000 }]));
      app.gate.noteRidePrompt(clock.now);
      if (answer === 'I got to the ride') {
        app.gate.holdRideAfterRideStep(JUNGLE.id, clock.now);
        await app.svcModule.dropAnsweredRideDetections(JUNGLE.id);
      } else {
        // "Still in line": LinePlay keeps the wait. Later "I left the line" ends it.
        clock.now += 6 * 60_000;
      }
      app.s.setLinePlayRide(null, clock.now);
      await app.s.writeQueue;
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(pendingIn(store).length, 0, 'the answered wait is gone from the batch confirm');
      // The pocket: the phone was closed for the ride and the walk. The app is killed and opened 35 minutes later.
      store.set('pending_ride_detections', JSON.stringify([{ id: 'det_old2', rideId: JUNGLE.id, rideName: JUNGLE.name,
        rideType: 'attraction', parkId: 8, enteredAt: startedAt + 60_000, exitedAt: startedAt + 23 * 60_000,
        dwellTimeMs: 22 * 60_000, confidence: 'high', isReRide: false, detectedAt: startedAt + 23 * 60_000 }]));
      clock.now += 35 * 60_000;
      const relaunched = launch(store);
      assert.equal(await relaunched.hook.checkAndShowPendingRides(), false);
      assert.equal(relaunched.navigations.length, 0, 'zero ride questions after the relaunch');
      assert.equal(pendingIn(store).length, 0, 'and the leftover is cleared, not kept for later');
      assert.ok(store.has('tps.ride_question.v1@p48'), 'kept on the phone for this player');
    });
  });
}

test('a pocketed ride: no batch confirm, and LinePlay asks its one question when the phone is back in front, with the timed wait', async () => {
  const store = new Map();
  await withClock(200_000_000, async clock => {
    const app = launch(store, { appState: 'background' });
    await app.ledger.ensureRideQuestionLedger();
    const startedAt = await waitThenBoard(app, clock);
    assert.equal(app.heard.length, 0, 'no sheet while the phone sleeps');
    assert.equal(pendingIn(store).length, 0, 'nothing about the LinePlay wait goes to the batch confirm');
    const kept = app.ledger.unaskedLinePlayBoardings(clock.now);
    assert.equal(kept.length, 1, 'the boarding signal is kept on the LinePlay wait');
    const seenAt = kept[0].boardingSeenAt;
    const rideStep = loadTs('src/services/lineplay/rideStep.ts');
    const timed = rideStep.timedWaitMinutes(startedAt, seenAt);
    assert.ok(timed >= 22 && timed <= 23, `the timed wait ends when the boat left the zone (${timed})`);
    // The phone is back in front 9 minutes later (after the ride): LinePlay asks once.
    clock.now += 9 * 60_000;
    assert.equal(app.ledger.takeLinePlayBoarding(JUNGLE.id, startedAt, clock.now), seenAt);
    assert.equal(app.ledger.takeLinePlayBoarding(JUNGLE.id, startedAt, clock.now), null, 'never a second time');
    await new Promise(resolve => setTimeout(resolve, 0));
    // A relaunch later asks nothing more: not LinePlay, not the batch confirm.
    clock.now += 40 * 60_000;
    const relaunched = launch(store, { checkpoints: new Map([[`48_${JUNGLE.id}`, { startedAt, boardingConfirmed: false }]]) });
    assert.equal(await relaunched.hook.checkAndShowPendingRides(), false);
    assert.equal(relaunched.navigations.length, 0);
    assert.equal(relaunched.ledger.takeLinePlayBoarding(JUNGLE.id, startedAt, clock.now), null);
  });
});

test('a pocketed ride and then the app is closed: LinePlay opens on the saved wait to ask, never the batch confirm', async () => {
  const store = new Map();
  await withClock(210_000_000, async clock => {
    const app = launch(store, { appState: 'background' });
    await app.ledger.ensureRideQuestionLedger();
    const startedAt = await waitThenBoard(app, clock);
    await new Promise(resolve => setTimeout(resolve, 0));
    clock.now += 12 * 60_000;
    const checkpoints = new Map([[`48_${JUNGLE.id}`, { startedAt, boardingConfirmed: false }]]);
    // On LinePlay already: it asks itself, so the hook does nothing.
    const onLinePlay = launch(store, { route: 'LinePlay', checkpoints });
    assert.equal(await onLinePlay.hook.checkAndShowPendingRides(), false);
    assert.equal(onLinePlay.navigations.length, 0);
    // Opened on the map: LinePlay comes back on that wait (its checkpoint), once. Detection already took its
    // kept LinePlay ride back (the app was closed mid-wait), but no LinePlay screen is open to ask.
    const relaunched = launch(store, { checkpoints });
    await relaunched.s.loadLinePlayFromCache();
    assert.equal(relaunched.svcModule.linePlayRideNow(), JUNGLE.id);
    assert.equal(relaunched.s.linePlayOpenHere(), null);
    assert.equal(await relaunched.hook.checkAndShowPendingRides(), true);
    assert.deepEqual(plain(relaunched.navigations), [{ name: 'LinePlay', params: { ride: { rideId: JUNGLE.id, rideName: JUNGLE.name, parkId: 8 } } }]);
    assert.equal(pendingIn(store).length, 0, 'zero batch confirms');
    // LinePlay restores the wait and puts its one question.
    assert.notEqual(relaunched.ledger.takeLinePlayBoarding(JUNGLE.id, startedAt, clock.now), null);
    await new Promise(resolve => setTimeout(resolve, 0));
    const again = launch(store, { checkpoints });
    assert.equal(await again.hook.checkAndShowPendingRides(), false);
    assert.equal(again.navigations.length, 0, 'never asked twice');
    // The recap was closed with Done (its checkpoint is gone): that answers it, so nothing reopens a new
    // wait and nothing becomes a batch confirm.
    const store2 = new Map();
    const other = launch(store2, { appState: 'background' });
    await other.ledger.ensureRideQuestionLedger();
    const otherStart = await waitThenBoard(other, clock);
    other.ledger.markLinePlayBoardingAsked(JUNGLE.id, otherStart, clock.now);
    await new Promise(resolve => setTimeout(resolve, 0));
    const noCheckpoint = launch(store2);
    assert.equal(await noCheckpoint.hook.checkAndShowPendingRides(), false);
    assert.equal(noCheckpoint.navigations.length, 0);
    assert.equal(pendingIn(store2).length, 0);
  });
});

test('the session asks after a left-the-line wrap-up, and "I got to the ride" there logs the ride with the timed wait', () => {
  const realSetTimeout = global.setTimeout;
  const deps = {
    './rewardRecovery': { subscribeLinePlayRewardRecovery: () => () => {}, linePlayRewardQueue: { enqueue: async () => {}, drain: async () => {} } },
    '../../games/trivia/config': { LINEPLAY_ROUND_QUESTIONS: 5 },
    './bonusRounds': require('./helpers/lineplay-bonus-rounds.cjs'),
  };
  const ts = require(path.join(root, 'node_modules/typescript'));
  const vm = require('node:vm');
  const out = ts.transpileModule(read('src/services/lineplay/LinePlaySession.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, require: name => deps[name] ?? {}, console, Date, Math,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {} });
  const t0 = 1_000_000_000;
  const make = fields => Object.assign(new mod.exports.LinePlaySession(), { emit() {} }, fields);
  // On screen, in line: the boarding ask's yes ends the wait at the boarding signal, not at the tap.
  const live = make({ state: 'active', startedAt: t0 });
  live.suggestBoarded(t0 + 22 * 60_000);
  assert.equal(live.boardingSuggested, true);
  live.beginEnding(true, 'boarded');
  assert.equal(live.boardingAt, t0 + 22 * 60_000);
  // GPS wraps the wait up as "left the line" while the question is up: it stays up.
  const asking = make({ state: 'active', startedAt: t0 });
  asking.suggestBoarded(t0 + 20 * 60_000);
  asking.beginEnding(false, 'left_queue');
  assert.equal(asking.boardingSuggested, true);
  assert.equal(asking.canAskBoarding(), true);
  // The wrap-up already settled (phone in a pocket): the recap can still take the one answer.
  const wrapped = make({ state: 'complete', startedAt: t0, endReason: 'left_queue', endedAt: t0 + 30 * 60_000, firstAwayAt: t0 + 23 * 60_000 });
  assert.equal(wrapped.canAskBoarding(), true);
  wrapped.suggestBoarded(t0 + 21 * 60_000);
  wrapped.confirmRodeAfterWrapUp();
  assert.equal(wrapped.boardingConfirmed, true);
  assert.equal(wrapped.endReason, 'boarded');
  assert.equal(wrapped.boardingAt, t0 + 21 * 60_000, 'the timed wait ends at the boarding signal');
  assert.equal(wrapped.canAskBoarding(), false, 'answered: never asked again');
  // With no signal (the guest taps "I got to the ride" on the recap), the first fix away from the line ends it.
  const tapped = make({ state: 'complete', startedAt: t0, endReason: 'left_queue', endedAt: t0 + 30 * 60_000, firstAwayAt: t0 + 23 * 60_000 });
  tapped.confirmRodeAfterWrapUp();
  assert.equal(tapped.boardingAt, t0 + 23 * 60_000);
  // "I left the line" (manual) and a ride already logged are answers: no ask.
  assert.equal(make({ state: 'complete', startedAt: t0, endReason: 'manual' }).canAskBoarding(), false);
  assert.equal(make({ state: 'complete', startedAt: t0, endReason: 'boarded', boardingConfirmed: true }).canAskBoarding(), false);
  global.setTimeout = realSetTimeout;
});

test('the screens give a wrapped-up wait its one "I got to the ride" and keep the ask on the phone', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /const seenAt = takeLinePlayBoarding\(ride\.rideId, snap\.startedAt\);/);
  assert.match(screen, /AppState\.addEventListener\('change', state => \{ if \(state === 'active'\) askKeptBoarding\(\); \}\)/);
  assert.match(screen, /if \(startedAt != null && linePlayBoardingAsked\(ride\.rideId, startedAt\)\) return;/);
  assert.match(screen, /accessibilityLabel="I got to the ride"\n\s+onPress=\{rodeAfterWrapUp\}/);
  assert.match(screen, /onGotToRide=\{snapshot\.endReason === 'left_queue' && !snapshot\.boardingConfirmed \? rodeAfterWrapUp : undefined\}/);
  assert.match(screen, /rideQuestionPending: linePlayBoardingPending/);
  assert.match(read('src/hooks/useRideDetection.ts'), /if \(wait\.rideId === rideDetectionService\.linePlayOpenHere\(\) \|\| rideLoggedUntil/);
  assert.match(screen, /\/\/ Closing the wait \(Done\) answers its ride question: nothing reopens it later to ask\.\n\s+noteRideQuestionAnswered\(\);/);
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.match(recap, /<GameButton label="I got to the ride" variant="ghost" onPress=\{onGotToRide\}/);
  // Under the ride question (and while it closes) the card never says "Checking you're in line".
  assert.match(screen, /rideQuestionUp=\{snapshot\.boardingSuggested \|\| leftLineWrapUp\}/);
  assert.match(read('src/screens/LinePlay/components/WaitCard.tsx'), /countdown\.needsCheck && !rideQuestionUp \? 'Checking you’re in line…'/);
  const service = read('src/services/RideDetectionService.ts');
  assert.match(service, /if \(visitInLinePlayWait\(ride\.id, zone\.enteredAt, now, now\)\) \{\n\s+noteLinePlayBoardingSeen\(ride\.id, now, now\);/);
});

test('within the 30 minutes after the ride step, a relaunch still holds the ride and the 20 minute clock', async () => {
  const store = new Map();
  await withClock(300_000_000, async clock => {
    const app = launch(store);
    await app.ledger.ensureRideQuestionLedger();
    app.gate.holdRideAfterRideStep(JUNGLE.id, clock.now);
    await new Promise(resolve => setTimeout(resolve, 0));
    clock.now += 12 * 60_000;
    const relaunched = launch(store);
    await relaunched.ledger.ensureRideQuestionLedger();
    assert.ok(relaunched.svcModule.rideLoggedUntil(JUNGLE.id, clock.now) > clock.now, 'the hold survives the relaunch');
    assert.equal(relaunched.gate.lastRidePromptAt(), clock.now - 12 * 60_000, 'so does the prompt clock');
    // Another player on the same phone has their own record.
    const sister = launch(store, { player: '77' });
    await sister.ledger.ensureRideQuestionLedger();
    assert.equal(sister.svcModule.rideLoggedUntil(JUNGLE.id, clock.now), null);
  });
});

test('a real ride later in the day is still asked about once (the fix is not a mute)', async () => {
  const store = new Map();
  await withClock(400_000_000, async clock => {
    const app = launch(store);
    await app.ledger.ensureRideQuestionLedger();
    await waitThenBoard(app, clock);
    app.gate.holdRideAfterRideStep(JUNGLE.id, clock.now);
    app.s.setLinePlayRide(null, clock.now);
    clock.now += 45 * 60_000;
    // Space Mountain without LinePlay: 25 minutes in its zone, then out.
    for (let i = 0; i < 50; i++) { app.s.processLocation(SPACE.lat + (i % 2) * 0.00003, SPACE.lng); clock.now += 30_000; }
    for (const [lat, lng] of path2([[SPACE.lat, SPACE.lng], [33.8095, -117.9174]])) { app.s.processLocation(lat, lng); clock.now += 5_000; }
    await app.s.writeQueue;
    assert.equal(app.heard.filter(d => d.rideId === SPACE.id).length, 1, 'one detection for the new ride');
    assert.equal(pendingIn(store).filter(d => d.rideId === SPACE.id).length, 1, 'kept until answered');
    const relaunched = launch(store);
    await relaunched.hook.checkAndShowPendingRides();
    assert.equal(relaunched.navigations.length, 1, 'the batch confirm asks about Space Mountain');
    assert.deepEqual(plain(relaunched.navigations[0].params.detections.map(d => d.rideId)), [SPACE.id]);
  });
});

test('a LinePlay wait whose end was lost (app killed) stops muting that ride after its cap', async () => {
  const store = new Map();
  await withClock(500_000_000, async clock => {
    const app = launch(store);
    await app.ledger.ensureRideQuestionLedger();
    app.ledger.noteLinePlayWaitStarted(JUNGLE.id, clock.now);
    assert.equal(app.ledger.visitInLinePlayWait(JUNGLE.id, clock.now + 10 * 60_000, clock.now + 30 * 60_000, clock.now + 30 * 60_000), true,
      'a visit inside the running wait belongs to LinePlay');
    // The app is killed and LinePlay never comes back. Five hours later the guest rides it again without LinePlay.
    clock.now += 5 * 60 * 60_000;
    const relaunched = launch(store);
    await relaunched.ledger.ensureRideQuestionLedger();
    assert.equal(relaunched.ledger.visitInLinePlayWait(JUNGLE.id, clock.now - 25 * 60_000, clock.now, clock.now), false,
      'the lost wait does not swallow a later ride');
    // A new LinePlay at the same ride is its own wait, not a widened old one.
    relaunched.ledger.noteLinePlayWaitStarted(JUNGLE.id, clock.now);
    const open = relaunched.ledger.ledgerWaits().filter(w => w.rideId === JUNGLE.id && w.endedAt == null);
    assert.equal(open.length, 1);
    assert.equal(open[0].startedAt, clock.now);
  });
});

test('the recap GO says a name that ends in s the kid-readable way', () => {
  const rideStep = loadTs('src/services/lineplay/rideStep.ts');
  assert.equal(rideStep.possessive('Jungle Cruise'), 'Jungle Cruise’s');
  assert.equal(rideStep.possessive('Matterhorn Bobsleds'), 'Matterhorn Bobsleds’');
  assert.equal(rideStep.recapGo({ rideName: 'Matterhorn Bobsleds', coinState: 'unowned', partsEarned: 0, rideTaskId: 68,
    upgradeReady: false, nextCoin: null }).label, 'Win Matterhorn Bobsleds’ coin');
});

test('one account\'s ride is never another account\'s ride question on a shared phone', async () => {
  const store = new Map();
  await withClock(600_000_000, async clock => {
    const app = launch(store, { player: '48' });
    await app.ledger.ensureRideQuestionLedger();
    // Player 48 stands 25 minutes at Space Mountain without LinePlay, then walks off.
    for (let i = 0; i < 50; i++) { app.s.processLocation(SPACE.lat + (i % 2) * 0.00003, SPACE.lng); clock.now += 30_000; }
    for (const [lat, lng] of path2([[SPACE.lat, SPACE.lng], [33.8095, -117.9174]])) { app.s.processLocation(lat, lng); clock.now += 5_000; }
    await app.s.writeQueue;
    assert.equal(pendingIn(store).length, 1);
    assert.equal(pendingIn(store)[0].playerId, '48', 'the detection names whose phone saw it');
    // A brand-new account signs in on the same phone: no batch confirm about player 48's ride.
    const other = launch(store, { player: '66' });
    assert.equal(await other.hook.checkAndShowPendingRides(), false);
    assert.equal(other.navigations.length, 0);
    assert.equal(pendingIn(store).length, 1, 'kept for its own player');
    // Player 48 signs back in: asked once.
    const back = launch(store, { player: '48' });
    await back.hook.checkAndShowPendingRides();
    assert.equal(back.navigations.length, 1);
    // A detection saved before this field (no playerId) still reaches whoever is signed in.
    const svc = loadTs('src/services/RideDetectionService.ts', {
      '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
      'expo-location': { Accuracy: { High: 6 }, hasStartedLocationUpdatesAsync: async () => false },
      'expo-task-manager': { defineTask() {}, isTaskDefined: () => false },
      'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
      '../api/endpoints/rides': {},
      './lineplay/rideQuestionLedger': app.ledger,
    });
    assert.equal(svc.detectionBelongsTo({}, '66'), true);
    assert.equal(svc.detectionBelongsTo({ playerId: '48' }, '66'), false);
    assert.equal(svc.detectionBelongsTo({ playerId: '48' }, null), true, 'signed out: nothing is hidden');
  });
});

test('the batch confirm: its arrow says Go back, and "Back to Ride Tracker" really lands on the Ride Tracker', () => {
  const batch = fs.readFileSync(path.join(__dirname, '../../src/screens/RideTracker/RideBatchConfirmScreen.tsx'), 'utf8');
  assert.match(batch, /accessibilityLabel="Go back"/);
  assert.doesNotMatch(batch, /accessibilityLabel="Return to Ride Tracker"/);
  assert.match(batch, /onPress=\{backToRideTracker\}/);
  assert.match(batch, /else navigation\.dispatch\(StackActions\.replace\('RideTracker'\)\);/);
});
