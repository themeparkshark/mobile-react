'use strict';
/**
 * Fix pass w5 (lane retry): one more try feels instant.
 *   N04   TRY AGAIN mounted a new game under the ticket punch every time: on device the board took input 3.5 to
 *         4.5 s after the press (the new game's mount and draw, then a 0.8 to 1.7 s JS stall after its board drew).
 *         Now the last board stays mounted (hidden and held) under the loss card; TRY AGAIN of the same game bumps
 *         the try number and the shell and the game reset in place, so the board takes input right after the deal.
 *   T036  PLAY's first board decoded about 40 Whack images on the JS thread at the hand-over; the art now decodes
 *         while the coin card is up, and the ride card's re-renders never re-render the game under it.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const R = loadTs('src/components/rewards/retryInPlace.ts');
const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
const selector = fs.readFileSync('src/components/MiniGameSelector.tsx', 'utf8');
const shell = fs.readFileSync('src/gamekit/GameShellV2.tsx', 'utf8');
const ctx = fs.readFileSync('src/gamekit/StageHoldContext.ts', 'utf8');
const memory = fs.readFileSync('src/games/memory/MemoryGame.tsx', 'utf8');
const whack = fs.readFileSync('src/games/whack/WhackAShark.tsx', 'utf8');
const trivia = fs.readFileSync('src/games/trivia-duel/TriviaDuel.tsx', 'utf8');
const board = fs.readFileSync('src/games/whack/render/WhackBoard.tsx', 'utf8');

test('N04: TRY AGAIN resets the kept board only for the same game, from the loss card, while it is kept', () => {
  for (const g of ['tap', 'memory', 'trivia']) {
    assert.equal(R.canRetryInPlace({ flowState: 'lost', keptGame: g, keepBoard: true, nextGame: null }), true, g);
  }
  // The server deals another game (T232, the other picture game after 2 misses): the punch mounts it.
  assert.equal(R.canRetryInPlace({ flowState: 'lost', keptGame: 'tap', keepBoard: true, nextGame: 'Memory Match' }), false);
  // Let go after a long stay on the card, from another card, without a board, or a game that cannot hold.
  assert.equal(R.canRetryInPlace({ flowState: 'lost', keptGame: 'tap', keepBoard: false, nextGame: null }), false);
  assert.equal(R.canRetryInPlace({ flowState: 'expired', keptGame: 'tap', keepBoard: true, nextGame: null }), false);
  assert.equal(R.canRetryInPlace({ flowState: 'lost', keptGame: null, keepBoard: true, nextGame: null }), false);
  assert.equal(R.canRetryInPlace({ flowState: 'lost', keptGame: 'shark', keepBoard: true, nextGame: null }), false);
});

test('N04: the deal sends the kept board straight to play, any other game through the punch', () => {
  assert.equal(R.flowAfterDeal({ replay: true, keptGame: 'tap', dealtGame: 'tap', known: true }), 'minigame');
  assert.equal(R.flowAfterDeal({ replay: true, keptGame: 'tap', dealtGame: 'memory', known: true }), 'spinning');
  assert.equal(R.flowAfterDeal({ replay: false, keptGame: null, dealtGame: 'tap', known: true }), 'spinning');
  assert.equal(R.flowAfterDeal({ replay: true, keptGame: 'tap', dealtGame: 'photo', known: false }), 'wheel');
  assert.ok(R.KEEP_BOARD_MS >= 30000 && R.KEEP_BOARD_MS <= 60000);
  for (const s of ['spinning', 'minigame', 'postwin', 'lost', 'replay']) assert.ok(R.KEPT_BOARD_STATES.includes(s), s);
});

test('N04: the ride card keeps the board mounted, held and full-window under the loss card, and replays it in place', () => {
  assert.match(modal, /const boardKept = keepBoard && \(flowState === 'lost' \|\| flowState === 'replay'\);/);
  assert.match(modal, /\|\| boardKept\) && \(/, 'the game container renders under the loss card');
  assert.match(modal, /visible=\{!boardHeld\}/);
  assert.match(modal, /prewarm=\{boardHeld\}/);
  assert.match(modal, /round=\{retryRound\}/);
  // The card's 5% margin is reached past, so the board is never laid out at a new size on TRY AGAIN.
  assert.match(modal, /const boardOutset = fullBleed \? null : \{ top: -sheetMargin, left: -sheetMargin, right: -sheetMargin, bottom: -sheetMargin \};/);
  // The press resets in place (no punch, no new mount); the fresh spend never clears the kept game.
  assert.match(modal, /if \(inPlace\) \{\n(\s+\/\/.*\n)+\s+replayRef\.current = selectedGame;\n\s+repeatPunchRef\.current = false;\n\s+\} else \{/);
  // The reset and the board come once the spend request is on its way (never slowing the checkpoint work).
  assert.match(modal, /pressTrace\('card\.saved'\);\n(\s+\/\/.*\n)+\s+if \(replayRef\.current && flowStateRef\.current === 'lost'\) \{\n\s+setRetryRound\(\(r\) => r \+ 1\);\n\s+setFlowState\('replay'\);/);
  // Memory's re-deal for the newly dealt seed snaps in place before GO (no second fly-in under the count).
  assert.match(memory, /const offStage = stageHeldRef\.current \|\| retryDealRef\.current;/);
  assert.match(memory, /const onStart = useCallback\(\(\) => \{\n\s+retryDealRef\.current = false;/);
  assert.match(modal, /if \(optimistic && !replayRef\.current\) \{/);
  assert.match(modal, /setFlowState\(dealtFlow\(\)\);/);
  // Stable game callbacks, so the memoized game is not re-rendered by the card.
  assert.match(modal, /onClose=\{onGameLose\}\n\s+onComplete=\{onGameWin\}/);
  assert.match(selector, /export default memo\(MiniGameSelector\);/);
  assert.match(selector, /<RetryRoundContext\.Provider value=\{round\}>/);
});

test('N04: the shell and every ride game reset in place on a new try number (nothing from the last try leaks)', () => {
  assert.match(ctx, /export const RetryRoundContext = createContext<number>\(0\);/);
  assert.match(ctx, /export function useOnRetryRound\(reset: \(\) => void\): void \{/);
  // The shell: result, a hold left by Leave, the end watch, the count and the claim all reset; a repeat start.
  for (const line of ['clearEndWatch();', 'hadResultRef.current = false;', 'startedRef.current = false;', 'claimedRef.current = false;',
    'playedOnceRef.current = true;', 'setRescue(null);', 'setWrap(null);', 'setHoldReason(null);', "setPhase('countdown');"]) {
    assert.ok(shell.includes(`      ${line}`), line);
  }
  assert.match(shell, /const retryRound = useContext\(RetryRoundContext\);/);
  // Whack: PLAY AGAIN's reset plus the Leave hold let go; the timeline is built from the new seed at GO.
  assert.match(whack, /useOnRetryRound\(\(\) => \{\n\s+if \(pauseAt\.current\) \{ pauseAt\.current = null; runtime\.clock\.resume\(\); \}\n\s+runtime\.setRunning\(false\);\n\s+finisher\.cancel\(\);\n\s+interrupts\.current = \[\];\n\s+handleRematch\(\);/);
  // Memory: the open / rematch effect builds a fresh run (and deals in place while held).
  assert.match(memory, /\}, \[visible, runIndex, baseSeed, mode, retryRound\]\);/);
  // Beat the Buzzer: results, hold, tiles and clock let go; the repeat start is GO! alone, then the dealt round.
  assert.match(trivia, /useOnRetryRound\(\(\) => \{/);
  assert.match(trivia, /const steps = repeat \? \['GO!'\] : \['3', '2', '1', 'GO!'\];/);
  assert.match(trivia, /later\(repeat \? 0 : 3 \* COUNTDOWN\.stepMs \+ COUNTDOWN\.goMs, \(\) => \{ void beginMatch\(false\); \}\);/);
});

test('T036: the ride card warms the Whack board art while the coin card is up', () => {
  assert.match(modal, /useEffect\(\(\) => \{ if \(open && taskName\) void warmRideGameArt\(taskName\); \}, \[open, taskName\]\);/);
  assert.match(board, /export async function warmBoardImages\(theme: WhackTheme\): Promise<void> \{/);
  assert.match(board, /await loadCachedImage\(src as number\);/);
});

test('T036: the day\'s dealt game mounts held under the punch from the press', () => {
  assert.equal(R.earlyGameFor({ game: 'tap' }), 'tap');
  assert.equal(R.earlyGameFor({ game: 'memory' }), 'memory');
  assert.equal(R.earlyGameFor({ game: 'trivia' }), 'trivia');
  assert.equal(R.earlyGameFor({ game: 'photo' }), null);
  assert.equal(R.earlyGameFor(null), null);
  assert.match(modal, /\(flowState === 'spinning' && \(punchCard \|\| earlyGameRef\.current === selectedGame\)\)/);
});

test('T036/N04: the fx stage never reads its state on the JS thread (a sync UI trip that froze the hand-over)', () => {
  const fx = fs.readFileSync('src/gamekit/fx/FxStage.tsx', 'utf8');
  const derived = fx.match(/useDerivedValue\(\(\) => \{\n[^\n]*/g) ?? [];
  assert.ok(derived.length >= 11, `found ${derived.length}`);
  for (const d of derived) assert.match(d, /if \(!onUi\(\)\) return /, d);
  assert.match(fx, /return \(globalThis as \{ _WORKLET\?: boolean \}\)\._WORKLET === true;/);
});


