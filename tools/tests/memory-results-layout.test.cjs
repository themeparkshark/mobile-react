const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/memory-results-layout.test.cjs
// The results card never reflows while a kid reads it, and the front is short.
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'src/games/memory/MemoryResults.tsx'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/games/memory/MemoryGame.tsx'), 'utf8');

test('no section mounts on its step; each is laid out at frame 0 and revealed in place', () => {
  assert.doesNotMatch(src, /\{step >= 2 \? <Headline/);
  assert.doesNotMatch(src, /\{step >= 5 \? <Rewards/);
  assert.doesNotMatch(src, /\{step >= 6 \? \(/);
  assert.match(src, /<Reveal show=\{step >= 5\}><Rewards/);
  assert.match(src, /<Reveal show=\{step >= 6\}>/);
});

test('front: banner, one counting number, crowns, new cards, one button; stats behind STATS', () => {
  assert.match(src, /IconBtn icon="star" label="STATS"/);
  assert.match(src, /panel === 'stats' \?/);
  assert.match(src, /GameAudio\.playLadder\('coin_tick'/);
  assert.doesNotMatch(src, /\{step >= 4 && data\.grades \? <Grades/);
});

test('win scrim is navy, PERFECT gets one capped coin burst, and the shell scrim never flashes first', () => {
  assert.match(src, /scrim: \{ \.\.\.StyleSheet\.absoluteFillObject, backgroundColor: 'rgba\(4,38,86,0\.62\)' \}/);
  assert.match(src, /export const PERFECT_COINS = 10;/);
  assert.match(src, /burst=\{data\.banner === 'PERFECT!'\}/);
  assert.match(game, /resultsScrim=\{resultData \? 'none' : undefined\}/);
});
