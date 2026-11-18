// T187: coming back from iOS Settings remounted the map and a bounds query named a native view
// UIKit did not have yet ("Invalid react tag, could not find MLRNMapView" in getVisibleBounds).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
const gateModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/map/nativeMapGate.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: gateModule, exports: gateModule.exports });
const { createNativeMapGate } = gateModule.exports;
const map = fs.readFileSync(path.join(root, 'src/components/Map.tsx'), 'utf8');
const fright = fs.readFileSync(path.join(root, 'src/components/map/fright/FrightMapSources.tsx'), 'utf8');

test('a mounted map is not queried until a native map event proves its view exists', () => {
  const view = { current: { name: 'map' } };
  const gate = createNativeMapGate(view);
  assert.equal(gate.ref.current, null, 'JS ref set, native view not reported yet');
  gate.ready();
  assert.equal(gate.ref.current, view.current);
  gate.gone();
  assert.equal(gate.ref.current, null, 'unmounted: never again');
  gate.ready();
  assert.equal(gate.ref.current, null, 'a late event after unmount does not reopen it');
});

test('a detached JS ref keeps the gate shut', () => {
  const view = { current: null };
  const gate = createNativeMapGate(view);
  gate.ready();
  assert.equal(gate.ref.current, null);
  assert.equal(gate.isOpen(), false);
});

test('every native map query in Map.tsx goes through the gate', () => {
  const queries = /mapViewRef\.current\??\.(getVisibleBounds|getZoom|getCenter|getPointInView|getCoordinateFromView|queryRenderedFeatures\w*|takeSnap)/;
  assert.doesNotMatch(map, queries);
  assert.doesNotMatch(map, /const map = mapViewRef\.current/);
  assert.match(map, /createNativeMapGate\(mapViewRef\)/);
  // The gate closes in a layout effect: a passive cleanup ran after the native view was already gone.
  assert.match(map, /useLayoutEffect\(\(\) => \(\) => mapGate\.gone\(\)/);
  // The fright bounds poll reads the gated ref, never the raw one.
  assert.match(map, /<FrightMapSources [^>]*mapRef=\{nativeMap\}/);
  assert.match(fright, /mapRef\.current\?\.getVisibleBounds/);
});

test('the gate opens on native map events, including the first one a remounted map sends', () => {
  assert.match(map, /const revealMap = \(\) => \{ mapGate\.ready\(\);/);
  assert.match(map, /onDidFinishLoadingMap=\{revealMap\}/);
  for (const handler of ['onRegionWillChange', 'onRegionIsChanging', 'onRegionDidChange', 'onDidFinishRenderingMapFully']) {
    const at = map.indexOf(`${handler}={`);
    assert.ok(at > 0, handler);
    assert.match(map.slice(at, at + 160), /mapGate\.ready\(\)/, handler);
  }
});
