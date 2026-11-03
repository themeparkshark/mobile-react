/**
 * Core-loop fix round W1, guide and PLAY! agree (items 6 to 11, plus the Rewards fly anchor and the
 * home park tip). The principle: at every moment one next thing, and the card and the button never disagree.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const G = loadTs('src/services/guide/nextCoin.ts');
const F = loadTs('src/services/guide/freeTickets.ts');
const C = loadTs('src/services/guide/guideCopy.ts');
const D = loadTs('src/services/guide/parkDay.ts');
const GC = loadTs('src/components/guide/guideCoins.ts');
const CH = loadTs('src/components/rewards/challengeCopy.ts');
const L = loadTs('src/components/rewards/lostTryCard.ts');
const J = loadTs('src/components/boss/joinModel.ts');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

const BASE = { latitude: 33.8100, longitude: -117.9190 };
const north = m => ({ latitude: BASE.latitude + m / 111320, longitude: BASE.longitude });
const coin = (taskId, name, meters, extra = {}) => ({ taskId, name, parkId: 8, kind: 'ride', owned: false, ...north(meters), ...extra });
const NOW = Date.parse('2026-11-02T18:00:00Z');
const input = (extra = {}) => ({ mode: 'park', parkId: 8, location: BASE, coins: [], live: {}, now: NOW, ...extra });
const ctx = (extra = {}) => ({ parkName: 'Disneyland Park', ridesResting: false, allOwned: false, tickets: 0, freeStep: null,
  queueTicketsOn: false, adventureDots: null, ...extra });

test('item 6: the guide and PLAY! read one free try signal (the coin PLAY! is up for)', () => {
  // The walk: trip goal said no free try (it only answers for the goal coin); PLAY! said "Free try today".
  const daily = { rescue_pass_available: true, rescue_pass_source: 'daily', rescue_passes: 0, rescue_pass_used_today: false };
  const signal = F.freeTrySignal({ dailyOn: true, heldPasses: 0, playUp: daily, usedTodayHere: null });
  assert.deepEqual(plain(signal), { freeTryReady: true, extraTries: 0 });
  const wallet = GC.guideWallet({ tickets: 0, queueTicketsOn: false, claimable: [], ...signal });
  const target = { taskId: 5, parkId: 8, name: 'Mad Tea Party', kind: 'ride', reason: 'in_range', source: 'guide', meters: 5,
    inRange: true, checkRunning: false, leavesOn: null };
  assert.equal(G.guideState(input({ wallet }), target), 'free_try', 'the card says free try');
  assert.equal(CH.playBadge({ tickets: 0, ticketCost: 1, rescueAvailable: true, rescueSource: 'daily', claimable: 0 }), 'free_try',
    'and PLAY! wears the gift: the same answer');
  const copy = C.guideCardCopy('free_try', target, ctx({ freeStep: F.nextFreeTicket(wallet) }));
  assert.doesNotMatch(copy.a11y, /tomorrow/i);
  // A held pass: an extra try on both, never "free".
  const held = F.freeTrySignal({ dailyOn: true, heldPasses: 2, playUp: { rescue_pass_available: true, rescue_pass_source: 'held', rescue_passes: 2 },
    usedTodayHere: true });
  assert.deepEqual(plain(held), { freeTryReady: false, extraTries: 2 });
  assert.equal(CH.playBadge({ tickets: 0, ticketCost: 1, rescueAvailable: true, rescueSource: 'held', claimable: 0 }), 'extra_try');
  // PLAY! says no pass: the card says Need a Ticket, and PLAY! has no gift.
  const none = F.freeTrySignal({ dailyOn: true, heldPasses: 0, playUp: { rescue_pass_available: false, rescue_pass_source: null }, usedTodayHere: true });
  assert.deepEqual(plain(none), { freeTryReady: false, extraTries: 0 });
  assert.equal(G.guideState(input({ wallet: GC.guideWallet({ tickets: 0, queueTicketsOn: false, claimable: [], ...none }) }), target), 'need_ticket');
  // Away from PLAY!: the last coin answer here today decides; with none yet, the switch says an unused free try.
  assert.equal(F.freeTrySignal({ dailyOn: true, heldPasses: 0, playUp: null, usedTodayHere: null }).freeTryReady, true);
  assert.equal(F.freeTrySignal({ dailyOn: true, heldPasses: 0, playUp: null, usedTodayHere: true }).freeTryReady, false);
  assert.equal(F.freeTrySignal({ dailyOn: false, heldPasses: 0, playUp: null, usedTodayHere: null }).freeTryReady, false);
  // The guide's wiring: no trip-goal wallet for the free try any more, and PLAY! takes the guide's claim count.
  const hook = read('src/components/guide/useMapGuide.ts');
  assert.doesNotMatch(hook, /tripGoalData\?\.wallet\?\.rescue_pass_available/);
  assert.match(hook, /freeTrySignal\(\{ dailyOn: guideFlags\.ride_rescue_pass === true, heldPasses: player\.rescue_passes, playUp, usedTodayHere \}\)/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /claimableTickets=\{\(player\?\.tickets \?\? 0\) === 0 \? \(claimable\.loaded \? claimableTicketCount : null\) : undefined\}/);
  const play = read('src/components/RedeemModal.tsx');
  assert.match(play, /claimable: claimableTickets === undefined \? ownClaimable : claimableTickets === null \? 1 : claimableTickets,/);
});

test('item 6: Need a Ticket names every real way (no SEE WAYS that repeats it), and an extra try is never called free', () => {
  const need = C.guideCardCopy('need_ticket', null, ctx({ freeTryDaily: true }));
  assert.equal(need.button, null);
  assert.match(need.line, /3 treats at home = 1 Ticket\. Tomorrow brings a new free try\./);
  assert.doesNotMatch(C.guideCardCopy('need_ticket', null, ctx({ freeTryDaily: false })).line, /free try/i);
  assert.deepEqual(plain(F.needTicketLines(false, false)), ['3 treats at home = 1 Ticket.']);
  const extraLoss = L.lostTryCopy({ usedRescuePass: true, rescueRetryAvailable: true, firstCoinTicketReturned: false, lostTicketCost: 0, rescueSource: 'held' });
  assert.doesNotMatch(extraLoss.message, /free/i);
  assert.match(extraLoss.message, /extra try/);
  const extraDone = L.lostTryCopy({ usedRescuePass: true, rescueRetryAvailable: false, firstCoinTicketReturned: false, lostTicketCost: 0, rescueSource: 'held_retry' });
  assert.doesNotMatch(extraDone.message, /free/i);
  const daily = L.lostTryCopy({ usedRescuePass: true, rescueRetryAvailable: false, firstCoinTicketReturned: false, lostTicketCost: 0, rescueSource: 'daily' });
  assert.equal(daily.message, 'No Ticket used. Free try done today.');
});

test('item 7: the win card NEXT COIN is not a player pick: a line or a PLAY! beats it at once', () => {
  const RIDES = [coin(1, 'Jungle Cruise', 10, { queue: true }), coin(2, 'Frontierland Shootin\' Exposition', 90)];
  const live = { 1: 'open', 2: 'open' };
  const fromWin = { taskId: 2, parkId: 8, name: RIDES[1].name, kind: 'ride', reason: 'chosen', source: 'win_card', meters: 90,
    inRange: false, checkRunning: false, leavesOn: null };
  // Standing in Jungle Cruise's line one minute after NEXT COIN: In line? at once.
  const inLine = G.pickNextCoin(input({ coins: RIDES, live, current: fromWin, currentPickedAt: NOW - 60_000, inLineTaskId: 1 }));
  assert.equal(inLine.taskId, 1);
  assert.equal(inLine.reason, 'in_line');
  // PLAY! up for Jungle Cruise: the card says You're here for it.
  const atPlay = G.pickNextCoin(input({ coins: RIDES, live, current: fromWin, currentPickedAt: NOW - 60_000, playableTaskId: 1 }));
  assert.equal(atPlay.taskId, 1);
  assert.equal(atPlay.reason, 'in_range');
  // The player's own pick (the shelf) still holds for 10 minutes, then the line wins.
  const shelf = { ...fromWin, source: 'shelf' };
  assert.equal(G.pickNextCoin(input({ coins: RIDES, live, current: shelf, currentPickedAt: NOW - 60_000, inLineTaskId: 1 })).taskId, 2);
  assert.equal(G.pickNextCoin(input({ coins: RIDES, live, current: shelf, currentPickedAt: NOW - G.PICK_HOLD_MS - 1, inLineTaskId: 1 })).taskId, 1);
  for (const source of ['win_card', 'lineplay_recap', 'ride_logged']) assert.ok(G.SUGGESTION_SOURCES.has(source));
});

test('item 7: the pick hold ends on screen while standing still (the map re-resolves when it ends)', () => {
  G.guide.reset();
  const RIDES = [coin(1, 'Jungle Cruise', 10), coin(2, 'Frontierland', 90)];
  G.guide.setTarget(2, 'win_card');
  G.guide.resolve(input({ coins: RIDES, live: { 1: 'open', 2: 'open' } }));
  assert.equal(G.guide.current().taskId, 2);
  assert.equal(G.guide.pickHoldEndsAt(), null, 'a suggestion never holds, so nothing to wait for');
  G.guide.setTarget(2, 'shelf');
  G.guide.resolve(input({ coins: RIDES, live: { 1: 'open', 2: 'open' } }));
  const ends = G.guide.pickHoldEndsAt();
  assert.ok(Number.isFinite(ends) && ends - Date.now() <= G.PICK_HOLD_MS && ends - Date.now() > G.PICK_HOLD_MS - 5000);
  const hook = read('src/components/guide/useNextCoinGuide.ts');
  assert.match(hook, /const holdEndsAt = useSyncExternalStore\(guide\.subscribe, guide\.pickHoldEndsAt, guide\.pickHoldEndsAt\);/);
  G.guide.reset();
});

test('item 8: no 364 m pull back to an owned Adventure ride past a coin 30 m away; at the ride its Line story leads', () => {
  const lincoln = coin(70, 'Mr. Lincoln', 364, { owned: true, queue: true });
  const alice = coin(71, 'Alice in Wonderland', 30);
  const adventure = { taskId: 70, parkId: 8, phase: 'play' };
  const t = G.pickNextCoin(input({ coins: [lincoln, alice], live: { 71: 'open' }, adventure }));
  assert.equal(t.taskId, 71, 'the coin 30 m away, never the owned ride 364 m back');
  // Standing at the ride right after its win: the Line story.
  const atRide = G.pickNextCoin(input({ coins: [lincoln, alice], live: { 71: 'open' }, adventure, location: north(360) }));
  assert.equal(atRide.reason, 'line_story');
  // A ride with no line (a show) has no Line story pull at all.
  const show = G.pickNextCoin(input({ coins: [{ ...lincoln, queue: false }, alice], live: { 71: 'open' }, adventure, location: north(360) }));
  assert.equal(show.taskId, 71);
  // Walking away toward a nearer coin passes on the Line story for this step: no flip back on the way.
  G.guide.reset();
  G.guide.resolve(input({ coins: [lincoln, alice], live: { 71: 'open' }, adventure, location: north(360) }));
  assert.equal(G.guide.current().reason, 'line_story');
  G.guide.resolve(input({ coins: [lincoln, alice], live: { 71: 'open' }, adventure, location: north(150) }));
  assert.equal(G.guide.current().taskId, 71);
  assert.equal(G.guide.current().reason, 'nearest_open');
  G.guide.resolve(input({ coins: [lincoln, alice], live: { 71: 'open' }, adventure, location: north(330) }));
  assert.equal(G.guide.current().taskId, 71, 'held: the walk away declined the Line story step');
  G.guide.reset();
});

test('item 8: the shelf names the guide\'s Line story ride too (one next thing)', () => {
  const N = loadTs('src/services/collection/nextCoinCopy.ts');
  const rows = [{ id: 70, name: 'Mr. Lincoln' }, { id: 71, name: 'Alice' }];
  const pick = N.shelfGuidePick({ target: { taskId: 70, parkId: 8, reason: 'line_story' }, plan: null, levelUpGoal: null, parkId: 8, atPark: true,
    rows, owned: new Set([70]) });
  assert.equal(pick.row.id, 70);
  assert.equal(pick.reason, 'line_story');
  assert.equal(N.guideShelfHint('line_story'), 'Play its line story in its line.');
});

test('item 9: one gold button: while PLAY! is up the card\'s LINEPLAY steps down to a quiet link', () => {
  const target = { taskId: 9, parkId: 8, name: 'Roger Rabbit', kind: 'ride', reason: 'in_line', source: 'guide', meters: 5, inRange: true,
    checkRunning: false, leavesOn: null };
  const inLine = C.guideCardCopy('in_line', target, ctx());
  assert.equal(inLine.button.label, 'LINEPLAY');
  const withPlay = C.oneGoldButton(inLine, true);
  assert.equal(withPlay.button, null);
  assert.equal(withPlay.secondary.label, 'LINEPLAY');
  assert.equal(withPlay.secondary.action, 'lineplay');
  assert.equal(C.oneGoldButton(inLine, false), inLine);
  const story = C.guideCardCopy('line_story', { ...target, reason: 'line_story' }, ctx());
  const storyPlay = C.oneGoldButton(story, true);
  assert.equal(storyPlay.button, null);
  assert.equal(storyPlay.secondary.label, 'Pick another coin', 'a quiet link already there stays the one link');
  assert.match(read('src/components/guide/useNextCoinGuide.ts'), /const copy = oneGoldButton\(/);
});

test('item 10: one welcome per visit, never "First coin" to a veteran, never GO beside PLAY!', () => {
  const target = { taskId: 9, parkId: 8, name: 'Mad Tea Party', kind: 'ride', reason: 'nearest_open', source: 'guide', meters: 80, inRange: false,
    checkRunning: false, leavesOn: null };
  assert.equal(G.guideState(input({ arrivedAt: NOW - 1000 }), target), 'arrive');
  assert.equal(G.guideState(input({ arrivedAt: NOW - 1000, welcomed: true }), target), 'walk', 'a relaunch today never re-greets');
  assert.equal(G.guideState(input({ arrivedAt: NOW - 1000 }), { ...target, inRange: true }), 'here', 'at a coin PLAY! is up for: Tap PLAY!');
  const fresh = C.guideCardCopy('arrive', target, ctx({ ownedHere: 0 }));
  assert.equal(fresh.kicker, 'WELCOME TO DISNEYLAND!');
  assert.equal(fresh.title, 'First coin: Mad Tea Party');
  assert.equal(C.guideCardCopy('arrive', target, ctx({ ownedHere: 9 })).title, 'Next coin: Mad Tea Party');
  const again = C.guideCardCopy('arrive', null, ctx({ welcomed: true }));
  assert.equal(again.kicker, 'DISNEYLAND');
  assert.equal(again.title, 'Finding your next coin');
});

test('item 10: a goodbye on leaving, never the next park\'s welcome', () => {
  const dl = [coin(1, 'Main Street Station', 0), coin(2, 'Mr. Lincoln', 40)];
  const dca = [{ ...coin(30, 'Soarin\'', -330), parkId: 13 }];
  // Walked out to the esplanade: the place check moved the player to the next park before its coins.
  assert.equal(D.leavingPark({ parkId: 13, location: north(-180), coins: dca, lastInside: { parkId: 8 }, coinsToday: 5 }), true);
  // Inside the next park (within 120 m of its coins): its own welcome, no goodbye.
  assert.equal(D.leavingPark({ parkId: 13, location: north(-300), coins: dca, lastInside: { parkId: 8 }, coinsToday: 5 }), false);
  // No coins today: nothing to say goodbye to.
  assert.equal(D.leavingPark({ parkId: 13, location: north(-180), coins: dca, lastInside: { parkId: 8 }, coinsToday: 0 }), false);
  // Same park, walked 400 m past every coin.
  assert.equal(D.leavingPark({ parkId: 8, location: north(-500), coins: dl, lastInside: { parkId: 8 }, coinsToday: 2 }), true);
  assert.equal(D.leavingPark({ parkId: 8, location: north(-200), coins: dl, lastInside: { parkId: 8 }, coinsToday: 2 }), false);
  assert.equal(G.guideState(input({ leaving: true }), null), 'goodbye');
  const bye = C.guideCardCopy('goodbye', null, ctx({ leaving: { parkName: 'Disneyland Park', coins: 5 } }));
  assert.equal(bye.kicker, 'GREAT DAY AT DISNEYLAND!');
  assert.equal(bye.title, '5 coins won today');
  assert.equal(bye.button.label, 'SHELF');
  assert.equal(bye.button.action, 'story');
  const hook = read('src/components/guide/useNextCoinGuide.ts');
  // The welcome starts inside the next park with its own coins, never on the way out of the last one.
  assert.match(hook, /const arrivalReading = parkId != null && !!input\.location && parkCoinsKnown && !leaving;/);
  assert.match(hook, /const leaving = enabled && parkCoinsKnown && leavingPark\(/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /case 'story':\n[^\n]*\n\s+if \(player\) RootNavigation\.navigate\('Park', \{ park: nextCoin\.leavingParkId \?\? park\?\.id/);
});

test('item 10: today\'s coins by park and the welcomed parks live in the park day record (start over each day)', () => {
  const day = '2026-11-02';
  let r = D.parkDayStep(D.EMPTY_PARK_DAY, { mode: 'park', parkId: 8, location: BASE, today: day }).next;
  r = D.parkDayStep(r, { mode: 'park', parkId: 8, location: BASE, today: day, coinsWon: 2 }).next;
  assert.equal(D.coinsToday(r, 8, day), 2);
  r = D.parkDayStep(r, { mode: 'park', parkId: 13, location: north(-300), today: day, coinsWon: 1 }).next;
  assert.equal(D.coinsToday(r, 8, day), 2);
  assert.equal(D.coinsToday(r, 13, day), 1);
  D.parkDayStore.reset();
  const saved = [];
  D.parkDayStore.set(46, r, value => saved.push(value));
  D.parkDayStore.markWelcomed(8, day);
  assert.equal(D.welcomedToday(D.parkDayStore.get(), 8, day), true);
  assert.equal(saved.length, 1, 'saved for the next app open');
  const next = D.parkDayStep(D.parkDayStore.get(), { mode: 'park', parkId: 8, location: BASE, today: day }).next;
  assert.equal(D.welcomedToday(next, 8, day), true, 'kept through the next step');
  const tomorrow = D.parkDayStep(next, { mode: 'park', parkId: 8, location: BASE, today: '2026-11-03' }).next;
  assert.equal(D.welcomedToday(tomorrow, 8, '2026-11-03'), false, 'a new day welcomes again');
  assert.equal(D.coinsToday(tomorrow, 8, '2026-11-03'), 0);
  D.parkDayStore.reset();
});

test('item 11: the raid is calm (no red), joins in the park, and the card body acts like its button', () => {
  const raid = { you: { attacks: 0 } };
  assert.equal(J.joinLabel(raid, true, true), 'JOIN IN THE PARK');
  assert.equal(J.joinLabel(raid, true, false), 'JOIN FROM HOME');
  assert.equal(J.joinLabel(raid, false), 'FIGHT!');
  const card = read('src/components/boss/BossJoinCard.tsx');
  assert.doesNotMatch(card, /live: \{[^}]*BRAND\.red/);
  assert.match(card, /cta: \{ minHeight: 70, borderRadius: 22, backgroundColor: BRAND\.gold,/);
  assert.match(card, /label=\{walkCloser \? 'FROM HERE' : 'FROM HOME'\}/);
  const pill = read('src/components/LiveEventsPill.tsx');
  assert.doesNotMatch(pill, /FIGHT</);
  assert.match(pill, /hpFill: \{ height: '100%', backgroundColor: BRAND\.gold \}/);
  assert.match(read('src/components/boss/BossSheetParts.tsx'), /hpFill: \{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND\.gold \}/);
  assert.doesNotMatch(read('src/components/boss/BossMarker.tsx'), /#ef4a3c/);
  assert.match(read('src/components/boss/BossRaidFlow.tsx'), /<BossJoinCta raid=\{raid\} remote=\{remote\} inPark=\{walkCloser\}/);
  const hook = read('src/components/guide/useMapGuide.ts');
  assert.match(hook, /if \(button && act\) \{ act\(button\.action\); return; \}/);
  assert.match(hook, /if \(playableTaskId != null\) \{ setPlayRequest\(n => n \+ 1\); return; \}/);
  assert.match(read('src/components/RedeemModal.tsx'), /if \(pillShown && !modalVisible\) pressPlayRef\.current\(\);/);
});

test('the map Rewards button is the stamps\' fly target, and the park tip needs the player really at the park', () => {
  const button = read('src/components/map/RewardsButton.tsx');
  assert.match(button, /const anchor = useFlyAnchor\('rewards'\);/);
  assert.match(button, /<Pressable ref=\{anchor\.ref as React\.RefObject<View>\} onLayout=\{anchor\.onLayout\}/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /parkTipFor\(\{ inPark: atParkNow,/);
  assert.match(read('src/components/guide/useMapGuide.ts'), /const atParkNow = !!park && \(/);
});
