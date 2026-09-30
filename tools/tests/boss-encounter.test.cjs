const assert=require('node:assert/strict'),test=require('node:test');
const m=require('./helpers/boss-encounter.cjs');
const {runtime}=require('./helpers/reward-hook-runtime.cjs');
const fresh=()=>({hits:0,weak:0,lastHitMs:-145});
test('luring changes Kraken opening without granting damage; its opening expires and is consumed',()=>{
 const state=m.createEncounter('kraken',0),stats=fresh();
 assert.equal(m.encounterExposed(state,100),false);
 const lured=m.encounterAction(state,-1,100);assert.equal(lured.opened,true);
 assert.equal(lured.state.lureSide,-1);assert.equal(m.brawlDamage(stats,1),0);
 assert.equal(m.encounterExposed(lured.state,1899),true);assert.equal(m.encounterExposed(lured.state,1900),false);
 assert.equal(m.encounterAction(lured.state,1,500).accepted,false);
 assert.equal(m.encounterExposed(m.consumeOpening(lured.state,600),600),false);
});
test('Robo circuit requires the indicated order; a wrong node resets it and a later cycle changes the route',()=>{
 let state=m.createEncounter('robo_shark',0);const route=[...state.circuit];
 state=m.encounterAction(state,route[0],100).state;assert.equal(state.step,1);
 const wrong=m.encounterAction(state,route[2],200);assert.equal(wrong.accepted,false);assert.equal(wrong.state.step,0);
 state=wrong.state;for(let i=0;i<3;i++)state=m.encounterAction(state,route[i],300+i*200).state;
 assert.equal(m.encounterExposed(state,800),true);assert.equal(m.encounterExposed(state,2300),false);
 const next=m.consumeOpening(state,900);assert.notDeepEqual([...next.circuit],route);assert.equal(next.step,0);
});
test('Ghost Squid can only be struck during its telegraphed solid window',()=>{
 const state=m.createEncounter('ghost_squid',0);
 assert.equal(m.registerStrike(fresh(),state,1399,true),null);
 const hit=m.registerStrike(fresh(),state,1400,true);assert.equal(hit.stats.hits,1);
 assert.equal(m.ghostRevealed(2399),true);assert.equal(m.ghostRevealed(2400),false);
 assert.equal(m.registerStrike(hit.stats,state,2400,true),null);
});
test('critical openings never exceed the server one-third limit and remote damage rounds the full contribution once',()=>{
 const state=m.encounterAction(m.createEncounter('kraken',0),1,0).state;
 let stats=fresh();let hit;
 for(let i=0;i<3;i++){hit=m.registerStrike(stats,state,i*200,true);stats=hit.stats;}
 assert.equal(hit.critical,true);assert.equal(stats.hits,3);assert.equal(stats.weak,1);
 assert.equal(m.brawlDamage(stats,0.25),12);
 assert.equal(m.brawlDamage(stats,0.6),30); // current backend remote rate; preview reads the raid's rate
 assert.equal(m.registerStrike(stats,state,401,true),null);
 assert.equal(m.registerStrike(stats,state,601,true).critical,false);
 assert.equal(m.registerStrike(stats,state,20000,true),null);
});
test('each complete boss round stays within the existing raid proof limits and can reach mastery without a reward multiplier change',()=>{
 for(const boss of ['kraken','robo_shark','ghost_squid']){
  let state=m.createEncounter(boss,0),stats=fresh();
  for(let ms=0;ms<20000;ms+=220){
   if(boss!=='ghost_squid'&&!m.encounterExposed(state,ms))state=m.encounterAction(state,boss==='kraken'?-state.lureSide:state.circuit[state.step],ms).state;
   const hit=m.registerStrike(stats,state,ms,true);if(hit){stats=hit.stats;if(hit.critical)state=m.consumeOpening(state,ms);}
  }
  assert.ok(stats.hits<=140);assert.ok(stats.weak<=Math.floor(stats.hits/3));assert.ok(stats.weak>0);
  assert.equal(m.brawlStars(boss,stats),3);
 }
});
function arena(boss='kraken',reduced=false){
 let now=0,intervalId=0;const ticks=new Map();
 const shake={style:{},translateX:{value:0},translateY:{value:0},shake(){}};
 const flash={style:{},opacity:{value:0},flash(){}};
 const view=runtime('src/games/boss/BossBrawl.tsx',{
  './encounter':m,'../../hooks/useReducedGameMotion':{default:()=>reduced},
  '../../gamekit':{GameShellV2:'GameShell',ParticleField:'Particles',useShake:()=>shake,useFlash:()=>flash,haptic(){},playSfx(){}},
 },{visible:true,boss,bossName:boss,hpLeft:5000,hpMax:5000,onComplete(){},onClose(){}},
 {Date:{now:()=>now},setInterval(fn){ticks.set(++intervalId,fn);return intervalId;},clearInterval(id){ticks.delete(id);}});
 view.find(n=>!!n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:390,height:600}}});view.render();
 return {view,ticks,setNow(value){now=value;},tick(){for(const fn of ticks.values())fn();view.render();},strike(){view.find(n=>!!n.props?.onAccessibilityTap).props.onAccessibilityTap();view.render();}};
}
test('pausing freezes encounter time, rejects paused inputs and resumes the same opening',()=>{
 const a=arena();a.view.tree.props.onStart();a.view.render();
 a.view.find(n=>n.props?.accessibilityLabel==='Lure Kraken left with a buoy').props.onPress();a.view.render();
 a.setNow(200);a.strike();a.view.tree.props.onPause();a.view.render();
 const damage=a.view.tree.props.score;a.setNow(10200);a.strike();a.tick();assert.equal(a.view.tree.props.score,damage);
 a.view.tree.props.onResume();a.setNow(10400);a.strike();a.setNow(10600);a.strike();
 assert.equal(a.view.tree.props.score,50); // two normal hits, then one actual critical
 a.view.change({visible:false});const before=a.view.tree.props.score;a.setNow(10800);a.strike();assert.equal(a.view.tree.props.score,before);
 a.view.unmount();assert.equal(a.ticks.size,0);
});
test('reduced motion retains timed ghost play and finishes once without burst or floating damage effects',()=>{
 const a=arena('ghost_squid',true);a.view.tree.props.onStart();a.view.render();
 a.setNow(1400);a.strike();assert.equal(a.view.tree.props.score,10);
 assert.equal(a.view.find(n=>n.type==='Particles'),undefined);
 a.setNow(20000);a.tick();const result=a.view.tree.props.result;assert.equal(result.score,10);assert.equal(result.meta.duration_ms,20000);
 a.setNow(21000);a.tick();assert.equal(a.view.tree.props.result,result);
});
