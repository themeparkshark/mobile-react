const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

// QA P2-6: Park Coins said "Nobody has earned coins at this park yet" right
// after a Disneyland win. Besides the server board, the tab kept its board
// from before the win in a module cache for the whole app session.
test('a won coin makes the Park Coins tab fetch a fresh board', async () => {
  const standingsCache = loadTs('src/screens/LeaderboardsScreen/standingsCache.ts');
  const model = loadTs('src/screens/LeaderboardsScreen/standingsModel.ts', { dayjs: require(path.join(__dirname, '../../node_modules/dayjs')) });
  let board = [], fetches = 0;
  const stubs = {
    '../../api/endpoints/parks/allParks': { default: async () => [{ id: 8, name: 'Disneyland' }] },
    '../../api/endpoints/parks/leaderboards/get': { default: async () => [{ id: 1, name: 'Today' }] },
    '../../api/endpoints/leaderboards/players': { default: async () => { fetches++; return board; } },
    '../../context/AuthProvider': { AuthContext: { value: { player: { id: 10, current_park_id: 8 } } } },
    '../../context/LocationProvider': { LocationContext: { value: { park: { id: 8 } } }, LocationStatusContext: { value: { park: { id: 8 } } } },
    './standingsModel': model,
    './standingsCache': standingsCache,
  };
  let view;
  const open = async () => {
    if (view) view.remount();
    else view = runtime('src/screens/LeaderboardsScreen/ParkCoins.tsx', stubs, {});
    for (let i = 0; i < 4; i++) await view.settle();
    return view;
  };
  await open();
  assert.equal(fetches, 1, 'empty board before the win');
  await open();
  assert.equal(fetches, 1, 'tab switches reuse the cached board');
  board = [{ id: 10, screen_name: 'QAPlay930', park_coins: 1 }];
  standingsCache.markStandingsStale();
  await open();
  assert.equal(fetches, 2, 'after a win the board is fetched again');
});

test('the ride challenge win marks standings stale', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/RedeemRedeemableModal.tsx'), 'utf8');
  const win = src.slice(src.indexOf("onTaskCompleted?.(attempt.task_id"), src.indexOf("setFlowState('postwin');"));
  assert.match(win, /markStandingsStale\(\);/);
  const xp = fs.readFileSync(path.join(__dirname, '../../src/screens/LeaderboardsScreen/Experience.tsx'), 'utf8');
  assert.match(xp, /cache\.generation === standingsGeneration\(\)/);
});
