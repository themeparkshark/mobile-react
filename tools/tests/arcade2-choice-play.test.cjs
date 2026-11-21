'use strict';
/**
 * Arcade fix round 1, lane app-choice, P1 (Ride Parts bug 1, Nov 20, 2026): PLAY! plays the coin the guest picked.
 * Dustin: "we shouldn't suggest where they go it's their choice to play". The server's range answer names the first coin
 * within 16 m in its own order, so PLAY! played The Sword in the Stone next to Peter Pan's Flight, "Cars" next to
 * Radiator Springs Racers, Flight of the Hippogriff next to Forbidden Journey and The Theatre next to Courthouse Square.
 * Coin spots below are the scratch database's (tps_polish_1023, tasks.latitude/longitude).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const R = loadTs('src/components/guide/playRangeCheck.ts');
const C = loadTs('src/services/guide/guideCopy.ts');
const read = rel => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

const coin = (id, name, latitude, longitude) => ({ id, name, latitude: String(latitude), longitude: String(longitude) });
const PETER_PAN = coin(150, "Peter Pan's Flight", 33.8131949, -117.9188763);
const SWORD = coin(76, 'The Sword in the Stone', 33.813271, -117.918962);
const RSR = coin(156, 'Radiator Springs Racers', 33.8051965, -117.9187479);
const CARS = coin(141, 'Cars', 33.80523, -117.91861);
const FJ = coin(104, 'Forbidden Journey', 34.138123, -118.3536618);
const HIPPOGRIFF = coin(171, 'Flight of the Hippogriff', 34.1380891, -118.3537738);
const COURTHOUSE = coin(17, 'Courthouse Square', 34.138239, -118.353748);
const THEATRE = coin(18, 'The Theatre', 34.138249, -118.353738);
const MK_PETER_PAN = coin(92, "Peter Pan's Flight", 28.4202640272, -81.5818916811);
const EPIC_HIPPOGRIFF = coin(190, 'Flight of the Hippogriff', 28.472447, -81.4738336);
const EPIC_FJ = coin(47, 'Harry Potter and the Forbidden Journey', 28.472265, -81.4735195);

const mid = (a, b) => ({ latitude: (Number(a.latitude) + Number(b.latitude)) / 2, longitude: (Number(a.longitude) + Number(b.longitude)) / 2 });
const at = c => ({ latitude: Number(c.latitude), longitude: Number(c.longitude) });
const NONE = new Set();
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

const PAIRS = [
  ['Disneyland', PETER_PAN, SWORD],
  ['California Adventure', RSR, CARS],
  ['Hollywood', FJ, HIPPOGRIFF],
  ['Hollywood', COURTHOUSE, THEATRE],
];

test('P1: between two coins, the coin the guest tapped is the one PLAY! plays, whichever it is, at every named ride', () => {
  for (const [park, a, b] of PAIRS) {
    const here = mid(a, b);
    for (const [chosen, other] of [[a, b], [b, a]]) {
      const out = R.choosePlayCoin({ tasks: [other, chosen], here, failed: NONE, chosenIds: [chosen.id, null] });
      assert.equal(out.play?.id, chosen.id, `${park}: tapped ${chosen.name}, PLAY! must play it, not ${other.name}`);
      eq(out.choices, []);
    }
  }
});

test('P1: standing right on the other coin, the tapped coin still plays while it is in range (the guest chose it)', () => {
  const out = R.choosePlayCoin({ tasks: [SWORD, PETER_PAN], here: at(SWORD), failed: NONE, chosenIds: [PETER_PAN.id] });
  assert.equal(out.play?.id, PETER_PAN.id);
  const theatre = R.choosePlayCoin({ tasks: [THEATRE, COURTHOUSE], here: at(THEATRE), failed: NONE, chosenIds: [COURTHOUSE.id] });
  assert.equal(theatre.play?.id, COURTHOUSE.id);
});

test('P1: the tapped island wins over an older pick; a pick (NEAR ME, shelf, recap GO) plays when nothing is tapped', () => {
  const here = mid(PETER_PAN, SWORD);
  assert.equal(R.choosePlayCoin({ tasks: [PETER_PAN, SWORD], here, failed: NONE, chosenIds: [SWORD.id, PETER_PAN.id] }).play?.id, SWORD.id);
  assert.equal(R.choosePlayCoin({ tasks: [PETER_PAN, SWORD], here, failed: NONE, chosenIds: [null, PETER_PAN.id] }).play?.id, PETER_PAN.id);
  // A tap on a coin far away does not hide the pick that is here.
  assert.equal(R.choosePlayCoin({ tasks: [PETER_PAN, SWORD, RSR], here, failed: NONE, chosenIds: [RSR.id, SWORD.id] }).play?.id, SWORD.id);
});

test('P1: no tap and two or more coins in range: no PLAY! coin, "Which coin?" rows A to Z (no order that favours one)', () => {
  for (const [park, a, b] of PAIRS) {
    const out = R.choosePlayCoin({ tasks: [a, b], here: mid(a, b), failed: NONE, chosenIds: [null, null] });
    assert.equal(out.play, null, park);
    assert.equal(out.choices.length, 2, park);
    const names = out.choices.map(c => c.name);
    eq(names, [...names].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })), park);
  }
  // A pick far away does not choose for the guest here.
  const far = R.choosePlayCoin({ tasks: [PETER_PAN, SWORD, RSR], here: mid(PETER_PAN, SWORD), failed: NONE, chosenIds: [null, RSR.id] });
  assert.equal(far.play, null);
  assert.equal(far.choices.length, 2);
});

test('P1: one coin in range and nothing chosen, or none in range: today\'s rule (PLAY! follows the range answer)', () => {
  const one = R.choosePlayCoin({ tasks: [MK_PETER_PAN, EPIC_HIPPOGRIFF], here: at(MK_PETER_PAN), failed: NONE, chosenIds: [] });
  eq(one, { play: null, choices: [] });
  const none = R.choosePlayCoin({ tasks: [PETER_PAN], here: at(RSR), failed: NONE, chosenIds: [PETER_PAN.id] });
  eq(none, { play: null, choices: [] });
  eq(R.choosePlayCoin({ tasks: [PETER_PAN, SWORD], here: null, failed: NONE, chosenIds: [PETER_PAN.id] }), { play: null, choices: [] });
});

test('P1: the same at Magic Kingdom and Epic Universe (every park, one rule); a tapped coin out of range never plays', () => {
  const epicHere = mid(EPIC_FJ, EPIC_HIPPOGRIFF);
  const d = R.choosePlayCoin({ tasks: [EPIC_FJ, EPIC_HIPPOGRIFF], here: at(EPIC_HIPPOGRIFF), failed: NONE, chosenIds: [EPIC_FJ.id] });
  // Forbidden Journey's Epic coin is about 37 m from the Hippogriff: too far to play from there.
  assert.equal(d.play, null);
  assert.ok(epicHere);
  const mk = R.choosePlayCoin({ tasks: [MK_PETER_PAN], here: at(MK_PETER_PAN), failed: NONE, chosenIds: [MK_PETER_PAN.id] });
  assert.equal(mk.play?.id, MK_PETER_PAN.id);
});

test('P1: a coin that failed today is never the PLAY! coin or a row', () => {
  const here = mid(PETER_PAN, SWORD);
  const out = R.choosePlayCoin({ tasks: [PETER_PAN, SWORD], here, failed: new Set([PETER_PAN.id]), chosenIds: [PETER_PAN.id] });
  assert.equal(out.play, null);
  eq(out.choices, []);
});

test('P1: the top card asks "Which coin?" with PICK ONE, naming no ride, only when two or more are here', () => {
  const base = C.guideCardCopy('pick', null, { parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 3, freeStep: null,
    queueTicketsOn: false, adventureDots: null });
  const ask = C.whichCoinCopy(base, 'pick', 2, 'Disneyland');
  assert.equal(ask.title, 'Which coin?');
  assert.equal(ask.button.action, 'which_coin');
  assert.equal(ask.button.label, 'PICK ONE');
  assert.equal(ask.pointsAtPlay, false);
  assert.ok(!/Peter|Sword|Cars|Theatre/.test(JSON.stringify(ask)));
  assert.equal(C.whichCoinCopy(base, 'pick', 1, 'Disneyland'), base);
  for (const keep of ['claim', 'need_ticket', 'in_line', 'line_story', 'arrive', 'home', 'goodbye']) {
    assert.equal(C.whichCoinCopy(base, keep, 3, 'Disneyland'), base, keep);
  }
  assert.ok(!/—/.test(JSON.stringify(ask)));
});

test('P1 wiring: the map passes the tapped island and the pick into choosePlayCoin and asks with only the coins here', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /choosePlayCoin\(\{ tasks: visibleTasks, here: location, failed: failedTaskIds,\s*chosenIds: \[selectedTask\?\.id, guidePlan\] \}\)/);
  assert.match(explore, /case 'which_coin': setNearMe\(\{ canPlay: false, only: playChoiceIdsRef\.current \}\)/);
  assert.match(explore, /playChoices: playChoice\.choices\.length/);
  assert.match(read('src/components/guide/NearMeSheet.tsx'), /WHICH COIN\?/);
});

test('P1: the LinePlay recap GO on this ride\'s own coin makes it the guest\'s pick, so PLAY! plays it (never a neighbour)', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /if \(go\.kind === 'win_coin' && go\.taskId != null\) guide\.setTarget\(go\.taskId, 'lineplay_done'\);/);
  assert.doesNotMatch(screen, /setTarget\([^)]*'lineplay_recap'\)/);
});

test('P1: NEAR ME and "Which coin?" are hosted by CalmModal at the window\'s bottom edge (react-native-modal sat 116 pt low)', () => {
  const sheet = read('src/components/guide/NearMeSheet.tsx');
  assert.match(sheet, /<CalmModal visible=\{visible\}/);
  assert.doesNotMatch(sheet, /from 'react-native-modal'/);
});

test('P3: PLAY IN LINE only where there is a line: a show, fountain, walk-through or food cart offers none', () => {
  const ride = type => ({ rideId: 816, rideType: type });
  for (const none of ['show', 'walk_through', 'restaurant', 'transport', 'other']) {
    assert.equal(C.calloutLineOffer(ride(none), 265, 265, 'here'), null, none);
    assert.equal(C.lineRideType(none), false, none);
  }
  for (const line of ['attraction', 'coaster', 'dark_ride', 'flat_ride', 'water_ride']) {
    assert.equal(C.calloutLineOffer(ride(line), 66, 66, 'here').label, 'PLAY IN LINE', line);
  }
  // Today's catalog with no type: the offer stays as it was.
  assert.equal(C.calloutLineOffer({ rideId: 5 }, 66, 66, 'here').label, 'PLAY IN LINE');
  const times = read('src/screens/QueueTimesScreen.tsx');
  assert.match(times, /const canStartSession = queuePlayPolicy\(entry\.status\)\.canPlay && lineRideType\(rideType\);/);
  assert.match(times, /rideType=\{rideTypes\.get\(item\.name\) \?\? null\}/);
});

test('P5: the first Ride Part tip is one short line and never promises leveling a coin the guest has not won', () => {
  const H = loadTs('src/services/help/helpTopics.ts');
  assert.equal(H.firstPartTipBody(true), '+1 Part for this coin!');
  assert.equal(H.firstPartTipBody(false), 'Saved for this coin. Win it to use them.');
  assert.equal(H.firstPartTipBody(null), 'Saved for this coin. Win it to use them.');
  assert.doesNotMatch(H.TIP_COPY.first_ride_part.body, /Energy|level up/i);
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'), /body=\{firstPartTipBody\(coinOwned\)\} \/>/);
});

test('P14: an unwon slot wears the server\'s parts_waiting badge (S21); a missing field draws none', () => {
  const shelf = read('src/screens/ParkScreen.tsx');
  assert.match(shelf, /\{canChooseGoal && partsWaiting\(task\) > 0 && <View pointerEvents="none"/);
  assert.match(shelf, /Ride \$\{partsWaiting\(task\) === 1 \? 'Part' : 'Parts'\} saved for this coin\. Win it to use them\./);
  const M = loadTs('src/services/collection/shelfModel.ts');
  assert.equal(M.partsWaiting({ parts_waiting: 2 }), 2);
  assert.equal(M.partsWaiting({}), 0, 'today\'s server: no badge');
  assert.equal(M.partsWaiting({ parts_waiting: 0 }), 0, 'won: the Parts are the coin\'s own');
});

test('P11: Still in line while away for 4 more minutes ends the wait quietly; back in the line zone it never does', () => {
  const S = loadTs('src/services/lineplay/rideStep.ts');
  const zone = { latitude: 33.8121, longitude: -117.919, radiusMeters: 80 };
  const away = { latitude: 33.8121 + 300 / 111320, longitude: -117.919 };
  const inside = { latitude: 33.8121 + 20 / 111320, longitude: -117.919 };
  const at = 1_000_000;
  assert.equal(S.STILL_IN_LINE_AWAY_MS, 240_000);
  assert.equal(S.stillInLineTimedOut({ answeredAt: at, now: at + 239_000, here: away, zone }), false);
  assert.equal(S.stillInLineTimedOut({ answeredAt: at, now: at + 240_000, here: away, zone }), true);
  assert.equal(S.stillInLineTimedOut({ answeredAt: at, now: at + 600_000, here: inside, zone }), false, 'still in line for real');
  assert.equal(S.stillInLineTimedOut({ answeredAt: null, now: at + 600_000, here: away, zone }), false, 'nobody said Still in line');
  assert.equal(S.stillInLineTimedOut({ answeredAt: at, now: at + 600_000, here: null, zone }), false, 'no fix: never ends on a guess');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /if \(stillInLineTimedOut\(\{ answeredAt: stillInLineAt\.current, now: Date\.now\(\), here, zone \}\)\) \{\n\s+stillInLineAt\.current = null;\n\s+session\.beginEnding\(false, 'left_queue'\);/);
  // I left the line: no ride logged (endNow(false)), the Parts stay.
  assert.match(screen, /if \(state !== 'complete'\) void session\.endNow\(false\)\.catch\(finishFailed\);/);
});

test('app-tickets ask: the park day grant toast waits while PLAY! is up, so it never covers PLAY!\'s caption', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /<TicketGrantMoment calm=\{[^}]*&& !playRideShown\} \/>/);
});

test('app-tickets asks: the top card never says NEXT COIN; PLAY!\'s price never falls back to 1; Get Tickets SEE opens NEAR ME on I can play now', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /ticketCost=\{task\.ticket_cost \?\? tripGoalData\?\.wallet\.ticket_cost\}/);
  assert.doesNotMatch(explore, /ticketCost=\{[^}]*\?\? 1\}/);
  assert.match(explore, /setNearMe\(\{ canPlay: nearMeParam === 'can_play' \}\)/);
  const base = { parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 3, freeStep: null, queueTicketsOn: false, adventureDots: null };
  for (const state of ['pick', 'walk', 'here', 'resting', 'arrive', 'need_ticket', 'claim']) {
    const copy = C.guideCardCopy(state, state === 'walk' || state === 'here' ? { taskId: 1, name: 'Dumbo', source: 'callout', reason: 'picked', meters: 40 } : null, base);
    assert.doesNotMatch(`${copy.kicker} ${copy.title} ${copy.line ?? ''}`, /NEXT COIN|Next coin/i, state);
  }
});
