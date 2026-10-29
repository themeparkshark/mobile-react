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
  // Story played: phase moves to celebrate, and the ride stays the target for its souvenir (step 3).
  const played = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure: { ...adventure, phase: 'celebrate' }, current: held }));
  assert.equal(played.taskId, 2, 'step 3: the souvenir keeps the ride');
  assert.equal(played.reason, 'line_story');
  // Souvenir unfolded: the Adventure is complete and the guide moves on.
  const complete = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure: { ...adventure, phase: 'complete' }, current: played }));
  assert.equal(complete.taskId, 1);
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
  // Free try and extra try point at the map's PLAY! (no second, dead button on the card).
  const freeTry = C.guideCardCopy('free_try', tgt({ inRange: true }), ctx());
  assert.equal(freeTry.button, null, 'no card button that could do nothing');
  assert.equal(freeTry.pointsAtPlay, true);
  assert.equal(freeTry.badge, 'gift');
  const extraTry = C.guideCardCopy('extra_try', tgt({ inRange: true }), ctx());
  assert.equal(extraTry.title, 'Extra try! Tap PLAY!');
  assert.equal(extraTry.button, null);
  assert.equal(extraTry.badge, 'ticket');
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
  step = PD.parkDayStep(r, { mode: 'unknown', parkId: null, location: { latitude: 33.8350, longitude: -117.9190 }, today: '2026-10-28', accuracy: 20 });
  assert.deepEqual(plain(step.events), [{ kind: 'park_day_done', parkId: 8, coins: 1, day: '2026-10-28' }], '2 km out with a coin (a 20 m fix is trusted)');
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
  assert.equal(A.SHEET_TREATS_PER_TICKET, F.TREATS_PER_TICKET, 'the sheet and the guide say the same treats per Ticket');
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

test('LinePlay has its own icon on the guide card; the pocket watch means Wait Times only (ledger 37)', () => {
  const fs = require('node:fs');
  const card = fs.readFileSync(require('node:path').join(__dirname, '../../src/components/guide/NextCoinCard.tsx'), 'utf8');
  const icon = fs.readFileSync(require('node:path').join(__dirname, '../../src/components/guide/linePlayIcon.ts'), 'utf8');
  assert.match(icon, /LINEPLAY_ICON = require\('\.\.\/\.\.\/\.\.\/assets\/images\/howto\/queue\.webp'\)/);
  assert.match(card, /import \{ LINEPLAY_ICON \} from '\.\/linePlayIcon'/);
  const sheet = fs.readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen/AdventureTicketCard.tsx'), 'utf8');
  assert.match(sheet, /image=\{prompt\.intent === 'play' \? LINEPLAY_ICON : undefined\}/, 'the Adventure sheet\'s line story button wears LinePlay\'s icon');
  assert.doesNotMatch(sheet, /'queue'/, 'no pocket watch on the Adventure sheet');
  assert.match(card, /button\.action === 'lineplay' && <Image source=\{LINEPLAY_ICON\}/);
  assert.doesNotMatch(card, /GameIcon name="queue"/, 'no pocket watch on the guide card');
  assert.doesNotMatch(card, /queuetimes\.png/);
});

test('a coin already on the shelf is never the target, though today\'s map lists it again (the map carries no ownership)', () => {
  const tasks = [
    { id: 78, name: 'Walt Statue', latitude: north(5).latitude, longitude: BASE.longitude },
    { id: 199, name: 'Astro Orbitor', latitude: north(75).latitude, longitude: BASE.longitude },
  ];
  const trip = [
    { task_id: 78, park_id: 8, coin_owned: true }, { task_id: 199, park_id: 8, coin_owned: false },
    { task_id: 500, park_id: 1, coin_owned: true },
  ];
  const owned = GC.ownedTaskIdsFor(trip, 8);
  assert.deepEqual([...owned], [78], 'only this park\'s owned coins');
  assert.equal(GC.ownedTaskIdsFor(trip, null).size, 0);
  const without = GC.guideCoinsFor(tasks, 8, {});
  assert.equal(G.pickNextCoin(input({ coins: without })).taskId, 78, 'before: the owned statue 5 m away looked unowned');
  const coins = GC.guideCoinsFor(tasks, 8, { ownedTaskIds: owned });
  assert.equal(coins.find(c => c.taskId === 78).owned, true);
  assert.equal(G.pickNextCoin(input({ coins })).taskId, 199, 'the next coin to win, not the one on the shelf');
  // A target picked before the shelf arrived moves on once the shelf says it is owned.
  const early = G.pickNextCoin(input({ coins: without }));
  assert.equal(G.pickNextCoin(input({ coins, current: early })).taskId, 199);
  const explore = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /const ownedTaskIds = useMemo\(\(\) => ownedTaskIdsFor\(tripGoalData\?\.rides, park\?\.id \?\? null\)/);
  assert.match(explore, /starTaskIds: starRides, rushTaskIds, ownedTaskIds,/);
});

