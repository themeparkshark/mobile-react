// Boss join card rules (src/components/boss/joinModel.ts) and the result's next attack (BashResults nextAttack).
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'node_modules/typescript'));
function load(rel){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,rel),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:()=>({})});return m.exports;}
const j=load('src/components/boss/joinModel.ts');
const raid=(o={})=>({energy_cost:10,remote:{joined:false,ticket_cost:1,damage_rate:0.6,reward_rate:0.6},you:{log:[]},...o});

test('from home the first attack costs a Ticket plus Energy, later ones only Energy', ()=>{
  const c=j.joinCost(raid(),true,34,2);
  assert.deepEqual([c.ticket,c.energy,c.energyAfter,c.ticketsAfter,c.short],[1,10,24,1,null]);
  const again=j.joinCost(raid({remote:{joined:true,ticket_cost:1,damage_rate:0.6}}),true,34,0);
  assert.equal(again.ticket,0);assert.equal(again.short,null);
});
test('at the ride there is never a Ticket', ()=>{ assert.equal(j.joinCost(raid(),false,10,0).ticket,0); });
test('shortfalls name what is missing and where to get it', ()=>{
  const e=j.joinCost(raid(),true,6,2).short; assert.deepEqual({...e},{kind:'energy',need:10,have:6});
  assert.match(j.shortfallCopy(e),/Need 4 more Energy/);
  const t=j.joinCost(raid(),true,40,0).short; assert.equal(t.kind,'ticket');
  assert.match(j.shortfallCopy(t),/1 Ticket/);
  assert.equal(j.shortfallCopy(null),null);
});
test('home-only fighters see the home rate and no Ride Parts; one in-person hit restores full loot', ()=>{
  assert.deepEqual({...j.rewardPreview(raid(),true)},{coins:30,xp:60,energy:20,parts:0});
  assert.deepEqual({...j.rewardPreview(raid(),false)},{coins:50,xp:100,energy:20,parts:2});
  assert.deepEqual({...j.rewardPreview(raid({you:{log:[{damage:5,remote:false}]}}),true)},{coins:50,xp:100,energy:20,parts:2});
  assert.deepEqual({...j.rewardPreview(raid({rewards:{coins:80,xp:150,energy:25,parts:3}}),true)},{coins:48,xp:90,energy:25,parts:0});
});
test('the join card says the cost in words, singular and plural right', ()=>{
  assert.equal(j.costWords(j.joinCost(raid(),true,34,2)),"Costs 1 Ticket + 10 Energy · You'll have 24 left");
  assert.equal(j.costWords(j.joinCost(raid({remote:{joined:false,ticket_cost:2,damage_rate:0.6}}),true,34,2)),"Costs 2 Tickets + 10 Energy · You'll have 24 left");
  assert.equal(j.costWords(j.joinCost(raid(),false,10,0)),"Costs 10 Energy · You'll have 0 left");
});
