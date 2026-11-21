'use strict';
/** lineStatus.ts (pure, no imports) transpiled for harnesses that load LinePlaySession with a strict require. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/lineStatus.ts';
const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: file,
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports, Date, Math, Number, Set }, { filename: file });
module.exports = moduleRef.exports;
