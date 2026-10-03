/** Dev capture harness: app-layer states follow the intro states, durations are fixed, and it is dev-only. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('capture harness: every fix state exists with its duration (marquee-retry waits out the 12 s timeout)', () => {
  const src = read('src/components/fright/preview/FrightAppPreview.tsx');
  for (const state of ['map-chips', 'sheet-focus', 'in-line', 'survive-ready', 'rank', 're-swim', 'coach-pill', 'marquee-retry',
    'marquee-zero-gate']) assert.match(src, new RegExp(`'${state}'`), state);
  assert.match(src, /'marquee-retry': 16/);
  assert.match(src, /hideAllOpen/);
  assert.match(src, /'usf26-farmhouse-ufo': 30/);
  const screen = read('src/components/fright/tutorial/FrightIntroPreviewScreen.tsx');
  assert.match(screen, /CYCLE = \[\.\.\.INTRO_STATES, \.\.\.APP_PREVIEW_STATES\]/);
});

test('capture harness is dev-only: routed through devRoutes behind EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW, never from Root', () => {
  assert.match(read('src/devRoutes.tsx'), /EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW/);
  assert.doesNotMatch(read('src/Root.tsx'), /FrightAppPreview|FrightIntroPreview/);
  for (const file of ['src/screens/ExploreScreen.tsx', 'src/components/fright/index.ts']) {
    assert.doesNotMatch(read(file), /FrightAppPreview/, file);
  }
});