test('after winning today\'s Adventure coin the guide stays on that ride for its line story, though the won coin left today\'s map', () => {
  const soarin = { id: 137, name: "Soarin'", latitude: north(5).latitude, longitude: BASE.longitude };
  const grizzly = { id: 140, name: 'Grizzly River Run', latitude: north(120).latitude, longitude: BASE.longitude };
  const ticket = phase => ({ park_id: 8, phase, ride: { task_id: 137, ride_name: "Soarin'", lat: soarin.latitude, lng: soarin.longitude } });
  // Before the win the map lists it; nothing is added.
  const before = GC.withAdventureCoin(GC.guideCoinsFor([soarin, grizzly], 8, {}), ticket('discover'), 8);
  assert.equal(before.length, 2);
  // After the win the map drops Soarin'; the ticket brings it back as an owned ride.
  const after = GC.withAdventureCoin(GC.guideCoinsFor([grizzly], 8, {}), ticket('play'), 8);
  assert.equal(after.length, 2);
  const back = after.find(c => c.taskId === 137);
  assert.equal(back.owned, true); assert.equal(back.kind, 'ride');
  assert.equal(GC.withAdventureCoin(GC.guideCoinsFor([grizzly], 8, {}), ticket('play'), 9).length, 1, 'another park: never');
  assert.equal(GC.withAdventureCoin([], { ...ticket('play'), ride: { task_id: 137, ride_name: 'x' } }, 8).length, 0, 'no position: nothing');
  G.guide.reset();
  const adventure = { taskId: 137, parkId: 8, phase: 'play' };
  const t = G.guide.resolve({ mode: 'park', parkId: 8, location: BASE, coins: after, live: { 140: 'open' }, adventure });
  assert.equal(t.taskId, 137);
  assert.equal(t.reason, 'line_story');
  // "Pick another coin" moves on.
  G.guide.skipLineStory();
  assert.equal(G.guide.resolve({ mode: 'park', parkId: 8, location: BASE, coins: after, live: { 140: 'open' }, adventure }).taskId, 140);
  G.guide.reset();
  const explore = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /taskId === tripGoal\?\.task_id \|\| taskId === adventure\?\.ride\.task_id/);
});

test('line story words: a name ending in an apostrophe reads "Soarin\'s", and the arrival card never calls a won coin "First coin"', () => {
  assert.equal(C.possessive("Soarin'"), "Soarin's");
  assert.equal(C.possessive('Soarin\u2019'), 'Soarin\u2019s');
  assert.equal(C.possessive('Jungle Cruise'), "Jungle Cruise's");
  const story = tgt({ taskId: 137, name: "Soarin'", reason: 'line_story' });
  assert.equal(C.guideCardCopy('line_story', story, ctx()).title, "Play Soarin's line story");
  const arrive = C.guideCardCopy('arrive', story, ctx());
  assert.equal(arrive.title, "Next: Soarin's line story");
  assert.doesNotMatch(arrive.title, /First coin/);
  assert.equal(C.guideCardCopy('arrive', tgt(), ctx()).title, 'First coin: Jungle Cruise');
});

test('LINEPLAY on the Line story card opens today\'s Adventure ride even when its won coin left the map list (round 1 blocker)', () => {
  // targetTask is null once the won coin is filtered out of today's list: the route keys on the target id.
  assert.equal(GC.linePlayRoute({ targetTaskId: 137, adventureTaskId: 137, inLineTaskId: null, dwelling: false }), 'adventure');
  assert.equal(GC.linePlayRoute({ targetTaskId: 137, adventureTaskId: 137, inLineTaskId: 12, dwelling: true }), 'adventure',
    'the Adventure ride wins over another dwell');
  assert.equal(GC.linePlayRoute({ targetTaskId: 12, adventureTaskId: 137, inLineTaskId: 12, dwelling: true }), 'dwell');
  assert.equal(GC.linePlayRoute({ targetTaskId: null, adventureTaskId: 137, inLineTaskId: null, dwelling: true }), 'dwell');
  assert.equal(GC.linePlayRoute({ targetTaskId: 12, adventureTaskId: null, inLineTaskId: null, dwelling: false }), 'target');
  assert.equal(GC.linePlayRoute({ targetTaskId: null, adventureTaskId: null, inLineTaskId: null, dwelling: false }), 'none');
  const explore = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /case 'lineplay': void openLinePlayFor\(nextCoin\.target\?\.taskId \?\? null/, 'the card passes the target id, not the map task');
  assert.doesNotMatch(explore, /case 'play':/, 'no dead play action left');
});

test('the Line story target keeps a point, a path and an island after its coin leaves the map (one owner of the pointer)', () => {
  const won = GC.withAdventureCoin([], { park_id: 8, phase: 'play', ride: { task_id: 137, ride_name: "Soarin'", lat: 33.8087, lng: -117.9171 } }, 8);
  assert.equal(won.length, 1);
  assert.deepEqual(plain([won[0].latitude, won[0].longitude, won[0].owned]), [33.8087, -117.9171, true]);
  const fs = require('node:fs');
  const hook = fs.readFileSync(require('node:path').join(__dirname, '../../src/components/guide/useNextCoinGuide.ts'), 'utf8');
  assert.match(hook, /targetCoin \? \{ latitude: targetCoin\.latitude, longitude: targetCoin\.longitude \}/);
  const explore = fs.readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /const guidePoint = nextCoin\.targetPoint \?\?/);
  assert.match(explore, /<TaskMarker task=\{lineStoryIsland \?\? PARKED_TASK\} parked=\{!lineStoryIsland\}/, 'one always-mounted island for it');
});

