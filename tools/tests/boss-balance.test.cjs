// Mechanic-first damage: the server weights (config/boss.php, mirrored as DEFAULT_DAMAGE)
// make the weak spot that each boss's mechanic opens worth far more than body taps.
// Simulated on the app's own encounter rules (src/games/boss/encounter.ts).
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const m=require('./helpers/boss-encounter.cjs');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'node_modules/typescript'));
const raidModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/api/endpoints/parks/raid.ts'),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {module:raidModule,exports:raidModule.exports,require:()=>({default:{}})});
const {DEFAULT_DAMAGE,raidDamage}=raidModule.exports;
function rng(seed){return()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};}
/** Taps the body as fast as the game allows, hitting the weak spot by chance. */
function spam(boss,seed){const r=rng(seed);let st=m.createEncounter(boss,0),s={hits:0,weak:0,lastHitMs:-145};
 for(let ms=0;ms<20000;ms+=145){const h=m.registerStrike(s,st,ms,r()<0.3);if(h){s=h.stats;if(h.critical)st=m.consumeOpening(st,ms);}}return s;}
/** Plays the mechanic with a human 250ms per action, strikes the opening at 220ms. */
function mechanic(boss,seed){const r=rng(seed);let st=m.createEncounter(boss,0),s={hits:0,weak:0,lastHitMs:-145},ms=0;
 while(ms<20000){if(boss!=='ghost_squid'&&!m.encounterExposed(st,ms)){
   st=m.encounterAction(st,boss==='kraken'?(r()<.5?-1:1):st.circuit[st.step],ms).state;ms+=250;continue;}
  const h=m.registerStrike(s,st,ms,r()<0.9);if(h){s=h.stats;if(h.critical)st=m.consumeOpening(st,ms);}ms+=220;}
 return s;}
const damage=s=>raidDamage(s.hits,s.weak,DEFAULT_DAMAGE);
test('the app mirrors the server damage weights: weak-spot hits carry the fight',()=>{
 assert.deepEqual({...DEFAULT_DAMAGE},{per_hit:4,per_weak_hit:40,weak_share:3});
});
for(const boss of ['kraken','robo_shark'])test(`${boss}: playing the mechanic beats tapping as fast as possible by 30%+`,()=>{
 for(const seed of [1,7,42,99]){const a=damage(spam(boss,seed)),b=damage(mechanic(boss,seed));
  assert.ok(b>=a*1.3,`${boss} seed ${seed}: mechanic ${b} vs spam ${a}`);}
});
// Request to Studio: Ghost Squid needs its 300ms tell and a "spooked" lockout on
// early/late taps in encounter.ts; until then random spam during the reveal matches timing play.
test.todo('ghost_squid: timing the reveal beats spam by 30%+ (needs the Studio spooked lockout)');
