const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/screens/ExploreScreen/homeRefresh.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { shouldThrottleHomeRequest } = moduleRef.exports;

test('moving around the neighborhood refreshes after the minimum interval', () => {
  const last = { lat: 34.1, lng: -118.3 };
  const moved = { lat: 34.1002, lng: -118.3 };
  assert.equal(shouldThrottleHomeRequest(moved, last, 0, 9_999, 15, 10_000, 720_000), true);
  assert.equal(shouldThrottleHomeRequest(moved, last, 0, 10_000, 15, 10_000, 720_000), false);
});

test('small GPS drift does not flood the API, but a stationary map refreshes when spawns roll', () => {
  const last = { lat: 34.1, lng: -118.3 };
  const jitter = { lat: 34.10001, lng: -118.3 };
  assert.equal(shouldThrottleHomeRequest(jitter, last, 0, 11_000, 15, 10_000, 720_000), true);
  assert.equal(shouldThrottleHomeRequest(jitter, last, 0, 720_000, 15, 10_000, 720_000), false);
});
