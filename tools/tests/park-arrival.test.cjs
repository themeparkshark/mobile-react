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

test('the beat sheet: payoff inside 1.5 s, letters landed before the hit, a 70 ms hold, all gone inside 4.5 s', () => {
  const A = arrival.ARRIVAL;
  assert.ok(A.burstAt <= 1500 && A.cardsAt + 2 * A.cardStepMs <= 1500);
  assert.equal(A.burstAt - A.hitAt, 70, 'one held 70 ms frame between the hit and the burst');
  assert.ok(A.lettersAt + A.letterSpanMs + 120 <= A.hitAt, 'every letter has landed before the hit');
  assert.ok(A.scrimOpacity <= 0.45, 'the map stays visible under the veil');
  assert.ok(A.handoffAt <= 2600, 'no long hold after the cards settle');
  assert.ok(A.pointAt > A.cardsAt + 2 * A.cardStepMs && A.pointAt < A.handoffAt, 'a micro-beat fills the wait');
  for (const n of [1, 6, 13, 24]) {
    const delays = arrival.letterDelays(n);
    assert.equal(delays.length, n);
    assert.ok(delays[n - 1] - delays[0] <= A.letterSpanMs, `${n} letters fit in ${A.letterSpanMs} ms`);
    for (let i = 1; i < n; i += 1) assert.ok(delays[i] - delays[i - 1] <= A.letterStepMs);
  }
  assert.ok(arrival.arrivalEndsAt(3) <= 4500, `ends at ${arrival.arrivalEndsAt(3)}`);
  assert.ok(A.confetti <= 28 && A.confettiSecond <= 28 && A.sparkles <= 12, 'particle caps per burst');
  assert.ok(A.minTapAt < A.burstAt + 400, 'a tap can hand off soon after the name lands');
});

