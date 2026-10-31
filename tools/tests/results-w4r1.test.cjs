const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/results-w4r1.test.cjs
// Wave 4 round 1 of the results lane: titles follow stars, each idea once,
// extras inside the card, the peek anchored to the ribbon, Memory's try card
// in the family look, one KO mark on the Boss card, a gentler Duel zoom.
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ts = require(path.join(root, 'node_modules/typescript'));
const vm = require('node:vm');

function loadTs(rel) {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({}) });
  return mod.exports;
}

test('titles follow stars: two stars is always GREAT!, even near star 3 and under a game title', () => {
  const f = loadTs('src/gamekit/results/feelings.ts');
  assert.equal(f.feelingTitle(2, true), 'GREAT!');
  assert.equal(f.feelingTitle(2, false), 'GREAT!');
  assert.equal(f.feelingTitle(3, true), 'INCREDIBLE!');
  assert.equal(f.feelingTitle(0, true), 'SO CLOSE!', 'SO CLOSE! stays for a 0-star run that really was close');
  assert.equal(f.bestAwareTitle('SO CLOSE!', 2, false), 'GREAT!');
  assert.equal(f.bestAwareTitle('GOOD TRY!', 3, false), 'INCREDIBLE!');
  assert.equal(f.bestAwareTitle('COIN CAUGHT!', 2, false), 'COIN CAUGHT!', 'real info titles stay');
});

test('the shared card says each idea once: no star-gap pill over the bar, BEST only with no pill, the tally folds into the score', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /const nearForPill = best\.isNewBest \|\| \(goal && near\.kind === 'nearStar'\) \? null : near;/);
  assert.match(card, /const showBest = !!personalBest && !showNear && /);
  // The tally sits on the score's spot (absolute, no row of its own) and folds into it.
  assert.match(card, /buckets: \{ position: 'absolute'/);
  assert.match(card, /<TallyFold foldAt=\{countDelay\}/);
  assert.match(card, /fold\.value = withDelay\(foldAt, withTiming\(1, \{ duration: TALLY_FOLD_MS/);
  assert.match(card, /opacity: pop\.value > 0\.02 \? 1 - fold\.value : 0/);
  // The bucket numbers are spoken with the score.
  assert.match(card, /`Score \$\{formatScore\(score\)\}\. \$\{buckets!\.map\(\(b\) => `\$\{b\.label\} \$\{b\.value\}`\)\.join\(', '\)\}`/);
});

test('extras sit inside the card above the buttons, so DONE is always the bottom row', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /\) : <View style=\{styles\.extras\}>\{extras\}<\/View>\n\s+\) : null\}\n\n\s+\{actions \? <View style=\{styles\.actions\}>\{actions\}<\/View> : null\}/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.doesNotMatch(shell, /<\/ResultsCard>\n\s+\{resultExtras/);
});

test('the peek lives in the card under the ribbon (anchored to its real top), the podium only measures', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /\{peek > 0 && !sendOff \? <PodiumPeek scale=\{peek\} reducedMotion=\{reducedMotion\} \/> : null\}\n\s+<ResultsRibbon/, 'drawn before the ribbon, so the ribbon covers its feet');
  assert.match(card, /peekClip: \{ position: 'absolute', top: -220, right: 20, width: 140, height: 220 \+ PEEK_FOOT_PT, overflow: 'hidden'/);
  assert.match(card, /withRepeat\(withSequence\([\s\S]*?\), PEEK_HOPS\)/, 'hops a few times, then rests');
  const podium = read('src/gamekit/results/ResultsPodium.tsx');
  assert.doesNotMatch(podium, /mode === 'peek' \? \(/, 'the podium zone no longer draws a floating shark');
  assert.match(podium, /useEffect\(\(\) => \{ onPeekRef\.current\?\.\(peekK\); \}, \[peekK\]\);/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /onPeek=\{setPeekK\}/);
  assert.match(shell, /peek=\{peekK\}/);
});

test('on a short phone the X steps out when the shared card is up (never half under the ribbon)', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const xGone = showSharedCard && SCREEN_H < SHORT_PHONE_PT;/);
  assert.match(shell, /xGone && styles\.headerGone/);
  assert.match(shell, /disabled=\{xGone\}/);
});

test('Reduce Motion results are still (first-session fix kept): no animated style on the results wrappers', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /resultsStill: \{ opacity: 1, transform: \[\{ scale: 1 \}\] \}/);
  assert.equal((shell.match(/reducedMotion \? styles\.resultsStill : resultsScaleStyle/g) || []).length, 2);
  assert.equal((shell.match(/resultsSafe \|\| reducedMotion \? styles\.resultsShown : resultsFadeStyle/g) || []).length, 2);
});

test('the Boss card is bottom-anchored and shows one KO mark', () => {
  const bash = read('src/games/boss/bash/BashResults.tsx');
  assert.match(bash, /stage: \{ width: '100%', alignItems: 'center', justifyContent: 'flex-end'/);
  assert.match(bash, /const koInStars = ko && stars < 3 && !noHits;/);
  assert.match(bash, /\{won && !koInStars \? <View style=\{styles\.koPill\}/);
  assert.match(bash, /\(koInStars && i === 2\)/);
});

test('the Duel takeover zoom keeps both sharks inside the screen (cap 1.16)', () => {
  const tk = loadTs('src/games/trivia-duel/engine/takeover.ts');
  assert.ok(tk.TAKEOVER_ZOOM_MAX <= 1.16);
});

test('no percentage drawn on a results card extra (Banana Basket ball share is a bar, the number is spoken)', () => {
  const banana = read('src/games/banana-basket/BananaBasketGame.tsx');
  assert.doesNotMatch(banana, /BALL \{x\.share\}%/);
  // Wave 6: the rows are pictures (ball, bunch, badges); every number and word is spoken.
  assert.match(banana, /accessibilityLabel=\{`Best juggle: \$\{x\.juggle\}/);
});

test('a Memory run that ran out of time shows the pairs it found as coins, never MEMORY 0%', () => {
  const res = read('src/games/memory/MemoryResults.tsx');
  assert.match(res, /const pairPips = !data\.won && !data\.headline && data\.pairs/);
  assert.match(res, /accessibilityLabel=\{`\$\{pairPips\[0\]\} of \$\{pairPips\[1\]\} pairs found`\}/);
  assert.match(read('src/games/memory/MemoryGame.tsx'), /pairs: \[e\.pairs, e\.pairsTotal\],/);
});
