// Wave 6 hotfix: park-day bugs the wave 5 ship gate found on the live build.
const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const OUTBOX_KEY = 'tps.rideLogOutbox.v2';

function outboxRealm(post) {
  const store = new Map();
  const posted = [];
  const storage = { __esModule: true, default: {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
  } };
  const mod = loadTs('src/services/rideLogOutbox.ts', {
    '../api/endpoints/player-rides': { logRide: async payload => { posted.push(payload); return post(payload); } },
    '@react-native-async-storage/async-storage': storage,
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  });
  mod.setRideLogOutboxPlayer(25);
  const kept = () => JSON.parse(store.get(OUTBOX_KEY) ?? '[]');
  return { mod, posted, kept };
}

const memory = id => ({ payload: { ride_id: 578, source_detection_id: id, rating: 5, reaction: 'loved_it', note: 'birds sang',
  rode_at: '2026-10-26T19:10:00.000Z' }, ride_name: "Walt Disney's Enchanted Tiki Room", park_id: 8, player_id: 25, queued_at: Date.now() });

test('Save puts the full ride memory on the phone before the network answers, then takes it out on success', async () => {
  let answer;
  const { mod, posted, kept } = outboxRealm(() => new Promise(resolve => { answer = resolve; }));
  const saving = mod.saveRideLogKeptFirst(memory('det-tiki-1'));
  // The send is in the air (the GPS is switching parks): the stars and face are already kept.
  await new Promise(resolve => setTimeout(resolve, 5));
  const onPhone = kept();
  assert.equal(onPhone.length, 1);
  assert.equal(onPhone[0].payload.payload.rating, 5);
  assert.equal(onPhone[0].payload.payload.reaction, 'loved_it');
  assert.equal(onPhone[0].payload.payload.note, 'birds sang');
  // A drain that runs while the save is in the air never sends it a second time.
  assert.equal(await mod.drainRideLogs(), 0);
  assert.equal(posted.length, 1);
  answer({ data: { id: 41 }, ride_count: 1, total_ride_count: 1 });
  const { result, kept: wasKept } = await saving;
  assert.equal(result.data.id, 41);
  assert.equal(wasKept, true);
  assert.equal(kept().length, 0, 'saved: nothing left waiting');
  assert.equal(await mod.pendingRideLogCount(), 0);
});

test('a screen that goes away mid-save still gets the ride into the journal on the next drain', async () => {
  let online = false;
  const { mod, posted, kept } = outboxRealm(async () => {
    if (!online) throw Object.assign(new Error('Network Error'), { response: { status: 0 } });
    return { data: { id: 42 } };
  });
  // Five saves, each lost to a park switch or weak signal right after Save.
  for (let i = 0; i < 5; i++) {
    await assert.rejects(mod.saveRideLogKeptFirst(memory(`det-switch-${i}`)), error => mod.rideLogWasKept(error));
  }
  assert.equal(kept().length, 5);
  online = true;
  assert.equal(await mod.drainRideLogs(), 5);
  assert.equal(kept().length, 0);
  const sent = posted.filter(p => p.rating === 5 && p.reaction === 'loved_it');
  assert.equal(new Set(sent.map(p => p.source_detection_id)).size, 5, 'every memory arrives with its stars and face');
});

test('a no from the server can be let go, and a plain retry replaces the kept memory instead of adding one', async () => {
  const { mod, kept } = outboxRealm(async () => { throw { response: { status: 422 } }; });
  await assert.rejects(mod.saveRideLogKeptFirst(memory('det-no')), error => mod.rideLogWasKept(error));
  assert.equal(kept().length, 1);
  const plain = { ...memory('det-no'), payload: { ride_id: 578, source_detection_id: 'det-no', rode_at: '2026-10-26T19:10:00.000Z' } };
  await assert.rejects(mod.saveRideLogKeptFirst(plain));
  assert.equal(kept().length, 1, 'same phone-made id: one entry');
  assert.equal(kept()[0].payload.payload.rating, undefined, 'the newest version wins');
  await mod.dropRideLog('det-no');
  assert.equal(kept().length, 0);
});

test('the Ride Journal keeps first, handles a no while gone, and pins Save above the MAP compass', () => {
  const screen = read('src/screens/RideTracker/RideLogScreen.tsx');
  assert.match(screen, /saveRideLogKeptFirst\(keep\)/);
  assert.match(screen, /if \(!rideLogWasKept\(e\)\) await queueRideLog\(keep\)/);
  assert.match(screen, /keepRideLogForLater\(keep\)/, 'a no that arrives after the screen left waits on the Ride Tracker');
  const save = screen.indexOf('<View style={s.saveBar}>');
  assert.ok(save > screen.indexOf('</ScrollView>', screen.indexOf("step === 'details'")), 'Save sits outside the scroll, above the footer');
  assert.match(screen, /saveBar: \{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: BOTTOM_BAR_OVERHANG \+ 6 \}/);
});

