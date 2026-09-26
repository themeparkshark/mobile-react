const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/partCountdown.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const countdown = (...args) => JSON.parse(JSON.stringify(moduleRef.exports.partCountdown(...args)));

test('queue countdown moves smoothly but waits for a verified milestone', () => {
  const verifiedAt = 1_000_000;
  assert.deepEqual(countdown(590, verifiedAt, verifiedAt, 600), {
    progressSeconds: 590, remainingSeconds: 10, checking: false, estimated: true, needsCheck: false,
  });
  assert.deepEqual(countdown(590, verifiedAt, verifiedAt + 5_000, 600), {
    progressSeconds: 595, remainingSeconds: 5, checking: false, estimated: true, needsCheck: false,
  });
  assert.deepEqual(countdown(590, verifiedAt, verifiedAt + 11_000, 600), {
    progressSeconds: 600, remainingSeconds: 0, checking: true, estimated: true, needsCheck: false,
  });
  assert.deepEqual(countdown(600, verifiedAt + 30_000, verifiedAt + 30_000, 600), {
    progressSeconds: 0, remainingSeconds: 600, checking: false, estimated: true, needsCheck: false,
  });
});

test('the display stops predicting when nearby verification goes stale', () => {
  assert.deepEqual(countdown(590, 1_000_000, 1_046_000, 600), {
    progressSeconds: 590, remainingSeconds: 10, checking: false, estimated: false, needsCheck: true,
  });
  assert.deepEqual(countdown(590, null, 1_000_000, 600), {
    progressSeconds: 590, remainingSeconds: 10, checking: false, estimated: false, needsCheck: true,
  });
});
