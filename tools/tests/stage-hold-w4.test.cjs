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
  assert.match(memory, /const offStage = stageHeldRef\.current;\n\s+dealCards\(offStage\);/);
  assert.match(memory, /if \(stageHeldRef\.current\) introWaiting\.current = true;/);
  assert.match(memory, /enabled: visible && !stageHeld && !result && !tryScreen/);
  assert.match(whack, /const bed = !visible \|\| stageHeld \|\| result \? null/);
});

test('T036: the game mounts under the punch once the tear starts, so its mount never holds the tear back', () => {
  const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  const punch = fs.readFileSync('src/components/TicketPunch.tsx', 'utf8');
  assert.match(modal, /onCardShown=\{\(\) => setPunchCard\(true\)\}/);
  assert.match(modal, /useEffect\(\(\) => \{ if \(flowState !== 'spinning'\) \{ setPunchCard\(false\); setEarlyGame\(null\); \} \}, \[flowState\]\);/);
  // Called after the UI-thread tear and card springs are set, in both the full and the Reduce Motion punch.
  assert.match(punch, /cardShown\.current = true;\n\s+if \(reduced\) \{\n\s+onCardShown\?\.\(\);/);
  assert.match(punch, /at\(PUNCH_T\.done - PUNCH_T\.punch \+ 400, finish\); \/\/ safety net\n[^\n]*\n\s+onCardShown\?\.\(\);/);
});

test('N04: TRY AGAIN mounts the game it will deal under the punch from the press, before the server answers', () => {
  const RP = loadTs('src/services/task-attempt/retryPrewarm.ts');
  const known = ['tap', 'memory', 'trivia'];
  assert.equal(RP.retryPrewarmGame({ game: 'tap', retry_game: 'memory' }, false, known), 'memory', 'the server named the next game');
  assert.equal(RP.retryPrewarmGame({ game: 'tap' }, true, known), 'tap', 'same game');
  assert.equal(RP.retryPrewarmGame({ game: 'tap' }, false, known), null, 'an older server may deal another game: wait for it');
  assert.equal(RP.retryPrewarmGame({ game: 'current' }, true, known), null);
  assert.equal(RP.retryPrewarmGame(null, true, known), null);
  const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  assert.match(modal, /setEarlyGame\(prewarmGame\);\n\s+await handleStartWheel\(\);/);
  assert.match(modal, /const stageGame = selectedGame \?\? \(flowState === 'spinning' \? earlyGame/);
  assert.match(modal, /preferredGame=\{stageGame\}/);
});

