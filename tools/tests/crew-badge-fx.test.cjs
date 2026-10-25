const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/crew-badge-fx.test.cjs
// A warm crew: joins drop in and wave with a +1, good rounds float hearts; motion only, kid-safe, quiet for others.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const src = read('src/screens/LinePlay/group/CrewBadgeFx.tsx');
const num = name => Number(new RegExp(`${name}: (\\d+)`).exec(src)[1]);

test('the beat sheet matches the brief: drop 20 pt, a 15 degree wave over 500 ms, +1 over 900 ms, 80 ms apart, hearts over 1.2 s', () => {
  assert.equal(num('dropPt'), 20);
  assert.equal(num('waveDeg'), 15);
  assert.equal(num('waveMs'), 500);
  assert.equal(num('plusOneMs'), 900);
  assert.equal(num('joinStaggerMs'), 80);
  assert.equal(num('heartsMs'), 1200);
  assert.equal(num('hearts'), 3);
});

test('motion only, UI thread, one tick for a join and never a buzz for another player\'s stars', () => {
  assert.match(src, /withSpring\(1, SPRING\.land\)/, 'the join drops on SPRING.land');
  assert.equal((src.match(/queueHaptic\(/g) || []).length, 1, 'one haptic in the file: the join tick');
  assert.match(src, /if \(join === 0\) \{ queueHaptic\('tickSelection'\)/);
  assert.doesNotMatch(src, /withRepeat|setInterval|requestAnimationFrame/, 'one-shot');
  assert.doesNotMatch(src, /from 'react-native-svg'/);
  const strip = read('src/screens/LinePlay/group/GroupStrip.tsx');
  assert.match(strip, /<CrewBadgeFx joinOrder=\{joinOrder\} starsKey=\{stars\.get\(id\) \?\? 0\} reduced=\{reduced\}>/);
  assert.match(strip, /useEffect\(\(\) => \{ seen\.current = new Set/, 'the crew is remembered after each draw, never during render');
});

test('round 5: the +1 and the hearts read at a glance and the bubble never wraps on a 28 pt badge', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/LinePlay/group/CrewBadgeFx.tsx'), 'utf8');
  assert.match(src, /float: \{ position: 'absolute', left: -30, right: -30/, 'the float layer is wider than the badge');
  assert.match(src, /minHeight: 28, minWidth: 40/, 'a +1 bubble at least 28 pt tall and 40 pt wide');
  assert.ok(Number(/PLUS_FONT = (\d+)/.exec(src)[1]) >= 20);
  assert.ok(Number(/HEART_SIZE = (\d+)/.exec(src)[1]) >= 22);
});

test('round 6: three solid gold hearts, 28 to 32 pt with a white outline, pop past full size and fan out; a sparkle on the badge', () => {
  const size = Number(/HEART_SIZE = (\d+)/.exec(src)[1]);
  assert.ok(size >= 28 && size <= 32, `heart size ${size}`);
  assert.match(src, /mono=\{BRAND\.white\}/, 'a white heart behind the gold one is the outline');
  assert.match(src, /const pop = k < 0\.12 \? 0\.4 \+ 0\.85/, 'pops to 1.25 then settles');
  assert.match(src, /opacity: k < 0\.08 \? k \/ 0\.08 : k < 0\.7 \? 1/, 'solid, not half see-through');
  assert.match(src, /HEART_FAN/);
  assert.match(src, /<GameIcon name="sparkle" size=\{SPARK_SIZE\} \/>/);
  // Still quiet for other players: the hearts never buzz or play a sound.
  const starsEffect = src.slice(src.indexOf('const before = lastStars.current'), src.indexOf('const badgeStyle'));
  assert.doesNotMatch(starsEffect, /queueHaptic|playHaptic|playMoment/);
});
