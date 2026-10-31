const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/results-w5r3.test.cjs
// Wave 5 round 3 of the results lane: the Duel's Best Moment polaroid waits
// for the stars and YOU WIN! and drops into clear sky as a picture; Sharky's
// unlock is a picture inside the card above the buttons (like the new Finn);
// a spent Ticket reads GOOD TRY! with a picture-led ad button; the new Finn
// tile is compact so the peek shark fits a 874 pt phone; the live pace chip
// writes 8,610 and says it races the best Burst; a 0-turn Memory run shows no
// TURNS chip; PLAY AGAIN's count is only the count; the warm-up first win
// wears the family card.
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ts = require(path.join(root, 'node_modules/typescript'));

/** Pull one exported function out of a file and run it (plain logic only). */
function fnFrom(file, name, prelude = '') {
  const src = read(file);
  const start = src.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} in ${file}`);
  let depth = 0;
  let i = src.indexOf('{', src.indexOf(')', start));
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  const code = ts.transpileModule(prelude + src.slice(start, i + 1).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  // eslint-disable-next-line no-new-func
  return new Function(`${code}; return ${name};`)();
}

test('the Best Moment polaroid waits for the last star and YOU WIN!, eases down with no bounce, sits clear of the ribbon', () => {
  const file = 'src/games/trivia-duel/ui/DuelResults.tsx';
  const duel = read(file);
  const prelude = 'const RIDE_STAR_AT = 500, RIDE_STAR_GAP = 220, BANNER_AT = 700, BANNER_GAP = 180, RANK_UP_AT = 1100, RIBBON_SLAM_MS = 360;\n'
    + 'function rideRibbonDelay(stars, reducedMotion) { if (reducedMotion || stars <= 0) return 0; return RIDE_STAR_AT + Math.min(3, stars) * RIDE_STAR_GAP + 120; }\n';
  const polaroidAt = fnFrom(file, 'polaroidAt', prelude);
  // 3 stars: the title lands at 500 + 660 + 120 = 1280, plus its slam.
  assert.equal(polaroidAt(300, 0, false, 3), 1280 + 360);
  assert.ok(polaroidAt(300, 1, false, 3) >= 1640, 'never before the title has landed');
  assert.equal(polaroidAt(500, 0, false), 1000, 'no stars: two beats, as before');
  assert.match(duel, /const polAt = polaroidAt\(beatMs, model\.banners\.length, model\.banners\.includes\('RANK UP'\), stars\);/);
  // No overshoot spring that dips into the ribbon or the card.
  assert.match(duel, /polY\.value = withDelay\(polAt, withTiming\(0, \{ duration: 420, easing: Easing\.out\(Easing\.cubic\) \}\)\);/);
  assert.doesNotMatch(duel, /withSpring\(0, \{ damping: 10, stiffness: 220 \}\)/);
  // A short fall that fades in: it never sweeps across the score plate at the top.
  assert.match(duel, /const POL_DROP_PT = 36;/);
  assert.match(duel, /const polY = useSharedValue\(-POL_DROP_PT\);/);
  assert.match(duel, /opacity: polS\.value > 0\.02 \? Math\.min\(1, Math\.max\(0, 1 \+ polY\.value \/ POL_DROP_PT\)\) : 0,/);
  // Clear sky: the ribbon rises 36 pt over the card (it has settled when the polaroid drops).
  assert.match(duel, /const POL_GAP = 48;/);
  // It sizes itself to the sky between the score plate and the ribbon.
  const scale = fnFrom(file, 'polaroidScale', 'const POL_GAP = 48, POL_H = 152, POL_TOP_RESERVE = 136;\n');
  assert.equal(scale(null, 62), 1, 'before layout: full size');
  assert.equal(scale(1000, 62), 1, 'lots of sky: full size');
  assert.equal(scale(250, 62), 0.6, 'a tall card: never under 0.6');
  assert.ok(Math.abs(scale(380, 62) - (380 - 48 - 198) / 152) < 1e-9);
  assert.match(duel, /style=\{\{ width: POL_W \* polK, height: POL_H \* polK \}\}/);
  assert.match(duel, /model\.best && !polGone && cardH > 0 \?/);
});

test('the Best Moment caption is a picture (a bolt and the big time), the sentence is spoken', () => {
  const file = 'src/games/trivia-duel/ui/DuelResults.tsx';
  const duel = read(file);
  const time = fnFrom(file, 'bestMomentTime');
  const spoken = fnFrom(file, 'bestMomentSpoken');
  assert.equal(time('0.4s on Q2'), '0.4s');
  assert.equal(time('12s on Q7'), '12s');
  assert.equal(time('on Q2'), null);
  assert.equal(spoken('0.4s on Q2'), 'Best moment: 0.4 seconds on question 2');
  assert.doesNotMatch(duel, />BEST MOMENT</);
  // Wave 6: the caption is bolts for the speed (no bare 0.4s to read).
  assert.match(duel, /polaroidBolts\(model\.rows\)/);
  assert.match(duel, /accessibilityLabel=\{bestMomentSpoken\(model\.best\.label\)\}/);
});

test('Sharky shows its unlock as a picture with a gold NEW tag inside the card, above the buttons, with the missions', () => {
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(sharky, /<SharkyUnlock card=\{data\.newCard\} atMs=\{BELOW_AT \+ 90\} reducedMotion=\{reducedMotion\} \/>/);
  assert.doesNotMatch(sharky, /data\.newCard\.toUpperCase\(\)/, 'no uppercase text pill');
  // The extras block comes before PLAY AGAIN and DONE.
  assert.ok(sharky.indexOf('{hasBelow ? (') < sharky.indexOf('<Animated.View style={[styles.playWrap'), 'extras above the buttons');
  assert.ok(sharky.indexOf('styles.mRow') < sharky.indexOf('<ResultPrimaryButton'), 'missions above the buttons');
  const unlock = read('src/games/sharky/hud/SharkyUnlock.tsx');
  assert.match(unlock, /'PRIZE BOXES': SHARKY_ART\.prizeBox/);
  assert.match(unlock, /label=\{`New unlocked: \$\{unlockName\(card\)\.toLowerCase\(\)\}`\}/);
  // Wave 6: the one unlock tile (the reward cue and the NEW tag live there).
  assert.match(unlock, /<UnlockTile /);
  const name = fnFrom('src/games/sharky/hud/SharkyUnlock.tsx', 'unlockName');
  assert.equal(name('NEW: Prize Boxes'), 'Prize Boxes');
  assert.equal(name('Overdrive'), 'Overdrive');
});

test('a spent Ticket reads GOOD TRY!, and the ad retry leads with pictures (play, then retry) and says DONE to leave', () => {
  const lost = require(path.join(root, 'tools/tests/helpers/ts-module.cjs')).loadTs('src/components/rewards/lostTryCard.ts');
  const base = { usedRescuePass: false, rescueRetryAvailable: false, firstCoinTicketReturned: false, lostTicketCost: 1 };
  assert.equal(lost.lostTryCopy({ ...base, retryOffered: true }).title, 'Good Try!');
  assert.equal(lost.lostTryCopy({ ...base, lostTicketCost: 0, firstCoinTicketReturned: true }).title, 'One More Try!');
  assert.equal(lost.lostTryHasRetry({ ...base, retryOffered: true }), true, 'the paid try is still offered');
  assert.deepEqual([...lost.AD_RETRY_ACTION.icons], ['play', 'retry']);
  assert.equal(lost.AD_RETRY_ACTION.label, 'Watch Ad');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /vip \? VIP_RETRY_ACTION : AD_RETRY_ACTION/);
  assert.doesNotMatch(modal, /Watch Ad: One More Try|'No thanks'/);
  const capture = read('src/screens/LinePlay/QueueResultsCaptureScreen.tsx');
  assert.match(capture, /\{ \.\.\.AD_RETRY_ACTION, onPress/);
  const card = read('src/components/rewards/ChallengeStatusCard.tsx');
  assert.match(card, /icons=\{primary\.icons\} a11yLabel=\{primary\.a11yLabel\}/);
  const buttons = read('src/gamekit/results/ResultButtons.tsx');
  assert.match(buttons, /lead\.map\(\(name, i\) => <GameIcon key=\{`\$\{name\}-\$\{i\}`\} name=\{name\} size=\{26\} \/>\)/);
});

test('the new Finn tile is compact (72 pt) so a tall Whack win keeps room for the peek shark', () => {
  const finn = read('src/games/whack/FinnUnlock.tsx');
  assert.match(finn, /export const FINN_TILE_PT = UNLOCK_TILE_PT;/);
  assert.match(read('src/gamekit/results/UnlockTile.tsx'), /export const UNLOCK_TILE_PT = 72;/);
  assert.doesNotMatch(finn, /width: 92/);
  // A tall phone keeps the smallest peek even when the card fills the stage; an SE keeps none.
  const podium = read('src/gamekit/results/ResultsPodium.tsx');
  assert.match(podium, /export const PEEK_TALL_PHONE_PT = 740;/);
  assert.match(podium, /if \(!\(h >= \(tallPhone \? 0 : PEEK_MIN_ROOM_PT\)\)\) return 0;/);
  assert.match(podium, /const tallPhone = useWindowDimensions\(\)\.height >= PEEK_TALL_PHONE_PT;/);
});

test('the live pace chip draws digits only (countText, no commas) and says it races the best Burst', () => {
  const board = read('src/games/whack/render/WhackBoard.tsx');
  assert.doesNotMatch(board, /commaInt/);
  assert.match(board, /return d > 0 \? `\+\$\{countText\(d\)\} \$\{paceLabel\}` : paceLabel;/);
  assert.match(board, /paceLabel \?\? 'VS BEST BURST'/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /export const PACE_BEST_LABEL = 'VS BEST BURST';/);
  assert.equal((whack.match(/: PACE_BEST_LABEL\}/g) || []).length, 2);
});

test('a Memory run with no turns shows no TURNS chip (a gold 0/13 reads like a score of zero) and no grades', () => {
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /if \(e\.turns > 0\) numbers\.push\(\{ label: 'TURNS'/);
  assert.match(game, /grades: r\.mode === 'warmup' \|\| e\.turns === 0 \? null :/);
  assert.match(game, /pairs: \[e\.pairs, e\.pairsTotal\],/);
});

test('PLAY AGAIN\'s 3-2-1 is just the count: the how-to shows on the first play of each opening, and the header says BURST 1', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /\(objective && !playedOnceRef\.current \? <Text style=\{styles\.cdPillText\}/);
  assert.match(shell, /if \(!visible\) return;\n      playedOnceRef\.current = false;/);
  assert.match(shell, /startedRef\.current = true;\n      playedOnceRef\.current = true;/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  const rematch = whack.slice(whack.indexOf('const handleRematch = useCallback'), whack.indexOf('restBoard, clearAutoReady]);', whack.indexOf('const handleRematch = useCallback')));
  assert.match(rematch, /setBurstIdx\(0\);/);
});

test('the warm-up first win wears the family card: blue, white border, the shared ribbon (preloaded)', () => {
  const results = read('src/games/memory/MemoryResults.tsx');
  assert.match(results, /firstWinCard: \{ width: '90%', maxWidth: 380, backgroundColor: FAMILY\.card, borderRadius: 26, borderWidth: 4, borderColor: FAMILY\.border,/);
  assert.match(results, /<ResultsRibbon title=\{banner\} reducedMotion style=\{styles\.firstWinRibbon\} \/>/);
  assert.match(results, /FIRST_WIN_BACKDROP, RESULTS_RIBBON_ART, SHOWER_BUBBLE/);
  assert.match(read('src/gamekit/results/ResultsRibbon.tsx'), /export const RESULTS_RIBBON_ART = RIBBON;/);
  assert.match(results, /const canStats = data\.mode !== 'warmup' && \(/);
});

test('the extras panel never sits at scale 0 (its cream fill came back missing for seconds on iOS)', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  // Wave 6: the unlock sits bare on the blue, so there is no panel to scale at all.
  assert.doesNotMatch(card, /extrasStyle|extrasIn\b/);
  assert.match(card, /extrasBare: \{ width: '100%', marginTop: 4, alignItems: 'center' \},/);
});

test('a record Banana Basket or Sharky run is a NEW BEST: the shell compares with the best from before the run, not the one just saved', () => {
  const banana = read('src/games/banana-basket/BananaBasketGame.tsx');
  assert.match(banana, /bestBeforeRun\.current = mode === 'ride' \? progress\.bestRide : progress\.bestQueue;/);
  assert.match(banana, /const shownBest = result && bestBeforeRun\.current != null \? bestBeforeRun\.current : bestNow;/);
  assert.match(banana, /personalBest=\{shownBest \|\| undefined\}/);
  // deliver records the old best before it saves the new one.
  const d = banana.slice(banana.indexOf('const deliver = useCallback'));
  assert.ok(d.indexOf('bestBeforeRun.current =') < d.indexOf('setProgress(nextP)'));
  const sharky = read('src/games/sharky/SharkySwim.tsx');
  assert.match(sharky, /personalBest=\{result && bestBeforeRun\.current != null \? bestBeforeRun\.current : prog\.best\[runMode\] \?\? 0\}/);
  const e = sharky.slice(sharky.indexOf('const best = prog.best[key] ?? 0;'));
  assert.ok(e.indexOf('bestBeforeRun.current = best;') < e.indexOf('setProgress(next)'));
});

test('a 0-star Banana Basket card keeps one short tip, not three sentences of reading', () => {
  const banana = read('src/games/banana-basket/BananaBasketGame.tsx');
  // Wave 6: the one tip is spoken, never drawn.
  assert.match(banana, /spokenNote: stars === 0 \? tipLine\(facts\) : undefined,/);
  assert.doesNotMatch(banana, /whyLine\(facts\)/);
});
