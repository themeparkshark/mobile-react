// Results and game feel (polish Oct 23, results lane): every game ends on a
// card that shows feelings, a queue event never throws a run away, Whack
// words never pile up, and a wait opens with a showpiece game.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(name) { return dependencies[name] ?? {}; },
  }, { filename: file });
  return moduleRef.exports;
}
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const feelings = load('src/gamekit/results/feelings.ts');
const wordGate = load('src/games/whack/wordGate.ts');
const session = load('src/gamekit/core/session.ts');
const lineplay = load('src/services/lineplay/LinePlaySession.ts', {
  './content': { buildPredictionCard: wait => ({ id: `pred-${wait}`, postedWaitMinutes: wait }) },
  '../../games/trivia/config': { LINEPLAY_ROUND_QUESTIONS: 5 },
});

test('chips are brags, never data: no %, ms, zero counts, sentences; at most two', () => {
  const chips = feelings.feelingChips([
    { label: 'Accuracy', value: '22%' },
    { label: 'QUICK', value: '50%' },
    { label: 'Timing', value: '31ms late' },
    { label: 'NEXT STAR', value: '+7290' },
    { label: 'Bursts', value: '0/4' },
    { label: 'Tip', value: 'Tap on the beat for a bigger chain' },
    { label: 'Drum-Off', value: '2nd place' },
    { label: 'Bursts', value: '3/4' },
    { label: 'Fever', value: '2 drops' },
  ], 4);
  assert.deepEqual([...chips.map(c => c.label)], ['BEST COMBO', 'DRUM-OFF']);
  assert.equal(chips[0].value, 'x4');
  assert.equal(chips.length, feelings.MAX_FEELING_CHIPS);
  // A combo of 1 or 2 is not a brag.
  assert.equal(feelings.feelingChips([], 1).length, 0);
  assert.equal(feelings.feelingChips([], 2).length, 0, 'BEST COMBO x2 is two hits in a row, not a brag');
  assert.equal(feelings.feelingChips([], 3)[0].value, 'x3');
});

