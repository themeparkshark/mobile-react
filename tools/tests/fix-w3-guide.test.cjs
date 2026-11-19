'use strict';
/**
 * Fix round w3, lane guide (Nov 18 2026): the guide card, PLAY! and today's Adventure ticket always name one coin.
 * Each test fails on 857c2ee5 (the graded build) and passes with the fix.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const G = loadTs('src/services/guide/nextCoin.ts');
const C = loadTs('src/services/guide/guideCopy.ts');
const R = loadTs('src/components/guide/playRangeCheck.ts');
const A = loadTs('src/components/guide/coinArtCache.ts');
const T = loadTs('src/services/help/tipGate.ts');
const P = loadTs('src/screens/ExploreScreen/adventureTicketPresentation.ts');
const read = rel => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

const BASE = { latitude: 33.8100, longitude: -117.9190 };
const north = m => ({ latitude: BASE.latitude + m / 111320, longitude: BASE.longitude });
const coin = (taskId, name, meters, extra = {}) => ({ taskId, name, parkId: 8, kind: 'ride', owned: false, ...north(meters), ...extra });
const NOW = Date.parse('2026-11-18T19:00:00Z');
const input = (extra = {}) => ({ mode: 'park', parkId: 8, location: BASE, coins: [], live: {}, now: NOW, ...extra });
const ctx = (extra = {}) => ({ parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 2, freeStep: null,
  queueTicketsOn: false, adventureDots: null, ...extra });

test('T003: PLAY! up for a coin beats a fresh pick, a held pick and a line: the card names PLAY!\'s coin', () => {
  const rides = [coin(1, 'Jungle Cruise', 5), coin(2, 'Tiki Room', 120), coin(3, 'Indiana Jones', 300)];
  const live = { 1: 'open', 2: 'open', 3: 'open' };
  const shelfPick = { taskId: 3, parkId: 8, name: 'Indiana Jones', kind: 'ride', reason: 'chosen', source: 'shelf', meters: 300,
    inRange: false, checkRunning: false, leavesOn: null };
  // A held pick of the player's, PLAY! up for Jungle Cruise: the card says You're here for Jungle Cruise.
  const held = G.pickNextCoin(input({ coins: rides, live, current: shelfPick, currentPickedAt: NOW - 1000, playableTaskId: 1 }));
  assert.equal(held.taskId, 1);
  assert.equal(held.reason, 'in_range');
  assert.equal(G.guideState(input(), C ? { ...held } : held), 'here');
  // A fresh stray tap on another island while PLAY! is up: still PLAY!'s coin.
  const tap = G.pickNextCoin(input({ coins: rides, live, current: held, pickedTaskId: 2, pickedSource: 'callout', playableTaskId: 1 }));
  assert.equal(tap.taskId, 1);
  // Standing in another ride's line with PLAY! up for this coin: PLAY!'s coin.
  const line = G.pickNextCoin(input({ coins: [...rides, coin(4, 'Pirates', 8, { queue: true })], live: { ...live, 4: 'open' },
    inLineTaskId: 4, playableTaskId: 1 }));
  assert.equal(line.taskId, 1);
});

test('T003 and T008: the store goes back to the pick after the coin in passing, and the card says where it goes next', () => {
  G.guide.reset();
  const rides = [coin(1, 'Jungle Cruise', 5), coin(3, 'Indiana Jones', 300)];
  const live = { 1: 'open', 3: 'open' };
  G.guide.setTarget(3, 'shelf');
  G.guide.resolve(input({ coins: rides, live, playableTaskId: null }));
  assert.equal(G.guide.current().taskId, 3);
  // PLAY! rises for Jungle Cruise as the player passes: You're here, then Indiana Jones.
  G.guide.resolve(input({ coins: rides, live, playableTaskId: 1 }));
  assert.equal(G.guide.current().taskId, 1);
  assert.equal(G.guide.resumed().taskId, 3);
  const here = C.guideCardCopy('here', G.guide.current(), ctx({ thenName: G.guide.resumed().name }));
  assert.equal(here.title, 'You\'re here! Tap PLAY!');
  assert.match(here.line, /Jungle Cruise · Then: Indiana Jones/);
  // A pick made while PLAY! is up is the one the card goes back to.
  G.guide.setTarget(3, 'waittimes');
  G.guide.resolve(input({ coins: rides, live, playableTaskId: 1 }));
  assert.equal(G.guide.current().taskId, 1);
  assert.equal(G.guide.resumed().taskId, 3);
  // Walking on (PLAY! down): back to Indiana Jones, the player's pick.
  G.guide.resolve(input({ coins: rides, live, playableTaskId: null, location: north(40) }));
  assert.equal(G.guide.current().taskId, 3);
  assert.equal(G.guide.current().source, 'waittimes');
  G.guide.reset();
});

test('T010: after winning a coin in passing, a target the guide or a suggestion handed out gives way to the nearest open coin', () => {
  G.guide.reset();
  const rides = [coin(67, 'Main Street', 5), coin(64, 'Haunted Mansion', 270), coin(77, 'Tiki Room', 60)];
  const live = { 67: 'open', 64: 'open', 77: 'open' };
  G.guide.setTarget(64, 'lineplay_recap');
  G.guide.resolve(input({ coins: rides, live, playableTaskId: null }));
  assert.equal(G.guide.current().taskId, 64);
  assert.equal(G.guide.plan(), null, 'a suggestion card never becomes the plan');
  G.guide.resolve(input({ coins: rides, live, playableTaskId: 67 }));
  assert.equal(G.guide.current().taskId, 67);
  // Won Main Street (it leaves the map list): the nearest open coin, never Haunted Mansion 270 m back.
  G.guide.resolve(input({ coins: rides.filter(c => c.taskId !== 67), live, playableTaskId: null }));
  assert.equal(G.guide.current().taskId, 77);
  // The same walk with a pick of the player's: the pick comes back after the win.
  G.guide.reset();
  G.guide.setTarget(64, 'shelf');
  G.guide.resolve(input({ coins: rides, live, playableTaskId: null }));
  G.guide.resolve(input({ coins: rides, live, playableTaskId: 67 }));
  G.guide.resolve(input({ coins: rides.filter(c => c.taskId !== 67), live, playableTaskId: null }));
  assert.equal(G.guide.current().taskId, 64);
  G.guide.reset();
});

test('T008: a target holds through a walk; when it closes the card says why in one line', () => {
  G.guide.reset();
  const rides = [coin(66, 'Jungle Cruise', 180), coin(70, 'Pirates', 90), coin(77, 'Tiki Room', 200, { kind: 'sight' })];
  let live = { 66: 'open', 70: 'open' };
  G.guide.resolve(input({ coins: rides, live, playableTaskId: null }));
  const first = G.guide.current().taskId;
  // 10 minutes of walking fixes, nearer coins come and go: one target.
  for (let m = 0; m <= 170; m += 10) {
    G.guide.resolve(input({ coins: rides, live, playableTaskId: null, location: north(m) }));
    assert.equal(G.guide.current().taskId, first, `held at ${m} m`);
  }
  // The held ride closes: the guide moves on and says why.
  live = { ...live, [first]: 'closed' };
  G.guide.resolve(input({ coins: rides, live, playableTaskId: null, location: north(170) }));
  assert.notEqual(G.guide.current().taskId, first);
  const why = G.guide.replacedBy();
  assert.equal(why.taskId, first);
  const copy = C.guideCardCopy('walk', G.guide.current(), ctx({ replacedName: why.name }));
  assert.match(copy.line, new RegExp(`${why.name} is closed now`));
  G.guide.reset();
});

test('T004: TODAY\'S ADVENTURE only with its stamp dots, whatever set the pointer; the guide\'s nearest pick yields to the Adventure', () => {
  const target = { taskId: 77, parkId: 8, name: 'Tiki Room', kind: 'sight', reason: 'chosen', source: 'find', meters: 165,
    inRange: false, checkRunning: false, leavesOn: null };
  assert.equal(C.guideCardCopy('walk', target, ctx({ adventureDots: [false, false, false] })).kicker, 'TODAY\'S ADVENTURE');
  assert.equal(C.guideCardCopy('walk', target, ctx()).kicker, 'YOUR NEXT COIN');
  assert.equal(C.guideCardCopy('walk', { ...target, reason: 'adventure', source: 'guide' }, ctx()).kicker, 'NEXT COIN',
    'never the Adventure title without its dots');
  // The guide picked the nearest ride before today's Adventure arrived: the Adventure takes the card.
  const rides = [coin(76, 'Sword in the Stone', 40), coin(77, 'Tiki Room', 165, { kind: 'sight' })];
  const guideHeld = { taskId: 76, parkId: 8, name: 'Sword in the Stone', kind: 'ride', reason: 'nearest_open', source: 'guide', meters: 40,
    inRange: false, checkRunning: false, leavesOn: null };
  const t = G.pickNextCoin(input({ coins: rides, live: { 76: 'open' }, current: guideHeld, playableTaskId: null,
    adventure: { taskId: 77, parkId: 8, phase: 'discover' } }));
  assert.equal(t.taskId, 77);
  assert.equal(t.reason, 'adventure');
  // A pick of the player's still holds.
  const mine = G.pickNextCoin(input({ coins: rides, live: { 76: 'open' }, current: { ...guideHeld, reason: 'chosen', source: 'shelf' },
    playableTaskId: null, adventure: { taskId: 77, parkId: 8, phase: 'discover' } }));
  assert.equal(mine.taskId, 76);
  // The Adventure sheet names the card's coin when they differ.
  assert.match(read('src/screens/ExploreScreen/AdventureTicketCard.tsx'), /Your map's next coin: \$\{guideNextName\}/);
});

test('T024: a returning player reads today\'s ride by name, never "Your first chapter awaits"', () => {
  const ticket = { phase: 'discover', ride: { ride_name: 'Astro Blasters', lat: 0, lng: 0 }, discover: null, play: null };
  assert.equal(P.adventurePrompt(ticket, false, undefined, true).title, 'Today\'s ride: Astro Blasters');
  assert.equal(P.adventurePrompt(ticket).title, 'Your first chapter awaits');
});

test('T009: the range check never drops an answer and always asks with the latest fix next', async () => {
  const asked = [];
  const applied = [];
  let release = [];
  const checker = R.createRangeChecker(point => { asked.push(point.latitude); return new Promise(r => release.push(r)); },
    (answer, point) => applied.push([answer, point.latitude]));
  checker.request({ latitude: 1, longitude: 0 });
  checker.request({ latitude: 2, longitude: 0 });   // a walk: three fixes while the first is out
  checker.request({ latitude: 3, longitude: 0 });
  assert.deepEqual(asked, [1], 'one request at a time');
  release.shift()('far');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(applied, [['far', 1]], 'the first answer is kept (it used to be thrown away by the next fix)');
  assert.deepEqual(asked, [1, 3], 'then the latest fix, not every fix in between');
  release.shift()('JUNGLE');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(applied.at(-1), ['JUNGLE', 3]);
  checker.request({ latitude: 4, longitude: 0 });
  checker.cancel();
  release.shift()('stale');
  await new Promise(r => setImmediate(r));
  assert.equal(applied.length, 2, 'a cancelled answer never lands');
  // The map uses its own watched position: no second Highest-accuracy GPS read per check.
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(explore, /checkForRedeemable/);
  assert.match(explore, /createRangeChecker<CurrentRedeemableType \| undefined>\(\s*point => \{[\s\S]{0,500}?currentRedeemable\(point\.latitude, point\.longitude(?:, \{ pictureOnly \})?\)\);?/);
  // Before the first answer PLAY! is down for the guide too: no "Tap PLAY!" with no PLAY!.
  assert.match(read('src/components/guide/useMapGuide.ts'), /playableTaskId: rangeChecked \? playableTaskId \?\? null : null,/);
  // A few steps out with PLAY! not up yet: "Almost there", never "5 m".
  const near = { taskId: 66, parkId: 8, name: 'Jungle Cruise', kind: 'ride', reason: 'nearest_open', source: 'guide', meters: 6,
    inRange: false, checkRunning: false, leavesOn: null };
  assert.equal(C.guideCardCopy('walk', near, ctx()).line, 'Almost there');
});

test('T008 and T009: an in-range answer stops counting once the player walks off its coin', () => {
  const answer = { type: 'task', model: { id: 71, latitude: String(north(0).latitude), longitude: String(north(0).longitude) } };
  assert.equal(R.playAnswerNear(answer, north(10)), true);
  assert.equal(R.playAnswerNear(answer, north(45)), false, '45 m past the ride: no You\'re here, no PLAY!');
  assert.equal(R.playAnswerNear(undefined, north(0)), false);
  assert.equal(R.playAnswerNear({ type: 'vault', model: {} }, north(0)), true, 'no position: as the server said');
});

test('T001: an old selection clears after a 30 m walk or when PLAY! rises for another coin; PLAY! ignores selection', () => {
  assert.equal(R.selectionStale({ selectedTaskId: 5, selectedFrom: north(0), here: north(20), playRoseFor: null }), false);
  assert.equal(R.selectionStale({ selectedTaskId: 5, selectedFrom: north(0), here: north(31), playRoseFor: null }), true);
  assert.equal(R.selectionStale({ selectedTaskId: 5, selectedFrom: north(0), here: north(0), playRoseFor: 66 }), true);
  assert.equal(R.selectionStale({ selectedTaskId: 66, selectedFrom: north(0), here: north(0), playRoseFor: 66 }), false);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(explore, /selectedTask && selectedTask\.id !== playableTaskId \? null : playableTaskId/);
  assert.doesNotMatch(explore, /selectedTaskId=\{/);
});

test('T005: the walk welcome waits while PLAY! is up, and sits under the guide card', () => {
  assert.equal(T.parkTipFor({ inPark: true, rideCoinInRange: false, arrivalLessonDone: true, playUp: true }), null);
  assert.equal(T.parkTipFor({ inPark: true, rideCoinInRange: false, arrivalLessonDone: true, playUp: false }), 'park_hud');
  assert.match(read('src/screens/ExploreScreen.tsx'), /top: slotTop \+ GUIDE_CARD_HEIGHT \+ 10 \} : PARK_WELCOME_TIP_STYLE/);
});

test('T014: standing at a coin with no live word, the card says You\'re here! Tap PLAY! with a small Check it\'s running', () => {
  const t = { taskId: 66, parkId: 8, name: 'Jungle Cruise', kind: 'ride', reason: 'nearest_unknown', source: 'guide', meters: 5,
    inRange: true, checkRunning: true, leavesOn: null };
  const copy = C.guideCardCopy('here', t, ctx());
  assert.equal(copy.title, 'You\'re here! Tap PLAY!');
  assert.equal(copy.line, 'Jungle Cruise · Check it\'s running');
});

test('T015: the card keeps the target ride\'s own coin art after the trip goal read is late or failed', () => {
  A.coinArtCache.reset();
  A.coinArtCache.rememberAll([{ task_id: 66, coin_url: 'https://x/jungle.png' }, { task_id: 67, coin_url: '' }]);
  assert.equal(A.coinArtCache.get(66), 'https://x/jungle.png');
  assert.equal(A.coinArtCache.get(67), null);
  assert.match(read('src/components/guide/useMapGuide.ts'), /return here \|\| coinArtCache\.get\(guideTargetId\);/);
});

test('T016: PLAN plans: the shelf opens with the next coin picker on top, and the card says what PLAN does', () => {
  const home = C.guideCardCopy('home', null, ctx({ planName: null, treatsToTicket: 1 }));
  assert.equal(home.button.label, 'PLAN');
  assert.equal(home.line, 'Pick your next coin. 1 more treat = 1 Ticket');
  assert.equal(C.guideCardCopy('home', null, ctx({ planName: 'Astro Blasters', treatsToTicket: 2 })).line,
    'Next coin: Astro Blasters. Up to 2 treats = 1 Ticket');
  assert.match(read('src/screens/ExploreScreen.tsx'), /player: player\.id, plan: true \}\);/);
  assert.match(read('src/screens/ParkScreen.tsx'), /const storyTop = !planVisit && canChooseGoal/);
  assert.match(read('src/components/guide/NextCoinCard.tsx'), /wallet \|\| state === 'home' \? TICKET : COIN_FALLBACK/);
});

test('T009: PLAY! rises on the GPS fix for the coin the player stands at; the server\'s answer wins where it answered', () => {
  const tasks = [{ id: 66, latitude: String(north(0).latitude), longitude: String(north(0).longitude), ticket_cost: 1 },
    { id: 77, latitude: String(north(60).latitude), longitude: String(north(60).longitude), ticket_cost: 1 }];
  const base = { tasks, askedAt: north(40), failed: new Set(), tickets: 2 };
  assert.equal(R.provisionalPlay({ ...base, here: north(10) }).id, 66, 'inside 16 m: PLAY! now, no server wait');
  assert.equal(R.provisionalPlay({ ...base, here: north(20) }), null, 'outside the radius: no PLAY!');
  assert.equal(R.provisionalPlay({ ...base, here: north(10), askedAt: north(5) }), null, 'the server already said no from inside: it stands');
  assert.equal(R.provisionalPlay({ ...base, here: north(10), failed: new Set([66]) }), null, 'a coin that failed today never rises');
  assert.equal(R.provisionalPlay({ ...base, here: north(10), tickets: 0 }), null, 'short of Tickets: wait for the server (free try badges)');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /if \(playAnswerNear\(rangeAnswer, location\)\) return rangeAnswer;/);
  assert.match(read('src/components/RedeemModal.tsx'), /provisional\?: boolean \}\)\.provisional\) setOpenedRedeemable\(redeemable\)/);
});

test('T009: an answer left from an earlier visit never raises PLAY! before the redeem radius', () => {
  const answer = { type: 'task', model: { id: 152, latitude: String(north(0).latitude), longitude: String(north(0).longitude) } };
  assert.equal(R.playAnswerNear(answer, north(28)), false, '28 m out: no PLAY! from a stale answer');
  assert.equal(R.playAnswerNear(answer, north(18)), true, 'GPS wander just past 16 m keeps a fresh answer');
});

test('T014: back on the map, the live feed is read again at once (Wait Times showed it Operating a moment ago)', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const back = mapFocused && !mapWasFocused\.current;[\s\S]{0,120}if \(back && park\?\.id\) void loadLivePark\(\);/);
});

test('T019: a sight coin\'s win says NEW COIN, never NEW RIDE COIN', () => {
  assert.match(read('src/components/CoinCatchReveal.tsx'), /isNewCoin \? \(sight \? 'NEW COIN!' : 'NEW RIDE COIN!'\)/);
  assert.match(read('src/components/PostWinRewardsModal.tsx'), /isNewCoin \? \(sight \? 'NEW COIN' : 'NEW RIDE COIN'\)/);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /coin_kind\?: string \| null \}\)\.coin_kind !== 'ride'/);
});

test('safety finding 2: a PLAY! press while the last card is still leaving waits for it, then opens (never lost)', () => {
  const Q = loadTs('src/components/guide/playPressQueue.ts');
  let leaving = 1; const listeners = new Set(); const timers = [];
  const layers = { leavingCount: () => leaving, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const q = Q.createPressQueue(layers, { setTimeout: (run, ms) => { timers.push({ run, ms }); return timers.length; }, clearTimeout: () => undefined });
  let opened = 0;
  assert.equal(q.press(() => opened++), 'queued', 'the card is still leaving: the press waits');
  assert.equal(q.press(() => opened++), 'already', 'a second tap is the same press');
  assert.equal(opened, 0);
  leaving = 0; listeners.forEach(fn => fn());
  assert.equal(opened, 1, 'the sheet is gone: the card opens, once');
  assert.equal(q.press(() => opened++), 'now', 'nothing leaving: at once');
  assert.equal(opened, 2);
  // A leaked layer never blocks PLAY!: the wait ends by itself.
  leaving = 1; q.press(() => opened++);
  assert.equal(timers.at(-1).ms, Q.PRESS_WAIT_MAX_MS);
  timers.at(-1).run();
  assert.equal(opened, 3);
  const src = read('src/components/RedeemModal.tsx');
  assert.match(src, /const how = pressQueue\.press\(\(\) => openRef\.current\(\)\);/);
});

test('T009 and the walk: the card says Tap PLAY! only once PLAY! is drawn, and nothing opens by itself over PLAY!', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /playableTaskId: playRideShown \? playableTaskId : null,/);
  assert.ok(explore.indexOf('const [playRideShown, setPlayRideShown] = useState(false);') < explore.indexOf('} = useMapGuide({'),
    'declared before the guide reads it');
  const hook = read('src/components/guide/useMapGuide.ts');
  assert.match(hook, /const busyWithCoin = guideBusy\(\{ atPark: !!park, state: nextCoin\.state, playUp: playableTaskId != null, inLine: !!queueDwell \}\);/);
  assert.match(hook, /attentionGate\.publish\(\{ atPark: !!park, arrivedAt: nextCoin\.arrivedAt, walkingToTarget: busyWithCoin,/);
  const Q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  const base = { atPark: true, now: 100_000, arrivedAt: 0, walkingToTarget: true, playing: false, winCardClosedAt: null, autoOpenUsed: false };
  assert.equal(Q.autoOpenAllowed('ride_question', base), false, 'PLAY! up at a coin: the Ride Journal waits');
});

test('T012: "This coin moved on" keeps its full moment even when the next range answer drops the coin', () => {
  const src = read('src/components/RedeemModal.tsx');
  assert.match(src, /const movedOnShowing = !!movedOn\?\.showing && !available;/);
  assert.match(src, /\{!available && closedLabel && \(task \|\| movedOnShowing\) && \(/);
  assert.match(src, /setTimeout\(\(\) => setMovedOn\(current => current && \{ \.\.\.current, showing: false \}\), MOVED_ON_SHOW_MS\)/);
});

test('release walk: PLAY! up for a coin the memo still calls closed, or the map list has out of its window: the card names it', () => {
  const rides = [coin(57, 'Thunder Mountain', 5), coin(77, 'Tiki Room', 100, { kind: 'sight' })];
  const t = G.pickNextCoin(input({ coins: rides, live: { 57: 'closed' }, playableTaskId: 57,
    current: { taskId: 77, parkId: 8, name: 'Tiki Room', kind: 'sight', reason: 'adventure', source: 'guide', meters: 100,
      inRange: false, checkRunning: false, leavesOn: null } }));
  assert.equal(t.taskId, 57, 'PLAY!\'s own check read the feed as it is now');
  assert.equal(t.reason, 'in_range');
  const hook = read('src/components/guide/useMapGuide.ts');
  assert.match(hook, /model && !visibleTasks\.some\(task => task\.id === model\.id\) \? \[\.\.\.visibleTasks, model\] : visibleTasks/);
  assert.match(hook, /tasks: guideTasks,/);
});

test('hold R1: standing in a ride line (YOUR WAIT, Line story or the In line? offer), no Ride Journal opens by itself', () => {
  const Q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  const busy = g => Q.guideBusy({ atPark: true, state: 'here', playUp: false, inLine: false, ...g });
  assert.equal(busy({}), false, 'standing about: free to ask');
  assert.equal(busy({ state: 'walk' }), true);
  assert.equal(busy({ playUp: true }), true);
  assert.equal(busy({ state: 'in_line' }), true, 'the YOUR WAIT card');
  assert.equal(busy({ state: 'line_story' }), true);
  assert.equal(busy({ inLine: true, state: 'here' }), true, 'the In line? offer under another card');
  assert.equal(busy({ atPark: false, inLine: true }), false, 'home: not a park line');
  const base = { atPark: true, now: 100_000, arrivedAt: 0, playing: false, winCardClosedAt: null, autoOpenUsed: false };
  assert.equal(Q.autoOpenAllowed('ride_question', { ...base, walkingToTarget: busy({ state: 'in_line' }) }), false, 'the Ride Journal waits');
  assert.equal(Q.autoOpenAllowed('raid_result', { ...base, walkingToTarget: busy({ state: 'in_line' }) }), true, 'a raid result may still say hi');
});
