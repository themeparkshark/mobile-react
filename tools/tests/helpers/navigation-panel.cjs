const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/navigationPanel.ts';
const moduleRef = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: moduleRef, exports: moduleRef.exports, Math, Number }, { filename: file });
module.exports = moduleRef.exports;
