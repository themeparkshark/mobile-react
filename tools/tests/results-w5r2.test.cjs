const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/results-w5r2.test.cjs
// Wave 5 round 2 of the results lane: no brag chip at FINISH!, the new Finn
// gets its own beat (no empty box), pictures instead of sentences (two
// thumbs, Memory stats and album, the ride try card), one ribbon and one dot
// style on every card, Sharky's bar in the shared order, and every Duel star
// makes the same stamp sound as every other card.
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the Whack pace chip shows only during play: never at FINISH!, between bursts or under the card', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  const uses = whack.match(/showPace=\{[^}]*\}/g) || [];
  assert.equal(uses.length, 2);
  uses.forEach((u) => assert.match(u, /phase === 'play'/));
  // FINISH! stamps on the UI frame the clock hits 0 and the phase leaves play right after; the board's own
  // pace chip yields to the chase track whenever one is drawn.
  const end = whack.slice(whack.indexOf('const onBurstEnd = useCallback'));
  assert.ok(end.indexOf("setPhase('finish')") >= 0);
  assert.match(read('src/games/whack/render/WhackBoard.tsx'), /showPace=\{showPace && !chase\}/);
});

test('the new Finn waits for the card to settle: its panel pops in with it (never an empty box) and it plays the reward cue', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /export function settleMs\(/);
  assert.match(card, /export const ResultsSettleContext = React\.createContext<number>\(0\);/);
  // Wave 6: no panel at all for an unlock, so never an empty box; the tile pops itself on the settle moment.
  assert.match(card, /<View style=\{styles\.extrasBare\}>/);
  // settle = count delay + the total's count-up + the NEW BEST beat.
  assert.match(card, /return countDelay \+ Math\.max\(900, countUpMs\(0, Math\.max\(0, args\.score\)\)\) \+ \(args\.newBest \? 520 : 160\);/);
  const finn = read('src/games/whack/FinnUnlock.tsx');
  assert.match(finn, /const settle = useContext\(ResultsSettleContext\);/);
  assert.match(finn, /atMs=\{at\}/);
  const tile = read('src/gamekit/results/UnlockTile.tsx');
  assert.doesNotMatch(tile, /fx\.coinFull/, 'the coin sound is for coins');
  assert.match(tile, /GameAudio\.play\('fx\.reward'/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /resultExtrasBeat=\{!!unlockedTheme\}/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /extrasBeat=\{resultExtrasBeat\}/);
});

test('TRY TWO THUMBS? shows two hands, one tapping each half', () => {
  const rhythm = read('src/games/rhythm/RhythmTapGame.tsx');
  assert.match(rhythm, /const TWO_HAND = require\('\.\.\/\.\.\/\.\.\/assets\/images\/ride-photo\/tap-hand\.webp'\);/);
  assert.equal((rhythm.match(/<Image source=\{TWO_HAND\}/g) || []).length, 2);
  assert.match(rhythm, /twoHandLeft: \{ left: \d+, transform: \[\{ scaleX: -1 \}\] \}/, 'the left hand is mirrored so it reads as two hands');
  assert.ok(fs.existsSync(path.join(root, 'assets/images/ride-photo/tap-hand.webp')));
});

