const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
function recoveredWin() {
  const navigation = [];
  const attempt = { id: 10, task_id: 104, task_type: 'task', status: 'won', ticket_cost: 1,
    rewards: { coin_asset_id: 300, coin_times_collected: 1, coins_earned: 10, xp_earned: 25, energy_earned: 40, ride_parts_earned: 4 } };
  let view;
  view = runtime('src/components/RedeemRedeemableModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5, tickets: 7 }, refreshPlayer: async () => ({ energy: 160 }) } } },
    '../context/LocationProvider': { LocationContext: { value: { location: { latitude: 34, longitude: -118 } } } },
    '../context/CurrencyProvider': { CurrencyContext: { value: { currencies: [] } } },
    '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound() {} } } },
    '../context/CurrencyFlyProvider': { useCurrencyFly: () => ({ triggerFly() {} }) },
    '../services/task-attempt/checkpoint': { readTaskAttemptCheckpoint: async () => ({ attemptId: 10 }), removeTaskAttemptCheckpoint: async () => {} },
    '../services/task-attempt/recovery': { recoverTaskAttempt: async () => ({ attempt }) },
    '../api/endpoints/me/stamps': { getStamps: async () => ({ stamps: {}, newly_earned: [] }) },
    '../api/endpoints/me/ride-coins': { default: async () => ({ data: [] }) },
    '../RootNavigation': { navigate: (...args) => navigation.push(args) },
  }, { open: true, park: { id: 1 }, redeemable: { type: 'task', model: { id: 104, name: 'Forbidden Journey' } },
    close() { view.props.open = false; }, onPress() {} });
  return { view, navigation, game: () => view.find(node => node.type === 'react-native-modal'),
    rewards: () => view.find(node => node.type === './PostWinRewardsModal') };
}
test('confirmed rewards wait until the native challenge presentation has dismissed', async () => {
  const flow = recoveredWin(); await flow.view.settle();
  assert.equal(flow.game().props.isVisible, false);
  assert.equal(flow.rewards().props.visible, false);
  flow.game().props.onModalHide(); flow.view.render();
  assert.equal(flow.rewards().props.visible, true);
  assert.equal(flow.rewards().props.coinTimesCollected, 1);
  assert.equal(flow.rewards().props.rideName, 'Forbidden Journey');
});
test('earned coin navigation waits for reward dismissal and keeps its confirmed asset identity', async () => {
  const flow = recoveredWin(); await flow.view.settle(); flow.game().props.onModalHide(); flow.view.render();
  await flow.rewards().props.onViewCoin(); flow.view.render();
  assert.equal(flow.rewards().props.visible, false); assert.equal(flow.navigation.length, 0);
  flow.rewards().props.onHidden();
  assert.equal(flow.navigation[0][0], 'CoinShelf'); assert.equal(flow.navigation[0][1].focusCoin.assetId, 300);
  flow.rewards().props.onHidden(); assert.equal(flow.navigation.length, 1);
});
test('skipping a catch before the accessibility promise resolves cannot start late effects', async () => {
  let done = 0; const catchView = runtime('src/components/CoinCatchReveal.tsx', {}, { rideName: 'Forbidden Journey', isNewCoin: true, onDone() { done++; } });
  catchView.tree.props.onPress(); await catchView.settle();
  assert.equal(done, 1); assert.equal(catchView.timers.size, 0); assert.equal(catchView.sounds.length, 0);
  catchView.tree.props.onPress(); assert.equal(done, 1);
});
test('changing to reduced motion stops the active catch without replaying its success', async () => {
  let bursts = 0; const catchView = runtime('src/components/CoinCatchReveal.tsx', {}, { rideName: 'Forbidden Journey', isNewCoin: true,
    onBurst() { bursts++; }, onDone() {} });
  await catchView.settle(); assert.ok(catchView.timers.size > 1);
  catchView.preference(true); assert.equal(catchView.timers.size, 1); assert.equal(bursts, 1);
  catchView.preference(true); assert.equal(bursts, 1);
  catchView.unmount(); assert.equal(catchView.timers.size, 0); assert.ok(catchView.cancelled.length >= 11);
});
function rewardView(reducedMotion) {
  return runtime('src/components/PostWinRewardsModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: null } } },
    '../hooks/useReducedGameMotion': { default: () => reducedMotion },
  }, { visible: true, rideName: 'Forbidden Journey', coinTimesCollected: 1, coinsEarned: 10, xpEarned: 25, ridePartsEarned: 4, energyEarned: 40, onClose() {} });
}
test('reduced-motion reward summary settles immediately and leaves its primary action visible', () => {
  const rewards = rewardView(true); rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  assert.equal(rewards.animations.filter(anim => anim.started).length, 0);
  const footer = rewards.find(node => node.type === 'AnimatedView' && node.props.style?.[1]?.paddingBottom !== undefined);
  assert.equal(footer.props.style[1].opacity.value, 1);
  assert.equal(rewards.find(node => node.type === './YellowButton').props.text, 'Continue Park');
});
test('closing reward summary stops every started animation and unmounts the catch', () => {
  const rewards = rewardView(false); rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  const active = rewards.animations.filter(anim => anim.started); assert.ok(active.length > 0);
  rewards.change({ visible: false }); assert.ok(active.every(anim => anim.stopped));
  assert.equal(rewards.find(node => node.type === './CoinCatchReveal'), undefined);
});
function coinUpgrade({ success = false, reduced = true } = {}) {
  let calls = 0, resolve;
  const request = new Promise(done => { resolve = done; });
  const view = runtime('src/components/CoinLevelingModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { refreshPlayer: async () => {} } } },
    '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound() {} } } },
    '../hooks/useReducedGameMotion': { default: () => reduced },
    '../helpers/haptics': { impactAsync() {}, notificationAsync() {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
  }, { visible: true, rideCoin: { id: 13, ride_name: 'Forbidden Journey', current_level: 1, max_level: 5,
    is_unlocked: true, parts_to_next_level: 2, energy_to_next_level: 10, next_level_perks: [], current_perks: [] },
    playerEnergy: 160, playerParts: 4, onClose() {}, onLevelUp() { calls++; return request; } });
  const power = () => view.find(node => node.type === './YellowButton' && node.props.text === 'Power Up!');
  return { view, power, get calls() { return calls; }, confirm() { resolve(success); } };
}
test('coin upgrade coalesces rapid taps and exposes a retry after an unconfirmed result', async () => {
  const upgrade = coinUpgrade(); const press = upgrade.power().props.onPress;
  const first = press(); press(); assert.equal(upgrade.calls, 1);
  upgrade.confirm(); await first; upgrade.view.render();
  assert.ok(upgrade.view.find(node => node.props?.accessibilityRole === 'alert'));
  assert.ok(upgrade.power());
  await upgrade.power().props.onPress(); assert.equal(upgrade.calls, 2);
});
test('a reduced-motion confirmed upgrade settles without starting celebration effects', async () => {
  const upgrade = coinUpgrade({ success: true }); const pending = upgrade.power().props.onPress;
  const first = pending(); upgrade.confirm(); await first; upgrade.view.render();
  assert.ok(upgrade.view.find(node => node.type === './YellowButton' && node.props.text === 'Awesome!'));
  assert.equal(upgrade.view.find(node => node.props?.accessibilityRole === 'alert'), undefined);
  assert.equal(upgrade.view.animations.filter(anim => anim.started).length, 0);
});
test('a lost park-shelf upgrade response reads back the confirmed level before offering another spend', async () => {
  const before = { id: 13, current_level: 1, ride_name: 'Forbidden Journey' };
  let reads = 0, spends = 0;
  const view = runtime('src/components/TaskCoinModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { energy: 160 }, refreshPlayer: async () => {} } } },
    '../helpers/haptics': { impactAsync() {}, ImpactFeedbackStyle: {} },
    '../api/endpoints/me/ride-coins': { default: async () => ({ data: [++reads === 1 ? before : { ...before, current_level: 2 }] }) },
    '../api/endpoints/me/ride-coins/level-up': { default: async () => { spends++; throw new Error('Lost response'); } },
  }, { task: { id: 104, asset_id: 13, name: 'Forbidden Journey' } });
  await view.find(node => node.type === '../components/Button').props.onPress(); view.render();
  const modal = view.find(node => node.type === './CoinLevelingModal');
  assert.equal(await modal.props.onLevelUp(13), true);
  assert.equal(spends, 1); assert.equal(reads, 2);
});


