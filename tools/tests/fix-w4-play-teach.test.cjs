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

test('T045: a quick tap gives Sharky a short swim: the release waits until the press has swum TAP_SWIM_STEPS', () => {
  const engine = read('src/games/sharky/useSharkyEngine.ts');
  assert.match(engine, /export const TAP_SWIM_STEPS = 9;/);
  assert.match(engine, /if \(inp\.releasePending\) \{\s*if \(!s\.holding\) inp\.releasePending = false;\s*else if \(releaseDue\(!!s\.holding, s\.step, s\.holdStart\)\) \{\s*applyInput\(s, IN_RELEASE, 0, 0\);\s*pushEvent\(r, BR_INPUT, IN_RELEASE, 0, 0, s\.step\);/,
    'the delayed release is applied and logged like any input (replays and the verifier see plain inputs)');
  const swim = read('src/games/sharky/SharkySwim.tsx');
  assert.match(swim, /if \(inp\.holding\) inp\.releasePending = true;/, 'lifting the finger asks for the release, never sends it at once');
  assert.doesNotMatch(swim.slice(swim.indexOf('.onTouchesUp'), swim.indexOf('.onTouchesCancelled')), /IN_RELEASE/);
  // The pure rule, and the sim: a 1-step tap now rises; before, a press then release a step later barely moved.
  const { loadTs } = require('./helpers/ts-module.cjs');
  const src = engine.slice(engine.indexOf('export function releaseDue'), engine.indexOf('}', engine.indexOf('export function releaseDue')) + 1);
  // eslint-disable-next-line no-new-func
  const releaseDue = new Function(`${src.replace(/export function/, 'function').replace(/: (boolean|number)/g, '').replace(/= TAP_SWIM_STEPS/, '= 9')}; return releaseDue;`)();
  assert.equal(releaseDue(true, 104, 100), false);
  assert.equal(releaseDue(true, 109, 100), true);
  assert.equal(releaseDue(false, 200, 100), false);
  void loadTs;
});

test('T045: both start cards picture the hold, and Banana and Sharky say one rule everywhere', () => {
  const demo = read('src/components/help/HoldDemo.tsx');
  assert.match(demo, /export function holdPose\(/);
  assert.match(demo, /tap-hand\.webp/, 'the tap hand players already know (existing art)');
  assert.doesNotMatch(demo, /Easing\.linear[\s\S]*translate[XY]: [^q]*t\.value/, 'movement eases on the loop clock (smoothstep, sine)');
  const swim = read('src/games/sharky/SharkySwim.tsx');
  assert.match(swim, /countdownDemo=\{<HoldDemo subject=\{HOLD_SHARK\} motion="rise" reduced=\{reducedMotion\} \/>\}/);
  assert.match(swim, /<HoldDemo subject=\{HOLD_SHARK\} motion="rise" reduced=\{reducedMotion\} \/>\s*<Text style=\{styles\.freezeText\}>HOLD TO SWIM<\/Text>/);
  const banana = read('src/games/banana-basket/BananaBasketGame.tsx');
  assert.match(banana, /countdownDemo=\{<HoldDemo subject=\{HOLD_BASKET\} motion="slide" reduced=\{reducedMotion\} \/>\}/);
  assert.match(banana, /\$\{GAME_INTROS\.banana\.how\}/);
  assert.doesNotMatch(banana, /Catch! Aim! Dodge!|Three quick sets\. Catch them all!/);
  const tiles = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.match(tiles, /shark: GAME_INTROS\.shark\.how,\s*banana: GAME_INTROS\.banana\.how,/);
  assert.doesNotMatch(tiles, /good snacks/);
  const intro = read('src/components/help/GameIntroCard.tsx');
  assert.match(intro, /if \(pic\.demo && pic\.art\) return <HoldDemo/);
});

test('T052 and T059: the first SCOUT and SLIP tips are pictures (the words are only spoken)', () => {
  const game = read('src/games/memory/MemoryGame.tsx');
  const block = game.slice(game.indexOf('{tip ? ('), game.indexOf(') : null}', game.indexOf('{tip ? (')));
  assert.match(block, /accessibilityLabel=\{tip\.text\}/);
  assert.match(block, /<TipPicture kind=\{tip\.kind\} \/>/);
  assert.doesNotMatch(block, /<Text[^>]*>\{tip\.text\}<\/Text>/, 'no sentence drawn on the board');
  const pic = game.slice(game.indexOf('function TipPicture'), game.indexOf('\nconst styles = StyleSheet.create', game.indexOf('function TipPicture')));
  assert.match(pic, /GameIcon name="search"/, 'the SCOUT chip\'s magnifier');
  assert.match(pic, /CARD_BACK/);
  assert.match(pic, /TIP_STREAK/);
  assert.match(pic, /slip \? 'close' : 'check'/);
  assert.doesNotMatch(pic, /<Text/);
});

test('T052: a signed-in warm-up card shows the way to a coin (footsteps, ride, coin to win), never a coin that does not come', () => {
  const r = read('src/games/memory/MemoryResults.tsx');
  assert.match(r, /const guest = !useContext\(AuthContext\)\.player;/);
  assert.match(r, /testID="first-win-path"[\s\S]*FIRST_WIN_STEPS[\s\S]*FIRST_WIN_RIDE[\s\S]*firstWinGoal/);
  assert.match(r, /if \(reducedMotion \|\| !guest\) \{ claim\(\); return; \}/, 'no coin hop or shelf hand-off without the guest shelf');
  assert.match(r, /if \(!node \|\| !guest\) \{ go\(\); return; \}/);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/images/ride-photo/footsteps.webp')), 'existing art only');
});

test('T032: Current Quest (LinePlay) teaches a tap, moves on every step, pops a chest per voyage and offers PLAY AGAIN', () => {
  const cq = read('src/games/current-quest/v1/CurrentQuestGame.tsx');
  assert.match(cq, /countdownDemo=\{<TapPathDemo reduced=\{reduced\} \/>\}/, 'the start card pictures a tap on the next tile');
  assert.match(cq, /TAP_HAND = require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/images\/ride-photo\/tap-hand\.webp'\)/);
  assert.match(cq, /<Splash key=\{`s\$\{progress\.path\.length\}`\}/, 'a splash on every step');
  assert.match(cq, /entering=\{reduced \? undefined : ZoomIn\.springify\(\)\.damping\(10\)\} style=\{styles\.trailDot\}/, 'the trail pops in');
  assert.match(cq, /\{stageClear && !result \? <ChestPop /, 'a chest pops per voyage');
  assert.doesNotMatch(cq, /A new route is ready/);
  assert.match(cq, /onRematch=\{onRematch\}/);
  assert.match(cq, /if \(lastMeta\.current && onRunProof\) onRunProof\(lastMeta\.current\);/, 'PLAY AGAIN never drops the line proof');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /onRunProof=\{groupTurn \? undefined : \(meta\) => session\.recordCurrentQuest\(meta\)\}/);
  // The replay seed: run 0 is the server's seed (the proof), later runs deal new routes.
  const src = cq.slice(cq.indexOf('export function replaySeed'), cq.indexOf('\n}\n', cq.indexOf('export function replaySeed')) + 2);
  // eslint-disable-next-line no-new-func
  const replaySeed = new Function(`${src.replace('export function', 'function').replace(/: number/g, '')}; return replaySeed;`)();
  assert.equal(replaySeed(12345, 0), 12345);
  assert.notEqual(replaySeed(12345, 1), 12345);
  assert.notEqual(replaySeed(12345, 1), replaySeed(12345, 2));
});
