const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const g = loadTs('src/components/map/guide.ts');
const size = { width: 400, height: 800 };

test('edge arrow: hidden on screen, pinned to the inset edge and pointing at an off-screen target', () => {
  assert.equal(g.edgeArrow({ x: 200, y: 420 }, size), null);
  const right = g.edgeArrow({ x: 900, y: 430 }, size);
  assert.equal(right.x, 360); assert.ok(Math.abs(right.angle) < 10);
  const above = g.edgeArrow({ x: 200, y: -500 }, size);
  assert.equal(above.y, 250); assert.ok(Math.abs(above.angle + 90) < 1);
  const below = g.edgeArrow({ x: 200, y: 2000 }, size);
  assert.equal(below.y, 610); assert.ok(Math.abs(below.angle - 90) < 1);
});

test('dashed guide runs from the player to the target and lasts four seconds', () => {
  const line = g.guideLine({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });
  assert.deepEqual(JSON.parse(JSON.stringify(line.features[0].geometry.coordinates)), [[2, 1], [4, 3]]);
  assert.equal(g.GUIDE_PATH_MS, 4000);
});
