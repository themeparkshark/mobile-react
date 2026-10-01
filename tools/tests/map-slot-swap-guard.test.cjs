const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

// QA P2-4: on Main Street, about 90 s after stopping, a tap aimed at the
// Adventure Ticket chip landed on "In line at Fortune Tellers?" which had just
// replaced it, and opened LinePlay for Fortune Tellers.
function guard(slotKey) {
  return runtime('src/screens/ExploreScreen/useSwapTapGuard.ts', {}, { slotKey },
    {}, { arguments: props => [props.slotKey] });
}

test('a swap in the left slot swallows taps for a moment, then lets them through', () => {
  const app = guard('adventure:full:12');
  assert.equal(app.tree, false, 'the first chip is tappable at once');
  app.change({ slotKey: 'dwell:full:569' });
  assert.equal(app.tree, true, 'the new chip ignores the tap meant for the old one');
  const [[, release]] = app.timers; release(); app.render();
  assert.equal(app.tree, false);
});

test('a chip appearing in an empty slot, or leaving it, is not a swap', () => {
  const app = guard(null);
  app.change({ slotKey: 'dwell:full:569' });
  assert.equal(app.tree, false);
  app.change({ slotKey: null });
  assert.equal(app.tree, false);
  assert.equal(app.timers.size, 0);
});

test('the map covers the left slot while the guard is up', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(src, /const leftSlotSwapGuard = useSwapTapGuard\(leftSlotKey\)/);
  assert.match(src, /\{leftSlotSwapGuard && <View testID="left-slot-swap-guard" onStartShouldSetResponder=\{\(\) => true\}/);
  assert.ok(src.indexOf('left-slot-swap-guard') < src.indexOf('<DwellCard'), 'drawn before the chips, above them by zIndex');
});