test('haptics and sound are cued from the beat sheet: the hit, one tick per card as it lands, the goal, the handoff', () => {
  const A = arrival.ARRIVAL;
  const cues = arrival.arrivalCues(3, true, false);
  same(cues.map(c => c.kind), ['hit', 'card', 'card', 'card', 'goal', 'handoff']);
  assert.equal(cues[0].at, A.hitAt);
  assert.equal(cues[1].at, A.cardsAt + 120);
  assert.equal(cues.at(-1).at, A.handoffAt);
  for (let i = 1; i < cues.length; i += 1) assert.ok(cues[i].at > cues[i - 1].at, 'in order');
  same(arrival.arrivalCues(2, false, true).map(c => c.kind), ['hit', 'handoff'], 'Reduce Motion keeps the haptic and the sound');
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
  assert.match(src, /momentParticles\(A\.confetti/);
  assert.match(src, /momentParticles\(A\.sparkles/);
  assert.match(src, /<ArrivalFxCanvas/, 'confetti, sparkles and trails draw in one Skia canvas');
  assert.doesNotMatch(src, /function ConfettiPiece|<SparkleBurst/, 'no per-piece animated views');
  assert.doesNotMatch(src, />LIMITED</, 'a picture tag, never a word that reads like a countdown');
  assert.match(src, /flashPeak\(isDimFlashingLightsEnabled\(\)/);
  assert.match(src, /useAmbientLoop/, 'the coin spin is an ambient loop');
  assert.match(src, /useReduceMotionPreference/, 'never starts before Reduce Motion is known');
  assert.doesNotMatch(src, /<Animated\.View[^>]*onLayout/, 'no layout callbacks on animated views');
  assert.match(src, /runOnJS\(fire\)/, 'haptic and sound fire from the UI clock');
  assert.doesNotMatch(src, /setTimeout\([^\n]*playHaptic|setTimeout\([^\n]*playMoment/, 'no JS timers for beats');
  assert.doesNotMatch(src, /GameIcon name="coins"/, 'coins still to find never use the wallet coin stack');
  assert.doesNotMatch(src, /from 'react-native-svg'/);
  assert.doesNotMatch(src, /\bdice\b|slot machine|\bbet\b/i);
  const hook = read('src/components/park/useParkArrival.tsx');
  assert.match(hook, /PENDING_MAX_MS/, 'a stuck arrival never holds the chest forever');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /otherModalOpen:[^\n]*arrivalBusy/, 'the daily chest waits for the arrival');
  assert.match(explore, /dialogOpen:[^\n]*arrivalBusy/, "Finn's tips wait for the arrival");
});

test('the beat clock runs in real time under the system Reduce Motion (Reanimated would jump it and fire the handoff at once)', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /clock\.value = withTiming\(A\.clockMs, \{[^}]*reduceMotion: ReduceMotion\.Never/);
  const ribbon = read('src/components/park/FirstCoinRibbon.tsx');
  assert.match(ribbon, /reduceMotion: ReduceMotion\.Never/, 'the Reduce Motion fade is a real fade');
});

test('the moment never re-renders React once it plays: stable props, card targets in a shared value', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /const targets = useSharedValue<\(Point \| null\)\[\]>/);
  assert.doesNotMatch(src, /setTargets|useState\(/, 'no React state inside the stage');
  const hook = read('src/components/park/useParkArrival.tsx');
  assert.match(hook, /const onDone = useCallback\(/, 'a stable onDone');
  assert.match(hook, /const layer = useMemo\(/);
  assert.match(hook, /goal=\{playing\.goal\}/, 'the Daily 3 goal is fixed when the moment starts');
});

test('a second visit this week is the short hello: ribbon, name and cards, about 1.4 s, no confetti', () => {
  const R = arrival.ARRIVAL_REPEAT;
  assert.ok(R.handoffAt <= 1500 && R.handoffAt < arrival.ARRIVAL.handoffAt);
  assert.equal(R.confetti + R.confettiSecond, 0);
  assert.equal(R.burstAt - R.hitAt, 70, 'the same held frame');
  assert.ok(R.lettersAt + R.letterSpanMs + 120 <= R.hitAt);
  const delays = arrival.letterDelays(13, R);
  assert.ok(delays[12] - delays[0] <= R.letterSpanMs);
  same(arrival.arrivalCues(3, false, false, R).map(c => c.at), [R.hitAt, R.cardsAt + 120, R.cardsAt + R.cardStepMs + 120, R.cardsAt + 2 * R.cardStepMs + 120, R.handoffAt]);
  let h = arrival.markArrivalHistory({}, 2, '2026-10-20');
  assert.equal(arrival.arrivalIsRepeat(h, 2, '2026-10-20'), false, 'the same day is not a repeat');
  assert.equal(arrival.arrivalIsRepeat(h, 2, '2026-10-24'), true, 'back four days later');
  assert.equal(arrival.arrivalIsRepeat(h, 2, '2026-10-28'), false, 'a week later is a fresh party');
  assert.equal(arrival.arrivalIsRepeat(h, 8, '2026-10-24'), false, 'another park');
  h = arrival.markArrivalHistory(h, 8, '2026-10-29');
  same(Object.keys(h), ['8'], 'old visits are dropped');
});

test('Finn says hello a few ways (fixed per park and day); the boss time is a clock face', () => {
  const poses = new Set();
  for (let d = 1; d <= 20; d += 1) poses.add(arrival.finnPose(2, `2026-10-${String(d).padStart(2, '0')}`));
  assert.equal(poses.size, arrival.FINN_POSES);
  assert.equal(arrival.finnPose(2, '2026-10-24'), arrival.finnPose(2, '2026-10-24'));
  same(arrival.bossClockHands('2026-10-24T15:30:00-04:00'), { hour: 105, minute: 180, night: false });
  same(arrival.bossClockHands('2026-10-24T21:00:00-04:00'), { hour: 270, minute: 0, night: true });
  assert.equal(arrival.bossClockHands('soon'), null);
});

test('cards fly home on one arc shared with their gold trail', () => {
  const start = arrival.flyPoint(100, 400, 360, 40, false, 0);
  const end = arrival.flyPoint(100, 400, 360, 40, false, 1);
  same(start, { x: 100, y: 400 });
  same(end, { x: 360, y: 40 });
  const mid = arrival.flyPoint(100, 400, 360, 40, false, 0.5);
  assert.ok(mid.x > 230, 'bound for the HUD it swings right first');
  const lob = arrival.flyPoint(100, 400, 300, 380, true, 0.5);
  assert.ok(lob.y < 380, 'bound for a coin it lobs up');
  const hook = read('src/components/park/useParkArrival.tsx');
  assert.match(hook, /fresh \|\| \(!!playing && playing\.parkId === parkId\)/, 'the stack button is there while the cards fly and stays after');
});

test('capture aids are dev only: slow-mo is 1 outside dev, the frame HUD renders nothing without its env', () => {
  const time = read('src/components/park/momentTime.ts');
  assert.match(time, /const raw = __DEV__ \? Number\(process\.env\.EXPO_PUBLIC_MOMENT_SLOWMO \?\? '1'\) : 1;/);
  assert.match(time, /if \(MOMENT_SLOW === 1\) return rWithTiming\(to, config, callback\);/, 'a plain pass-through in every real build');
  const perf = read('src/components/park/momentPerf.ts');
  assert.match(perf, /export const PERF_HUD = __DEV__ && process\.env\.EXPO_PUBLIC_PERF_HUD === '1';/);
  const hud = read('src/components/park/DevPerfHud.tsx');
  assert.match(hud, /if \(!PERF_HUD\) return null;/);
});
