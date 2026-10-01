const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

// QA P1-5: a lost ride challenge ends on the game's own panel with Close at
// (196, 539). The "So Close!" card then put Try Again at (197, 543), so a
// quick double tap on Close started a new attempt and spent a Ticket.
function card(props) {
  const calls = [];
  const app = runtime('src/components/rewards/ChallengeStatusCard.tsx', {
    '../../hooks/useReducedGameMotion': { default: () => true },
  }, { title: 'So Close!', message: 'This one got away.', art: 'soClose',
    primary: { label: 'Try Again', onPress: () => calls.push('retry') },
    quiet: { label: 'Return to map', onPress: () => calls.push('close') }, ...props });
  return { app, calls };
}

function order(tree) {
  const labels = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === '../YellowButton') labels.push(node.props.text);
    if (node.type === 'Text' && typeof node.props.children === 'string' && node.props.children === 'Return to map') labels.push('Return to map');
    walk(node.props?.children);
  })(tree);
  return labels;
}

test('a paid retry sits below the safe action and ignores taps for the guard window', () => {
  const { app, calls } = card({ guardRetry: true });
  assert.deepEqual(order(app.tree), ['Return to map', 'Try Again'], 'the old Close spot holds the safe action');
  const retry = () => app.find(node => node.type === '../YellowButton');
  assert.equal(retry().props.disabled, true, 'Try Again is not live yet');
  assert.equal(app.timers.size, 1);
  const [[, arm]] = app.timers; arm(); app.render();
  assert.equal(retry().props.disabled, false, 'Try Again wakes up after the guard');
  retry().props.onPress();
  assert.deepEqual(calls, ['retry']);
});

test('cards without a paid retry keep their layout and a live primary', () => {
  const { app } = card({});
  assert.deepEqual(order(app.tree), ['Try Again', 'Return to map']);
  assert.equal(app.find(node => node.type === '../YellowButton').props.disabled, false);
  assert.equal(app.timers.size, 0);
});

test('every lost or expired card with a retry turns the guard on', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/RedeemRedeemableModal.tsx'), 'utf8');
  assert.match(src, /guardRetry=\{firstCoinTicketReturned \|\| rescueRetryAvailable\}/);
  assert.match(src, /guardRetry=\{rescueRetryAvailable\}/);
  const guard = require('node:fs').readFileSync(path.join(__dirname, '../../src/components/rewards/ChallengeStatusCard.tsx'), 'utf8');
  const ms = Number(guard.match(/RETRY_TAP_GUARD_MS = (\d+)/)[1]);
  assert.ok(ms >= 500 && ms <= 1200, 'long enough for a double tap, short enough not to feel stuck');
});
