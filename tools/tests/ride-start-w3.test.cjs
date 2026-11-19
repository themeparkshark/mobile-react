'use strict';
/**
 * Fix round w3 (lane play): the start of a ride game.
 *   T036 the punch starts on PLAY (the spend reconciles by request id), the game card pops when dealt,
 *        and the game mounts under the punch so its board is drawn when the punch hands over.
 *   T044 the Game Ready card never shows for a known game and never says "update the app".
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');

const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
const punch = fs.readFileSync('src/components/TicketPunch.tsx', 'utf8');
const selector = fs.readFileSync('src/components/MiniGameSelector.tsx', 'utf8');

test('T036: a fresh spend starts the punch before the server answers', () => {
  // w5 N04: a kept board waiting for its deal is the one fresh spend that keeps its game on screen.
  // w5 T036: the day's dealt game (or the game a switched TRY AGAIN named) mounts held from the press; the punch
  // still pops only the server's own deal (selectedGameData stays null until it answers).
  assert.match(modal, /const optimistic = !saved;\n(\s+\/\/.*\n)?\s+if \(optimistic && !replayRef\.current\) \{\n(\s+\/\/.*\n)+\s+const early = earlyGameFor\(retryNextIdRef\.current \? \{ game: retryNextIdRef\.current \} : redeemable\?\.deal\);\n\s+retryNextIdRef\.current = null;\n\s+earlyGameRef\.current = early;\n\s+setSelectedGame\(early\);\n\s+setSelectedGameData\(null\);\n\s+setFlowState\('spinning'\);/);
  const spinAt = modal.indexOf("setFlowState('spinning');\n    }\n    try {\n      const result = await recoverTaskAttempt(checkpoint);");
  assert.ok(spinAt > 0, 'the punch is set before the spend request');
  assert.match(modal, /\{flowState === 'spinning' && \(\n\s+<TicketPunch\n\s+gameName=\{selectedGameData\?\.name \?\? null\}/);
  // The punch waits for the dealt game, and a tap never skips past an undealt game.
  assert.match(punch, /if \(!torn \|\| !gameName \|\| cardShown\.current \|\| reduced == null\) return;/);
  assert.match(punch, /if \(done\.current \|\| !cardShown\.current\) return;/);
  assert.match(punch, /withRepeat\(withTiming\(1, \{ duration: 700/, 'the ticket bobs while the spend is on its way: never an empty scene');
});

test('T036: the game mounts hidden under the punch and becomes visible when it hands over', () => {
  assert.match(modal, /\{selectedGame && \(\(flowState === 'spinning' && \(punchCard \|\| earlyGameRef\.current === selectedGame\)\) \|\| flowState === 'minigame'/);
  // w5 N04: hidden and held under the punch and under the loss card (the kept board); live while it replays.
  assert.match(modal, /const boardHeld = flowState === 'spinning' \|\| flowState === 'lost';/);
  assert.match(modal, /visible=\{!boardHeld\}/);
  assert.match(modal, /prewarm=\{boardHeld\}/);
  assert.match(modal, /pointerEvents=\{boardHeld \? 'none' : 'auto'\}/);
  assert.match(selector, /if \(!visible && !\(prewarm && preferredGame\)\) \{/);
});

test('T044: no Game Ready card for a known game, no update-the-app words', () => {
  assert.doesNotMatch(modal, /update the app/i);
  assert.match(modal, /\{flowState === 'wheel' && !knownChallengeGame\(attemptRef\.current\?\.game\) && <ChallengeStatusCard title="Game Ready"/);
  // w5 N04: both deal paths go through dealtFlow (the punch for a known game, play at once for the kept board).
  assert.equal((modal.match(/setFlowState\(dealtFlow\(\)\);/g) ?? []).length, 2);
  assert.match(modal, /const known = selectAssignedGameRef\.current\(\);/);
});
