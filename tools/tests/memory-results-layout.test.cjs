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
  assert.match(src, /colors=\{\['rgba\(4,38,86,0\.08\)', 'rgba\(4,38,86,0\.08\)', 'rgba\(4,38,86,0\.62\)'\]\}/);
  assert.match(src, /export const PERFECT_COINS = 10;/);
  assert.match(src, /<CoinBurst fire \/>/);
  assert.match(game, /resultsScrim=\{resultData \? 'none' : undefined\}/);
});

test('game feel pass: combo ribbon escalates above the awning, bold link arc, compact flame pill, shorter finale sit', () => {
  const booth = fs.readFileSync(path.join(root, 'src/games/memory/MemoryBooth.tsx'), 'utf8');
  assert.match(booth, /peak\.value = reducedMotion \? 1 : 1 \+ Math\.min\(0\.3, level \* 0\.08\)/);
  assert.match(booth, /top: geo\.ribbonY - rh \* 0\.95/);
  assert.match(game, /awning\.current\?\.ribbon\(`COMBO x\$\{chain\}`, chain - 2\)/);
  const fx = fs.readFileSync(path.join(root, 'src/games/memory/BoardFx.tsx'), 'utf8');
  assert.match(fx, /strokeWidth=\{6\} strokeCap="round" color=\{MM\.gold\}/);
  const hud = fs.readFileSync(path.join(root, 'src/games/memory/Hud.tsx'), 'utf8');
  assert.match(hud, /chainCompact: \{ width: undefined, minWidth: 58/);
  const mode = fs.readFileSync(path.join(root, 'src/games/memory/modes/mode.ts'), 'utf8');
  assert.match(mode, /const swap = 320;/);
});

test('combo callouts are paced and always match the flame', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const { comboCall, shouldCallCombo } = loadTs('src/games/memory/comboCallout.ts');
  const none = { at: 0, sweet: false };
  assert.equal(comboCall(2, 10000, none), null);
  assert.equal(comboCall(3, 10000, none), 'show');
  assert.equal(comboCall(4, 10100, { at: 10000, sweet: true }), null, 'SWEET RUN stays readable');
  assert.equal(comboCall(4, 11300, { at: 10000, sweet: true }), 'show');
  assert.equal(comboCall(5, 10500, { at: 10000, sweet: false }), 'retext', 'a rise while up retexts in place');
  assert.equal(comboCall(7, 20000, none), null, 'odd steps from x6 stay quiet when nothing is up');
  assert.equal(comboCall(8, 20000, none), 'show');
  assert.equal(shouldCallCombo(3, 10000, none), true);
  assert.match(game, /awning\.current\?\.retext\(`COMBO x\$\{chain\}`/);
});

test('results: ribbon on the first frame, card rises, visible PERFECT burst, kid words', () => {
  assert.match(src, /useState\(reducedMotion \? 99 : 1\)/);
  assert.match(src, /riseSt, frontSt/);
  assert.match(src, /data\.banner === 'PERFECT!' && !reducedMotion \? <CoinBurst fire \/>/);
  assert.match(src, /'MEMORY'\}/);
  assert.doesNotMatch(src, /EDITION\$\{/);
  assert.match(game, /`\+\$\{xp\} XP`/);
});

test('round 3 timing: banner visible on frame 0, short flash, upward burst, results saved while the coin flies', () => {
  assert.match(src, /useSharedValue\(reducedMotion \? 1 : 0\.6\)/);
  assert.match(src, /withTiming\(0\.8, \{ duration: 16 \}\), withTiming\(0, \{ duration: 110 \}\)/);
  assert.match(src, /const a = Math\.PI \+ \(k \/ \(PERFECT_COINS - 1\)\) \* Math\.PI;/);
  assert.match(game, /later\(420, \(\) => finishRun\(won\)\);/);
});

test('three crowns never read as "not perfect"; both face sheets are preloaded', () => {
  assert.match(game, /banner = 'AMAZING!';\s*crownHint = `Clear it in \$\{perfectOf\(e\)\} turns for PERFECT!`;/);
  assert.match(src, /data\.crownHint \? <Reveal show=\{step >= 3\}>/);
  const card = fs.readFileSync(path.join(root, 'src/games/memory/MemoryCard.tsx'), 'utf8');
  assert.match(card, /if \(preloadExtraSheet != null\) sheets\.push/);
  assert.match(game, /preloadExtraSheet=\{deck\.extraFaceSheet\}/);
});
