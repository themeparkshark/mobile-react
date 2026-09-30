const assert=require('node:assert/strict'),test=require('node:test');
const {createEarnedShelfArrival,resolveEarnedShelfSlot}=require('./helpers/earned-shelf.cjs');
const {runtime}=require('./helpers/reward-hook-runtime.cjs');
const win={id:42,task_id:109,task_type:'task',status:'won',rewards:{coin_asset_id:24,coin_times_collected:1}};
const request=createEarnedShelfArrival(win);
const tasks=Array.from({length:26},(_,i)=>({id:100+i,asset_id:15+i,times_completed:0}));
const empty={normal:[],normalCompleted:[],secret:[],secretCompleted:[],archived:[],archivedCompleted:[]};

test('only a server won attempt with a collected identity can create a shelf arrival',()=>{
 assert.ok(request);assert.equal(request.assetId,24);
 for(const status of ['started','lost','expired'])assert.equal(createEarnedShelfArrival({...win,status}),null);
 assert.equal(createEarnedShelfArrival({...win,rewards:null}),null);
 assert.equal(createEarnedShelfArrival({...win,rewards:{coin_asset_id:24,coin_times_collected:0}}),null);
 assert.equal(createEarnedShelfArrival({...win,id:NaN}),null);
 assert.equal(createEarnedShelfArrival({...win,rewards:{coin_asset_id:24,coin_times_collected:Infinity}}),null);
});
test('arrival uses the real five-slot catalog order, ownership, and task namespace',()=>{
 const slot=resolveEarnedShelfSlot(request,{...empty,normal:tasks,normalCompleted:[{...tasks[9],times_completed:1}]});
 assert.equal(slot.row,1);assert.equal(slot.column,4);assert.equal(slot.section,'normal');
 assert.equal(resolveEarnedShelfSlot(request,{...empty,normal:tasks}),null);
 assert.equal(resolveEarnedShelfSlot(request,{...empty,normal:tasks,normalCompleted:[{...tasks[9],asset_id:999,times_completed:1}]}),null);
 assert.equal(resolveEarnedShelfSlot({...request,assetId:999},{...empty,normal:tasks,normalCompleted:[{...tasks[9],times_completed:1}]}),null);
 const secret={...request,taskType:'secret_task'};
 assert.equal(resolveEarnedShelfSlot(secret,{...empty,normal:tasks,normalCompleted:[{...tasks[9],times_completed:1}]}),null);
 assert.equal(resolveEarnedShelfSlot(secret,{...empty,secret:tasks,secretCompleted:[{...tasks[9],times_completed:1}]}).section,'secret');
 assert.equal(resolveEarnedShelfSlot(request,{...empty,archived:tasks,archivedCompleted:[{...tasks[9],times_completed:1}]}).section,'archived');
});
function measurement({offscreen=false,deferred=false}={}){
 const scrolls=[];let pending;let sy=offscreen?1200:250;
 const props={requestKey:'5:1:42',enabled:true,
  slotRef:{current:{measureLayout(_parent,done){done(50,800);},measureInWindow(done){if(deferred)pending=done;else done(120,sy,60,60);}}},
  contentRef:{current:{}},frameRef:{current:{measureInWindow(done){done(0,100,390,650);}}},
  scrollRef:{current:{scrollTo(value){scrolls.push(value);}}}};
 const view=runtime('src/hooks/useEarnedShelfArrival.ts',{},props);
 const tick=()=>{const [id,fn]=view.timers.entries().next().value??[];if(fn){view.timers.delete(id);fn();view.render();}};
 return {view,scrolls,tick,setY(value){sy=value;},late(){pending?.(120,250,60,60);view.render();}};
}
test('scrolls to the exact content row and accepts only an actually visible measured slot',()=>{
 const h=measurement({offscreen:true});assert.equal(h.scrolls[0].y,630);h.tick();assert.equal(h.view.tree.target,null);
 h.setY(270);h.tick();assert.equal(h.view.tree.target.x,120);assert.equal(h.view.tree.target.y,170);
 const n=h.scrolls.length;h.view.tree.notifyLayout();h.view.render();assert.equal(h.scrolls.length,n);
});
test('hidden screens and stale native measurements cannot start a shelf arrival',()=>{
 const h=measurement({deferred:true});h.tick();h.view.change({enabled:false});h.late();assert.equal(h.view.tree.target,null);
 const second=measurement({deferred:true});second.tick();second.view.unmount();second.late();assert.equal(second.view.tree.target,null);
});
test('leaving a measured arrival discards its coordinates and cannot replay the consumed attempt',()=>{
 const h=measurement();h.tick();assert.ok(h.view.tree.target);
 h.view.change({enabled:false});assert.equal(h.view.tree.target,null);
 const n=h.scrolls.length;h.view.change({enabled:true});h.tick();
 assert.equal(h.view.tree.target,null);assert.equal(h.scrolls.length,n);
 h.view.change({requestKey:'5:1:43'});h.tick();assert.ok(h.view.tree.target);
});
test('a slot that stays outside the viewport produces a retry, never a pretend deposit',()=>{
 const h=measurement({offscreen:true});for(let i=0;i<8;i++)h.tick();assert.equal(h.view.tree.failed,true);assert.equal(h.view.tree.target,null);
});
test('arrival actions remain usable immediately; land feedback happens once and cleanup cancels motion',()=>{
 let lands=0,inspections=0;const view=runtime('src/components/CoinShelfArrival.tsx',{
  '../hooks/useReducedGameMotion':{default:()=>false},'../gamekit/SFX':{playSfx(){}}
 },{target:{x:120,y:170,width:60,height:60,frameWidth:390,frameHeight:650},coinUrl:'coin',rideName:'Snowball',firstCollection:true,
 onLand(){lands++;},onInspect(){inspections++;},onClose(){}});
 const primary=view.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='View coin mastery');
 primary.props.onPress();view.render();assert.equal(lands,1);assert.equal(inspections,1);
 view.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Keep exploring this shelf').props.onPress();
 assert.equal(lands,1);view.unmount();assert.ok(view.cancelled.length>0);assert.equal(view.timers.size,0);
});
test('reduced-motion arrival immediately marks its real slot with no entrance motion',()=>{
 let lands=0;const view=runtime('src/components/CoinShelfArrival.tsx',{
 '../hooks/useReducedGameMotion':{default:()=>true},'../gamekit/SFX':{playSfx(){}}
 },{target:{x:120,y:170,width:60,height:60,frameWidth:390,frameHeight:650},coinUrl:'coin',rideName:'Snowball',firstCollection:true,onLand(){lands++;},onInspect(){},onClose(){}});
 assert.equal(lands,1);assert.equal(view.motions.length,0);
 assert.ok(view.find(n=>n.props?.children==='ON YOUR SHELF'));assert.equal(view.timers.size,0);
});
test('explicit mastery opens once and cannot present a late response after its action is cancelled',async()=>{
 let reads=0,resolve;
 const view=runtime('src/components/TaskCoinModal.tsx',{
  '../context/AuthProvider':{AuthContext:{value:{player:{id:5,energy:185},refreshPlayer:async()=>{}}}},
  '../helpers/haptics':{impactAsync(){},ImpactFeedbackStyle:{}},
  '../constants/coinTiers':require('./helpers/ts-module.cjs').loadTs('src/constants/coinTiers.ts'),
  '../context/CoinCollection':{loadCoin:()=>{reads++;return new Promise(done=>{resolve=done;});},upsertCoin(){},setFeaturedCoin(){}},
 },{task:{id:109,asset_id:24,name:'Snowball'},openRequestKey:6});
 view.render();assert.equal(reads,1);
 view.change({openRequestKey:undefined});
 resolve({id:24,current_level:1,ride_name:'Snowball'});await view.settle();
 assert.equal(view.find(n=>n.type==='./CoinLevelingModal').props.visible,false);
 view.change({openRequestKey:7});assert.equal(reads,2);
 resolve({id:24,current_level:1,ride_name:'Snowball'});await view.settle();
 assert.equal(view.find(n=>n.type==='./CoinLevelingModal').props.visible,true);
});
