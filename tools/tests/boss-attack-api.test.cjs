const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'node_modules/typescript'));
const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/api/endpoints/parks/raid.ts'),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
function api(post){const moduleRef={exports:{}};
 vm.runInNewContext(code,{module:moduleRef,exports:moduleRef.exports,require(name){
  if(name==='../../client')return{default:{post,get:post}};throw Error(`Unexpected import ${name}`);
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
test('a validated 422 without a game error retires the round; 401 and 5xx stay retryable',async()=>{
 const refused=api(async()=>{throw{response:{status:422,data:{message:'The round token field must be a string.'}}};});
 assert.equal((await refused.attackRaid(77,body)).error,'bad_proof');
 for(const status of [401,500,503]){const e=api(async()=>{throw{response:{status,data:{}}};});assert.equal((await e.attackRaid(77,body)).error,'network');}
 const round=api(async()=>{throw{response:{status:422,data:{data:{error:'bad_round'}}}};});assert.equal((await round.attackRaid(77,body)).error,'bad_round');
});
test('FIGHT rounds: only a real token starts a brawl; presence refusals keep their reason',async()=>{
 let sent;const ok=api(async(url,payload)=>{sent=[url,payload];return{data:{data:{round:{token:'f'.repeat(32),remote:false,reason:null,damage_rate:1,max_ms:21000,max_hits:140}}}};});
 const r=await ok.startRaidRound(77,{latitude:1,longitude:2});assert.equal(r.ok,true);assert.deepEqual(sent,['/raids/77/rounds',{latitude:1,longitude:2}]);
 const junk=api(async()=>({data:{data:{round:{token:'<script>',remote:false}}}}));assert.equal((await junk.startRaidRound(77,{})).error,'network');
 const far=api(async()=>{throw{response:{status:422,data:{data:{error:'too_far',reason:'jump'}}}};});
 const f=await far.startRaidRound(77,{});assert.equal(f.error,'too_far');assert.equal(f.reason,'jump');
 assert.equal(ok.raidDamage(10,3),160);assert.equal(ok.raidDamage(10,3,undefined,.6),96);
});
test('attack lookup validates its reply and never throws',async()=>{
 const found=api(async url=>({data:{data:{found:true,damage:40,raid_active:true,raid:null,next_at:null}}}));
 const r=await found.lookupRaidAttack(77,'boss-77-1');assert.equal(r.ok,true);assert.equal(r.damage,40);
 for(const data of [{found:true,damage:-1,raid_active:true,raid:null},{found:'yes',raid_active:true,raid:null},{}]){
  assert.equal((await api(async()=>({data:{data}})).lookupRaidAttack(77,'x')).ok,false);
 }
 assert.equal((await api(async()=>{throw Error('offline');}).lookupRaidAttack(77,'x')).ok,false);
});
