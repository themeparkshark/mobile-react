const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),ts=require(path.join(root,'node_modules/typescript'));
const moduleRef={exports:{}};
const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/services/boss/attackRecovery.ts'),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
vm.runInNewContext(code,{module:moduleRef,exports:moduleRef.exports,
 require(name){
  if(name==='@react-native-async-storage/async-storage')return {default:{}};
  if(name==='../../api/endpoints/parks/raid')return {attackRaid(){throw Error('No network in fixture');}};
  throw Error(`Unexpected import ${name}`);
 }
});
module.exports=moduleRef.exports;
