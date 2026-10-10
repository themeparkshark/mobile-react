const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/memory-try-card.test.cjs
// The Memory Match end card is a sequenced moment, cheap on the UI thread.
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'src/games/memory/TryCard.tsx'), 'utf8');
const ts = require(path.join(root, 'node_modules/typescript'));
const vm = require('node:vm');

function schedule() {
  // tryCardSchedule is pure: evaluate just that function.
  const start = src.indexOf('export const TRY_BEAT_MS');
  const end = src.indexOf('export function TryCard');
  const js = ts.transpileModule(src.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const ctx = { exports: {} };
  vm.runInNewContext(js, ctx);
  return ctx.exports;
}

test('pips land one per beat after the ribbon; the button comes last', () => {
  const { tryCardSchedule, TRY_BEAT_MS, PIP_STEP_MS, PUFF_STARS } = schedule();
  const s = tryCardSchedule(3);
  assert.deepEqual(Array.from(s.pips), [TRY_BEAT_MS, TRY_BEAT_MS + PIP_STEP_MS, TRY_BEAT_MS + 2 * PIP_STEP_MS]);
  assert.ok(s.line > s.pips[2] && s.button > s.line);
  assert.equal(tryCardSchedule(0).puff, null, 'nothing found: no puff');
  assert.ok(tryCardSchedule(8).button < 1400, 'a full row still lands well under 1.5 s');
  assert.ok(PUFF_STARS <= 3 && schedule().LAST_PUFF_STARS <= 6, 'particle cap');
});

test('feel: ribbon impact, per-pip sound ladder + tick, breathing TRY AGAIN, all skipped under Reduce Motion', () => {
  assert.match(src, /results_banner\.png/);
  assert.match(src, /GameAudio\.playLadder\('mm_sharp_twinkle', 2 \+ i/);
  assert.match(src, /Haptic\.tickSelection\(\)/);
  assert.match(src, /Haptic\.hitMedium\(\); GameAudio\.play\('fx\.hit'/);
  assert.match(src, /withRepeat\(withSequence\(/);
  assert.match(src, /if \(reducedMotion\) return undefined;/);
  assert.match(src, /cancelAnimation\(breathe\)/, 'the loop stops when the card goes away');
  assert.doesNotMatch(src, /shadowOffset|shadowRadius|shadowOpacity|elevation\s*:/);
});

test('the card is anchored to the board bottom and compacts on short phones (no clipping on SE)', () => {
  const game = fs.readFileSync(path.join(root, 'src/games/memory/MemoryGame.tsx'), 'utf8');
  assert.match(game, /bottom=\{Math\.max\(8, g\.H - \(g\.felt\.y \+ g\.felt\.h\) \+ 6\)\} compact=\{g\.H < 600\}/);
  assert.match(src, /styles\.pos, \{ bottom \}/);
});

test('hold the card to peek at the board; the spent clock hides under the ribbon', () => {
  assert.match(src, /onLongPress=\{\(\) => \{ peek\.value = withTiming\(1/);
  assert.match(src, /onPressOut=\{\(\) => \{ peek\.value = withTiming\(0/);
  const game = fs.readFileSync(path.join(root, 'src/games/memory/MemoryGame.tsx'), 'utf8');
  assert.match(game, /\{tryScreen \? null : <RopeNumeral/);
});
