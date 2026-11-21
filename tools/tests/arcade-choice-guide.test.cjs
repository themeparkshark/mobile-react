'use strict';
/**
 * Arcade plan, lane app-choice (Nov 20, 2026). Dustin: "we shouldn't suggest where they go it's their choice to play
 * and it might make them think one ride is more important than another which isn't true".
 * C1 the guide only follows the player, C2 the top card's states, C3 Daily 3 GO and the served price, C4 NEAR ME.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const G = loadTs('src/services/guide/nextCoin.ts');
const C = loadTs('src/services/guide/guideCopy.ts');
const N = loadTs('src/components/guide/nearMeModel.ts');
const read = rel => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

const BASE = { latitude: 33.8100, longitude: -117.9190 };
const north = m => ({ latitude: BASE.latitude + m / 111320, longitude: BASE.longitude });
const coin = (taskId, name, meters, extra = {}) => ({ taskId, name, parkId: 8, kind: 'ride', owned: false, ...north(meters), ...extra });
const NOW = Date.parse('2026-11-20T19:00:00Z');
const input = (extra = {}) => ({ mode: 'park', parkId: 8, location: BASE, coins: [], live: {}, now: NOW, playableTaskId: null, ...extra });

const PARK = [
  coin(73, 'Space Mountain', 300, { star: true }),
  coin(66, 'Jungle Cruise', 120, { rush: true }),
  coin(155, 'Dumbo', 80, { leavesOn: '2026-11-30' }),
  coin(78, 'Walt Statue', 60, { kind: 'sight' }),
  coin(64, 'Haunted Mansion', 200, { owned: true, levelUpReady: true }),
];
const OPEN = { 73: 'open', 66: 'open', 155: 'open', 64: 'open' };

test('C1: with no pick, every state returns null, whatever Adventure, Star, Rush, nearest, sight, level up or limited data exists', () => {
  const variants = [
    {},
    { live: OPEN },
    { live: {} },
    { live: OPEN, starRushUnlocked: true, coinLevelsUnlocked: true },
    { live: OPEN, adventure: { taskId: 73, parkId: 8, phase: 'discover' } },
    { live: OPEN, adventure: { taskId: 64, parkId: 8, phase: 'play' } },
    { live: OPEN, adventure: { taskId: 64, parkId: 8, phase: 'celebrate' } },
    { live: { 73: 'closed', 66: 'closed', 155: 'closed', 64: 'closed' } },
  ];
  for (const extra of variants) {
    assert.equal(G.pickNextCoin(input({ coins: PARK, ...extra })), null, JSON.stringify(extra));
  }
  // The card then says "pick any coin", never a ride name.
  assert.equal(G.guideState(input({ coins: PARK, live: OPEN }), null), 'pick');
});

test('C1: only rules 2, 3 and 4 remain: the coin PLAY! is up for, the line you stand in, the coin you picked', () => {
  const here = G.pickNextCoin(input({ coins: PARK, live: OPEN, playableTaskId: 155 }));
  assert.equal(here.taskId, 155);
  assert.equal(here.reason, 'in_range');
  assert.equal(G.playerChose(here), false, 'standing at a coin is not a pick: no path, no bob');
  const line = G.pickNextCoin(input({ coins: PARK, live: OPEN, inLineTaskId: 66 }));
  assert.equal(line.taskId, 66);
  assert.equal(line.reason, 'in_line');
  const chosen = G.pickNextCoin(input({ coins: PARK, live: OPEN, chosenTaskId: 73 }));
  assert.equal(chosen.taskId, 73);
  assert.equal(chosen.reason, 'chosen');
  assert.equal(G.playerChose(chosen), true);
  const picked = G.pickNextCoin(input({ coins: PARK, live: OPEN, pickedTaskId: 66, pickedSource: 'near_me' }));
  assert.equal(picked.taskId, 66);
  assert.equal(picked.source, 'near_me');
  // The coin PLAY! was up for, once the player walks on, leaves nothing behind.
  assert.equal(G.pickNextCoin(input({ coins: PARK, live: OPEN, current: here })), null);
  // The line they stood in, once they step out, leaves nothing behind.
  assert.equal(G.pickNextCoin(input({ coins: PARK, live: OPEN, current: line })), null);
  // A pick holds through a walk, and a coin in passing gives the card back to the pick.
  const passing = G.pickNextCoin(input({ coins: PARK, live: OPEN, current: picked, playableTaskId: 155 }));
  assert.equal(passing.taskId, 155);
  assert.equal(G.pickNextCoin(input({ coins: PARK, live: OPEN, current: passing, resumeTarget: picked })).taskId, 66);
  // Closed, won or far: the pick is dropped, and nothing takes its place.
  assert.equal(G.pickNextCoin(input({ coins: PARK, live: { ...OPEN, 66: 'closed' }, current: picked })), null);
  assert.equal(G.pickNextCoin(input({ coins: PARK.map(c => (c.taskId === 66 ? { ...c, owned: true } : c)), live: OPEN, current: picked })), null);
  assert.equal(G.pickNextCoin(input({ coins: PARK, live: OPEN, current: picked, location: north(-2000) })), null);
});

test('C1: setTarget accepts only player sources; win card, recap, ride log and anything unknown are ignored', () => {
  G.guide.reset();
  const base = input({ coins: PARK, live: OPEN });
  for (const source of ['win_card', 'lineplay_recap', 'ride_logged', 'daily3', 'nearest', 'guide', 'next_up']) {
    G.guide.setTarget(73, source);
    assert.equal(G.guide.resolve(base), null, `${source} never moves the pointer`);
    assert.equal(G.guide.plan(), null);
  }
  for (const source of ['callout', 'coin_card', 'shelf', 'shelf_next', 'shelf_slot', 'coin_guide', 'near_me', 'wait_times', 'my_goal', 'find', 'get_tickets']) {
    G.guide.reset();
    G.guide.setTarget(66, source);
    assert.equal(G.guide.resolve(base)?.taskId, 66, `${source} is the player's own pick`);
  }
  // The X clears it: no held coin, no plan, and the next resolve holds nothing.
  G.guide.clearPick();
  assert.equal(G.guide.current(), null);
  assert.equal(G.guide.plan(), null);
  assert.equal(G.guide.resolve(base), null);
  // nextAfter never invents a coin (the LinePlay recap and Ride logged read it).
  G.guide.reset();
  G.guide.resolve({ ...base, inLineTaskId: 66 });
  assert.equal(G.guide.nextAfter(66), null);
  G.guide.reset();
});

test('C1: the map pointer (path, edge arrow, camera fit, bob) follows only a coin the player chose', () => {
  const hook = read('src/components/guide/useMapGuide.ts');
  assert.match(hook, /const pickedTarget = nextCoin\.target && playerChose\(nextCoin\.target\) \? nextCoin\.target : null;/);
  assert.match(hook, /const guideTargetId = pickedTarget\?\.taskId \?\? null;/);
  assert.match(hook, /const guideMapTarget = useMemo\(\(\) => pathPoint && pickedTarget/);
  assert.doesNotMatch(hook, /ticket_cost: 1/, 'no price default on the stand-in island');
  // The served price, never a guessed 1.
  assert.doesNotMatch(read('src/screens/ExploreScreen.tsx'), /ticket_cost \?\? 1\}/);
});

const ctx = (extra = {}) => ({ parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 1, freeStep: null,
  queueTicketsOn: true, adventureDots: null, ...extra });
const pick = (extra = {}) => ({ taskId: 73, parkId: 8, name: 'Space Mountain', kind: 'ride', reason: 'chosen', source: 'near_me',
  meters: 120, inRange: false, checkRunning: false, leavesOn: null, ...extra });

test('C2: the top card, state by state (PLAN section 6); never "Next coin", "First coin", "Then:" or "glowing"', () => {
  const arrive = C.guideCardCopy('arrive', null, ctx({ parkGiftTickets: 3 }));
  assert.equal(arrive.kicker, 'WELCOME TO DISNEYLAND!');
  assert.equal(arrive.title, '+3 Tickets: your park day gift');
  assert.equal(arrive.howTo, true, 'the three pictures: tap a coin, walk, PLAY!');
  assert.equal(arrive.button.label, 'OK');
  assert.equal(C.guideCardCopy('arrive', null, ctx()).title, 'Every ride has a coin. Pick one!', 'today\'s server: no gift promised');

  const bar = C.shelfBarFor({ won: 9, total: 40, arcade: true });
  const nothing = C.guideCardCopy('pick', null, ctx({ shelfBar: bar }));
  assert.equal(nothing.kicker, 'DISNEYLAND');
  assert.equal(nothing.title, 'Win any ride coin');
  assert.equal(nothing.line, '9 of 40 coins · 1 more: +3 Tickets');
  assert.equal(nothing.button.label, 'NEAR ME');
  assert.equal(nothing.button.action, 'near_me');
  assert.deepEqual(plain(nothing.shelfBar), { won: 9, total: 40, nextAt: 10, tickets: 3 });

  const walk = C.guideCardCopy('walk', pick(), ctx({ targetPrice: 3, tickets: 1 }));
  assert.equal(walk.kicker, 'YOUR PICK');
  assert.equal(walk.title, 'Space Mountain');
  assert.equal(walk.line, '120 m');
  assert.deepEqual(plain(walk.pips), { price: 3, held: 1 });
  assert.equal(walk.clear.action, 'clear', 'X clears the pick');
  assert.equal(C.guideCardCopy('walk', pick(), ctx()).pips, null, 'a missing price hides the pips');

  const here = C.guideCardCopy('here', pick({ reason: 'in_range', source: 'guide', inRange: true, name: 'Jungle Cruise' }), ctx({ thenName: 'Space Mountain' }));
  assert.equal(here.title, 'You\'re at Jungle Cruise');
  assert.equal(here.line, 'Tap PLAY!');
  assert.ok(!here.clear, 'no X where the player stands');

  const inLine = C.guideCardCopy('in_line', pick({ reason: 'in_line', source: 'guide', name: 'Jungle Cruise' }), ctx());
  assert.equal(inLine.title, 'In line for Jungle Cruise?');
  assert.equal(inLine.line, 'Your wait earns its Parts and 1 Ticket');
  assert.equal(C.guideCardCopy('in_line', pick({ reason: 'in_line' }), ctx({ queueTicketsOn: false })).line, 'Your wait earns its Ride Parts');

  const resting = C.guideCardCopy('pick', null, ctx({ ridesResting: true }));
  assert.equal(resting.kicker, 'RIDES ARE RESTING');
  assert.equal(resting.title, 'Sights stay open');
  assert.equal(resting.button.action, 'near_me');

  const empty = C.guideCardCopy('need_ticket', pick(), ctx({ tickets: 0, arcade: true }));
  assert.equal(empty.title, '0 Tickets');
  assert.equal(empty.button.label, 'GET TICKETS');
  assert.doesNotMatch(`${empty.title} ${empty.line}`, /Space Mountain/, 'an empty wallet names no ride');
  assert.match(empty.line, /Tomorrow at any park: \+3\./);

  const back = C.guideCardCopy('welcome_back', pick(), ctx({ shelf: { owned: 9, total: 40 }, tickets: 6 }));
  assert.equal(back.title, 'Your Disneyland shelf: 9 of 40');
  assert.equal(back.button.label, 'SHELF', 'never GO to a held coin');

  const claim = C.guideCardCopy('claim', pick(), ctx({ freeStep: { kind: 'claim', tickets: 5, sources: [] } }));
  assert.equal(claim.line, null, 'no "Then win" line');

  const all = [arrive, nothing, walk, here, inLine, resting, empty, back, claim]
    .flatMap(c => [c.kicker, c.title, c.line, c.a11y, c.button?.label]).filter(Boolean).join(' | ');
  assert.doesNotMatch(all, /Next coin|NEXT COIN|First coin|Then:|glowing|follow the path|one Ticket per|—/i);
  // Dates in words, never a countdown; distances rounded.
  assert.equal(C.leavesLine('2026-10-31'), 'leaves Saturday, Oct 31');
  assert.equal(C.leavesLine('soon'), null);
  assert.equal(C.guideDistance(1234), '1.2 km');
  assert.equal(C.guideDistance(2), '5 m');
});

test('C2: card states from the guide (arrive with OK, pick, empty wallet never names a ride)', () => {
  assert.equal(G.guideState(input({ arrivedAt: NOW - 2000 }), null), 'arrive', 'the welcome shows with nothing picked');
  assert.equal(G.guideState(input({ arrivedAt: NOW - 2000, welcomed: true }), null), 'pick', 'OK (or a relaunch) ends it');
  assert.equal(G.guideState(input({ arrivedAt: NOW - 31000 }), null), 'pick');
  const wallet = (extra = {}) => ({ tickets: 0, claimable: [], freeTryReady: false, extraTries: 0, queueTicketsOn: true, ...extra });
  assert.equal(G.guideState(input({ wallet: wallet() }), null), 'need_ticket');
  assert.equal(G.guideState(input({ wallet: wallet({ tickets: 2 }) }), null), 'pick');
  assert.equal(G.guideState(input({ wallet: wallet({ freeTryReady: true }) }), null), 'pick', 'today\'s free try: any coin, pick one');
  assert.equal(G.guideState(input({ wallet: wallet({ claimable: [{ kind: 'stamp', tickets: 3 }] }) }), null), 'claim');
});

test('C2: the shelf bar only promises a gift the server pays', () => {
  assert.equal(C.shelfBarFor({ won: 9, total: 40, arcade: false }).nextAt, null, 'today\'s server: a count, no gift');
  assert.equal(C.shelfBarLine(C.shelfBarFor({ won: 9, total: 40, arcade: false })), '9 of 40 coins');
  assert.equal(C.shelfBarFor({ won: 10, total: 40, arcade: true }).nextAt, 15);
  assert.equal(C.shelfBarFor({ won: 36, total: 38, arcade: true }).nextAt, null, 'no step past the shelf');
  assert.equal(C.shelfBarFor({ won: 0, total: 0, arcade: true }), null);
  const served = C.shelfBarFor({ won: 2, total: 33, arcade: false, served: { won: 9, total: 40, next_at: 10, tickets: 3 } });
  assert.deepEqual(plain(served), { won: 9, total: 40, nextAt: 10, tickets: 3 }, 'the server\'s own shelf_gift wins');
  assert.equal(C.shelfBarLine(C.shelfBarFor({ won: 0, total: 40, arcade: true })), '0 of 40 coins · 5 more: +3 Tickets');
});

test('C2: the card draws the pips, the X, the shelf gift bar and the three pictures; the screen handles every new action', () => {
  const card = read('src/components/guide/NextCoinCard.tsx');
  assert.match(card, /<TicketPips testID="guide-card-pips"/);
  assert.match(card, /testID="guide-clear-pick"/);
  assert.match(card, /testID="shelf-gift-bar"/);
  assert.match(card, /testID="arrive-how-to"/);
  const screen = read('src/screens/ExploreScreen.tsx');
  assert.match(screen, /case 'clear': guide\.clearPick\(\);/);
  assert.match(screen, /case 'ok': nextCoin\.finishArrive\(\); return;/);
  assert.match(screen, /case 'near_me': setNearMe\(\{ canPlay: false \}\); return;/);
  assert.match(screen, /case 'get_tickets':/);
});

test('C3: Daily 3 GO closes to the map with no target; the island price is the served one', () => {
  const screen = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(screen, /guideToNearestRide/);
  assert.match(screen, /onFind: what => \{\n      if \(what === 'snack'\) \{ setHighlightNearestFind\(Date\.now\(\)\); return; \}\n    \},/);
  assert.match(screen, /ticketCost=\{task\.ticket_cost \?\? tripGoalData\?\.wallet\.ticket_cost\}/);
});

const tasks = [
  { id: 73, name: 'Space Mountain', latitude: north(300).latitude, longitude: BASE.longitude, ticket_cost: 3, coin_url: 'a' },
  { id: 155, name: 'Dumbo the Flying Elephant', latitude: north(80).latitude, longitude: BASE.longitude, ticket_cost: 1 },
  { id: 66, name: 'Jungle Cruise', latitude: north(120).latitude, longitude: BASE.longitude, ticket_cost: 2 },
  { id: 64, name: 'Haunted Mansion', latitude: north(200).latitude, longitude: BASE.longitude, ticket_cost: 3 },
  { id: 78, name: 'Walt Statue', latitude: north(60).latitude, longitude: BASE.longitude },
];
const live = { rides: [{ task_id: 73, status: 'OPERATING', wait: 45 }, { task_id: 66, status: 'CLOSED', wait: null }] };

test('C4: NEAR ME lists every coin not yet won, A to Z by default, one identical row each', () => {
  const rows = N.nearMeRows({ tasks, ownedTaskIds: new Set([64]), here: BASE, live, tickets: 1, sort: 'az', canPlayOnly: false });
  assert.deepEqual(plain(rows.map(r => r.name)), ['Dumbo the Flying Elephant', 'Jungle Cruise', 'Space Mountain', 'Walt Statue']);
  assert.deepEqual(plain(Object.keys(rows[0]).sort()), plain(Object.keys(rows[3]).sort()), 'every row has the same shape');
  const space = rows.find(r => r.taskId === 73);
  assert.equal(space.price, 3);
  assert.equal(space.status, 'open');
  assert.equal(space.wait, 45);
  assert.equal(N.nearMeLine(space), '300 m · Open, 45 min wait');
  assert.equal(N.nearMeLine(rows.find(r => r.taskId === 66)), '120 m · Closed right now');
  assert.equal(rows.find(r => r.taskId === 78).price, null, 'no served price: no pips (today\'s server serves 1)');
});

test('C4: the Distance switch and "I can play now" (price at or under the wallet)', () => {
  const byDistance = N.nearMeRows({ tasks, ownedTaskIds: new Set(), here: BASE, live, tickets: 2, sort: 'distance', canPlayOnly: false });
  assert.deepEqual(plain(byDistance.map(r => r.taskId)), [78, 155, 66, 64, 73]);
  const canPlay = N.nearMeRows({ tasks, ownedTaskIds: new Set(), here: BASE, live, tickets: 1, sort: 'az', canPlayOnly: true });
  assert.deepEqual(plain(canPlay.map(r => r.taskId)), [155, 78], 'holding 1: only the 1-Ticket coins');
  assert.equal(N.cleanSort('distance'), 'distance');
  assert.equal(N.cleanSort('nearest'), 'az');
  assert.equal(N.nearMeSortKey(97), 'near_me_sort:97');
  const sheet = read('src/components/guide/NearMeSheet.tsx');
  assert.doesNotMatch(sheet, /goalRow|YOUR NEXT COIN|NEAREST|REPORTED OPEN/, 'no top pick, no gold row, no headline');
  assert.match(sheet, /I CAN PLAY NOW/);
  assert.match(sheet, /AsyncStorage\.setItem\(nearMeSortKey\(playerId\), next\)/, 'the sort is remembered on the phone');
  const screen = read('src/screens/ExploreScreen.tsx');
  assert.match(screen, /guide\.setTarget\(taskId, 'near_me'\);/, 'a row tap is the player\'s pick');
  assert.match(screen, /setNearMe\(\{ canPlay: nearMeParam === 'can_play' \}\);/, 'Get Tickets opens it filtered');
});

test('C10: the teaching words never promise a glowing coin, a path to follow, one Ticket per game or a Ticket back', () => {
  const files = ['src/components/Tutorial/steps.ts', 'src/screens/launchFacts.ts', 'src/api/defaults/crumbs.json',
    'src/services/help/helpSheets.ts', 'src/services/help/glossary.ts', 'src/services/help/helpTopics.ts'];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /glowing|follow the path|next coin is|one Ticket|comes back/i, file);
    // launchFacts keeps "Tap GO" only inside its filter that holds later tips back from a new player.
    if (!file.endsWith('launchFacts.ts')) assert.doesNotMatch(src, /Tap GO/, file);
  }
  const steps = read('src/components/Tutorial/steps.ts');
  assert.match(steps, /text: 'Every ride has a coin\. Pick any one, walk there, tap PLAY!'/);
  assert.match(steps, /subtitle: 'Tap any empty slot to pick a coin\.'/);
  assert.match(read('src/services/help/glossary.ts'), /label: 'Your pick', icon: 'map', topic: 'home',\n    what: 'A coin you chose\. The map shows the way\.'/);
  assert.ok(JSON.parse(read('src/api/defaults/crumbs.json')).crumbs || true, 'crumbs.json is still valid JSON');
  assert.match(read('src/api/defaults/crumbs.json'), /Bigger rides cost more Tickets\. Win or lose, you get Ride Parts\./);
});

test('C5: the win card buttons are BACK TO MAP and SEE MY SHELF; on today\'s Adventure coin, Play its line story', () => {
  const W = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => true } });
  const pickTarget = { taskId: 66, name: 'Jungle Cruise', meters: 60, reason: 'chosen' };
  for (const target of [pickTarget, { ...pickTarget, reason: 'nearest_open' }, null]) {
    const button = W.nextCoinButton(target, 155);
    assert.equal(button.kind, 'map');
    assert.equal(button.label, 'Back to Map');
    assert.equal(button.detail, null, 'never a coin name or distance');
  }
  assert.equal(W.nextCoinButton(pickTarget, 155, true).label, 'Play its line story', 'the Adventure ride the player just won');
  assert.doesNotMatch(read('src/components/rewards/postWinModel.ts'), /label: 'NEXT COIN'/);
});

test('C6: the LinePlay recap keeps GO for the line just waited in, else the shelf; Ride logged says BACK TO MAP; no setTarget', () => {
  const S = loadTs('src/services/lineplay/rideStep.ts');
  const base = { rideName: 'Jungle Cruise', partsEarned: 1, rideTaskId: 66, upgradeReady: false, nextCoin: { taskId: 73, name: 'Space Mountain' } };
  assert.equal(S.recapGo({ ...base, coinState: 'unowned' }).kind, 'win_coin');
  assert.equal(S.recapGo({ ...base, coinState: 'unowned' }).taskId, 66, 'the line the player chose');
  const owned = S.recapGo({ ...base, coinState: 'owned' });
  assert.equal(owned.kind, 'shelf');
  assert.equal(owned.label, 'See your park shelf');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.doesNotMatch(screen, /setTarget\([^)]*'lineplay_recap'\)/);
  assert.match(screen, /const keep = playerChose\(heldAtOpen\.current\) \? doneKeepsTarget\(heldAtOpen\.current, guide\.current\(\)\) : null;/);
  const success = read('src/components/RideTracker/RideLogSuccess.tsx');
  assert.match(success, /testID="ride-logged-back-to-map" label="BACK TO MAP"/);
  assert.doesNotMatch(success, /NEXT COIN/);
  assert.doesNotMatch(read('src/screens/RideTracker/RideLogScreen.tsx'), /setTarget|ride_logged/);
});

test('C7: shelves name no ride the app chose: park header, Coin Guide, all-parks shelf and Wait Times', () => {
  const header = read('src/screens/ParkCollectionHeader.tsx');
  assert.match(header, /eyebrow: 'PICK ANY COIN', name: 'Tap any empty slot'/);
  assert.match(header, /testID="shelf-gift-line"/);
  assert.equal(C.shelfGiftHeaderLine(C.shelfBarFor({ won: 9, total: 40, arcade: true })), '1 more: +3 Tickets');
  assert.equal(C.shelfGiftHeaderLine(C.shelfBarFor({ won: 9, total: 40, arcade: false })), null, 'today\'s server: no gift line');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /const guideTarget = guideHeld && playerChose\(guideHeld\) \? guideHeld : null;/);
  assert.doesNotMatch(park, /nearbyRideId=|shelfNearbyPick|nearbyUncollectedRide/);
  const directory = read('src/screens/ParkRideDirectory.tsx');
  assert.match(directory, /const visible = expanded \? matching : \[\];/, 'collapsed: never one suggested row');
  assert.doesNotMatch(directory, /REPORTED OPEN NEARBY|NEAREST COIN AREA|YOUR NEXT COIN|goalRow\]/);
  const all = read('src/screens/CoinShelfScreen.tsx');
  assert.doesNotMatch(all, /missing\[0\]|PICK YOUR NEXT COIN/);
  assert.match(all, /Tap any empty slot to pick/);
  const waits = read('src/screens/QueueTimesScreen.tsx');
  assert.match(waits, /const pickedNow = \(\) => \{ const held = guide\.current\(\); return held && playerChose\(held\) \? held\.taskId : null; \};/);
  assert.doesNotMatch(waits, /Your next coin/);
});

test('C8: the home card: NEXT PARK DAY with the jar and the treat meter, a limited count, Ride Parts with no coin named', () => {
  const H = loadTs('src/services/guide/homeNext.ts');
  const base = { levelUp: null, readyReward: null, daily3: null, treats: { onMap: 0, toTicket: 2, capped: false }, limited: null, parts: null,
    practice: false, park: { parkName: 'Disneyland', tickets: 6, plan: null }, veteran: true, welcomeBack: false };
  const jar = { held: 12, cap: 20, full: false };
  const day = H.homeNextStep({ ...base, park: { ...base.park, plan: { name: 'Space Mountain', coinUrl: null, assetId: 73, parkId: 8 }, jar } });
  assert.equal(day.copy.kicker, 'NEXT PARK DAY');
  assert.equal(day.copy.title, '12 Tickets in your jar');
  assert.equal(day.copy.line, '2 more treats = 1 Ticket. Your pick: Space Mountain');
  const noPick = H.homeNextStep({ ...base, park: { ...base.park, jar } });
  assert.equal(noPick.copy.title, '12 Tickets in your jar');
  assert.doesNotMatch(noPick.copy.line, /Next coin|Space Mountain/);
  assert.equal(H.homeJarOf({ home_jar: { held: 20, cap: 20, full: true } }).full, true);
  assert.equal(H.homeJarOf({ tickets: 3 }), null, 'today\'s server: no jar');
  const limited = H.homeNextStep({ ...base, limited: { name: 'Holiday Coaster', coinUrl: 'x', assetId: 99, parkId: 8, leavesOn: '2026-11-30' }, limitedCount: 5 });
  assert.equal(limited.copy.title, '5 limited coins at Disneyland');
  assert.equal(limited.action, 'limited');
  assert.equal(limited.copy.button.label, 'SEE');
  const parts = H.homeNextStep({ ...base, park: { ...base.park, plan: { name: 'Dumbo', coinUrl: null, assetId: 155, parkId: 8 } },
    parts: { name: 'Autopia', coinUrl: 'a', assetId: 12, parkId: 8, partsToGo: 2, levelName: 'Shiny' } });
  assert.equal(parts.copy.kicker, 'GET RIDE PARTS');
  assert.equal(parts.copy.line, 'Wait in any ride\'s line to grow its coin');
  assert.equal(parts.coin, null);
  const ready = H.homeNextStep({ ...base, levelUp: { name: 'Haunted Mansion', coinUrl: null, assetId: 64, parkId: 8 } });
  assert.equal(ready.copy.kicker, 'READY TO LEVEL UP', 'the player\'s own coin, no walk: stays');
  const screen = read('src/screens/ExploreScreen.tsx');
  assert.match(screen, /RootNavigation\.navigate\('Park', \{ park: coin\?\.parkId \?\? homeParkId \?\? homeShelfPark\(player\.current_park_id\), player: player\.id, tab: 'limited' \}\);/);
  assert.match(read('src/screens/ParkScreen.tsx'), /setTab\(tabParam === 'limited' \|\| tabParam === 'sights' \? tabParam : 'rides'\);/);
});

test('C9: Today\'s Adventure starts on any coin; Star Day is every coin or none; Next Up ride opens the map with no target', () => {
  const sheet = read('src/screens/ExploreScreen/AdventureTicketCard.tsx');
  assert.match(sheet, /const openStart = ticket\.phase === 'discover';/);
  assert.match(sheet, /\{openStart \? 'Win any ride coin to start your story' : prompt\.title\}/);
  assert.match(sheet, /testID="adventure-back-to-map" label="BACK TO MAP"/);
  assert.doesNotMatch(sheet, /Your map's next coin/, 'the sheet never names the map\'s coin');
  const screen = read('src/screens/ExploreScreen.tsx');
  assert.match(screen, /const adventureTaskId = adventure && adventure\.phase === 'play' \? adventure\.ride\.task_id : null;/,
    'no ADVENTURE tag on a seeded ride before its coin is won');
  assert.match(screen, /rides\.every\(task => eventStarRides\.has\(task\.id\)\) \? eventStarRides : NO_STARS/);
  const R = loadTs('src/components/nextUp/nextUpRoute.ts');
  assert.equal(R.nextUpRoute({ type: 'ride' }).kind, 'map');
});

test('C2: the card\'s "9 of 40 coins" counts the whole shelf from the trip goal, so it never jumps as the map list changes', () => {
  const hook = read('src/components/guide/useNextCoinGuide.ts');
  assert.match(hook, /won: input\.shelf\?\.won \?\? coins\.filter\(coin => coin\.owned\)\.length,/);
  const map = read('src/components/guide/useMapGuide.ts');
  assert.match(map, /const here = \(tripGoalData\?\.rides \?\? \[\]\)\.filter\(ride => ride && ride\.park_id === park\?\.id\);/);
  assert.match(map, /shelf: parkShelf,/);
});
