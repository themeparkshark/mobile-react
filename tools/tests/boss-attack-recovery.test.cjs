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
 const view=runtime('src/components/boss/BossAttackStatus.tsx',{'./bossArt':{BOSS_ART:{kraken:1}},
  '../../api/endpoints/parks/raid':{BOSS_NAMES:{kraken:'The Kraken'}}},{snapshot,onRetry(){retries++;}});
 assert.ok(view.find(n=>n.props?.children==='We didn’t hear back. Check this round before you spend more energy.'));
 view.find(n=>n.type==='Pressable').props.onPress();assert.equal(retries,1);
 view.change({snapshot:{...snapshot,phase:'sending'}});assert.equal(view.find(n=>n.type==='Pressable'),undefined);
});

const joinModel=(()=>{const m={exports:{}};const tsc=require(require('node:path').resolve(__dirname,'../../node_modules/typescript'));
 require('node:vm').runInNewContext(tsc.transpileModule(require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../src/components/boss/joinModel.ts'),'utf8'),
 {compilerOptions:{module:tsc.ModuleKind.CommonJS,target:tsc.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:()=>({})});return m.exports;})();
function flow({reduced=false,round,stubs={}}={}){
 const captures=[],states=[],writes=[],reads=[],rounds=[],acks=[],focus={value:true},auth={value:{player:{id:5,energy:185,tickets:7},refreshPlayer:async()=>{}}},location={value:{location:{latitude:34.13,longitude:-118.35}}};
 const raid={id:77,boss:'kraken',ride_name:'Practice attraction',latitude:34.13,longitude:-118.35,hp_max:5000,hp_left:5000,
  status:'active',ends_at:new Date(Date.now()+600000).toISOString(),fighters:0,teams:{mouse:0,globe:0,shark:0},top:[],
  you:{attacks:0,attacks_left:5,damage:0,reward:null},energy_cost:10,reach_meters:200,
  remote:{joined:false,ticket_cost:1,damage_rate:.25,fighters:0}};
 const snapshot={loaded:true,phase:'ready',pending:null,receipt:null};
 const answer=round??(body=>({ok:true,round:{token:'a'.repeat(32),remote:!!body.remote,reason:null,damage_rate:body.remote?.25:1,max_ms:21000,max_hits:140}}));
 const view=runtime('src/components/boss/BossRaidFlow.tsx',{
  '../../context/AuthProvider':{AuthContext:auth},'../../context/LocationProvider':{LocationContext:location},
  '../../hooks/useBossAttackRecovery':{default:()=>({snapshot,canStart:()=>snapshot.phase==='ready'&&!snapshot.pending,capture:async cp=>{captures.push(cp);},retry:async()=>{}})},
  '../../hooks/useReducedGameMotion':{default:()=>reduced},
  '@react-navigation/native':{useIsFocused:()=>focus.value},
  '../../api/endpoints/parks/raid':{BOSS_NAMES:{kraken:'The Kraken'},DEFAULT_DAMAGE:{},fitToRound:m=>({hits:m.hits,weak_hits:m.weak_hits,duration_ms:m.duration_ms}),
   startRaidRound:async(id,body)=>{rounds.push([id,body]);return answer(body);},acknowledgeRaid:async id=>{acks.push(id);return true;}},
  './bossArt':{BOSS_ART:{kraken:1}},'../../games/boss/bash/BossBash':{BossBash:'BossBrawl'},
  './BossJoinCard':{default:'BossJoinCard',BossJoinCta:'BossJoinCta'},'./joinModel':joinModel,
  '../../power':{useBudgetedPoll(){}},
  '../../ui':{BRAND:{},GameButton:'GameButton',GameIcon:'GameIcon'},
  './BossSheetParts':{AttackPips:'AttackPips',BossSheetSkeleton:'BossSheetSkeleton',TeamDamage:'TeamDamage',TopFighters:'TopFighters'},
  './BossWinCard':{default:'BossWinCard'},
  '@react-native-async-storage/async-storage':{default:{getItem:async key=>{reads.push(key);return null;},setItem:async(key,value)=>{writes.push([key,value]);}}},
  '../../constants/teams':{applyTeamNames(){}},
  ...stubs,
 },{raid,parkId:1,open:true,onClose(){},onState:state=>states.push(state)},
 {setInterval(){return 1;},clearInterval(){}});
 // The FIGHT button lives in the join card: read it through the card's props.
 const fight=()=>{const c=view.find(n=>n.type==='BossJoinCta');if(!c)return undefined;const card=view.find(n=>n.type==='BossJoinCard');
  return{props:{onPress:c.props.onFight,disabled:!!c.props.blocked||!!c.props.starting,label:joinModel.joinLabel(c.props.raid,c.props.remote),
   blocked:c.props.blocked,note:card?.props.note}};};
 return{view,captures,auth,location,snapshot,writes,reads,rounds,acks,focus,fight,
  async start(){fight().props.onPress();await view.settle();return view.find(n=>n.type==='BossBrawl');}};
}
test('FIGHT asks the server for a round first, then locks its token, GPS and remote choice into one saved attack',async()=>{
 const h=flow(),first=await h.start();assert.equal(first.props.visible,true);assert.equal(first.props.damageRate,1);
 assert.deepEqual(plain(h.rounds[0]),[77,{latitude:34.13,longitude:-118.35}]);
 h.location.value.location={latitude:40,longitude:-100};h.view.render();assert.equal(h.view.find(n=>n.type==='BossBrawl').props.damageRate,1);
 const result={hits:3,weak_hits:1,duration_ms:20000};first.props.onComplete(1,result);first.props.onComplete(1,result);h.view.render();
 assert.equal(h.captures.length,1);assert.equal(h.captures[0].body.latitude,34.13);assert.equal(h.captures[0].body.remote,undefined);
 assert.equal(h.captures[0].body.round_token,'a'.repeat(32));
 // Now far from the ride: the label says so and the round is remote at the server's rate.
 assert.equal(h.fight().props.label,'JOIN FROM HOME');
 const second=await h.start();assert.equal(second.props.damageRate,.25);assert.equal(h.rounds[1][1].remote,true);
 first.props.onComplete(1,result);first.props.onClose();h.view.render();assert.equal(h.view.find(n=>n.type==='BossBrawl').props.visible,true);
 second.props.onComplete(1,result);h.view.render();assert.equal(h.captures.length,2);assert.equal(h.captures[1].body.remote,true);
});
test('when the server says you are not at the ride, nothing starts and the sheet offers the remote join with the reason',async()=>{
 let calls=0;const h=flow({round:body=>(++calls===1?{ok:false,error:'too_far',reason:'not_checked_in'}
  :{ok:true,round:{token:'b'.repeat(32),remote:!!body.remote,reason:'not_checked_in',damage_rate:.6,max_ms:21000,max_hits:140}})});
 const arena=await h.start();assert.equal(arena.props.visible,false);assert.equal(h.captures.length,0);
 assert.ok(String(h.fight().props.note).startsWith('Check in at this park'));
 assert.equal(h.fight().props.label,'JOIN FROM HOME');
 const again=await h.start();assert.equal(again.props.visible,true);assert.equal(h.rounds[1][1].remote,true);assert.equal(again.props.damageRate,.6);
});
test('missing GPS at the park, zero hits, and a saved pending round cannot start a second paid attack',async()=>{
 const h=flow();h.location.value.location=null;h.view.render();
 assert.equal(h.fight().props.disabled,true);assert.equal(h.fight().props.blocked,'Waiting for your location…');
 h.location.value.location={latitude:34.13,longitude:-118.35};h.view.render();const arena=await h.start();
 arena.props.onComplete(0,{hits:0,weak_hits:0,duration_ms:20000});h.view.render();assert.equal(h.captures.length,0);
 h.snapshot.pending=checkpoint;h.snapshot.phase='unconfirmed';h.view.render();
 assert.equal(h.fight(),undefined);
 h.view.change({raid:null});assert.ok(h.view.find(n=>n.type==='./BossAttackStatus')); // still reachable after raid expiry
});
test('from home (no ride position shared) a player without a GPS fix can still join remotely',async()=>{
 const h=flow();h.location.value.location=null;h.view.change({raid:{...h.view.props.raid,latitude:null,longitude:null}});
 assert.equal(h.fight().props.disabled,false);assert.equal(h.fight().props.label,'JOIN FROM HOME');
 const arena=await h.start();assert.equal(arena.props.visible,true);assert.deepEqual(plain(h.rounds[0][1]),{remote:true});
 arena.props.onComplete(1,{hits:3,weak_hits:1,duration_ms:20000});h.view.render();
 assert.equal(h.captures[0].body.latitude,undefined);assert.equal(h.captures[0].body.remote,true);
});
test('a loading raid shows the skeleton instead of "no boss"',()=>{
 const h=flow();h.view.change({raid:null,loading:true});
 assert.ok(h.view.find(n=>n.type==='BossSheetSkeleton'));
 assert.equal(h.view.find(n=>n.props?.children==='No boss is fighting here right now.'),undefined);
});
test('a poll cannot resurrect stale raid HP after a confirmed hit or after changing park/player',async()=>{
 const requests=[],auth={value:{player:{id:5}}};
 const view=runtime('src/components/boss/BossRaidFlow.tsx',{
  '../../context/AuthProvider':{AuthContext:auth},'../../constants/teams':{applyTeamNames(){}},'../../ui':{BRAND:{}},
  '../../api/endpoints/parks/raid':{getParkRaid:id=>{const p=pending();requests.push({id,...p});return p.promise;}},
  '../../hooks/useMatchLink':{default:()=>({phase:'live',ok(){},fail(){},retryNow(){}})},
 },{parkId:1},{setInterval(){return 1;},clearInterval(){}},{exportName:'useParkRaid',arguments:props=>[props.parkId]});
 assert.equal(requests.length,1);assert.equal(view.tree.loaded,false);
 const fresh={raid:{id:77,hp_left:4500},next_at:null};view.tree.setState(fresh);view.render();assert.equal(view.tree.loaded,true);
 requests[0].resolve({raid:{id:77,hp_left:5000},next_at:null});await view.settle();assert.equal(view.tree.raid.hp_left,4500);
 view.tree.refresh();view.change({parkId:2});assert.equal(view.tree.raid,null);assert.equal(view.tree.loaded,false);
 requests[1].resolve({raid:{id:77,hp_left:4000},next_at:null});await view.settle();assert.equal(view.tree.raid,null);
 requests[2].resolve({raid:{id:88,hp_left:3000},next_at:null});await view.settle();assert.equal(view.tree.raid.id,88);
 view.tree.refresh();auth.value.player={id:8};view.render();assert.equal(view.tree.raid,null);
 requests[3].resolve(fresh);await view.settle();assert.equal(view.tree.raid,null);
 view.unmount();requests[4].resolve(fresh);await view.settle();assert.equal(view.tree.raid,null);
});
test('a confirmed celebration belongs to its player, waits for sheet dismissal, is seen only after dismissal and acknowledged',async()=>{
 const h=flow(),reward={outcome:'defeated',coins:50,xp:100,energy:20,parts:2,tickets:0};
 const sheet=h.view.find(n=>n.type==='react-native-modal');sheet.props.onModalWillShow();h.view.render();
 h.view.change({raid:{...h.view.props.raid,status:'defeated',hp_left:0,you:{attacks:1,attacks_left:4,damage:50,reward}}});
 for(const [id,fn]of h.view.timers){h.view.timers.delete(id);fn();}await h.view.settle();
 assert.deepEqual(h.reads,['boss-celebrated-v2-5-77']);assert.equal(h.writes.length,0);
 h.view.change({open:false});assert.equal(h.view.find(n=>n.type==='react-native-modal'&&n.props.isVisible),undefined);
 sheet.props.onModalHide();h.view.render();const win=h.view.find(n=>n.type==='react-native-modal'&&n.props.isVisible);assert.ok(win);
 assert.equal(win.props.children.type,'BossWinCard');assert.equal(win.props.children.props.lastHp,5000);
 win.props.onBackdropPress();await h.view.settle();assert.deepEqual(h.writes,[['boss-celebrated-v2-5-77','1']]);assert.deepEqual(h.acks,[77]);
});
test('map handoff carries the actual reward receipt and waits for both native presentations to finish hiding',async()=>{
 const h=flow(),busy=[],receipts=[];
 h.view.change({onMapOcclusionChange:value=>busy.push(value),onCelebrationDismiss:value=>receipts.push(value)});
 const sheet=h.view.find(n=>n.type==='react-native-modal');sheet.props.onModalWillShow();h.view.render();
 const settled={...h.view.props.raid,status:'defeated',hp_left:0,you:{attacks:1,attacks_left:4,damage:50,
  reward:{outcome:'defeated',coins:50,xp:100,energy:20,parts:2,tickets:0}}};
 h.view.change({raid:settled});for(const [id,fn]of [...h.view.timers]){h.view.timers.delete(id);fn();}await h.view.settle();
 h.view.change({open:false});sheet.props.onModalHide();h.view.render();
 const win=h.view.find(n=>n.type==='react-native-modal'&&n.props.isVisible);win.props.onModalWillShow();h.view.render();
 win.props.children.props.onDone();h.view.render();assert.equal(receipts[0],settled);assert.notEqual(busy.at(-1),false);
 win.props.onModalHide();h.view.render();assert.equal(busy.at(-1),false);
 assert.ok(h.view.find(n=>n.type==='react-native-modal'&&n.props.children));
});
test('reduced motion keeps a readable boss sheet without slide or zoom presentation',()=>{
 const h=flow({reduced:true}),sheet=h.view.find(n=>n.type==='react-native-modal');
 assert.equal(sheet.props.animationIn,'fadeIn');assert.equal(sheet.props.animationOut,'fadeOut');assert.equal(sheet.props.animationInTiming,100);
});
test('hidden screens and stale entry taps cannot start or finish a brawl behind another page',async()=>{
 const h=flow(),button=h.fight();
 const arena=await h.start();h.focus.value=false;h.view.render();
 assert.equal(h.view.find(n=>n.type==='BossBrawl').props.visible,false);assert.equal(h.view.find(n=>n.type==='react-native-modal').props.isVisible,false);
 button.props.onPress();await h.view.settle();arena.props.onComplete(1,{hits:3,weak_hits:1,duration_ms:20000});h.view.render();assert.equal(h.captures.length,0);
 h.focus.value=true;h.view.render();h.auth.value.player={id:8,energy:185,tickets:7};h.view.render();
 button.props.onPress();await h.view.settle();assert.equal(h.view.find(n=>n.type==='BossBrawl').props.visible,false);
});
test('boss sheet copy has no emoji, glyph icons or em dashes',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../src/components/boss/BossRaidFlow.tsx'),'utf8');
 assert.doesNotMatch(src,/[\u{1F300}-\u{1FAFF}☀-➿—]/u);
 assert.doesNotMatch(src,/#2a1245|#472462|#3b1a5c/i);
});
test('a confirmation that keeps failing asks the server whether the round counted instead of locking the player out',async()=>{
 const lookups=[];const store=storage();
 const found=new BossAttackRecovery(store,async()=>({ok:false,error:'network'}),async(id,rid)=>{lookups.push([id,rid]);
  return {ok:true,found:true,damage:70,raidActive:true,state:{raid:null,next_at:null}};});
 await found.load(5,1);await found.capture(checkpoint,()=>true);
 assert.deepEqual(lookups,[[77,checkpoint.body.client_request_id]]);assert.equal(found.snapshot(5,1).receipt.result.damage,70);
 assert.equal(found.snapshot(5,1).pending,null);
 const gone=new BossAttackRecovery(storage(),async()=>({ok:false,error:'network'}),async()=>({ok:true,found:false,damage:null,raidActive:false,state:{raid:null,next_at:null}}));
 await gone.load(5,1);await gone.capture(checkpoint,()=>true);assert.equal(gone.snapshot(5,1).receipt.result.error,'raid_over');assert.equal(gone.snapshot(5,1).pending,null);
 // Still live and not found, or the lookup itself failing: stays saved and retryable.
 for(const lookup of [async()=>({ok:true,found:false,damage:null,raidActive:true,state:{raid:null,next_at:null}}),async()=>({ok:false}),async()=>{throw Error('offline');}]){
  const kept=new BossAttackRecovery(storage(),async()=>({ok:false,error:'network'}),lookup);await kept.load(5,1);await kept.capture(checkpoint,()=>true);
  assert.equal(kept.snapshot(5,1).phase,'unconfirmed');assert.ok(kept.snapshot(5,1).pending);
 }
});
test('saved rounds carry their server token, may lack GPS (remote without a fix), and old 26s rounds still load',()=>{
 const withToken=parseBossAttack(JSON.stringify({...checkpoint,body:{...checkpoint.body,round_token:'c'.repeat(32)}}),5,1);
 assert.equal(withToken.body.round_token,'c'.repeat(32));
 const noGps={...checkpoint,body:{client_request_id:checkpoint.body.client_request_id,hits:3,weak_hits:1,duration_ms:20000,remote:true}};
 assert.equal(parseBossAttack(JSON.stringify(noGps),5,1).body.latitude,undefined);
 assert.equal(parseBossAttack(JSON.stringify({...checkpoint,body:{...checkpoint.body,duration_ms:26000}}),5,1).body.duration_ms,26000);
 for(const body of [{...checkpoint.body,round_token:'NOT HEX'},{...checkpoint.body,latitude:undefined}])
  assert.throws(()=>parseBossAttack(JSON.stringify({...checkpoint,body}),5,1));
});
test('a raid poll reports the connection: a reply keeps it live, a dropped request starts Reconnecting',async()=>{
 const requests=[],calls=[];
 const view=runtime('src/components/boss/BossRaidFlow.tsx',{
  '../../context/AuthProvider':{AuthContext:{value:{player:{id:5}}}},'../../constants/teams':{applyTeamNames(){}},'../../ui':{BRAND:{}},
  '../../api/endpoints/parks/raid':{getParkRaid:id=>{const p=pending();requests.push({id,...p});return p.promise;}},
  '../../hooks/useMatchLink':{default:(retry,key)=>({phase:'reconnecting',ok(){calls.push('ok');},fail(e){calls.push(['fail',e]);},retryNow(){calls.push('retry');}})},
 },{parkId:1},{setInterval(){return 1;},clearInterval(){}},{exportName:'useParkRaid',arguments:props=>[props.parkId]});
 const dropped={response:{status:0}};
 requests[0].reject(dropped);await view.settle();
 assert.deepEqual(calls,[['fail',dropped]]);assert.equal(view.tree.raid,null,'a failed poll never invents a raid');
 assert.equal(view.tree.link,'reconnecting');view.tree.retryLink();assert.equal(calls.at(-1),'retry');
 view.tree.refresh();requests[1].resolve({raid:{id:77,hp_left:4000},next_at:null});await view.settle();
 assert.equal(calls.at(-1),'ok');assert.equal(view.tree.raid.hp_left,4000);
});
test('losing the park mid-fight: FIGHT waits, Reconnecting shows, then Leave fight closes the sheet for free',async()=>{
 const h=flow({stubs:{'../match/MatchLinkBanner':{default:'MatchLinkBanner'}}});let closed=0,retried=0;
 h.view.change({link:'reconnecting',onRetryLink(){retried++;},onClose(){closed++;}});
 assert.equal(h.fight().props.disabled,true);
 assert.equal(h.fight().props.blocked,'Reconnecting…','the blocked line says Reconnecting');
 assert.equal(h.view.find(n=>n.type==='MatchLinkBanner').props.phase,'reconnecting');
 h.fight().props.onPress();await h.view.settle();assert.equal(h.rounds.length,0,'no round is started while the link is down');
 h.view.change({link:'lost'});
 const banner=h.view.find(n=>n.type==='MatchLinkBanner');
 assert.equal(banner.props.phase,'lost');assert.equal(banner.props.leaveLabel,'Leave fight');
 banner.props.onRetry();assert.equal(retried,1);
 banner.props.onLeave();assert.equal(closed,1);
 assert.equal(h.captures.length,0,'leaving after a drop sends and spends nothing');
 h.view.change({link:'live'});assert.equal(h.fight().props.disabled,false);
});
test('an unreachable park never leaves the raid sheet on an endless skeleton',()=>{
 const h=flow({stubs:{'../match/MatchLinkBanner':{default:'MatchLinkBanner'}}});
 h.view.change({raid:null,loading:true,link:'reconnecting'});
 assert.ok(h.view.find(n=>n.type==='BossSheetSkeleton'));
 h.view.change({link:'lost'});
 assert.equal(h.view.find(n=>n.type==='BossSheetSkeleton'),undefined);
 assert.equal(h.view.find(n=>n.type==='MatchLinkBanner').props.leaveLabel,'Leave fight');
 assert.ok(h.view.find(n=>n.type==='GameButton'&&n.props.label==='Back to the park'));
});
