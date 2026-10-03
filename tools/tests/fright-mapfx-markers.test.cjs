'use strict';
// P0 guard: MapLibre crashes (NSRangeException in -[MLRNMapView insertReactSubview:atIndex:]) when
// Marker children inside MapView mount, unmount or reorder at runtime. The fright layer keeps a fixed,
// keyed Marker set for a payload, draws hidden spots as an invisible stand-in, and sits LAST in MapView.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const budget = loadTs('src/components/map/fright/frightBudget.ts');

const spot = (key, kind, fx = null) => ({ key, kind, name: key, blurb: '', latitude: 28.47, longitude: -81.46, radius: 60,
  walk_minutes: 5, status: null, posted_minutes: null, accepting: true, fan_rank: null, sort: 0, fx, art: null });

test('the marker set is a pure function of the payload: same keys in the same order, whatever the input order', () => {
  const a = [spot('h-b', 'haunt'), spot('r-a', 'reef', { props: ['bats'] }), spot('h-a', 'haunt'), spot('s', 'show', { props: ['bats'] })];
  const b = [a[3], a[2], a[1], a[0]];
  const keys = s => JSON.parse(JSON.stringify(s.all.map(x => x.key)));
  assert.deepEqual(keys(budget.stableMarkerSpots(a)), keys(budget.stableMarkerSpots(b)));
  assert.deepEqual(keys(budget.stableMarkerSpots(a)), ['r-a', 'r-a', 's', 'h-a', 'h-b'], 'reefs, then prop spots, then haunts, each by key');
  assert.deepEqual(JSON.parse(JSON.stringify(budget.stableMarkerSpots(a).haunts.map(x => x.key))), ['h-a', 'h-b']);
});

test('FrightMapSources never mounts or unmounts a Marker: no early return, no conditional Marker, no ranked order', () => {
  const src = read('src/components/map/fright/FrightMapSources.tsx');
  const body = src.slice(src.indexOf('export const FrightMapSources'), src.indexOf('export const FrightNightTint'));
  assert.doesNotMatch(body, /if \(visible <= 0\) return null/, 'no whole-layer unmount on fade');
  assert.doesNotMatch(body, /&&\s*\(\s*<Marker/, 'no conditional Marker');
  assert.doesNotMatch(body, /&& <Marker/, 'no conditional Marker');
  assert.doesNotMatch(body, /\.map\([^)]*\) => \{[^}]*return null;/s, 'no Marker dropped inside a map()');
  assert.match(body, /stable\.reefs\.map/);
  assert.match(body, /stable\.props\.map/);
  assert.match(body, /stable\.haunts\.map/);
  assert.match(body, /<Marker key="fe"/, 'one encounter Marker, always mounted');
  // Opacity-only: no stand-in swap either. Every spot keeps its real sprite tree; hidden = ShowWhen opacity 0.
  assert.doesNotMatch(src, /HiddenSpot/, 'no HiddenSpot-vs-sprite swaps inside a Marker');
  assert.match(body, /<ShowWhen on=\{on\}>/);
  assert.doesNotMatch(body, /\? <(HauntLantern|ReefCritters|ReefGlyph|SpotProps|EncounterSprite)\b/, 'no ternary picks a sprite type');
  assert.doesNotMatch(body, /: <(HauntLantern|ReefCritters|ReefGlyph|SpotProps|EncounterSprite)\b/);
  assert.doesNotMatch(body, /onPress=\{[^}]*\? \(\) =>/, 'onPress never toggles the Marker between Pressable and View');
  assert.doesNotMatch(body, /\{haunts\.map|\{reefs\.map|\{propSpots\.map/, 'culled/ranked lists never drive Markers');
});

test('Map.tsx: the night tint is always mounted and the fright markers are the last MapView child', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<FrightNightTint input=\{fright\} \/>/);
  const close = map.indexOf('</MapView>');
  const sources = map.lastIndexOf('<FrightMapSources', close);
  const shark = map.lastIndexOf('{location && (', close);
  assert.ok(sources > shark && sources < close, 'fright markers come after every other MapView child');
  assert.equal(map.match(/<FrightMapSources/g).length, 1);
});

test('no Skia node swaps anywhere in the fright layer: no `? <Sprite> : <Other>` and no `&& <Sprite>` (opacity gates only)', () => {
  const dir = path.join(root, 'src/components/map/fright');
  const skia = 'Canvas|Group|Rect|Circle|Oval|Path|Points|Mask|ImageShader|RadialGradient|LinearGradient|BlurMask|SkImage|SheetFrame|SoftEllipse|FeatheredMist|CritterBody|Critter|Bat|Eyes|Pumpkin|HangingLantern|SparksSlot|SkidSparks|SparkDot|LoopProp|BoltSprite|LayerWindow|LayeredFacade|PlaceholderFacade|PlaceholderWindow|TrailDot|HauntLantern|ReefCritters|ReefGlyph|ReefLod|SpotProps|EncounterSprite|HiddenSpot';
  const swap = new RegExp(`(\\?|:|&&)\\s*\\(?\\s*<(${skia})\\b`);
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    lines.forEach((text, i) => {
      if (/^\s*(\/\/|\*|\{\/\*)/.test(text)) return;
      assert.doesNotMatch(text, swap, `${file}:${i + 1} swaps a Skia node: ${text.trim()}`);
    });
    // A sprite component never bails out with `return null` before its Skia tree (that unmounts it).
    const src = lines.join('\n');
    const multiline = new RegExp(`(\\?|:|&&)\\s*\\(\\s*\\n\\s*<(${skia})\\b`);
    assert.doesNotMatch(src, multiline, `${file} swaps a Skia node across lines (\`&& (\` then a Skia element)`);
    for (const m of src.matchAll(/function (\w+)\([^]*?\n\}/g)) {
      if (!/<(Group|Canvas|SkImage|Circle|Rect)\b/.test(m[0])) continue;
      if (['FrightPerfProbe'].includes(m[1])) continue;
      assert.doesNotMatch(m[0], /^\s*if \([^)]*\) return null;/m, `${file} ${m[1]} returns null instead of hiding by opacity`);
    }
  }
});

test('ExploreScreen keeps the fright input for the whole event-park session (mode on/off fades, never remounts)', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(explore, /frightNight\.tonight && \(frightNight\.modeOn \|\| frightNight\.phase === 'after'\)/);
  assert.match(explore, /active: frightNight\.modeOn/);
});
