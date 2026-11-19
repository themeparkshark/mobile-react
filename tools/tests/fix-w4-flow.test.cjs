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
    'Your Mr. Lincoln coin counts for Team Green!');
  assert.equal(team.teamCreditLine([{ ride_name: 'A', points: 15 }, { ride_name: 'B', points: 10 }], 'Team Gold'),
    'Your 2 coins from today count for Team Gold!');
  assert.equal(team.teamCreditLine([{ ride_name: '', points: 10 }], 'Team Shark'), 'Your coin from today counts for Team Shark!');
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

/* T037: one coin moment: the card is already under the catch when its coin leaves. */
test('T037 the win card comes up under the leaving catch, and the reveal never asks for a tap', () => {
  const reveal = read('src/components/CoinCatchReveal.tsx');
  assert.match(reveal, /const exit = \(\) => \{\n\s+callbacks\.current\.onExit\?\.\(\);/, 'the catch says when its coin starts to leave');
  assert.doesNotMatch(reveal, />Tap to continue</, 'no Tap to continue line: the reveal flows on by itself');
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.match(card, /onExit=\{\(\) => setUnder\(true\)\}/);
  assert.match(card, /const shown = caught \|\| under;/);
  assert.match(card, /opacity: shown \? 1 : 0/, 'the card shows under the leaving coin, not only after the catch is gone');
  assert.match(card, /onBurst=\{measureHero\}/, 'the hero slot is measured fresh before the coin flies to it');
});

test('T037 the win\'s own Energy line folds into the held win card; Energy news from anything else still shows', () => {
  const B = loadTs('src/api/broadcastFilter.ts');
  B.resetBroadcastHoldForTests();
  const shown = [];
  const show = m => shown.push(...m);
  B.holdBroadcasts(true);
  B.routeBroadcasts(['You gained 10 Energy!', 'You earned 10 XP!', 'Level 2 unlocked!'], show);
  B.foldHeldXp();
  B.holdBroadcasts(false);
  assert.deepEqual(plain(shown), ['Level 2 unlocked!'], 'the win card already showed (or flew) this win\'s Energy');
  B.routeBroadcasts(['You gained 20 Energy!'], show);
  assert.equal(shown.at(-1), 'You gained 20 Energy!', 'outside a win card nothing is folded');
});

/* T039: the card says what a Ticket buys before PLAY. */
test('T039 the server deal turns into shells on the card; no deal keeps the card as today', () => {
  const card = loadTs('src/components/rewards/coinCardModel.ts');
  assert.deepEqual(plain(card.dealTries({ game: 'memory', tries_per_ticket: 3 })), { shells: 3, label: '1 Ticket = 3 tries at Memory Match' });
  assert.deepEqual(plain(card.dealTries({ game: 'tap', tries_per_ticket: 1 })), { shells: 1, label: '1 Ticket = 1 try at Whack-a-Shark' });
  assert.equal(card.dealTries({ game: 'trivia', tries_per_ticket: 1 }).label, '1 Ticket = 1 try at Beat the Buzzer');
  assert.equal(card.dealTries({ tries_per_ticket: 9 }).shells, 5, 'never more than five shells');
  assert.equal(card.dealTries(null), null);
  assert.equal(card.dealTries({ game: 'tap', tries_per_ticket: 0 }), null);
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /dealTries\(redeemable\?\.deal\)/);
  assert.match(read('src/api/endpoints/me/current-redeemable.ts'), /picture_only: 1/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /currentRedeemable\(point\.latitude, point\.longitude, \{ pictureOnly \}\)/);
});

/* T070: the line Part on the win card. */
test('T070 Parts the line already paid get their own quiet chip that never flies again', () => {
  const chips = plain(win.winRewardChips({ coins: 10, tickets: 0, parts: 1, energy: 0, xp: 0, coinLevelsOpen: true, lineParts: 2 }));
  assert.deepEqual(chips.map(c => [c.label, c.amount]), [['Shark Coins', 10], ['Ride Part', 1], ['From your line', 2]]);
  assert.equal(chips[2].noFly, true);
  assert.equal(plain(win.winRewardChips({ coins: 10, tickets: 0, parts: 1, energy: 0, xp: 0, coinLevelsOpen: true })).length, 2);
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /setLinePartsEarned\(Number\(attempt\.rewards\.line_parts\)/);
  assert.match(modal, /lineParts=\{linePartsEarned\}/);
  assert.match(read('src/components/PostWinRewardsModal.tsx'), /if \(chip\.noFly\) continue;/);
});

test('T039 the shell art the coin card requires exists', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  const rel = modal.match(/const SHELL_ART = require\('([^']+)'\)/)[1];
  assert.ok(fs.existsSync(path.join(root, 'src/components', rel)), rel);
});

test('T194 the credited coin is named like every other screen names it', () => {
  const api = read('src/api/endpoints/gym-battle/index.ts');
  assert.match(api, /ride_control_credit: withPlainField\(data\.ride_control_credit, 'ride_name'\)/);
  const names = loadTs('src/helpers/plainRideName.ts');
  assert.equal(names.plainRideName('Tiki Room'), 'Enchanted Tiki Room');
});
