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
