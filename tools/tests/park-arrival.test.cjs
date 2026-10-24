const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/park-arrival.test.cjs
// "Welcome to the park!": the arrival moment's cards, once-a-day rule and beat sheet.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const arrival = loadTs('src/components/park/parkArrival.ts');

const NOW = new Date('2026-10-24T13:00:00Z'); // 9 AM at the Florida parks
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const task = (id, extra = {}) => ({ id, name: `Ride ${id}`, latitude: '28.41', longitude: '-81.58', ...extra });
const limited = (id, endsAt) => task(id, { limited: { active: true, ends_at: endsAt } });

test('three real cards: the limited coin leaving soonest, the boss time here, what is new', () => {
  const cards = arrival.arrivalCards({
    tasks: [task(1), limited(5, '2026-11-01T04:00:00+00:00'), limited(4, '2026-10-26T04:00:00+00:00'),
      task(7, { active_from: '2026-10-24 08:38:07' }), task(8, { active_from: '2026-10-23 10:00:00' })],
    nextBoss: { at: '2026-10-24T11:00:00-04:00', park_name: 'Magic Kingdom Park' },
    parkNames: ['Magic Kingdom Park', 'Magic Kingdom'], now: NOW,
  });
  same(cards.map(c => c.kind), ['limited', 'boss', 'new']);
  assert.equal(cards[0].taskId, 4, 'the limited coin that leaves first leads');
  assert.equal(cards[0].count, 2);
  assert.equal(cards[1].time, '11 AM', 'the boss shows the park wall clock');
  assert.equal(cards[2].count, 2);
});

test('never invents a card: a boss at another park or no data falls back to the coins to find', () => {
  const cards = arrival.arrivalCards({
    tasks: [task(1), task(2), task(3)],
    nextBoss: { at: '2026-10-24T11:00:00-04:00', park_name: 'Magic Kingdom Park' },
    parkNames: ['Disneyland Park', 'Disneyland'], now: NOW,
  });
  same(cards, [{ kind: 'coins', count: 3 }]);
  same(arrival.arrivalCards({ tasks: [], nextBoss: null, parkNames: ['X'], now: NOW }), []);
});

test('a boss from yesterday or next week is not today', () => {
  const base = { tasks: [task(1)], parkNames: ['Epic Universe'], now: NOW };
  const kinds = at => arrival.arrivalCards({ ...base, nextBoss: { at, park_name: 'Epic Universe' } }).map(c => c.kind);
  same(kinds('2026-10-31T11:00:00-04:00'), ['coins']);
  same(kinds('2026-10-23T11:00:00-04:00'), ['coins']);
});

test('boss time label reads the park clock', () => {
  assert.equal(arrival.bossTimeLabel('2026-10-24T15:30:00-04:00'), '3:30 PM');
  assert.equal(arrival.bossTimeLabel('2026-10-24T00:00:00-07:00'), '12 AM');
  assert.equal(arrival.bossTimeLabel('2026-10-24T12:00:00Z'), '12 PM');
  assert.equal(arrival.bossTimeLabel('soon'), null);
});

test('once per park per day, and old days are dropped', () => {
  const day = arrival.parkDayKey(new Date(2026, 9, 24, 9, 30));
  assert.equal(day, '2026-10-24');
  let seen = arrival.markArrivalSeen({ 3: '2026-10-23' }, 2, day);
  same(seen, { 2: day });
  assert.equal(arrival.arrivalSeenToday(seen, 2, day), true);
  assert.equal(arrival.arrivalSeenToday(seen, 8, day), false, 'a different park plays its own arrival');
  assert.equal(arrival.arrivalSeenToday(seen, 2, '2026-10-25'), false, 'a new day plays it again');
  seen = arrival.markArrivalSeen(seen, 8, day);
  same(seen, { 2: day, 8: day });
});

test('the beat sheet: payoff inside 1.5 s, letters inside 400 ms, all gone inside 4.5 s', () => {
  const A = arrival.ARRIVAL;
  assert.ok(A.burstAt <= 1500 && A.cardsAt + 2 * A.cardStepMs <= 1500);
  assert.ok(A.scrimOpacity <= 0.3, 'the map stays visible under the scrim');
  for (const n of [1, 6, 13, 24]) {
    const delays = arrival.letterDelays(n);
    assert.equal(delays.length, n);
    assert.ok(delays[n - 1] - delays[0] <= A.letterCapMs, `${n} letters fit in ${A.letterCapMs} ms`);
    for (let i = 1; i < n; i += 1) assert.ok(delays[i] - delays[i - 1] <= A.letterStepMs);
  }
  assert.ok(arrival.arrivalEndsAt(3) <= 4500, `ends at ${arrival.arrivalEndsAt(3)}`);
  assert.ok(A.confetti <= 28 && A.sparkles <= 12, 'particle caps');
  assert.ok(A.minTapAt < A.burstAt + 400, 'a tap can hand off soon after the name lands');
});

test('the ribbon title always fits on one line', () => {
  for (const name of ['EPIC UNIVERSE', 'DISNEYLAND', 'UNIVERSAL STUDIOS HOLLYWOOD', 'MAGIC KINGDOM']) {
    const size = arrival.arrivalTitleSize(name, 280);
    assert.ok(size * 0.62 * name.length <= 280 + 18 * 0.62 * name.length, name);
    assert.ok(size >= 18 && size <= 40);
  }
  assert.equal(arrival.arrivalTitle('Magic Kingdom', 'Magic Kingdom Park'), 'MAGIC KINGDOM');
});

test('the moment stays on the motion language, the power budget and kid-safe art', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /momentParticles\(ARRIVAL\.confetti/);
  assert.match(src, /momentParticles\(ARRIVAL\.sparkles/);
  assert.match(src, /flashPeak\(isDimFlashingLightsEnabled\(\)/);
  assert.match(src, /useAmbientLoop/, 'the coin spin is an ambient loop');
  assert.match(src, /useReduceMotionPreference/, 'never starts before Reduce Motion is known');
  assert.doesNotMatch(src, /onLayout/, 'no layout callbacks on animated views');
  assert.doesNotMatch(src, /from 'react-native-svg'/);
  assert.doesNotMatch(src, /\bdice\b|slot machine|\bbet\b/i);
  const hook = read('src/components/park/useParkArrival.tsx');
  assert.match(hook, /PENDING_MAX_MS/, 'a stuck arrival never holds the chest forever');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /otherModalOpen:[^\n]*arrivalBusy/, 'the daily chest waits for the arrival');
  assert.match(explore, /dialogOpen:[^\n]*arrivalBusy/, "Finn's tips wait for the arrival");
});