test('Line story far from its line: GO walks there first; near: LINEPLAY (the Adventure sheet\'s play gate)', () => {
  const story = tgt({ reason: 'line_story', meters: 240 });
  const far = C.guideCardCopy('line_story', story, ctx({ lineStoryNear: false }));
  assert.equal(far.button.action, 'go');
  assert.equal(far.line, 'Walk to its line · 240 m');
  assert.equal(far.secondary.action, 'skip');
  assert.equal(C.guideCardCopy('line_story', story, ctx({ lineStoryNear: true })).button.action, 'lineplay');
  assert.equal(C.guideCardCopy('line_story', story, ctx()).button.action, 'lineplay', 'default: near');
});

test('the arrival kicker uses the park\'s everyday name so it fits one line on a 375 pt phone', () => {
  assert.equal(C.shortParkName('Disney California Adventure Park'), 'California Adventure');
  assert.equal(C.shortParkName('Disneyland Park'), 'Disneyland');
  assert.equal(C.shortParkName("Universal's Islands of Adventure"), 'Islands of Adventure');
  assert.equal(C.shortParkName('Epic Universe'), 'Epic Universe');
  assert.equal(C.shortParkName(null), 'the park');
  const arrive = C.guideCardCopy('arrive', tgt(), ctx({ parkName: 'Disney California Adventure Park' }));
  assert.equal(arrive.kicker, 'WELCOME TO CALIFORNIA ADVENTURE!');
  assert.ok(arrive.kicker.length <= 34, 'short enough for the card kicker');
});

test('a show the feed calls open but never posts a wait for is not a line (Great Moments with Mr. Lincoln)', () => {
  const rides = new Map([[63, { id: 622, task_id: 63, type: 'attraction' }], [12, { id: 700, task_id: 12, type: 'dark_ride' }]]);
  const coins = [
    { taskId: 63, parkId: 8, name: 'Lincoln', kind: 'ride', queue: true, owned: false, latitude: 0, longitude: 0 },
    { taskId: 12, parkId: 8, name: 'Mansion', kind: 'ride', queue: true, owned: false, latitude: 0, longitude: 0 },
  ];
  const live = { rides: [{ task_id: 63, status: 'OPERATING', wait: null }, { task_id: 12, status: 'OPERATING', wait: 25 }] };
  const showLike = GC.showLikeTaskIds(live, new Set([12]));
  assert.deepEqual([...showLike], [63]);
  assert.equal(GC.inLineTaskFor(622, rides, coins, showLike), null, 'sitting in a show is not in line');
  assert.equal(GC.inLineTaskFor(700, rides, coins, showLike), 12);
  assert.equal(GC.showLikeTaskIds(live, new Set([12, 63])).size, 0, 'a ride that posted a wait earlier stays a line');
  assert.equal(GC.showLikeTaskIds({ rides: [] }, new Set()).size, 0, 'feed off: nothing is show-like (state D)');
  assert.equal(GC.inLineTaskFor(622, rides, coins, GC.showLikeTaskIds(null, new Set())), 63);
});

test('a second shark on a family phone never inherits the first one\'s target or declined Line story', () => {
  G.guide.reset();
  G.guide.forPlayer(46);
  G.guide.setTarget(3, 'shelf');
  G.guide.forPlayer(46);
  const base = { mode: 'park', parkId: 8, location: BASE, coins: RIDES, live: { 1: 'open', 2: 'open', 3: 'open' }, now: NOW };
  assert.equal(G.guide.resolve(base).taskId, 3, 'same player: the pick holds');
  G.guide.forPlayer(65);
  assert.equal(G.guide.current(), null, 'another player starts clean');
  assert.notEqual(G.guide.resolve(base).source, 'shelf');
  G.guide.reset();
});

test('level up ready comes from the trip goal\'s paid-for next level, and feeds the guide and the ladder', () => {
  const plan = { next_level: 2, maxed: false, energy_needed: 0, parts_needed: 0 };
  assert.equal(GC.goalLevelUpTaskId({ goal: { task_id: 63, coin_owned: true }, goal_plan: plan }), 63);
  assert.equal(GC.goalLevelUpTaskId({ goal: { task_id: 63, coin_owned: true }, goal_plan: { ...plan, energy_needed: 4 } }), null, 'Energy short');
  assert.equal(GC.goalLevelUpTaskId({ goal: { task_id: 63, coin_owned: true }, goal_plan: { ...plan, parts_needed: 1 } }), null, 'parts short');
  assert.equal(GC.goalLevelUpTaskId({ goal: { task_id: 63, coin_owned: true }, goal_plan: { ...plan, parts_needed: null } }), 63, 'no parts cost');
  assert.equal(GC.goalLevelUpTaskId({ goal: { task_id: 63, coin_owned: false }, goal_plan: plan }), null, 'not on the shelf');
  assert.equal(GC.goalLevelUpTaskId({ goal: { task_id: 63, coin_owned: true }, goal_plan: { ...plan, maxed: true } }), null);
  assert.equal(GC.goalLevelUpTaskId(null), null);
  const tasks = [{ id: 63, name: 'Lincoln', latitude: BASE.latitude, longitude: BASE.longitude, times_completed: 1 }];
  assert.equal(GC.guideCoinsFor(tasks, 8, { levelUpTaskIds: new Set([63]) })[0].levelUpReady, true);
  const explore = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /levelUpReady: levelUpTaskId != null,/, 'the ladder hears it too');
});

