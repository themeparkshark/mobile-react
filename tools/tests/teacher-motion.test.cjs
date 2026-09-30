const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
test('Finn stops decorative loops when motion preference changes and keeps the primary action available', () => {
  let reduced = false, next = 0;
  const app = runtime('src/components/Tutorial/TeacherShark.tsx', {
    '../../hooks/useReducedGameMotion': { default: () => reduced },
    '../../config': { default: { secondary: '#0875c9', tertiary: '#ffc400' } },
  }, { title: 'Your first adventure', text: 'Match four pairs', mood: 'waving', position: 'bottom-center',
    stepIndex: 0, totalSteps: 2, onNext: () => next++, onSkip() {}, showSkip: true });
  assert.ok(app.motions.length > 0); const before = app.cancelled.length;
  reduced = true; app.render(); assert.ok(app.cancelled.length >= before + 6);
  assert.equal(app.tree.props.entering, undefined); assert.equal(app.tree.props.exiting, undefined);
  const primary = app.find(n => n.type === 'TouchableOpacity' && n.props.onPress === app.props.onNext);
  assert.ok(primary); primary.props.onPress(); assert.equal(next, 1);
  const count = app.cancelled.length; app.unmount(); assert.equal(app.cancelled.length, count + 3);
});
