const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
function wait(initial = {}) {
  let pauses = 0, arcades = 0;
  const app = runtime('src/screens/LinePlay/components/WaitCard.tsx', {
    '../../../design-system': { colors: { textPrimary: '#fff' }, spacing: { sm: 8, xs: 4, md: 12 }, borderRadius: { xxl: 24 }, shadows: { lg: {} } },
    '../../../context/SoundEffectProvider': { SoundEffectContext: { value: {} } },
    '../../../helpers/hapticPatterns': { default: { collect() {} } },
    '../../../services/lineplay/partCountdown': { partCountdown: () => ({ remainingSeconds: 90, progressSeconds: 30, needsCheck: false, checking: false }) },
    'react-native-svg': { default: 'Svg', Circle: 'Circle' },
  }, { compact: true, rideName: 'Space Mountain', elapsedSeconds: 90, postedWaitMinutes: 35,
    waitSource: 'posted', entranceWaitMinutes: null, entranceWaitObservedAt: null, entranceWaitChangeMinutes: 0,
    paused: false, pauseReason: null, rewardTrackingAvailable: false, rewardUnavailable: false, lineRewardsReady: false,
    verifiedEligibleSeconds: 0, verifiedPresenceAt: null, creditedParts: null, partsRemainingToday: null,
    partIntervalSeconds: 300, sessionPartCap: 3, ticketIntervalSeconds: 600, ticketAvailable: null,
    masteryBonusAvailable: false, onTogglePause: () => pauses++, onPlayBonus: () => arcades++, ...initial });
  const control = label => app.find(node => node.props?.accessibilityLabel === label);
  return { app, control, pauses: () => pauses, arcades: () => arcades };
}
test('focused queue status preserves pause, arcade and honest games-only details', () => {
  const c = wait();
  c.control('Pause queue games').props.onPress(); assert.equal(c.pauses(), 1);
  c.control('Open queue games').props.onPress(); assert.equal(c.arcades(), 1);
  c.control('Show wait and reward details').props.onPress(); c.app.render();
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'Ride Parts aren’t available at this ride right now.'));
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'Playing 1:30 · posted wait 35m'));
  c.app.change({ paused: true, pauseReason: 'manual' });
  assert.ok(c.control('Resume queue games')); assert.equal(c.control('Open queue games').props.disabled, true);
});
test('focused reward status uses confirmed credited Parts, with verification details still available', () => {
  const c = wait({ rewardTrackingAvailable: true, lineRewardsReady: true, creditedParts: 2,
    verifiedEligibleSeconds: 450, verifiedPresenceAt: Date.now() });
  assert.ok(c.app.find(node => node.type === 'Text' && [].concat(node.props.children).join('') === '1:30 · 2 Parts'));
  assert.ok(c.control('Open queue games for bonus rewards'));
  c.control('Show wait and reward details').props.onPress(); c.app.render();
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'Time near the ride: 7:30. You get 1 Ride Part every 5 minutes, up to 3 per wait.'));
});
