// Loads src/games/boss/bash/rules.ts for node tests (TypeScript transpiled in a VM).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),ts=require(path.join(root,'node_modules/typescript'));
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/games/boss/bash/rules.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {module:mod,exports:mod.exports,require:()=>({})});
module.exports=mod.exports;
