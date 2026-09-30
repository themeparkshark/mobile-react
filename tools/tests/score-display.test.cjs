const assert=require('node:assert/strict'),test=require('node:test');
const {runtime}=require('./helpers/reward-hook-runtime.cjs');
const theme={GAME_COLORS:{blue:'blue',text:'white',gold:'gold'},COMBO_TIER_COLORS:{},SCORE_TWEEN_MS:150,
 JUICE:{popTo:1.2,settleSpring:{},popSpring:{}}};
test('a new zero-score round settles immediately and cancels the previous number tween',()=>{
 const view=runtime('src/gamekit/ScoreDisplay.tsx',{'./theme':theme},{score:50});
 view.change({score:60});const before=view.motions.length;
 view.change({score:0});assert.equal(view.motions.length,before);
 assert.ok(view.find(n=>n.type==='Text'&&n.props.children==='0'));assert.ok(view.cancelled.length>=2);
});
test('a queued UI-thread sample from the previous round cannot restore its old score',()=>{
 const view=runtime('src/gamekit/ScoreDisplay.tsx',{'./theme':theme},{score:50});
 const queued=view.jsCalls[0];view.change({score:0});
 queued.fn(48,...queued.args.slice(1));view.render();
 assert.ok(view.find(n=>n.type==='Text'&&n.props.children==='0'));
 assert.equal(view.find(n=>n.type==='Text'&&n.props.children==='48'),undefined);
 view.change({score:50});queued.fn(48,...queued.args.slice(1));view.render();
 assert.ok(view.find(n=>n.type==='Text'&&n.props.children==='50'));
});
test('reduced-motion scoring and a personal best are immediately readable without badge, punch or number animation',()=>{
 const view=runtime('src/gamekit/ScoreDisplay.tsx',{'./theme':theme},{score:0,reducedMotion:true,personalBest:20});
 view.change({score:30,multiplier:3});assert.equal(view.motions.length,0);
 assert.ok(view.find(n=>n.type==='Text'&&n.props.children==='30'));
 view.change({score:0});assert.ok(view.find(n=>n.type==='Text'&&n.props.children==='0'));
 view.unmount();assert.ok(view.cancelled.length>=4);
});
