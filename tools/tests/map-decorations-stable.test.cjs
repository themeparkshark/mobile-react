'use strict';
// Trees keep their exact spot when the camera moves, so MapLibre matches the rebuilt symbols to the
// ones on screen instead of swapping the whole layer (the one-frame tree flash in the R6 soak).
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const d = loadTs('src/components/map/decorations.ts');

const square = (w, s, e, n) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon',
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });

test('decorations are world-anchored: a camera move keeps every shared tree at the same coordinates', () => {
  const wood = [square(-81.475, 28.470, -81.460, 28.482)];
  const at = (dLat, dLng) => ({ north: 28.4785 + dLat, south: 28.4735 + dLat, east: -81.4650 + dLng, west: -81.4700 + dLng });
  const key = f => f.geometry.coordinates.join(',');
  for (const zoom of [16, 17, 17.8]) {
    const a = d.buildDecorations({ wood, green: [], water: [] }, at(0, 0), zoom).features;
    const b = d.buildDecorations({ wood, green: [], water: [] }, at(0.0012, 0.0009), zoom).features;
    assert.ok(a.length > 10 && b.length > 10, `trees at z${zoom}`);
    const inA = new Set(a.map(key));
    const overlap = { north: 28.4785, south: 28.4747, east: -81.4650, west: -81.4691 };
    const shared = b.filter(f => { const [x, y] = f.geometry.coordinates; return x > overlap.west && x < overlap.east && y > overlap.south && y < overlap.north; });
    assert.ok(shared.length > 5, `overlap has trees at z${zoom}`);
    for (const f of shared) assert.ok(inA.has(key(f)), `z${zoom}: tree ${key(f)} moved between rebuilds`);
  }
});
