const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const m=require('./helpers/boss-encounter.cjs');
const {runtime}=require('./helpers/reward-hook-runtime.cjs');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'node_modules/typescript'));
const raidModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/api/endpoints/parks/raid.ts'),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {module:raidModule,exports:raidModule.exports,require:()=>({default:{}})});
const {DEFAULT_DAMAGE,raidDamage}=raidModule.exports;
const fresh=()=>({hits:0,weak:0,lastHitMs:-m.HIT_GAP_MS});
/** BossRaidService::damageFor in PHP, written out: floor((hits*per_hit + weak*per_weak_hit) * rate). */
const php=(hits,weak,w,rate=1)=>Math.floor((hits*w.per_hit+weak*w.per_weak_hit)*rate);

test('the brawl score is the server formula with the raid weights, including remote rounding',()=>{
 for(const w of [DEFAULT_DAMAGE,{per_hit:10,per_weak_hit:20,weak_share:3},{per_hit:3,per_weak_hit:55,weak_share:3}])
  for(const [hits,weak] of [[0,0],[138,0],[69,23],[46,9],[7,2]])for(const rate of [1,0.6,0.25]){
   const brawl=m.brawlDamage({hits,weak},rate,w);
   assert.equal(brawl,php(hits,weak,w,rate));assert.equal(brawl,raidDamage(hits,weak,w,rate));}
 // The reviewer's example: a 138-hit spam round is 552 on the server, not 1,380.
 assert.equal(m.brawlDamage({hits:138,weak:0},1,DEFAULT_DAMAGE),552);
});
test('Kraken: only the telegraphed buoy lures it; the other buoy snags and locks the buoys',()=>{
 const state=m.createEncounter('kraken',0);
 assert.equal(m.krakenTell(state,100),null);
 const tell=m.krakenTell(state,m.KRAKEN_FIRST_TELL_MS+100);assert.equal(tell.up,true);
 const wrong=m.encounterAction(state,-tell.side,m.KRAKEN_FIRST_TELL_MS+100);
 assert.equal(wrong.opened,false);assert.equal(wrong.misread,true);assert.equal(wrong.state.misreads,1);
 assert.equal(m.encounterLocked(wrong.state,m.KRAKEN_FIRST_TELL_MS+100+m.SNAG_MS-1),true);
 assert.equal(m.encounterAction(wrong.state,tell.side,m.KRAKEN_FIRST_TELL_MS+200).accepted,false);
 const lured=m.encounterAction(state,tell.side,m.KRAKEN_FIRST_TELL_MS+100);
 assert.equal(lured.opened,true);assert.equal(lured.state.lureSide,tell.side);assert.equal(m.brawlDamage(fresh(),1),0);
 const at=m.KRAKEN_FIRST_TELL_MS+100;
 assert.equal(m.encounterExposed(lured.state,at+m.KRAKEN_OPEN_MS-1),true);assert.equal(m.encounterExposed(lured.state,at+m.KRAKEN_OPEN_MS),false);
 assert.equal(m.encounterExposed(m.consumeOpening(lured.state,at+300),at+300),false);
 // A buoy with no tentacle over it is a snag too.
 assert.equal(m.encounterAction(state,1,100).misread,true);
});
test('Robo-Shark: taps during the flash are ignored, a wrong node zaps and re-flashes, and the board shuffles',()=>{
 let state=m.createEncounter('robo_shark',0);const route=[...state.circuit];
 assert.equal(m.roboBoard(state,state.showFrom+10).phase,'flash');
 assert.equal(m.roboBoard(state,state.showFrom+10).flashing,route[0]);
 assert.equal(m.encounterAction(state,route[0],state.showFrom+10).accepted,false);
 const after=state.showUntil;const board=m.roboBoard(state,after);
 assert.equal(board.phase,'connect');assert.notDeepEqual([...board.positions],[...state.shownLayout]);
 state=m.encounterAction(state,route[0],after).state;assert.equal(state.step,1);
 const zap=m.encounterAction(state,route[2],after+100);assert.equal(zap.misread,true);assert.equal(zap.state.step,0);
 assert.equal(m.roboBoard(zap.state,after+100+m.ZAP_MS+10).phase,'flash');
 let s2=zap.state;const t=s2.showUntil;for(let i=0;i<3;i++)s2=m.encounterAction(s2,route[i],t+i*200).state;
 assert.equal(m.encounterExposed(s2,t+400),true);
 const next=m.consumeOpening(s2,t+500);assert.equal(next.step,0);assert.equal(m.roboBoard(next,t+510).phase,'flash');
});
test('Ghost Squid: a 300ms tell before it turns solid, and early taps spook it',()=>{
 const state=m.createEncounter('ghost_squid',0);
 assert.equal(m.ghostPhase(1099),'hidden');assert.equal(m.ghostPhase(1100),'tell');assert.equal(m.ghostPhase(1400),'solid');
 const early=m.registerStrike(fresh(),state,1200,true);assert.equal(early.spooked,true);assert.equal(early.stats.hits,0);
 assert.equal(m.registerStrike(fresh(),early.state,1500,true),null); // still spooked
 assert.equal(m.registerStrike(fresh(),early.state,1200+m.SPOOK_MS,true).stats.hits,1);
 const hit=m.registerStrike(fresh(),state,1400,true);assert.equal(hit.stats.hits,1);assert.equal(hit.spooked,false);
 assert.equal(m.ghostRevealed(2399),true);assert.equal(m.ghostRevealed(2400),false);
});
test('critical openings never exceed the server one-third limit, the hit cap holds, and remote damage rounds once',()=>{
 const t=m.createEncounter('kraken',0),tell=m.krakenTell(t,m.KRAKEN_FIRST_TELL_MS);
 const state=m.encounterAction(t,tell.side,m.KRAKEN_FIRST_TELL_MS).state;const base=m.KRAKEN_FIRST_TELL_MS;
 let stats=fresh();let hit;
 for(let i=0;i<3;i++){hit=m.registerStrike(stats,state,base+i*m.HIT_GAP_MS,true);stats=hit.stats;}
 assert.equal(hit.critical,true);assert.equal(stats.hits,3);assert.equal(stats.weak,1);
 assert.equal(m.brawlDamage(stats,0.25),Math.floor((3*4+40)*0.25));
 assert.equal(m.brawlDamage(stats,0.6),Math.floor((3*4+40)*0.6));
 assert.equal(m.registerStrike(stats,state,base+2*m.HIT_GAP_MS+1,true),null);
 assert.equal(m.registerStrike(stats,state,base+3*m.HIT_GAP_MS,true,3),null);
 assert.equal(m.registerStrike(stats,state,20000,true),null);
});
test('no em dashes or check glyphs in brawl copy',()=>{
 for(const file of ['src/games/boss/encounter.ts','src/games/boss/BossBrawl.tsx']){
  const src=fs.readFileSync(path.join(root,file),'utf8');
  assert.equal(/—|✓|✔|ROUND PREVIEW|BOSS_ART_SCALE/.test(src),false,file);}
});
function arena(boss='kraken',reduced=false){
 let now=0,intervalId=0;const ticks=new Map();
 const shake={style:{},translateX:{value:0},translateY:{value:0},shake(){}};
 const flash={style:{},opacity:{value:0},flash(){}};
 const tokens={BRAND:{white:'#fff',gold:'#ffcf3b',goldLight:'#ffe07a',sky:'#bfe5ff',blue:'#0768b9',blueBright:'#0879ca',blueLip:'#05468f',navy:'#05346e',red:'#ef4a3c'}};
 const view=runtime('src/games/boss/BossBrawl.tsx',{
  './encounter':m,'../../hooks/useReducedGameMotion':{default:()=>reduced},
  '../../components/boss/bossArt':{BOSS_ART:{kraken:1,robo_shark:2,ghost_squid:3}},'../../ui/tokens':tokens,
  '../../gamekit':{GameShellV2:'GameShell',ParticleField:'Particles',useShake:()=>shake,useFlash:()=>flash,haptic(){},playSfx(){}},
 },{visible:true,boss,bossName:boss,hpLeft:5000,hpMax:5000,onComplete(){},onClose(){}},
 {Date:{now:()=>now},setInterval(fn){ticks.set(++intervalId,fn);return intervalId;},clearInterval(id){ticks.delete(id);}});
 view.find(n=>!!n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:390,height:600}}});view.render();
 return {view,ticks,setNow(value){now=value;},tick(){for(const fn of ticks.values())fn();view.render();},strike(){view.find(n=>!!n.props?.onAccessibilityTap).props.onAccessibilityTap();view.render();}};
}
test('pausing freezes encounter time, rejects paused inputs and resumes the same opening',()=>{
 const a=arena();a.view.tree.props.onStart();a.view.render();
 const at=m.KRAKEN_FIRST_TELL_MS+100;a.setNow(at);a.tick();
 const tell=m.krakenTell(m.createEncounter('kraken',0),at);
 a.view.find(n=>n.props?.accessibilityLabel===`Lure Kraken ${tell.side<0?'left':'right'} with a buoy`).props.onPress();a.view.render();
 a.setNow(at+100);a.strike();a.view.tree.props.onPause();a.view.render();a.setNow(at+10300);
 const damage=a.view.tree.props.score;assert.equal(damage,4);
 a.strike();a.tick();assert.equal(a.view.tree.props.score,damage);
 a.view.tree.props.onResume();a.setNow(at+10300+m.HIT_GAP_MS);a.strike();a.setNow(at+10300+2*m.HIT_GAP_MS);a.strike();
 assert.equal(a.view.tree.props.score,3*4+40); // three hits, the third one a critical
 a.view.change({visible:false});const before=a.view.tree.props.score;a.setNow(at+11000);a.strike();assert.equal(a.view.tree.props.score,before);
 a.view.unmount();assert.equal(a.ticks.size,0);
});
test('reduced motion retains timed ghost play and finishes once without burst or floating damage effects',()=>{
 const a=arena('ghost_squid',true);a.view.tree.props.onStart();a.view.render();
 a.setNow(1400);a.strike();assert.equal(a.view.tree.props.score,4);
 assert.equal(a.view.find(n=>n.type==='Particles'),undefined);
 a.setNow(20000);a.tick();const result=a.view.tree.props.result;assert.equal(result.score,4);assert.equal(result.meta.duration_ms,20000);
 a.setNow(21000);a.tick();assert.equal(a.view.tree.props.result,result);
});
