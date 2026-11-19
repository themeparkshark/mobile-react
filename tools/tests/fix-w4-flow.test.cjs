// Fix pass w4, lane flow: the cards around the games (win card, loss card, team step, boss sheet, Games sheet).
// Pure rules run for real; wiring is checked in the source where React cannot run here.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

const win = loadTs('src/components/rewards/postWinModel.ts');
const team = loadTs('src/components/rewards/winTeamModel.ts');
const join = loadTs('src/components/boss/joinModel.ts');
const arcade = loadTs('src/services/lineplay/presentation.ts');

/* N08: a chip shows its real number from its first frame, never "+0". */
test('N08 a reward chip shows its real amount, and its pop lands after the chip has settled', () => {
  assert.equal(win.chipAmountText(10), 10);
  assert.equal(win.chipAmountText(2.7), 2);
  assert.equal(win.chipAmountText(0), 0);
  assert.equal(win.chipAmountText(Number.NaN), 0);
  const first = win.chipLandMs(0), second = win.chipLandMs(1);
  assert.ok(first > 200 && first < 400, `first chip lands at ${first} ms`);
  assert.ok(second > first, 'each later chip lands after the one before it');
  assert.ok(win.chipLandMs(9) <= 900, 'never after the entrance clock ends');
});

test('N08 the win card and the boss win card never count a chip up from 0', () => {
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.doesNotMatch(card, /function CountUp\(/, 'the win card has no count-up from 0');
  assert.doesNotMatch(card, /useState\(reduced \? value : 0\)/);
  assert.match(card, /chipAmountText\(value\)/);
  const boss = read('src/components/boss/BossWinCard.tsx');
  assert.doesNotMatch(boss, /useState\(reduced \? to : 0\)/, 'the boss loot chips have no count-up from 0');
  assert.match(boss, /chipAmountText\(to\)/);
});

/* T054: the trophy line says what a trophy is. */
test('T054 the trophy line carries a one-line explainer that names the trophy and its wins', () => {
  assert.equal(win.trophyExplainLine(1), '12 wins here put a Bronze trophy on your shelf.');
  assert.equal(win.trophyExplainLine(20), '50 wins here put a Silver trophy on your shelf.');
  assert.equal(win.trophyExplainLine(150), null);
  assert.equal(win.trophyExplainLine(null), null);
  const milestones = { progress: { collected: 1, available: 35 } };
  const line = plain(win.winShelfLine(milestones, null, true, 1));
  assert.equal(line.sub, 'Bronze trophy: 11 more wins');
  assert.deepEqual(line.explain, { line: '12 wins here put a Bronze trophy on your shelf.', replaces: 'sub' });
  const repeat = plain(win.winShelfLine(null, null, false, 3));
  assert.equal(repeat.explain.replaces, 'text');
  // A trophy won right now is its own moment, no explainer swap.
  const earned = plain(win.winShelfLine(milestones, null, true, 12));
  assert.equal(earned.explain, undefined);
});

test('T054 the card shows the explainer the first time and a tap swaps it', () => {
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.match(card, /trophyExplained\(player\?\.id\)/);
  assert.match(card, /markTrophyExplained\(player\?\.id\)/);
  assert.match(card, /setTrophyHelp\(on => !on\)/);
});

/* T194: the first coin counts for the team picked right after it, and the app says so. */
test('T194 the join answer credit turns into one line; no credit keeps today\'s words', () => {
  assert.equal(team.teamCreditLine([{ ride_name: 'Mr. Lincoln', points: 15, team: 'globe', first: true }], 'Team Green'),
    'Your Mr. Lincoln coin counts for Team Green too!');
  assert.equal(team.teamCreditLine([{ ride_name: 'A', points: 15 }, { ride_name: 'B', points: 10 }], 'Team Gold'),
    'Your 2 coins from today count for Team Gold too!');
  assert.equal(team.teamCreditLine([{ ride_name: '', points: 10 }], 'Team Shark'), 'Your coin from today counts for Team Shark too!');
  assert.equal(team.teamCreditLine(undefined, 'Team Shark'), null);
  assert.equal(team.teamCreditLine([], 'Team Shark'), null);
  assert.equal(team.teamCreditLine([{ ride_name: 'A', points: 0 }], 'Team Shark'), null);
});

test('T194 both join places read ride_control_credit', () => {
  assert.match(read('src/components/rewards/WinTeamStep.tsx'), /teamCreditLine\(answer\?\.ride_control_credit/);
  assert.match(read('src/screens/GymBattle/TeamSelectionScreen.tsx'), /teamCreditLine\(answer\?\.ride_control_credit/);
});

/* T203: the boss sheet says why the boss is at this ride. */
test('T203 the line under the boss title is the server why line, else "at <ride>"', () => {
  assert.equal(join.bossWhereLine({ ride_name: 'Dumbo', why: 'The Kraken crawled out of the water to cause trouble at Dumbo.' }),
    'The Kraken crawled out of the water to cause trouble at Dumbo.');
  assert.equal(join.bossWhereLine({ ride_name: 'Dumbo', why: '  ' }), 'at Dumbo');
  assert.equal(join.bossWhereLine({ ride_name: null }), 'at the park');
  assert.match(read('src/components/boss/BossJoinCard.tsx'), /bossWhereLine\(raid\)/);
});

/* T031: Parade Beat is in the LinePlay Games sheet. */
test('T031 the Games sheet always offers Parade Beat, once, and its tile plays without a page', () => {
  const pageChoices = [{ id: 'mg-0', gameId: 'tap', index: 2, completed: false }];
  const make = (gameId, index, completed) => ({ id: `arcade-${gameId}`, gameId, index, completed });
  const tiles = plain(arcade.queueArcadeWithExtras(pageChoices, new Set(), make));
  assert.deepEqual(tiles.map(tile => tile.gameId), ['tap', 'timing']);
  assert.ok(tiles[1].index <= arcade.ARCADE_EXTRA_INDEX);
  // Already a page (an old checkpoint): never twice.
  const both = plain(arcade.queueArcadeWithExtras([...pageChoices, { id: 'mg-9', gameId: 'timing', index: 5, completed: false }], new Set(), make));
  assert.equal(both.filter(tile => tile.gameId === 'timing').length, 1);
  assert.deepEqual(plain(arcade.arcadeExtraItem(tiles[1].index, 42)), { kind: 'minigame', id: 'arcade-timing', gameId: 'timing', seed: 42 });
  assert.equal(arcade.arcadeExtraItem(2, 42), null);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.equal((screen.match(/onChoose=\{chooseArcade\}/g) ?? []).length, 2, 'both Games sheets use the same chooser');
});
