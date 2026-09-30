const assert = require('node:assert/strict'), test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

const ui = { BRAND: new Proxy({}, { get: () => '#fff' }), DIALOG_CARD: {}, SPACE: { xxl: 32, sm: 8, xl: 24, lg: 16, md: 12 },
  GameButton: 'GameButton', GameIcon: 'GameIcon' };
const load = (props, reduced = false) => runtime('src/screens/ExploreScreen/TooFarDialog.tsx', {
  '../../ui': ui, '../../components/Ribbon': { default: 'Ribbon' }, 'react-native-modal': { default: 'Modal' },
  '../../hooks/useReducedGameMotion': { default: () => reduced },
}, { visible: true, distanceMeters: 42, requiredMeters: 14, homeItem: false, onClose: () => undefined, ...props });

test('too-far dialog: ribbon title, blue card, a meter toward the pin, no emoji', () => {
  const app = load({});
  assert.ok(app.find(n => n.type === 'Ribbon' && n.props.text === 'Almost there!'));
  assert.ok(app.find(n => n.props?.accessibilityLabel === 'You are 42 m away. Get within 14 meters.'));
  assert.equal(app.find(n => n.type === 'GameIcon').props.name, 'pin');
  assert.equal(app.find(n => n.type === 'Modal').props.animationIn, 'zoomIn');
  const unknown = load({ distanceMeters: null });
  assert.ok(unknown.find(n => n.type === 'Ribbon' && n.props.text === 'Finding you'));
  assert.equal(unknown.find(n => n.props?.accessibilityLabel?.startsWith('You are')), undefined);
  assert.equal(load({}, true).find(n => n.type === 'Modal').props.animationIn, 'fadeIn');
});

test('closeness meter fills toward the required radius', () => {
  const { closenessFraction, formatMeters } = loadTs('src/screens/ExploreScreen/TooFarDialog.tsx', {
    react: {}, 'react/jsx-runtime': { jsx() {}, jsxs() {} }, 'react-native': { StyleSheet: { create: v => v } },
    'react-native-modal': {}, 'react-native-reanimated': { default: {} }, '../../components/Ribbon': {},
    '../../hooks/useReducedGameMotion': {}, '../../ui': ui });
  assert.equal(closenessFraction(10, 14), 1);
  assert.equal(closenessFraction(28, 14), 0.5);
  assert.equal(closenessFraction(100000, 14), 0.06);
  assert.equal(closenessFraction(null, 14), 0);
  assert.equal(formatMeters(1234), '1.2 km');
});
