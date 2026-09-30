const assert=require('node:assert/strict'),test=require('node:test');
const {BossAttackRecovery,bossAttackKey,parseBossAttack}=require('./helpers/boss-recovery.cjs');
const {runtime}=require('./helpers/reward-hook-runtime.cjs');
const pending=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const plain=value=>JSON.parse(JSON.stringify(value));
const checkpoint={version:1,playerId:5,parkId:1,raidId:77,boss:'kraken',rideName:'A test attraction',savedAt:1000,
 body:{client_request_id:'boss-77-1000-abcdef123',latitude:34.13,longitude:-118.35,hits:3,weak_hits:1,duration_ms:20000}};
const confirmed={ok:true,damage:50,state:{raid:null,next_at:null}};
function storage(){const records=new Map(),calls=[];return{records,calls,
 async getItem(key){calls.push(['get',key]);return records.get(key)??null;},
 async setItem(key,value){calls.push(['set',key]);records.set(key,value);},
 async removeItem(key){calls.push(['remove',key]);records.delete(key);}};}

test('a committed hit with a lost reply survives restart and confirms exactly one Energy spend',async()=>{
 const store=storage(),receipts=new Map(),requests=[];let spends=0;
 const attack=async(id,body)=>{requests.push([id,plain(body)]);if(receipts.has(body.client_request_id))return receipts.get(body.client_request_id);
  spends++;receipts.set(body.client_request_id,confirmed);return {ok:false,error:'network'};};
 const first=new BossAttackRecovery(store,attack);await first.load(5,1);await first.capture(checkpoint,()=>true);
 assert.equal(first.snapshot(5,1).phase,'unconfirmed');assert.equal(spends,1);assert.ok(store.records.has(bossAttackKey(5,1)));
 // A later raid/new app cannot silently replace this finished round.
 await first.capture({...checkpoint,raidId:99,body:{...checkpoint.body,client_request_id:'boss-99-2000-another'}},()=>true);assert.equal(requests.length,1);
 const restarted=new BossAttackRecovery(store,attack);await restarted.load(5,1);await restarted.retry(5,1,()=>true);
 assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(spends,1);
 assert.equal(restarted.snapshot(5,1).receipt.result.damage,50);assert.equal(restarted.snapshot(5,1).pending,null);
 assert.equal(store.records.size,0);
});
test('rapid claims and retries coalesce across two consumers while the saved proof stays immutable',async()=>{
 const store=storage(),reply=pending();let attacks=0;const recovery=new BossAttackRecovery(store,async()=>{attacks++;return reply.promise;});
 await recovery.load(5,1);const a=recovery.capture(checkpoint,()=>true),b=recovery.capture(checkpoint,()=>true),c=recovery.retry(5,1,()=>true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(attacks,1);assert.equal(a,b);
 assert.equal(Object.isFrozen(recovery.snapshot(5,1).pending.body),true);
 reply.resolve(confirmed);await Promise.all([a,b,c]);assert.equal(attacks,1);assert.equal(recovery.snapshot(5,1).phase,'ready');
});
test('failed persistence never sends an attack, and retry saves the same proof before posting',async()=>{
 const store=storage(),saved=store.setItem;let attacks=0;store.setItem=async()=>{throw Error('Disk unavailable');};
 const recovery=new BossAttackRecovery(store,async()=>{attacks++;return confirmed;});await recovery.load(5,1);
 await recovery.capture(checkpoint,()=>true);assert.equal(attacks,0);assert.equal(recovery.snapshot(5,1).phase,'storage_error');
 store.setItem=saved;await recovery.retry(5,1,()=>true);assert.equal(attacks,1);assert.equal(recovery.snapshot(5,1).phase,'ready');
 assert.equal(store.calls.findIndex(call=>call[0]==='set')<store.calls.findIndex(call=>call[0]==='remove'),true);
});
test('unreadable or corrupt saved receipts fail closed instead of allowing another paid round',async()=>{
 const store=storage();store.records.set(bossAttackKey(5,1),'{broken');let attacks=0;
 const recovery=new BossAttackRecovery(store,async()=>{attacks++;return confirmed;});await recovery.load(5,1);
 assert.equal(recovery.snapshot(5,1).loaded,false);assert.equal(recovery.snapshot(5,1).phase,'storage_error');
 await recovery.capture(checkpoint,()=>true);assert.equal(attacks,0);assert.equal(store.records.size,1);
 store.records.set(bossAttackKey(5,1),JSON.stringify(checkpoint));await recovery.retry(5,1,()=>true);assert.equal(attacks,1);
 const bad=storage();bad.getItem=async()=>{throw Error('Unreadable');};const second=new BossAttackRecovery(bad,async()=>{attacks++;return confirmed;});
 await second.load(5,1);assert.equal(second.snapshot(5,1).loaded,false);
});
test('account changes before durable save completes retain the owner receipt without posting under another account',async()=>{
 const store=storage(),write=pending();store.setItem=async(key,value)=>{await write.promise;store.records.set(key,value);};
 let current=5,attacks=0;const recovery=new BossAttackRecovery(store,async()=>{attacks++;return confirmed;});await recovery.load(5,1);
 const operation=recovery.capture(checkpoint,()=>current===5);current=8;write.resolve();await operation;
 assert.equal(attacks,0);assert.equal(recovery.snapshot(5,1).phase,'unconfirmed');
 await recovery.load(8,1);assert.equal(recovery.snapshot(8,1).pending,null);assert.ok(store.records.has(bossAttackKey(5,1)));
 current=5;await recovery.retry(5,1,()=>current===5);assert.equal(attacks,1);
});
test('terminal responses retire the round, and failed local cleanup cannot repost an already confirmed receipt',async()=>{
 const store=storage(),remove=store.removeItem;store.removeItem=async()=>{throw Error('Cleanup unavailable');};
 let attacks=0;const recovery=new BossAttackRecovery(store,async()=>{attacks++;return {ok:false,error:'raid_over',state:{raid:null,next_at:null}};});
 await recovery.load(5,1);await recovery.capture(checkpoint,()=>true);assert.equal(attacks,1);assert.equal(recovery.snapshot(5,1).phase,'storage_error');
 assert.equal(recovery.snapshot(5,1).receipt.result.error,'raid_over');store.removeItem=remove;
 await recovery.retry(5,1,()=>true);assert.equal(attacks,1);assert.equal(recovery.snapshot(5,1).pending,null);
});
test('raid expiry cannot erase an unconfirmed spend; saved GPS, remote intent, owner and server proof limits are validated',()=>{
 const record=parseBossAttack(JSON.stringify({...checkpoint,savedAt:1,body:{...checkpoint.body,remote:true}}),5,1);
 assert.equal(record.savedAt,1);assert.equal(record.body.remote,true);assert.equal(record.body.latitude,34.13);
 for(const body of [{...checkpoint.body,latitude:200},{...checkpoint.body,hits:141},{...checkpoint.body,weak_hits:2},
  {...checkpoint.body,duration_ms:11000},{...checkpoint.body,remote:'yes'},{...checkpoint.body,client_request_id:'short'}]){
  assert.throws(()=>parseBossAttack(JSON.stringify({...checkpoint,body}),5,1));
 }
 assert.throws(()=>parseBossAttack(JSON.stringify(checkpoint),8,1));assert.throws(()=>parseBossAttack(JSON.stringify(checkpoint),5,2));
});
test('a late reply from another account or unmounted screen cannot change the current wallet or map',async()=>{
 const store=storage(),reply=pending(),recovery=new BossAttackRecovery(store,async()=>reply.promise),delivered=[];
 const view=runtime('src/hooks/useBossAttackRecovery.ts',{'../services/boss/attackRecovery':{bossAttackRecovery:recovery}},
  {playerId:5,parkId:1,onResult:(cp,result)=>delivered.push([cp.playerId,result])});
 await view.settle();const oldCapture=view.tree.capture;const operation=oldCapture(checkpoint);await view.settle();
 view.change({playerId:8});await view.settle();reply.resolve(confirmed);await operation;await view.settle();assert.equal(delivered.length,0);
 await oldCapture(checkpoint);assert.equal(delivered.length,0);
 view.change({playerId:5});await view.settle();assert.equal(delivered.length,1);assert.equal(delivered[0][0],5);
 view.render();assert.equal(delivered.length,1);
 view.unmount();assert.equal(recovery.snapshot(5,1).pending,null);
 const secondReply=pending(),secondRecovery=new BossAttackRecovery(storage(),async()=>secondReply.promise);
 const second=runtime('src/hooks/useBossAttackRecovery.ts',{'../services/boss/attackRecovery':{bossAttackRecovery:secondRecovery}},
  {playerId:5,parkId:1,onResult:()=>delivered.push('unexpected')});await second.settle();
 const p=second.tree.capture(checkpoint);await second.settle();second.unmount();secondReply.resolve(confirmed);await p;
 assert.equal(delivered.length,1);
});
test('the recovery receipt offers one clear retry and does not claim an unconfirmed spend was refunded',()=>{
 let retries=0;const snapshot={loaded:true,phase:'unconfirmed',pending:checkpoint,receipt:null};
 const view=runtime('src/components/boss/BossAttackStatus.tsx',{'../../games/boss/BossBrawl':{BOSS_ART:{kraken:1}},
  '../../api/endpoints/parks/raid':{BOSS_NAMES:{kraken:'The Kraken'}}},{snapshot,onRetry(){retries++;}});
 assert.ok(view.find(n=>n.props?.children==='The reply didn’t arrive. Confirm this round before spending more Energy.'));
 view.find(n=>n.type==='Pressable').props.onPress();assert.equal(retries,1);
 view.change({snapshot:{...snapshot,phase:'sending'}});assert.equal(view.find(n=>n.type==='Pressable'),undefined);
});

function flow({reduced=false}={}){
 const captures=[],states=[],writes=[],reads=[],focus={value:true},auth={value:{player:{id:5,energy:185,tickets:7},refreshPlayer:async()=>{}}},location={value:{location:{latitude:34.13,longitude:-118.35}}};
 const raid={id:77,boss:'kraken',ride_name:'Practice attraction',latitude:34.13,longitude:-118.35,hp_max:5000,hp_left:5000,
  status:'active',ends_at:new Date(Date.now()+600000).toISOString(),fighters:0,teams:{mouse:0,globe:0,shark:0},top:[],
  you:{attacks:0,attacks_left:5,damage:0,reward:null},energy_cost:10,reach_meters:200,
  remote:{joined:false,ticket_cost:1,damage_rate:.25,fighters:0}};
 const snapshot={loaded:true,phase:'ready',pending:null,receipt:null};
 const view=runtime('src/components/boss/BossRaidFlow.tsx',{
  '../../context/AuthProvider':{AuthContext:auth},'../../context/LocationProvider':{LocationContext:location},
  '../../hooks/useBossAttackRecovery':{default:()=>({snapshot,canStart:()=>snapshot.phase==='ready'&&!snapshot.pending,capture:async cp=>{captures.push(cp);},retry:async()=>{}})},
  '../../hooks/useReducedGameMotion':{default:()=>reduced},
  '@react-navigation/native':{useIsFocused:()=>focus.value},
  '../../api/endpoints/parks/raid':{BOSS_NAMES:{kraken:'The Kraken'}},
  '../../games/boss/BossBrawl':{BOSS_ART:{kraken:1},BossBrawl:'BossBrawl'},
  '@react-native-async-storage/async-storage':{default:{getItem:async key=>{reads.push(key);return null;},setItem:async(key,value)=>{writes.push([key,value]);}}},
  '../../constants/teams':{TEAMS:{mouse:{badge:1,color:'gold'},globe:{badge:2,color:'green'},shark:{badge:3,color:'blue'}}},
 },{raid,parkId:1,open:true,onClose(){},onState:state=>states.push(state)},
 {setInterval(){return 1;},clearInterval(){}});
 return{view,captures,auth,location,snapshot,writes,reads,focus,start(){const button=view.find(n=>n.type==='Pressable'&&/^(FIGHT|JOIN FROM HOME)/.test(String(n.props.children?.props?.children)));button.props.onPress();view.render();return view.find(n=>n.type==='BossBrawl');}};
}
test('a finished brawl keeps the GPS and pass choice approved at entry; result taps consume one original round',async()=>{
 const h=flow(),first=h.start();assert.equal(first.props.visible,true);assert.equal(first.props.damageRate,1);
 h.location.value.location={latitude:40,longitude:-100};h.view.render();assert.equal(h.view.find(n=>n.type==='BossBrawl').props.damageRate,1);
 const result={hits:3,weak_hits:1,duration_ms:20000};first.props.onComplete(1,result);first.props.onComplete(1,result);h.view.render();
 assert.equal(h.captures.length,1);assert.equal(h.captures[0].body.latitude,34.13);assert.equal(h.captures[0].body.remote,undefined);
 const second=h.start();assert.equal(second.props.damageRate,.25);
 first.props.onComplete(1,result);first.props.onClose();h.view.render();assert.equal(h.view.find(n=>n.type==='BossBrawl').props.visible,true);
 second.props.onComplete(1,result);h.view.render();assert.equal(h.captures.length,2);assert.equal(h.captures[1].body.remote,true);
});
test('missing GPS, zero hits, and a saved pending round cannot start a second paid attack',()=>{
 const h=flow();h.location.value.location=null;h.view.render();
 assert.equal(h.view.find(n=>n.type==='Pressable'&&n.props.children?.props?.children==='Waiting for your location…').props.disabled,true);
 h.location.value.location={latitude:34.13,longitude:-118.35};h.view.render();const arena=h.start();
 arena.props.onComplete(0,{hits:0,weak_hits:0,duration_ms:20000});h.view.render();assert.equal(h.captures.length,0);
 h.snapshot.pending=checkpoint;h.snapshot.phase='unconfirmed';h.view.render();
 assert.equal(h.view.find(n=>n.type==='Pressable'&&String(n.props.children?.props?.children).startsWith('FIGHT')),undefined);
 h.view.change({raid:null});assert.ok(h.view.find(n=>n.type==='./BossAttackStatus')); // still reachable after raid expiry
});
test('a poll cannot resurrect stale raid HP after a confirmed hit or after changing park/player',async()=>{
 const requests=[],auth={value:{player:{id:5}}};
 const view=runtime('src/components/boss/BossRaidFlow.tsx',{
  '../../context/AuthProvider':{AuthContext:auth},
  '../../api/endpoints/parks/raid':{getParkRaid:id=>{const p=pending();requests.push({id,...p});return p.promise;}},
 },{parkId:1},{setInterval(){return 1;},clearInterval(){}},{exportName:'useParkRaid',arguments:props=>[props.parkId]});
 assert.equal(requests.length,1);
 const fresh={raid:{id:77,hp_left:4500},next_at:null};view.tree.setState(fresh);view.render();
 requests[0].resolve({raid:{id:77,hp_left:5000},next_at:null});await view.settle();assert.equal(view.tree.raid.hp_left,4500);
 view.tree.refresh();view.change({parkId:2});assert.equal(view.tree.raid,null);
 requests[1].resolve({raid:{id:77,hp_left:4000},next_at:null});await view.settle();assert.equal(view.tree.raid,null);
 requests[2].resolve({raid:{id:88,hp_left:3000},next_at:null});await view.settle();assert.equal(view.tree.raid.id,88);
 view.tree.refresh();auth.value.player={id:8};view.render();assert.equal(view.tree.raid,null);
 requests[3].resolve(fresh);await view.settle();assert.equal(view.tree.raid,null);
 view.unmount();requests[4].resolve(fresh);await view.settle();assert.equal(view.tree.raid,null);
});
test('a confirmed celebration belongs to its player, waits for sheet dismissal, and is seen only after dismissal',async()=>{
 const h=flow(),reward={outcome:'defeated',coins:50,xp:100,energy:20,parts:2,tickets:0};
 const sheet=h.view.find(n=>n.type==='react-native-modal');sheet.props.onModalWillShow();h.view.render();
 h.view.change({raid:{...h.view.props.raid,status:'defeated',hp_left:0,you:{attacks:1,attacks_left:4,damage:50,reward}}});
 for(const [id,fn]of h.view.timers){h.view.timers.delete(id);fn();}await h.view.settle();
 assert.deepEqual(h.reads,['boss-celebrated-v2-5-77']);assert.equal(h.writes.length,0);
 h.view.change({open:false});assert.equal(h.view.find(n=>n.type==='react-native-modal'&&n.props.isVisible),undefined);
 sheet.props.onModalHide();h.view.render();const win=h.view.find(n=>n.type==='react-native-modal'&&n.props.isVisible);assert.ok(win);
 win.props.onBackdropPress();await h.view.settle();assert.deepEqual(h.writes,[['boss-celebrated-v2-5-77','1']]);
});
test('reduced motion keeps a readable boss sheet without slide or zoom presentation',()=>{
 const h=flow({reduced:true}),sheet=h.view.find(n=>n.type==='react-native-modal');
 assert.equal(sheet.props.animationIn,'fadeIn');assert.equal(sheet.props.animationOut,'fadeOut');assert.equal(sheet.props.animationInTiming,100);
});
test('hidden screens and stale entry taps cannot start or finish a brawl behind another page',()=>{
 const h=flow(),button=h.view.find(n=>n.type==='Pressable'&&String(n.props.children?.props?.children).startsWith('FIGHT'));
 const arena=h.start();h.focus.value=false;h.view.render();
 assert.equal(h.view.find(n=>n.type==='BossBrawl').props.visible,false);assert.equal(h.view.find(n=>n.type==='react-native-modal').props.isVisible,false);
 button.props.onPress();arena.props.onComplete(1,{hits:3,weak_hits:1,duration_ms:20000});h.view.render();assert.equal(h.captures.length,0);
 h.focus.value=true;h.view.render();h.auth.value.player={id:8,energy:185,tickets:7};h.view.render();
 button.props.onPress();h.view.render();assert.equal(h.view.find(n=>n.type==='BossBrawl').props.visible,false);
});
