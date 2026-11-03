'use strict';
/**
 * Fix round after the first gate (Nov 2, 2026), items 16 to 18 of core-loop/FIX_ROUND_W1.md:
 * the words and small moments Dustin's walk of 4296c569 tripped on. Behavior checks on the pure
 * helpers each surface now reads; the string rules live in vocabulary.test.cjs so a retired word
 * cannot come back anywhere.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const words = loadTs('src/services/words/playerWords.ts');

test('item 16: the daily chest says Shark Coins, never "+25 coins"', () => {
  assert.equal(words.rewardWord('coins', 25), 'Shark Coins');
  assert.equal(words.rewardWord('coins', 1), 'Shark Coin');
  assert.equal(words.rewardWord('tickets', 1), 'Ticket');
  assert.equal(words.rewardWord('tickets', 3), 'Tickets');
  assert.equal(words.rewardWord('energy', 20), 'Energy');
  // The chest's label is this one word table (no second copy of the words inside the modal).
  const modal = read('src/components/DailyGiftModal.tsx');
  assert.match(modal, /export function prizeLabel\(kind: PrizeKind, amount: number\): string \{\n\s+return rewardWord\(kind, amount\);/);
  assert.doesNotMatch(modal, /many: 'coins'/);
});

test('item 16: Daily 3 at a park never asks for snacks or shows pass points', () => {
  const model = loadTs('src/services/retention/rewardsModel.ts');
  // The server's park catch goal: "Catch a ride coin / or find 2 snacks".
  const park = model.homeSideGoal({ key: 'catch', kind: 'catch', park: true, target: 2, title: 'Catch a ride coin', hint: 'or find 2 snacks' }, true);
  assert.equal(park.title, 'Catch a ride coin');
  assert.equal(park.hint, 'Any ride coin counts', 'treats only pop up at home: the park line says what counts here');
  // At home the same goal is the treat side.
  const home = model.homeSideGoal({ key: 'catch', kind: 'catch', park: true, target: 2, title: 'Catch a ride coin', hint: 'or find 2 snacks' }, false);
  assert.equal(home.title, 'Find 2 treats');
  // A home server goal is rewritten too ("Find 2 snacks / or catch a ride coin").
  const sent = model.homeSideGoal({ key: 'catch', kind: 'catch', park: false, target: 2, title: 'Find 2 snacks', hint: 'or catch a ride coin' }, false);
  assert.equal(sent.title, 'Find 2 treats');
  // Pass progress is in steps: no points on a goal row.
  const today = [{ event: 'ride_coin_win', points: 120 }, { event: 'home_find', points: 35 }];
  assert.equal(model.goalPassLine({ kind: 'catch', park: true, target: 1 }, today), 'Climbs your Shark Pass');
  assert.equal(model.goalPassLine({ kind: 'catch', park: false, target: 3 }, today), 'Each one climbs your Shark Pass');
});

test('item 16: server words become kid words, food words stay', () => {
  assert.equal(words.kidWords('or find 2 snacks'), 'or find 2 treats');
  assert.equal(words.kidWords('Grab 8 home finds'), 'Grab 8 treats');
  assert.equal(words.kidWords('Find 1 snack'), 'Find 1 treat');
  assert.equal(words.kidWords('3 more snacks'), '3 more treats');
  assert.equal(words.kidWords('Snack Stand'), 'Snack Stand', 'a place that sells snacks is food, not a pickup');
  assert.equal(words.kidWords('Win a ride coin'), 'Win a ride coin');
});

test('item 16: the Shark Pass shows steps, never points', () => {
  assert.equal(words.passGainWords(120, 400), 'Climbs your Shark Pass');
  assert.equal(words.passGainWords(400, 400), '+1 Shark Pass step');
  assert.equal(words.passGainWords(800, 400), '+2 Shark Pass steps');
  assert.equal(words.passGainWords(35, 400, true), 'Each one climbs your Shark Pass');
  assert.equal(words.passGainWords(0, 400), null);
  assert.equal(words.passSinceLine(120, 400), 'Your Shark Pass climbed since last time!');
  assert.equal(words.passSinceLine(400, 400), '+1 Shark Pass step since last time!');
  for (const file of ['src/screens/SharkPassScreen.tsx', 'src/components/money/SharkPassBanner.tsx', 'src/services/retention/rewardsModel.ts']) {
    assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /pass points/, file);
  }
});

test('item 16: the wait-ending dialog names the footer tab (the Map), never "Explore"', () => {
  assert.equal(words.tabWord('Explore'), 'the Map');
  assert.equal(words.tabWord('Leaderboard'), 'Standings');
  assert.equal(words.tabWord('Profile'), 'Profile');
  const line = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(line, /const tabLabel = tabWord;/);
  assert.match(line, /`Your recap opens first, then \$\{tabLabel\(waitEndPrompt\.tab\)\}\./);
  assert.match(line, /`Continue to \$\{tabLabel\(tabAfterRecap\.current\)\}`/);
});

test('item 16: Wait Times says SKIP LINE (not "LL"), the Ride Journal says Likely or Maybe (not "Med"), help says one game', () => {
  const waits = read('src/screens/QueueTimesScreen.tsx');
  assert.match(waits, /const RETURN_TIME_WORD = 'SKIP LINE';/);
  assert.match(waits, /<Text style=\{styles\.llText\}>\{RETURN_TIME_WORD\}<\/Text>/);
  const journal = read('src/screens/RideTracker/RideBatchConfirmScreen.tsx');
  assert.match(journal, /high: 'Likely', medium: 'Maybe', low: 'Not sure'/);
  assert.doesNotMatch(journal, /colors\.error/, 'a guess the app is not sure of is never red');
  assert.match(journal, /\{time\} • about \{dwellMin\} min/, 'the app font draws ~ like a minus: never "-10 min"');
  assert.match(read('src/services/help/helpSheets.ts'), /One Ticket, one game\./);
  assert.match(read('src/services/help/helpTopics.ts'), /One Ticket plays one game\./);
});

test('item 16: "This ride\'s game" only where the server deals one game per ride and day', () => {
  const copy = loadTs('src/components/rewards/challengeCopy.ts');
  assert.equal(copy.punchLines('Mr. Lincoln').kicker, 'YOUR GAME');
  assert.equal(copy.punchLines('Mr. Lincoln', true).kicker, "THIS RIDE'S GAME");
  assert.match(read('src/components/TicketPunch.tsx'), /accessibilityLabel=\{`\$\{kicker\.charAt\(0\)\}/, 'VoiceOver reads the same words');
});

test('items 16 and 17: the win card counts coins and wins apart, and the win that reaches a trophy is its moment', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts');
  const shelf = collected => ({ milestones: [], progress: { park_id: 8, park_name: 'Disneyland', before: collected - 1, collected, available: 35 }, next: null });
  assert.equal(win.winShelfLine(shelf(10), null, true, 11).text, '10 of 35 coins. 1 more win for Bronze');
  const moment = win.winShelfLine(shelf(12), null, true, 12);
  assert.equal(moment.text, 'Bronze trophy! 12 wins here');
  assert.equal(moment.trophy.name, 'Bronze');
  assert.equal(win.winShelfLine(shelf(12), null, true, null).text, '12 of 35 coins', 'wins unknown: never a trophy number beside a coin count');
  // The trophy table is the shelf's own (one truth for the card and the shelf).
  const model = loadTs('src/services/collection/shelfModel.ts');
  assert.equal(win.TROPHY_STEPS.map(t => `${t.name}:${t.at}`).join(), model.TROPHIES.map(t => `${t.name}:${t.at}`).join());
  // The milestone body counts the shelf's coins (rides and sights), so it says coins.
  const pct = win.milestoneHeadline({ milestones: [{ type: 'park_percent', percent: 25 }], progress: { park_id: 8, park_name: 'Disneyland', before: 8, collected: 9, available: 35 }, next: null });
  assert.equal(pct.body, '9 of 35 coins collected.');
});

test('item 17: the shelf\'s trophies stand in size order and the coin guide names the shelf\'s next coin', () => {
  const park = read('src/screens/ParkScreen.tsx');
  const at = name => park.indexOf(`{ name: '${name}', image: ${name.toLowerCase()}, at:`);
  assert.ok(at('Bronze') > 0 && at('Bronze') < at('Silver') && at('Silver') < at('Gold'), 'Bronze 12, Silver 50, Gold 100, left to right');
  const model = loadTs('src/services/collection/shelfModel.ts');
  const base = { levelUpId: null, guideId: null, guideOverGoal: false, goalId: null, goalReportedDown: false, alternateId: null, nearbyId: null, nearbyReportedOpen: false };
  // The walk: the top said Frontierland (the guide's coin) while the guide row said Jungle Cruise (the nearby pick).
  assert.deepEqual({ ...model.directoryNextCoin({ ...base, guideId: 40, guideOverGoal: true, nearbyId: 41, nearbyReportedOpen: true }) },
    { goalTaskId: 40, nearbyRideId: undefined, nearbyReportedOpen: false });
  assert.deepEqual({ ...model.directoryNextCoin({ ...base, levelUpId: 7, guideId: 40 }) }, { goalTaskId: 7, nearbyRideId: undefined, nearbyReportedOpen: false });
  assert.deepEqual({ ...model.directoryNextCoin({ ...base, goalId: 9, goalReportedDown: true, alternateId: 12 }) },
    { goalTaskId: 9, nearbyRideId: 12, nearbyReportedOpen: true }, 'a goal reported down names the open ride beside it, as the card does');
  assert.deepEqual({ ...model.directoryNextCoin({ ...base, nearbyId: 41, nearbyReportedOpen: true }) },
    { goalTaskId: undefined, nearbyRideId: 41, nearbyReportedOpen: true });
  assert.match(park, /goalTaskId=\{directoryNext\.goalTaskId\}\n\s+nearbyRideId=\{directoryNext\.nearbyRideId\}/);
});

test('item 17: at home the guide says which coin can level up now, and LEVEL UP opens it', () => {
  const guideCopy = loadTs('src/services/guide/guideCopy.ts');
  const ctx = { parkName: 'Disneyland', ridesResting: false, allOwned: false, tickets: 2, freeStep: null, queueTicketsOn: false, adventureDots: null, treatsToTicket: 2 };
  const ready = guideCopy.guideCardCopy('home', null, { ...ctx, levelUpName: "Roger Rabbit's Car Toon Spin" });
  assert.equal(ready.title, "Level up Roger Rabbit's Car Toon Spin!");
  assert.equal(ready.button.action, 'level_up');
  assert.equal(ready.button.label, 'LEVEL UP');
  assert.match(ready.line, /2 more treats = 1 Ticket/, 'the ticket meter stays');
  assert.ok(ready.line.length <= 56, `two lines on the card: ${ready.line}`);
  assert.match(read('src/screens/ExploreScreen.tsx'), /planCoinUrl: \(homeLevelUp \? homeLevelUp\.coin_url : homePlan\?\.coin_url\) \|\| null,/, 'the card wears that coin');
  assert.equal(guideCopy.guideCardCopy('home', null, ctx).button.action, 'plan', 'nothing ready: the plan card as before');
  const coins = loadTs('src/context/CoinCollection.tsx', {
    react: { useCallback: f => f, useEffect() {}, useState: v => [v, () => {}] },
    '../api/endpoints/me/ride-coins': { default: async () => ({ data: [] }) },
    '../api/endpoints/me/ride-coins/show': { default: async () => ({ data: null }) },
  });
  const coin = (id, parts, need, energyNeed, extra = {}) => ({ id, ride_name: `Ride ${id}`, park_id: 8, is_unlocked: true, current_level: 1, max_level: 5,
    available_parts: parts, parts_to_next_level: need, energy_to_next_level: energyNeed, ...extra });
  assert.equal(coins.homeLevelUpCoin([coin(1, 1, 2, 10), coin(2, 3, 3, 10), coin(3, 2, 2, 10)], 100).id, 3, 'the closest ready coin first');
  assert.equal(coins.homeLevelUpCoin([coin(1, 2, 2, 50)], 20), null, 'not enough Energy: nothing to say');
  assert.equal(coins.homeLevelUpCoin([coin(1, 2, 2, 10, { park_id: null })], 20), null, 'no park to open it on');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /useCoinCollection\(!park && coinLevelsRung\.open \? player\?\.id : null\)/, 'only at home, only after coin levels unlock');
  assert.match(explore, /if \(action === 'level_up' && homeLevelUp\?\.park_id\) \{\n\s+RootNavigation\.navigate\('Park', \{ park: homeLevelUp\.park_id, player: player\.id, focusCoin: \{ assetId: homeLevelUp\.id \} \}\);/);
});

test('item 18: Whack and Memory on a ride coin have no counting-down number, no OVERTIME ribbon and no orange rope', () => {
  const final = read('src/gamekit/fx/FinalSeconds.tsx');
  assert.match(final, /\{count \? <Group opacity=\{ringOpacity\}>/, 'the closing ring only with count');
  assert.match(final, /\{font && count \? \(/, 'the 5-4-3 numbers only with count');
  assert.match(read('src/gamekit/GameShellV2.tsx'), /count=\{finalCount\}/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /finalCount=\{!ride\}/);
  assert.match(read('src/games/whack/render/WhackBoard.tsx'), /\{fontM && !hud\.ride \? <Text x=\{timerTextX\}/, 'the ring drains with no number on a ride');
  const memory = read('src/games/memory/MemoryGame.tsx');
  assert.match(memory, /const calmClock = flags\.overtime === 'look';/);
  assert.match(memory, /if \(!calmClockRef\.current\) awning\.current\?\.ribbon\(/);
  assert.match(memory, /rope\.urgent\.value = e\.overtime && !calmClockRef\.current \? 1 : 0;/);
  assert.match(memory, /seconds=\{flags\.clock !== 'none' && !calmClock \? hud\.seconds : null\}/);
  assert.match(memory, /finalCount=\{!calmClock\}/);
  // The games stay exciting: the drumroll sounds and the music turn stay.
  assert.match(memory, /GameAudio\.play\('mm_overtime_hit'\);/);
  assert.match(memory, /GameAudio\.play\('mm_clock_tick'\);/);
  const engine = loadTs('src/games/memory/engine.ts', {}, {});
  assert.equal(engine.MODE_FLAGS.ride.overtime, 'look', 'a paid ride coin is the calm clock');
  assert.equal(engine.MODE_FLAGS.timeAttack.overtime, 'x2', 'Time Attack keeps its x2 Overtime (it changes the score)');
});