test('T038: the picture re-deal reaches the server as a new start, never a read of the trivia attempt', () => {
  const recovery = fs.readFileSync('src/services/task-attempt/recovery.ts', 'utf8');
  // Recovery reads an attempt back by its id and only posts without one: the re-deal must drop the id.
  assert.match(recovery, /const result = checkpoint\.attemptId\n\s+\? await getTaskAttempt\(checkpoint\.attemptId\)/);
  assert.match(modal, /await writeTaskAttemptCheckpoint\(\{ \.\.\.saved, attemptId: null, pictureOnly: true,/);
  assert.match(modal, /redealStartRef\.current = true;\n\s+setRedealt\(true\);\n\s+await handleStartWheel\(\);/);
  assert.match(modal, /attemptId: redealStartRef\.current \? null : saved\?\.attemptId \?\? attemptRef\.current\?\.id \?\? savedAttemptIdRef\.current,/);
});

test('N04: the kept board shows only once its reset is on screen (no frame of the last try), held until the deal', () => {
  assert.match(modal, /const boardHidden = flowState === 'spinning' \|\| flowState === 'lost' \|\| \(flowState === 'replay' && !replayShown\);/);
  assert.match(modal, /if \(flowStateRef\.current === 'replay' \|\| replayRef\.current\) setReplayShown\(true\);/);
  assert.match(modal, /export const REPLAY_SHOW_MAX_MS = 250;/);
  assert.match(shell, /if \(retryShownRound\.current === retryRound \|\| phase !== 'countdown' \|\| result \|\| rescue\) return;\n\s+retryShownRound\.current = retryRound;\n\s+onStageDrawn\?\.\(\);/);
  // Beat the Buzzer's rail and scores are fresh at once (no roll down from the last try's points).
  assert.match(trivia, /setScores\(\{ me: 0, opp: 0 \}\);\n\s+setLocks\(\{ me: null, opp: null \}\);/);
  assert.match(trivia, /<Rail key=\{`rail-\$\{runKey\}`\}/);
});


test('N04/T036: a just-started try never refreshes the player (an app-wide re-render at the hand-over)', () => {
  assert.match(modal, /if \(attempt\.status !== 'started'\) refreshPlayer\?\.\(\)\.then\(fresh => \{/);
});

test('T051: the striped tiles before the question take a tap with a wiggle, never a silent drop', () => {
  assert.match(trivia, /onTapUI=\{onPreviewTapUI\}[^\n]*wiggleKey=\{previewWiggle\[i\] \?\? 0\}[^\n]*disabled=\{!preview\} \/>/);
  assert.match(trivia, /pointerEvents=\{preview \? 'box-none' : 'none'\}/);
  assert.match(trivia, /const onPreviewTapUI = useCallback\(\(i: number\) => \{\n\s+'worklet';\n\s+runOnJS\(previewTap\)\(i\);/);
  // Once the question shows, the clock gate decides (w4): early taps wiggle, open taps lock.
  const gate = fs.readFileSync('src/games/trivia-duel/engine/tapGate.ts', 'utf8');
  assert.match(gate, /if \(phase === TAP_PH\.read\) return 'early';/);
});

test('w5 N04: the kept board is live while the deal travels; only GO waits for it, and a Leave then is kept', () => {
  // In 'replay' the board is shown and takes taps (never held); the dealt flag tells the shell to hold GO.
  assert.match(modal, /const boardHeld = flowState === 'spinning' \|\| flowState === 'lost';/);
  assert.match(modal, /const boardDealt = flowState !== 'replay';/);
  assert.match(modal, /dealt=\{boardDealt\}/);
  assert.match(modal, /pointerEvents=\{boardHeld \? 'none' : 'auto'\}/);
  // Unseen but hit-testable before its reset is drawn (iOS ignores touches on a view under 1% alpha).
  assert.match(modal, /boardHidden && \(flowState === 'replay' \? styles\.replayVeil : styles\.prewarm\)/);
  const veil = Number(/replayVeil: \{ opacity: ([0-9.]+) \}/.exec(modal)?.[1]);
  assert.ok(veil >= 0.015 && veil <= 0.03, String(veil));
  // The shell takes no touch in the render that brings a new try number, until its reset has run.
  assert.match(shell, /const retryResetPending = retryRound !== retryRoundSeen\.current;\n\s+const gameContent = \(\n\s+<View style=\{styles\.root\} pointerEvents=\{retryResetPending \? 'box-only' : 'auto'\}\n\s+onTouchEnd=\{rideChallenge \? queueRetrySkip : undefined\}>/);
  assert.match(shell, /if \(e\.target !== e\.currentTarget\) return;/);
  // That tap is kept: it skips the new count once the reset is in (never dropped, never a press on the last try).
  assert.match(shell, /if \(retryRoundSeen\.current === retryRoundRef\.current\) skipCountdownRef\.current\(\);\n\s+else skipWantedRef\.current = true;/);
  assert.match(shell, /raf2 = nextFrame\(\(\) => \(skipWantedRef\.current \? startCount\(\[steps\[steps\.length - 1\]\], 0\) : startCount\(steps, lead\)\)\);/);
  assert.match(shell, /retryRoundSeen\.current = retryRound;\n\s+setRetrySeen\(retryRound\);/);
  assert.match(selector, /<StageDealtContext\.Provider value=\{dealt\}>/);
  assert.match(ctx, /export const StageDealtContext = createContext<boolean>\(true\);/);
  assert.match(shell, /if \(!stageDealtRef\.current\) \{\n\s+playWaitsDealRef\.current = true;/);
  // A Leave before the deal has no attempt to end yet: it is sent once the try is dealt.
  assert.match(modal, /if \(!attemptRef\.current && flowStateRef\.current === 'replay'\) \{ lossBeforeDealRef\.current = true; return; \}/);
  assert.match(modal, /if \(flowState === 'minigame' && lossBeforeDealRef\.current && attemptRef\.current\) void resolveAttempt\('loss'\);/);
});

test('w5 N04: Memory re-deals a kept board of the same shape in place (no card remount), every card reset', () => {
  const card = fs.readFileSync('src/games/memory/MemoryCard.tsx', 'utf8');
  // The in-place path runs only for a TRY AGAIN re-deal before GO, with every card mounted and the same shape.
  assert.match(memory, /if \(retryDealRef\.current && g && r && mounted && was\.cols === cols && was\.rows === rows && was\.pairs === pairs\) \{/);
  assert.match(memory, /c\?\.reset\(\);\n\s+const p = slotXY\(g, slot\);\n\s+c\?\.place\(p\.x, p\.y\);/);
  // It never bumps the board key (the remount that blocked the JS thread for 0.5 to 0.9 s).
  const inPlace = memory.slice(memory.indexOf('const mounted = cards.current.length'), memory.indexOf("pressTrace('memory.inplace');"));
  assert.doesNotMatch(inPlace, /setBoardKey|setStageDealt\(false\)/);
  // The card reset puts back every value a try can change (flip, hide, slip, gold, eye, moved, rims).
  const reset = card.slice(card.indexOf('    reset() {'), card.indexOf('  }), [v, s, rm]);'));
  for (const k of ['flip', 'lift', 'opacity', 'scale', 'rotZ', 'arcY']) assert.match(reset, new RegExp(`s\\.${k}\\.value = `), k);
  const vKeys = [...card.matchAll(/^\s{4}(\w+): makeMutable\(/gm)].map((m) => m[1]).filter((k) => !['x', 'y', 'flip', 'lift', 'opacity', 'scale', 'rotZ', 'arcY'].includes(k));
  assert.ok(vKeys.length >= 18);
  for (const k of vKeys) assert.ok(new RegExp(`v\\.${k}\\.value = |'${k}'`).test(reset), `card value ${k} is reset`);
  assert.match(reset, /setRimColor\(MM\.blue\);/);
});
