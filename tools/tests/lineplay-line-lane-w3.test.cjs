/**
 * Fix round w3, lane line: LinePlay and the ride log (T071 to T090). Each test fails without its fix.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('T076: only GO moves the next coin; DONE closes to the map and keeps the coin held when LinePlay opened', () => {
  const { doneKeepsTarget } = loadTs('src/services/lineplay/recapExit.ts');
  const astro = { taskId: 58, parkId: 8 };
  const thunder = { taskId: 57, parkId: 8 };
  assert.equal(doneKeepsTarget(astro, thunder), 58, 'the coin moved while in LinePlay: DONE puts Astro back');
  assert.equal(doneKeepsTarget(astro, null), 58);
  assert.equal(doneKeepsTarget(astro, astro), null, 'nothing moved: nothing to do');
  assert.equal(doneKeepsTarget(null, thunder), null, 'nothing held: the guide picks');
  assert.equal(doneKeepsTarget(astro, { taskId: 900, parkId: 10 }), null, 'another park now: never pull the old one back');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  const exit = screen.slice(screen.indexOf('const handleExit = useCallback'), screen.indexOf('const handleNavigateTab'));
  assert.match(exit, /navigation\.navigate\('Explore' as never\);/, 'DONE goes to the map, not back to Wait Times');
  assert.doesNotMatch(exit, /navigation\.goBack\(\)/);
  assert.match(exit, /guide\.setTarget\(keep, 'lineplay_done'\)/);
  assert.match(screen, /const heldAtOpen = useRef\(guide\.current\(\)\);/);
});

test('T085: a picture leads each choice on How did your wait end?', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /\{ text: 'I left the line', icon: 'back' \},\n\s+\{ text: 'I got to the ride', icon: 'ride' \},\n\s+\{ text: 'Keep playing', icon: 'play', style: 'cancel' \},/);
});

test('T081: a line story counts as found only after real time in this line', () => {
  const found = loadTs('src/services/lineplay/foundAdventures.ts', {
    '@react-native-async-storage/async-storage': { default: {} } });
  assert.equal(found.storyCreditEarned({ waitTimed: true, elapsedSeconds: 0 }), false, 'a 0-minute walk-on is no story');
  assert.equal(found.storyCreditEarned({ waitTimed: true, elapsedSeconds: 179 }), false);
  assert.equal(found.storyCreditEarned({ waitTimed: true, elapsedSeconds: 180 }), true);
  assert.equal(found.storyCreditEarned({ waitTimed: false, elapsedSeconds: 900 }), false, 'games from afar are no story');
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'),
    /if \(!storyCreditEarned\(\{ waitTimed: snapshot\.waitTimed, elapsedSeconds: snapshot\.elapsedSeconds \}\)\) return;\n\s+void noteFoundAdventure/);
});

test('T073: ride detection retries a failed start with backoff, and the map retry restarts it at once', async () => {
  const init = loadTs('src/services/rideDetectionInit.ts');
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(init.rideInitRetryDelay), [5_000, 15_000, 30_000, 60_000, 120_000, 120_000]);
  let asked = 0;
  const stop = init.onRideDetectionRetry(() => { asked += 1; });
  init.requestRideDetectionRetry();
  stop();
  init.requestRideDetectionRetry();
  assert.equal(asked, 1);
  const hook = read('src/hooks/useRideDetection.ts');
  assert.match(hook, /const stopRetryListen = onRideDetectionRetry\(retryNow\);/);
  assert.match(hook, /if \(!cancelled && !started\) retryTimer = setTimeout\(retryNow, rideInitRetryDelay\(failures\)\);/);
  assert.match(hook, /stopRetryListen\(\);\n\s+if \(retryTimer\) clearTimeout\(retryTimer\);/);
  assert.match(read('src/screens/ExploreScreen/ParkMapRetry.tsx'), /setRetrying\(true\);\n[^\n]*\n\s+requestRideDetectionRetry\(\);/);
});

test('T074 and T080: the in-line offer is its own picture button under the card, steady, and never swaps out Tap PLAY!', () => {
  const copy = loadTs('src/services/guide/guideCopy.ts');
  assert.deepEqual({ ...copy.lineOffer('here', 'Indiana Jones Adventure') }, { title: 'In line?', label: 'LINEPLAY' }, 'under Tap PLAY!');
  assert.deepEqual({ ...copy.lineOffer('walk', 'Autopia') }, { title: 'In line?', label: 'LINEPLAY' }, 'with a fresh pick elsewhere');
  assert.equal(copy.lineOffer('in_line', 'Autopia'), null, 'the card already is about this line');
  assert.equal(copy.lineOffer('line_story', 'Autopia'), null);
  assert.equal(copy.lineOffer('here', null), null, 'no dwell: no offer');

  const dwell = loadTs('src/screens/ExploreScreen/useQueueDwell.ts', { react: { useEffect() {}, useRef() {}, useState() {} },
    '../../services/RideDetectionService': { currentRideDwell: () => null } });
  const indy = { rideId: 580, rideName: 'Indiana Jones Adventure', parkId: 8 };
  const base = { endedRideId: null, endedAt: null };
  const t0 = 1_000_000;
  // The 096/097 jitter trace: shown, one jittery check misses (not still), the next is still again. No flip.
  let shown = dwell.nextDwell(null, indy, true, { ...base, now: t0, lastShownAt: t0 });
  assert.equal(shown.rideId, 580);
  shown = dwell.nextDwell(shown, indy, false, { ...base, now: t0 + 10_000, lastShownAt: t0 });
  assert.equal(shown?.rideId, 580, 'a jitter miss holds the offer');
  shown = dwell.nextDwell(shown, null, false, { ...base, now: t0 + 40_000, lastShownAt: t0 });
  assert.equal(shown?.rideId, 580, 'a missed poll holds it too');
  assert.equal(dwell.nextDwell(shown, null, false, { ...base, now: t0 + 61_000, lastShownAt: t0 }), null, 'walked off: it goes');
  assert.equal(dwell.nextDwell(shown, null, false, { ...base, now: t0 + 20_000, lastShownAt: t0, still: false }), null,
    'out of its zone and walking: it goes at once, never carried to the next line');
  assert.equal(dwell.nextDwell(shown, { ...indy, rideId: 571 }, false, { ...base, now: t0 + 20_000, lastShownAt: t0 }), null,
    'another line now: never the old one');
  assert.equal(dwell.nextDwell(shown, null, false, { now: t0 + 20_000, lastShownAt: t0, endedRideId: 580, endedAt: t0 + 15_000 }), null,
    'its wait just ended');

  const state = read('src/services/guide/nextCoin.ts');
  assert.match(state, /if \(input\.inLineTaskId != null && input\.inLineTaskId === target\.taskId && !playUpHere\) return 'in_line';/);
  const card = read('src/components/guide/NextCoinCard.tsx');
  assert.match(card, /if \(quiet && line\) return <LineButton label=\{button\.label\}/, 'never an underlined text link');
  assert.match(card, /\{lineOffer && <View style=\{styles\.actions\}>\n\s+<LineButton title=\{lineOffer\.title\}/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /case 'lineplay_here': void openLinePlayHere\(\)/);
});

test('T082: no clock digits and no coral in LinePlay (Sharky Swim tide, LinePlay Memory rim, the shell last-5 count)', () => {
  const engine = loadTs('src/games/memory/engine.ts');
  assert.equal(engine.modeFlags('timeAttack').quietClock, true, 'LinePlay Memory (queue solo) keeps a calm clock');
  assert.equal(engine.modeFlags('timeAttack').overtime, 'x2', 'scoring unchanged');
  assert.equal(engine.modeFlags('race').quietClock, false);
  assert.match(read('src/games/memory/MemoryGame.tsx'), /const calmClock = flags\.overtime === 'look' \|\| flags\.quietClock;/);
  const hud = read('src/games/sharky/render/SharkyHud.tsx');
  assert.match(hud, /const calmTide = s\.mode === MODE_QUEUE;\n\s+low = !calmTide && /);
  assert.match(hud, /label = calmTide \? '' : /);
  assert.match(read('src/gamekit/GameShellV2.tsx'), /count=\{finalCount && !linePlayMovement\}/);
});

test('T078: a tapped queue ride offers PLAY IN LINE on the card, one tap from the map', () => {
  const copy = loadTs('src/services/guide/guideCopy.ts');
  assert.deepEqual({ ...copy.calloutLineOffer({ rideId: 571 }, 121, 121, 'walk') }, { title: '', label: 'PLAY IN LINE', action: 'lineplay' });
  assert.equal(copy.calloutLineOffer(null, 121, 121, 'walk'), null, 'no line (a show, a sight): no offer');
  assert.equal(copy.calloutLineOffer({ rideId: 571 }, 121, 58, 'walk'), null, 'the card is about another coin');
  assert.equal(copy.calloutLineOffer({ rideId: 571 }, 121, 121, 'in_line'), null, 'already the in-line card');
  assert.match(read('src/screens/ExploreScreen.tsx'),
    /lineOffer=\{nextCoin\.lineOffer \?\? calloutLineOffer\(queueRide, selectedTask\?\.id \?\? null, nextCoin\.target\?\.taskId \?\? null, nextCoin\.state\)\}/);
});

test('T086: one name per game (the shell says the tile name) and the first story is STORY 1', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /\{linePlayMovement\?\.gameName \|\| title\}/);
  assert.match(shell, /\{subtitle && !linePlayMovement\?\.gameName \? \(/, 'no second mode name under it');
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'), /gameName: activeGame \? pageName\(activeGame, snapshot\.chapter\) : null,/);
  assert.match(read('src/services/lineplay/episodeRotation.ts'), /\? \(previous \+ 1\) % count\n\s+: 0;/);
});

test('T082 sibling: Whack-a-Shark in a line drains its ring with no number', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /const inLine = useContext\(LinePlayMovementContext\) != null;/);
  assert.match(whack, /quietTimer: ride \|\| inLine,/);
  assert.match(read('src/games/whack/render/WhackBoard.tsx'), /\{fontM && !hud\.ride && !hud\.quietTimer \? <Text x=\{timerTextX\}/);
});
