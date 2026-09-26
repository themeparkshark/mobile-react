const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/newRounds.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { firstAddedRoundIndex } = moduleRef.exports;

test('new queue rounds remain reachable after shared and branching pages are inserted', () => {
  const playlist = [{ id: 'intro' }, { id: 'crew-relay' }, { id: 'original' },
    { id: 'new-one' }, { id: 'new-two' }];
  const pages = [{ id: 'crew-signal' }, { id: 'crew-puzzle' },
    { id: 'intro' }, { id: 'crew-relay' }, { id: 'route-epilogue' },
    { id: 'original' }, { id: 'new-one' }, { id: 'new-two' }];
  assert.equal(firstAddedRoundIndex(pages, playlist, 2), 6);
  assert.equal(firstAddedRoundIndex(pages, playlist, 0), -1);
  assert.equal(firstAddedRoundIndex(pages, playlist, 999), -1);
  assert.equal(firstAddedRoundIndex(pages.slice(0, 5), playlist, 2), -1);
});
