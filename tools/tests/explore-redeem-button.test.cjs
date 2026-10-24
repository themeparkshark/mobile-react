const assert = require('node:assert/strict'), test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
// The real, pure rules (they are tested on their own in map-opportunity-timing).
const timing = loadTs('src/screens/ExploreScreen/mapOpportunityTiming.ts');
const presentation = loadTs('src/screens/ExploreScreen/mapMarkerPresentation.ts');

const load = props => runtime('src/components/RedeemModal.tsx', {
  '../hooks/useReducedGameMotion': { default: () => true },
  '../screens/ExploreScreen/mapOpportunityTiming': timing,
  '../screens/ExploreScreen/mapMarkerPresentation': presentation,
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

const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const resting = { ...ride, model: { ...ride.model, active_from: later } };

test('PLAY RIDE never shows on a resting ride or one the live feed shows closed', () => {
  assert.equal(load({ redeemable: resting }).find(n => n.props?.text === 'Play Ride!'), undefined);
  assert.equal(load({ redeemable: ride, liveStatus: 'CLOSED' }).find(n => n.props?.text === 'Play Ride!'), undefined);
  assert.ok(load({ redeemable: ride, liveStatus: 'OPERATING' }).find(n => n.props?.text === 'Play Ride!'));
});

test('at a resting or closed ride the PLAY spot says why, in a soft pill that is not a button', () => {
  const text = app => {
    const out = [];
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node.props?.children === 'string') out.push(node.props.children);
      walk(node.props?.children);
    };
    walk(app.tree);
    return out;
  };
  const rest = load({ redeemable: resting });
  const pill = rest.find(n => typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Space Ride. Resting now. Back '));
  assert.ok(pill, 'resting pill names the ride and when it is back');
  assert.equal(pill.props.pointerEvents, 'none', 'never tappable');
  assert.ok(text(rest).some(t => /^Back \d{1,2}:\d\d [AP]M$/.test(t)), 'big Back time');
  assert.ok(rest.find(n => n.props?.name === 'timer'), 'a clock picture');
  const down = load({ redeemable: ride, liveStatus: 'DOWN' });
  assert.ok(text(down).includes('Ride is down'));
  assert.ok(down.find(n => n.props?.name === 'wrench'));
  assert.ok(text(load({ redeemable: ride, liveStatus: 'CLOSED' })).includes('Closed now'));
  assert.ok(text(load({ redeemable: ride, liveStatus: 'REFURBISHMENT' })).includes('Closed for repairs'));
  // Looking at another ride, or an open ride: no pill.
  assert.equal(text(load({ redeemable: resting, selectedTaskId: 12 })).find(t => t.startsWith('Back ')), undefined);
  assert.equal(text(load({ redeemable: ride })).find(t => t.startsWith('Back ') || t === 'Closed now'), undefined);
  // A coin that is not out yet gets no ride pill.
  const coin = { type: 'coin', model: { id: 3, active_from: later } };
  assert.equal(text(load({ redeemable: coin })).find(t => t.startsWith('Back ')), undefined);
});
