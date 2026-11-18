/**
 * Fix round w3, lane line: LinePlay and the ride log (T071 to T090). Each test fails without its fix.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('T076: only GO moves the next coin; DONE closes to the map and keeps the coin held when LinePlay opened', () => {
  const { doneKeepsTarget } = loadTs('src/services/lineplay/recapExit.ts');
  const astro = { taskId: 58, parkId: 8 };
  const thunder = { taskId: 57, parkId: 8 };
  assert.equal(doneKeepsTarget(astro, thunder), 58, 'the coin moved while in LinePlay: DONE puts Astro back');
  assert.equal(doneKeepsTarget(astro, null), 58);
  assert.equal(doneKeepsTarget(astro, astro), null, 'nothing moved: nothing to do');
  assert.equal(doneKeepsTarget(null, thunder), null, 'nothing held: the guide picks');
  assert.equal(doneKeepsTarget(astro, { taskId: 900, parkId: 10 }), null, 'another park now: never pull the old one back');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  const exit = screen.slice(screen.indexOf('const handleExit = useCallback'), screen.indexOf('const handleNavigateTab'));
  assert.match(exit, /navigation\.navigate\('Explore' as never\);/, 'DONE goes to the map, not back to Wait Times');
  assert.doesNotMatch(exit, /navigation\.goBack\(\)/);
  assert.match(exit, /guide\.setTarget\(keep, 'lineplay_done'\)/);
  assert.match(screen, /const heldAtOpen = useRef\(guide\.current\(\)\);/);
});

test('T085: a picture leads each choice on How did your wait end?', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /\{ text: 'I left the line', icon: 'back' \},\n\s+\{ text: 'I got to the ride', icon: 'ride' \},\n\s+\{ text: 'Keep playing', icon: 'play', style: 'cancel' \},/);
});

test('T081: a line story counts as found only after real time in this line', () => {
  const found = loadTs('src/services/lineplay/foundAdventures.ts', {
    '@react-native-async-storage/async-storage': { default: {} } });
  assert.equal(found.storyCreditEarned({ waitTimed: true, elapsedSeconds: 0 }), false, 'a 0-minute walk-on is no story');
  assert.equal(found.storyCreditEarned({ waitTimed: true, elapsedSeconds: 179 }), false);
  assert.equal(found.storyCreditEarned({ waitTimed: true, elapsedSeconds: 180 }), true);
  assert.equal(found.storyCreditEarned({ waitTimed: false, elapsedSeconds: 900 }), false, 'games from afar are no story');
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'),
    /if \(!storyCreditEarned\(\{ waitTimed: snapshot\.waitTimed, elapsedSeconds: snapshot\.elapsedSeconds \}\)\) return;\n\s+void noteFoundAdventure/);
});
