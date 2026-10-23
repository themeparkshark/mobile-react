const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('park ids match the server: 4 Hollywood Studios, 5 Animal Kingdom, 6 EPCOT', () => {
  // Checked Oct 23 2026 with read-only GET /api/rides?park_id=4|5|6 on production
  // (Smugglers Run, Flight of Passage, Cosmic Rewind) and ProductionDataSeeder seedParks.
  const parks = loadTs('src/constants/parkWaitTimes.ts');
  const name = id => parks.PARK_DISPLAY_ORDER.find(p => p.id === id)?.name;
  assert.equal(name(4), 'Hollywood Studios');
  assert.equal(name(5), 'Animal Kingdom');
  assert.equal(name(6), 'EPCOT');
  assert.equal(name(2), 'Magic Kingdom');
  assert.equal(name(8), 'Disneyland');
  // themeparks.wiki ids follow the same park.
  assert.equal(parks.PARK_WIKI_IDS[4], '288747d1-8b4f-4a64-867e-ea7c9b27bad8');
  assert.equal(parks.PARK_WIKI_IDS[5], '1c84a229-8862-4648-9c71-378ddd2c7693');
  assert.equal(parks.PARK_WIKI_IDS[6], '47f90d2c-e191-4239-a466-5892ef59a88b');
  // Walt Disney World still reads in the usual order.
  assert.deepEqual(plain(parks.PARK_DISPLAY_ORDER.filter(p => p.group === 'Walt Disney World').map(p => p.name)),
    ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom']);
  const history = read('src/screens/RideTracker/RideHistoryScreen.tsx');
  assert.match(history, /6: 'EPCOT'/);
  assert.match(history, /4: 'Hollywood Studios'/);
  assert.match(history, /5: 'Animal Kingdom'/);
  assert.match(read('src/games/trivia-duel/engine/facts.ts'), /Animal Kingdom', year: 1998, parkId: 5/);
  assert.match(read('src/services/lineplay/content.ts'), /id: 'gen-46', parkId: 5,/);
});

test('bars, taverns and snack stands never show in the ride journal pick list', () => {
  const { journalRides } = loadTs('src/screens/RideTracker/rideJournalModel.ts');
  const rides = [
    { id: 1, name: 'Space Mountain', type: 'attraction' },
    { id: 2, name: 'Mint Julep Bar', type: 'restaurant' },
    { id: 3, name: 'Fantasmic!', type: 'show' },
    { id: 4, name: "Oga's Cantina", type: 'restaurant' },
    { id: 5, name: 'Matterhorn Bobsleds', type: 'coaster' },
  ];
  assert.deepEqual(plain(journalRides(rides).map(r => r.name)), ['Space Mountain', 'Fantasmic!', 'Matterhorn Bobsleds']);
  assert.match(read('src/screens/RideTracker/RideLogScreen.tsx'), /setRides\(journalRides\(data\)\)/);
});

function outboxRealm({ post, failReads = () => false }) {
  const store = new Map();
  const posted = [];
  const storage = { __esModule: true, default: {
    getItem: async key => { if (failReads(key)) throw new Error('storage busy'); return store.get(key) ?? null; },
    setItem: async (key, value) => { store.set(key, value); },
  } };
  const mod = loadTs('src/services/rideLogOutbox.ts', {
    '../api/endpoints/player-rides': { logRide: async payload => { posted.push(payload); return post(payload); } },
    '@react-native-async-storage/async-storage': storage,
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  });
  return { mod, posted, store };
}

test('a ride logged with no signal waits on the phone and is sent once signal is back', async () => {
  let online = false;
  const { mod, posted } = outboxRealm({ post: async () => {
    if (!online) throw Object.assign(new Error('Network Error'), { response: undefined });
    return { data: { id: 9 } };
  } });
  mod.setRideLogOutboxPlayer(25);
  const counts = [];
  mod.onRideLogOutboxChange(n => counts.push(n));
  const id = mod.manualRideLogId(1700000000000, 0.123456789);
  assert.match(id, /^manual-[a-z0-9]+-[a-z0-9]+$/);
  assert.ok(id.length <= 100, 'fits the server source_detection_id column');
  const item = { payload: { ride_id: 10, source_detection_id: id, rating: 5 }, ride_name: 'Space Mountain', park_id: 8,
    player_id: 25, queued_at: Date.now() };
  await mod.queueRideLog(item);
  await mod.queueRideLog(item); // the same ride twice stays one entry
  assert.equal(await mod.pendingRideLogCount(), 1);
  // A whole dead-zone day: far more tries than the old 60-try limit, and the ride is still kept.
  for (let i = 0; i < 80; i++) assert.equal(await mod.drainRideLogs(), 0, 'still no signal: kept');
  assert.equal(await mod.pendingRideLogCount(), 1);
  online = true;
  assert.equal(await mod.drainRideLogs(), 1);
  assert.equal(await mod.pendingRideLogCount(), 0);
  assert.equal(posted.at(-1).source_detection_id, id, 'the same phone-made id every try, so the server saves it once');
  assert.ok(counts.includes(1), "the hub heard one ride waiting");
  assert.equal(counts.at(-1), 0);
});

test('only weak-signal and sign-in failures wait; a real no from the server is not retried forever', async () => {
  const { mod } = outboxRealm({ post: async () => { throw { response: { status: 422 } }; } });
  mod.setRideLogOutboxPlayer(25);
  assert.equal(mod.shouldQueueRideLog(new Error('timeout of 15000ms exceeded')), true);
  assert.equal(mod.shouldQueueRideLog({ response: { status: 503 } }), true);
  assert.equal(mod.shouldQueueRideLog({ message: 'Network Error', response: { status: 0 } }), true, 'React Native dropped connection');
  assert.equal(mod.shouldQueueRideLog({ response: { status: 429 } }), true);
  assert.equal(mod.shouldQueueRideLog({ response: { status: 401 } }), true, 'expired sign-in: wait, never drop');
  assert.equal(mod.shouldQueueRideLog({ response: { status: 403 } }), true);
  assert.equal(mod.shouldQueueRideLog({ response: { status: 422 } }), false);
  assert.equal(mod.shouldQueueRideLog({ response: { status: 404 } }), false);
  await mod.queueRideLog({ payload: { ride_id: 99, source_detection_id: 'manual-x' }, ride_name: 'Gone', park_id: null,
    player_id: 25, queued_at: Date.now() });
  await mod.drainRideLogs();
  assert.equal(await mod.pendingRideLogCount(), 0, 'a refused ride leaves the outbox');
});

test('an expired sign-in (401) keeps the ride; it sends after signing in again', async () => {
  let status = 401;
  const { mod, posted } = outboxRealm({ post: async () => {
    if (status) throw { response: { status } };
    return { data: { id: 1 } };
  } });
  mod.setRideLogOutboxPlayer(25);
  await mod.queueRideLog({ payload: { ride_id: 10, source_detection_id: 'manual-a' }, ride_name: 'Space Mountain', park_id: 8,
    player_id: 25, queued_at: Date.now() });
  assert.equal(await mod.drainRideLogs(), 0);
  assert.equal(await mod.pendingRideLogCount(), 1, '401 is not a no: the ride stays');
  status = 0;
  assert.equal(await mod.drainRideLogs(), 1);
  assert.equal(posted.length, 2);
});

test('shared family phone: a kept ride is never lost and never lands in another player\'s journal', async () => {
  const sentAs = [];
  let signedIn = 25;
  let online = false;
  const { mod, store } = outboxRealm({ post: async payload => {
    if (!online) throw Object.assign(new Error('Network Error'), { response: undefined });
    sentAs.push({ as: signedIn, id: payload.source_detection_id });
    return { data: { id: 1 } };
  } });
  // Kid A (25) logs a ride in a dead zone.
  mod.setRideLogOutboxPlayer(25);
  await mod.queueRideLog({ payload: { ride_id: 10, source_detection_id: 'manual-kid-a' }, ride_name: 'Space Mountain', park_id: 8,
    player_id: 25, queued_at: Date.now() });
  // Kid A signs out. The phone comes back to the front with signal: nothing is sent.
  signedIn = null; mod.setRideLogOutboxPlayer(null); online = true;
  assert.equal(await mod.drainRideLogs(), 0);
  assert.equal(await mod.pendingRideLogCount(), 0, 'signed out: no count shown');
  assert.equal(JSON.parse(store.get(mod.RIDE_LOG_OUTBOX_KEY)).length, 1, 'still on the phone');
  // Kid B (31) signs in on the same phone: kid A's ride is not B's to send.
  signedIn = 31; mod.setRideLogOutboxPlayer(31);
  assert.equal(await mod.drainRideLogs(), 0);
  assert.equal(await mod.pendingRideLogCount(), 0, 'kid B sees no waiting ride that is not theirs');
  assert.deepEqual(sentAs, []);
  assert.equal(JSON.parse(store.get(mod.RIDE_LOG_OUTBOX_KEY)).length, 1, 'kid A\'s ride is not lost');
  // Kid A signs back in: the ride goes to kid A's journal.
  signedIn = 25; mod.setRideLogOutboxPlayer(25);
  assert.equal(await mod.pendingRideLogCount(), 1);
  assert.equal(await mod.drainRideLogs(), 1);
  assert.deepEqual(sentAs, [{ as: 25, id: 'manual-kid-a' }]);
});

test('a kept ride waits up to 30 days, then the phone lets it go', async () => {
  const { mod, store } = outboxRealm({ post: async () => { throw Object.assign(new Error('Network Error'), { response: undefined }); } });
  mod.setRideLogOutboxPlayer(31);
  const day = 24 * 60 * 60 * 1000;
  await mod.queueRideLog({ payload: { ride_id: 1, source_detection_id: 'manual-old' }, ride_name: 'Old', park_id: 8,
    player_id: 25, queued_at: Date.now() - 31 * day });
  await mod.queueRideLog({ payload: { ride_id: 2, source_detection_id: 'manual-new' }, ride_name: 'New', park_id: 8,
    player_id: 25, queued_at: Date.now() - 29 * day });
  await mod.drainRideLogs();
  const left = JSON.parse(store.get(mod.RIDE_LOG_OUTBOX_KEY)).map(item => item.idempotencyKey);
  assert.deepEqual(left, ['manual-new']);
  assert.equal(mod.RIDE_LOG_MAX_AGE_MS, 30 * day);
});

test('the outbox follows sign-in and sign-out', () => {
  const sync = read('src/services/RideLogOutboxSync.tsx');
  assert.match(sync, /setRideLogOutboxPlayer\(playerId\)/);
  assert.match(sync, /return \(\) => setRideLogOutboxPlayer\(null\)/);
  assert.match(read('src/screens/RideTracker/RideLogScreen.tsx'), /player_id: player\.id, queued_at: Date\.now\(\)/);
});

test('the ride journal keeps a failed save instead of throwing it away', () => {
  const screen = read('src/screens/RideTracker/RideLogScreen.tsx');
  assert.match(screen, /shouldQueueRideLog\(e\)/);
  assert.match(screen, /await queueRideLog\(/);
  assert.match(screen, /source_detection_id: logId\.current/);
  assert.match(read("src/components/RideTracker/RideLogSuccess.tsx"), /Kept on your phone/);
  assert.match(read('src/screens/RideTracker/RideTrackerScreen.tsx'), /drainRideLogs\(\)/);
});

test('Ride Collections never promise coins or XP the server does not pay', () => {
  const screen = read('src/screens/RideTracker/RideCollectionsScreen.tsx');
  assert.doesNotMatch(screen, /xp_reward|coin_reward/);
  assert.doesNotMatch(screen, /earn rewards/i);
});

test('a kept ride the server says no to is shown as "could not join", never dropped in silence', async () => {
  const { mod, store } = outboxRealm({ post: async () => {
    throw { response: { status: 422, data: { message: 'The selected ride id is invalid.', errors: { ride_id: ['The selected ride id is invalid.'] } } } };
  } });
  mod.setRideLogOutboxPlayer(25);
  const payload = { ride_id: 99, source_detection_id: 'manual-gone', rating: 4, note: 'so fun' };
  await mod.queueRideLog({ payload, ride_name: 'Space Mountain', park_id: 8, player_id: 25, queued_at: Date.now() });
  await mod.drainRideLogs();
  assert.equal(await mod.pendingRideLogCount(), 0);
  const letGo = await mod.letGoRideLogs();
  assert.equal(letGo.length, 1);
  assert.equal(letGo[0].ride_name, 'Space Mountain');
  assert.equal(letGo[0].reason, 'rejected');
  assert.equal(letGo[0].payload.note, 'so fun', 'the memory comes back for "Log it again"');
  // Another kid on the same phone never sees it.
  mod.setRideLogOutboxPlayer(31);
  assert.equal((await mod.letGoRideLogs()).length, 0);
  mod.setRideLogOutboxPlayer(25);
  await mod.clearLetGoRideLog('manual-gone');
  assert.equal((await mod.letGoRideLogs()).length, 0);
  assert.equal(JSON.parse(store.get(mod.RIDE_LOG_LET_GO_KEY)).length, 0);
});

test('a ride let go after 30 days is shown to its own player', async () => {
  const { mod } = outboxRealm({ post: async () => { throw Object.assign(new Error('Network Error'), { response: undefined }); } });
  mod.setRideLogOutboxPlayer(25);
  await mod.queueRideLog({ payload: { ride_id: 1, source_detection_id: 'manual-old' }, ride_name: 'Matterhorn', park_id: 8,
    player_id: 25, queued_at: Date.now() - 31 * 24 * 60 * 60 * 1000 });
  await mod.drainRideLogs();
  assert.equal(await mod.pendingRideLogCount(), 0);
  const letGo = await mod.letGoRideLogs();
  assert.deepEqual(plain(letGo.map(r => [r.ride_name, r.reason])), [['Matterhorn', 'expired']]);
});

test('if the "could not join" note cannot be stored, the ride stays in the outbox', async () => {
  let failLetGo = true;
  const { mod } = outboxRealm({
    post: async () => { throw { response: { status: 422, data: { errors: { ride_id: ['x'] } } } }; },
    failReads: key => failLetGo && key === 'tps.rideLogOutbox.letGo.v1',
  });
  mod.setRideLogOutboxPlayer(25);
  await mod.queueRideLog({ payload: { ride_id: 9, source_detection_id: 'manual-keep' }, ride_name: 'Big Thunder', park_id: 8,
    player_id: 25, queued_at: Date.now() });
  await mod.drainRideLogs();
  assert.equal(await mod.pendingRideLogCount(), 1, 'nothing vanishes while storage is busy');
  failLetGo = false;
  await mod.drainRideLogs();
  assert.equal(await mod.pendingRideLogCount(), 0);
  assert.equal((await mod.letGoRideLogs()).length, 1);
});

test('a storage read error while saving never wipes the rides already waiting', async () => {
  let failOnce = false;
  const { mod, store } = outboxRealm({
    post: async () => { throw Object.assign(new Error('Network Error'), { response: undefined }); },
    failReads: key => {
      if (failOnce && key === 'tps.rideLogOutbox.v2') { failOnce = false; return true; }
      return false;
    },
  });
  mod.setRideLogOutboxPlayer(25);
  for (const [id, name] of [['manual-1', 'Space Mountain'], ['manual-2', 'Matterhorn']]) {
    await mod.queueRideLog({ payload: { ride_id: 1, source_detection_id: id, note: `${name} note` }, ride_name: name, park_id: 8,
      player_id: 25, queued_at: Date.now() });
  }
  failOnce = true;
  await assert.rejects(mod.queueRideLog({ payload: { ride_id: 2, source_detection_id: 'manual-3' }, ride_name: 'Peter Pan',
    park_id: 8, player_id: 25, queued_at: Date.now() }), /storage busy/, 'the screen hears it did not save');
  const kept = JSON.parse(store.get(mod.RIDE_LOG_OUTBOX_KEY));
  assert.deepEqual(plain(kept.map(item => item.payload.payload.note)), ['Space Mountain note', 'Matterhorn note'], 'both rides and their notes survive');
  // A read error at the start of a drain leaves everything in place too.
  failOnce = true;
  assert.equal(await mod.drainRideLogs(), 0);
  assert.equal(JSON.parse(store.get(mod.RIDE_LOG_OUTBOX_KEY)).length, 2);
  // Unreadable data is set aside, not silently kept blocking the outbox.
  store.set(mod.RIDE_LOG_OUTBOX_KEY, '{not json');
  await mod.queueRideLog({ payload: { ride_id: 3, source_detection_id: 'manual-4' }, ride_name: 'Dumbo', park_id: 8,
    player_id: 25, queued_at: Date.now() });
  assert.equal(store.get(`${mod.RIDE_LOG_OUTBOX_KEY}.corrupt`), '{not json');
  assert.equal(await mod.pendingRideLogCount(), 1);
});

test('the kept-ride line says the real fix: signal, or signing in again', () => {
  const { mod } = outboxRealm({ post: async () => ({}) });
  assert.equal(mod.rideLogWaitReason({ response: { status: 401 } }), 'signin');
  assert.equal(mod.rideLogWaitReason({ response: { status: 403 } }), 'signin');
  assert.equal(mod.rideLogWaitReason(new Error('Network Error')), 'signal');
  assert.equal(mod.rideLogWaitReason({ response: { status: 503 } }), 'signal');
  assert.equal(mod.rideLogWaitLine('signin'), 'It joins your journal when you sign in again.');
  assert.equal(mod.rideLogWaitLine('signal'), 'It joins your journal when you have signal.');
  assert.equal(mod.rideLogWaitLine('signal', 2), 'They join your journal when you have signal.');
  assert.match(read('src/screens/RideTracker/RideLogScreen.tsx'), /queuedReason: rideLogWaitReason\(e\)/);
  assert.match(read('src/components/RideTracker/RideLogSuccess.tsx'), /\{rideLogWaitLine\(queuedReason\)\}/);
});

test('a ride the server says no to gets kid words and a next step, never server text', () => {
  const { rideLogError } = loadTs('src/screens/RideTracker/rideJournalModel.ts');
  const laravel = (field, text) => ({ response: { status: 422, data: { message: text, errors: { [field]: [text] } } } });
  const gone = rideLogError(laravel('ride_id', 'The selected ride id is invalid.'));
  assert.deepEqual(plain(gone), { title: 'Ride not found', message: "We can't find that ride right now. Pick it again.", action: 'pick-ride' });
  assert.equal(rideLogError({ response: { status: 404, data: { message: 'No query results for model [App\\Models\\Ride] 99' } } }).action, 'pick-ride');
  const note = rideLogError(laravel('note', 'The note field must not be greater than 255 characters.'));
  assert.equal(note.action, 'edit');
  assert.equal(note.message, 'Make your note a little shorter, then save.');
  assert.equal(rideLogError(laravel('wait_time_minutes', 'The wait time minutes field must be an integer.')).title, 'Check the wait');
  assert.equal(rideLogError(laravel('rating', 'The rating field must not be greater than 5.')).title, 'Pick again');
  const other = rideLogError({ response: { status: 409, data: { message: 'SQLSTATE[23505]: Unique violation' } } });
  assert.equal(other.title, 'Ride not saved');
  for (const view of [gone, note, other]) {
    assert.ok(view.title.length <= 22, 'fits the dialog ribbon');
    assert.doesNotMatch(view.message, /selected|field|SQLSTATE|Models/);
  }
  const screen = read('src/screens/RideTracker/RideLogScreen.tsx');
  assert.doesNotMatch(screen, /response\?\.data\?\.message/, 'server text never reaches the kid');
  assert.match(screen, /text: 'Pick ride', onPress: backToRideList/);
});

test('the hub shows a kept ride that could not join, with one tap to log it again', () => {
  const hub = read('src/screens/RideTracker/RideTrackerScreen.tsx');
  assert.match(hub, /could not join your journal\. Log it again\?/);
  assert.match(hub, /<Text style=\{s\.letGoButtonText\}>Log it again<\/Text>/);
  assert.match(hub, /again: \{ id: ride\.id, payload: ride\.payload \}/);
  assert.match(hub, /nav\.push\('RideLog', \{\s*rideId: ride\.payload\.ride_id/);
  const log = read('src/screens/RideTracker/RideLogScreen.tsx');
  assert.match(log, /logId\.current = again\.id;/);
  assert.equal((log.match(/clearLetGoRideLog\(again\.id\)/g) || []).length, 2, 'cleared once it saves or is kept again');
});

test('the hero says "1 RIDE LOGGED" even if the server sends the count as text', () => {
  assert.match(read('src/screens/RideTracker/RideTrackerScreen.tsx'), /Number\(stats\?\.total_rides\) === 1 \? 'RIDE LOGGED' : 'RIDES LOGGED'/);
});
