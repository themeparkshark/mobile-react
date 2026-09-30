const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),ts=require(path.join(root,'node_modules/typescript'));
function load(file,imports={}){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
 }).outputText,{module,exports:module.exports,Date,Math,Map,Number,require(name){
  if(Object.hasOwn(imports,name))return imports[name];throw Error(`Unexpected import: ${name}`);
 }});
 return module.exports;
}
const timing=load('src/screens/ExploreScreen/mapOpportunityTiming.ts');
module.exports=load('src/services/boss/mapImpact.ts',{
 '../../constants/teams':{isTeam:team=>['mouse','globe','shark'].includes(team)},
 '../../screens/ExploreScreen/mapOpportunityTiming':timing,
});
