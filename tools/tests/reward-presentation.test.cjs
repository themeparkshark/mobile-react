const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
const challengeCopy = loadTs('src/components/rewards/challengeCopy.ts');
const postWinModel = loadTs('src/components/rewards/postWinModel.ts');
const coinTiers = loadTs('src/constants/coinTiers.ts');
// Progression v2 (S2): the pure coin model and the app-wide limiters the sheet now uses.
const progressionModel = loadTs('src/components/coin/progressionModel.ts');
const progressionStubs = {
  '../../modules/flash-safety': { isDimFlashingLightsEnabled: () => false },
  './coin/progressionModel': progressionModel,
  '../gamekit/Haptics': { queueHaptic() {} },
  '../audio/sfxLimiter': { playLimited: (_name, _request, play) => { play(); return true; }, SFX_PRIORITY: { whoosh: 1, tap: 2, land: 3 } },
  '../hooks/usePresentationQueue': { usePresentationSlot: () => ({ visible: false, done() {} }) },
};
function recoveredWin() {
  const navigation = [], prefetches = [], milestoneReads = [];
  const attempt = { id: 10, task_id: 104, task_type: 'task', status: 'won', ticket_cost: 1,
    rewards: { coin_asset_id: 300, coin_times_collected: 1, coins_earned: 10, xp_earned: 25, energy_earned: 40, ride_parts_earned: 4 } };
  let view;
  const standingsMarks = { count: 0 };
  view = runtime('src/components/RedeemRedeemableModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5, tickets: 7 }, refreshPlayer: async () => ({ energy: 160 }) } } },
    '../context/LocationProvider': { LocationContext: { value: { location: { latitude: 34, longitude: -118 } } } },
    '../context/CurrencyProvider': { CurrencyContext: { value: { currencies: [] } } },
    '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound() {} } } },
    '../context/CurrencyFlyProvider': { useCurrencyFly: () => ({ triggerFly() {} }) },
    '../services/task-attempt/checkpoint': { readTaskAttemptCheckpoint: async () => ({ attemptId: 10 }), removeTaskAttemptCheckpoint: async () => {} },
    '../services/task-attempt/recovery': { recoverTaskAttempt: async () => ({ attempt }) },
    '../api/endpoints/me/stamps': { getStamps: async () => ({ stamps: {}, newly_earned: [] }) },
    '../context/CoinCollection': { invalidateCoinCollection() {}, loadCoin: async () => null },
    '../services/collection/parkShelfPrefetch': { prefetchParkShelf: (...args) => prefetches.push(args) },
    '../api/endpoints/me/ride-coins/milestones': { default: async id => { milestoneReads.push(id);
      return { milestones: [{ type: 'first_park_coin', park_id: 1 }], progress: { park_id: 1, park_name: 'Test Park', before: 0, collected: 1, available: 26 }, next: { percent: 25, coins_needed: 6 } }; } },
    './rewards/challengeCopy': challengeCopy,
    '../RootNavigation': { navigate: (...args) => navigation.push(args) },
    '../services/collection/earnedShelf': require('./helpers/earned-shelf.cjs'),
    '../constants/coinTiers': coinTiers,
    '../screens/LeaderboardsScreen/standingsCache': { markStandingsStale: () => { standingsMarks.count++; } },
    ...progressionStubs,
  }, { open: true, park: { id: 1 }, redeemable: { type: 'task', model: { id: 104, name: 'Forbidden Journey' } },
    close() { view.props.open = false; }, onPress() {} });
  return { view, navigation, prefetches, milestoneReads, standingsMarks, game: () => view.find(node => node.type === 'react-native-modal'),
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
  assert.equal(flow.standingsMarks.count, 1, 'a confirmed win refreshes cached standings');
});
test('a first coin prefetches its park shelf and reads its collection milestones once', async () => {
  const flow = recoveredWin(); await flow.view.settle(); await flow.view.settle();
  assert.deepEqual(flow.prefetches, [[1, 5]]);
  assert.deepEqual(flow.milestoneReads, [10]);
  flow.game().props.onModalHide(); flow.view.render();
  assert.equal(flow.rewards().props.milestones.milestones[0].type, 'first_park_coin');
});
test('earned coin navigation waits for reward dismissal and keeps its confirmed asset identity', async () => {
  const flow = recoveredWin(); await flow.view.settle(); flow.game().props.onModalHide(); flow.view.render();
  await flow.rewards().props.onViewCoin(); flow.view.render();
  assert.equal(flow.rewards().props.visible, false); assert.equal(flow.navigation.length, 0);
  flow.rewards().props.onHidden();
  assert.equal(flow.navigation[0][0], 'Park');
  assert.equal(flow.navigation[0][1].park,1); assert.equal(flow.navigation[0][1].player,5);
  assert.equal(flow.navigation[0][1].earnedCoin.assetId,300); assert.equal(flow.navigation[0][1].earnedCoin.taskId,104);
  flow.rewards().props.onHidden(); assert.equal(flow.navigation.length, 1);
  assert.equal(flow.navigation[0][1].openMastery, undefined);
});
test('"Upgrade Your Coin" lands on the shelf and asks it to open mastery (one hop)', async () => {
  const flow = recoveredWin(); await flow.view.settle(); flow.game().props.onModalHide(); flow.view.render();
  await flow.rewards().props.onViewCoin(true); flow.view.render(); flow.rewards().props.onHidden();
  assert.equal(flow.navigation[0][0], 'Park'); assert.equal(flow.navigation[0][1].openMastery, true);
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
    './rewards/postWinModel': postWinModel, '../screens/LeaderboardsScreen/standingsCache': { takeWinNote: () => null, holdWinNotes: () => undefined },
  }, { visible: true, rideName: 'Forbidden Journey', coinTimesCollected: 1, coinsEarned: 10, xpEarned: 25, ridePartsEarned: 4, energyEarned: 40, onClose() {} });
}
test('reduced-motion reward summary settles immediately and leaves its primary action visible', () => {
  const rewards = rewardView(true); rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  assert.equal(rewards.motions.length, 0);
  assert.equal(rewards.find(node => node.type === './YellowButton').props.text, 'Continue Park');
  assert.equal(rewards.find(node => node.type === './CoinCatchReveal'), undefined);
});
test('the win footer sits on a solid plate so the tab bar compass never reads over Continue Park', () => {
  // QA P2-5: on "First coin here!" the bare "Continue Park" text sat over the
  // dimmed center compass tab and looked covered by it.
  const rewards = runtime('src/components/PostWinRewardsModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: null } } },
    '../hooks/useReducedGameMotion': { default: () => true },
    './rewards/postWinModel': postWinModel, '../screens/LeaderboardsScreen/standingsCache': { takeWinNote: () => null, holdWinNotes: () => undefined },
  }, { visible: true, rideName: 'Main Street, U.S.A.', taskCoinUrl: 'coin.png', coinTimesCollected: 1, coinsEarned: 10,
    xpEarned: 25, onViewCoin() {}, onClose() {} });
  rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  const footer = rewards.find(node => node.props?.testID === 'post-win-footer');
  const plate = Object.assign({}, ...[footer.props.style].flat(2).filter(Boolean));
  assert.match(plate.backgroundColor, /^#[0-9a-f]{6}$/i, 'opaque, not a see-through strip');
  assert.equal(plate.alignSelf, 'stretch', 'full width, over the whole tab bar');
  const link = (function find(node) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    if (node.props?.accessibilityLabel === 'Continue exploring the park') return node;
    return find(node.props?.children);
  })(footer);
  assert.ok(link, 'Continue Park lives inside the plate');
});
test('closing reward summary cancels its entrance clock and unmounts the catch', () => {
  const rewards = rewardView(false); rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  assert.ok(rewards.motions.length > 0);
  const before = rewards.cancelled.length;
  rewards.change({ visible: false }); assert.ok(rewards.cancelled.length > before);
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
    '../constants/coinTiers': coinTiers,
    ...progressionStubs,
  }, { visible: true, rideCoin: { id: 13, ride_name: 'Forbidden Journey', current_level: 1, max_level: 5,
    is_unlocked: true, parts_to_next_level: 2, energy_to_next_level: 10, next_level_perks: [], current_perks: [] },
    playerEnergy: 160, playerParts: 4, onClose() {}, onLevelUp() { calls++; return request; } });
  const power = () => view.find(node => node.type === './YellowButton' && node.props.text === 'Level Up!');
  return { view, power, get calls() { return calls; }, confirm() { resolve(success); } };
}
test('a coin that cannot power up offers its one next step, never a dead end', () => {
  const { missingResourceAction } = require('./helpers/ts-module.cjs').loadTs('src/components/CoinLevelingModal.tsx', {
    react: { useRef() {}, useState() {}, useEffect() {}, useContext() {} }, 'react/jsx-runtime': { jsx() {}, jsxs() {} },
    'react-native': { Dimensions: { get: () => ({ width: 390, height: 844 }) } }, 'expo-image': {}, 'react-native-modal': {},
    'lottie-react-native': {}, '../helpers/haptics': {}, '../config': {}, './HoloCoinPreview': {}, './Ribbon': {},
    './YellowButton': {}, './CoinUpgradeDemo': {}, '../context/AuthProvider': {}, '../context/SoundEffectProvider': {},
    '../hooks/useReducedGameMotion': {}, '../ui/GameIcon': {}, '../RootNavigation': {}, '../services/purchases': { storeAvailable: () => false },
    ...progressionStubs, './coin/CoinStand': {}, './coin/Crowning': {}, './coin/LevelUpBurst': {}, './coin/PerkTrack': {}, './help/OneTimeTip': {},
  });
  assert.equal(missingResourceAction(1, 40).label, 'Get 1 Ride Part');
  assert.equal(missingResourceAction(3, 0).label, 'Get 3 Ride Parts');
  assert.equal(missingResourceAction(0, 15).label, 'Find 15 Energy');
  assert.equal(missingResourceAction(0, 0), null);
});
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
  let reads = 0, spends = 0; const patched = [];
  const view = runtime('src/components/TaskCoinModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5, energy: 160 }, refreshPlayer: async () => {} } } },
    '../helpers/haptics': { impactAsync() {}, ImpactFeedbackStyle: {} },
    '../constants/coinTiers': coinTiers,
    '../context/CoinCollection': { loadCoin: async () => (++reads === 1 ? before : { ...before, current_level: 2 }),
      upsertCoin: (...args) => patched.push(args), setFeaturedCoin() {} },
    '../api/endpoints/me/ride-coins/level-up': { default: async () => { spends++; throw new Error('Lost response'); } },
  }, { task: { id: 104, asset_id: 13, name: 'Forbidden Journey' } });
  await view.find(node => node.type === '../components/Button').props.onPress(); view.render();
  const modal = view.find(node => node.type === './CoinLevelingModal');
  assert.equal(await modal.props.onLevelUp(13), true);
  assert.equal(spends, 1); assert.equal(reads, 2);
});
test('a task payload without asset_id still finds its coin through the coin image', async () => {
  const reads = [];
  const view = runtime('src/components/TaskCoinModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5, energy: 10 }, refreshPlayer: async () => {} } } },
    '../helpers/haptics': { impactAsync() {}, ImpactFeedbackStyle: {} },
    '../constants/coinTiers': coinTiers,
    '../context/CoinCollection': { loadCoinCollection: async () => [{ id: 31, coin_url: 'other' }, { id: 32, coin_url: 'coin-b' }],
      loadCoin: async (_player, id) => { reads.push(id); return { id, current_level: 2, ride_name: 'Old Payload' }; },
      upsertCoin() {}, setFeaturedCoin() {} },
  }, { task: { id: 104, name: 'Old Payload', coin_url: 'coin-b' } });
  await view.find(node => node.type === '../components/Button').props.onPress(); view.render();
  assert.deepEqual(reads, [32]);
  assert.equal(view.find(node => node.type === './CoinLevelingModal').props.visible, true);
});
test('the owner shelf shows each coin at its real level, never a blanket Level 1', () => {
  const view = runtime('src/components/TaskCoinModal.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5 }, refreshPlayer: async () => {} } } },
    '../helpers/haptics': { impactAsync() {}, ImpactFeedbackStyle: {} },
    '../constants/coinTiers': coinTiers,
    '../context/CoinCollection': { loadCoin: async () => null, upsertCoin() {}, setFeaturedCoin() {} },
  }, { task: { id: 104, asset_id: 13, name: 'Forbidden Journey', coin_url: 'coin' }, level: 3 });
  assert.equal(view.find(node => node.type === './collection/ShelfCoin').props.level, 3);
  view.change({ level: undefined, readOnly: true, task: { id: 104, asset_id: 13, name: 'Forbidden Journey', coin_url: 'coin', coin_level: 4 } });
  assert.equal(view.find(node => node.type === './collection/ShelfCoin').props.level, 4);
});