test('first souvenir keeps confirmed payouts in a toggleable receipt and chooses collection before upgrading', () => {
  const rewards = rewardView(true); rewards.change({ onViewCoin() {}, coinProgress: {
    current_level:1,max_level:5,is_unlocked:true,parts_to_next_level:2,available_parts:4,energy_to_next_level:10 }, playerEnergy:40 });
  rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  const receipt = () => rewards.find(node => node.props?.accessibilityLabel?.startsWith('Reward receipt.'));
  assert.equal(receipt().props.accessibilityState.expanded,false);
  assert.equal(rewards.find(node => node.props?.children === 'Shark Coins'),undefined);
  assert.equal(rewards.find(node => node.type === './YellowButton').props.text,'See Your Coin');
  receipt().props.onPress(); rewards.render(); assert.equal(receipt().props.accessibilityState.expanded,true);
  assert.ok(rewards.find(node => node.props?.children === 'Shark Coins'));
  assert.ok(rewards.find(node => node.type === 'Text' && Array.isArray(node.props.children) && node.props.children.join('') === '+10'));
  receipt().props.onPress(); rewards.render(); assert.equal(rewards.find(node => node.props?.children === 'Shark Coins'),undefined);
  rewards.change({ visible:false }); rewards.change({ visible:true });
  rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  assert.equal(receipt().props.accessibilityState.expanded,false);
});
test('a repeat coin uses a short once-only deposit and cancels pending feedback on skip', async () => {
  let done=0,bursts=0;
  const view=runtime('src/components/CoinCatchReveal.tsx',{}, {rideName:'Forbidden Journey',isNewCoin:false,
    onDone(){done++;},onBurst(){bursts++;}});
  await view.settle(); assert.equal(view.timers.size,2); // one feedback beat and a bounded completion fallback
  const burst=Array.from(view.timers.values())[0]; burst(); assert.equal(bursts,1);
  view.tree.props.onPress(); view.tree.props.onPress(); assert.equal(done,1);assert.equal(view.timers.size,0);
  assert.equal(view.sounds.filter(sound=>sound==='tick').length,0);
});
test('a challenge with no confirmed ride coin skips the coin catch and exposes its receipt', () => {
  const view=rewardView(true); view.change({coinTimesCollected:null});
  assert.equal(view.find(node=>node.type==='./CoinCatchReveal'),undefined);
  assert.ok(view.find(node=>node.props?.children==='Shark Coins'));
  assert.equal(view.find(node=>node.type==='./YellowButton').props.text,'Continue Park');
});