test('counts a kid cannot read become dots; the next-star read is one word and a bar', () => {
  const [pips] = feelings.feelingChips([{ label: 'Bursts', value: '3/4', pips: [3, 4] }]);
  assert.deepEqual([...pips.pips], [3, 3], 'brag dots show only what was earned, never the empty slots');
  assert.equal(feelings.feelingChips([{ label: 'Bursts', value: '0/4', pips: [0, 4] }]).length, 0, 'no dots, no chip');
  assert.equal(feelings.nextStarWord({ nextStar: 1, progress: 0.12, near: false }), 'KEEP GOING');
  assert.equal(feelings.nextStarWord({ nextStar: 1, progress: 0.6, near: false }), 'HALFWAY THERE');
  assert.equal(feelings.nextStarWord({ nextStar: 2, progress: 0.9, near: true }), 'ALMOST!');
  assert.equal(feelings.nextStarWord({ nextStar: 0, progress: 1, near: false }), 'ALL 3 STARS!');
  for (const w of ['KEEP GOING', 'HALFWAY THERE', 'ALMOST!']) assert.doesNotMatch(w, /\d/);
  const bar = read('src/gamekit/results/NextStarBar.tsx');
  assert.match(bar, /nextStarWord\(goal\)/);
  assert.match(bar, /accessibilityLabel=\{a11yLabel \?\? \(goal\.nextStar/, 'the numbers live in the accessibility label');
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.doesNotMatch(card, /NEXT STAR \$\{|TO GO`/, 'no "NEXT STAR 8,000 / 7,050 TO GO" on the card');
  assert.match(card, /<NextStarBar goal=\{goal\}/);
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(sharky, /<NextStarBar goal=\{goal\}/, 'Sharky uses the same next-star bar');
});

test('one feeling line: beat a ghost, then a streak, then so close', () => {
  assert.equal(feelings.feelingLine({ streak: 3, near: { kind: 'beatRival', text: 'You beat Finn!' } }).text, 'You beat Finn!');
  const streak = feelings.feelingLine({ streak: 3, near: { kind: 'nearStar', text: 'So close to a star' } });
  assert.equal(streak.text, '3 wins in a row!');
  assert.equal(streak.tone, 'gold');
  const close = feelings.feelingLine({ streak: 1, near: { kind: 'nearStar', text: 'So close to a star' } });
  assert.equal(close.tone, 'light');
  assert.equal(feelings.feelingLine({ streak: 0, near: null }).kind, 'none');
});

test('streaks count each run once and reset on a no-star run', () => {
  feelings.resetStreaks();
  assert.equal(feelings.noteRun('whack', 1, true), 1);
  assert.equal(feelings.noteRun('whack', 1, true), 1, 'a re-render of the same run does not count twice');
  assert.equal(feelings.noteRun('whack', 2, true), 2);
  assert.equal(feelings.noteRun('sharky', 3, true), 1, 'each game has its own streak');
  assert.equal(feelings.noteRun('whack', 4, false), 0);
});

test('titles never say you lost', () => {
  for (const stars of [0, 1, 2, 3]) {
    for (const near of [true, false]) {
      const t = feelings.feelingTitle(stars, near);
      assert.doesNotMatch(t, /\bLOS[ET]\b|FAIL|TRY AGAIN/);
    }
  }
  assert.equal(feelings.feelingTitle(0, false), 'GOOD TRY!');
  assert.equal(feelings.feelingTitle(3, false), 'INCREDIBLE!');
});

test('Whack floats at most two words at once; big moments always show', () => {
  const g = wordGate.createWordGate();
  assert.equal(wordGate.allowWord(g, 0), true);
  assert.equal(wordGate.allowWord(g, 50), true);
  assert.equal(wordGate.allowWord(g, 100), false, 'a third word in the same flurry is dropped');
  assert.equal(wordGate.allowWord(g, 120, true), true, 'FEVER! still shows');
  assert.equal(wordGate.allowWord(g, 900), true, 'old words faded, room again');
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /allowWord\(words\.current/);
  assert.match(juice, /BONKS! \+/, 'a flurry with no multiplier never reads "x1 COMBO"');
});

test('a queue event never throws the run away (RUN SAVED, never a fake star), but a paid challenge must be won', () => {
  assert.deepEqual({ ...session.wrapUpStars(0, 120, false) }, { stars: 0, partial: true }, 'a saved run is not a lit star');
  assert.deepEqual({ ...session.wrapUpStars(2, 900, false) }, { stars: 2, partial: false });
  assert.deepEqual({ ...session.wrapUpStars(0, 0, false) }, { stars: 0, partial: false });
  assert.deepEqual({ ...session.wrapUpStars(0, 500, true) }, { stars: 0, partial: false });
  assert.equal(session.isEmptyResultsNode(null), true);
  assert.equal(session.isEmptyResultsNode(undefined), true);
  assert.equal(session.isEmptyResultsNode(false), true);
  assert.equal(session.isEmptyResultsNode(''), true);
  assert.equal(session.isEmptyResultsNode({ type: 'View' }), false);
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /\{saved \|\| sendOff \? \(\n\s+<SavedStamp/, 'RUN SAVED stamps in where the stars would be');
  assert.match(card, /if \(saved \|\| wrapUp\) return null;/, 'a saved run has no next-star bar to disagree with');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /if \(!partial\) session\.recordGameResult\(game\.gameId, stars\);\n\s+session\.markActivityCompleted\(game\.id\);/,
    'a saved partial run counts as played but never changes the best or difficulty');
});

test('LinePlay tells an open game when the wait really ends, never on the undoable GPS grace', () => {
  assert.equal(lineplay.queueEndedReason('active', null), null);
  assert.equal(lineplay.queueEndedReason('paused', 'boarded'), null);
  // 'ending' is the 60 s undoable grace (often GPS drift): an open game keeps playing.
  assert.equal(lineplay.queueEndedReason('ending', 'left_queue'), null);
  assert.equal(lineplay.queueEndedReason('ending', 'manual'), null);
  assert.equal(lineplay.queueEndedReason('ending', 'boarded'), null, 'a guess is not a yes');
  assert.equal(lineplay.queueEndedReason('ending', 'left_queue', true), 'boarding', 'the guest said yes');
  assert.equal(lineplay.queueEndedReason('complete', 'boarded'), 'boarding');
  assert.equal(lineplay.queueEndedReason('complete', 'left_queue'), 'left-queue');
  assert.equal(lineplay.queueEndedReason('complete', 'manual'), 'session-ended');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /queueEndedReason\(snapshot\.state, snapshot\.endReason, snapshot\.boardingConfirmed\)/);
  assert.match(screen, /queueEnded,\n\s+rideUpLikely: snapshot\.boardingSuggested/);
  assert.match(screen, /onBoardingAnswer: \(boarded: boolean\) => \{\n\s+if \(!boarded\) \{ session\.dismissBoardingSuggestion\(\); return; \}\n\s+void session\.endNow\(true\)/);
  assert.match(screen, /onRunDone: \(stars: number, partial: boolean\) =>/);
  const src = read('src/services/lineplay/LinePlaySession.ts');
  assert.match(src, /if \(this\.gameOpen\) this\.holdGrace\(\);/, 'the grace still waits for an open game');
});

test('a ride-detection guess never ends a run: a held round asks inside the game', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.doesNotMatch(shell, /rideUpLikely && phase === 'paused' && startedRef\.current\) wrapUp/, 'no auto wrap-up on the hint');
  assert.doesNotMatch(shell, /wrapUpRef\.current\('boarding'\)/, 'coming back from the pocket never wraps up');
  assert.match(shell, /if \(rideUpLikelyRef\.current && startedRef\.current && askBoardingRef\.current\) return;\n\s+doResumeRef\.current\(\);/);
  assert.match(shell, /Did your ride start\?/);
  assert.match(shell, /SAVE MY RUN/);
  assert.match(shell, /KEEP PLAYING/);
  assert.match(shell, /linePlayMovement\?\.onBoardingAnswer\?\.\(false\);\n\s+doResume\(\);/);
  // Boarding is recorded only after the saved run is counted.
  assert.match(shell, /linePlayMovement\?\.onRunDone\?\.\(0, effectiveResult\?\.meta\?\.partial === true\);\n\s+onClose\(\);\n\s+\}\n[\s\S]{0,120}if \(boardingAnsweredRef\.current\)/);
});

test('one button rule on every results card: PLAY AGAIN leads, the run is counted first', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const playAgainFirst = rematchOffered && \(!won \|\| canBankRun\);/);
  assert.match(shell, /\{playAgainFirst \? 'PLAY AGAIN' : claimLabel\}/);
  assert.match(shell, /linePlayMovement\.onRunDone\(effectiveResult\.stars \?\? 0, effectiveResult\.meta\?\.partial === true\);\n\s+\}\n\s+onRematch\(\);/,
    'PLAY AGAIN in a queue counts the run before replaying');
  assert.match(shell, /footer=\{resultCardFooter\}/, 'SHARE sits inside the card');
  assert.doesNotMatch(shell, />Close<|>Play again</, 'one caps font family on every button');
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(sharky, /const primaryLabel = againFirst \? 'PLAY AGAIN' : claimLabel;/);
  assert.doesNotMatch(sharky, /textDecorationLine: 'underline'/, 'DONE is a button, not a text link');
  const cq = read('src/games/current-quest/ResultsCard.tsx');
  assert.match(cq, />PLAY AGAIN</);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /resultCardFooter=\{result \? <ShareCardButton chip/);
});

test('every wait opens with a showpiece (Whack or Sharky); Current Quest v1 is never first or second', () => {
  for (let rotation = 0; rotation < 24; rotation += 1) {
    const order = lineplay.queueGameOrder(rotation);
    assert.ok(['tap', 'shark'].includes(order[0]), `rotation ${rotation} opens with ${order[0]}`);
    assert.ok(order.indexOf('current') >= 2, `rotation ${rotation} puts Current Quest at ${order.indexOf('current')}`);
    assert.equal(new Set(order).size, order.length, 'no repeats in one cycle');
    assert.equal(order.length, lineplay.MINIGAME_CYCLE.length);
  }
  assert.notEqual(lineplay.queueGameOrder(0)[0], lineplay.queueGameOrder(1)[0], 'the opener alternates by visit');
  const playlist = lineplay.generatePlaylist(30, 30, 0);
  const firstGame = playlist.find(item => item.kind === 'minigame');
  assert.ok(firstGame && ['tap', 'shark'].includes(firstGame.gameId));
});

test('the shell never ends on a dark screen: fallback timer, shared card, no-star runs still count', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /RESULTS_FALLBACK_MS = 600/);
  assert.match(shell, /showSharedCard = phase === 'results' && \(!renderResults \|\| !effectiveResult \|\| \(gameResults == null && \(resultsSafe \|\| wrap != null\)\)\)/);
  // The safety net snaps only the fade; the settle spring keeps its own scale (no pop at 600 ms).
  assert.match(shell, /resultsSafe \? styles\.resultsShown : resultsFadeStyle/);
  assert.match(shell, /resultsShown: \{ opacity: 1 \}/);
  assert.match(shell, /<Animated\.View style=\{resultsScaleStyle\}>/);
  assert.match(shell, /if \(visible && queueEnded\) wrapUp\(queueEnded\)/);
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /feelingChips\(stats, maxCombo, plain \? 1 : undefined\)/);
});

test('Sharky Swim results brag and point at a goal instead of listing zeros', () => {
  const lines = load('src/games/sharky/hud/resultLines.ts', { '../../../gamekit/results/feelings': load('src/gamekit/results/feelings.ts') });
  assert.equal(lines.sharkyBragLine(1, 0), '', 'x1 chain and 0 Close Skims is nothing to show');
  assert.equal(lines.sharkyBragLine(4, 9), 'Best chain x4  ·  9 Close Skims');
  assert.equal(lines.sharkyBragLine(1, 1), '1 Close Skim');
  assert.equal(lines.sharkyStarGoalLine(238, 2500), 'Next star at 2,500', 'far away is a target, not "Only 2262"');
  assert.equal(lines.sharkyStarGoalLine(2300, 2500), 'So close! 200 more for a star');
  assert.equal(lines.showSplits([-64, -12]), false, 'a row of red bars never shows');
  assert.equal(lines.showSplits([30, -64]), false, 'one lucky gate in a run that ended behind shows nothing');
  assert.equal(lines.showSplits([-64, 30]), true, 'finished ahead');
  assert.deepEqual([...lines.aheadBars([40, -10, 30])], [40, 30], 'only green bars');
  assert.deepEqual([...lines.aheadBars([-10, 30])], [], 'never a lone square');
  assert.equal(lines.sharkyNearBestLine(900, 1000), 'So close to your best!');
  assert.equal(lines.sharkyNearBestLine(100, 1000), '');
  const card = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.doesNotMatch(card, /DANGER/, 'no red split bars');
  const swim = read('src/games/sharky/SharkySwim.tsx');
  assert.doesNotMatch(swim, /'WIPEOUT!'/, 'a 0-star wipeout gets the shared feeling title');
  assert.match(swim, /return feelingTitle\(stars, near\);/);
});

test('Whack: true buckets, no zeros, dropped score words fold into one total, no minus chip in play', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /\{ label: 'POINTS', value: base \}, \{ label: 'COMBO', value: combo \}, \{ label: 'BONUS', value: bonus \}\]\.filter\(\(t\) => t\.value > 0\)/);
  assert.match(whack, /const tallies = filled\.length >= 2 \? filled : \[\];/, 'one bucket would just repeat the score');
  assert.doesNotMatch(whack, /label: 'QUICK', value: `\$\{b\.result\.quick\}`/, 'the between-bursts card has no counts');
  assert.doesNotMatch(whack, /BEHIND YOUR BEST/);
  assert.match(whack, /pips: \[banked\.length, totalBursts\]/);
  const overlays = read('src/games/whack/ui/Overlays.tsx');
  assert.match(overlays, /p\.burstScore > 0 \? `\+\$\{count\.toLocaleString\(\)\}` : 'WARMING UP'/, 'never "+0"');
  assert.match(overlays, /p\.boostReady \|\| p\.walkMeters >= 1/, 'never "+0m walked"');
  assert.equal(wordGate.droppedPoints('QUICK +80'), 80);
  assert.equal(wordGate.droppedPoints('KNOCKOUT! +1,200'), 1200);
  assert.equal(wordGate.droppedPoints('BOLTED!'), 0);
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /words\.current \?\?= createWordGate\(\);/, 'the gate is made once, lazily');
  assert.match(juice, /foldedPts\.current \+= droppedPoints\(at\.text\);/);
  assert.match(juice, /stamp: `\+\$\{foldedPts\.current\}`/);
  const board = read('src/games/whack/render/WhackBoard.tsx');
  assert.match(board, /const paceOp = useDerivedValue\(\(\) => \(pace\.value >= 1 \? 1 : 0\)\);/, 'VS BEST shows only when ahead');
});

test('round 3: one rule everywhere (x3 chains, one RUN SAVED stamp, saved said once, no percents, short buttons)', () => {
  const lines = load('src/games/sharky/hud/resultLines.ts', { '../../../gamekit/results/feelings': load('src/gamekit/results/feelings.ts') });
  assert.equal(lines.sharkyBragLine(2, 0), '', 'a x2 chain is not a brag (the shared rule is x3)');
  assert.equal(lines.sharkyBragLine(3, 0), 'Best chain x3');
  assert.equal(lines.sharkyGateWord(0.9), 'ALMOST AT THE GATE!');
  assert.equal(lines.sharkyGateWord(0.6), 'HALFWAY TO THE GATE!');
  assert.equal(lines.sharkyGateWord(0.1), 'KEEP SWIMMING!');
  assert.equal(lines.sharkyGateProgress(30000, 15000), 0.99, 'a miss never shows a full bar');
  assert.equal(lines.sharkyGateProgress(7500, 15000), 0.5);
  assert.equal(lines.showSplits([40], 3), false, 'ahead at gate 1, then crashed before the ghost\'s gate 3: not ahead of your best');
  assert.equal(lines.showSplits([40, -5, 20], 3), true, 'went as far as the ghost and led at the last gate');
  assert.match(read('src/games/sharky/hud/SharkyResults.tsx'), /const ahead = !newBest && showSplits\(data\.splits, data\.ghostGates \?\? 0\);/);
  const swim = read('src/games/sharky/SharkySwim.tsx');
  assert.doesNotMatch(swim, /% to the gate/, 'no percent on the ride card');
  assert.doesNotMatch(swim, /RACE THE GHOSTS/, 'the label fits its half-width button');
  const card = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(card, /<SavedStamp reducedMotion=\{reducedMotion\}/, 'Sharky uses the shared gold stamp');
  assert.doesNotMatch(card, />RUN SAVED</, 'no plain-text RUN SAVED');
  assert.match(card, /const feeling = ahead \? 'AHEAD OF YOUR BEST!'/, 'the best news sits in the feeling slot under the score');
  assert.match(card, /word=\{sharkyGateWord\(gate\)\}/);
  assert.doesNotMatch(card, /GameIcon name="swords"/, 'a race button never shows swords');
  assert.match(card, /PLAY_PULSES = 3/);
  assert.doesNotMatch(card, /\), -1\)/, 'nothing on the Sharky card loops forever');
  // Saved is said once: the stamp. Title and note never repeat it.
  const session = load('src/gamekit/core/session.ts');
  for (const reason of ['boarding', 'left-queue', 'session-ended']) {
    const c = session.wrapUpCopy(reason, true);
    assert.doesNotMatch(`${c.title} ${c.body}`, /saved/i, `${reason}: the stamp already says saved`);
  }
  assert.equal(session.wrapUpCopy('boarding', true).body, 'Enjoy the ride!');
  assert.equal(session.wrapUpCopy('boarding', false).body, 'Run saved. Enjoy the ride!', 'a starred wrap-up still says it was saved');
  // A 0-star card reads in one glance.
  const feel = load('src/gamekit/results/feelings.ts');
  assert.equal(feel.nearBest(800, 1000), true);
  assert.equal(feel.nearBest(260, 1410), false, 'a 260 run under a 1,410 best drops the BEST line');
  const rc = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(rc, /const plain = stars === 0 && !best\.isNewBest;/);
  assert.match(rc, /\{footer && !plain \?/, 'no share chip on a plain 0-star run');
  assert.match(rc, /const nBuckets = plain \|\| short \? 0 : buckets\?\.length \?\? 0;/, 'no tally buckets on a plain 0-star run or a short phone');
  assert.match(rc, /export const SHORT_PHONE_PT = 740;/, 'an iPhone SE gets the compact card');
  // The bar grows with a transform, not a width relayout.
  const bar = read('src/gamekit/results/NextStarBar.tsx');
  assert.match(bar, /scaleX: Math\.max\(0, Math\.min\(1, bar\.value\)\)/);
  assert.match(bar, /transformOrigin: 'left'/);
  assert.doesNotMatch(bar, /width: `\$\{/);
  // Boss Bash no-hit card speaks like the rest.
  const bash = read('src/games/boss/bash/BashResults.tsx');
  assert.doesNotMatch(bash, /'MISSED IT'|'BACK'/);
  // Group turns: one try, DONE only.
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const rematchOffered = !rideChallenge && !wrap && !turnOnly && !!rematchRun;/);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /turnOnly: activeGame\?\.groupTurn === true,/);
});

test('every results title is caps, and Rhythm never asks for a star you already have', () => {
  const rhythm = read('src/games/rhythm/RhythmTapGame.tsx');
  const fn = rhythm.slice(rhythm.indexOf('function resultMessage('), rhythm.indexOf('function gripLabel('));
  for (const [, title] of fn.matchAll(/return '([^']+)';/g)) assert.equal(title, title.toUpperCase(), `"${title}" is caps`);
  const starGoal = read('src/games/rhythm/core/starGoal.ts');
  assert.match(starGoal, /tiers\.find\(\(\[at, n\]\) => n > stars && acc < at\)/, 'the goal is always a star above the ones earned');
  assert.doesNotMatch(starGoal, /for \$\{next\[1\]\} star/, 'no "26 more PERFECTs for 1 star" on a 1-star card');
  const cq = read('src/games/current-quest/v1/CurrentQuestGame.tsx');
  assert.match(cq, /message: 'TREASURE FOUND!'/);
});

// -- Round 4 -----------------------------------------------------------------

test('a personal best always feels like a win, even with 0 stars', () => {
  assert.equal(feelings.bestAwareTitle('GOOD TRY!', 0, true), 'YOUR BEST YET!');
  assert.equal(feelings.bestAwareTitle(undefined, 0, true), 'YOUR BEST YET!');
  assert.equal(feelings.bestAwareTitle('KEEP MARCHING!', 0, true), 'YOUR BEST YET!');
  assert.equal(feelings.bestAwareTitle("YOUR RIDE'S UP!", 0, true), "YOUR RIDE'S UP!", 'real info titles stay');
  assert.equal(feelings.bestAwareTitle('TIME!', 0, true), 'TIME!');
  assert.equal(feelings.bestAwareTitle('GOOD TRY!', 0, false), 'GOOD TRY!');
  assert.equal(feelings.bestAwareTitle('NICE!', 1, true), 'NICE!');
  assert.equal(feelings.feelingTitle(0, false, true), 'YOUR BEST YET!');
  assert.equal(feelings.endFeel({ stars: 0, isNewBest: true, saved: false }), 'best');
  assert.equal(feelings.endFeel({ stars: 2, isNewBest: false, saved: false }), 'win');
  assert.equal(feelings.endFeel({ stars: 0, isNewBest: false, saved: true }), 'saved', 'a saved run is calm, never a fail buzz');
  assert.equal(feelings.endFeel({ stars: 0, isNewBest: true, saved: true }), 'saved', 'a saved run never sets a best, so it never claims one');
  assert.equal(feelings.endFeel({ stars: 0, isNewBest: false, saved: false }), 'try');
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /if \(feel === 'win' \|\| feel === 'best'\) \{\n\s+Haptic\.success\(\);\n\s+if \(!ownSfx\) playSfx\('win'\);/);
  assert.match(shell, /\} else if \(feel === 'try'\) \{\n\s+Haptic\.failBuzz\(\);\n\s+if \(!ownSfx\) playSfx\('lose'\);/);
  assert.doesNotMatch(shell, /Haptic\[effectiveResult\.stars > 0 \? 'success' : 'failBuzz'\]/, 'sound and haptic no longer key on stars alone');
  assert.match(shell, /onNewBestLanded=\{stars === 0 \? burstBest : undefined\}/, 'one small confetti burst when the badge lands');
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /bestAwareTitle\(message, stars, best\.isNewBest\)/);
  assert.match(card, /saved \? compareBest\(0, personalBest\) : compareBest\(score, personalBest\)/, 'no NEW BEST on a saved run');
});

test('the line ended the run: title, stamp and note come from the same saved flag; no bar after the ride', () => {
  const left = session.creditWrapResult({ score: 900, stars: 1 }, 'left-queue', false);
  assert.equal(left.stars, 1);
  assert.equal(left.meta.partial, undefined);
  assert.equal(left.message, session.wrapUpCopy('left-queue', false).title, 'a starred left-queue run is not ALL DONE!');
  const saved = session.creditWrapResult({ score: 400, stars: 0 }, 'left-queue', false);
  assert.equal(saved.meta.partial, true);
  assert.equal(saved.message, 'ALL DONE!');
  const zero = session.creditWrapResult({ score: 0, stars: 0 }, 'boarding', false);
  assert.equal(zero.meta.partial, undefined);
  assert.equal(zero.message, "YOUR RIDE'S UP!");
  assert.equal(session.creditWrapResult({ score: 400, stars: 0 }, 'boarding', false, 'RAID BOSS DOWN!').message, 'RAID BOSS DOWN!', "a game's own wrap title is kept");
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /return creditWrapResult\(result, wrap\.reason, !!rideChallenge, wrap\.gameMessage\);/);
  assert.doesNotMatch(shell, /message: wrap\.result\.message/, 'never the older snapshot title');
  assert.match(shell, /wrapUp=\{wrap != null\}/);
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /if \(saved \|\| wrapUp\) return null;/, 'no KEEP GOING bar once the line ended the run');
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(sharky, /!saved && !wrapTitle \? nextStarGoal/);
});

