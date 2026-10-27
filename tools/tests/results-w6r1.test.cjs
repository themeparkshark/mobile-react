'use strict';
/**
 * Results lane, wave 6 round 1: the one end watch every game shares (a finished
 * run always gets a lit card), the Banana Basket end (no card can stick on the
 * last step, the finale lands on its own), and the honesty items from the wave 5
 * scorecard (no drawn commas, no filled-looking stars on a loss, no Share on a
 * 0-star loss, Memory says what the kid did, one unlock look, no empty panel).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

const watch = loadTs('src/gamekit/core/endWatch.ts');
const sim = loadTs('src/games/banana-basket/sim.ts');
const bots = loadTs('src/games/banana-basket/bots.ts');
const C = loadTs('src/games/banana-basket/constants.ts');
const gate = loadTs('src/games/banana-basket/endGate.ts');
const scoring = loadTs('src/gamekit/core/scoring.ts');

test('the end watch rescue keeps a game\'s own numbers, never says RUN SAVED, and falls back to the live score', () => {
  const t = { one: 500, two: 1200, three: 2000 };
  const fromGame = plain(watch.endWatchResult({ score: 1300, stars: 2, meta: { game: 'tap', partial: true } }, 0, t));
  assert.equal(fromGame.score, 1300);
  assert.equal(fromGame.stars, 2);
  assert.equal(fromGame.meta.partial, undefined, 'a run that really ended is never a saved run');
  assert.equal(fromGame.meta.endWatch, 'game');
  const shared = plain(watch.endWatchResult(null, 1250.4, t));
  assert.deepEqual([shared.score, shared.stars, shared.meta.endWatch], [1250, 2, 'shared']);
  assert.equal(plain(watch.endWatchResult(undefined, -5)).score, 0);
  assert.equal(watch.END_WATCH_MS, 4000);
  assert.ok(watch.END_WATCH_GRACE_MS <= 1500);
});

test('the end trace keeps one row per finished run; the first lit call wins', () => {
  const run = watch.traceRunOver('banana', 1000);
  watch.traceLit(run, 2500, 'game');
  watch.traceLit(run, 9000, 'shared');
  const row = plain(watch.endTrace()).find((r) => r.run === run);
  assert.deepEqual([row.game, row.overAt, row.litAt, row.by], ['banana', 1000, 2500, 'game']);
});

test('the shell owns the one end watch: rescue, grace, the shared card, and no pause over a finished run', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /endWatch: \(ms\?: number, rescue\?: EndWatchRescue\) => void;/);
  assert.match(shell, /endWatch: armEndWatch,/);
  assert.match(shell, /if \(!wrap\) return result \?\? rescue \?\? null;/, 'the game\'s own result always wins over a rescue');
  const arm = shell.slice(shell.indexOf('const armEndWatch = useCallback'), shell.indexOf('// A result arrived: the watch stands down.'));
  assert.match(arm, /if \(resultInRef\.current\) return;/);
  assert.match(arm, /fromGame = rescueFn\?\.\(\) \?\? null;/);
  assert.match(arm, /if \(fromGame === false\) \{\s*endWatchRun\.current = 0;\s*return;/, 'a stale run stands the watch down');
  assert.match(arm, /\}, END_WATCH_GRACE_MS\);/);
  assert.match(arm, /setRescue\(endWatchResult\(null, scoreRef\.current, thresholdsRef\.current\) as GameResult\);/);
  assert.match(shell, /if \(ownResultsDoneRef\.current \|\| endWatchRun\.current\) return;/, 'a run that is over never pauses behind its card');
  assert.match(shell, /resultInRef\.current = !!result \|\| !!wrap \|\| !!ownResultsDone;/);
  // PLAY AGAIN and a fresh open clear the rescue, and the lit moment is traced.
  assert.match(shell, /clearEndWatch\(\);\s*endWatchRun\.current = 0;\s*setRescue\(null\);\s*onRematch\(\);/);
  assert.match(shell, /traceLit\(endWatchRun\.current, Date\.now\(\), by === 'shared' \? 'shared' : by === 'game' \? 'rescue' : 'game'\);/);
  assert.match(shell, /if \(result \|\| rescue\) \{\s*hadResultRef\.current = true;/);
});

test('every game arms the shell end watch when its run ends', () => {
  const banana = read('src/games/banana-basket/BananaBasketGame.tsx');
  assert.match(banana, /shell\.current\?\.endWatch\?\.\(BANANA_RESULT_WATCH_MS, rescueResult\);\s*finishRun\.current\(\);/, 'TIME! arms it');
  assert.match(banana, /if \(!endWatchArmed\.current && \(s\.done === 1 \|\| timeIsUp\(s\)\)\) \{/, 'an empty timer arms it even if TIME! never reaches JS');
  assert.match(read('src/games/whack/WhackAShark.tsx'), /shellRef\.current\?\.endWatch\(WHACK_END_WATCH_MS, \(\) => plain\);/);
  assert.match(read('src/games/sharky/SharkySwim.tsx'), /if \(!liveRally\) shell\.current\?\.endWatch\(holdMs \+ SHARKY_END_WATCH_MS\);/);
  assert.match(read('src/games/trivia-duel/TriviaDuel.tsx'), /shell\.current\?\.endWatch\(DUEL_END_WATCH_MS, \(\) => pendingShell\.current \?\? null\);/);
  const memory = read('src/games/memory/MemoryGame.tsx');
  assert.match(memory, /shellRef\.current\?\.endWatch\(ms, \(\) => \{/, 'Memory\'s watchdog is the shell end watch now');
  assert.match(memory, /if \(runRef\.current !== r \|\| resultFor\.current === r\) return false;/);
  assert.match(memory, /<GameShellV2\n\s+ref=\{shellRef\}/);
});

test('Banana: a teaching card open on the last step closes with the run (it used to hold the loop forever)', () => {
  assert.equal(gate.stepGate(true, 2, false), gate.GATE_CLOSE_STOP, 'done with a card up: close it, no step');
  assert.equal(gate.stepGate(true, 1, false), gate.GATE_CLOSE_STOP);
  assert.equal(gate.stepGate(true, 0, true), gate.GATE_STOP);
  assert.equal(gate.stepGate(false, 1, true), gate.GATE_WAIT, 'still reading');
  assert.equal(gate.stepGate(false, 2, false), gate.GATE_WAIT, 'waits for the thumb');
  assert.equal(gate.stepGate(false, 2, true), gate.GATE_CLOSE_RUN);
  assert.equal(gate.stepGate(false, 0, false), gate.GATE_RUN);
  const banana = read('src/games/banana-basket/BananaBasketGame.tsx');
  const onStep = banana.slice(banana.indexOf('onStep: () => {'), banana.indexOf('onFrame: (_alpha'));
  assert.ok(onStep.indexOf('stepGate(') < onStep.indexOf('step(s, t, q4)'), 'the card gate is checked before the done stop');
  assert.doesNotMatch(onStep, /if \(!running\.value \|\| s\.done\) return;/, 'no early return on done before the card closes');
  assert.match(banana, /\/\/ A finished run never opens a teaching card over its results\.\s*if \(endedRef\.current\) \{/);
  // deliver: the card's numbers first, every risky step after them, the card before any cue.
  const deliver = banana.slice(banana.indexOf('const deliver = useCallback'), banana.indexOf('const lastProof = useRef'));
  assert.ok(deliver.indexOf('plainResult.current = plain;') < deliver.indexOf('buildProof('));
  assert.match(deliver, /\} catch \(e\) \{/);
  assert.match(deliver, /setTimeout\(\(\) => \{\s*\/\/ The card first: a cue that fails can never hold it back\.\s*setResult\(res\);/);
});

test('Banana: every run reaches its end with the thumb up at TIME! (the finale lands on its own), ride and queue, 30 seeds each', () => {
  for (const [mode, rules] of [[sim.MODE_RIDE, C.R_RIDE], [sim.MODE_QUEUE, C.R_RIDE]]) {
    for (let seed = 1; seed <= 30; seed++) {
      const s = sim.createSim({ seed, difficulty: 2, mode, rules, deck: 'park', unlock: 3, cards: 0xffff, assist: false, twist: 0 });
      const b = bots.createBot(bots.BOT_EXPERT, seed);
      // The game loop, as onStep runs it: the bot holds until time is up, then the kid lets go.
      for (let n = 0; n < 60000 && !s.done; n++) {
        const q4 = bots.botInput(s, b);
        let t = gate.timeIsUp(s) ? 0 : 1;
        if (!t && gate.finaleAutoHold(s)) t = 1;
        if (!t && s.holdTs === 0) break;
        sim.step(s, t, q4);
      }
      assert.equal(s.done, 1, `mode ${mode} seed ${seed} ended`);
    }
  }
});

test('drawn scores have no commas: formatScore is countText', () => {
  assert.equal(scoring.formatScore(1200), '1200');
  assert.equal(scoring.formatScore(2935), '2935');
  assert.equal(scoring.formatScore(125000), '125K');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /value: `\+\$\{countText\(t\.value\)\}`/, 'the tally (+2935, never +2,935)');
  assert.doesNotMatch(read('src/games/whack/render/WhackBoard.tsx'), /commaInt/);
});

test('a loss never looks like a win: dark empty star slots, no Share at 0 stars, no 0% COIN chip, honest Whack words', () => {
  assert.match(read('src/gamekit/results/starSlot.ts'), /export const STAR_SLOT = '#0a4e8a';/);
  for (const f of ['src/gamekit/results/ResultsCard.tsx', 'src/games/sharky/hud/SharkyResults.tsx', 'src/games/trivia-duel/ui/DuelResults.tsx', 'src/games/boss/bash/BashResults.tsx']) {
    const src = read(f);
    assert.match(src, /STAR_SLOT/, f);
    assert.doesNotMatch(src, /name="star"[^>]*'#9cc9ec'/, `${f}: no pale filled-looking empty star`);
  }
  assert.match(read('src/games/memory/MemoryResults.tsx'), /starOff: STAR_SLOT/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /resultCardFooter=\{result && \(result\.stars \?\? 0\) > 0 \? <ShareCardButton chip/);
  assert.doesNotMatch(whack, /% TO GO/);
  assert.doesNotMatch(whack, /label: 'COIN', value:/);
  assert.match(whack, /\(last\?\.result\.coin \?\? 0\) >= 75 \? 'SO CLOSE!' : 'GOOD TRY!'/);
  assert.match(read('src/games/memory/MemoryResults.tsx'), /const canShare = !!data\.daily && data\.stars > 0;/);
});

test('Memory\'s loss card says what the kid did, never the how-to again', () => {
  const { memoryLossCopy } = loadTs('src/games/memory/lossCopy.ts');
  assert.equal(memoryLossCopy(3, 8).line, '3 of 8 pairs!');
  assert.equal(memoryLossCopy(0, 8).line, '0 of 8 pairs! Try again!');
  assert.equal(memoryLossCopy(6, 8).line, '6 of 8 pairs! Just 2 to go!');
  assert.equal(memoryLossCopy(0, 8, false, false).line, 'Tap 2 cards to flip them!', 'only a kid who never flipped hears the move');
  for (let p = 0; p <= 7; p++) assert.doesNotMatch(memoryLossCopy(p, 8).line, /Remember where/);
});

test('one unlock look on every card, bare on the blue: no cream panel waits empty before it', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.doesNotMatch(card, /extrasPop|extrasIn|extrasStyle/, 'no panel pops in ahead of the unlock');
  assert.match(card, /<View style=\{styles\.extrasBare\}>\s*<ResultsSettleContext\.Provider value=\{settle\}>\{extras\}<\/ResultsSettleContext\.Provider>/);
  assert.match(read('src/games/whack/FinnUnlock.tsx'), /<UnlockTile source=\{THEMED_SHARK_FRAMES\[theme\]\[1\]\}/);
  assert.match(read('src/games/whack/FinnUnlock.tsx'), /const at = settle > 0 \? settle : FINN_UNLOCK_AT_MS;/, 'the Finn lands on the settle moment itself');
  assert.match(read('src/games/sharky/hud/SharkyUnlock.tsx'), /<UnlockTile source=\{unlockArt\(card\)\}/);
  assert.match(read('src/gamekit/results/UnlockTile.tsx'), /GameAudio\.play\('fx\.reward'/);
});

test('Banana\'s card reads like the family card: HUD steps back, picture chips, spoken tip, RACE GHOSTS with a bolt', () => {
  const banana = read('src/games/banana-basket/BananaBasketGame.tsx');
  assert.match(banana, /hudBack=\{!!result\}/);
  assert.match(read('src/games/banana-basket/render/Field.tsx'), /<Group opacity=\{hudOp\}>/);
  const rows = banana.slice(banana.indexOf('function ResultsRows'), banana.indexOf('const PLAZA_FX_Y'));
  assert.doesNotMatch(rows, /BALL<|JUGGLE \{|PILE: |STAR BONUS<|GOLD CROWN<|FIRST WIN</, 'no words drawn on the rows');
  assert.match(rows, /<Image source=\{BALL_ART\}/);
  assert.match(banana, /note: stars === 0 \? undefined :/);
  assert.match(banana, /spokenNote: stars === 0 \? tipLine\(facts\) : undefined,/);
  assert.match(banana, /challengeLabel="Race ghosts"/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /<GameIcon name="rush" size=\{20\} \/>/);
  assert.doesNotMatch(shell, /'swords'/, 'no weapon on a challenge button');
  assert.match(read('src/gamekit/results/ResultsCard.tsx'), /\+ \(spokenNote \? `\. \$\{spokenNote\}` : ''\)/);
});

test('Sharky never shows a still 0 or ALL 3 STARS! ahead of its stars; Memory and the Duel speak their words', () => {
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(sharky, /punch=\{1\} reducedMotion=\{reducedMotion\} hideUntilCount/);
  assert.match(sharky, /<NextStarBar goal=\{goal\} delayMs=\{titleAt\}/);
  const count = read('src/gamekit/fx/CountUpText.tsx');
  assert.match(count, /if \(vis\.value < 1\) vis\.value = withDelay\(wait, withTiming\(1, \{ duration: 60 \}\)\);/);
  const extras = read('src/games/memory/MemoryExtras.tsx');
  assert.match(extras, /<View style=\{styles\.newTag\}><Text style=\{styles\.newTagText\}>NEW<\/Text><\/View>/);
  assert.doesNotMatch(extras.slice(extras.indexOf('export function NewChip'), extras.indexOf('// Share grid')), /\{label\}<\/Text>/, 'no NEW CARD caption under each card');
  const results = read('src/games/memory/MemoryResults.tsx');
  assert.match(results, /n\.label === 'TURNS' \? <Image source=\{TURN_CARD\}/);
  const duel = loadTs('src/games/trivia-duel/ui/DuelResults.tsx', {
    '../../../services/external': { openExternal() {} }, react: {}, 'react-native': { StyleSheet: { create: (s) => s } },
    'react-native-reanimated': {}, '../art': { ART: {}, C: {} }, '../../../gamekit/results/ResultsRibbon': {},
    '../../../gamekit/results/ResultsCard': {}, '../../../gamekit/results/feelings': { feelingChips: (s) => s }, '../../../ui/GameIcon': {},
    '../../../gamekit/audio/GameAudio': { GameAudio: {} }, '../../../gamekit/Haptics': { playHaptic() {} },
    'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'F' }, 'react-native-safe-area-context': { initialWindowMetrics: null },
  });
  assert.equal(duel.polaroidBolts([{ label: 'Fastest answer', value: 'Lightning' }]), 3);
  assert.equal(duel.polaroidBolts([]), 1);
  assert.doesNotMatch(read('src/games/trivia-duel/ui/DuelResults.tsx'), /styles\.polTime/, 'no bare "0.4s" on the polaroid');
});

test('every picture the new results art asks for exists (a bad path breaks the whole bundle)', () => {
  for (const f of ['src/games/banana-basket/BananaBasketGame.tsx', 'src/games/memory/MemoryResults.tsx', 'src/games/memory/MemoryExtras.tsx',
    'src/gamekit/results/UnlockTile.tsx', 'src/games/whack/FinnUnlock.tsx', 'src/games/sharky/hud/SharkyUnlock.tsx']) {
    const src = read(f);
    for (const m of src.matchAll(/require\('(\.[^']+\.(?:png|jpe?g|webp))'\)/g)) {
      // Metro also takes the @2x and @3x files for a picture.
      const full = path.resolve(root, path.dirname(f), m[1]);
      const scaled = ['', '@2x', '@3x'].map((k) => full.replace(/(\.[a-z]+)$/, `${k}$1`));
      assert.ok(scaled.some((x) => fs.existsSync(x)), `${f}: ${m[1]}`);
    }
  }
});
