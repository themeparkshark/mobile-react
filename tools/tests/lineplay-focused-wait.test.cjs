const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
const waitScreen = loadTs('src/services/lineplay/waitScreen.ts');
/** A Text's words, with KidText's number runs (nested Text in the number font) joined back in. */
const words = children => children == null || typeof children === 'boolean' ? ''
  : Array.isArray(children) ? children.map(words).join('')
    : typeof children === 'object' ? words(children.props?.children) : String(children);
function wait(initial = {}) {
  let pauses = 0, arcades = 0;
  const app = runtime('src/screens/LinePlay/components/WaitCard.tsx', {
    '../../../design-system': { colors: { textPrimary: '#fff' }, spacing: { sm: 8, xs: 4, md: 12 }, borderRadius: { xxl: 24 }, shadows: { lg: {} } },
    '../../../context/SoundEffectProvider': { SoundEffectContext: { value: {} } },
    '../../../helpers/hapticPatterns': { default: { collect() {} } },
    '../../../services/lineplay/partCountdown': { partCountdown: () => ({ remainingSeconds: 90, progressSeconds: 30, needsCheck: false, checking: false }) },
    'react-native-svg': { default: 'Svg', Circle: 'Circle' },
    '../../../services/lineplay/waitScreen': waitScreen,
    './waitscreen/WaitStampBadge': { default: 'WaitStampBadge' },
    './KidText': { default: 'Text' },
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
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'Playing 1 min · posted wait 35m'));
  assert.ok(c.app.find(node => node.type === 'Text' && words(node.props.children) === 'The ride sign said 35m.'));
  assert.ok(!c.app.find(node => node.type === 'Text' && /No posted wait|no sign time/.test(String(node.props.children))));
  c.app.change({ paused: true, pauseReason: 'manual' });
  assert.ok(c.control('Resume queue games'));
  // Paused, ARCADE is never a dead tap: it stays live and the screen runs the resume countdown first.
  const paused = c.control('Resume and open queue games');
  assert.ok(paused, 'paused ARCADE says what one tap does');
  assert.notEqual(paused.props.disabled, true);
  paused.props.onPress(); assert.equal(c.arcades(), 2);
});
test('focused reward status uses confirmed credited Parts, with verification details still available', () => {
  const c = wait({ rewardTrackingAvailable: true, lineRewardsReady: true, creditedParts: 2,
    verifiedEligibleSeconds: 450, verifiedPresenceAt: Date.now() });
  assert.ok(c.app.find(node => node.type === 'Text' && words(node.props.children) === 'In line 1 min · 2 Parts'));
  assert.ok(c.control('Open queue games for bonus rewards'));
  c.control('Show wait and reward details').props.onPress(); c.app.render();
  assert.ok(c.app.find(node => node.type === 'Text' && node.props.children === 'Time near the ride: 7 min. You get 1 Ride Part every 5 minutes, up to 3 per wait.'));
});
test('VoiceOver says what the card shows: with the coin, the status first and the wait total named as its own phrase', () => {
  const label = c => c.app.find(node => node.props?.accessible && /earned this wait/.test(node.props?.accessibilityLabel ?? ''))?.props.accessibilityLabel;
  const reward = { rewardTrackingAvailable: true, lineRewardsReady: true, creditedParts: 4, verifiedEligibleSeconds: 450, verifiedPresenceAt: Date.now() };
  const withCoin = wait({ ...reward, hero: 'coin' });
  // Core loop 4.3 rule 7: minutes in line and Parts, never a ticking countdown.
  assert.equal(label(withCoin), 'In line 1 min · 4 Parts. 4 Ride Parts earned this wait.');
  assert.doesNotMatch(label(withCoin), /^4 Ride Parts earned\./, 'never a bare count that disagrees with the coin chip');
  const noCoin = wait(reward);
  assert.match(label(noCoin), /^4 Ride Parts earned this wait\. In line 1 min/);
});