test('Rhythm gets the shared bar: timing fills it, the goal is spoken only, Easy Beat is a caps button in the stack', () => {
  const goal = load('src/games/rhythm/core/starGoal.ts', { './types': load('src/games/rhythm/core/types.ts') });
  const a = goal.rhythmStarGoal(30, 0, 40);
  assert.equal(a.nextStar, 1);
  assert.equal(a.progress, 0.5);
  assert.match(a.a11y, /more PERFECTS? for a star/);
  const b = goal.rhythmStarGoal(70, 1, 40);
  assert.equal(b.nextStar, 2);
  assert.equal(b.progress, 0.5);
  assert.equal(goal.rhythmStarGoal(95, 3, 40).nextStar, 0);
  const ride = goal.rhythmStarGoal(50, 0, 40, { hitRate: 0.6, win: false });
  assert.equal(ride.nextStar, 1);
  assert.ok(Math.abs(ride.progress - 0.8) < 1e-9);
  assert.doesNotMatch(ride.a11y, /%/);
  const rhythm = read('src/games/rhythm/RhythmTapGame.tsx');
  assert.match(rhythm, /starGoal: plan\.ftue \? undefined : rhythmStarGoal\(/);
  assert.match(rhythm, /note: undefined,/, 'no text-only goal on the card');
  assert.doesNotMatch(rhythm, /Try with Easy Beat/);
  assert.match(rhythm, /resultAction=\{/);
  assert.match(rhythm, /label: 'YOUR BEAT', value: sum\.steadinessLabel\.toUpperCase\(\)/);
  assert.match(rhythm, />TRY TWO THUMBS\?</);
  assert.doesNotMatch(rhythm, /Hit 3 of every 4 \(\$\{hr\}%\)/, 'no percent goal');
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /resultAction && !rideChallenge && !wrap && !turnOnly && \(!won \|\| canBankRun\)/, 'the extra replay follows the PLAY AGAIN rules');
  assert.match(shell, /const resultActionPress = useCallback\(\(\) => \{\n\s+if \(!claimedRef\.current && effectiveResult && linePlayMovement\?\.onRunDone\)/, 'banks the finished run first');
});

test('Sharky results use the shared ribbon, buttons and chips; podium only for a win; one race label', () => {
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(sharky, /<ResultsRibbon title=\{title\}/);
  assert.match(sharky, /<ResultPrimaryButton label=\{primaryLabel\}/);
  assert.match(sharky, /<ResultSecondaryButton label=\{claimLabel\}/);
  assert.match(sharky, /<ResultChip key=\{c\.label\}/);
  assert.match(sharky, /const newBest = data\.newBest && !saved;\n\s+const cheer = data\.stars > 0 \|\| newBest;/);
  assert.match(sharky, /\{cheer \? <Image source=\{SHARKY_ART\.podium\}/, 'no podium on a 0-star run');
  assert.match(sharky, /data\.newCard\.toUpperCase\(\)/);
  assert.doesNotMatch(sharky, /missionText\(m\.id\)\}<\/Text>/, 'mission words are spoken only');
  assert.doesNotMatch(sharky, /borderRadius: 36/, 'no pill PLAY AGAIN');
  const swim = read('src/games/sharky/SharkySwim.tsx');
  assert.doesNotMatch(swim, /RACE MY GHOST|Race my ghost/);
  assert.equal((swim.match(/challengeLabel="RACE GHOSTS"/g) ?? []).length, 2);
  const icons = load('src/games/sharky/hud/missionIcons.ts', { '../assets': { SHARKY_ART: { coin: 1, jelly: 2, puffer: 3, ring: 4, finBadge: 5, tokenGold: 6, prizeBox: 7, tideGate: 8 } } });
  const missions = read('src/games/sharky/meta/missions.ts');
  for (const [, id] of missions.matchAll(/\{ id: '([a-z0-9]+)', text:/g)) {
    const icon = icons.missionIcon(id);
    assert.ok(icon.art || icon.name, `mission ${id} has a picture`);
  }
});

test('one button voice on try cards, a calm CQ board under its card, no endless loss pulse', () => {
  const card = read('src/components/rewards/ChallengeStatusCard.tsx');
  assert.match(card, /const primary = capsAction\(primaryIn\);/);
  assert.match(card, /const quiet = capsAction\(quietIn\);/);
  const cq = read('src/games/current-quest/v1/CurrentQuestGame.tsx');
  assert.match(cq, /\{resting \? null : <Text style=\{styles\.hint\}/, 'no "Pearl found!" text around the card');
  assert.match(cq, /onWrapUp=\{\(\) => \{ setWrapped\(true\); return null; \}\}/, 'a ride-up card gets the calm board too');
  assert.match(cq, /playResting: \{ opacity: 0\.12 \}/);
  const duel = read('src/games/trivia-duel/ui/DuelResults.tsx');
  assert.doesNotMatch(duel, /withTiming\(0, \{ duration: beatMs \}\)\), -1\)/);
  assert.match(duel, /GAP_BEATS = 4/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.doesNotMatch(whack, /% TO GO/, 'no percent in a Whack title');
});

// -- Wave 2 round 1 ------------------------------------------------------------

test('a ride-up or left-line end is never a loss, even at 0 points', () => {
  assert.equal(feelings.endFeel({ stars: 0, isNewBest: false, saved: false, wrapped: true }), 'saved', '0-point ride-up is calm');
  assert.equal(feelings.endFeel({ stars: 0, isNewBest: true, saved: false, wrapped: true }), 'saved', 'a ride-up never claims a best');
  assert.equal(feelings.endFeel({ stars: 2, isNewBest: false, saved: false, wrapped: true }), 'win');
  assert.equal(feelings.endFeel({ stars: 0, isNewBest: false, saved: false, wrapped: false }), 'try');
  // A 0-point boarding wrap: creditWrapResult adds no partial flag, but wrapUp is set, so the shell sees a wrap.
  const zero = session.creditWrapResult({ score: 0, stars: 0 }, 'boarding', false);
  assert.equal(zero.meta.partial, undefined);
  assert.equal(zero.meta.wrapUp, 'boarding');
  assert.equal(feelings.endFeel({ stars: zero.stars, isNewBest: false, saved: zero.meta.partial === true, wrapped: zero.meta.wrapUp != null }), 'saved');
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /wrapped: wrap != null \|\| effectiveResult\.meta\?\.wrapUp != null,/);
  assert.match(shell, /Haptic\.hitSoft\(\);\n\s+if \(!ownSfx\) playSfx\('ui\.confirm', 0\.7\);/, 'a calm send-off chime, never the lose sound');
  assert.match(shell, /wrapReason=\{wrap\?\.reason \?\? null\}/);
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /const sendOff = wrapUp && stars === 0 && !saved && !\(score > 0\);/);
  assert.match(card, /\{sendOff \? null : <>\n\s+<Text style=\{styles\.label\}>SCORE<\/Text>/, 'no SCORE 0 on a send-off');
  assert.match(card, /wrapReason === 'boarding' \? 'HAVE FUN!' : 'SEE YOU SOON!'/);
});

test('one finish cue: Rhythm keeps its drum roll and the card owns the NEW BEST ding; the Drum-Off chip is only a win', () => {
  const rhythm = read('src/games/rhythm/RhythmTapGame.tsx');
  assert.match(rhythm, /const ownFinishSfx = reason === 'stall' \|\| win;/);
  assert.match(rhythm, /\n\s+ownFinishSfx,\n\s+rhythmProof: proof,/);
  assert.doesNotMatch(rhythm, /GameAudio\.play\('fx\.purchase'/, 'no second NEW BEST ding from the game');
  assert.doesNotMatch(rhythm, /'3RD'|'4TH'|placeText\(/, 'no chip says the kid came 3rd or 4th');
  assert.match(rhythm, /drumOffPlace\(sum\.accuracy, rivals\.current\) === 1 \? \[\{ label: 'DRUM-OFF', value: 'WON!' \}\]/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const ownSfx = effectiveResult\.meta\?\.ownFinishSfx === true;/);
});

test('Sharky results fit a short phone: smaller stage, tight card, the bottom rows keep their space from the start', () => {
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.doesNotMatch(sharky, /setBelow\(true\)/, 'the below rows never pop in and push the card off screen');
  assert.match(sharky, /belowIn\.value = withDelay\(2400, withTiming\(1/);
  assert.match(sharky, /stage: \{ width: '100%', flex: 1, minHeight: 0,/, 'the stage flexes into the room the card leaves');
  assert.match(sharky, /setK\(Math\.max\(0\.4, Math\.min\(1, h \/ STAGE_POSE_PT\)\)\)/, 'shark and podium scale to the stage');
  assert.match(sharky, /marginBottom: bottomPad/, 'the card clears the home bar');
  assert.match(sharky, /below: \{ width: '100%', flexDirection: 'row'/);
  assert.doesNotMatch(sharky, /requestAnimationFrame/, 'the count-up no longer re-renders every frame');
  assert.match(sharky, /COUNT_STEP_MS = 80/);
  assert.match(sharky, /useCountUp\(data\.score, 300, 1100, reducedMotion\)/);
  // The shared card's order: stars, then score.
  assert.ok(sharky.indexOf('<View style={[styles.stars') < sharky.indexOf('<Animated.Text style={[styles.score'));
});

test("game saves belong to the signed-in player, so a brother never sees his sister's BEST", async () => {
  const mem = new Map();
  const store = {
    getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: async (k, v) => { mem.set(k, v); },
    removeItem: async (k) => { mem.delete(k); },
    getAllKeys: async () => [...mem.keys()],
    multiGet: async (ks) => ks.map((k) => [k, mem.has(k) ? mem.get(k) : null]),
    multiSet: async (pairs) => { for (const [k, v] of pairs) mem.set(k, v); },
  };
  const ps = load('src/gamekit/core/playerStorage.ts', { '@react-native-async-storage/async-storage': { default: store } });
  const S = ps.default;
  // Before the update: one player's Whack best on the phone.
  mem.set('@whack_a_shark/ride_best', '2320');
  mem.set('calibration.offset', '12');
  ps.setGameSavesPlayer(21);
  assert.equal(await S.getItem('@whack_a_shark/ride_best'), '2320', 'the first player keeps the old saves');
  assert.equal(mem.get('@tps/game_saves_owner'), '21');
  assert.equal(mem.has('calibration.offset@p21'), false, 'device settings are not game saves');
  ps.setGameSavesPlayer(28);
  assert.equal(await S.getItem('@whack_a_shark/ride_best'), null, 'a second player starts fresh');
  await S.setItem('@whack_a_shark/ride_best', '400');
  ps.setGameSavesPlayer(21);
  assert.equal(await S.getItem('@whack_a_shark/ride_best'), '2320', "21's best is untouched by 28's run");
  assert.equal(S.owner(), '21');
  ps.setGameSavesPlayer(null);
  assert.equal(await S.getItem('@whack_a_shark/ride_best'), null, 'signed out sees no one');
  assert.equal(ps.isLegacyGameKey('@whack/ghost/daily/123/0'), true);
  assert.equal(ps.isLegacyGameKey('@whack/ghost/daily/123/0@p21'), false);
  for (const f of ['src/games/whack/WhackAShark.tsx', 'src/games/memory/storage.ts', 'src/games/sharky/meta/progress.ts', 'src/games/rhythm/meta/progress.ts',
    'src/games/current-quest/progress.ts', 'src/games/banana-basket/progress.ts', 'src/games/boss/BossBrawl.tsx', 'src/games/boss/bash/BossBash.tsx',
    'src/games/boss/bash/BashResults.tsx', 'src/games/boss/multiplayer/ghostStore.ts', 'src/games/trivia-duel/store.ts', 'src/gamekit/session/snapshotStore.ts']) {
    assert.match(read(f), /import AsyncStorage from '[./]+(gamekit\/)?core\/playerStorage';/, `${f} saves per player`);
    assert.doesNotMatch(read(f), /@react-native-async-storage\/async-storage/, `${f} has no phone-wide saves left`);
  }
  assert.match(read('src/context/AuthProvider.tsx'), /setGameSavesPlayer\(player\?\.id \?\? null\)/);
  assert.match(read('src/games/trivia-duel/store.ts'), /if \(cache && cacheOwner === savesOwner\(\)\) return cache;/);
  assert.match(read('src/games/current-quest/progress.ts'), /if \(cache && cacheOwner === savesOwner\(\)\) return cache;/);
});

test('Trivia Duel ends on the shared ribbon and brag chips: dots for right answers, no seconds', () => {
  const duel = read('src/games/trivia-duel/ui/DuelResults.tsx');
  assert.match(duel, /<ResultsRibbon title=\{title\}/);
  assert.doesNotMatch(duel, /OutlinedText text=\{title\}/);
  assert.doesNotMatch(duel, /model\.rows\.map/, 'no raw stat rows (Fastest 1.4s) on the card');
  assert.match(duel, /onRematch \? styles\.secondary : styles\.primary/, 'a lone CONTINUE is the gold button');
  assert.doesNotMatch(duel, /withTiming\(-112/, 'the polaroid never parks over the card words');
  const src = duel.slice(duel.indexOf('export function duelChips'), duel.indexOf('/** The loss gap pulse'));
  const ts = require(require('node:path').join(__dirname, '../../node_modules/typescript'));
  const js = ts.transpileModule(`const feelingChips = (s) => s.slice(0, 2);\n${src}\nmodule.exports = { duelChips };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  const chips = m.exports.duelChips([{ label: 'Correct', value: '3/5' }, { label: 'Fastest', value: '1.4s' }, { label: 'Fastest answer', value: 'GREAT' }, { label: 'Streak', value: '2' }]);
  assert.deepEqual(chips.map((c) => c.label), ['RIGHT ANSWERS', 'BEST ANSWER']);
  assert.deepEqual([...chips[0].pips], [3, 3], 'only the earned dots');
  assert.equal(m.exports.duelChips([{ label: 'Correct', value: '0/5' }, { label: 'Fastest answer', value: 'NONE' }]).length, 0);
  assert.deepEqual(m.exports.duelChips([{ label: 'Correct', value: '2/5' }, { label: 'Streak', value: '6' }]).map((c) => c.label), ['RIGHT ANSWERS'], 'no carried-in streak beside 2 right answers');
  assert.deepEqual(m.exports.duelChips([{ label: 'Correct', value: '5/5' }, { label: 'Streak', value: '5' }]).map((c) => c.value), ['5', 'x5']);
});

test('Boss results share the ribbon and read the raid in pictures, not a data line', () => {
  const bash = read('src/games/boss/bash/BashResults.tsx');
  assert.match(bash, /<ResultsRibbon title=\{won \?/);
  assert.doesNotMatch(bash, /styles\.bannerText/);
  assert.doesNotMatch(bash, /HP left\}\{left/, 'no "3,047 HP left · 18 min left · 6 fighting" line');
  assert.match(bash, /<GameIcon name="timer" size=\{20\} \/>/);
  assert.match(bash, /<GameIcon name="swords" size=\{20\} \/>/);
  assert.match(bash, />ENERGY KEPT</);
  assert.doesNotMatch(bash, />No Energy was spent\.</);
});
