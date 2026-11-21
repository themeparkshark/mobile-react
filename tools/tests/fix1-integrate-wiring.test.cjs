// Integrator, fix pass 1 (Nov 20 2026): the one-file hand-offs the lanes left for each other.
const assert = require('node:assert/strict');
const test = require('node:test');
const { read } = require('./helpers/load-ts.cjs');

test('TK-pick-reachable: MAKE THIS MY PICK hides only when the coin is already the player\'s own plan', () => {
  const src = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(src, /canPick: taskType === 'task' && taskId != null && guide\.plan\(\) !== taskId,/);
  assert.doesNotMatch(src, /canPick:[^\n]*guideTarget/);
});

test('round-start: the coin card hands its began mark to the game\'s own GO', () => {
  const src = read('src/components/RedeemRedeemableModal.tsx');
  const at = src.indexOf('<MiniGameSelector');
  const end = src.indexOf('/>', at);
  assert.ok(at > 0 && /onRoundStart=\{sendBegan\}/.test(src.slice(at, end)), 'MiniGameSelector gets onRoundStart={sendBegan}');
});

test('get_tickets: the map top card opens the one coinless Get Tickets sheet, the alert only as a fallback', () => {
  const src = read('src/screens/ExploreScreen.tsx');
  const at = src.indexOf("case 'get_tickets':");
  const block = src.slice(at, src.indexOf('return;', src.indexOf('gameAlert(', at)));
  assert.match(block, /if \(openGetTickets\(\)\) return;\s+gameAlert\(/);
});

test('P2: shelf PLAY IN LINE opens the coin\'s own ride by coin id; Wait Times rows match by feed id', () => {
  const park = read('src/screens/ParkScreen.tsx');
  const open = park.slice(park.indexOf('const openRideLinePlay'), park.indexOf('const openCatalogRideLinePlay'));
  assert.match(open, /resolveCoinRideContext\(Number\(park\), task\)/);
  assert.doesNotMatch(open, /task\.name/);
  const queue = read('src/screens/QueueTimesScreen.tsx');
  assert.match(queue, /coinTasksByRideName\(selectedPark, rows\)/);
  assert.match(queue, /\.map\(\(\[id, name\]\) => \(\{ id, name \}\)\)/);
  assert.match(queue, /resolveWaitRowRideContext\(selectedPark, \{ id: entry\.id \?\? null, name: entry\.name \}/);
});

test('P9: the wait card\'s In line minutes are the counted seconds while Parts are tracked', () => {
  const src = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(src, /elapsedSeconds=\{rewards\.tracking \? clock\.verifiedEligibleSeconds : clock\.elapsedSeconds\}/);
});

test('P18: a top level coin is never the shelf LEVEL UP GOAL and its slot never says level it up', () => {
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /levelUpGoal\.getFor\(viewerId, id => topCoinIds\.has\(id\)\)/);
  assert.match(park, /Number\(task\.coin_level \?\? 0\) >= MAX_COIN_LEVEL/);
  const coin = read('src/components/TaskCoinModal.tsx');
  assert.match(coin, /shownLevel >= MAX_COIN_LEVEL \? `\$\{task\.name\} ride coin, \$\{coinLevelLabel\(shownLevel\)\}\. Top level\. View it`/);
});
