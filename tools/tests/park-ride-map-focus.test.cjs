const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/screens/ExploreScreen/parkRideMapFocus.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, Number, Math }, { filename: file });
const { rideFocusForPark } = moduleRef.exports;
const task = { id: 7, name: 'Space Mountain', latitude: '28.418', longitude: '-81.578' };

test('checklist handoff focuses a mapped ride in the detected park', () => {
  assert.equal(rideFocusForPark({ parkId: 1, task }, 1), task);
});

test('checklist handoff accepts numeric coordinates returned by the API', () => {
  const numeric = { ...task, latitude: 28.418, longitude: -81.578 };
  assert.equal(rideFocusForPark({ parkId: 1, task: numeric }, 1), numeric);
  assert.equal(rideFocusForPark({ parkId: 1, task: { ...numeric, latitude: null } }, 1), null);
});

test('checklist handoff does not focus a ride in another park or before detection', () => {
  assert.equal(rideFocusForPark({ parkId: 1, task }, 2), null);
  assert.equal(rideFocusForPark({ parkId: 1, task }, null), null);
});

test('checklist handoff rejects malformed coordinates before sending them to MapView', () => {
  assert.equal(rideFocusForPark({ parkId: 1, task: { ...task, latitude: '91' } }, 1), null);
  assert.equal(rideFocusForPark({ parkId: 1, task: { ...task, longitude: 'unknown' } }, 1), null);
  assert.equal(rideFocusForPark({ parkId: 1, task: { ...task, latitude: '' } }, 1), null);
});