test('receipt navigation waits for native dismissal and fires only once', () => {
  const navigated=[]; let closes=0;
  const view=runtime('src/components/PostWinRewardsModal.tsx', {
    '../context/AuthProvider': {AuthContext:{value:{player:null}}},
    '../hooks/useReducedGameMotion':{default:()=>true},
    '../RootNavigation':{navigate:(...args)=>navigated.push(args)},
  }, {visible:true,rideName:'Space Mountain',coinTimesCollected:1,coinsEarned:10,xpEarned:25,
    ridePartsEarned:1,energyEarned:10,onClose(){closes++;}});
  view.find(n=>n.type==='./CoinCatchReveal').props.onDone();view.render();
  view.find(n=>n.props?.accessibilityLabel?.startsWith('Reward receipt.')).props.onPress();view.render();
  view.find(n=>n.props?.accessibilityLabel?.startsWith('VIP would')).props.onPress();
  assert.equal(closes,1);assert.deepEqual(navigated,[]);assert.equal(view.timers.size,0);
  view.tree.props.onModalHide();view.tree.props.onModalHide();assert.deepEqual(navigated,[['Membership']]);
});
test('repeat summary settles without long hero loops and still offers an earned upgrade', () => {
  const view=rewardView(false);view.change({coinTimesCollected:9,onViewCoin(){},playerEnergy:40,
    coinProgress:{current_level:1,max_level:5,is_unlocked:true,available_parts:4,parts_to_next_level:2,energy_to_next_level:10}});
  view.find(n=>n.type==='./CoinCatchReveal').props.onDone();view.render();
  assert.equal(view.animations.filter(a=>a.started).length,0);
  assert.equal(view.find(n=>n.type==='./YellowButton').props.text,'Upgrade Your Coin');
});
