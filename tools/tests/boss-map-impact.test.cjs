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
  {confirmed_at:'wrong'},{asset_id:0},{controller:'globe'},{points:-1}])assert.equal(m.confirmedClaim({...claim(),...change},1),null);
});
test('flag requires the exact current flip and suppresses day rollover, carried control, later loss or same-second loss/reclaim',()=>{
 const impact=m.createBossMapImpact(5,1,raid());assert.ok(m.verifiedBossFlag(impact,control()));
 for(const snapshot of [null,{...control(),park_day:'2026-09-30'}, {...control(),rides:[]},
  ...[{carried_over:true},{controller:'globe'},{flipped_at:null},{flipped_at:'2026-09-29 21:00:05'},
   {scores:{mouse:40,globe:39,shark:0}},{scores:{mouse:34,globe:30,shark:0}}].map(change=>({...control(),rides:[{...control().rides[0],...change}]}))])
  assert.equal(m.verifiedBossFlag(impact,snapshot),null);
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
test('each departure finishes once; unmount cancels its handoff and reduced motion uses an intact static confirmation',()=>{
 for(const boss of ['kraken','robo_shark','ghost_squid'])for(const reduced of [false,true]){
  const completed=[],view=runtime('src/components/boss/BossMapDeparture.tsx',{
   '../../hooks/useReducedGameMotion':{default:()=>reduced},'../../games/boss/BossBrawl':{BOSS_ART:{[boss]:'approved-art'}},'../map/Marker':{Marker:'Marker'},
   '../../services/boss/mapImpact':m,
  },{impact:{...m.createBossMapImpact(5,1,raid()),boss},onComplete:key=>completed.push(key)});
  assert.equal(view.animations.length,reduced?0:1);assert.equal(view.find(n=>n.type==='Image').props.source,'approved-art');
  const handoff=[...view.timers.values()][0];handoff();assert.equal(completed.length,1);view.unmount();handoff();assert.equal(completed.length,1);
 }
});
test('existing held flags remain static; a verified new raise is finite and reduced motion does not move it',()=>{
 const imports={'../../hooks/useReducedGameMotion':{default:()=>false},'../../constants/teams':{TEAMS:{mouse:{name:'Team Mouse',color:'#ff0',badge:1}}}};
 const view=runtime('src/components/map/RideTeamFlag.tsx',imports,{team:'mouse'});assert.equal(view.animations.length,0);
 view.change({raiseKey:'confirmed-77'});assert.equal(view.animations.length,1);view.change({raiseKey:undefined});assert.equal(view.animations[0].stopped,true);
 view.change({raiseKey:'confirmed-77'});assert.equal(view.animations.length,1);view.unmount();
 const reduced=runtime('src/components/map/RideTeamFlag.tsx',{...imports,'../../hooks/useReducedGameMotion':{default:()=>true}},{team:'mouse',raiseKey:'confirmed-78'});
 assert.equal(reduced.animations.length,0);assert.ok(reduced.find(n=>n.props?.accessibilityLabel==='Team Mouse holds this ride.'));
});
