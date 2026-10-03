/** Integration points: ExploreScreen mounts the mode; navigation has the routes; L6 hook is exported. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('ExploreScreen wires the pill, the layer, the engine and <Map fright>', () => {
  const src = read('src/screens/ExploreScreen.tsx');
  assert.match(src, /useFrightNight\(/);
  assert.match(src, /useFrightEngine\(/);
  assert.match(src, /<FrightPill /);
  assert.match(src, /<FrightLayer /);
  assert.match(src, /fright=\{frightMap\}/);
  assert.match(src, /showLive: nightShow\.phase === 'live'/);
  assert.match(src, /quiet: frightEngine\.quiet/);
});

test('Root registers FrightCard, FrightRecap and FrightTutorial', () => {
  const src = read('src/Root.tsx');
  for (const name of ['FrightCard', 'FrightRecap', 'FrightTutorial']) assert.match(src, new RegExp(`name="${name}"`));
});

test('CONTRACT 5-6 exports and the L6 photo hook', () => {
  const index = read('src/components/fright/index.ts');
  for (const name of ['FrightCardScreen', 'FrightCardChip', 'FrightRecapCard']) assert.match(index, new RegExp(`as ${name}\\b`));
  const hooks = read('src/services/fright/hooks.ts');
  assert.match(hooks, /export function frightPhotoTheme/);
  assert.match(hooks, /export function isFrightModeOn/);
});

test('H6 phones-down: the engine hides prompts during the quiet window', () => {
  const engine = read('src/components/fright/useFrightEngine.ts');
  assert.match(engine, /rank: quiet \? null : rank/);
  assert.match(engine, /tutorial: quiet \|\| opts\.blocked \? null : tutorial/);
  assert.match(engine, /!quiet && !opts\.blocked && !sheetOpen/);
});

test('first-run flows win: the Fin-ister intro and coach marks wait while the app tutorial or home intro is up', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '../..');
  const explore = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'src/components/fright/useFrightEngine.ts'), 'utf8');
  assert.match(explore, /blocked: !isReady \|\| isActive \|\| homeIntroOpen/);
  assert.match(engine, /tutorial \|\| quiet \|\| opts\.blocked\) return;/);
  assert.match(engine, /canCoach = modeOn && focused && foreground && !quiet && !opts\.blocked/);
  assert.match(engine, /tutorial: quiet \|\| opts\.blocked \? null : tutorial/);
});