test('first souvenir shows every confirmed payout as a chip and chooses the shelf before upgrading', () => {
  let opened = null;
  const rewards = rewardView(true); rewards.change({ onViewCoin(open) { opened = open; }, coinProgress: {
    current_level:1,max_level:5,is_unlocked:true,parts_to_next_level:2,available_parts:4,energy_to_next_level:10 }, playerEnergy:40 });
  rewards.find(node => node.type === './CoinCatchReveal').props.onDone(); rewards.render();
  const chips = [];
  (function walk(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk);
    if (node.props?.label && typeof node.props.amount === 'number') chips.push([node.props.label, node.props.amount]); walk(node.props?.children); })(rewards.tree);
  assert.deepEqual(chips, [['Shark Coins', 10], ['XP', 25], ['Ride Parts', 4], ['Energy', 40]]);
  assert.equal(rewards.find(node => node.props?.accessibilityLabel?.startsWith('Reward receipt')), undefined);
  const button = rewards.find(node => node.type === './YellowButton');
  assert.equal(button.props.text, 'See It On Your Shelf');
  button.props.onPress(); assert.equal(opened, false);
});
test('a repeat coin uses a short once-only deposit and cancels pending feedback on skip', async () => {
  let done=0,bursts=0;
  const view=runtime('src/components/CoinCatchReveal.tsx',{}, {rideName:'Forbidden Journey',isNewCoin:false,
    onDone(){done++;},onBurst(){bursts++;}});
  await view.settle(); assert.equal(view.timers.size,3); // feedback beat, hand-off to the summary, bounded fallback
  const burst=Array.from(view.timers.values())[0]; burst(); assert.equal(bursts,1);
  view.tree.props.onPress(); view.tree.props.onPress(); assert.equal(done,1);assert.equal(view.timers.size,0);
  assert.equal(view.sounds.filter(sound=>sound==='tick').length,0);
});
test('a challenge with no confirmed ride coin skips the coin catch and exposes its receipt', () => {
  const view=rewardView(true); view.change({coinTimesCollected:null});
  assert.equal(view.find(node=>node.type==='./CoinCatchReveal'),undefined);
  assert.ok(view.find(node=>node.props?.label==='Shark Coins'&&node.props.amount===10));
  assert.equal(view.find(node=>node.type==='./YellowButton').props.text,'Continue Park');
});


