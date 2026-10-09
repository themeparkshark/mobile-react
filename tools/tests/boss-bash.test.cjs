// Boss Bash (src/games/boss/bash/rules.ts): server proof invariants and the balance targets.
const assert=require('node:assert/strict'),test=require('node:test');
const b=require('./helpers/boss-bash.cjs');
function rng(seed){return()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};}

/** A bot: reacts after `react` ms (+-jitter), sometimes hesitates, taps puffers by mistake, smashes at `smashAt` of the ring. */
function play(seed,{react,jitter=120,slip=0,puffer=0,smashAt=0.3,miss=0,block=0,mash=0,maxHits=70,step=16}){
  const r=rng(seed+7);let s=b.createBash(seed);const plan=new Map();let dizzyPlan=null,inkPlan=null;
  for(let ms=0;ms<b.ROUND_MS;ms+=step){
    s=b.tick(s,ms).state;
    if(mash&&!s.dizzy&&r()<mash)s=b.tapWater(s,Math.floor(r()*3),ms).state;
    if(s.ink){if(!inkPlan||inkPlan.from!==s.ink.from)inkPlan={from:s.ink.from,at:r()<block?s.ink.from+react*1.3:Infinity};
      if(ms>=inkPlan.at){s=b.tapBoss(s,ms,maxHits).state;continue;}}
    for(const p of s.up){
      if(!plan.has(p.id)){
        const skip=p.kind==='puffer'?r()>=puffer:r()<slip;
        plan.set(p.id,skip?Infinity:p.at+react+(r()*2-1)*jitter);
      }
      if(ms>=plan.get(p.id)){s=b.tapPopup(s,p.id,ms,maxHits).state;break;}
    }
    if(s.dizzy){
      if(!dizzyPlan||dizzyPlan.from!==s.dizzy.from)dizzyPlan={from:s.dizzy.from,at:r()<miss?Infinity:s.dizzy.from+(s.dizzy.until-s.dizzy.from)*smashAt+react*0.4};
      if(ms>=dizzyPlan.at)s=b.tapBoss(s,ms,maxHits).state;
    }
  }
  return s;
}
const median=a=>{const x=[...a].sort((p,q)=>p-q);return x[Math.floor(x.length/2)];};
const BOTS={
  expert:{react:260,jitter:60,slip:0,puffer:0,smashAt:0.28,miss:0,block:0.9},
  median:{react:520,jitter:160,slip:0.1,puffer:0.3,smashAt:0.4,miss:0.1,block:0.4},
  young:{react:800,jitter:250,slip:0.25,puffer:0.5,smashAt:0.55,miss:0.2,block:0.1},
  masher:{react:300,jitter:200,slip:0,puffer:1,smashAt:0.1,miss:0,block:0.5,mash:0.25},
};
const runs=Object.fromEntries(Object.entries(BOTS).map(([k,cfg])=>[k,Array.from({length:40},(_,i)=>play(i+1,cfg))]));
const dmg=k=>runs[k].map(s=>b.bashScore(s));

test('every round passes the server proof rules', ()=>{
  for(const k of Object.keys(runs))for(const s of runs[k]){
    assert.ok(s.hits<=70,`${k} hits ${s.hits}`);
    assert.ok(s.weak<=Math.floor(s.hits/3),`${k} weak ${s.weak} of ${s.hits}`);
    assert.ok(s.hits<=Math.floor(b.ROUND_MS/1000*4));
  }
});
test('balance: beginners matter, skill pays, mashing puffers does not', ()=>{
  const e=median(dmg('expert')),m=median(dmg('median')),y=median(dmg('young')),x=median(dmg('masher'));
  console.log('median damage',{expert:e,median:m,young:y,masher:x});
  assert.ok(e>=740&&e<=1150,`expert ${e}`);
  assert.ok(m>=360&&m<=650,`median ${m}`);
  assert.ok(y>=0.25*e,`young ${y} vs expert ${e}`);
  assert.ok(x<0.75*e,`masher ${x} should trail expert ${e}`);
});
test('the hit cap absorbs bonks visibly and scores 0', ()=>{
  const s=play(3,{...BOTS.expert,maxHits:10});
  assert.equal(s.hits,10);assert.ok(s.capped>0);
  assert.ok(s.weak<=Math.floor(s.hits/3));
});
test('a pufferfish pops every fin and the shark is stunned for a moment', ()=>{
  let s={...b.createBash(1),up:[{id:9,spot:0,kind:'puffer',at:0,until:5000}],power:2,ms:100};
  const r=b.tapPopup(s,9,200);
  assert.equal(r.state.power,0);assert.equal(r.events[0].type,'ouch');assert.equal(r.events[0].lostFins,2);
  assert.equal(b.tapBoss(r.state,300).events.length,0);
});
test('fins fill to a dizzy head; a smash on the gold core is PERFECT and gives a head start', ()=>{
  let s=b.createBash(5);
  for(let i=0;i<3;i++){s={...s,up:[{id:100+i,spot:i,kind:'tentacle',at:0,until:9000}]};s=b.tapPopup(s,100+i,1000+i*200).state;}
  assert.ok(s.dizzy);
  assert.equal(b.tapBoss({...s,dizzy:null},2000).events[0].type,'clank');
  const span=s.dizzy.until-s.dizzy.from,late=b.tapBoss(s,s.dizzy.from+span*0.4);
  assert.equal(b.tapBoss(s,s.dizzy.until-50).events[0].perfect,false);assert.equal(b.tapBoss(s,s.dizzy.from+10).events[0].perfect,false);
  assert.equal(late.events[0].type,'smash');assert.equal(late.events[0].perfect,true);assert.equal(late.events[0].weak,true);
  assert.equal(late.events[0].damage,44);assert.equal(late.state.power,1);assert.equal(late.state.headStart,1);
  assert.equal(b.finsNeeded(late.state,3000),3);assert.equal(b.finsNeeded({headStart:0},15000),2);
});
test('stars use full-power damage', ()=>{
  assert.equal(b.bashStars({hits:0,weak:0}),0);
  assert.equal(b.bashStars({hits:40,weak:12}),2);assert.equal(b.bashStars({hits:50,weak:15}),3);
  assert.equal(b.bashDamage(40,12,0.6),Math.floor((160+480)*0.6));
});

test('ink: a puff you can block (a hit and a fin), or you get inked and lose a fin; the share rule holds', ()=>{
  let s=b.createBash(9);s=b.tick(s,b.INK_FIRST_MS).state;assert.ok(s.ink);
  const blocked=b.tapBoss(s,b.INK_FIRST_MS+300);assert.equal(blocked.events[0].type,'inkBlock');assert.equal(blocked.state.hits,1);assert.equal(blocked.state.power,1);
  const inked=b.tick({...s,power:2},s.ink.until+1);assert.ok(inked.events.some(e=>e.type==='inked'&&e.lostFins===1));assert.equal(inked.state.ink,null);assert.equal(inked.state.power,1);
});
test('a tap on empty water splashes and holds the next tap briefly', ()=>{
  let s={...b.createBash(2),up:[{id:5,spot:1,kind:'tentacle',at:0,until:9000}],ms:100};
  const w=b.tapWater(s,0,100);assert.equal(w.events[0].type,'splash');
  assert.equal(b.tapPopup(w.state,5,150).events.length,0);assert.equal(b.tapPopup(w.state,5,100+b.SPLASH_MS).events[0].type,'bonk');
});
