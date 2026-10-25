const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Hotfix wave 3 round 2: once the buzzer sounds, the Whack board stops taking taps, so a kid
// still tapping can never land on the board while the results card arrives.
const src = fs.readFileSync(path.resolve(__dirname, '../../src/games/whack/WhackAShark.tsx'), 'utf8');

test('the board view under the tap gesture only takes touches while a Burst is live', () => {
  const block = src.slice(src.indexOf('<GestureDetector gesture={runtime.gesture}>'), src.indexOf('</GestureDetector>'));
  assert.match(block, /<Animated\.View style=\{\[StyleSheet\.absoluteFill, camera\.style\]\} pointerEvents=\{phase === 'play' \? 'auto' : 'none'\}>/);
});
