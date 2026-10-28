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
  // Held across moves, and an in-range other coin does not steal it.
  const held = G.pickNextCoin(input({ coins: won, live: { 1: 'open' }, adventure, current: first, location: north(120) }));
  assert.equal(held.taskId, 2);
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
  const moved = G.pickNextCoin(input({ coins: RIDES, live, current: t, location: north(260) }));
  assert.equal(moved.taskId, 3);
  // In range of another coin: PLAY! rises for it, the target still stays.
  const passing = G.pickNextCoin(input({ coins: RIDES, live, current: t, location: north(200) }));
  assert.equal(passing.taskId, 3);
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
