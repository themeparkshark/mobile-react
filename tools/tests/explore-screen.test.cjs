const assert = require('node:assert/strict'), test = require('node:test');
const { exploreScreen } = require('./helpers/explore-screen.cjs');

const task = { id: 11, name: 'Space Ride', latitude: 34.1382, longitude: -118.3533, asset_id: 13 };
const redeemables = { tasks: [task], coins: [], keys: [], redeemables: [], items: [], pins: [], vaults: [] };
const queueRide = { rideId: 8, taskId: 11, parkId: 1, name: 'Space Ride', lineRewardsReady: true };
const ride = { task_id: 11, asset_id: 13, ride_id: 8, ride_name: 'Space Ride', coin_url: '', park_id: 1 };
const adventureTrip = (phase = 'discover') => ({
  adventure_enabled: true,
  adventure_ticket: { id: 7, park_id: 1, park_day: '2026-09-30', started_at: '2026-09-30T17:00:00Z', ride,
    ride_choices: [ride], phase, discover: null, play: null, celebrated_at: null, origin: 'arrival', play_hint: null },
  rides: [ride], goal: null, goal_unavailable: false, goal_plan: null,
  wallet: { tickets: 3, energy: 40, ticket_cost: 1, tickets_needed: 0 },
});

const named = name => node => typeof node.type === 'function' && node.type.name === name;
const label = prefix => node => typeof node.props?.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(prefix);

async function selectRide(app) {
  await app.settle(); await app.settle();
  const marker = app.find(node => named('TaskMarker')(node) && node.props.task?.id === task.id);
  assert.ok(marker, 'the ride marker is on the map');
  marker.props.onPress(marker.props.task); app.render();
  await app.settle(); await app.settle();
}

