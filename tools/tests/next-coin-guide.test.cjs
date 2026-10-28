'use strict';
/**
 * The Next Coin guide (core loop blueprint 4.1): one card, one target.
 * Pure resolver (pickNextCoin), card state (guideState), honest live status
 * (liveAnswers), the one pointer owner (guide) and the free-Tickets order
 * (src/services/guide/freeTickets.ts).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const G = loadTs('src/services/guide/nextCoin.ts');
const F = loadTs('src/services/guide/freeTickets.ts');

// Disneyland-ish layout: 1 m of latitude is about 1/111320 degrees.
const BASE = { latitude: 33.8100, longitude: -117.9190 };
const north = m => ({ latitude: BASE.latitude + m / 111320, longitude: BASE.longitude });
const coin = (taskId, name, meters, extra = {}) => ({
  taskId, name, parkId: 8, kind: 'ride', owned: false, ...north(meters), ...extra,
});
const NOW = Date.parse('2026-10-28T19:00:00Z');
const input = (extra = {}) => ({ mode: 'park', parkId: 8, location: BASE, coins: [], live: {}, now: NOW, ...extra });

const RIDES = [
  coin(1, 'Jungle Cruise', 300),
  coin(2, 'Haunted Mansion', 200),
  coin(3, 'Space Ride', 120),
  coin(4, 'Walt Statue', 400, { kind: 'sight' }),
];

test('rule 7 then 8: known-open rides come before rides with no live answer', () => {
  const t = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open' } }));
  assert.equal(t.taskId, 1, 'the open ride wins even though others are nearer');
  assert.equal(t.reason, 'nearest_open');
  assert.equal(t.checkRunning, false);
  const off = G.pickNextCoin(input({ coins: RIDES, live: {} }));
  assert.equal(off.taskId, 3, 'feed off: the nearest ride with no answer');
  assert.equal(off.reason, 'nearest_unknown');
  assert.equal(off.checkRunning, true, 'the card adds "Check it\'s running"');
});

test('scripted night: the guide never names a closed ride; sights or the resting message instead', () => {
  const closed = { 1: 'closed', 2: 'closed', 3: 'closed' };
  const t = G.pickNextCoin(input({ coins: RIDES, live: closed }));
  assert.equal(t.taskId, 4);
  assert.equal(t.kind, 'sight');
  assert.equal(t.reason, 'nearest_sight');
  const none = G.pickNextCoin(input({ coins: RIDES.filter(c => c.kind === 'ride'), live: closed }));
  assert.equal(none, null);
  assert.equal(G.guideState(input(), none), 'resting');
  // A held target that closes is dropped, never kept.
  const held = G.pickNextCoin(input({ coins: RIDES, live: { 2: 'open' } }));
  assert.equal(held.taskId, 2);
  const after = G.pickNextCoin(input({ coins: RIDES, live: { ...closed }, current: held }));
  assert.notEqual(after.taskId, 2);
  assert.equal(after.kind, 'sight');
});

test('scripted feed-off (state D): still names a ride or sight, and the in-line state still fires on dwell', () => {
  const t = G.pickNextCoin(input({ coins: RIDES, live: undefined }));
  assert.ok(t && [1, 2, 3, 4].includes(t.taskId));
  const line = G.pickNextCoin(input({ coins: RIDES, live: undefined, inLineTaskId: 1, current: t }));
  assert.equal(line.taskId, 1);
  assert.equal(line.reason, 'in_line');
  assert.equal(G.guideState(input({ inLineTaskId: 1 }), line), 'in_line');
  // A sight or a non-queue ride is never an in-line target.
  assert.equal(G.pickNextCoin(input({ coins: RIDES, inLineTaskId: 4 })).reason, 'nearest_unknown');
  const walkThrough = [coin(9, 'Castle Walk', 100, { queue: false })];
  assert.equal(G.pickNextCoin(input({ coins: walkThrough, inLineTaskId: 9 })).reason, 'nearest_unknown');
  // A known-closed ride never gets the in-line state.
  assert.equal(G.pickNextCoin(input({ coins: RIDES, live: { 1: 'closed' }, inLineTaskId: 1 })).taskId !== 1, true);
});

test('scripted esplanade: never a coin in the other park', () => {
  const otherPark = [coin(20, 'Car Ride', 10, { parkId: 9 }), coin(21, 'Pier Wheel', 30, { parkId: 9 })];
  const t = G.pickNextCoin(input({ coins: [...otherPark, ...RIDES], live: { 20: 'open', 21: 'open' } }));
  assert.equal(t.parkId, 8);
  assert.ok(![20, 21].includes(t.taskId));
  assert.equal(G.pickNextCoin(input({ coins: otherPark })), null, 'only the other park: resting, not its coin');
  assert.equal(G.pickNextCoin(input({ coins: RIDES, parkId: null })), null, 'no park resolved: no target');
  // Even a pick or a plan in the other park is ignored.
  assert.equal(G.pickNextCoin(input({ coins: [...otherPark, ...RIDES], pickedTaskId: 20, live: { 1: 'open' } })).taskId, 1);
  assert.equal(G.pickNextCoin(input({ coins: [...otherPark, ...RIDES], chosenTaskId: 21, live: { 1: 'open' } })).taskId, 1);
});

test('home: never a park goal or the Adventure; only the planned coin, and the home state', () => {
  const home = { mode: 'home', parkId: 8, location: north(30000), coins: RIDES, live: {},
    adventure: { taskId: 2, parkId: 8, phase: 'discover' }, now: NOW };
  assert.equal(G.pickNextCoin(home), null);
  assert.equal(G.guideState(home, null), 'home');
  const plan = G.pickNextCoin({ ...home, chosenTaskId: 1 });
  assert.equal(plan.taskId, 1);
  assert.equal(plan.reason, 'plan');
  assert.equal(plan.meters, null, 'no distance at home');
  assert.equal(plan.inRange, false);
  assert.equal(G.guideState(home, plan), 'home');
  assert.equal(G.guideState({ ...home, daysAway: 20 }, plan), 'welcome_back');
  assert.equal(G.pickNextCoin({ ...home, chosenTaskId: 1, coins: RIDES.map(c => ({ ...c, owned: true })) }), null);
});

test('Adventure Line story: after winning its coin, the ride stays the target until the story is played or another coin is picked', () => {
  const won = RIDES.map(c => (c.taskId === 2 ? { ...c, owned: true } : c));
  const adventure = { taskId: 2, parkId: 8, phase: 'play' };
  const first = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure }));
  assert.equal(first.taskId, 2, 'rule 1 beats the nearest open ride');
  assert.equal(first.reason, 'line_story');
  assert.equal(G.guideState(input({ adventure }), first), 'line_story');
  // Held across moves. PLAY! rising for another coin shows "You're here" for it only while the
  // player stands there; walking on, the Line story comes back.
  const passing = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure, current: first, location: north(120) }));
  assert.equal(passing.taskId, 3);
  assert.equal(passing.reason, 'in_range');
  const held = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure, current: passing, resumeTarget: first, location: north(60) }));
  assert.equal(held.taskId, 2);
  assert.equal(held.reason, 'line_story');
  // Story played: phase moves to celebrate, the owned coin is no longer a target.
  const played = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure: { ...adventure, phase: 'celebrate' }, current: held }));
  assert.equal(played.taskId, 1);
  // Declined: the player picked another coin.
  const declined = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure: { ...adventure, lineStoryDeclined: true } }));
  assert.equal(declined.taskId, 1);
  // Before the coin is won, today's Adventure ride is rule 5 (after in-range, in-line and chosen).
  const discover = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, adventure: { ...adventure, phase: 'discover' } }));
  assert.equal(discover.taskId, 2);
  assert.equal(discover.reason, 'adventure');
  const closedAdventure = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'closed' }, adventure: { ...adventure, phase: 'discover' } }));
  assert.equal(closedAdventure.taskId, 1, 'a closed Adventure ride is never the target');
});

test('the target holds: it changes only for a win, a closure or the player\'s pick', () => {
  const live = { 1: 'open', 2: 'open', 3: 'open' };
  const t = G.pickNextCoin(input({ coins: RIDES, live }));
  assert.equal(t.taskId, 3);
  // Walk toward Jungle Cruise's side: Haunted Mansion becomes nearer, the target stays.
  const moved = G.pickNextCoin(input({ coins: RIDES, live, current: t, location: north(260), playableTaskId: null }));
  assert.equal(moved.taskId, 3);
  // In range of another coin: PLAY! rises for it and the card says "You're here" for it while the
  // player stands there (one pointer, never a card that disagrees with PLAY!) ...
  const passing = G.pickNextCoin(input({ coins: RIDES, live, current: t, location: north(200) }));
  assert.equal(passing.taskId, 2);
  assert.equal(passing.reason, 'in_range');
  assert.equal(passing.inRange, true);
  // ... and walking on without playing, the target from before comes back (it never changed).
  const walkedOn = G.pickNextCoin(input({ coins: RIDES, live, current: passing, resumeTarget: t, location: north(140) }));
  assert.equal(walkedOn.taskId, 3);
  assert.equal(walkedOn.reason, t.reason);
  // With the map's own PLAY! check, only the coin PLAY! is up for counts.
  const mapSaysNo = G.pickNextCoin(input({ coins: RIDES, live, current: t, location: north(200), playableTaskId: null }));
  assert.equal(mapSaysNo.taskId, 3, 'PLAY! is down: no "You\'re here" for a coin the geometry calls near');
  // Won the passing coin: back to the target from before.
  const wonPassing = G.pickNextCoin(input({ coins: RIDES.map(c => (c.taskId === 2 ? { ...c, owned: true } : c)), live, current: passing, resumeTarget: t, location: north(200) }));
  assert.equal(wonPassing.taskId, 3);
  // Won.
  const won = G.pickNextCoin(input({ coins: RIDES.map(c => (c.taskId === 3 ? { ...c, owned: true } : c)), live, current: t }));
  assert.notEqual(won.taskId, 3);
  // Picked.
  const picked = G.pickNextCoin(input({ coins: RIDES, live, current: t, pickedTaskId: 1, pickedSource: 'callout' }));
  assert.equal(picked.taskId, 1);
  assert.equal(picked.reason, 'chosen');
  assert.equal(picked.source, 'callout');
  // A closed pick is ignored and the target holds.
  const closedPick = G.pickNextCoin(input({ coins: RIDES, live: { ...live, 1: 'closed' }, current: t, pickedTaskId: 1 }));
  assert.equal(closedPick.taskId, 3);
});

test('the guide store remembers the target from before a coin in passing, and drops it after a pick', () => {
  G.guide.reset();
  const live = { 1: 'open', 2: 'open', 3: 'open' };
  const base = { mode: 'park', parkId: 8, coins: RIDES, live, now: NOW };
  assert.equal(G.guide.resolve({ ...base, location: BASE }).taskId, 3);
  assert.equal(G.guide.resolve({ ...base, location: north(200), playableTaskId: 2 }).taskId, 2, 'PLAY! up for Haunted Mansion');
  assert.equal(G.guide.resolve({ ...base, location: north(200), playableTaskId: 2 }).taskId, 2, 'standing there it holds');
  assert.equal(G.guide.resolve({ ...base, location: north(170), playableTaskId: null }).taskId, 3, 'walked on: back to Space Ride');
  // A player's pick replaces everything, and a later coin in passing returns to the pick.
  G.guide.setTarget(1, 'callout');
  assert.equal(G.guide.resolve({ ...base, location: north(170), playableTaskId: null }).taskId, 1);
  G.guide.reset();
});

test('rule 2: with no target, an open unowned coin in range right now', () => {
  const t = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, location: north(195) }));
  assert.equal(t.taskId, 2);
  assert.equal(t.reason, 'in_range');
  assert.equal(t.inRange, true);
  assert.equal(G.guideState(input(), t), 'here');
  const radius = G.pickNextCoin(input({ coins: [coin(5, 'Big Ride', 90, { radiusMeters: 100 })], live: { 5: 'open' } }));
  assert.equal(radius.inRange, true, 'the coin\'s own radius decides range');
});

test('rule 4: the planned coin when open and in this park; never past 1.5 km', () => {
  const t = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, chosenTaskId: 1 }));
  assert.equal(t.taskId, 1);
  assert.equal(t.reason, 'chosen');
  const far = [coin(30, 'Far Ride', 1600), coin(31, 'Near Ride', 900)];
  const reach = G.pickNextCoin(input({ coins: far, live: { 30: 'open', 31: 'open' } }));
  assert.equal(reach.taskId, 31);
  assert.equal(G.pickNextCoin(input({ coins: [far[0]], live: { 30: 'open' } })), null, 'nothing more than 1.5 km away');
  const heldFar = G.pickNextCoin(input({ coins: far, live: { 30: 'open', 31: 'open' }, current: { ...reach, taskId: 30 } }));
  assert.equal(heldFar.taskId, 31, 'a held target that falls out of reach is dropped');
});

test('rule 6 and rule 10 wait for their rungs', () => {
  const coins = [coin(1, 'Jungle Cruise', 100), coin(2, 'Rush Ride', 300, { rush: true }),
    coin(3, 'Owned Ride', 50, { owned: true, levelUpReady: true })];
  const live = { 1: 'open', 2: 'open', 3: 'open' };
  assert.equal(G.pickNextCoin(input({ coins, live })).taskId, 1);
  assert.equal(G.pickNextCoin(input({ coins, live, starRushUnlocked: true })).reason, 'star_rush');
  const allOwned = coins.map(c => ({ ...c, owned: true }));
  assert.equal(G.pickNextCoin(input({ coins: allOwned, live })), null);
  const level = G.pickNextCoin(input({ coins: allOwned, live, coinLevelsUnlocked: true }));
  assert.equal(level.taskId, 3);
  assert.equal(level.reason, 'level_up');
  assert.equal(G.guideState(input(), level), 'level_up');
});

test('never an owned coin, except level up, the Line story and the line you stand in', () => {
  const owned = RIDES.map(c => ({ ...c, owned: true }));
  assert.equal(G.pickNextCoin(input({ coins: owned, live: { 1: 'open' } })), null);
  assert.equal(G.pickNextCoin(input({ coins: owned, live: { 1: 'open' }, pickedTaskId: 1 })), null, 'a pick of an owned coin is not a target');
  const line = G.pickNextCoin(input({ coins: owned, live: { 1: 'open' }, inLineTaskId: 1 }));
  assert.equal(line.taskId, 1, 'the wait powers an owned coin');
  const left = G.pickNextCoin(input({ coins: owned, live: { 1: 'open' }, current: line }));
  assert.equal(left, null, 'out of the line, the owned coin stops being the target');
});

test('card states: arrive, walk, here, and the out-of-Tickets order (claim before the free try)', () => {
  const t = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open' } }));
  assert.equal(G.guideState(input({ arrivedAt: NOW - 5000 }), t), 'arrive');
  assert.equal(G.guideState(input({ arrivedAt: NOW - 31000 }), t), 'walk');
  const wallet = (extra = {}) => ({ tickets: 0, claimable: [], freeTryReady: false, extraTries: 0, queueTicketsOn: false, ...extra });
  const here = { ...t, inRange: true };
  assert.equal(G.guideState(input({ wallet: wallet({ tickets: 2 }) }), here), 'here');
  assert.equal(G.guideState(input({ wallet: wallet({ claimable: [{ kind: 'stamp', tickets: 5 }], freeTryReady: true }) }), here), 'claim');
  assert.equal(G.guideState(input({ wallet: wallet({ claimable: [{ kind: 'stamp', tickets: 5 }] }) }), t), 'claim', 'claim shows while walking too');
  assert.equal(G.guideState(input({ wallet: wallet({ freeTryReady: true, extraTries: 2 }) }), here), 'free_try');
  assert.equal(G.guideState(input({ wallet: wallet({ freeTryReady: true }) }), t), 'walk', 'the free try waits for PLAY!');
  assert.equal(G.guideState(input({ wallet: wallet({ extraTries: 2 }) }), here), 'extra_try');
  assert.equal(G.guideState(input({ wallet: wallet() }), here), 'need_ticket');
  assert.equal(G.guideState(input({ wallet: wallet({ queueTicketsOn: true }) }), here), 'need_ticket');
  assert.equal(G.guideState(input({ daysAway: 15 }), t), 'welcome_back');
  assert.equal(G.guideState(input({ daysAway: 15, welcomeBackDone: true }), t), 'walk');
});

test('live status, honestly: a known-closed ride stays closed until a fresh open answer', () => {
  const feed = (status, at, extra = []) => ({ fetched_at: new Date(at).toISOString(), rides: [{ task_id: 1, status }, ...extra] });
  let r = G.liveAnswers({}, feed('DOWN', NOW), NOW);
  assert.equal(r.answers[1], 'closed');
  // The answer gets old (feed late): it never un-closes on its own.
  r = G.liveAnswers(r.memo, feed('DOWN', NOW), NOW + 181000);
  assert.equal(r.answers[1], 'closed');
  r = G.liveAnswers(r.memo, null, NOW + 3600000);
  assert.equal(r.answers[1], 'closed');
  // A stale OPERATING answer does not un-close it either.
  r = G.liveAnswers(r.memo, feed('OPERATING', NOW), NOW + 3600000);
  assert.equal(r.answers[1], 'closed');
  // A fresh open answer does.
  r = G.liveAnswers(r.memo, feed('OPERATING', NOW + 3600000), NOW + 3600000);
  assert.equal(r.answers[1], 'open');
  // An open answer counts only while fresh; then no answer (eligible after known-open rides).
  r = G.liveAnswers(r.memo, null, NOW + 3600000 + 181000);
  assert.equal(r.answers[1], undefined);
  // Unknown statuses and duplicate rows are not answers.
  r = G.liveAnswers({}, feed('UNKNOWN', NOW, [{ task_id: 2, status: 'CLOSED' }, { task_id: 2, status: 'OPERATING' }]), NOW);
  assert.deepEqual(plain(r.answers), {});
  // REFURBISHMENT and CLOSED are closed; after 12 hours with no answer, a new park day starts.
  r = G.liveAnswers({}, { fetched_at: new Date(NOW).toISOString(), rides: [{ task_id: 3, status: 'REFURBISHMENT' }, { task_id: 4, status: 'CLOSED' }] }, NOW);
  assert.equal(r.answers[3], 'closed');
  assert.equal(r.answers[4], 'closed');
  r = G.liveAnswers(r.memo, null, NOW + 13 * 3600000);
  assert.deepEqual(plain(r.answers), {});
  // A future-dated or unparseable feed is ignored.
  assert.deepEqual(plain(G.liveAnswers({}, feed('DOWN', NOW + 600000), NOW).answers), {});
  assert.deepEqual(plain(G.liveAnswers({}, { fetched_at: 'soon', rides: [{ task_id: 1, status: 'DOWN' }] }, NOW).answers), {});
});

test('the guide store is the one pointer: setTarget, current, subscribe', () => {
  G.guide.reset();
  let calls = 0;
  const off = G.guide.subscribe(() => { calls += 1; });
  const base = input({ coins: RIDES, live: { 1: 'open', 2: 'open', 3: 'open' } });
  assert.equal(G.guide.resolve(base).taskId, 3);
  assert.equal(G.guide.current().taskId, 3);
  const before = calls;
  G.guide.resolve(base);
  assert.equal(calls, before, 'no change, no notify');
  G.guide.setTarget(1, 'shelf');
  assert.equal(G.guide.plan(), 1);
  const picked = G.guide.resolve(base);
  assert.equal(picked.taskId, 1);
  assert.equal(picked.source, 'shelf');
  assert.equal(G.guide.resolve(base).taskId, 1, 'the pick holds on the next resolve');
  // Picking another coin while the Line story waits declines it.
  G.guide.reset();
  const won = RIDES.map(c => (c.taskId === 2 ? { ...c, owned: true } : c));
  const adventure = { taskId: 2, parkId: 8, phase: 'play' };
  assert.equal(G.guide.resolve({ ...base, coins: won, adventure }).reason, 'line_story');
  G.guide.setTarget(3, 'callout');
  assert.equal(G.guide.resolve({ ...base, coins: won, adventure }).taskId, 3);
  G.guide.clearPlan();
  G.guide.reset();
  assert.equal(G.guide.resolve({ ...base, coins: won, adventure }).reason, 'line_story', 'reset forgets the declined story');
  off();
  G.guide.setTarget(Number.NaN, 'bad');
  assert.equal(G.guide.plan(), null, 'a bad id is ignored');
  G.guide.reset();
});

test('free Tickets order: earned to claim (stamps first), free try, extra tries, line Ticket only with queue_tickets, treats', () => {
  const all = { tickets: 0, freeTryReady: true, extraTries: 2, queueTicketsOn: true,
    claimable: [{ kind: 'chest', tickets: 1, id: 'c' }, { kind: 'stamp', tickets: 5, id: 7 }, { kind: 'set', tickets: 0 }] };
  const steps = plain(F.freeTicketSteps(all));
  assert.deepEqual(steps.map(s => s.kind), ['claim', 'free_try', 'extra_try', 'line_ticket', 'treats']);
  assert.equal(steps[0].tickets, 6);
  assert.deepEqual(steps[0].sources.map(s => s.kind), ['stamp', 'chest'], 'stamps first, empty sources dropped');
  assert.equal(F.nextFreeTicket(all).kind, 'claim');
  assert.equal(F.nextFreeTicket({ ...all, claimable: [] }).kind, 'free_try');
  assert.equal(F.nextFreeTicket({ ...all, claimable: [], freeTryReady: false }).kind, 'extra_try');
  assert.equal(F.nextFreeTicket({ ...all, claimable: [], freeTryReady: false, extraTries: 0 }).kind, 'line_ticket');
  assert.equal(F.nextFreeTicket({ ...all, claimable: [], freeTryReady: false, extraTries: 0, lineTicketUnused: false }).kind, 'treats');
  assert.equal(F.nextFreeTicket({ ...all, claimable: [], freeTryReady: false, extraTries: 0, queueTicketsOn: false }).kind, 'treats');
  assert.equal(F.nextFreeTicket({ ...all, tickets: 1 }), null, 'holding a Ticket: PLAY! just spends it');
  assert.equal(F.playsNow(F.nextFreeTicket(all)), true);
  assert.equal(F.playsNow({ kind: 'treats', treatsPerTicket: 3 }), false);
  // State A (queue_tickets off): no line Ticket copy anywhere.
  assert.ok(F.needTicketLines(false).every(line => !/wait|line/i.test(line)));
  assert.ok(F.needTicketLines(true).some(line => /first wait at a ride earns a Ticket/.test(line)));
  assert.ok(F.needTicketLines(false).some(line => line === '3 treats at home = 1 Ticket.'));
  assert.ok([...F.needTicketLines(true)].every(line => !line.includes(String.fromCharCode(0x2014))), 'no em dashes in copy');
});

// ---------------------------------------------------------------------------
// guide-map lane, round 1: the card's words, the map's coins, park day events.

const C = loadTs('src/services/guide/guideCopy.ts');
const GC = loadTs('src/components/guide/guideCoins.ts');
const PD = loadTs('src/services/guide/parkDay.ts');
const ctx = (extra = {}) => ({ parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 6, freeStep: null,
  queueTicketsOn: false, adventureDots: null, ...extra });
const tgt = (extra = {}) => ({ taskId: 3, parkId: 8, name: 'Jungle Cruise', kind: 'ride', reason: 'nearest_open', source: 'guide',
  meters: 42, inRange: false, checkRunning: false, leavesOn: null, ...extra });

test('card words for every state: one title, one line, one button, in the 4.5 vocabulary', () => {
  const arrive = C.guideCardCopy('arrive', tgt(), ctx());
  assert.equal(arrive.kicker, 'WELCOME TO DISNEYLAND!');
  assert.equal(arrive.title, 'First coin: Jungle Cruise');
  assert.equal(arrive.line, '40 m');
  assert.equal(arrive.button.action, 'go');
  const walk = C.guideCardCopy('walk', tgt({ checkRunning: true }), ctx());
  assert.equal(walk.button, null, 'walking: the path is the guide');
  assert.equal(walk.line, '40 m · Check it\'s running');
  const here = C.guideCardCopy('here', tgt({ inRange: true }), ctx());
  assert.equal(here.title, 'You\'re here! Tap PLAY!');
  assert.equal(here.pointsAtPlay, true);
  const story = C.guideCardCopy('line_story', tgt({ reason: 'line_story' }), ctx({ adventureDots: [true, false, false] }));
  assert.deepEqual(plain([story.button.label, story.secondary.label, story.secondary.action]), ['LINEPLAY', 'Pick another coin', 'skip']);
  assert.deepEqual(plain(story.dots), [true, false, false], 'the Adventure Ticket is the card\'s 3-stamp frame');
  const inLine = C.guideCardCopy('in_line', tgt({ reason: 'in_line' }), ctx());
  assert.equal(inLine.title, 'In line for Jungle Cruise?');
  assert.equal(inLine.line, 'Your wait powers its coin');
  const claim = C.guideCardCopy('claim', tgt(), ctx({ tickets: 0, freeStep: { kind: 'claim', tickets: 5, sources: [] } }));
  assert.equal(claim.title, '5 free Tickets are waiting');
  assert.equal(claim.button.label, 'CLAIM');
  assert.equal(C.guideCardCopy('free_try', tgt({ inRange: true }), ctx()).button.badge, 'gift');
  assert.equal(C.guideCardCopy('extra_try', tgt({ inRange: true }), ctx()).title, 'Use an extra try');
  assert.equal(C.guideCardCopy('level_up', tgt({ reason: 'level_up', name: 'Haunted Mansion' }), ctx()).title, 'Haunted Mansion is ready to level up');
  const home = C.guideCardCopy('home', tgt({ reason: 'plan' }), ctx({ treatsToTicket: 2, planName: 'Jungle Cruise' }));
  assert.equal(home.title, 'Disneyland: 6 Tickets ready');
  assert.equal(home.line, 'Next coin: Jungle Cruise. 2 more treats = 1 Ticket');
  assert.equal(home.button.action, 'plan');
  const back = C.guideCardCopy('welcome_back', tgt(), ctx({ shelf: { owned: 9, total: 35 } }));
  assert.equal(back.title, 'Your Disneyland shelf: 9 of 35');
  // No banned word, no emoji, no em dash anywhere on the card.
  const all = [arrive, walk, here, story, inLine, claim, home, back].flatMap(c => [c.kicker, c.title, c.line, c.a11y, c.button?.label, c.secondary?.label]).filter(Boolean).join(' | ');
  assert.doesNotMatch(all, /PLAY RIDE|Rescue Pass|Park Tickets|home finds|snacks|Mastery|detour|Coin Challenge|\u2014|[\u{1F300}-\u{1FAFF}]/u);
});

test('state A: the line Ticket sentence shows only while queue_tickets is on', () => {
  const off = C.guideCardCopy('need_ticket', tgt(), ctx({ tickets: 0, queueTicketsOn: false }));
  assert.doesNotMatch(off.line, /wait at a ride/i, 'App Store switches: no line Ticket copy');
  assert.equal(off.button.label, 'SEE WAYS');
  assert.match(off.line, /3 treats at home = 1 Ticket\. Tomorrow brings a new free try\./);
  const on = C.guideCardCopy('need_ticket', tgt(), ctx({ tickets: 0, queueTicketsOn: true }));
  assert.match(on.line, /Your first wait at a ride earns a Ticket\./);
  assert.equal(on.button.label, 'LINEPLAY');
});

test('resting: the closed message, or "Sights stay open" while rides rest; dates in words, never a countdown', () => {
  const closed = C.guideCardCopy('resting', null, ctx({ ridesResting: true }));
  assert.equal(closed.title, 'The park is closed');
  assert.equal(closed.line, 'See you next park day');
  assert.equal(closed.button.action, 'shelf');
  const sight = tgt({ reason: 'nearest_sight', kind: 'sight', name: 'Walt Statue', meters: 60 });
  const resting = C.restingSightCopy(C.guideCardCopy('walk', sight, ctx({ ridesResting: true })), sight, true);
  assert.equal(resting.kicker, 'RIDES ARE RESTING');
  assert.equal(resting.title, 'Sights stay open: Walt Statue');
  assert.equal(resting.line, '60 m');
  assert.equal(C.leavesLine('2026-10-31'), 'leaves Saturday, Oct 31');
  assert.equal(C.leavesLine('soon'), null);
  assert.equal(C.guideDistance(1234), '1.2 km');
  assert.equal(C.guideDistance(2), '5 m');
});

test('map islands become guide coins: rides by live row or catalog, sights otherwise; only real queues can be "in line"', () => {
  const tasks = [
    { id: 1, name: 'Jungle Cruise', latitude: '33.8112', longitude: '-117.9201', times_completed: 0 },
    { id: 2, name: 'Walt Statue', latitude: '33.8121', longitude: '-117.9190', times_completed: 2 },
    { id: 3, name: 'Tiki Room', latitude: '33.8118', longitude: '-117.9196', times_completed: 0 },
    { id: 4, name: 'Train', latitude: '33.8105', longitude: '-117.9190', times_completed: 0 },
    { id: 5, name: 'Bad', latitude: 'x', longitude: '0', times_completed: 0 },
    { id: 6, name: 'Snow Spot', latitude: '33.8131', longitude: '-117.9190', times_completed: 0, limited: { active: true, ends_at: null, ends_on: '2026-10-31', returns: false } },
  ];
  const rides = GC.ridesByTask([
    { id: 80, task_id: 1, type: 'attraction', radius: 40 }, { id: 81, task_id: 3, type: 'show' }, { id: 82, task_id: 4, type: 'transport' },
    { id: 83, task_id: 6, type: 'other' },
  ]);
  const coins = GC.guideCoinsFor(tasks, 8, { rides, liveTaskIds: new Set([1]) });
  const by = Object.fromEntries(coins.map(c => [c.taskId, c]));
  assert.equal(coins.length, 5, 'a coin with no real position is skipped');
  assert.deepEqual(plain([by[1].kind, by[1].queue, by[1].radiusMeters]), ['ride', true, GC.PLAY_RANGE_METERS],
    'PLAY! range is the server redeem radius (16 m), not the queue zone');
  assert.equal(GC.PLAY_RANGE_METERS, 16);
  assert.deepEqual(plain([by[2].kind, by[2].owned]), ['sight', true], 'a statue is a sight (always open)');
  assert.deepEqual(plain([by[3].kind, by[3].queue]), ['ride', false], 'a show has no line to play in');
  assert.equal(by[4].queue, false, 'transport has no line');
  assert.equal(by[6].leavesOn, '2026-10-31');
  assert.equal(GC.inLineTaskFor(80, rides, coins), 1, 'the dwell ride maps to its coin');
  assert.equal(GC.inLineTaskFor(81, rides, coins), null, 'never a show');
  assert.equal(GC.inLineTaskFor(99, rides, coins), null);
  assert.equal(GC.guideCoinsFor(tasks, null).length, 0, 'no park, no coins');
});

test('wallet: earned stamp Tickets are claimable (stamps first), held passes are extra tries, the free try needs its switch', () => {
  const stamps = { tour: [{ id: 1, is_earned: true, reward_claimed: false, rewards: { tickets: 2 } },
    { id: 2, is_earned: true, reward_claimed: true, rewards: { tickets: 3 } }, { id: 3, is_earned: false, reward_claimed: false, rewards: { tickets: 1 } }],
  rides: [{ id: 4, is_earned: true, reward_claimed: false, rewards: { tickets: 0, energy: 5 } }, { id: 5, is_earned: true, reward_claimed: false, rewards: { tickets: 3 } }] };
  const sources = GC.stampTicketSources(stamps);
  assert.deepEqual(plain(sources), [{ kind: 'stamp', id: 1, tickets: 2 }, { kind: 'stamp', id: 5, tickets: 3 }]);
  const wallet = GC.guideWallet({ tickets: 0, heldPasses: 2, freeTryReady: true, queueTicketsOn: false, claimable: sources });
  assert.deepEqual(plain(F.nextFreeTicket(wallet)), { kind: 'claim', tickets: 5, sources: plain(sources) }, 'claim comes before the free try');
  const none = GC.guideWallet({ tickets: 0, heldPasses: 0, freeTryReady: false, queueTicketsOn: false, claimable: [] });
  assert.equal(F.nextFreeTicket(none).kind, 'treats');
  assert.equal(G.guideState(input({ wallet: none, coins: RIDES }), G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open' } }))), 'need_ticket');
});

test('park day events: started on the first in-park reading of a day, done on leaving with a coin (2 km or home), home_day once a day', () => {
  const inPark = { latitude: 33.8121, longitude: -117.9190 };
  let r = PD.EMPTY_PARK_DAY;
  let step = PD.parkDayStep(r, { mode: 'park', parkId: 8, location: inPark, today: '2026-10-28' });
  assert.deepEqual(plain(step.events), [{ kind: 'park_day_started', parkId: 8 }]);
  r = step.next;
  step = PD.parkDayStep(r, { mode: 'park', parkId: 8, location: inPark, today: '2026-10-28', coinsWon: 1 });
  assert.deepEqual(plain(step.events), [], 'once a day');
  r = step.next;
  assert.equal(r.coins, 1);
  // Just outside the gate (500 m): not a trusted exit yet.
  step = PD.parkDayStep(r, { mode: 'unknown', parkId: null, location: { latitude: 33.8166, longitude: -117.9190 }, today: '2026-10-28' });
  assert.deepEqual(plain(step.events), []);
  r = step.next;
  step = PD.parkDayStep(r, { mode: 'unknown', parkId: null, location: { latitude: 33.8350, longitude: -117.9190 }, today: '2026-10-28' });
  assert.deepEqual(plain(step.events), [{ kind: 'park_day_done', parkId: 8, coins: 1, day: '2026-10-28' }], '2 km out with a coin');
  r = step.next;
  step = PD.parkDayStep(r, { mode: 'home', parkId: null, location: null, today: '2026-10-28' });
  assert.deepEqual(plain(step.events), [{ kind: 'home_day' }], 'the day already counted as done; home day once');
  // A day with no coin never counts as done; the next home-mode open closes a day that had one.
  let s2 = PD.parkDayStep(PD.EMPTY_PARK_DAY, { mode: 'park', parkId: 2, location: inPark, today: '2026-11-01' }).next;
  assert.deepEqual(plain(PD.parkDayStep(s2, { mode: 'home', parkId: null, location: null, today: '2026-11-01' }).events), [{ kind: 'home_day' }]);
  s2 = PD.parkDayStep(s2, { mode: 'park', parkId: 2, location: inPark, today: '2026-11-01', coinsWon: 2 }).next;
  assert.deepEqual(plain(PD.parkDayStep(s2, { mode: 'home', parkId: null, location: null, today: '2026-11-02' }).events),
    [{ kind: 'home_day' }, { kind: 'park_day_done', parkId: 2, coins: 2, day: '2026-11-01' }]);
  const seen = [];
  const off = PD.parkDaySignal.subscribe(() => seen.push(PD.parkDaySignal.last().parkId));
  PD.parkDaySignal.publish({ parkId: 8, day: '2026-10-28', coins: 1, at: NOW });
  off();
  assert.deepEqual(seen, [8], 'the shelf hears the park day story moment');
  PD.parkDaySignal.reset();
});

test('a tapped coin says "Walk closer: N m" until PLAY! can rise; calm timers say when, never a countdown', () => {
  assert.equal(C.calloutDistance(120, false), 'Walk closer: 120 m');
  assert.equal(C.calloutDistance(30, false), 'Walk closer: 30 m');
  assert.equal(C.calloutDistance(12, false), 'You\'re here', 'PLAY! rises within 16 m');
  assert.equal(C.calloutDistance(120, true), '120 m', 'a coin on your shelf just says how far');
  const marker = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen/TaskMarker.tsx'), 'utf8');
  assert.match(marker, /\{calloutDistance\(distanceMeters, \(task\.times_completed \?\? 0\) > 0\)\}/);
  const pill = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/LiveEventsPill.tsx'), 'utf8');
  assert.doesNotMatch(pill, /padStart\(2, '0'\)\}`;\n\}/, 'no m:ss clock');
  assert.match(pill, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 60_000\)/, 'no per-second tick');
  assert.match(pill, /extra Parts \{untilLabel\(rush\.ends_at, now\)\}/);
});

test('the Adventure Ticket: a first ticket never says "detour", and there is one "Pick another ride" button', () => {
  const A = loadTs('src/screens/ExploreScreen/adventureTicketPresentation.ts');
  const ride = { task_id: 1, asset_id: 13, ride_id: 8, ride_name: 'Space Ride', coin_url: '', park_id: 1 };
  const first = { id: 7, park_id: 1, park_day: '2026-10-28', ride, ride_choices: [ride], phase: 'discover', discover: null, play: null };
  const p = A.adventurePrompt(first, true);
  assert.doesNotMatch(`${p.title} ${p.chip} ${p.action}`, /detour/i);
  assert.equal(p.action, 'Pick another ride');
  const later = A.adventurePrompt({ ...first, phase: 'play', discover: { ...ride, kind: 'coin_win' } }, true);
  assert.equal(later.intent, 'detour', 'with a stamp kept, it is a detour');
  const card = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen/AdventureTicketCard.tsx'), 'utf8');
  assert.match(card, /prompt\.intent !== 'detour' && <GameButton variant="ghost" label="Pick another ride"/, 'never two "pick another" buttons');
  assert.match(card, /\{sheetOnly \? null : complete \?/, 'on the map the guide card is its frame; only the sheet remains');
});

test('guide flags: only true booleans count, per player', async () => {
  const GF = loadTs('src/services/guide/guideFlags.ts', { react: { useEffect() {}, useState: v => [v, () => {}] },
    '../../api/endpoints/platform/feature-flags': { default: async () => ({ flags: {} }) } });
  assert.deepEqual(plain(GF.cleanFlags({ queue_tickets: 'yes', daily_three: true, x: 1 })), { queue_tickets: false, daily_three: true, x: false });
  GF.resetGuideFlags();
  const a = await GF.loadGuideFlags(4, async () => ({ flags: { reveal_all: true } }));
  assert.equal(a.reveal_all, true);
  const b = await GF.loadGuideFlags(46, async () => ({ flags: {} }));
  assert.notEqual(b.reveal_all, true, 'another player never reads the cached switches');
  const offline = await GF.loadGuideFlags(46, async () => { throw new Error('offline'); }, Date.now() + 10 * 60 * 1000);
  assert.notEqual(offline.reveal_all, true);
  GF.resetGuideFlags();
});

test('"You\'re here" follows PLAY!: the server range check wins over the guide geometry', () => {
  const near = tgt({ inRange: true });
  assert.equal(GC.withPlayRange(near, null).inRange, false, 'PLAY! is not up: the card says walk closer, never "Tap PLAY!"');
  assert.equal(GC.withPlayRange(tgt({ inRange: false }), 3).inRange, true, 'PLAY! is up for this coin');
  assert.equal(GC.withPlayRange(near, undefined), near, 'before the first check the geometry stands');
  assert.equal(GC.withPlayRange(near, 3), near, 'unchanged object when it already agrees');
  assert.equal(GC.withPlayRange(null, 3), null);
});

test('a fresh pick holds against a line dwell: the target never changes without a win, a closure or a pick', () => {
  const picked = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, pickedTaskId: 2, pickedSource: 'callout' }));
  assert.equal(picked.taskId, 2);
  const held = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, current: picked, currentPickedAt: NOW - 60_000, inLineTaskId: 1 }));
  assert.equal(held.taskId, 2, 'standing near another line does not flip a coin the player just picked');
  const later = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, current: picked, currentPickedAt: NOW - G.PICK_HOLD_MS, inLineTaskId: 1 }));
  assert.equal(later.reason, 'in_line', 'after a while, standing in a line wins');
  const guidePicked = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, current: { ...picked, source: 'guide' }, inLineTaskId: 1 }));
  assert.equal(guidePicked.reason, 'in_line', 'a target the guide picked turns to the line at once');
  // Through the store: the pick time is kept with the held coin.
  G.guide.reset();
  G.guide.setTarget(2, 'callout');
  const base = { mode: 'park', parkId: 8, location: BASE, coins: RIDES, live: { 1: 'open', 2: 'open' } };
  assert.equal(G.guide.resolve(base).taskId, 2);
  assert.equal(G.guide.resolve({ ...base, inLineTaskId: 1 }).taskId, 2, 'held against the dwell');
  G.guide.reset();
});

test('the resting card tells the truth: closed only when no ride is open; far from every coin says head back in', () => {
  const far = C.guideCardCopy('resting', null, ctx({ ridesResting: false, outOfReach: true }));
  assert.equal(far.title, 'Head back into the park', 'one ride down at 2 PM is not a closed park');
  const closed = C.guideCardCopy('resting', null, ctx({ ridesResting: true, outOfReach: true }));
  assert.equal(closed.title, 'The park is closed');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/guide/useNextCoinGuide.ts'), 'utf8');
  assert.match(src, /const ridesResting = known\.some\(answer => answer === 'closed'\) && !known\.some\(answer => answer === 'open'\);/);
});

test('home: two doors to the shelf (Shelf button and PLAN), Practice games from the 2nd home visit, Wait Times, no second streak', () => {
  const fs = require('node:fs'), path = require('node:path');
  const read = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
  const menu = read('src/components/QuickAccessMenu.tsx');
  const fn = menu.slice(menu.indexOf('export function homeMenuItems'), menu.indexOf('\n}\n', menu.indexOf('export function homeMenuItems')) + 2);
  assert.match(fn, /if \(input\.practice\) out\.push\(\{ id: 'practice', label: 'Practice games'/);
  assert.match(fn, /label: 'Wait Times', icon: 'timer', round: 'blue', screen: 'QueueTimes', params: \{ park: input\.waitTimesPark \}, image: POCKET_WATCH/);
  assert.match(menu, /practice: counters\.homeDays >= 2/, 'from the 2nd home visit');
  assert.doesNotMatch(menu, /My shelf/, 'no third door to the shelf');
  assert.match(menu, /afterDismiss\.current = \(\) => setArcadeOpen\(true\);/, 'the practice sheet opens after the menu sheet is gone');
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /<HomeShelfButton \/>/);
  assert.doesNotMatch(home, /<RadialStatsMenu/, 'the avatar opens the shelf, the stats menu folded away');
  assert.match(home, /testID="home-guide-card"/);
  assert.match(home, /ticketHidden=\{guideShown\}/, 'the pips fold into the card\'s ticket meter');
  const shelf = loadTs('src/components/guide/HomeShelfButton.tsx', { react: {}, 'react/jsx-runtime': { jsx() {}, jsxs() {} },
    'react-native': { StyleSheet: { create: v => v } }, '../Avatar': {}, '../Button': {}, '../../context/AuthProvider': {}, '../../RootNavigation': {}, '../../ui': { BRAND: {} }, './flyAnchors': {} });
  assert.equal(shelf.homeShelfPark(2), 2);
  assert.equal(shelf.homeShelfPark(null), 8);
  for (const file of ['src/screens/ExploreScreen/HomeTicketProgress.tsx', 'src/components/PrepItemRedeemModal.tsx']) {
    assert.doesNotMatch(read(file), /HUNT STREAK|hunt streak|PARK TICKET/, `${file}: the flame is the one streak`);
  }
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /homeGuide=\{homeGuide\}/);
  assert.match(explore, /const homeGuide = useMemo<HomeGuide \| null>\(\(\) => player && !park \?/, 'home only: never a park goal or the Adventure');
});

test('welcome back after 14 days: whole days away, per player', () => {
  const W = loadTs('src/components/guide/useWelcomeBack.ts', { react: {}, '@react-native-async-storage/async-storage': { default: {} } });
  assert.equal(W.daysBetween(null, NOW), null);
  assert.equal(W.daysBetween(NOW - 14 * 86_400_000, NOW), 14);
  assert.equal(W.daysBetween(NOW - 13.9 * 86_400_000, NOW), 13);
  assert.equal(W.daysBetween(NOW + 1000, NOW), null, 'a clock that went back is not a welcome back');
  assert.equal(G.guideState(input({ daysAway: 14, coins: RIDES }), G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open' } }))), 'welcome_back');
  assert.equal(G.guideState(input({ daysAway: 14, welcomeBackDone: true, coins: RIDES }), G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open' } }))), 'walk');
});

test('dev-only live stub (state D walks): never outside a development bundle; off means no answers, open means all open', () => {
  const L = loadTs('src/components/guide/liveStub.ts');
  assert.equal(L.liveStubMode(false, 'off'), null, 'a store or OTA bundle always uses the real feed');
  assert.equal(L.liveStubMode(true, undefined), null);
  assert.equal(L.liveStubMode(true, 'off'), 'off');
  const feed = { rides: [{ task_id: 1, status: 'CLOSED', wait: null, typical: null, rush: null }], fetched_at: '2026-10-28T08:00:00Z' };
  assert.equal(L.applyLiveStub(feed, null, NOW), feed);
  const off = L.applyLiveStub(feed, 'off', NOW);
  assert.equal(off.rides.length, 0);
  assert.equal(G.liveAnswers({}, off, NOW).answers[1], undefined, 'no live answer: the ride stays eligible after known-open rides');
  const open = L.applyLiveStub(feed, 'open', NOW);
  assert.equal(G.liveAnswers({}, open, NOW).answers[1], 'open');
  const explore = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /const LIVE_STUB = liveStubMode\(__DEV__, process\.env\.EXPO_PUBLIC_GUIDE_LIVE_STUB\);/);
});
