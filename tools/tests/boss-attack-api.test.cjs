const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'node_modules/typescript'));
const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/api/endpoints/parks/raid.ts'),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
function api(post){const moduleRef={exports:{}};
 vm.runInNewContext(code,{module:moduleRef,exports:moduleRef.exports,require(name){
  if(name==='../../client')return{default:{post}};throw Error(`Unexpected import ${name}`);
 }});return moduleRef.exports;}
const body={client_request_id:'boss-77-1000-abcdef123',latitude:34.13,longitude:-118.35,hits:3,weak_hits:1,duration_ms:20000};
test('only an explicit damage receipt and raid state can confirm an attack',async()=>{
 let endpoint,sent;const success=api(async(url,payload)=>{endpoint=url;sent=payload;return{data:{data:{damage:30,raid:null,next_at:null}}};});
 const result=await success.attackRaid(77,body);assert.equal(result.ok,true);assert.equal(result.damage,30);
 assert.equal(endpoint,'/raids/77/attack');assert.equal(sent,body);
 for(const data of [null,{}, {damage:50},{damage:-1,raid:null},{damage:NaN,raid:null},{damage:50,raid:{id:77}}]){
  const malformed=api(async()=>({data:{data}}));assert.equal((await malformed.attackRaid(77,body)).error,'network');
 }
});
test('unknown server or transport errors remain unconfirmed; only known terminal errors retire a saved proof',async()=>{
 for(const failure of [{response:{status:500,data:{data:{error:'unexpected'}}}},Error('Offline')]){
  const endpoint=api(async()=>{throw failure;});assert.equal((await endpoint.attackRaid(77,body)).error,'network');
 }
 const gone=api(async()=>{throw{response:{status:404,data:{data:{error:'not_found'}}}};});
 assert.equal((await gone.attackRaid(77,body)).error,'not_found');
 const over=api(async()=>{throw{response:{status:409,data:{data:{error:'raid_over',raid:null,next_at:null}}}};});
 const result=await over.attackRaid(77,body);assert.equal(result.error,'raid_over');assert.equal(result.state.raid,null);
});
