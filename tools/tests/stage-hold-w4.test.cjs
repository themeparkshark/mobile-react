'use strict';
/**
 * Fix round w4 (lane play-kid): a ride game is never a blank blue page at its start.
 *   T036 / N04  Round w3 mounted the game's container under the ticket punch, but MiniGameSelector returned
 *   null while not visible, so nothing was drawn under the punch: every PLAY! and TRY AGAIN mounted the game
 *   at the hand-over and its field stayed hidden until the art loaded (Whack) or the whole deal had landed
 *   (Memory, the field was hidden during the deal), 3 to 5 s of plain blue on device (int2-12, int2-34).
 *   Now the game mounts held off stage (StageHoldContext): drawn under the punch and the how-to card, the
 *   shell holds its count until the hand-over, and the field shows as soon as the stage art is drawn.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const H = loadTs('src/gamekit/stageHold.ts');
const selector = fs.readFileSync('src/components/MiniGameSelector.tsx', 'utf8');
const shell = fs.readFileSync('src/gamekit/GameShellV2.tsx', 'utf8');
const memory = fs.readFileSync('src/games/memory/MemoryGame.tsx', 'utf8');
const whack = fs.readFileSync('src/games/whack/WhackAShark.tsx', 'utf8');

test('N04/T036: under the punch the dealt game is mounted and held, never nothing', () => {
  for (const g of ['tap', 'memory', 'trivia']) {
    const s = H.stageHoldFor({ visible: false, prewarm: true, preferredGame: g, selectedGame: g, showIntro: false });
    assert.deepEqual({ ...s }, { mounted: true, held: true, introOnly: false }, g);
    // The hand-over: the same mount, no longer held.
    const live = H.stageHoldFor({ visible: true, prewarm: false, preferredGame: g, selectedGame: g, showIntro: false });
    assert.deepEqual({ ...live }, { mounted: true, held: false, introOnly: false }, g);
  }
  // Before the server deals (no game yet) nothing mounts.
  assert.equal(H.stageHoldFor({ visible: false, prewarm: true, preferredGame: null, selectedGame: null, showIntro: false }).mounted, false);
  // A game that does not honor the hold mounts at the hand-over, as before.
  assert.equal(H.stageHoldFor({ visible: false, prewarm: true, preferredGame: 'shark', selectedGame: 'shark', showIntro: false }).mounted, false);
  // A closed game is unmounted.
  assert.equal(H.stageHoldFor({ visible: false, prewarm: false, preferredGame: 'tap', selectedGame: 'tap', showIntro: false }).mounted, false);
});

test('N04/T036: a first play keeps the drawn game under its how-to card (held), others keep the card-first order', () => {
  const s = H.stageHoldFor({ visible: true, prewarm: false, preferredGame: 'memory', selectedGame: 'memory', showIntro: true });
  assert.deepEqual({ ...s }, { mounted: true, held: true, introOnly: false });
  const other = H.stageHoldFor({ visible: true, prewarm: false, preferredGame: 'shark', selectedGame: 'shark', showIntro: true });
  assert.equal(other.introOnly, true);
});

test('N04/T036: the selector renders the held game in one tree (no remount at the hand-over)', () => {
  assert.doesNotMatch(selector, /if \(!visible \|\| !selectedGame\) return null;/, 'the old early return drew nothing under the punch');
  assert.match(selector, /const stage = stageHoldFor\(\{ visible, prewarm, preferredGame, selectedGame, showIntro \}\);/);
  assert.match(selector, /<StageHoldContext\.Provider value=\{stageHeld\}>\{game\}\{intro\}<\/StageHoldContext\.Provider>/);
  assert.match(selector, /<WhackAShark visible=\{onStage\}/);
  assert.match(selector, /<MemoryGame visible=\{onStage\}/);
  assert.match(selector, /<TriviaDuel\n\s+visible=\{onStage\}\n\s+mode="ride"/);
});

test('N04/T036: the shell holds its count off stage and shows the field once the art is drawn', () => {
  assert.match(shell, /if \(phase !== 'countdown' \|\| !visible \|\| !stageOn \|\| stageHeld\) return;/);
  assert.match(shell, /const fieldOn = \(stageDrawn \?\? stageReady\) \|\| stageOn;/);
  assert.match(shell, /if \(stageHeldRef\.current\) return;\n\s+if \(state === 'background'/);
});

test('N04/T036: Memory shows its felt during the deal, deals in place off stage, and holds barker and bot; Whack holds its music', () => {
  assert.match(memory, /stageReady=\{stageDealt\}\n\s+stageDrawn=\{!!geo\}/);
  assert.match(memory, /const offStage = stageHeldRef\.current \|\| retryDealRef\.current;\n\s+dealCards\(offStage\);/);
  assert.match(memory, /if \(stageHeldRef\.current\) introWaiting\.current = true;/);
  assert.match(memory, /enabled: visible && !stageHeld && !result && !tryScreen/);
  assert.match(whack, /const bed = !visible \|\| stageHeld \|\| result \? null/);
});

test('T036: the game mounts under the punch once the tear starts, so its mount never holds the tear back', () => {
  const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  const punch = fs.readFileSync('src/components/TicketPunch.tsx', 'utf8');
  assert.match(modal, /onCardShown=\{\(\) => setPunchCard\(true\)\}/);
  assert.match(modal, /useEffect\(\(\) => \{ if \(flowState !== 'spinning'\) setPunchCard\(false\); \}, \[flowState\]\);/);
  // Called after the UI-thread tear and card springs are set, in both the full and the Reduce Motion punch.
  // w5: the kept board's instant tear returns first (it never pops a card); the full and Reduce Motion punch as before.
  assert.match(punch, /cardShown\.current = true;\n\s+if \(instant\) \{[\s\S]{0,700}?\n\s+return;\n\s+\}\n\s+if \(reduced\) \{\n\s+onCardShown\?\.\(\);/);
  assert.match(punch, /at\(safetyMs\(PUNCH_T\.done - PUNCH_T\.punch \+ 400\), finish\); \/\/ safety net\n[^\n]*\n\s+onCardShown\?\.\(\);/);
});


test('N04: TRY AGAIN starts the ticket punch on the press, never a Setting Up loading card first', () => {
  const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  const start = modal.indexOf('const handleProtectedRetry = useCallback(async () => {');
  assert.ok(start > 0);
  const body = modal.slice(start, modal.indexOf('}, [handleStartWheel, location, clearAttemptCheckpoint, selectedGame, keepBoard]);', start));
  // Before any await: the lost try is cleared and the punch scene is up (it bobs until the server deals).
  const firstAwait = body.indexOf('await ');
  const punch = body.indexOf("setFlowState('spinning');");
  assert.ok(punch > 0 && punch < firstAwait, 'the punch starts before the checkpoint work');
  assert.ok(body.indexOf('setSelectedGame(null);') < punch, 'the lost game is cleared before the punch, so it never pops the old card');
  assert.doesNotMatch(body, /setFlowState\('retrying'\)/);
  // A start that could not begin goes back to the loss card.
  assert.match(body, /if \(\(flowStateRef\.current === 'spinning' \|\| flowStateRef\.current === 'replay' \|\| replayRef\.current\) && !attemptRef\.current && !spendingRef\.current\) \{\n\s+repeatPunchRef\.current = false; replayRef\.current = null; setFlowState\('lost'\);/);
  assert.match(body, /repeatPunchRef\.current = true;\n\s+setFlowState\('spinning'\);/, 'TRY AGAIN marks the punch as a repeat');
});

test('N04/T036: the punch hands over once the board under it is drawn, after a short card stay (shorter on TRY AGAIN)', () => {
  const punch = fs.readFileSync('src/components/TicketPunch.tsx', 'utf8');
  const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  const ctx = fs.readFileSync('src/gamekit/StageHoldContext.ts', 'utf8');
  // The old beat waited for the card spring to settle plus a fixed 0.5 s (about 1.6 s after the tear on device).
  assert.doesNotMatch(punch, /PUNCH_T\.done - PUNCH_T\.card - 500/);
  assert.match(punch, /export const CARD_HOLD_MS = \{ first: 900, repeat: 450 \} as const;/);
  assert.match(punch, /holdThen\(pop \+ \(quick \? CARD_HOLD_MS\.repeat : CARD_HOLD_MS\.first\)\);/);
  // Board not drawn yet: the card stays (never a blank page), up to BOARD_WAIT_MAX_MS; a skip tap waits for it too.
  assert.match(punch, /const tryFinish = \(\) => \{ if \(held\.current && boardReadyRef\.current !== false\) finish\(\); \};/);
  assert.match(punch, /useEffect\(\(\) => \{ if \(boardReady\) tryFinish\(\); \}, \[boardReady\]\);/);
  assert.match(punch, /const safetyMs = \(fixed: number\) => \(boardReady === undefined \? fixed : BOARD_WAIT_MAX_MS\);/);
  assert.match(punch, /onPress=\{\(\) => \{ held\.current = true; tryFinish\(\); \}\}/);
  // The held game tells the punch its board is drawn: shell -> StageDrawnContext -> MiniGameSelector -> modal.
  assert.match(ctx, /export const StageDrawnContext = createContext<\(\(\) => void\) \| null>\(null\);/);
  assert.match(shell, /if \(fieldOn && stageHeld\) onStageDrawn\?\.\(\);/);
  assert.match(selector, /<StageDrawnContext\.Provider value=\{onStageDrawn \?\? null\}>/);
  assert.match(modal, /onStageDrawn=\{markBoardDrawn\}/);
  assert.match(modal, /boardReady=\{boardDrawn\}\n\s+quick=\{repeatPunchRef\.current\}/);
  assert.match(modal, /useEffect\(\(\) => \{ if \(flowState !== 'spinning'\) setBoardDrawn\(false\); \}, \[flowState\]\);/);
});
