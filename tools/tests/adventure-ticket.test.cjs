const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const presentation = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/screens/ExploreScreen/adventureTicketPresentation.ts', 'utf8'),
 { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: presentation, exports: presentation.exports });
const ride = { task_id: 1, asset_id: 13, ride_id: 8, ride_name: 'Space Ride', coin_url: '', park_id: 1 };
const ticket = (phase = 'discover') => ({ id: 7, park_id: 1, park_day: '2026-09-29', ride, ride_choices: [ride],
 phase, discover: phase === 'discover' ? null : { ...ride, kind: 'coin_win' },
 play: ['celebrate','complete'].includes(phase) ? { ...ride, chapter_title: 'Lost Signal', route_name: 'Quiet stars' } : null });
const data = (phase = 'discover') => ({ rides: [ride, { ...ride, task_id: 2, ride_name: 'Pirate Ride' }], goal: ride,
 adventure_ticket: ticket(phase), wallet: { tickets_needed: 0 } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes;reject=no; });return {promise,resolve,reject}; };

test('closed-ride detours require a fresh, unique, same-park attraction report', () => {
 const now=Date.parse('2026-09-29T21:00:00Z'), live={fetched_at:'2026-09-29T20:59:00Z',rides:[{task_id:1,status:'DOWN'}]};
 assert.equal(presentation.exports.adventureRideClosed(ticket(),live,1,now),true);
 for(const change of [{fetched_at:null},{fetched_at:'invalid'},{fetched_at:'2026-09-29T20:50:00Z'},
 {fetched_at:'2026-09-29T22:00:00Z'},{rides:[...live.rides,...live.rides]},{rides:[{task_id:2,status:'DOWN'}]},
 {rides:[{task_id:1,status:'UNKNOWN'}]}]) assert.equal(presentation.exports.adventureRideClosed(ticket(),{...live,...change},1,now),false);
 assert.equal(presentation.exports.adventureRideClosed(ticket(),live,2,now),false);
 assert.equal(presentation.exports.adventureRideClosed(ticket('complete'),live,1,now),false);
 assert.equal(presentation.exports.adventurePrompt(ticket('celebrate'),true).action,'Unfold my souvenir');
});