test('Adventure step 3: the souvenir state is its own card (UNFOLD), and declining one step never declines the next', () => {
  const C = loadTs('src/services/guide/guideCopy.ts');
  const won = RIDES.map(c => (c.taskId === 2 ? { ...c, owned: true } : c));
  G.guide.reset();
  const live = { 1: 'open', 3: 'open' };
  const play = { taskId: 2, parkId: 8, phase: 'play' };
  const first = G.guide.resolve(input({ coins: won, live, adventure: play }));
  assert.equal(first.reason, 'line_story');
  // Pick another coin on the Line story card: the guide moves on.
  G.guide.skipLineStory();
  const next = G.guide.resolve(input({ coins: won, live, adventure: play }));
  assert.notEqual(next.taskId, 2, 'declined: the guide points at another coin');
  // The line story is played from the Adventure sheet (opened by its ticket tab): phase celebrate.
  // The held coin still holds (no flip-flop), and once it is won the souvenir leads again.
  const celebrate = { ...play, phase: 'celebrate' };
  const stillHeld = G.guide.resolve(input({ coins: won, live, adventure: celebrate }));
  assert.equal(stillHeld.taskId, next.taskId, 'the held coin holds');
  const wonNext = won.map(c => (c.taskId === next.taskId ? { ...c, owned: true } : c));
  const souvenir = G.guide.resolve(input({ coins: wonNext, live, adventure: celebrate }));
  assert.equal(souvenir.taskId, 2, 'declining the line story never declines the souvenir');
  assert.equal(souvenir.reason, 'line_story');
  assert.equal(G.guideState(input({ adventure: celebrate }), souvenir), 'line_story');
  const copy = C.guideCardCopy('line_story', souvenir, { parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 0,
    freeStep: null, queueTicketsOn: false, adventureDots: [true, true, false], adventureStep: 'celebrate' });
  assert.equal(copy.title, 'Unfold your Haunted Mansion souvenir');
  assert.equal(copy.button.action, 'unfold');
  assert.equal(copy.button.label, 'UNFOLD');
  assert.equal(copy.secondary.action, 'skip');
  assert.deepEqual(plain(copy.dots), [true, true, false]);
  // Declining the souvenir step too: the guide moves on (the ticket tab keeps the sheet one tap away).
  G.guide.skipLineStory();
  const after = G.guide.resolve(input({ coins: wonNext, live, adventure: celebrate }));
  assert.notEqual(after?.taskId, 2);
  // A tapped island (another coin's pick) while the souvenir waits declines that step only.
  G.guide.reset();
  G.guide.resolve(input({ coins: wonNext, live, adventure: celebrate }));
  G.guide.setTarget(1, 'callout');
  const picked = G.guide.resolve(input({ coins: wonNext, live, adventure: celebrate }));
  assert.equal(picked.taskId, 1);
  G.guide.reset();
});

test('Adventure ticket tab: the card wears it whenever the Adventure is active here but the guide points elsewhere', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/guide/useNextCoinGuide.ts'), 'utf8');
  assert.match(src, /const adventureTab = !!input\.adventure && input\.adventure\.park_id === parkId && input\.adventure\.phase !== 'complete'\s*&& !adventureDots/);
  const card = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/guide/NextCoinCard.tsx'), 'utf8');
  assert.match(card, /testID="adventure-tab"/);
  // Round 3 fix 9: a gold button (never a white label like the park chip beside it), 8 pt or bigger dots, 46 pt to tap.
  assert.match(card, /tab: \{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND\.gold,/);
  assert.match(card, /parkChip: \{ backgroundColor: BRAND\.white/);
  const dot = Number(card.match(/export const TAB_DOT = (\d+);/)[1]);
  assert.ok(dot >= 8, `stamp dots ${dot} pt`);
  const height = Number(card.match(/paddingHorizontal: 6, height: (\d+), marginTop: -8/)[1]);
  const slop = card.match(/hitSlop=\{\{ top: (\d+), bottom: (\d+), left: 6, right: 6 \}\}/);
  assert.ok(height + Number(slop[1]) + Number(slop[2]) >= 46, 'a 46 pt tap target');
  const screen = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(screen, /adventureTab=\{nextCoin\.adventureTab && adventure && tripGoalData \? adventureTabProps : null\}/);
  assert.match(screen, /case 'unfold': setAdventureCelebrateRequest/);
  // The closed Adventure ride in its discover phase: the guide never targets it, so the tab is the door to the detour picker.
  const closed = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'closed' }, adventure: { taskId: 2, parkId: 8, phase: 'discover' } }));
  assert.notEqual(closed.taskId, 2);
});

test('Adventure sheet Ticket line: no LinePlay or wait Ticket promise while queue_tickets is off (state A)', () => {
  const A = loadTs('src/screens/ExploreScreen/adventureTicketPresentation.ts');
  assert.equal(A.SHEET_TREATS_PER_TICKET, F.TREATS_PER_TICKET, 'the sheet and the guide say the same treats per Ticket');
  const off = A.adventureTicketsLine(2, false, false);
  assert.equal(off, '2 more Tickets needed. 3 treats at home = 1 Ticket. Tomorrow brings a new free try.');
  assert.doesNotMatch(off, /LinePlay|wait|line/i);
  const on = A.adventureTicketsLine(1, false, true);
  assert.match(on, /first wait at a ride earns one/);
  assert.equal(A.adventureTicketsLine(2, true, false), 'Today\'s free try is ready for this coin.');
  assert.equal(A.adventureTicketsLine(0, false, false), null);
  const sheet = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen/AdventureTicketCard.tsx'), 'utf8');
  assert.doesNotMatch(sheet, /LinePlay and treats at home can earn more/);
});

