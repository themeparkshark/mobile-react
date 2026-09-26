const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/lineplay/crewGrid.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: 'crewGrid.ts' });
const { buildCrewGrid, crewGridHasLine } = moduleRef.exports;

test('crew grid varies by session while preserving a ride story clue and unique squares', () => {
  const first = buildCrewGrid('Space Mountain', 'The Lost Star Chart', 42);
  const repeated = buildCrewGrid('Space Mountain', 'The Lost Star Chart', 42);
  const next = buildCrewGrid('Space Mountain', 'The Lost Star Chart', 43);
  assert.equal(first.length, 9);
  assert.equal(new Set(first.map(square => square.id)).size, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(repeated)));
  assert.notDeepEqual(first.map(square => square.id), next.map(square => square.id));
  assert.match(first[4].prompt, /Lost Star Chart/);
  assert.match(first[4].prompt, /Space Mountain/);
});

test('only a complete row column or diagonal finishes the crew grid', () => {
  assert.equal(crewGridHasLine([]), false);
  assert.equal(crewGridHasLine([0, 1, 4]), false);
  assert.equal(crewGridHasLine([0, 1, 2]), true);
  assert.equal(crewGridHasLine([1, 4, 7]), true);
  assert.equal(crewGridHasLine([2, 4, 6]), true);
});
