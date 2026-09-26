const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const source = fs.readFileSync(path.join(root, 'src/context/parkLookupPolicy.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, Date, Math });
const { shouldRefreshParkLookup, isConfirmedOutsidePark } = moduleRef.exports;
const point = { latitude: 34.1381, longitude: -118.3534 };
const moved = meters => ({ ...point, latitude: point.latitude + meters / 111_000 });
const previous = (outcome, at = 100_000) => ({ ...point, at, outcome });

test('first lookup is immediate and small GPS drift does not repeat a park check-in', () => {
  assert.equal(shouldRefreshParkLookup(point, null, 100_000), true);
  assert.equal(shouldRefreshParkLookup(moved(5), previous('park'), 100_100), false);
  assert.equal(shouldRefreshParkLookup(moved(79), previous('park'), 100_100), false);
  assert.equal(shouldRefreshParkLookup(moved(82), previous('park'), 100_100), true);
  assert.equal(shouldRefreshParkLookup(point, previous('park'), 400_000), true);
});

test('outside lookups favor prompt park entry; network failures back off', () => {
  assert.equal(shouldRefreshParkLookup(moved(10), previous('outside'), 100_100), false);
  assert.equal(shouldRefreshParkLookup(moved(27), previous('outside'), 100_100), true);
  assert.equal(shouldRefreshParkLookup(point, previous('outside'), 130_000), true);
  assert.equal(shouldRefreshParkLookup(moved(100), previous('error'), 110_000), false);
  assert.equal(shouldRefreshParkLookup(point, previous('error'), 115_000), true);
});

test('home finds require a nearby confirmed outside-park lookup', () => {
  assert.equal(isConfirmedOutsidePark(point, null), false);
  assert.equal(isConfirmedOutsidePark(undefined, previous('outside')), false);
  assert.equal(isConfirmedOutsidePark(point, previous('outside')), true);
  assert.equal(isConfirmedOutsidePark(moved(24), previous('outside')), true);
  assert.equal(isConfirmedOutsidePark(moved(27), previous('outside')), false);
  assert.equal(isConfirmedOutsidePark(point, previous('park')), false);
  assert.equal(isConfirmedOutsidePark(point, previous('error')), false);
});