test('Adventure sheet and guide card give one answer when earned Tickets wait: claim first (round 3 fix 4)', () => {
  const A = loadTs('src/screens/ExploreScreen/adventureTicketPresentation.ts');
  const C = loadTs('src/services/guide/guideCopy.ts');
  // StateA: 28 earned stamp Tickets wait, 1 Ticket needed, free try off (production switches).
  const sheet = A.adventureTicketsLine(1, false, false, 28);
  assert.equal(sheet, '28 free Tickets are waiting. Claim, then play.');
  const wallet = { tickets: 0, claimable: [{ kind: 'stamp', id: 1, tickets: 28 }], freeTryReady: true, extraTries: 0, queueTicketsOn: false };
  const step = F.nextFreeTicket(wallet);
  assert.equal(step.kind, 'claim', 'the card claims before the free try');
  const card = C.guideCardCopy('claim', { taskId: 5, name: 'Soarin\'', parkId: 8, reason: 'adventure', source: 'guide' },
    { freeStep: step, tickets: 0, queueTicketsOn: false });
  assert.equal(card.title, '28 free Tickets are waiting');
  assert.ok(sheet.startsWith(card.title), 'the sheet leads with the same words as the card');
  // Claim beats the free try on the sheet too, and one Ticket reads as one.
  assert.equal(A.adventureTicketsLine(2, true, false, 1), '1 free Ticket is waiting. Claim, then play.');
  assert.equal(A.adventureTicketsLine(2, true, false, 0), 'Today\'s free try is ready for this coin.');
  assert.equal(A.adventureTicketsLine(2, false, false, Number.NaN), '2 more Tickets needed. 3 treats at home = 1 Ticket. Tomorrow brings a new free try.');
  // The sheet's CLAIM is the map's own claim (one claim path for both surfaces).
  const fs = require('node:fs'); const path = require('node:path');
  const screen = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(screen, /claimableTickets=\{claimableTicketCount\} onClaim=\{claimTickets\}/);
});

test('SE: the edge arrow never sits on top of a target island just past the inset edge (round 2 fix 6)', () => {
  const g = loadTs('src/components/map/guide.ts');
  const se = { width: 375, height: 667 };
  // A target 25 m north on SE: on screen at y 220, just above the inset top (250). No arrow on the island.
  assert.equal(g.edgeArrow({ x: 190, y: 220 }, se), null);
  // Under the guide card (y 120) the island is hidden: the arrow still shows, clear of it.
  const hidden = g.edgeArrow({ x: 190, y: 120 }, se);
  assert.ok(hidden && Math.hypot(hidden.x - 190, hidden.y - 120) >= g.ARROW_CLEAR_OF_ISLAND);
  // Off screen: always an arrow.
  assert.ok(g.edgeArrow({ x: 190, y: -400 }, se));
});

test('park day done: a park-mode reading 10 km away (the place check kept the park) ends the day; it never moves lastInPark (round 2 fix 11)', () => {
  const P = loadTs('src/services/guide/parkDay.ts');
  const gate = { latitude: 33.8121, longitude: -117.9190 };
  const away = { latitude: 33.9020, longitude: -117.9190 };   // about 10 km north
  let rec = P.EMPTY_PARK_DAY;
  let step = P.parkDayStep(rec, { mode: 'park', parkId: 8, location: gate, today: '2026-10-29' });
  assert.deepEqual(plain(step.events.map(e => e.kind)), ['park_day_started']);
  step = P.parkDayStep(step.next, { mode: 'park', parkId: 8, location: gate, today: '2026-10-29', coinsWon: 1 });
  const before = step.next.lastInPark;
  step = P.parkDayStep(step.next, { mode: 'park', parkId: 8, location: away, today: '2026-10-29', accuracy: 10 });
  assert.deepEqual(plain(step.events.map(e => e.kind)), ['park_day_done']);
  assert.equal(step.events[0].coins, 1);
  assert.deepEqual(plain(step.next.lastInPark), plain(before), 'the far reading is not an in-park reading');
  // Once only.
  const again = P.parkDayStep(step.next, { mode: 'park', parkId: 8, location: away, today: '2026-10-29' });
  assert.equal(again.events.length, 0);
  // A far reading with no coin today ends nothing.
  let none = P.parkDayStep(P.EMPTY_PARK_DAY, { mode: 'park', parkId: 8, location: gate, today: '2026-10-29' });
  none = P.parkDayStep(none.next, { mode: 'park', parkId: 8, location: away, today: '2026-10-29', accuracy: 5 });
  assert.equal(none.events.length, 0);
});

