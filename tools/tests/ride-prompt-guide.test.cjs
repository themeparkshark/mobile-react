const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

test('ride suggestions wait behind a guide and keep their pending detection intact', () => {
  let active = true, receive;
  const removed = [], navigated = [];
  const app = runtime('src/components/RideTracker/RideDetectionOverlay.tsx', {
    '../Tutorial': { useTutorial: () => ({ isActive: active }) },
    '../../services/RideDetectionEmitter': { rideDetectionEmitter: { on: (_, fn) => { receive = fn; return () => {}; } } },
    '../../services/RideDetectionService': { removePendingDetection: async id => removed.push(id) },
    '../../RootNavigation': { navigationRef: { isReady: () => false }, navigate: (...args) => navigated.push(args) },
    '../../design-system': { shadows: { xl: {}, sm: {} } },
  });
  receive({ id: 'ride-1', rideId: 10, rideName: 'Space Mountain', confidence: 'high', enteredAt: 0, detectedAt: 1, dwellTimeMs: 600000 });
  app.render(); assert.equal(app.tree, null); assert.equal(app.animations.length, 0);
  active = false; app.render(); assert.ok(app.find(n => n.props?.accessibilityLabel === 'Yes, I rode Space Mountain'));
  active = true; app.render(); assert.equal(app.tree, null);
  active = false; app.render(); assert.ok(app.find(n => n.props?.accessibilityLabel === 'Yes, I rode Space Mountain'));
  assert.deepEqual(removed, []); assert.deepEqual(navigated, []);
});
