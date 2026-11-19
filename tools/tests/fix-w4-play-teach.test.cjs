'use strict';
/**
 * Fix pass w4, lane play-teach: how-tos and honest game screens.
 * Each test fails without its fix (the ids are in the test names).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** The source text inside every <LockedResultActions> element of a file, joined. */
function lockedText(file) {
  const src = read(file);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === 'LockedResultActions') out.push(node.getText(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.join('\n');
}

/** Every game's own results card, and the button words (or handlers) that must sit under the shared lock. */
const OWN_RESULTS = {
  'src/games/sharky/hud/SharkyResults.tsx': ['ResultPrimaryButton', 'label="PLAY AGAIN"', 'claim', 'challenge'],
  'src/games/trivia-duel/ui/DuelResults.tsx': ['REMATCH', 'PASS TO CREW', 'onContinue'],
  'src/games/memory/MemoryResults.tsx': ['again()', 'claim()', 'STATS', 'SHARE'],
  'src/games/memory/TryCard.tsx': ['TRY AGAIN', 'onDone'],
  'src/games/boss/BossResults.tsx': ['FIGHT AGAIN', 'onPress={claim}'],
  'src/games/boss/bash/BashResults.tsx': ['ATTACK AGAIN', 'once(claim)'],
  'src/games/current-quest/ResultsCard.tsx': ['PLAY AGAIN', 'onDone'],
  // The shared card's game extras (Parade Beat's TRY TWO THUMBS? YES / NO THANKS).
  'src/gamekit/results/ResultsCard.tsx': ['{extras}'],
};

test('N03: every game\'s own results card wraps its buttons in the one shared input lock', () => {
  for (const [file, words] of Object.entries(OWN_RESULTS)) {
    const src = read(file);
    assert.match(src, /import LockedResultActions from '[./]+(gamekit\/results\/)?LockedResultActions';/, `${file} imports the shared lock`);
    const inside = lockedText(file);
    assert.ok(inside.length > 0, `${file} draws <LockedResultActions>`);
    for (const w of words) assert.ok(inside.includes(w), `${file}: "${w}" sits inside the lock`);
  }
});

test('N03: the shared lock is the T046 lock (same timings, the dimmed look, a catcher over the buttons)', () => {
  const src = read('src/gamekit/results/LockedResultActions.tsx');
  assert.match(src, /useResultInputLock\(active, RESULT_INPUT_LOCK_MS \+ Math\.max\(0, delayMs\)/);
  assert.match(src, /lock\.dimStyle/);
  assert.match(src, /!lock\.armed \? \(\s*<View testID=\{RESULT_LOCK_TEST_ID\} style=\{StyleSheet\.absoluteFill\}/);
  assert.match(src, /onStartShouldSetResponder=\{\(\) => \{ lock\.lockedTap\(\); return true; \}\}/);
  // A fast tapper still tapping when the game ends never presses (the mashGuard replay, every phase).
  const { loadTs } = require('./helpers/ts-module.cjs');
  const M = loadTs('src/components/rewards/mashGuard.ts');
  for (const gap of [120, 200, 350, 600, 900, 1200]) {
    for (let phase = 0; phase < gap; phase += 40) {
      const taps = []; for (let t = phase; t < 20000; t += gap) taps.push(t);
      assert.equal(M.firstPressOf(taps), null, `a tapper every ${gap} ms pressed a results button`);
    }
  }
  // A player who stops and looks presses it the first time.
  assert.equal(M.firstPressOf([100, 200, 300, 2000]), 2000);
});