test('the retry queue replaces a payload by key and a drain keeps the newest version', async () => {
  const store = new Map();
  let release;
  const { RedeemRetryQueue } = loadTs('src/services/lineplay/RedeemRetryQueue.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } } },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  });
  const queue = new RedeemRetryQueue({ storageKey: 'q', drainOnForeground: false, maxAttempts: Infinity,
    executor: () => new Promise(resolve => { release = resolve; }) });
  await queue.enqueue({ v: 1 }, 'a');
  await queue.enqueue({ v: 2 }, 'a');
  assert.equal((await queue.peek())[0].payload.v, 1, 'no replace: the first one stays');
  const draining = queue.drain();
  await new Promise(resolve => setTimeout(resolve, 5));
  await queue.enqueue({ v: 3 }, 'a', { replace: true });
  release(false);
  await draining;
  const items = await queue.peek();
  assert.equal(items.length, 1);
  assert.equal(items[0].payload.v, 3);
  assert.equal(items[0].attempts, 1);
  await queue.remove('a');
  assert.equal((await queue.peek()).length, 0);
});

test('share files are named by card type, never by the ride title', () => {
  const capture = read('src/share/capture.ts');
  const names = [...capture.matchAll(/'(Theme Park Shark [A-Za-z ]+)'/g)].map(m => m[1]);
  assert.ok(names.includes('Theme Park Shark Ride Card'));
  const { shareFileName } = { shareFileName: (name, ext) => `${name.replace(/[^A-Za-z0-9]+/g, '-')}.${ext}` };
  assert.equal(shareFileName('Theme Park Shark Ride Card', 'jpg'), 'Theme-Park-Shark-Ride-Card.jpg');
  for (const kind of ['crowned', 'find', 'ride_photo', 'set_complete', 'boss_win', 'stamp', 'coin_level', 'standings',
    'fright_night', 'fright_badge', 'fright_lifetime', 'ride_coin', 'streak', 'level_up', 'title', 'park_day']) {
    assert.match(capture, new RegExp(`\\b${kind}: 'Theme Park Shark [A-Za-z ]+'`), kind);
  }
  assert.match(read('src/components/RideTracker/ShareableRideCard.tsx'), /shareCardFileName\('ride_card'\)/);
  assert.doesNotMatch(read('src/components/RideTracker/ShareableRideCard.tsx'), /ride_name\} Ride Card/);
  assert.match(read('src/share/ShareStudioHost.tsx'), /openShareSheet\(uri, shareMessage\(link\), shareCardFileName\(request\.kind\), copyLink\)/);
});

test('coin to shelf: the win prefetch paints the shelf on the first frame, no Loading screen', async () => {
  const calls = [];
  const api = name => ({ __esModule: true, default: async (...args) => { calls.push(name); return name === 'visited' ? { id: 8, name: 'Disneyland' } : [{ id: name }]; } });
  const prefetch = loadTs('src/services/collection/parkShelfPrefetch.ts', {
    '../../api/endpoints/parks/getArchivedTasks': api('archived'), '../../api/endpoints/parks/getLimitedTasks': api('limited'),
    '../../api/endpoints/parks/getSecretTasks': api('secret'), '../../api/endpoints/parks/getTasks': api('tasks'),
    '../../api/endpoints/players/parks/getCompletedArchivedTasks': api('completedArchived'),
    '../../api/endpoints/players/parks/getCompletedSecretTasks': api('completedSecret'),
    '../../api/endpoints/players/parks/getCompletedTasks': api('completed'),
    '../../api/endpoints/players/visited-parks/getPark': api('visited'),
  });
  const t0 = 1_000_000;
  assert.equal(prefetch.peekParkShelf(8, 25, t0), null, 'nothing loaded yet');
  prefetch.prefetchParkShelf(8, 25, t0);
  assert.equal(prefetch.peekParkShelf(8, 25, t0), null, 'still in flight: never a half shelf');
  await new Promise(resolve => setTimeout(resolve, 5));
  const seeded = prefetch.peekParkShelf(8, 25, t0 + 45_000);
  assert.equal(seeded.visitedPark.name, 'Disneyland', 'a kid who read the win card for 45 s still gets the shelf at once');
  // The screen's own load takes the same request, and a remount can still paint from it.
  await prefetch.loadParkShelf(8, 25, t0 + 45_000);
  assert.ok(prefetch.peekParkShelf(8, 25, t0 + 46_000));
  assert.equal(prefetch.peekParkShelf(8, 25, t0 + prefetch.ARRIVAL_SEED_MAX_AGE_MS + 1), null, 'too old: read again');
  assert.equal(prefetch.peekParkShelf(2, 25, t0 + 1000), null, 'another park never borrows it');
  assert.equal(calls.length, 16, 'painted from the win prefetch, then one fresh read (it was older than 20 s)');

  const screen = read('src/screens/ParkScreen.tsx');
  assert.match(screen, /useState\(\(\) => isEarnedShelfArrival\(earnedCoin\) \? peekParkShelf\(Number\(park\), Number\(player\)\) : null\)/);
  assert.match(screen, /useState<boolean>\(!seed\)/);
  assert.match(screen, /const hidden = arriving && landedKey !== requestKey && closedKey !== requestKey && \(!!arrival\.target \|\| arrival\.pending\);/,
    'the earned coin is off its slot until it lands');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  const view = modal.slice(modal.indexOf('const handleViewCoin'), modal.indexOf('const challengeLayer'));
  // The first coin ever goes through the team step first (core loop 4.3 rule 3); otherwise the shelf opens at once.
  assert.match(view, /\{ name: 'Park', params: \{ park: park\.id, player: ownerId, earnedCoin/);
  assert.ok(view.indexOf('withTeamStep(shelf, () => RootNavigation.navigate(shelf.name') < view.indexOf('close();'), 'the shelf opens before the card starts to fade');
  assert.doesNotMatch(view, /afterRewardsHidden/);
  assert.match(view, /setTimeout\(onPress, SHELF_MAP_REFRESH_DELAY_MS\)/, 'the map refresh waits for the landing');
  assert.match(read('src/Root.tsx'), /earnedCoin \? \{ animation: 'none' \} : \{\}/);
});
