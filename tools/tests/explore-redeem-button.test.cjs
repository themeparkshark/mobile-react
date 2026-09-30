const assert = require('node:assert/strict'), test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const load = props => runtime('src/components/RedeemModal.tsx', {
  '../hooks/useReducedGameMotion': { default: () => true },
  '../screens/ExploreScreen/mapOpportunityTiming': { opportunityIsActive: () => true },
  '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound: async () => undefined } } },
  '../ui': { BRAND: new Proxy({}, { get: () => '#fff' }), GameIcon: 'GameIcon' },
}, { park: { id: 1 }, onPress: () => undefined, ...props });
const ride = { type: 'task', model: { id: 11, name: 'Space Ride', ticket_cost: 1 } };

test('PLAY RIDE names the ride and its Ticket price', () => {
  const app = load({ redeemable: ride });
  assert.ok(app.find(n => n.props?.accessibilityLabel === 'Space Ride. Costs 1 Ticket.'));
});

test('PLAY RIDE hides while a different ride is selected on the map', () => {
  const other = load({ redeemable: ride, selectedTaskId: 12 });
  assert.equal(other.find(n => n.props?.text === 'Play Ride!'), undefined);
  const same = load({ redeemable: ride, selectedTaskId: 11 });
  assert.ok(same.find(n => n.props?.text === 'Play Ride!'));
});
