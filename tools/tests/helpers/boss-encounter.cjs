const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleRef={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/games/boss/encounter.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleRef,exports:moduleRef.exports});
module.exports=moduleRef.exports;