test('receipt navigation waits for native dismissal and fires only once', () => {
  const navigated=[]; let closes=0;
  const view=runtime('src/components/PostWinRewardsModal.tsx', {
    '../context/AuthProvider': {AuthContext:{value:{player:null}}},
    '../hooks/useReducedGameMotion':{default:()=>true},
    '../RootNavigation':{navigate:(...args)=>navigated.push(args)},
    './rewards/postWinModel': postWinModel, '../screens/LeaderboardsScreen/standingsCache': { takeWinNote: () => null, holdWinNotes: () => undefined },
  }, {visible:true,rideName:'Space Mountain',coinTimesCollected:1,coinsEarned:10,xpEarned:25,
    ridePartsEarned:1,energyEarned:10,onClose(){closes++;}});
  view.find(n=>n.type==='./CoinCatchReveal').props.onDone();view.render();
  view.find(n=>n.props?.accessibilityLabel?.startsWith('VIP would')).props.onPress();
  assert.equal(closes,1);assert.deepEqual(navigated,[]);assert.equal(view.timers.size,0);
  view.tree.props.onModalHide();view.tree.props.onModalHide();assert.deepEqual(navigated,[['Membership']]);
});
test('repeat summary fills the parts meter, pops ready to power up and offers the one-hop upgrade', () => {
  let opened=null;
  const view=rewardView(true);view.change({coinTimesCollected:9,ridePartsEarned:2,onViewCoin(open){opened=open;},playerEnergy:40,
    coinProgress:{current_level:1,max_level:5,is_unlocked:true,available_parts:4,parts_to_next_level:2,energy_to_next_level:10}});
  view.find(n=>n.type==='./CoinCatchReveal').props.onDone();view.render();
  assert.equal(view.motions.length,0);
  assert.ok(view.find(n=>n.props?.children==='READY TO LEVEL UP'));
  const button=view.find(n=>n.type==='./YellowButton'); assert.equal(button.props.text,'Upgrade Your Coin');
  button.props.onPress(); assert.equal(opened,true);
});
test('post-win model: milestone headline, next unlock and parts meter use only confirmed numbers', () => {
  const progress={park_id:1,park_name:'Test Park',before:25,collected:26,available:26};
  assert.equal(postWinModel.milestoneHeadline({milestones:[{type:'park_complete',park_id:1,percent:100}],progress,next:null}).ribbon,'Shelf Complete!');
  assert.equal(postWinModel.milestoneHeadline({milestones:[{type:'park_percent',park_id:1,percent:50}],progress:{...progress,collected:13},next:null}).title,'Test Park shelf 50% full');
  assert.equal(postWinModel.milestoneHeadline({milestones:[],progress,next:null}),null);
  // The passport stamp may use a reviewed subset, so the shelf headline never promises a new stamp.
  assert.ok(!/stamp/i.test(postWinModel.milestoneHeadline({milestones:[{type:'park_complete',park_id:1,percent:100}],progress,next:null}).body));
  assert.deepEqual([...postWinModel.rewardChips({coinsEarned:0,xpEarned:0,ridePartsEarned:1,energyEarned:0}).map(c=>c.label)],['Ride Part']);
  assert.deepEqual([...postWinModel.rewardChips({coinsEarned:0,xpEarned:0,ridePartsEarned:2,energyEarned:0}).map(c=>c.label)],['Ride Parts']);
  assert.equal(postWinModel.nextUnlockLine({milestones:[],progress,next:{percent:100,coins_needed:1}}),'1 more coin to complete the shelf.');
  assert.equal(postWinModel.nextUnlockLine({milestones:[],progress,next:{percent:50,coins_needed:3}}),'3 more coins for 50% of the shelf.');
  const parts=postWinModel.partsProgress({current_level:2,max_level:5,is_unlocked:true,available_parts:3,parts_to_next_level:6,energy_to_next_level:25},10,2);
  assert.equal(parts.ready,false); assert.equal(parts.before,1/6); assert.equal(parts.after,0.5);
  assert.equal(parts.hint,'3 more Ride Parts and 15 Energy for Level 3.');
  for (const text of [parts.hint, postWinModel.nextUnlockLine({milestones:[],progress,next:{percent:25,coins_needed:2}})])
    assert.ok(!/[\u2014]/.test(text));
});

test('ride challenge status cards sit on a brand navy scrim, and a free miss says no Ticket was spent', () => {
  const src = require('node:fs').readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  assert.match(src, /backdropColor="#05346e"/);
  assert.ok(!/backdropOpacity=\{flowState === 'preview' \? 0\.5 : 0\.95\}/.test(src), 'status states must not use a near-black backdrop');
  assert.match(src, /'This one got away\. No Ticket was spent\.'/);
  // The dev-only status preview can never reach a release build or a live modal.
  assert.match(src, /__DEV__ && previewOnly \? process\.env\.EXPO_PUBLIC_CHALLENGE_FLOW_PREVIEW/);
});
