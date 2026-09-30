const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { loadTs, read, root } = require('./helpers/load-ts.cjs');

const load = (dev, env = {}) => loadTs('src/devRoutes.tsx', {}, { __DEV__: dev, process: { env } });

test('release builds register no dev screens and never start on a preview', () => {
  const routes = load(false, { EXPO_PUBLIC_BOSS_MAP_PREVIEW: '1' });
  assert.equal(routes.DEV_SCREENS.length, 0);
  assert.equal(routes.devInitialRoute(), null);
});

test('development keeps every preview route and the original flag priority', () => {
  const dev = load(true);
  const names = dev.DEV_SCREENS.map(screen => screen.name);
  for (const name of ['GameKitGym', 'UiKitGym', 'MiniGameTester', 'BossMapPreview', 'ParkChecklistPreview', 'HomeHuntPreview', 'RideLogSuccessPreview']) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(new Set(names).size, names.length, 'no duplicate route names');
  assert.equal(dev.devInitialRoute(), null);
  assert.equal(load(true, { EXPO_PUBLIC_BOSS_MAP_PREVIEW: '1', EXPO_PUBLIC_TRIVIA_GAME_PREVIEW: '1' }).devInitialRoute(), 'BossMapPreview');
  assert.equal(load(true, { EXPO_PUBLIC_PARK_PASSPORT_PREVIEW: '1' }).devInitialRoute(), 'ParkChecklistPreview');
  assert.equal(load(true, { EXPO_PUBLIC_TUTORIAL_PREVIEW: '1' }).devInitialRoute(), 'HomeHuntPreview');
  assert.equal(load(true, { EXPO_PUBLIC_RIDE_GAME_PREVIEW: '1' }).devInitialRoute(), 'MiniGameTester');
  assert.equal(load(true, { EXPO_PUBLIC_POST_WIN_FIRST_PREVIEW: '1' }).devInitialRoute(), 'PostWinRewardsPreview');
  assert.equal(load(true, { EXPO_PUBLIC_UI_KIT_PREVIEW: '1' }).devInitialRoute(), 'UiKitGym');
});

test('Root imports no preview or tester screen directly', () => {
  const source = read('src/Root.tsx');
  assert.doesNotMatch(source, /import \w+ from '\.\/screens\/[\w/]*PreviewScreen'/);
  assert.doesNotMatch(source, /import \w+ from '\.\/screens\/(MiniGameTester|GameKitGym)Screen'/);
  assert.match(source, /DEV_SCREENS\.map/);
});

test('every dev screen module exists', () => {
  const source = read('src/devRoutes.tsx');
  const files = [...source.matchAll(/require\('\.\/((?:screens|ui)\/[\w/]+)'\)/g)].map(match => `src/${match[1]}.tsx`);
  assert.ok(files.length >= 20);
  assert.ok(files.includes('src/ui/UiKitGym.tsx'), 'the WS0 kit gym is registered');
  const listed = execFileSync('git', ['ls-files', ...files], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  assert.equal(listed.length, files.length);
});

test('no app source imports react-native-maps; previews use the MapLibre game map', () => {
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-l', "from 'react-native-maps'", '--', 'src'], { cwd: root, encoding: 'utf8' }).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  assert.deepEqual(hits ? hits.split('\n') : [], []);
});

test('preview screens and dev routes carry no emoji or em dashes in their fixtures', () => {
  const files = execFileSync('git', ['ls-files', '--', 'src/**/*PreviewScreen.tsx', 'src/devRoutes.tsx', 'src/dev'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  assert.ok(files.length > 5, 'found the preview screens');
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u;
  const offenders = [];
  for (const file of files) {
    read(file).split('\n').forEach((line, i) => {
      if (emoji.test(line) || line.includes('—')) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('Root mounts exactly one GameDialogHost for the whole app', () => {
  const source = read('src/Root.tsx');
  assert.equal(source.match(/<GameDialogHost\s*\/>/g)?.length, 1);
  assert.match(source, /import \{ GameDialogHost \} from '\.\/ui'/);
});
