const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/results-w5r1.test.cjs
// Wave 5 round 1 of the results lane: one results language on every card
// (Memory's end card, the Duel and Line Trivia star row, Sharky's ribbon on
// its card), the new Finn is a picture, not a title, pictures instead of
// sentences, nothing that looks like a button unless it is one, and a
// capture autoplay that can never start a burst under the next run.
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('every Duel card (Line Trivia, duel, ride) stamps the same star row, and its title waits for the last star', () => {
  const duel = read('src/games/trivia-duel/ui/DuelResults.tsx');
  assert.doesNotMatch(duel, /\{model\.ride \? \(\s*<View style=\{styles\.starRow\}/, 'the star row is not ride-only any more');
  assert.match(duel, /<View style=\{styles\.starRow\} accessible accessibilityLabel=\{`\$\{stars\} of 3 stars`\}>/);
  assert.match(duel, /delayMs=\{rideRibbonDelay\(stars, reducedMotion\)\}/);
  // A win never shows three empty stars (it would read like a loss).
  assert.match(duel, /const stars = rideView \? rideView\.stars : model\.won \? Math\.max\(1, model\.stars\) : model\.stars;/);
  assert.match(read('src/screens/LinePlay/QueueResultsCaptureScreen.tsx'), /stars: 2, practice: false,/);
  // Scores read like the plate above (1,925 vs 1,628).
  assert.match(duel, /\{countText\(model\.myScore\)\}/);
  assert.match(duel, /\{countText\(model\.oppScore\)\}/);
});

test('a new costume Finn is a picture in the card, never the title', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.doesNotMatch(whack, /NEW FINN:/, 'no name text in the ribbon');
  assert.match(whack, /message,\n\s*maxCombo: maxStreak,/, 'the star title (NICE!, GREAT!, INCREDIBLE!) stays');
  assert.match(whack, /resultExtras=\{result && unlockedTheme \? <FinnUnlock theme=\{unlockedTheme\} reducedMotion=\{reducedMotion\} \/> : undefined\}/);
  assert.match(whack, /setUnlockedTheme\(null\);/);
  const unlock = read('src/games/whack/FinnUnlock.tsx');
  assert.match(unlock, /<UnlockTile source=\{THEMED_SHARK_FRAMES\[theme\]\[1\]\}/, "Alex's cheering costume Finn, existing art");
  assert.match(unlock, /label=\{`New Finn unlocked: \$\{name\}`\}/, 'the name is spoken only');
  // Wave 6: the one unlock tile every game shares.
  const tile = read('src/gamekit/results/UnlockTile.tsx');
  assert.match(tile, /<Text style=\{styles\.tagText\}>NEW<\/Text>/);
  assert.doesNotMatch(tile, /withRepeat/, 'one pop, then it rests');
  assert.match(tile, /if \(reducedMotion\) return undefined;/);
  assert.match(tile, /return \(\) => \{ clearTimeout\(t\); cancelAnimation\(pop\); cancelAnimation\(tag\); \};/);
});

test('the capture autoplay ready tap is cleared when a run ends, restarts or unmounts', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.doesNotMatch(whack, /if \(autoplay\) setTimeout\(\(\) => onReadyRef\.current/);
  assert.match(whack, /autoReadyTimer\.current = setTimeout\(/);
  assert.match(whack, /useEffect\(\(\) => clearAutoReady, \[clearAutoReady\]\);/);
  const finish = whack.slice(whack.indexOf('const finishRun = useCallback'), whack.indexOf('const finishRun = useCallback') + 400);
  assert.match(finish, /clearAutoReady\(\);/);
  const rematch = whack.slice(whack.indexOf('const handleRematch = useCallback'), whack.indexOf('const handleRematch = useCallback') + 500);
  assert.match(rematch, /clearAutoReady\(\);/);
  const start = whack.slice(whack.indexOf('const handleStart = useCallback'), whack.indexOf('const handleStart = useCallback') + 500);
  assert.match(start, /clearAutoReady\(\);/);
});

test('TRY TWO THUMBS? is a picture (drum left, rim right), with icon plus word buttons', () => {
  const rhythm = read('src/games/rhythm/RhythmTapGame.tsx');
  assert.doesNotMatch(rhythm, /Blue on the left thumb, coral on the right\.<\/Text>/, 'no sentence to read');
  assert.match(rhythm, /accessibilityLabel="Two hands: the left thumb taps the blue drum, the right thumb taps the coral rim"/);
  assert.match(rhythm, /<Image source=\{TWO_DRUM\}/);
  assert.match(rhythm, /<Image source=\{TWO_RIM\}/);
  assert.match(rhythm, /<GameIcon name="check" size=\{18\} \/><Text style=\{styles\.easyBtnTxt\}>YES<\/Text>/);
  assert.match(rhythm, /<GameIcon name="close" size=\{16\} \/><Text style=\{styles\.easyBtnTxt\}>NO THANKS<\/Text>/);
});

test('Sharky wears the family title: the ribbon rides on the card, never pinned to the top of the screen', () => {
  const sharky = read('src/games/sharky/hud/SharkyResults.tsx');
  assert.match(sharky, /<ResultsRibbon title=\{title\} reducedMotion=\{reducedMotion\} delayMs=\{titleAt\} style=\{styles\.ribbonWrap\} \/>/);
  assert.doesNotMatch(sharky, /styles\.headline\b/);
});

test('no betting words on a kids card, spoken ones included', () => {
  const stake = read('src/games/current-quest/StakeCard.tsx');
  assert.doesNotMatch(stake, /accessibilityLabel="[^"]*\bstakes?\b/i);
  for (const f of ['src/gamekit/results/ResultsCard.tsx', 'src/games/trivia-duel/ui/DuelResults.tsx', 'src/games/memory/MemoryResults.tsx', 'src/games/memory/TryCard.tsx',
    'src/games/sharky/hud/SharkyResults.tsx', 'src/games/boss/bash/BashResults.tsx', 'src/games/whack/FinnUnlock.tsx']) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const strings = src.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<{}\n]+</g) ?? [];
    for (const s of strings) assert.doesNotMatch(s, /\b(bet|bets|wager|wagers|stake|stakes|dice|gamble|jackpot|odds)\b/i, `${f}: ${s}`);
  }
});