test('park day done needs a trusted far reading: good accuracy, or two far readings in a row (round 3 fix 7)', () => {
  const P = loadTs('src/services/guide/parkDay.ts');
  const gate = { latitude: 33.8121, longitude: -117.9190 };
  const away = { latitude: 33.9020, longitude: -117.9190 };   // about 10 km north
  const day = '2026-10-29';
  const atPark = () => {
    let s = P.parkDayStep(P.EMPTY_PARK_DAY, { mode: 'park', parkId: 8, location: gate, today: day, accuracy: 8 });
    return P.parkDayStep(s.next, { mode: 'park', parkId: 8, location: gate, today: day, coinsWon: 1, accuracy: 8 }).next;
  };
  // One GPS jump with poor accuracy, then back at the gate: the day goes on (rung 4 stays shut mid-visit).
  let s = P.parkDayStep(atPark(), { mode: 'park', parkId: 8, location: away, today: day, accuracy: 1500 });
  assert.equal(s.events.length, 0, 'a 1500 m reading 10 km away is not trusted on its own');
  assert.equal(s.next.farStreak, 1);
  s = P.parkDayStep(s.next, { mode: 'park', parkId: 8, location: gate, today: day, accuracy: 8 });
  assert.equal(s.next.farStreak, 0, 'back in the park: the streak resets');
  s = P.parkDayStep(s.next, { mode: 'park', parkId: 8, location: away, today: day, accuracy: 1500 });
  assert.equal(s.events.length, 0, 'a lone jump again: still not done');
  // A second far reading in a row is trusted, whatever its accuracy.
  s = P.parkDayStep(s.next, { mode: 'park', parkId: 8, location: { ...away, latitude: away.latitude + 0.001 }, today: day, accuracy: null });
  assert.deepEqual(plain(s.events.map(e => e.kind)), ['park_day_done']);
  // Unknown accuracy behaves like poor accuracy.
  s = P.parkDayStep(atPark(), { mode: 'park', parkId: 8, location: away, today: day });
  assert.equal(s.events.length, 0);
  // Exactly 100 m is trusted, 101 m is not.
  assert.equal(P.farReadingTrusted(100, 0), true);
  assert.equal(P.farReadingTrusted(101, 0), false);
  assert.equal(P.farReadingTrusted(Number.NaN, 0), false);
  assert.equal(P.farReadingTrusted(null, 1), true);
  // Outside any park (unknown mode): the same trust rule.
  s = P.parkDayStep(atPark(), { mode: 'unknown', parkId: null, location: away, today: day, accuracy: 900 });
  assert.equal(s.events.length, 0);
  s = P.parkDayStep(s.next, { mode: 'unknown', parkId: null, location: away, today: day, accuracy: 900 });
  assert.deepEqual(plain(s.events.map(e => e.kind)), ['park_day_done']);
  // The map passes the reading's accuracy.
  const screen = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8')
    + (() => { const f = require('node:path').join(__dirname, '../../src/components/guide/useMapGuide.ts'); return require('node:fs').existsSync(f) ? require('node:fs').readFileSync(f, 'utf8') : ''; })();
  assert.match(screen, /accuracy: latestLocationSampleRef\?\.current\?\.accuracyMeters \?\? null/);
});

test('guide.version moves only for a pick, a skipped step, a cleared plan or a reset; resolve never bumps it (no self re-resolve)', () => {
  G.guide.reset();
  const v0 = G.guide.version();
  G.guide.resolve(input({ coins: RIDES, live: { 1: 'open' } }));
  G.guide.resolve(input({ coins: RIDES, live: { 1: 'open' }, location: north(10) }));
  assert.equal(G.guide.version(), v0, 'a resolve that moves the target notifies, but the input version holds');
  G.guide.setTarget(2, 'shelf');
  assert.equal(G.guide.version(), v0 + 1);
  G.guide.clearPlan();
  assert.equal(G.guide.version(), v0 + 2);
  G.guide.reset();
});

test('NEW tags behave: one rung per app open, a tap clears it, the Rewards button draws NEW only when isNew (round 3 fix 5)', () => {
  const L = loadTs('src/services/reveal/ladderRules.ts');
  // The flame (daily, rung 4) opened before the Trail ring (trail, rung 6).
  const opened = { daily: 1000, trail: 2000 };
  assert.equal(L.pickNewTag(opened, {}, null, 'open-1'), 'daily', 'the earliest unseen rung first');
  assert.equal(L.pickNewTag(opened, {}, { rung: 'daily', appOpenId: 'open-1' }, 'open-1'), 'daily', 'stable within the open');
  assert.equal(L.pickNewTag(opened, { daily: true }, { rung: 'daily', appOpenId: 'open-1' }, 'open-1'), null,
    'tapped (seen): no second NEW in the same open, though the Trail ring is still unseen');
  assert.equal(L.pickNewTag(opened, { daily: true }, { rung: 'daily', appOpenId: 'open-1' }, 'open-2'), 'trail', 'the next open');
  assert.equal(L.pickNewTag(opened, { daily: true, trail: true }, { rung: 'trail', appOpenId: 'open-2' }, 'open-3'), null);
  // Which rungs the Rewards button wears NEW for (and so marks seen on a tap): only parts that show.
  const R = loadTs('src/components/map/RewardsButton.tsx', rewardsStubs());
  assert.deepEqual(plain(R.rewardsNewRungs({ dailyOpen: true, dailyNew: true, trailOpen: true, trailNew: false })), ['daily']);
  assert.deepEqual(plain(R.rewardsNewRungs({ dailyOpen: false, dailyNew: true, trailOpen: true, trailNew: false })), [],
    'the flame does not show (switch off): no NEW on the button');
  assert.deepEqual(plain(R.rewardsNewRungs({ dailyOpen: true, dailyNew: false, trailOpen: true, trailNew: true })), ['trail']);
  // Rendering: NEW only when isNew, and the label says it first.
  const model = { count: 1, flame: 4, trail: null };
  const withTag = R.default({ model, onPress() {}, isNew: true });
  const without = R.default({ model, onPress() {}, isNew: false });
  assert.equal(findAll(withTag, el => el.type === R.__NewTagForTest).length, 1);
  assert.equal(findAll(without, el => el.type === R.__NewTagForTest).length, 0);
  assert.match(withTag.props.accessibilityLabel, /^New\. Rewards, 1 to claim, flame 4/);
  assert.doesNotMatch(without.props.accessibilityLabel, /New/);
  // The map marks exactly the NEW the button wore, then opens Rewards.
  const screen = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8')
    + (() => { const f = require('node:path').join(__dirname, '../../src/components/guide/useMapGuide.ts'); return require('node:fs').existsSync(f) ? require('node:fs').readFileSync(f, 'utf8') : ''; })();
  assert.match(screen, /rewardsNewRungs\(\{ dailyOpen, dailyNew: dailyRung\.isNew, trailOpen, trailNew: trailRung\.isNew \}\)/);
});

