const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/screens/ExploreScreen/homeHuntTarget.ts';
const rangeFile = 'src/screens/ExploreScreen/homePickupRange.ts';
const rangeCode = ts.transpileModule(fs.readFileSync(path.join(root, rangeFile), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const rangeModule = { exports: {} };
vm.runInNewContext(rangeCode, { module: rangeModule, exports: rangeModule.exports }, { filename: rangeFile });
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, Date, Math, Number,
  require: specifier => {
    if (specifier === './homePickupRange') return rangeModule.exports;
    throw new Error(`Unexpected dependency: ${specifier}`);
  },
}, { filename: file });
const { nearestNewVariant, nearestHomeHuntTarget } = moduleRef.exports;

test('home hunt selects the closest unowned live variant', () => {
  const now = Date.now();
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: false, latitude: 34.13811, longitude: -118.3534 },
    { id: 2, pivot_id: 11, is_new_variant: true, latitude: 34.139, longitude: -118.3534,
      active_to: new Date(now + 60_000).toISOString() },
    { id: 3, pivot_id: 12, is_new_variant: true, latitude: 34.1384, longitude: -118.3534,
      active_to: new Date(now + 60_000).toISOString() },
  ];
  const selected = nearestNewVariant(items, { latitude: 34.1381, longitude: -118.3534 }, now);
  assert.equal(selected.item.id, 3);
  assert.equal(selected.kind, 'new');
  assert.ok(selected.distanceMeters > 0 && selected.distanceMeters < 50);
});

test('home hunt offers the nearest repeat as an exchange spare when no new find is visible', () => {
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: false, latitude: 34.139, longitude: -118.3534 },
    { id: 2, pivot_id: 11, is_new_variant: false, latitude: 34.1382, longitude: -118.3534 },
    { id: 3, pivot_id: 12, latitude: 34.1381, longitude: -118.3534 },
  ];
  const selected = nearestHomeHuntTarget(items, { latitude: 34.1381, longitude: -118.3534 });
  assert.equal(selected.item.id, 2);
  assert.equal(selected.kind, 'spare');
});

test('new variants take priority over nearby repeats', () => {
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: false, latitude: 34.1381, longitude: -118.3534 },
    { id: 2, pivot_id: 11, is_new_variant: true, latitude: 34.13825, longitude: -118.3534 },
  ];
  assert.equal(nearestHomeHuntTarget(items, { latitude: 34.1381, longitude: -118.3534 }).item.id, 2);
});

test('an immediately collectible spare starts the hunt before a distant new variant', () => {
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: false, latitude: 34.13811, longitude: -118.3534 },
    { id: 2, pivot_id: 11, is_new_variant: true, latitude: 34.143, longitude: -118.3534 },
  ];
  const target = nearestHomeHuntTarget(items, { latitude: 34.1381, longitude: -118.3534 });
  assert.equal(target.item.id, 1);
  assert.equal(target.kind, 'spare');
});

test('a nearby missing variant is worth a modest walk beyond the closest spare', () => {
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: false, latitude: 34.1390, longitude: -118.3534 },
    { id: 2, pivot_id: 11, is_new_variant: true, latitude: 34.1398, longitude: -118.3534 },
  ];
  const target = nearestHomeHuntTarget(items, { latitude: 34.1381, longitude: -118.3534 });
  assert.equal(target.item.id, 2);
  assert.equal(target.kind, 'new');
});

test('a closer spare wins when a new variant requires a much longer walk', () => {
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: false, latitude: 34.1390, longitude: -118.3534 },
    { id: 2, pivot_id: 11, is_new_variant: true, latitude: 34.1430, longitude: -118.3534 },
  ];
  const target = nearestHomeHuntTarget(items, { latitude: 34.1381, longitude: -118.3534 });
  assert.equal(target.item.id, 1);
});

test('tapping a distant marker shows its distance without losing the nearby fallback', () => {
  const now = Date.now();
  const location = { latitude: 34.1381, longitude: -118.3534 };
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: false, latitude: 34.13811, longitude: -118.3534 },
    { id: 2, pivot_id: 11, is_new_variant: true, latitude: 34.143, longitude: -118.3534,
      active_to: new Date(now + 60_000).toISOString() },
  ];
  assert.equal(nearestHomeHuntTarget(items, location, now).item.id, 1);
  const selected = nearestHomeHuntTarget(items, location, now, 11);
  assert.equal(selected.item.id, 2);
  assert.ok(selected.distanceMeters > 50);
  assert.equal(nearestHomeHuntTarget(items, location, now + 61_000, 11).item.id, 1);
});

test('expired or malformed markers never become the next hunt', () => {
  const now = Date.now();
  const items = [
    { id: 1, pivot_id: 10, is_new_variant: true, latitude: 34.1381, longitude: -118.3534,
      active_to: new Date(now - 1000).toISOString() },
    { id: 2, pivot_id: 0, is_new_variant: true, latitude: 34.1381, longitude: -118.3534 },
  ];
  assert.equal(nearestNewVariant(items, { latitude: 34.1381, longitude: -118.3534 }, now), null);
  assert.equal(nearestNewVariant(items, null, now), null);
});
