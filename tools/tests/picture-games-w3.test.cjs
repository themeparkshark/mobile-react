'use strict';
/**
 * Fix round w3 (lane play): the picture-games logic, app side.
 *   T223 / T038  Family with kids turns Picture games on (never over a grown-up's own choice).
 *   T027  the attempt's kid rules reach Whack-a-Shark and Memory Match.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const memoryStore = () => {
  const data = new Map();
  return {
    data,
    getItem: async key => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => { data.set(key, String(value)); },
    removeItem: async key => { data.delete(key); },
  };
};
const loadPrefs = (store) => loadTs('src/services/playPrefs.ts', {
  react: { useCallback: f => f, useEffect() {}, useSyncExternalStore: (_s, get) => get() },
  '@react-native-async-storage/async-storage': { __esModule: true, default: store },
  '../api/endpoints/platform/feature-flags': { __esModule: true, default: async () => ({ flags: { picture_games: true } }) },
});

test('T223: a family crew with a kid turns Picture games on; a grown-up\'s own choice always wins', async () => {
  const store = memoryStore();
  const prefs = loadPrefs(store);
  assert.equal(prefs.crewWantsPictureGames({ kind: 'family', players: [{ kid: false }, { kid: true }] }), true);
  assert.equal(prefs.crewWantsPictureGames({ kind: 'family', players: [{ kid: false }, { kid: false }] }), false);
  assert.equal(prefs.crewWantsPictureGames({ kind: 'friends', players: [{ kid: true }] }), false);
  assert.equal(await prefs.defaultPictureGamesOn(7), true);
  assert.equal(await prefs.pictureOnlyFor(7), true);
  assert.equal(JSON.parse(store.data.get('tps.playPrefs.v1@p7')).pictureChosen, undefined, 'a default is not a choice');
  // A grown-up switched it off in Settings: the family default never turns it back on.
  await prefs.setPlayPrefs(8, { pictureOnly: false, pictureChosen: true });
  assert.equal(await prefs.defaultPictureGamesOn(8), false);
  assert.equal(await prefs.pictureOnlyFor(8), false);
  assert.deepEqual({ ...prefs.parsePlayPrefs('{"pictureOnly":false,"pictureChosen":true}') }, { pictureOnly: false, pictureChosen: true });
});

test('T223: the crew sheet applies the default on both doors (new crew and same crew); the toggles mark a choice', () => {
  const sheet = fs.readFileSync('src/screens/LinePlay/group/WhosInLineSheet.tsx', 'utf8');
  assert.equal((sheet.match(/if \(crewWantsPictureGames\((group|lastCrew)\)\) void defaultPictureGamesOn\(player\?\.id \?\? null\)/g) ?? []).length, 2);
  const prefs = fs.readFileSync('src/services/playPrefs.ts', 'utf8');
  assert.match(prefs, /setPlayPrefs\(playerId, \{ pictureOnly: on, pictureChosen: true \}\)/);
});

test('T027: the attempt\'s kid rules reach the ride games', () => {
  const attempts = loadTs('src/api/endpoints/me/task-attempts.ts', {
    '../../client': { __esModule: true, default: {} },
  });
  assert.equal(attempts.kidRulesFor({ rules: { kid: true } }, false), true, 'the server says kid');
  assert.equal(attempts.kidRulesFor({ rules: { kid: false } }, true), false, 'the server says not kid');
  assert.equal(attempts.kidRulesFor({}, true), true, 'an older server: the picture-only ask');
  const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  assert.match(modal, /kid=\{kidRulesFor\(attemptRef\.current, pictureOnlyRef\.current\)\}/);
  const selector = fs.readFileSync('src/components/MiniGameSelector.tsx', 'utf8');
  assert.equal((selector.match(/kid=\{kid && rewardMode === 'task-attempt'\}/g) ?? []).length, 2, 'Whack and Memory');
  const memory = fs.readFileSync('src/games/memory/MemoryGame.tsx', 'utf8');
  assert.match(memory, /const pairs = kidRef\.current \? RIDE_KID_PAIRS : 8;/);
  assert.match(memory, /export const RIDE_KID_PAIRS = 6;/);
});

test('T061: every results next-star bar shows the next star\'s score under the star (Sharky, Whack, Memory share it)', () => {
  const bar = fs.readFileSync('src/gamekit/results/NextStarBar.tsx', 'utf8');
  assert.match(bar, /\{goal\.nextStar && \(goal\.target \?\? 0\) > 0 \? \(/);
  assert.match(bar, /\{countText\(goal\.target \?\? 0\)\}/);
  const scoring = loadTs('src/gamekit/core/scoring.ts');
  const goal = scoring.nextStarGoal(4206, { one: 2500, two: 6000, three: 11000 });
  assert.equal(goal.target, 6000, 'Sharky 4206: next star at 6000');
  const sharky = fs.readFileSync('src/games/sharky/hud/SharkyResults.tsx', 'utf8');
  assert.match(sharky, /nextStarGoal\(data\.score, data\.thresholds\)/, 'Sharky passes the full goal, target included');
});