function rewardsStubs() {
  const el = (type, props, key) => ({ type, props: props ?? {}, key });
  return {
    'react/jsx-runtime': { jsx: el, jsxs: el, Fragment: 'Fragment' },
    'expo-image': { Image: 'Image' },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: x => x } },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle' },
    '../../gamekit/Haptics': { haptic() {} },
    '../../ui': { BRAND: {}, GameIcon: 'GameIcon', SHADOW: { card: {} } },
  };
}
function findAll(node, match, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(child => findAll(child, match, out)); return out; }
  if (match(node)) out.push(node);
  findAll(node.props?.children, match, out);
  return out;
}

test('round 2 small fixes: 46 pt card buttons, a bare your-team chip at 0 rides, and the in-line kicker never repeats the title', () => {
  const fs = require('node:fs'), path = require('node:path');
  const card = fs.readFileSync(path.join(__dirname, '../../src/components/guide/NextCoinCard.tsx'), 'utf8');
  assert.match(card, /BUTTON_SLOP = \{ top: 8, bottom: 8, left: 4, right: 4 \}/);
  assert.match(card, /minHeight: 30/);
  const bar = fs.readFileSync(path.join(__dirname, '../../src/components/RideControlBar.tsx'), 'utf8');
  assert.match(bar, /bare=\{compact && !!yours && !\(held\[team\] > 0\)\}/);
  const C = loadTs('src/services/guide/guideCopy.ts');
  const copy = C.guideCardCopy('in_line', { taskId: 1, name: 'Jungle Cruise', reason: 'in_line', meters: 10 },
    { parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 1, freeStep: null, queueTicketsOn: false, adventureDots: null });
  assert.equal(copy.kicker, 'YOUR WAIT');
  assert.equal(copy.title, 'In line for Jungle Cruise?');
});

test('winning today\'s Adventure coin turns the guide to its Line story at once, never the nearest ride first (walk r3: the won coin left the list before the re-read)', () => {
  const ticket = { phase: 'discover', ride: { task_id: 2 }, park_id: 8 };
  assert.equal(GC.adventureAfterWin(ticket, 2).phase, 'play');
  assert.equal(GC.adventureAfterWin(ticket, 3), ticket, 'another coin: unchanged');
  assert.equal(GC.adventureAfterWin({ ...ticket, phase: 'celebrate' }, 2).phase, 'celebrate', 'never moves a ticket back');
  // Held on the Adventure ride; its coin is won (owned now). With the ticket on its line story, rule 1 holds the ride.
  const adventureTarget = G.pickNextCoin(input({ coins: RIDES, live: { 1: 'open', 2: 'open' }, adventure: { taskId: 2, parkId: 8, phase: 'discover' } }));
  assert.equal(adventureTarget.reason, 'adventure');
  const won = RIDES.map(c => (c.taskId === 2 ? { ...c, owned: true } : c));
  const after = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, current: adventureTarget, adventure: { taskId: 2, parkId: 8, phase: 'play' } }));
  assert.equal(after.taskId, 2);
  assert.equal(after.reason, 'line_story');
  // Standing in its line: the card is the Line story (where its story plays), not "In line for X?".
  assert.equal(G.guideState(input({ inLineTaskId: 2, adventure: { taskId: 2, parkId: 8, phase: 'play' } }), after), 'line_story');
});