const ui = { GameButton: 'GameButton', GameIcon: 'GameIcon', BRAND: new Proxy({}, { get: () => '#fff' }), SHADOW: { card: {} } };
function card(phase='discover', options={}) {
 const calls=[], work=deferred(), props={ticket:ticket(phase),data:data(phase),closed:false,stale:false,top:64,
 detours:[{ride:{...ride,task_id:2,ride_name:'Pirate Ride'},open:true,meters:120,wait:15}],
 onDiscover:()=>calls.push('discover'),onFindLine:()=>calls.push('line'),onPlay:async()=>calls.push('play'),onShelf:()=>calls.push('shelf'),
 onSelect:id=>{calls.push(id);return work.promise;},onDismiss:async()=>calls.push('dismiss'),onCelebrate:()=>{calls.push('celebrate');return work.promise;},
 onRefresh:async()=>calls.push('refresh'),...options};
 const app=runtime('src/screens/ExploreScreen/AdventureTicketCard.tsx',{
 './adventureTicketPresentation':presentation.exports,'../../hooks/useReducedGameMotion':{default:()=>options.reduced ?? true},
 '../../gamekit/SFX':{playSfx:()=>calls.push('sound')},'../../gamekit/Haptics':{haptic:()=>calls.push('haptic')},
 'react-native-modal':{default:'TicketModal'},'../../ui':ui,
 },props);
 const button=label=>app.find(n=>n.props?.accessibilityLabel===label);
 const modal=()=>app.find(n=>n.type==='TicketModal');
 app.find(n=>n.props?.accessibilityLabel?.startsWith('Open Adventure Ticket')).props.onPress();app.render();
 return {app,calls:calls.filter(c=>c!=='haptic'),raw:calls,work,button,modal,get calls(){return calls.filter(c=>c!=='haptic');}};
}
test('ticket hands off only after its native sheet closes, and reduced motion stays still',async()=>{
 const p=card();assert.equal(p.modal().props.animationInTiming,0);
 p.button('Find this coin').props.onPress();p.app.render();assert.equal(p.modal().props.isVisible,false);assert.deepEqual(p.calls,[]);
 p.modal().props.onModalHide();p.modal().props.onModalHide();assert.deepEqual(p.calls,['discover']);
 const q=card('complete');q.button('Visit my coin').props.onPress();q.app.unmount();q.modal().props.onModalHide();assert.deepEqual(q.calls,[]);
});
test('full motion: the sheet slides in and out with real timings',()=>{
 const p=card('discover',{reduced:false});assert.equal(p.modal().props.animationInTiming,280);assert.equal(p.modal().props.animationOutTiming,200);
});
test('celebration double taps submit once, network failure preserves the readable ticket and retry',async()=>{
 const p=card('celebrate');p.button('Unfold my souvenir').props.onPress();p.button('Unfold my souvenir').props.onPress();p.app.render();
 assert.deepEqual(p.calls,['celebrate']);p.work.reject(new Error('offline'));await p.app.settle();
 assert.equal(p.modal().props.isVisible,true);assert.equal(p.button('Unfold my souvenir').props.disabled,false);
 const alert=p.app.find(n=>n.props?.accessibilityRole==='alert');assert.match(alert.props.children,/Reconnect/);assert.deepEqual(p.calls,['celebrate']);
});
test('a 422 shows the server reason instead of "Reconnect"',async()=>{
 const p=card('play',{closed:true});p.button('Choose another ride').props.onPress();p.app.render();
 p.button('Continue adventure at Pirate Ride').props.onPress();
 p.work.reject({response:{status:422,data:{message:'The given data was invalid.',errors:{task_id:['Adventures run at rides with a queue. Pick an attraction instead.']}}}});
 await p.app.settle();
 assert.equal(p.app.find(n=>n.props?.accessibilityRole==='alert').props.children,'Adventures run at rides with a queue. Pick an attraction instead.');
});
test('ride substitution is explicit, adventure-only, and retains the same visible stamps during saving',async()=>{
 const p=card('play',{closed:true});p.button('Choose another ride').props.onPress();p.app.render();
 p.button('Continue adventure at Pirate Ride').props.onPress();p.button('Continue adventure at Pirate Ride').props.onPress();p.app.render();
 assert.deepEqual(p.calls,[2]);p.work.resolve({...data('play'), adventure_ticket:{...ticket('play'),ride:{...ride,task_id:2}}});await p.app.settle();
 assert.equal(p.modal().props.isVisible,true);
});
test('far from the queue, Play becomes "Show me the line"; near it plays',()=>{
 const far=card('play',{gate:{state:'far',meters:340}});
 assert.ok(far.button('Show me the line'));far.button('Show me the line').props.onPress();far.modal().props.onModalHide();
 assert.deepEqual(far.calls,['line']);
 const near=card('play',{gate:{state:'near',meters:8}});near.button('Play the queue adventure').props.onPress();near.modal().props.onModalHide();
 assert.deepEqual(near.calls,['play']);
});
test('tuck away dismisses the ticket for the day',async()=>{
 const p=card('discover');p.button('Tuck the Adventure Ticket away for today').props.onPress();await p.app.settle();
 assert.deepEqual(p.calls,['dismiss']);assert.equal(p.modal().props.isVisible,false);
});
test('a finished ticket collapses to the souvenir stub in the same slot',()=>{
 const p=card('complete');const chip=p.app.find(n=>n.props?.accessibilityLabel?.startsWith('Open Adventure Ticket'));
 assert.equal(chip.props.style.width,56);
});

