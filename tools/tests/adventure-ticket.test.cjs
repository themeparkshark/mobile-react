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

function card(phase='discover', options={}) {
 const calls=[], work=deferred(), props={ticket:ticket(phase),data:data(phase),closed:false,stale:false,top:64,
 onDiscover:()=>calls.push('discover'),onPlay:async()=>calls.push('play'),onShelf:()=>calls.push('shelf'),
 onChoose:id=>{calls.push(id);return work.promise;},onCelebrate:()=>{calls.push('celebrate');return work.promise;},
 onRefresh:async()=>calls.push('refresh'),...options};
 const app=runtime('src/screens/ExploreScreen/AdventureTicketCard.tsx',{
 './adventureTicketPresentation':presentation.exports,'../../hooks/useReducedGameMotion':{default:()=>true},
 '../../gamekit/SFX':{playSfx:()=>calls.push('sound')},'../../gamekit/Haptics':{haptic:()=>calls.push('haptic')},
 'react-native-modal':{default:'TicketModal'},
 },props);
 const button=label=>app.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label);
 const modal=()=>app.find(n=>n.type==='TicketModal');
 app.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Open Adventure Ticket')).props.onPress();app.render();
 return {app,calls,work,button,modal};
}
test('ticket hands off only after its native sheet closes, and reduced motion stays still',async()=>{
 const p=card();assert.equal(p.modal().props.animationInTiming,0);
 p.button('Find this coin').props.onPress();p.app.render();assert.equal(p.modal().props.isVisible,false);assert.deepEqual(p.calls,[]);
 p.modal().props.onModalHide();p.modal().props.onModalHide();assert.deepEqual(p.calls,['discover']);
 const q=card('complete');q.button('Visit my coin').props.onPress();q.app.unmount();q.modal().props.onModalHide();assert.deepEqual(q.calls,[]);
});
test('celebration double taps submit once, network failure preserves the readable ticket and retry',async()=>{
 const p=card('celebrate');p.button('Unfold my souvenir').props.onPress();p.button('Unfold my souvenir').props.onPress();p.app.render();
 assert.deepEqual(p.calls,['celebrate']);p.work.reject(new Error('offline'));await p.app.settle();
 assert.equal(p.modal().props.isVisible,true);assert.equal(p.button('Unfold my souvenir').props.disabled,false);
 assert.ok(p.app.find(n=>n.props.accessibilityRole==='alert'));assert.deepEqual(p.calls,['celebrate']);
});
test('ride substitution is explicit and retains the same visible stamps during saving',async()=>{
 const p=card('play',{closed:true});p.button('Choose another ride').props.onPress();p.app.render();
 p.button('Continue adventure at Pirate Ride').props.onPress();p.button('Continue adventure at Pirate Ride').props.onPress();p.app.render();
 assert.deepEqual(p.calls,[2]);p.work.resolve({...data('play'), adventure_ticket:{...ticket('play'),ride:{...ride,task_id:2}}});await p.app.settle();
 assert.equal(p.modal().props.isVisible,true);
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