test('Pick another coin while standing in the Adventure ride\'s line: its line never pulls the guide straight back (walk r3)', () => {
  const won = RIDES.map(c => (c.taskId === 2 ? { ...c, owned: true, queue: true } : c));
  G.guide.reset();
  const adventure = { taskId: 2, parkId: 8, phase: 'play' };
  const first = G.guide.resolve(input({ coins: won, live: { 1: 'open', 2: 'open' }, adventure, inLineTaskId: 2, location: north(200) }));
  assert.equal(first.taskId, 2);
  assert.equal(first.reason, 'line_story');
  G.guide.skipLineStory();
  const next = G.guide.resolve(input({ coins: won, live: { 1: 'open', 2: 'open' }, adventure, inLineTaskId: 2, location: north(200) }));
  assert.notEqual(next.taskId, 2, 'the declined Adventure ride is not the in-line target');
  // Another ride's line still turns the guide (the decline is only about today's Adventure ride).
  const other = G.pickNextCoin(input({ coins: won.map(c => ({ ...c, queue: true })), live: { 1: 'open', 2: 'open' },
    adventure: { ...adventure, lineStoryDeclined: true }, inLineTaskId: 1 }));
  assert.equal(other.taskId, 1);
  assert.equal(other.reason, 'in_line');
  G.guide.reset();
});

test('a coin the guide chose before the trip goal answered gives way once the Adventure lands (a slow server, walk r3); a player pick never does', () => {
  G.guide.reset();
  const won = RIDES.map(c => (c.taskId === 2 ? { ...c, owned: true } : c));
  // Partial data: no Adventure yet. The guide takes the nearest open ride.
  const early = G.guide.resolve(input({ coins: won, live: { 1: 'open' } }));
  assert.equal(early.taskId, 1);
  // The trip goal lands with the Adventure on its souvenir step: the held guess would hold...
  const celebrate = { taskId: 2, parkId: 8, phase: 'celebrate' };
  assert.equal(G.guide.resolve(input({ coins: won, live: { 1: 'open' }, adventure: celebrate })).taskId, 1);
  // ...so the map releases the guess made on partial data, and rule 1 leads at once (the release
  // picks again with the latest input; nobody ever reads a null target in between).
  const seen = [];
  const off = G.guide.subscribe(() => seen.push(G.guide.current()));
  G.guide.releaseGuidePick();
  off();
  assert.equal(seen.length, 1, 'one notice: the guess straight to the Line story');
  assert.notEqual(seen[0], null);
  const full = G.guide.current();
  assert.equal(full.taskId, 2);
  assert.equal(full.reason, 'line_story');
  assert.equal(G.guide.resolve(input({ coins: won, live: { 1: 'open' }, adventure: celebrate })).taskId, 2, 'the next resolve agrees');
  // A player's pick is never released.
  G.guide.setTarget(3, 'shelf');
  G.guide.resolve(input({ coins: won, live: { 1: 'open', 3: 'open' }, adventure: celebrate }));
  G.guide.releaseGuidePick();
  assert.equal(G.guide.current().taskId, 3);
  const hook = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/guide/useNextCoinGuide.ts'), 'utf8');
  assert.match(hook, /const complete = input\.tripGoalLoaded !== false && catalog\?\.parkId === parkId;/);
  G.guide.reset();
});

test('releaseGuidePick never leaves the store on null while a coin exists (no resting frame on a slow first open)', () => {
  G.guide.reset();
  const coins = RIDES;
  // The map passes its own latest input; with or without it, current() is never null across the release.
  for (const pass of [true, false]) {
    G.guide.reset();
    const guess = G.guide.resolve(input({ coins, live: { 1: 'open' } }));
    assert.equal(guess.taskId, 1);
    const latest = input({ coins, live: { 1: 'open', 3: 'open' } });
    if (!pass) G.guide.resolve(latest);
    const readings = [];
    const off = G.guide.subscribe(() => readings.push(G.guide.current()));
    G.guide.releaseGuidePick(pass ? latest : undefined);
    off();
    assert.ok(G.guide.current(), `pass=${pass}: a target right after the release`);
    assert.ok(readings.every(t => t !== null), `pass=${pass}: no null notice`);
    assert.equal(G.guide.current().taskId, 3, 'the full data picks the nearer open ride');
  }
  // With nothing to resolve from yet, the release still clears the guess and asks for a resolve.
  G.guide.reset();
  const v = G.guide.version();
  G.guide.releaseGuidePick();
  assert.equal(G.guide.version(), v, 'nothing held: no change');
  G.guide.reset();
});

test('souvenir step: no dotted path and no edge arrow back to the ride; the card and island stay (round 3 fix 2)', () => {
  const ride = north(200);
  assert.equal(G.guidePathPoint(ride, 'celebrate'), null, 'the souvenir unfolds anywhere: no path point');
  assert.deepEqual(plain(G.guidePathPoint(ride, 'play')), plain(ride), 'the line story and every other step keep the path');
  assert.deepEqual(plain(G.guidePathPoint(ride, null)), plain(ride));
  assert.equal(G.guidePathPoint(null, 'play'), null);
  // The map's path and arrow come from pathPoint (Map draws both from guideTarget), the island from targetPoint.
  const fs = require('node:fs'); const path = require('node:path');
  const hook = fs.readFileSync(path.join(__dirname, '../../src/components/guide/useNextCoinGuide.ts'), 'utf8');
  assert.match(hook, /const pathPoint = guidePathPoint\(targetPoint, adventureStep\);/);
  const read = rel => { const f = path.join(__dirname, '../..', rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
  const screen = read('src/screens/ExploreScreen.tsx') + read('src/components/guide/useMapGuide.ts');
  assert.match(screen, /const guideMapTarget = useMemo\(\(\) => pathPoint && nextCoin\.target/);
});
