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
  // A combo of 1 is not a combo.
  assert.equal(feelings.feelingChips([], 1).length, 0);
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

test('a queue event never throws the run away (partial credit), but a paid challenge must be won', () => {
  assert.deepEqual({ ...session.wrapUpStars(0, 120, false) }, { stars: 1, partial: true });
  assert.deepEqual({ ...session.wrapUpStars(2, 900, false) }, { stars: 2, partial: false });
  assert.deepEqual({ ...session.wrapUpStars(0, 0, false) }, { stars: 0, partial: false });
  assert.deepEqual({ ...session.wrapUpStars(0, 500, true) }, { stars: 0, partial: false });
  assert.equal(session.isEmptyResultsNode(null), true);
  assert.equal(session.isEmptyResultsNode(undefined), true);
  assert.equal(session.isEmptyResultsNode(false), true);
  assert.equal(session.isEmptyResultsNode(''), true);
  assert.equal(session.isEmptyResultsNode({ type: 'View' }), false);
});

test('LinePlay tells an open game when the wait ends under it', () => {
  assert.equal(lineplay.queueEndedReason('active', null), null);
  assert.equal(lineplay.queueEndedReason('paused', 'boarded'), null);
  assert.equal(lineplay.queueEndedReason('ending', 'boarded'), 'boarding');
  assert.equal(lineplay.queueEndedReason('ending', 'left_queue'), 'left-queue');
  assert.equal(lineplay.queueEndedReason('complete', 'manual'), 'session-ended');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /queueEnded,\n\s+rideUpLikely: snapshot\.boardingSuggested/);
  assert.match(screen, /onNoStarRun: \(\) =>/);
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
  assert.match(shell, /showSharedCard = phase === 'results' && \(!renderResults \|\| !effectiveResult \|\| \(gameResults == null && resultsSafe\)\)/);
  assert.match(shell, /resultsSafe \? styles\.resultsShown : resultsStyle/);
  assert.match(shell, /linePlayMovement\?\.onNoStarRun\?\.\(\);\n\s+onClose\(\);/);
  assert.match(shell, /if \(visible && queueEnded\) wrapUp\(queueEnded\)/);
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /feelingChips\(stats, maxCombo\)/);
});
