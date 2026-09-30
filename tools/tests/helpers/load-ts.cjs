// Transpile one app TypeScript module and run it in an isolated VM context
// with explicit mocks, so release-engineering tests exercise real source.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function loadTs(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    __DEV__: false,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    JSON,
    Math,
    URL,
    ...globals,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime') {
        const jsx = (type, props) => ({ type, props });
        return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return module.exports;
}

const read = file => fs.readFileSync(path.join(root, file), 'utf8');

module.exports = { loadTs, read, root };