test('core loop 4.1: the queue games card folds into the guide; a tapped coin becomes the one target and no right-hand card draws', async () => {
  const app = exploreScreen({ trip: adventureTrip('discover'), redeemables, queueRide });
  await selectRide(app);
  assert.equal(app.find(label('Play queue games for')), undefined, 'no second card on the right');
  assert.deepEqual(app.guidePicks.at(-1), [11, 'callout'], 'the tapped coin is the guide target (Walk closer)');
  assert.equal(app.find(named('NextCoinCard')).props.top, require('./helpers/ts-module.cjs')
    .loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts').suggestionSlotTop(), 'one card in the top-left slot');
});

test('the in-line state opens LinePlay for that line; Line story plays today\'s Adventure story; Pick another coin skips it', async () => {
  const { guideCopy } = require('./helpers/explore-screen.cjs');
  const target = { taskId: 11, parkId: 1, name: 'Space Ride', kind: 'ride', reason: 'in_line', source: 'guide', meters: 8, inRange: true,
    checkRunning: false, leavesOn: null };
  const ctx = { parkName: 'Test Park', ridesResting: false, allOwned: false, tickets: 3, freeStep: null, queueTicketsOn: false, adventureDots: null };
  const stories = [];
  const modules = { '../services/lineplay/resolveRide': {
    resolveMapQueueContext: async () => queueRide,
    resolveQueueStoryContext: async (parkId, rideId, name) => { stories.push([parkId, rideId, name]); return { ...queueRide, story: true }; } } };
  const inLine = exploreScreen({ trip: null, redeemables, modules, queueDwell: { rideId: 8, rideName: 'Space Ride', parkId: 1 },
    guide: { target, state: 'in_line', copy: guideCopy.guideCardCopy('in_line', target, ctx), inLineTaskId: 11, rides: new Map(),
      targetTask: task, arrivedAt: null } });
  await inLine.settle();
  inLine.find(named('NextCoinCard')).props.onAction('lineplay');
  await inLine.settle(); await inLine.settle();
  assert.deepEqual(stories[0], [1, 8, 'Space Ride'], 'the dwell ride\'s own story (a ride with no story plays the template story)');
  assert.equal(inLine.navigation.at(-1)[0], 'LinePlay');
  const story = { ...target, reason: 'line_story' };
  const lineStory = exploreScreen({ trip: adventureTrip('play'), redeemables, modules,
    guide: { target: story, state: 'line_story', copy: guideCopy.guideCardCopy('line_story', story, { ...ctx, adventureDots: [true, false, false] }),
      inLineTaskId: null, rides: new Map(), targetTask: task, arrivedAt: null } });
  await lineStory.settle();
  const card = lineStory.find(named('NextCoinCard'));
  assert.equal(card.props.copy.button.label, 'LINEPLAY');
  assert.equal(card.props.copy.secondary.label, 'Pick another coin');
  card.props.onAction('skip');
  assert.deepEqual(lineStory.guidePicks.at(-1), ['skip']);
  card.props.onCardPress();
  lineStory.render();
  assert.equal(lineStory.find(named('AdventureTicketCard')).props.openRequest, 1, 'the card on its ride opens the ticket sheet (stamps, souvenir)');
});

test('first minute: the daily chest waits for the first catch, opens by itself only at home, never at a park (core loop 4.3)', async () => {
  const gift = { dailyGift: { redeemed_at: null } };
  const modules = { '../components/Tutorial': { useTutorial: () => ({ startTutorial: () => undefined,
    hasCompleted: id => id === 'onboarding', isReady: true, isActive: false }) } };
  const home = { parkLoaded: true, parkLookupRecord: null, location: { latitude: 34.1381, longitude: -118.3534 }, park: null,
    permissionGranted: true, permissionChecked: true };
  const atHome = { ...modules, '../context/parkLookupPolicy': { isConfirmedOutsidePark: () => true, isHomeMapConfirmed: () => true, nextHomeAnchor: () => null } };
  const fresh = exploreScreen({ contexts: { dailyGift: gift, location: home, auth: { player: { id: 5, completed_tasks_count: 0 }, refreshPlayer: async () => undefined } }, modules: atHome, redeemables });
  await fresh.settle();
  assert.equal(fresh.find(named('DailyGiftModal')), undefined, 'no chest before the first catch');
  const veteran = exploreScreen({ contexts: { dailyGift: gift, location: home, auth: { player: { id: 5, completed_tasks_count: 4 }, refreshPlayer: async () => undefined } }, modules: atHome, redeemables });
  await veteran.settle();
  assert.ok(veteran.find(named('DailyGiftModal')), 'at home the chest may open by itself once');
  const park = exploreScreen({ contexts: { dailyGift: gift, auth: { player: { id: 5, completed_tasks_count: 4 }, refreshPlayer: async () => undefined } }, modules, redeemables });
  await park.settle(); await park.settle();
  assert.equal(park.find(named('DailyGiftModal')), undefined, 'at a park no chest ever opens by itself');
  assert.ok(park.find(named('Map')).props.extraControls, 'it waits in the Rewards button');
  const guest = exploreScreen({ contexts: { auth: { player: null, refreshPlayer: async () => undefined } } });
  assert.ok(guest.find(named('GuestTaste')));
});

test('Find this coin selects the ride, makes it the guide target, and the dotted path follows the guide (one pointer)', async () => {
  const app = exploreScreen({ trip: adventureTrip('discover'), redeemables });
  await app.settle(); await app.settle();
  app.find(named('AdventureTicketCard')).props.onDiscover(); app.render();
  assert.deepEqual(app.guidePicks.at(-1), [11, 'find'], 'one owner of the pointer');
  const map = app.find(named('Map'));
  assert.equal(map.props.focusCoordinate.latitude, task.latitude);
  assert.equal(map.props.guideTarget, null, 'the path is the guide\'s: none until the guide resolves a target');
  const target = { taskId: 11, parkId: 1, name: 'Space Ride', kind: 'ride', reason: 'chosen', source: 'find', meters: 120, inRange: false, checkRunning: false, leavesOn: null };
  const { guideCopy } = require('./helpers/explore-screen.cjs');
  const guided = exploreScreen({ trip: null, redeemables, guide: { target, state: 'walk', inLineTaskId: null, rides: new Map(), targetTask: task, arrivedAt: null,
    copy: guideCopy.guideCardCopy('walk', target, { parkName: 'Test Park', ridesResting: false, allOwned: false, tickets: 3, freeStep: null, queueTicketsOn: false, adventureDots: null }) } });
  await guided.settle();
  const path = guided.find(named('Map')).props;
  assert.equal(path.guideTarget.latitude, task.latitude, 'the dotted path goes to the guide target');
  assert.equal(path.guideSticky, true, 'and stays while walking');
  assert.equal(path.returnAfterMs, 10000, 'the camera follows the shark again 10 s after a pan');
});

test('the Park Project pill stays hidden (Park Story waits for players) and the compass sits beside the one guide card', async () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  // One HUD row (12 + 54 + 10), whatever it shows: no slot jumps when a Rush or the night mode arrives.
  assert.equal(q.suggestionSlotTop(), 76);
  assert.equal(q.suggestionSlotScreenTop(54), 54 + 62 + 76);
  const app = exploreScreen({ trip: adventureTrip('discover'), redeemables, modules: {
    '../components/boss/BossRaidFlow': { default: () => null, useParkRaid: () => ({ raid: { id: 3, status: 'active' }, setState: () => undefined }) },
  } });
  await app.settle();
  app.find(named('ParkProjectWidget')).props.onActiveProjectChange({ id: 9, park_id: 1, title: 'Signal', total_points: 0, goal_points: 100 });
  app.render(); await app.settle();
  const widget = app.find(named('ParkProjectWidget'));
  assert.equal(widget.props.pillHidden, true, 'no Park Story pill on the map');
  assert.equal(widget.props.topOffset, q.suggestionSlotScreenTop(0));
  const cards = [];
  const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk);
    if (named('NextCoinCard')(node)) cards.push(node); walk(node.props?.children); };
  walk(app.tree);
  assert.equal(cards.length, 1, 'exactly one guide card');
  assert.equal(app.find(named('AdventureTicketCard')).props.sheetOnly, true, 'the Adventure Ticket is the guide card\'s frame: no chip of its own');
  assert.equal(app.find(named('Map')).props.controlsTop, q.suggestionSlotTop() + 2, 'the compass column sits beside the card, on its right');
  assert.equal(app.find(named('MapStatusStack')), undefined, 'a raid stays off the map until coin levels unlock');
});

