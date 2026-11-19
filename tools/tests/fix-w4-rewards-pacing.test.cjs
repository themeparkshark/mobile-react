'use strict';
/* Fix pass w4, lane rewards-pacing: new things arrive one at a time, each with a moment. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

/* T097: coin levels, Energy and Ride Parts wait for rung 3. */
test('T097 the first wins name coins, Tickets and XP only; Parts and Energy fly to the Shelf with no chip', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => false } });
  const row = input => [...win.winRewardChips(input)].map(c => c.label);
  const firstWin = { coins: 10, tickets: 1, parts: 1, energy: 10, xp: 25, lineParts: 1, coinLevelsOpen: false, dailyOpen: false };
  assert.deepEqual(row(firstWin), ['Shark Coins', 'Ticket', 'XP']);
  assert.equal(win.silentParts(firstWin), 2);
  assert.equal(win.silentEnergy(firstWin), 10);
  assert.deepEqual(row({ ...firstWin, coinLevelsOpen: true }), ['Shark Coins', 'Ticket', 'Ride Parts', 'Energy', 'XP']);
  const card = read('src/components/PostWinRewardsModal.tsx');
  assert.match(card, /if \(quietParts > 0\) fly\(FLY_ART\.parts, Math\.min\(quietParts, 3\), WIN_FLY_ROUTES\.parts\);/);
});

test('T097 the win that opens coin levels teaches them in one pictured line, only while the rung is new', () => {
  const win = loadTs('src/components/rewards/postWinModel.ts', { '../../services/lineplay/rideLines': { taskHasLine: () => false } });
  const line = win.coinLevelsIntro({ rungNew: true, parts: 1, energy: 10 });
  assert.match(line, /^\[icon:parts\] \[icon:energy\] /);
  assert.ok(line.replace(/\[icon:[a-z]+\] /g, '').split(' ').length <= 8, 'one short line');
  assert.equal(win.coinLevelsIntro({ rungNew: false, parts: 1, energy: 10 }), null);
  assert.equal(win.coinLevelsIntro({ rungNew: true, parts: 0, energy: 0 }), null, 'nothing to point at, no lesson');
  assert.match(read('src/components/PostWinRewardsModal.tsx'), /if \(levelsIntro\) coinLevelsRung\.markSeen\(\);/);
});

test('T097 before rung 3 the shelf shows no Level up button and your coin opens its simple card', () => {
  const arrival = read('src/components/CoinShelfArrival.tsx');
  assert.match(arrival, /const levelsOpen = useRung\('coin_levels'\)\.open;/);
  assert.match(arrival, /\{levelsOpen && <Pressable accessibilityRole="button" accessibilityLabel="Level up this coin"/);
  const coin = read('src/components/TaskCoinModal.tsx');
  assert.match(coin, /const simpleCard = readOnly \|\| coinUnavailable \|\| !levelsOpen;/);
  assert.match(coin, /\{simpleCard \? <Modal/);
  const book = read('src/screens/SetCollection/BookParts.tsx');
  assert.match(book, /\(levelsOpen \|\| chip\.icon !== 'energy'\)/);
  assert.doesNotMatch(book, /prizeChips\(reward\)\.filter\(chip => chip\.icon !== 'crown'\)\.map/, 'every prize list goes through useShownPrizes');
});
