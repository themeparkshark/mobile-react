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

test('P0-7: an Adventure Ticket never hides "Play in line" for the selected queue ride', async () => {
  const app = exploreScreen({ trip: adventureTrip('discover'), redeemables, queueRide });
  await selectRide(app);
  assert.ok(app.find(label('Play queue games for Space Ride')), 'Play in line shows during an adventure');
});

test('without an adventure the selected queue ride still offers Play in line', async () => {
  const app = exploreScreen({ trip: null, redeemables, queueRide });
  await selectRide(app);
  assert.ok(app.find(label('Play queue games for Space Ride')));
});

test('the server flag hides every Adventure Ticket surface when off', async () => {
  const on = exploreScreen({ trip: adventureTrip('discover'), redeemables });
  await on.settle();
  assert.ok(on.find(named('AdventureTicketCard')), 'flag on: the ticket chip is in the left slot');
  const off = exploreScreen({ trip: { ...adventureTrip('discover'), adventure_enabled: false }, redeemables });
  await off.settle();
  assert.equal(off.find(named('AdventureTicketCard')), undefined);
});

test('stacked rides fold into one island; tapping it zooms in instead of selecting', async () => {
  const stack = [0, 1, 2].map(i => ({ ...task, id: 20 + i, name: `Ride ${i}`, latitude: 34.13808 + i * 0.00001 }));
  const app = exploreScreen({ trip: null, redeemables: { ...redeemables, tasks: stack } });
  await app.settle(); await app.settle();
  const islands = [];
  const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk);
    if (named('TaskMarker')(node)) islands.push(node); walk(node.props?.children); };
  walk(app.tree);
  assert.equal(islands.length, 1);
  assert.equal(islands[0].props.clusterCount, 2);
  islands[0].props.onPress(islands[0].props.task); app.render();
  const map = app.find(named('Map'));
  assert.ok(map.props.focusCoordinate.zoom > 17.6, 'the camera zooms into the stack');
  assert.equal(app.find(label('Play queue games for')), undefined);
});

test('first minute: the daily chest waits for the first catch; guests get the invitation over the map', async () => {
  const gift = { dailyGift: { redeemed_at: null } };
  const modules = { '../components/Tutorial': { useTutorial: () => ({ startTutorial: () => undefined,
    hasCompleted: id => id === 'onboarding', isReady: true, isActive: false }) } };
  const fresh = exploreScreen({ contexts: { dailyGift: gift, auth: { player: { id: 5, completed_tasks_count: 0 }, refreshPlayer: async () => undefined } }, modules, redeemables });
  await fresh.settle();
  assert.equal(fresh.find(named('DailyGiftModal')), undefined, 'no chest before the first catch');
  const veteran = exploreScreen({ contexts: { dailyGift: gift, auth: { player: { id: 5, completed_tasks_count: 4 }, refreshPlayer: async () => undefined } }, modules, redeemables });
  await veteran.settle();
  assert.ok(veteran.find(named('DailyGiftModal')));
  const guest = exploreScreen({ contexts: { auth: { player: null, refreshPlayer: async () => undefined } } });
  assert.ok(guest.find(named('GuestInvite')));
});

test('Find this coin selects the ride and lays a guide toward it', async () => {
  const app = exploreScreen({ trip: adventureTrip('discover'), redeemables });
  await app.settle(); await app.settle();
  app.find(named('AdventureTicketCard')).props.onDiscover(); app.render();
  const map = app.find(named('Map'));
  assert.equal(map.props.guideTarget.latitude, task.latitude);
  assert.equal(map.props.focusCoordinate.latitude, task.latitude);
  map.props.onPress(); app.render();
  assert.equal(app.find(named('Map')).props.guideTarget, null, 'tapping the map clears the guide');
});

