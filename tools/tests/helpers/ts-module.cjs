'use strict';
/**
 * loadTs(file, stubs): transpile a src/ TypeScript module and its relative
 * imports into one vm realm. `stubs` maps a specifier (exact string used in the
 * import) to a module object; anything else relative is loaded recursively,
 * and bare packages not stubbed throw so a test never silently runs a fake.
 * Use plain() from ./plain.cjs before deepEqual on values from the realm.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function resolveFile(fromDir, specifier) {
  const base = path.resolve(fromDir, specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`loadTs: cannot resolve ${specifier} from ${fromDir}`);
}

exports.loadTs = function loadTs(file, stubs = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ console, Date, Math, __DEV__: false, process: { env: {} }, setTimeout, clearTimeout, Promise, ...globals });
  function load(full) {
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {} };
    cache.set(full, module);
    const source = fs.readFileSync(full, 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: full,
    }).outputText;
    const fn = vm.runInContext(`(function (module, exports, require) {${code}\n})`, context, { filename: full });
    fn(module, module.exports, specifier => {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
      // Bundled art resolves to its path, as in reward-hook-runtime.
      if (/\.(png|jpe?g|gif|webp)$/i.test(specifier)) return specifier;
      // JSON data (e.g. shared rule tables) loads as data, like Metro does.
      if (specifier.startsWith('.') && specifier.endsWith('.json')) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(full), specifier), 'utf8'));
      if (specifier.startsWith('.')) return load(resolveFile(path.dirname(full), specifier));
      throw new Error(`loadTs: unstubbed import ${specifier} in ${path.relative(root, full)}`);
    });
    return module.exports;
  }
  return load(path.join(root, file));
};
