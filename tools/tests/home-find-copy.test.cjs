const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (id) => deps[id] }, { filename: file });
  return mod.exports;
}
const range = load('src/screens/ExploreScreen/homePickupRange.ts');
const copy = load('src/screens/ExploreScreen/homeFindCopy.ts', { './homePickupRange': range });
const bar = load('src/components/home/homeLiveBar.ts');
const R = range.HOME_PREP_PICKUP_RADIUS_METERS;

test('in range exactly at the pickup radius, out just past it, never for unknown distance', () => {
  assert.equal(copy.isInPickupRange(R), true);
  assert.equal(copy.isInPickupRange(R + 1), false);
  assert.equal(copy.isInPickupRange(0), true);
  assert.equal(copy.isInPickupRange(null), false);
  assert.equal(copy.isInPickupRange(Number.NaN), false);
});

test('timers read "leaves in", round up, and vanish when gone', () => {
  assert.equal(copy.formatLeavesIn(21 * 60_000), 'leaves in 21m');
  assert.equal(copy.formatLeavesIn(20 * 60_000 + 1), 'leaves in 21m');
  assert.equal(copy.formatLeavesIn(40_000), 'leaves in 40s');
  assert.equal(copy.formatLeavesIn(65 * 60_000), 'leaves in 1h 5m');
  assert.equal(copy.formatLeavesIn(0), null);
  assert.ok(!/0m/.test(copy.formatLeavesIn(30_000)));
});

test('distances are friendly', () => {
  assert.equal(copy.formatFindDistance(73), '75 m');
  assert.equal(copy.formatFindDistance(1500), '1.5 km');
  assert.equal(copy.formatFindDistance(-1), '');
});

test('team race bar stays hidden unless the server enables the board; a live raid wins', () => {
  assert.equal(bar.homeLiveBar(null, false), null);
  assert.equal(bar.homeLiveBar({}, false), null);
  assert.equal(bar.homeLiveBar({ home_hunt_board_enabled: false }, false), null);
  assert.equal(bar.homeLiveBar({ home_hunt_board_enabled: true }, false), 'teams');
});
