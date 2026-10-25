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
  assert.doesNotMatch(src, /setTargets/, 'no React state for the card targets');
  // Wave 5 round 3: the only stage state is the particle canvas leaving on the last frame (after it ends); the mount
  // steps live in StepGates and the tap catcher in its own component, so nothing re-renders the stage while it plays.
  assert.equal((src.match(/useState\(/g) || []).length, 1);
  assert.doesNotMatch(src, /setStep/);
  assert.match(src, /const \[fxOn, setFxOn\] = useState\(true\)/);
  assert.match(src, /if \(step === GO_STEP\) \{ mountedAll\.current = true; tryStart\(\); \}/);
  assert.match(src, /if \(holdRef\.current \|\| !laidOut\.current \|\| !artReady\.current \|\| !mountedAll\.current/, 'the moment starts only once every step has mounted');
  const hook = read('src/components/park/useParkArrival.tsx');
  assert.match(hook, /const onDone = useCallback\(/, 'a stable onDone');
  assert.match(hook, /const layer = useMemo\(/);
  assert.match(hook, /goal=\{shown\.goal\}/, 'the Daily 3 goal is fixed when the moment starts');
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

test('round 5: every fifth arrival is golden; the cards read as pictures; the veil keeps the map vivid', () => {
  assert.equal(arrival.arrivalIsGolden(5), true);
  assert.equal(arrival.arrivalIsGolden(10), true);
  for (const n of [0, 1, 2, 3, 4, 6, 9, NaN]) assert.equal(arrival.arrivalIsGolden(n), false, String(n));
  assert.ok(arrival.ARRIVAL.scrimOpacity <= 0.3, 'a light veil, the drawn park stays vivid under the rays');
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /styles\.plankCoin/, 'new coins stand on a little shelf plank');
  assert.match(src, /<GameIcon name="pin"/, 'coins to find read as a map pin');
  assert.match(src, /styles\.foil/, 'today\'s special coin wears a gold foil edge');
  assert.match(src, /const repeat = repeatVisit && !golden/, 'a golden arrival is always the full party');
  assert.match(src, /confettiPieces\(confetti, width, height - fxTop, 0, golden\)/);
  const fx = read('src/components/park/ArrivalFxCanvas.tsx');
  assert.match(fx, /if \(piece\.coin\)/, 'gold coins tumble in the golden rain');
  const hook = read('src/components/park/useParkArrival.tsx');
  assert.match(hook, /arrivalIsGolden\(arrivals\.current\)/);
  assert.match(hook, /AsyncStorage\.setItem\(COUNT_KEY\(playerId\)/, 'the count is kept per player');
});

test('round 6: no still hold, the cards are home by about 2.45 s and the veil lifts as they leave', () => {
  const A = arrival.ARRIVAL;
  assert.ok(A.handoffAt <= 1800, `the cards leave by 1.8 s (${A.handoffAt})`);
  assert.ok(arrival.arrivalEndsAt(3) <= 2500, `home by 2.5 s (${arrival.arrivalEndsAt(3)})`);
  const lastCardLands = A.cardsAt + 2 * A.cardStepMs + 120;
  assert.ok(A.handoffAt - lastCardLands <= 800, 'under 0.8 s between the last card landing and the flight home');
  assert.ok(A.cardsAt + A.shineAfterMs + A.shineMs <= A.handoffAt, 'the first shine finishes before the cards leave');
  assert.ok(A.pointAt + 120 + A.flipMs <= A.handoffAt, 'the limited coin flip finishes before it flies');
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /A\.scrimOpacity \* scrim\.value\) \* \(1 - leave\.value\)/, 'the veil lifts with the leave');
});

test('wave 5 round 2/3: a cold first arrival builds in small frames (gates), hands off on the UI thread and unmounts in two steps', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /const MOUNT_STEPS = 7;/);
  assert.match(src, /const GO_STEP = 5;/);
  for (const step of [1, 2, 3, 4, 5, 6, 7]) assert.match(src, new RegExp(`<StepGate steps=\\{steps\\} at=\\{${step}\\}>`), `layers mount at step ${step}`);
  const steps = read('src/components/park/mountSteps.tsx');
  assert.match(steps, /timer = setTimeout\(\(\) => \{\n        raf = requestAnimationFrame\(\(\) => \{/, 'one step per UI frame');
  assert.match(steps, /useSyncExternalStore\(steps\.subscribe, steps\.get, steps\.get\)/, 'only a gate re-renders on its step');
  // The flight home is scheduled with the rest of the beat sheet (no JS hop at the handoff); a tap reschedules it.
  assert.match(src, /scheduleLeave\(A\.handoffAt\);\n  \};/);
  assert.match(src, /if \(fromTap\) \{\n      cancelAnimation\(clock\);\n      scheduleLeave\(0\);/);
  assert.match(src, /setFxOn\(false\);\n    requestAnimationFrame\(\(\) => doneRef\.current\(\)\);/, 'the canvas leaves a frame before the stage');
  assert.match(src, /<StepGate steps=\{steps\} at=\{5\}>\n        \{fxOn && !reduced/);
  const art = read('src/components/park/arrivalArt.ts');
  assert.match(art, /ARRIVAL_ICONS\.map\(name => ICON_SOURCES\[name\]\)/, 'the card and pill icons are decoded with the art');
});

test('wave 5 round 3: map taps go through while the stage builds and once the cards leave; the moment starts after 5 steps', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.doesNotMatch(src, /<Pressable style=\{StyleSheet\.absoluteFill\} onPress=\{onTap\}[^/]*>\n\s+<Animated/, 'the veil is not inside a tap catcher');
  assert.match(src, /<TapCatcher live=\{live\} onTap=\{onTap\}/);
  assert.match(src, /function TapCatcher\([^]*?if \(!on\) return null;/, 'no tap catcher while the stage is not live');
  assert.match(src, /perfMark\('arrival\.start'\);\n    live\.set\(1\);/, 'live from the first visible frame');
  assert.match(src, /phase\.current = 'out';\n    live\.set\(0\);/, 'and not after the handoff');
  assert.match(src, /root[^\n]*pointerEvents="box-none"|style=\{\[StyleSheet\.absoluteFill, rootStyle\]\} pointerEvents="box-none"/);
  assert.match(src, /<Animated\.View pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, scrimStyle\]\}>/, 'the veil never takes a tap');
  // Build cost before the start: steps 0..5, about 2 frames each (34 ms + a frame) plus armMs: about 0.35 s.
  const A = arrival.ARRIVAL;
  assert.ok(5 * (34 + 17) + A.armMs + 17 <= 380, 'trigger to first frame about 0.35 s');
});

test('wave 5 round 2: the cards read with zero words and the cards are home by 2.2 s', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.doesNotMatch(src, />\?</, 'no "?" disc on the coins-to-find card');
  assert.match(src, /function CoinCount\(/, 'every count sits next to a gold coin');
  assert.equal((src.match(/<CoinCount count=\{card\.count\} kind="(new|find)" \/>/g) || []).length, 2);
  assert.match(src, /styles\.orbitCoin/, 'coins to find ring the map pin');
  assert.match(src, /if \(card\.kind === 'boss'\) return <BossClock card=\{card\} \/>;/, 'the boss card is the clock (no printed time)');
  assert.match(src, /const CLOCK = 5[0-9];/, 'a big clock face');
  assert.match(src, /hands\.night \? <GameIcon name="moon" size=\{20\} \/> : <SunMark \/>/);
  const A = arrival.ARRIVAL;
  assert.ok(arrival.arrivalEndsAt(3) <= 2300, `home by 2.3 s (${arrival.arrivalEndsAt(3)})`);
  assert.ok(A.handoffAt + 2 * A.flyStepMs + A.flyMs <= 2250, 'the last card is home by about 2.2 s');
});

test('wave 5 round 2: the Daily 3 pill is a tomorrow hook: bigger, the next pip glows, the chest, tomorrow\'s flame', () => {
  assert.equal(arrival.nextGoalPip({ done: 0, total: 3 }), 0);
  assert.equal(arrival.nextGoalPip({ done: 2, total: 3 }), 2);
  assert.equal(arrival.nextGoalPip({ done: 3, total: 3 }), null);
  const A = arrival.ARRIVAL;
  assert.ok(Math.abs(A.goalAt - (A.cardsAt + 2 * A.cardStepMs + 120)) <= 60, 'it pops on the cards\' landing beat');
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /pip: \{ width: 28, height: 28/, 'pips about 1.3x (22 to 28 pt)');
  assert.match(src, /<GameIcon name="chest" size=\{30\} \/>/);
  assert.match(src, /goal\.giftTomorrow && <View style=\{styles\.tomorrowGift\}><GameIcon name="gift"/);
  assert.match(src, /\{goal\.streak \+ 1\}/);
  assert.match(src, /flyPoint\(centerX, top \+ GOAL_H \/ 2, to\.x, to\.y, false, f\)/, 'it flies home after the cards');
  assert.doesNotMatch(src.slice(src.indexOf('const GoalStrip'), src.indexOf('const GOAL_H')), /hours|minutes|left|hurry|lose/i, 'no countdown or loss words');
  const hook = read('src/components/park/useParkArrival.tsx');
  assert.match(hook, /giftTomorrow: state\.streak\.next_milestone\?\.days_away === 1/, 'the gift only when the server\'s prize is tomorrow');
});

test('wave 5 round 3: the two counts look different (find: pin and coin, blue pill; new: plank and sparkle, gold pill)', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  const body = src.slice(src.indexOf('export function CoinCount'), src.indexOf('/** Where the small coins sit around the map pin'));
  assert.match(body, /kind === 'new'[^]*styles\.coinCountNew[^]*styles\.countPlank[^]*ARRIVAL_ART\.sparkle/);
  assert.match(body, /styles\.coinCountFind[^]*<GameIcon name="pin"/);
  assert.match(src, /coinCountFind: \{ backgroundColor: BRAND\.blueBright \}/);
  assert.match(src, /coinCountNew: \{ backgroundColor: BRAND\.gold/);
});

test('wave 5 round 3: the Daily 3 pill holds 300 ms past the cards, docks under the stack button on screen, glows, then the moment ends', () => {
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(src, /export const GOAL_HOLD_MS = 300;/);
  assert.match(src, /const goalAt = startIn \+ cards\.length \* A\.flyStepMs \+ GOAL_HOLD_MS;/);
  assert.match(src, /dockGlow\.value = withDelay\(goalAt \+ A\.flyMs - 60/, 'the next pip glows again once docked');
  assert.match(src, /if \(ok && i === last && !goal\) runOnJS\(finish\)\(\);/, 'with a goal the moment ends on the pill');
  assert.match(src, /goalDock\.value = withDelay\([^]*?runOnJS\(finish\)\(\);/);
  // The dock point stays on the screen for a 300 pt pill on a 375 pt phone (the stack button sits 39 pt from the edge).
  const { loadTs } = require('./helpers/ts-module.cjs');
  const scale = Number(/GOAL_DOCK_SCALE = ([0-9.]+);/.exec(src)[1]);
  for (const [w, pill] of [[375, 300], [402, 320], [440, 300]]) {
    const stackX = w - 39;
    const x = Math.min(stackX, w - 8 - (pill * scale) / 2);
    assert.ok(x + (pill * scale) / 2 <= w - 8 + 0.001, `docked pill on screen at ${w}`);
  }
  // Tomorrow's flame: a warm gold outline (no grey ghost), the day number inside it.
  assert.match(src, /<Path path=\{FLAME_PATH\} style="stroke" strokeWidth=\{2\.6\} strokeJoin="round" color=\{BRAND\.gold\} \/>/);
  assert.doesNotMatch(src, /tomorrowFlame: \{ opacity/);
  assert.match(src, /<TomorrowFlame day=\{goal\.streak \+ 1\} \/>/);
});

test('wave 5 round 3: the stage is built ahead while the map is busy and starts the frame the map is free', () => {
  const hook = read('src/components/park/useParkArrival.tsx');
  const src = read('src/components/park/ParkArrivalMoment.tsx');
  assert.match(hook, /const stageable = due && !playing && parkId !== null && !!tasks && !!playerId;/,
    'staged as soon as it is due and the coins are in (no `ready`, no waiting on the boss feed)');
  assert.doesNotMatch(hook.slice(hook.indexOf('const stageable'), hook.indexOf('// Start it:')), /setSeen|setItem|arrivals\.current \+= 1/, 'nothing is marked seen while staged');
  assert.match(hook, /cards: stagedCards \?\? cardsFor\(boss\.value\)/, 'the staged cards play as they are');
  assert.match(hook, /const shown = playing \?\? staged;\n  const hold = !playing;/);
  assert.match(hook, /golden=\{shown\.golden\} hold=\{hold\} onDone=\{onDone\}/);
  assert.match(src, /if \(holdRef\.current \|\| !laidOut\.current/, 'a held stage never starts');
  assert.match(src, /useEffect\(\(\) => \{\n    if \(!hold\) tryStart\(\);/, 'and starts once the map is free');
  assert.match(src, /accessibilityElementsHidden=\{hold\} importantForAccessibility=\{hold \? 'no-hide-descendants' : 'auto'\}/);
  // Same key while staged and playing: the built stage is the one that plays (no remount).
  assert.match(hook, /key=\{`\$\{shown\.parkId\}:\$\{shown\.replay \? 'r' : 'f'\}`\}/);
});