test('the shared card holds its star title until the last star stamps (no GREAT! before the stars land)', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /delayMs=\{saved \|\| sendOff \? 0 : titleDelayMs\(stars, starStepMs, reducedMotion\)\}/);
  const fn = card.slice(card.indexOf('export function titleDelayMs'), card.indexOf('export function ResultsCard'));
  const titleDelayMs = new Function('STAR_BASE_DELAY', `${fn.replace(/export function titleDelayMs\(stars: number, stepMs: number, reducedMotion: boolean\): number/, 'return function (stars, stepMs, reducedMotion)').replace(/\/\*\*[\s\S]*?\*\//, '')}`)(260);
  assert.equal(titleDelayMs(0, 464, false), 0, 'no stars, no wait');
  assert.equal(titleDelayMs(2, 464, false), 260 + 464 + 140, 'Whack 2 stars: after the second stamp');
  assert.equal(titleDelayMs(3, 220, false), 260 + 440 + 140);
  assert.equal(titleDelayMs(3, 464, true), 0, 'Reduce Motion: in place');
});

test('the tally says each bucket with one soft rising tick; the only ramp is the total count-up', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  const bucket = card.slice(card.indexOf('function BucketTally'), card.indexOf('function BucketTally') + 1600);
  assert.doesNotMatch(bucket, /tallySchedule|tallyTickCount|plan\.at\.map/);
  assert.match(bucket, /GameAudio\.play\(SCORE_TICK_CUE, \{ volume: 0\.32, pitch: index \* BUCKET_TICK_STEP \}\);/);
  assert.match(card, /export const BUCKET_TICK_STEP = 3;/);
});
