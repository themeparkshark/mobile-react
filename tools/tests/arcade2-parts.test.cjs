'use strict';
/**
 * Ride Parts fixes, lane app-parts (Nov 20, 2026): the words for the server's line answers, the level sheet,
 * and the ride challenge's round start (RIDE_PARTS_BUGS 5, 12, 13, 15, 16, 17, 19, 20, 22).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const status = loadTs('src/services/lineplay/lineStatus.ts');
const calm = status.CALM_LINE_STATUS;
const words = (over, caps = {}) => status.lineStatusWords({ ...calm, ...over },
  { atDailyCap: false, atSessionCap: false, ticketAvailable: null, ...caps });

test('P4, P7, P10: every server line answer has kid words; a calm wait keeps the card own words', () => {
  assert.equal(words({}), null);
  assert.deepEqual({ ...words({ rideResting: true }) },
    { headline: 'This ride is resting right now.', subline: 'Its coin waits for you.' });
  assert.deepEqual({ ...words({ coinAtTop: true }) },
    { headline: 'This coin is at its top look.', subline: 'Your wait still earns a Ticket.' });
  assert.equal(words({ coinAtTop: true }, { ticketAvailable: false }).subline, 'Play the games while you wait.',
    'never promise a Ticket the server says is used up');
  assert.equal(`${words({}, { atDailyCap: true }).headline} ${words({}, { atDailyCap: true }).subline}`,
    'That’s all the Parts from this ride today. More tomorrow!');
  assert.equal(words({ closedGap: true }).headline, 'Keep the app open to keep earning');
  // No "Max Parts reached" anywhere a child reads it.
  assert.doesNotMatch(JSON.stringify(status.LINE_WORDS), /Max Parts/);
});

test('P12: "Win it on your way out" only when the map will offer PLAY', () => {
  const playable = input => status.coinPlayableNow({ coinMissing: true, status: calm, ...input });
  assert.equal(playable({}), true);
  assert.equal(playable({ status: { ...calm, rideResting: true } }), false, 'a closed ride');
  assert.equal(playable({ lineRewardsReady: false }), false, 'a ride that is down');
  assert.equal(playable({ leftLine: true }), false, 'after I left the line');
  assert.equal(playable({ status: { ...calm, movedToAnotherLine: true } }), false);
  assert.equal(status.coinPlayableNow({ coinMissing: false, status: calm }), false, 'a won coin');
  assert.equal(status.savedPartsLine(false), 'Its Parts are saved in its slot.');
  const recap = fs.readFileSync('src/screens/LinePlay/components/SessionRecap.tsx', 'utf8');
  assert.doesNotMatch(recap, />Parts are saved for this coin\. Win it on your way out\.</, 'the recap no longer hard-codes the promise');
});

test('P9: the recap minutes are the counted minutes once the server timed the wait', () => {
  assert.equal(status.countedWaitSeconds(21 * 60, 13.8 * 60), 828);
  assert.equal(status.countedWaitSeconds(600, null), 600, 'no server count: wall time, as today');
});

test('P6: the coin and its words open one sheet with the cost; nothing spends on a single tap', () => {
  const stage = fs.readFileSync('src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx', 'utf8');
  assert.doesNotMatch(stage, /<Pressable onPress=\{levelUp\}/, 'the coin never spends at once');
  assert.equal((stage.match(/onPress=\{openLevelSheet\}/g) ?? []).length, 2, 'the coin and the TAP TO LEVEL UP words');
  assert.match(stage, /if \(index === 1\) void levelUp\(\);/);
  const { levelSheetWords } = loadTs('src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx', {
    react: { memo: x => x, useCallback: x => x, useContext: () => ({}), useEffect() {}, useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react-native': { StyleSheet: { create: x => x }, AccessibilityInfo: {}, Modal: 'Modal', Pressable: 'Pressable', Text: 'Text', View: 'View' },
    'react-native-reanimated': { default: { View: 'View' }, FadeIn: {}, FadeOut: {}, ZoomIn: {}, useAnimatedStyle: () => ({}), useSharedValue: v => ({ value: v }), withSequence() {}, withSpring() {}, withTiming() {} },
    'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'Fragment' },
    '../../../../components/collection/ShelfCoin': { default: 'ShelfCoin' },
    '../../../../components/coin/LevelUpBurst': { default: 'LevelUpBurst' },
    '../../../../components/coin/Crowning': { default: 'Crowning' },
    '../../../../components/coin/progressionModel': { levelRibbon: () => '', levelUpFx: () => ({}) },
    '../../../../constants/coinTiers': { coinTier: () => ({ name: 'Shiny' }) },
    '../../../../gamekit/Haptics': { queueHaptic() {} },
    '../../../../audio/sfxLimiter': { playLimited() {}, SFX_PRIORITY: {} },
    '../../../../hooks/usePresentationQueue': { usePresentationSlot: () => ({}) },
    '../../../../context/SoundEffectProvider': { SoundEffectContext: {} },
    '../../../../ui': { GameDialog: 'GameDialog', GameIcon: 'GameIcon' },
    '../../../../ui/tokens': { BRAND: {} },
    './CoinFillRing': { default: 'CoinFillRing' },
    '../KidText': { default: 'KidText' },
    '../../../../services/lineplay/waitLevelMemory': {},
    '../../../../../modules/flash-safety': { isDimFlashingLightsEnabled: () => false },
    '../../../../services/connectionCopy': { tryAgainLine: () => '' },
  });
  assert.equal(levelSheetWords({ level: 1, partsToNext: 2, energyToNext: 25, nextTierName: 'Shiny' }),
    'Use 2 Ride Parts and 25 Energy to give this coin its Shiny look.');
  assert.equal(levelSheetWords({ level: 4, partsToNext: 1, energyToNext: 0, nextTierName: null }),
    'Use 1 Ride Part to give this coin Level 5.');
});

test('P21 and the began mark: a try clock starts at its own round start, and the shell tells the selector at GO', () => {
  const selector = fs.readFileSync('src/components/MiniGameSelector.tsx', 'utf8');
  // TRY AGAIN keeps the board mounted and bumps round: the clock restarts with it (it used to keep the first mount).
  assert.match(selector, /gameMountedAt\.current = Date\.now\(\);\n\s+\}, \[visible, selectedGame, showIntro, round\]\);/);
  assert.match(selector, /const roundStarted = useCallback\(\(\) => \{\n\s+gameMountedAt\.current = Date\.now\(\);\n\s+onRoundStartRef\.current\?\.\(\);/);
  assert.match(selector, /<RoundStartContext\.Provider value=\{roundStarted\}>/);
  const shell = fs.readFileSync('src/gamekit/GameShellV2.tsx', 'utf8');
  assert.match(shell, /setPhase\('playing'\);\n\s+try \{ roundStartRef\.current\?\.\(\); \}/, 'GO (beginPlay) is the round start');
  const ctx = loadTs('src/gamekit/StageHoldContext.ts', { react: { createContext: value => ({ value }), useContext: c => c.value, useEffect() {}, useRef: v => ({ current: v }) } });
  assert.equal(ctx.RoundStartContext.value, null, 'outside a ride challenge nothing is told');
});

test('P18 bug 29: a coin at its top level is never the LEVEL UP GOAL', () => {
  const { levelUpGoal } = loadTs('src/services/collection/levelUpGoal.ts');
  levelUpGoal.set(12, 7);
  assert.equal(levelUpGoal.getFor(7), 12);
  assert.equal(levelUpGoal.getFor(7, id => id === 12), null, 'a reader that knows the level sees none at the top');
  levelUpGoal.noteLevel(12, 4, 5);
  assert.equal(levelUpGoal.getFor(7), 12, 'still climbing');
  levelUpGoal.noteLevel(12, 5, 5);
  assert.equal(levelUpGoal.getFor(7), null, 'at the top it stops being the goal');
  levelUpGoal.set(13, 7, true);
  assert.equal(levelUpGoal.getFor(7), null, 'a top coin is never set as a goal');
  const sheet = fs.readFileSync('src/components/CoinLevelingModal.tsx', 'utf8');
  assert.match(sheet, /levelUpGoal\.noteLevel\(rideCoin\.ride_id, rideCoin\.current_level, rideCoin\.max_level\);/);
  assert.match(sheet, /levelUpGoal\.noteLevel\(rideCoin\.ride_id, nextLevel, rideCoin\.max_level\);/);
});