test('the Park Project pill sits on the same row as the other suggestion slots, under the one HUD row', async () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  // One HUD row (12 + 54 + 10), whatever it shows: no slot jumps when a Rush or the night mode arrives.
  assert.equal(q.suggestionSlotTop(), 76);
  // Header (70 + status bar) minus the map's 8pt tuck, then the in-map slot row.
  assert.equal(q.suggestionSlotScreenTop(54), 54 + 62 + 76);
  const app = exploreScreen(); await app.settle();
  const widget = app.find(named('ParkProjectWidget'));
  assert.ok(widget, 'project widget renders at the park');
  assert.equal(widget.props.topOffset, q.suggestionSlotScreenTop(0));
  // The recenter compass clears the tallest chip in the right slot (the Park Story pill).
  assert.ok(app.find(named('Map')).props.controlsTop >= q.suggestionSlotTop() + 76);
});

test('one suggestion leads: a live raid plus an adventure plus a Park Story shows exactly one full chip', async () => {
  const app = exploreScreen({ trip: adventureTrip('discover'), redeemables, modules: {
    '../components/boss/BossRaidFlow': { default: named => null, useParkRaid: () => ({ raid: { id: 3, status: 'active' }, setState: () => undefined }) },
  } });
  await app.settle();
  app.find(named('ParkProjectWidget')).props.onActiveProjectChange({ id: 9, park_id: 1, title: 'Signal', total_points: 0, goal_points: 100 });
  app.render(); await app.settle();
  const q = require('./helpers/ts-module.cjs').loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  const card = app.find(named('AdventureTicketCard'));
  const widget = app.find(named('ParkProjectWidget'));
  const fullChips = [
    card && !card.props.collapsed,
    widget && !widget.props.pillHidden && !widget.props.pillCollapsed,
    !!app.find(label('Play queue games for')),
  ].filter(Boolean);
  assert.equal(fullChips.length, 1, 'exactly one full suggestion chip');
  assert.equal(card.props.collapsed, false, 'the adventure leads');
  assert.equal(widget.props.pillCollapsed, true, 'the Park Story folds into its stub');
  // Both slots sit under the one HUD row (the raid leads it).
  assert.equal(card.props.top, q.suggestionSlotTop());
  assert.equal(widget.props.topOffset, q.suggestionSlotScreenTop(0));
});

test('a selected queue ride leads and the adventure folds into its stub', async () => {
  const app = exploreScreen({ trip: adventureTrip('discover'), redeemables, queueRide });
  await selectRide(app);
  assert.ok(app.find(label('Play queue games for Space Ride')));
  assert.equal(app.find(named('AdventureTicketCard')).props.collapsed, true);
});

test('daily chest: "Back to map" puts it away, and the map chest button brings it back', async () => {
  const gift = { dailyGift: { id: 4401, redeemed_at: null } };
  const modules = { '../components/Tutorial': { useTutorial: () => ({ startTutorial: () => undefined,
    hasCompleted: id => id === 'onboarding', isReady: true, isActive: false }) } };
  const app = exploreScreen({ contexts: { dailyGift: gift, auth: { player: { id: 5, completed_tasks_count: 4 }, refreshPlayer: async () => undefined } }, modules, redeemables });
  await app.settle();
  const chest = app.find(named('DailyGiftModal'));
  assert.ok(chest, 'the chest presents itself once');
  assert.equal(app.find(named('Map')).props.extraControls, null, 'no chest button while the card is up');
  chest.props.onClosed(false); app.render();
  assert.equal(app.find(named('DailyGiftModal')), undefined, 'dismissed: it stays away');
  await app.settle(); await app.settle();
  assert.equal(app.find(named('DailyGiftModal')), undefined, 'and does not come back on the next render');
  const button = app.find(named('Map')).props.extraControls;
  assert.equal(button?.type?.name, 'ChestMapButton', 'the map shows the chest button while unclaimed');
  button.props.onPress(); app.render();
  const reopened = app.find(named('DailyGiftModal'));
  assert.ok(reopened, 'the button reopens the chest');
  reopened.props.onClosed(false); app.render();
  assert.equal(app.find(named('DailyGiftModal')), undefined);
});
