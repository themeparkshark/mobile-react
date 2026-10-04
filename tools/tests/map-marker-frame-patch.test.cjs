const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
// Run with: node --test tools/tests/map-marker-frame-patch.test.cjs
// The player's shark (and a hopping find) blinked to the map's top-left corner:
// React re-placed the native marker at its layout origin on every commit.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('postinstall patches MLRNPointAnnotation so React never moves a marker MapLibre owns', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.postinstall, /node tools\/maplibre\/patch-marker-frame\.mjs/);
  const script = read('tools/maplibre/patch-marker-frame.mjs');
  assert.match(script, /- \(void\)setFrame:\(CGRect\)frame \{/);
  assert.match(script, /\[_map\.annotations containsObject:self\]/);
  assert.match(script, /\[super setBounds:bounds\]/);
  assert.match(script, /self\.layer\.position = /);
  const native = path.join(root, 'node_modules/@maplibre/maplibre-react-native/ios/MLRN/MLRNPointAnnotation.m');
  if (fs.existsSync(native)) {
    execFileSync(process.execPath, [path.join(root, 'tools/maplibre/patch-marker-frame.mjs'), '--check'], { stdio: 'pipe' });
    const src = fs.readFileSync(native, 'utf8');
    assert.equal(src.split('TPS marker-frame patch').length - 1, 1, 'applied exactly once');
  }
});

test('the panned-away shark marker has a fixed, clipped box so its layout never changes while it bobs', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /const SHARK_MARKER_CLIP = \{ width: 100, height: 156 \} as const;/);
  assert.match(map, /sharkMarkerClip: \{ \.\.\.SHARK_MARKER_CLIP, overflow: 'hidden'/);
  assert.match(map, /anchor=\{SHARK_MARKER_ANCHOR\}>\s*<View style=\{\[styles\.sharkMarkerClip, \{ opacity: focusedOnPlayer( \|\| !playerOnScreen)? \? 0 : 1 \}\]\}>\{playerShark\}<\/View>/);
  // The ground point (71.5 pt down the 110 pt shark box) stays on the coordinate.
  assert.match(map, /y: 71\.5 \/ SHARK_MARKER_CLIP\.height/);
});
