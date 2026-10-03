'use strict';
/**
 * Release RC integration contracts: seams between feature branches that no
 * single branch's tests can see.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadTs, read } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');

test('no two tracked paths differ only in letter case (macOS disks and Metro treat them as one)', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const seen = new Map();
  const clashes = [];
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const original = parts.slice(0, i).join('/');
      const key = original.toLowerCase();
      if (seen.has(key) && seen.get(key) !== original) clashes.push(`${seen.get(key)} vs ${original}`);
      else seen.set(key, original);
    }
  }
  assert.deepEqual([...new Set(clashes)], []);
});

test('Social v2 (friends, bell) and Threads v2 keep separate folders', () => {
  assert.match(read('src/screens/SocialScreen.tsx'), /from '\.\/threads\/socialModel'/);
  assert.match(read('src/screens/ThreadScreen.tsx'), /from '\.\/threads\/socialRows'/);
  assert.match(read('src/screens/PlayerScreen.tsx'), /from '\.\/social\/socialModel'/);
});

test('profile event chip is the real Fin-ister Nights chip', () => {
  const chip = read('src/components/profile/ProfileEventChip.tsx');
  assert.match(chip, /import \{ FrightCardChip \} from '\.\.\/fright'/);
  assert.match(chip, /return <FrightCardChip playerId=\{playerId\} \/>/);
});

test('the collection book Events card can open: FrightCard is a screen in the root stack it checks', () => {
  const rootSrc = read('src/Root.tsx');
  const open = rootSrc.indexOf('<Stack.Navigator');
  const close = rootSrc.indexOf('</Stack.Navigator>');
  assert.equal(rootSrc.indexOf('<Stack.Navigator', open + 1), -1, 'one root stack');
  const fright = rootSrc.indexOf('name="FrightCard"');
  assert.ok(open < fright && fright < close, 'FrightCard registered in the root stack');
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(screen, /navigationRef\.getRootState\(\)/);
  assert.match(screen, /routeNames\?\.includes\('FrightCard'\)/);
});

test('How to Play "Let\'s go" reaches the home map: highlightNearestFind is read and glides to the nearest find', () => {
  assert.match(read('src/screens/HowToPlayScreen.tsx'), /navigate\('Explore', \{ highlightNearestFind: Date\.now\(\) \}\)/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /highlightNearestFind\?: number/);
  assert.match(explore, /highlightNearestFind=\{highlightNearestFind\}/);
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /focusCoordinate=\{findFocus\}/);
  const { nearestFind } = loadTs('src/screens/ExploreScreen/nearestFind.ts');
  assert.equal(nearestFind([]), null);
  assert.equal(nearestFind([{ item: { latitude: 1, longitude: 2 }, distance: null }]), null, 'no GPS yet');
  assert.deepEqual(plain(nearestFind([
    { item: { latitude: 1, longitude: 1 }, distance: 90 },
    { item: { latitude: null, longitude: 3 }, distance: 5 },
    { item: { latitude: 2, longitude: 2 }, distance: 40 },
  ])), { latitude: 2, longitude: 2 });
});

test('"Let sharks find me" sends the grown-up yes the server requires (notif-friends-be R4)', () => {
  const screen = read('src/screens/FriendsScreen.tsx');
  assert.match(screen, /GrownUpGate/);
  assert.match(screen, /grown_up_confirmed: true/);
  assert.match(read('src/api/endpoints/me/update-player.ts'), /grown_up_confirmed/);
});
