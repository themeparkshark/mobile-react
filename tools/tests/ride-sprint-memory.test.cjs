const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/games/memory/logic.ts';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: file,
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { boardShapeFor, buildBoard, scoreConfigFor } = moduleRef.exports;

test('paid ride memory uses four complete pairs while queue boards keep their depth', () => {
  const deck = { symbols: Array.from({ length: 12 }, (_, id) => ({ id })) };
  const ride = buildBoard(0, deck, 12345);
  const queue = buildBoard(1, deck, 12345);
  const hardQueue = buildBoard(3, deck, 12345);

  assert.deepEqual({ ...boardShapeFor(0) }, { cols: 4, rows: 2, pairs: 4 });
  assert.equal(ride.cards.length, 8);
  assert.equal(queue.cards.length, 16);
  assert.equal(hardQueue.cards.length, 20);
  const counts = new Map();
  for (const card of ride.cards) {
    counts.set(card.symbolIndex, (counts.get(card.symbolIndex) ?? 0) + 1);
  }
  assert.equal(counts.size, 4);
  assert.ok([...counts.values()].every(count => count === 2));
  assert.equal(scoreConfigFor(0).targetSeconds, 28);
  assert.deepEqual(JSON.parse(JSON.stringify(ride)), JSON.parse(JSON.stringify(buildBoard(0, deck, 12345))));
});
