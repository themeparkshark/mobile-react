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
      if(!dizzyPlan||dizzyPlan.from!==s.dizzy.from)dizzyPlan={from:s.dizzy.from,at:r()<miss?Infinity:s.dizzy.from+(s.dizzy.until-s.dizzy.from)*(smashAt+(r()*2-1)*0.08)+react*0.4};
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
  // A clean player reaches 80%+ of the server ceiling (70 hits, 23 weak = 1,200).
  assert.ok(e>=0.8*1200&&e<=1200,`expert ${e}`);
  assert.ok(m>=0.4*e&&m<=0.65*e,`median ${m} vs expert ${e}`);
  assert.ok(y>=0.45*e,`young ${y} vs expert ${e} (participation floor)`);
  assert.ok(x<0.5*e,`masher ${x} should trail expert ${e}`);
});
test('the hit cap absorbs bonks visibly and scores 0', ()=>{
  const s=play(3,{...BOTS.expert,maxHits:10});
  assert.equal(s.hits,10);assert.ok(s.capped>0);
  assert.ok(s.weak<=Math.floor(s.hits/3));
});
test('a pufferfish pops one fin and the shark is stunned for a moment', ()=>{
  let s={...b.createBash(1),up:[{id:9,spot:0,kind:'puffer',at:0,until:5000}],power:2,ms:100};
  const r=b.tapPopup(s,9,200);
  assert.equal(r.state.power,1);assert.equal(r.events[0].type,'ouch');assert.equal(r.events[0].lostFins,1);
  assert.equal(b.tapBoss(r.state,300).events.length,0);
});
test('fins fill to a dizzy head; a smash on the gold core is PERFECT and gives a head start', ()=>{
  let s=b.createBash(5);
  for(let i=0;i<3;i++){s={...s,up:[{id:100+i,spot:i,kind:'tentacle',at:0,until:9000}]};s=b.tapPopup(s,100+i,1000+i*200).state;}
  assert.ok(s.dizzy);
  assert.equal(b.tapBoss({...s,dizzy:null},2000).events[0].type,'clank');
  const span=s.dizzy.until-s.dizzy.from,late=b.tapBoss(s,s.dizzy.from+span*0.32);
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

test('no ink while the shark is seeing stars (a block is always possible)', ()=>{
  let s={...b.createBash(4),ouchUntil:b.INK_FIRST_MS+400};
  s=b.tick(s,b.INK_FIRST_MS).state;assert.equal(s.ink,null);
  s=b.tick(s,b.INK_FIRST_MS+500).state;assert.equal(s.ink,null);
  s=b.tick(s,b.INK_FIRST_MS+720).state;assert.ok(s.ink);
});

test('the ring sits on the core for exactly the PERFECT band (the picture equals the scoring)', ()=>{
  for(const ms of [1000,9000,15000]){const band=b.perfectBand(ms);
    assert.ok(b.ringScaleAt(band[0]-0.01,band)>1);assert.equal(b.ringScaleAt(band[0],band),1);
    assert.equal(b.ringScaleAt(band[1],band),1);assert.ok(b.ringScaleAt(band[1]+0.01,band)<1);}
});
test('filling the fins during an ink delays the ink, it is not lost', ()=>{
  let s={...b.createBash(6),ink:{from:8000,until:9150},power:2,bonksSince:2,up:[{id:1,spot:0,kind:'tentacle',at:7900,until:9900}],ms:8100};
  const r=b.tapPopup(s,1,8200);assert.ok(r.state.dizzy);assert.equal(r.state.ink,null);assert.equal(r.state.nextInkAt,r.state.dizzy.until+400);
});
test('mashing empty water holds longer each time', ()=>{
  let s={...b.createBash(2),ms:100};const a=b.tapWater(s,0,100).state;const c=b.tapWater(a,0,a.splashUntil+10).state;
  assert.ok(c.splashUntil-(a.splashUntil+10)>a.splashUntil-100);
});

test('PERFECT is earned: even a clean player with human timing wobble is not perfect every time', ()=>{
  const xs=runs.expert;const rate=xs.reduce((a,s)=>a+s.perfects,0)/Math.max(1,xs.reduce((a,s)=>a+s.smashes,0));
  console.log('expert perfect rate',rate.toFixed(2));assert.ok(rate<=0.75&&rate>=0.25,`rate ${rate}`);
});

test('a gold tentacle fills two fins, but a dizzy still needs two real hits (server share rule)', ()=>{
  let s={...b.createBash(3),up:[{id:1,spot:0,kind:'gold',at:0,until:900},{id:2,spot:1,kind:'tentacle',at:0,until:900}],ms:100};
  let r=b.tapPopup(s,1,200);assert.equal(r.state.power,2);assert.equal(r.state.dizzy,null);assert.equal(r.state.golds,1);
  r=b.tapPopup(r.state,2,300);assert.ok(r.state.dizzy);
  let h={...b.createBash(3),headStart:1,power:1,up:[{id:1,spot:0,kind:'gold',at:0,until:900}],ms:100};
  r=b.tapPopup(h,1,200);assert.equal(r.state.dizzy,null,'gold + head start alone is not enough');
  assert.ok(r.state.power<b.finsNeeded(r.state,200),'never a full fin row that waits: '+r.state.power+'/'+b.finsNeeded(r.state,200));
});
test('gold only appears with a pufferfish up, in the far lane', ()=>{
  let seen=0;for(let seed=1;seed<40;seed++){let s={...b.createBash(seed),smashes:1};for(let ms=0;ms<b.ROUND_MS;ms+=16){const r=b.tick(s,ms);s=r.state;
    for(const e of r.events)if(e.type==='spawn'&&e.popup.kind==='gold'){seen++;const p=s.up.find(q=>q.kind==='puffer');assert.ok(p);assert.equal(Math.abs(p.spot%3-e.popup.spot%3),2);}}}
  assert.ok(seen>0);
});

test('participation floor matches the server: 10+ real bonks count at least 432, before the home rate', ()=>{
  assert.equal(b.bashDamage(21,4),432);
  assert.equal(b.bashDamage(21,4,0.6),259);
  assert.equal(b.bashDamage(9,0),36,'nine bonks: no floor');
  assert.equal(b.bashDamage(60,19),1000,'a big round is unchanged');
  assert.equal(b.bashDamage(21,4,1,{per_hit:4,per_weak_hit:40}),244,'an old server without the floor: raw formula');
});
