const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/memory-loss-flow.test.cjs
// A lost Memory Match try: honest, warm copy; cards stay visible; one real
// end card with TRY AGAIN / Done; header names the game and the ride.
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'src/games/memory/MemoryGame.tsx'), 'utf8');
const { memoryLossCopy, memoryLossBanner, triesLeftLine } = loadTs('src/games/memory/lossCopy.ts');

test('SO CLOSE only when the player really was close', () => {
  assert.equal(memoryLossCopy(0, 8).title, "TIME'S UP!");
  assert.doesNotMatch(memoryLossCopy(0, 8).line, /close/i);
  assert.equal(memoryLossCopy(2, 8).title, 'GOOD START!');
  assert.equal(memoryLossCopy(1, 8).line, 'You found 1 of 8 pairs. Keep going!');
  assert.equal(memoryLossCopy(4, 8).title, 'NICE TRY!');
  assert.equal(memoryLossCopy(6, 8).title, 'SO CLOSE!');
  assert.equal(memoryLossCopy(7, 8).line, 'Just 1 pair to go!');
  assert.equal(memoryLossBanner(0, 8), "TIME'S UP!");
  for (let p = 0; p <= 7; p++) assert.doesNotMatch(memoryLossCopy(p, 8).title, /\d/, 'no numbers jammed into the title');
});

test('tries line is plain and says when the Ticket is used up', () => {
  assert.equal(triesLeftLine(2), '2 more tries on this Ticket');
  assert.equal(triesLeftLine(1), '1 more try on this Ticket');
  assert.equal(triesLeftLine(0), 'That was the last try on this Ticket.');
});

test('the results banner and end card use the honest copy', () => {
  assert.doesNotMatch(src, /`SO CLOSE \$\{e\.pairs\}/);
  assert.match(src, /memoryLossBanner\(e\.pairs, e\.pairsTotal\)/);
  assert.doesNotMatch(src, />SO CLOSE</);
  assert.doesNotMatch(src, />End challenge</);
  assert.match(src, /<TryCard copy=\{memoryLossCopy\(tryScreen\.pairs, tryScreen\.total\)\}/);
  assert.match(src, /accessibilityLabel="Done"/);
});

test('cards stay visible: only known faces flip, under a light veil', () => {
  assert.match(src, /if \(known\[id\] == null\) continue;/);
  assert.match(src, /wash\.value = withDelay\(200, withTiming\(0\.4,/);
});

test('every ride try ends on the end card; Done in a ride challenge goes straight to the ride loss card', () => {
  assert.match(src, /if \(r\.mode === 'ride'\) \{\s*setTryScreen\(/);
  assert.match(src, /if \(rideChallenge && r\?\.mode === 'ride'\) \{[\s\S]{0,160}onClose\(\);/);
  assert.match(src, /if \(!prev \|\| RIDE_TRIES - 1 - prev\.tryIndex <= 0\) return;/);
});

test('a storage failure can never leave a dead board with no result', () => {
  assert.match(src, /savePersonalBest\(pbKey, finalScore\)\.catch\(/);
  assert.match(src, /if \(r\.mode === 'ride'\) try \{/);
});

test('header says Memory Match and the ride name, matching the how-to', () => {
  assert.doesNotMatch(src, /'Ride Sprint'/);
  assert.match(src, /const title = mode === 'ride' \? 'Memory Match'/);
  assert.match(src, /`\$\{taskName \|\| deck\.label\}/);
});