test('Memory STATS: star pips, not letter grades; the tip is spoken only; a run with no turns has no grades', () => {
  const res = read('src/games/memory/MemoryResults.tsx');
  assert.doesNotMatch(res, /styles\.gradeLetter/);
  assert.doesNotMatch(res, /\{tip \? <Text/);
  assert.match(res, /export function gradeStars\(grade: Grade\): number \{\n\s+return grade === 'C' \? 1 : grade === 'B' \? 2 : 3;/);
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /grades: r\.mode === 'warmup' \|\| e\.turns === 0 \? null :/);
});

test('Memory ALBUM: picture tabs (no cut-off names), no foil words, the stamp how-to is spoken only', () => {
  const ex = read('src/games/memory/MemoryExtras.tsx');
  assert.doesNotMatch(ex, /collected · /);
  assert.doesNotMatch(ex, /<Text style=\{styles\.sheetHint\}>Clear a ride's Daily Deck/);
  assert.match(ex, /accessibilityLabel="No ride stamps yet\. Clear a ride's Daily Deck at or under par to stamp its page\."/);
  assert.match(ex, /<FaceThumb face=\{faceFor\(d, 0\)\} w=\{28\} h=\{35\} radius=\{5\} \/>/);
  assert.doesNotMatch(ex, /<Text style=\{\[styles\.tabText/);
});

test('the ride try card wears the shared ribbon, and the ticket picture carries its line (spoken only)', () => {
  const c = read('src/components/rewards/ChallengeStatusCard.tsx');
  assert.match(c, /<ResultsRibbon title=\{title\.toUpperCase\(\)\} reducedMotion=\{reduced\} style=\{styles\.ribbon\} \/>/);
  assert.doesNotMatch(c, /from '\.\.\/Ribbon'/);
  assert.match(c, /<View style=\{styles\.ticket\} accessible accessibilityLabel=\{message\}>/);
  // Core loop 5.3: the loss card says its kind line in words too ("Your Ticket came back. Same game, try again!").
  assert.match(c, /<Text style=\{styles\.messageSmall\}>\{(withNumberFont\()?message\)?\}<\/Text>/);
  assert.match(c, /<\/View> : <Text style=\{styles\.message\}>\{(withNumberFont\()?message\)?\}<\/Text>\}/);
});

test('Memory pair dots look the same on the try card and the end card: bare on blue', () => {
  const res = read('src/games/memory/MemoryResults.tsx');
  const plate = res.match(/pairPlate: \{[^}]*\}/)[0];
  assert.doesNotMatch(plate, /backgroundColor/);
  assert.doesNotMatch(plate, /borderWidth/);
});

test('Sharky follows the shared card order: the bar comes before the chips', () => {
  const s = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.ok(s.indexOf('<NextStarBar goal={goal}') < s.indexOf('<View style={styles.chips}'));
});

test('every Duel star stamps with the same sound and feel as every other card, and the capture log starts there', () => {
  const d = read('src/games/trivia-duel/ui/DuelResults.tsx');
  assert.match(d, /playHaptic\(i === 3 \? 'bigStarSlam' : 'starSlam'\);\n\s+GameAudio\.play\(GameAudio\.hasCue\('sh_star_slam'\) \? 'sh_star_slam' : 'fx\.reveal', \{ pitch: \(i - 1\) \* 2 \}\);/);
  const cap = read('src/screens/LinePlay/QueueResultsCaptureScreen.tsx');
  assert.match(cap, /if \(finishAt\.current < 0 && \(name === 'starSlam' \|\| name === 'bigStarSlam'\)\) finishAt\.current = cues\.current\.length;/);
});

test('PLAY AGAIN starts one run, after the 3-2-1: Whack only gets the next run ready, and the count never restarts on a re-render', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  const i = whack.indexOf('const handleRematch = useCallback');
  const rematch = whack.slice(i, whack.indexOf('restBoard, clearAutoReady]);', i));
  assert.doesNotMatch(rematch, /startBurst\(/, 'the shell countdown starts the run through onStart');
  assert.match(rematch, /setRunIndex\(nextRun\);/);
  assert.match(rematch, /setResult\(null\);/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const onStartRef = useRef\(onStart\);\n\s+onStartRef\.current = onStart;/);
  assert.match(shell, /onStartRef\.current\(\);\n\s+\}, \[\]\);/, 'beginPlay is stable, so the countdown effect does not restart');
});

test('PLAY AGAIN never shows the last run over the new count: the HUD stays back until the first Burst, and each Burst starts its pace at 0', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /<HudStepBack back=\{!!result \|\| phase === 'done'\} reducedMotion=\{reducedMotion\}>/);
  const i = whack.indexOf('const startBurst = useCallback');
  const sb = whack.slice(i, i + 900);
  assert.match(sb, /pace\.value = 0;/);
});

test('the capture can ask Whack for a new Finn (dev or a capture build only), without touching the real Finn book', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /const forceFinn = !!props\.captureNewFinn && \(__DEV__ \|\| process\.env\.EXPO_PUBLIC_PERF_CAPTURE === '1'\);/);
  const i = whack.indexOf('if (forceFinn) {');
  assert.ok(i > 0);
  assert.doesNotMatch(whack.slice(i, i + 260), /AsyncStorage\.setItem/);
  const cap = read('src/screens/LinePlay/QueueResultsCaptureScreen.tsx');
  assert.match(cap, /label: 'WHACK, AUTOPLAY, NEW FINN'/);
  assert.match(cap, /captureNewFinn=\{run\.newFinn\}/);
});