test('Punch: full motion winds up and springs a new stamp; reduced motion snaps',()=>{
 const imports={'../../gamekit/SFX':{playSfx(){}},'../../gamekit/Haptics':{haptic(){}},'../../ui':ui,'./adventureTicketPresentation':presentation.exports,'react-native-modal':{default:'M'}};
 const full=runtime('src/screens/ExploreScreen/AdventureTicketCard.tsx',imports,{earned:false,number:1,reduced:false},{},{exportName:'Punch'});
 full.change({earned:true});assert.deepEqual(full.motions.slice(0,3),['timing','timing','spring']);
 const still=runtime('src/screens/ExploreScreen/AdventureTicketCard.tsx',imports,{earned:false,number:1,reduced:true},{},{exportName:'Punch'});
 still.change({earned:true});assert.deepEqual(still.motions,[]);
});
test('StampDot: haptic and sound land on the impact frame, then the moment is marked seen',()=>{
 const hits=[];const imports={'../../gamekit/SFX':{playSfx:n=>hits.push(n)},'../../gamekit/Haptics':{haptic:n=>hits.push(n)},'../../ui':ui,'./adventureTicketPresentation':presentation.exports,'react-native-modal':{default:'M'}};
 let done=0;const dot=runtime('src/screens/ExploreScreen/AdventureTicketCard.tsx',imports,{earned:true,slam:true,reduced:false,coin:1,onDone:()=>done++},{},{exportName:'StampDot'});
 assert.deepEqual(hits,[]);const [impact,finish]=[...dot.timers.values()];impact();assert.deepEqual(hits,['success','coin']);finish();assert.equal(done,1);
});
test('presentation: gate, detour ranking, new stamps and shelf hand-off',()=>{
 const p=presentation.exports, t={...ticket('play'),ride:{...ride,lat:34.1381,lng:-118.3534,radius:40}};
 assert.equal(p.adventurePlayGate(t,{latitude:34.1381,longitude:-118.3534}).state,'near');
 assert.equal(p.adventurePlayGate(t,{latitude:34.1420,longitude:-118.3534}).state,'far');
 assert.equal(p.adventurePlayGate(ticket('play'),{latitude:1,longitude:1}).state,'unknown');
 assert.equal(p.adventurePrompt({...t,play_hint:'get_in_line'},false,{state:'near',meters:5}).title,'Get in line at Space Ride');
 assert.doesNotMatch(p.adventurePrompt(t).detail,/pause/i,'the line always moves: no pause promise');
 const r=(id,name,extra={})=>({...ride,task_id:id,ride_id:id,ride_name:name,...extra});
 const rides=[r(1,'Current'),r(2,'Far open'),r(3,'Near open'),r(4,'Down'),r(5,'Near closed status unknown'),r(6,'Restaurant',{adventure_ready:false}),r(7,'Other park',{park_id:9}),r(8,'Near long wait')];
 const live=new Map([[2,{status:'OPERATING',wait:10}],[3,{status:'OPERATING',wait:30}],[4,{status:'DOWN',wait:null}],[8,{status:'OPERATING',wait:60}]]);
 const coords=new Map([[2,{latitude:34.15,longitude:-118.35}],[3,{latitude:34.1382,longitude:-118.3534}],[5,{latitude:34.1381,longitude:-118.3534}],[8,{latitude:34.1382,longitude:-118.3534}]]);
 const picks=p.rankDetours(rides,{parkId:1,currentTaskId:1,live,coords,location:{latitude:34.1381,longitude:-118.3534}});
 assert.deepEqual(picks.map(x=>x.ride.ride_name),['Near open','Near long wait','Far open']);
 assert.deepEqual([...p.newlyEarnedStamps([true,false,false],[true,true,false])],[1]);
 assert.deepEqual([...p.newlyEarnedStamps(null,[true,true,false])],[]);
 assert.equal(p.adventureShelfArrival({...ticket('complete'),discover:{...ride,kind:'coin_win',attempt_id:44}}).attemptId,44);
 assert.equal(p.adventureShelfArrival({...ticket('complete'),discover:{...ride,kind:'owned_coin'}}),null);
});

function hook() {
 const auth={value:{player:{id:5}}}, reads=[],writes=[];
 const api={getTripGoal:()=>{const d=deferred();reads.push(d);return d.promise;},
 setTripGoal:id=>{const d=deferred();writes.push({id,...d});return d.promise;}};
 const app=runtime('src/hooks/useTripGoal.ts',{'../context/AuthProvider':{AuthContext:auth},'../api/endpoints/me/trip-goal':api},
 {version:0},{},{arguments:props=>[props.version,true]});
 return {app,auth,reads,writes};
}
test('goal reads cannot overwrite choices or leak across signed-in players',async()=>{
 const h=hook();h.reads[0].resolve(data());await h.app.settle();
 const refresh=h.app.tree.refresh(), write=h.app.tree.choose(2);h.writes[0].resolve({...data(),goal:{...ride,task_id:2}});await write;await h.app.settle();
 h.reads[1].resolve(data());await refresh;await h.app.settle();assert.equal(h.app.tree.data.goal.task_id,2);
 h.app.tree.refresh();h.auth.value={player:{id:8}};h.app.change({version:1});assert.equal(h.app.tree.data,null);
 h.reads[2].resolve(data());await h.app.settle();assert.equal(h.app.tree.data,null);
 h.reads[3].resolve({...data(),goal:{...ride,task_id:8}});await h.app.settle();assert.equal(h.app.tree.data.goal.task_id,8);
});
test('refresh deferred during a previous player’s mutation resumes for the current player',async()=>{
 const h=hook();h.reads[0].resolve(data());await h.app.settle();
 const write=h.app.tree.choose(2);h.auth.value={player:{id:8}};h.app.change({version:1});assert.equal(h.reads.length,1);
 h.writes[0].resolve(data());await write;await h.app.settle();assert.equal(h.app.tree.data,null);assert.equal(h.reads.length,2);
 h.reads[1].resolve({...data(),goal:{...ride,task_id:8}});await h.app.settle();assert.equal(h.app.tree.data.goal.task_id,8);
});
test('folded chip lines fit the 43% slot', () => {
 const p = presentation.exports;
 for (const phase of ['discover','play','celebrate','complete']) for (const closed of [false,true]) for (const gate of [{state:'near',meters:5},{state:'far',meters:300}]) {
  const prompt = p.adventurePrompt({...ticket(phase),play_hint:null}, closed, gate);
  assert.ok(prompt.chip.length <= 20, prompt.chip);
 }
});
