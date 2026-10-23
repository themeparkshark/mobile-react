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

function outboxRealm({ post }) {
  const store = new Map();
  const posted = [];
  const mod = loadTs('src/services/rideLogOutbox.ts', {
    '../api/endpoints/player-rides': { logRide: async payload => { posted.push(payload); return post(payload); } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); },
    } },
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
