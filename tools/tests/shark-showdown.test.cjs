const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/games/showdown/logic.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { rivalAnswer, showdownStars, showdownReplaySeed } = moduleRef.exports;

test('Captain Fin is replayable and sometimes misses questions at each difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const question = { correctIndex: 2, choices: ['a', 'b', 'c', 'd'], difficulty };
    const answers = Array.from({ length: 100 }, (_, seed) => rivalAnswer(question, seed, 1));
    assert.ok(answers.every(index => index >= 0 && index < 4));
    assert.ok(answers.some(index => index === 2));
    assert.ok(answers.some(index => index !== 2));
    assert.equal(rivalAnswer(question, 42, 1), rivalAnswer(question, 42, 1));
  }
});

test('a loss, tie, and perfect win have distinct results', () => {
  assert.equal(showdownStars(1, 2, 3), 0);
  assert.equal(showdownStars(2, 2, 3), 1);
  assert.equal(showdownStars(2, 1, 3), 2);
  assert.equal(showdownStars(3, 2, 3), 3);
});

test('consecutive rematches open different thirds of an eight-question ride chapter', () => {
  const first = [0, 1, 2].map(offset => (showdownReplaySeed(1, 0) + offset) % 8);
  const second = [0, 1, 2].map(offset => (showdownReplaySeed(1, 1) + offset) % 8);
  assert.equal(new Set([...first, ...second]).size, 6);
  assert.notDeepEqual(first, second);
});
