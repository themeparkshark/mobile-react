// Mechanic-first Boss Brawl balance, simulated on the app's own encounter rules
// (src/games/boss/v1/encounter.ts) and scored with the server formula (config/boss.php,
// mirrored as DEFAULT_DAMAGE in raid.ts). Four players per boss:
//  - spam: taps the body as fast as the game allows, never touches the mechanic.
//  - guess: mashes the body and presses buoys or nodes at random (no reading).
//  - informed: reads the tell (250ms reaction) and still mashes the body in between.
//  - median: reads the tell slowly (450ms), taps slower, misreads sometimes.
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const m=require('./helpers/boss-encounter-v1.cjs');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'node_modules/typescript'));
const raidModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/api/endpoints/parks/raid.ts'),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {module:raidModule,exports:raidModule.exports,require:()=>({default:{}})});
const {DEFAULT_DAMAGE,raidDamage}=raidModule.exports;
const BOSSES=['kraken','robo_shark','ghost_squid'];
function rng(seed){return()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};}

/** Runs one 20s round. `decide(state, ms, r)` returns {input} for a mechanic press, {strike, weak} for a tap, or null. */
function play(boss,seed,decide,step=145){
 const r=rng(seed);let st=m.createEncounter(boss,seed),s={hits:0,weak:0,lastHitMs:-m.HIT_GAP_MS},opened=0,wrongOpen=0;
 for(let ms=0;ms<m.BRAWL_MS;ms+=step){
  const d=decide(st,ms,r);if(!d)continue;
  if('input' in d){const tell=boss==='kraken'?m.krakenTell(st,ms):null;const a=m.encounterAction(st,d.input,ms);
   if(a.opened){opened++;if(boss==='kraken'&&!(tell&&tell.up&&tell.side===d.input))wrongOpen++;}st=a.state;continue;}
  const h=m.registerStrike(s,st,ms,d.weak,70);if(!h)continue;s=h.stats;st=h.state;if(h.critical)st=m.consumeOpening(st,ms);
 }
 return {...s,misreads:st.misreads,opened,wrongOpen};
}
const strike=(r,aim=0.9)=>({strike:true,weak:r()<aim});
const spam=(boss,seed)=>play(boss,seed,(st,ms,r)=>strike(r,0.3));
function guess(boss,seed){
 return play(boss,seed,(st,ms,r)=>{
  if(boss!=='ghost_squid'&&!m.encounterExposed(st,ms)&&r()<0.35)return {input:boss==='kraken'?(r()<.5?-1:1):Math.floor(r()*3)};
  return strike(r,m.encounterExposed(st,ms)?0.9:0.3);
 });
}
function reader(reaction,misread,aim,tapStep){
 return (boss,seed)=>{let next=0,lastPress=-1e9;
  return play(boss,seed,(st,ms,r)=>{
   if(boss==='kraken'&&!m.encounterExposed(st,ms)){const t=m.krakenTell(st,ms);
    if(t&&t.up&&ms-t.at>=reaction)return {input:r()<misread?-t.side:t.side};}
   if(boss==='robo_shark'&&!m.encounterExposed(st,ms)&&!m.encounterLocked(st,ms)&&ms>=st.showUntil+reaction&&ms-lastPress>=reaction){
    lastPress=ms;return {input:r()<misread?(st.circuit[st.step]+1)%3:st.circuit[st.step]};}
   if(boss==='ghost_squid'){const p=ms%m.GHOST_CYCLE_MS;
    // The 300ms tell lets a reader land the first tap as it turns solid.
    if(p<m.GHOST_SOLID_FROM+Math.max(0,reaction-m.GHOST_TELL_MS))return r()<misread/4?strike(r,aim):null;}
   if(ms<next)return null;next=ms+tapStep;return strike(r,m.encounterExposed(st,ms)?aim:0);
  });};
}
const informed=reader(250,0,0.9,145),median=reader(450,0.15,0.6,400);
const damage=s=>raidDamage(s.hits,s.weak,DEFAULT_DAMAGE);
const SEEDS=[1,7,42,99,123,256,777,1024,2048,4096];
const med=values=>{const v=[...values].sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
function profile(bot,boss){const runs=SEEDS.map(seed=>bot(boss,seed));
 return {damage:med(runs.map(damage)),hits:med(runs.map(s=>s.hits)),weak:med(runs.map(s=>s.weak)),runs};}
if(process.env.BOSS_SIM)for(const boss of BOSSES)for(const [name,bot] of Object.entries({spam,guess,informed,median})){
 const p=profile(bot,boss);console.log(boss,name,'damage',p.damage,'hits',p.hits,'weak',p.weak,'stars',med(p.runs.map(s=>m.brawlStars(boss,s,s.misreads))));}

test('the app mirrors the server damage weights: weak-spot hits carry the fight',()=>{
 assert.deepEqual({...DEFAULT_DAMAGE},{per_hit:4,per_weak_hit:40,weak_share:3});
 assert.deepEqual({...m.BRAWL_DAMAGE},{...DEFAULT_DAMAGE});
});
test('guessing never opens the weak spot: only the telegraphed buoy lures the Kraken',()=>{
 for(const seed of SEEDS){const st=m.createEncounter('kraken',seed);
  for(let ms=0;ms<6000;ms+=50){const t=m.krakenTell(st,ms);if(!t)continue;
   const wrong=m.encounterAction(st,-t.side,ms);assert.equal(wrong.opened,false);assert.equal(wrong.misread,true);
   assert.equal(m.encounterExposed(wrong.state,ms+1),false);
   assert.equal(m.encounterAction(st,t.side,ms).opened,t.up);}
 }
 for(const seed of SEEDS)assert.equal(guess('kraken',seed).wrongOpen,0);
});
for(const boss of BOSSES)test(`${boss}: informed play beats spam and mash-plus-guess by 30%+ on every seed`,()=>{
 for(const seed of SEEDS){const a=damage(spam(boss,seed)),g=damage(guess(boss,seed)),b=damage(informed(boss,seed));
  assert.ok(b>=a*1.3,`${boss} seed ${seed}: informed ${b} vs spam ${a}`);
  assert.ok(b>=g*1.3,`${boss} seed ${seed}: informed ${b} vs guess ${g}`);}
});
test('every simulated round is a legal server round (70 hits, one weak hit in three)',()=>{
 for(const boss of BOSSES)for(const bot of [spam,guess,informed,median])for(const seed of SEEDS){const s=bot(boss,seed);
  assert.ok(s.hits<=70,`${boss} ${s.hits}`);assert.ok(s.weak<=Math.floor(s.hits/3),`${boss} weak ${s.weak}/${s.hits}`);}
});
test('stars follow the read: informed play earns gold, spam never beats one star',()=>{
 for(const boss of BOSSES){
  assert.equal(med(SEEDS.map(seed=>{const s=informed(boss,seed);return m.brawlStars(boss,s,s.misreads);})),3,boss);
  for(const seed of SEEDS){const s=spam(boss,seed);assert.ok(m.brawlStars(boss,s,s.misreads)<=1,`${boss} spam seed ${seed}`);}
  assert.ok(med(SEEDS.map(seed=>{const s=median(boss,seed);return m.brawlStars(boss,s,s.misreads);}))>=1,boss);
 }
});
// The server's BossBalanceTest profiles come from these medians; keep them in step.
test('server balance profiles match this sim (BE tests/Unit/BossBalanceTest.php)',()=>{
 const php=fs.readFileSync(path.join(root,'tools/tests/fixtures/boss-balance-profiles.json'),'utf8');
 const expected=JSON.parse(php);
 for(const boss of BOSSES)for(const [name,bot] of Object.entries({spam,informed,median})){
  const p=profile(bot,boss);assert.deepEqual(expected[name][boss],[p.hits,p.weak],`${name} ${boss}`);}
});
module.exports={spam,guess,informed,median,profile};
