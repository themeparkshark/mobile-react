// Crash guards for the in-park map (declutter R2):
//  - RN Skia: EXC_BAD_ACCESS in JsiDomDeclarationNode::invalidateContext while panning (Skia nodes that a
//    running clock animates were mounted and unmounted as tiers, budgets or placements changed).
//  - MapLibre: -[MLRNMapView insertReactSubview:atIndex:] when MapView children mount, unmount or reorder.
// Each guard keeps a fixed tree and changes only what is drawn.
const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');

test('the sky overlay keeps one fixed Skia tree: tier, light and pause only change strengths', () => {
  const sky = read('src/components/map/alive/MapSkyOverlay.tsx');
  assert.match(sky, /Array\.from\(\{ length: SKY_MAX\.clouds \}/);
  assert.match(sky, /Array\.from\(\{ length: SKY_MAX\.birds \}/);
  assert.match(sky, /Array\.from\(\{ length: SKY_MAX\.fireflies \}/);
  assert.match(sky, /strength=\{i < clouds \? light\.clouds : 0\}/);
  assert.doesNotMatch(sky, /if \(!running \|\|/, 'a paused map keeps the canvas mounted');
});

test('Fin-ister art never mounts or unmounts animated Skia nodes on tier, budget or motion changes', () => {
  const layer = read('src/components/map/fright/FrightMapLayer.tsx');
  assert.doesNotMatch(layer, /fogNear && full &&/);
  assert.doesNotMatch(layer, /clouds && full &&/);
  assert.doesNotMatch(layer, /\{caps\.frightBolts > 0 && \(/);
  const sprites = read('src/components/map/fright/FrightSprites.tsx');
  assert.doesNotMatch(sprites, /ghostImg && ghosts && !dim &&/);
  assert.doesNotMatch(sprites, /take\(false\) && <SkidSparks/);
  assert.doesNotMatch(sprites, /animated && !lite && Array\.from\(\{ length: bats \}/);
  // Fixed at `slots`, count clamped to it (fright r3 opacity-only pass): the budget never adds a node.
  assert.match(sprites, /Array\.from\(\{ length: slots \}/, 'critter slots stay mounted');
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /const glyph = lod === 'glyph' \|\| st\.tier === 'calm';/, 'standing still does not swap the reef canvas');
});

test('the declutter only changes opacity and transforms; it never feeds a placement into Skia art', () => {
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.doesNotMatch(sources, /placement\.visible/, 'no Skia prop follows a placement');
  const placed = read('src/components/map/declutter/Placed.tsx');
  assert.match(placed, /<Animated\.View pointerEvents=\{placement\.visible \? 'box-none' : 'none'\} style=\{fade\}>/);
});

test('MapView children never mount mid-list: sources always mounted, glints and trail are fixed pools, islands keep their order', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<ShapeSource id="tps-lamps" shape=\{light\.lamps >= 0\.05 \? lampPoints : (?:EMPTY|NO_FEATURES)\}>/);
  assert.match(map, /<ShapeSource id="tps-crowd-haze" shape=\{crowdHaze \?\? (?:EMPTY|NO_FEATURES)\}>/);
  assert.match(map, /<ShapeSource id="tps-guide" shape=\{guideTarget && location && pathShown \? guideLine\(location, guideTarget\) : (?:EMPTY|NO_FEATURES)\}>/);
  const glints = read('src/components/map/alive/WaterGlints.tsx');
  assert.match(glints, /Array\.from\(\{ length: GLINT_SLOTS \}/);
  assert.match(glints, /key=\{`glint-\$\{slot\}`\}/);
  const trail = read('src/components/map/alive/SharkTrail.tsx');
  assert.match(trail, /Array\.from\(\{ length: TRAIL_SLOTS \}/);
  assert.match(trail, /key=\{`trail-\$\{slot\}`\}/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(explore, /clusterMarkers\(/, 'no zoom-driven fold that unmounts islands');
  assert.match(explore, /rideOrder\.current\.ids\.push\(task\.id\)/, 'new islands append');
});

test('the panned-away shark hides while its spot is off screen (iOS draws off-screen marker views at the top-left)', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /opacity: focusedOnPlayer \|\| !playerOnScreen \? 0 : 1/);
  assert.match(map, /checkPlayer\(feature\.properties\?\.visibleBounds\)/);
});