test('daily chest at home: "Back to map" puts it away, and the Rewards button brings it back', async () => {
  const gift = { dailyGift: { id: 4401, redeemed_at: null } };
  const modules = { '../components/Tutorial': { useTutorial: () => ({ startTutorial: () => undefined,
    hasCompleted: id => id === 'onboarding', isReady: true, isActive: false }) },
    '../context/parkLookupPolicy': { isConfirmedOutsidePark: () => true, isHomeMapConfirmed: () => true, nextHomeAnchor: () => null } };
  const home = { parkLoaded: true, parkLookupRecord: null, location: { latitude: 34.1381, longitude: -118.3534 }, park: null,
    permissionGranted: true, permissionChecked: true };
  const app = exploreScreen({ contexts: { dailyGift: gift, location: home, auth: { player: { id: 5, completed_tasks_count: 4 }, refreshPlayer: async () => undefined } }, modules, redeemables });
  await app.settle();
  const chest = app.find(named('DailyGiftModal'));
  assert.ok(chest, 'the chest presents itself once (at home)');
  chest.props.onClosed(false); app.render();
  assert.equal(app.find(named('DailyGiftModal')), undefined, 'dismissed: it stays away');
  await app.settle(); await app.settle();
  assert.equal(app.find(named('DailyGiftModal')), undefined, 'and does not come back on the next render');
  // One Rewards button: one chest, one number (core loop 4.2).
  const button = app.find(named('HomeExplore')).props.chestButton;
  assert.equal(button?.type?.name, 'RewardsButton', 'the Rewards button holds the chest while unclaimed');
  button.props.onPress(); app.render();
  const reopened = app.find(named('DailyGiftModal'));
  assert.ok(reopened, 'the button reopens the chest');
  reopened.props.onClosed(false); app.render();
  assert.equal(app.find(named('DailyGiftModal')), undefined);
});

test('the server flag hides every Adventure Ticket surface when off', async () => {
  const on = exploreScreen({ trip: adventureTrip('discover'), redeemables });
  await on.settle();
  assert.ok(on.find(named('AdventureTicketCard')), 'flag on: the ticket chip is in the left slot');
  const off = exploreScreen({ trip: { ...adventureTrip('discover'), adventure_enabled: false }, redeemables });
  await off.settle();
  assert.equal(off.find(named('AdventureTicketCard')), undefined);
});

test('stacked rides: every island stays mounted in a stable order (MapLibre insert crash); the solver folds them and tapping the "+N" host zooms in', async () => {
  const stack = [0, 1, 2].map(i => ({ ...task, id: 20 + i, name: `Ride ${i}`, latitude: 34.13808 + i * 0.00001 }));
  const app = exploreScreen({ trip: null, redeemables: { ...redeemables, tasks: stack } });
  await app.settle(); await app.settle();
  const islands = [];
  const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk);
    if (named('TaskMarker')(node)) islands.push(node); walk(node.props?.children); };
  walk(app.tree);
  // A fixed pool: the three rides in their first slots, then parked slots (never more, never fewer).
  assert.equal(islands.length, 82, '80 ride slots, the Line story island and the checklist slot, all mounted');
  assert.deepEqual(islands.slice(0, 3).map(island => island.props.task.id), [20, 21, 22], 'in first-seen order');
  assert.ok(islands.slice(3, 80).every(island => island.props.parked), 'empty slots are parked');
  assert.match(require('node:fs').readFileSync('src/screens/ExploreScreen.tsx', 'utf8'), /key=\{`ride-\$\{slot\}`\}/,
    'keyed by slot, never by the ride or its state');
  // The solver folded rides 20 and 21 into 22 (the store is what the map's camera pass publishes).
  const map = app.find(named('Map'));
  const v = { visible: true, scale: 1, folded: 0, foldedInto: null, reason: null };
  map.props.declutter.store.publish(new Map([['ride:22', { ...v, folded: 2 }], ['ride:20', { ...v, visible: false, foldedInto: 'ride:22', reason: 'folded' }],
    ['ride:21', { ...v, visible: false, foldedInto: 'ride:22', reason: 'folded' }]]));
  const host = islands.find(island => island.props.task.id === 22 && !island.props.parked);
  host.props.onPress(host.props.task); app.render();
  assert.ok(app.find(named('Map')).props.focusCoordinate.zoom > 17.6, 'the camera zooms into the stack');
  assert.equal(app.find(label('Play queue games for')), undefined);
});

