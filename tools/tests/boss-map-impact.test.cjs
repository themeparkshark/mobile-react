const assert=require('node:assert/strict'),test=require('node:test');
const m=require('./helpers/boss-map.cjs');
const {runtime}=require('./helpers/reward-hook-runtime.cjs');
const claim=()=>({park_id:1,asset_id:13,park_day:'2026-09-29',confirmed_at:'2026-09-29T21:00:00Z',ride_name:'Space practice',
 team:'mouse',points:25,controller:'mouse',previous_controller:'globe',flipped:true,scores:{mouse:35,globe:30,shark:0}});
const raid=()=>({id:77,task_id:109,boss:'kraken',status:'defeated',hp_left:0,ride_name:'Space practice',latitude:34.13838,longitude:-118.35576,
 you:{attacks:1,damage:50,reward:{outcome:'defeated'}},ride_control:claim()});
const control=()=>({park_day:'2026-09-29',rides:[{asset_id:13,controller:'mouse',scores:{mouse:35,globe:30,shark:0},
 carried_over:false,flipped_at:'2026-09-29 21:00:00'}]});
const pending=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('only a settled personal participation receipt creates the map moment; MVP never supplies missing takeover proof',()=>{
 assert.ok(m.createBossMapImpact(5,1,raid()));
 for(const change of [{status:'active'},{hp_left:1},{boss:'unknown'},{latitude:NaN},{longitude:200},
  {you:{attacks:0,damage:0,reward:{outcome:'defeated'}}},{you:{attacks:1,damage:50,reward:{outcome:'escaped'}}}])
  assert.equal(m.createBossMapImpact(5,1,{...raid(),...change}),null);
 assert.equal(m.createBossMapImpact(0,1,raid()),null);
 assert.equal(m.createBossMapImpact(5,1,{...raid(),mvp_is_you:true,ride_control:null}).claim,null);
 for(const change of [{park_id:2},{flipped:false},{previous_controller:'mouse'},{scores:{mouse:30,globe:30,shark:0}},
  {confirmed_at:'wrong'},{asset_id:0},{controller:'globe'},{points:-1},{flipped:'yes'}])assert.equal(m.confirmedClaim({...claim(),...change},1),null);
 // A hold: the MVP's team already had the ride and the win added to it.
 const held={...claim(),flipped:false,previous_controller:'mouse'};
 assert.ok(m.confirmedClaim(held,1));assert.equal(m.claimKind(held),'held');assert.equal(m.claimKind(claim()),'raised');
 assert.equal(m.claimKind(null),null);
});
test('flag trusts the server claim while the team still holds the ride; day rollover, carried control and a loss hide it',()=>{
 const impact=m.createBossMapImpact(5,1,raid());assert.ok(m.verifiedBossFlag(impact,control()));
 // Later points on the same side keep the moment.
 assert.ok(m.verifiedBossFlag(impact,{...control(),rides:[{...control().rides[0],scores:{mouse:60,globe:39,shark:0},flipped_at:null}]}));
 for(const snapshot of [null,{...control(),park_day:'2026-09-30'}, {...control(),rides:[]},
  ...[{carried_over:true},{controller:'globe'}].map(change=>({...control(),rides:[{...control().rides[0],...change}]}))])
  assert.equal(m.verifiedBossFlag(impact,snapshot),null);
 const held=m.createBossMapImpact(5,1,{...raid(),ride_control:{...claim(),flipped:false,previous_controller:'mouse'}});
 assert.equal(m.verifiedBossFlag(held,control()).flipped,false);
});
test('an older replica cannot roll map power or a confirmed flip backward, while newer ownership and park days advance',()=>{
 const current=control();
 assert.equal(m.preferFreshRideControl(current,{...current,rides:[{...current.rides[0],scores:{mouse:34,globe:30,shark:0}}]}),current);
 assert.equal(m.preferFreshRideControl(current,{...current,park_day:'2026-09-28'}),current);
 assert.equal(m.preferFreshRideControl(current,{...current,rides:[]}),current);
 const newer={...current,rides:[{...current.rides[0],controller:'globe',scores:{mouse:35,globe:40,shark:0},flipped_at:'2026-09-29 21:00:02'}]};
 assert.equal(m.preferFreshRideControl(current,newer),newer);
 const tomorrow={...current,park_day:'2026-09-30',rides:[]};assert.equal(m.preferFreshRideControl(current,tomorrow),tomorrow);
});
test('malformed map frames fail closed and a beside-ride boss remains geographically close with a valid native anchor',()=>{
 assert.equal(m.isRideControlFrame(control()),true);
 for(const value of [null,{}, {...control(),rides:null},{...control(),rides:[...control().rides,...control().rides]},
  {...control(),rides:[{...control().rides[0],scores:null}]},{...control(),rides:[{...control().rides[0],controller:'wrong'}]}])assert.equal(m.isRideControlFrame(value),false);
 assert.equal(m.confirmedClaim({...claim(),confirmed_at:123},1),null);
 const c=raid(),offset=m.bossDisplayCoordinate(c);assert.ok(offset.latitude>c.latitude&&offset.longitude>c.longitude);
 assert.ok(offset.latitude-c.latitude<.0001&&offset.longitude-c.longitude<.0002);
});
test('map polling rejects late park/player responses and explicit refreshes supersede older requests',async()=>{
 const requests=[],view=runtime('src/hooks/useRideControlMap.ts',{
  '../services/boss/mapImpact':m,'../api/endpoints/parks/rideControl':{getRideControl:id=>{const p=pending();requests.push({id,...p});return p.promise;}}
 },{playerId:5,parkId:1},{setInterval(){return 1;},clearInterval(){}});
 const fresh=view.tree.refresh();requests[1].resolve(control());await fresh;await view.settle();assert.equal(view.tree.control.park_day,'2026-09-29');
 requests[0].resolve({...control(),park_day:'2026-09-28'});await view.settle();assert.equal(view.tree.control.park_day,'2026-09-29');
 view.tree.refresh();view.change({parkId:2});assert.equal(view.tree.control,null);
 requests[2].resolve(control());await view.settle();assert.equal(view.tree.control,null);
 requests[3].resolve(control());await view.settle();assert.ok(view.tree.control);
 view.tree.refresh();view.change({playerId:8});assert.equal(view.tree.control,null);
 requests[4].resolve(control());await view.settle();assert.equal(view.tree.control,null);
 view.unmount();requests[5].resolve(control());await view.settle();assert.equal(view.tree.control,null);
});
function moment(options={}){
 const reads=[],writes=[],sounds=[],haptics=[];let background;
 const view=runtime('src/hooks/useBossMapMoment.ts',{
  '../services/boss/mapImpact':m,
  '../gamekit/SFX':{playSfx:(...args)=>sounds.push(args)},'../gamekit/Haptics':{haptic:value=>haptics.push(value)},
  './useReducedGameMotion':{default:()=>!!options.reduced},
  '@react-native-async-storage/async-storage':{default:{getItem:async key=>{reads.push(key);return options.seen??null;},setItem:async(key,value)=>writes.push([key,value])}},
  'react-native':{AppState:{currentState:'active',addEventListener(_,fn){background=fn;return {remove(){background=null;}}}}},
 },{playerId:5,parkId:1,available:true,control:control(),refreshControl:options.refresh??(async()=>control())});
 const tick=()=>{for(const [id,fn]of [...view.timers]){view.timers.delete(id);fn();}view.render();};
 return {view,reads,writes,sounds,haptics,tick,background:state=>{background?.(state);view.render();}};
}
test('map handoff waits for native occlusion and camera settlement, runs once, and retains a dismissible receipt',async()=>{
 const h=moment();h.view.change({available:false});await h.view.tree.enqueue(raid());await h.view.settle();assert.equal(h.view.tree.moment,null);
 h.view.change({available:true});assert.equal(h.view.tree.moment.phase,'queued');h.tick();assert.equal(h.view.tree.moment.phase,'exit');
 const key=h.view.tree.moment.impact.key;h.view.tree.finishExit('wrong');h.view.render();assert.equal(h.view.tree.moment.phase,'exit');
 h.view.tree.finishExit(key);h.view.tree.finishExit(key);h.view.render();assert.equal(h.sounds.length,1);assert.equal(h.haptics.length,1);
 assert.equal(h.view.tree.moment.phase,'flag');h.tick();assert.equal(h.view.tree.moment.phase,'settled');assert.equal(h.writes.length,1);
 await h.view.tree.enqueue(raid());assert.equal(h.reads.length,1);h.view.tree.dismiss();h.view.render();assert.equal(h.view.tree.moment,null);
});
test('reduced-motion handoff remains readable and emits no haptic burst',async()=>{
 const h=moment({reduced:true});await h.view.tree.enqueue(raid());await h.view.settle();h.tick();h.view.tree.finishExit(h.view.tree.moment.impact.key);h.view.render();
 assert.equal(h.view.tree.moment.phase,'flag');assert.equal(h.sounds.length,1);assert.equal(h.haptics.length,0);
});
test('backgrounding cancels the signature animation and returning shows the receipt without replay',async()=>{
 const h=moment();await h.view.tree.enqueue(raid());await h.view.settle();h.tick();const finish=h.view.tree.finishExit,key=h.view.tree.moment.impact.key;
 h.background('background');assert.equal(h.view.tree.moment,null);finish(key);h.view.render();
 h.background('active');assert.equal(h.view.tree.moment.phase,'settled');assert.equal(h.view.timers.size,0);assert.equal(h.writes.length,1);
 h.view.unmount();
});
test('already seen receipts and late enqueue responses cannot animate in another player or park',async()=>{
 const seen=moment({seen:'1'});await seen.view.tree.enqueue(raid());await seen.view.settle();assert.equal(seen.view.tree.moment,null);
 const p=pending(),h=moment({refresh:()=>p.promise});const enqueue=h.view.tree.enqueue(raid());await new Promise(r=>setImmediate(r));
 h.view.change({parkId:2});p.resolve(control());await enqueue;await h.view.settle();assert.equal(h.view.tree.moment,null);
});
const uiStub={BRAND:{gold:'#ffcf3b',white:'#fff',navy:'#05346e'},GameIcon:'GameIcon'};
function departure(boss,reduced,extra={}){
 const completed=[],sounds=[],haptics=[],bursts=[];
 const view=runtime('src/components/boss/BossMapDeparture.tsx',{
  '../../hooks/useReducedGameMotion':{default:()=>reduced},'./bossArt':{BOSS_ART:{[boss]:'approved-art'},BOSS_FX:{[boss]:{particles:['#fff']}}},
  '../map/Marker':{Marker:'Marker'},'../map/RideTeamFlag':{default:'RideTeamFlag'},'../../ui':uiStub,
  '../../gamekit/Particles':{ParticleField:'ParticleField'},'../../gamekit/SFX':{playSfx:v=>sounds.push(v)},'../../gamekit/Haptics':{haptic:v=>haptics.push(v)},
  '../../constants/teams':{TEAMS:{mouse:{color:'#F59E0B'},globe:{color:'#22C55E'},shark:{color:'#3B82F6'}},teamName:t=>`Team ${t}`},
 },{impact:{...m.createBossMapImpact(5,1,{...raid(),top:[{username:'finn',damage:900,you:true,team:'mouse'},{username:'ana',damage:500,you:false,team:'globe'}]}),boss},
  onComplete:key=>completed.push(key),...extra});
 return {view,completed,sounds,haptics,bursts};
}
test('each departure is one bounded signature beat: exit, flag and fighters, then hands back once; unmount cancels it',()=>{
 for(const boss of ['kraken','robo_shark','ghost_squid'])for(const reduced of [false,true]){
  const d=departure(boss,reduced);
  assert.equal(d.view.find(n=>n.type==='Image').props.source,'approved-art');
  assert.ok(d.view.find(n=>n.type==='RideTeamFlag'&&n.props.team==='mouse'));
  assert.equal(d.view.find(n=>n.type==='ParticleField')!==undefined,!reduced);
  assert.ok(d.view.find(n=>n.type==='Text'&&n.props.children==='You'));
  assert.ok(d.view.find(n=>n.type==='Text'&&n.props.children==='ana'));
  if(reduced)assert.ok(d.view.find(n=>n.type==='GameIcon'&&n.props.name==='check'));
  const timers=[...d.view.timers.values()];timers.forEach(fn=>fn());timers.forEach(fn=>fn());
  assert.equal(d.completed.length,1);
  if(reduced){assert.equal(d.haptics.length,0);assert.equal(d.sounds.length,0);}
  else{assert.ok(d.haptics.includes('success'));assert.ok(d.sounds.includes('win'));}
  d.view.unmount();
 }
 const cancelled=departure('kraken',false);cancelled.view.unmount();assert.equal(cancelled.view.timers.size,0);
});
test('a hold shows HELD! instead of a raise, and no claim means no flag or team sound',()=>{
 const held=departure('kraken',false,{flag:{...claim(),flipped:false,previous_controller:'mouse'}});
 assert.ok(held.view.find(n=>n.type==='Text'&&n.props.children==='HELD!'));
 const none=departure('ghost_squid',false,{flag:null});assert.equal(none.view.find(n=>n.type==='RideTeamFlag'),undefined);
 [...none.view.timers.values()].forEach(fn=>fn());assert.equal(none.sounds.includes('win'),false);
});
test('existing held flags remain static; a verified new raise is finite and reduced motion does not move it',()=>{
 const imports={'../../hooks/useReducedGameMotion':{default:()=>false},'../../ui':{GameIcon:'GameIcon'},
  '../../constants/teams':{TEAMS:{mouse:{name:'Team Mouse',color:'#ff0',badge:1}},teamName:()=>'Team Mouse'}};
 const view=runtime('src/components/map/RideTeamFlag.tsx',imports,{team:'mouse'});const before=view.motions.length;
 view.change({raiseKey:'confirmed-77'});assert.ok(view.motions.length>before);const raisedMotions=view.motions.length;
 view.change({raiseKey:undefined});view.change({raiseKey:'confirmed-77'});assert.equal(view.motions.length,raisedMotions);
 view.change({contested:true});assert.ok(view.find(n=>n.type==='GameIcon'&&n.props.name==='swords'));view.unmount();
 const reduced=runtime('src/components/map/RideTeamFlag.tsx',{...imports,'../../hooks/useReducedGameMotion':{default:()=>true}},{team:'mouse',raiseKey:'confirmed-78'});
 assert.equal(reduced.motions.length,0);assert.ok(reduced.find(n=>n.props?.accessibilityLabel==='Team Mouse holds this ride.'));
 const held=runtime('src/components/map/RideTeamFlag.tsx',imports,{team:'mouse',raiseKey:'held-1',held:true});
 assert.ok(held.find(n=>n.type==='Text'&&n.props.children==='HELD!'));
});
test('map impact carries the top fighters for the signature beat, capped and cleaned',()=>{
 const impact=m.createBossMapImpact(5,1,{...raid(),top:[{username:'a',team:'mouse',you:true},{username:'',team:'x'},{username:'b'.repeat(40),team:'bad'},
  {username:'c',team:'shark'},{username:'d',team:'globe'}]});
 assert.equal(impact.fighters.length,2);assert.equal(impact.fighters[0].you,true);assert.equal(impact.fighters[1].username.length,24);
 assert.equal(impact.fighters[1].team,null);
});
