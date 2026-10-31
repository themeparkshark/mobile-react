const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

// QA P1-5: a lost ride challenge ends on the game's own panel with Close at
// (196, 539). The try card's Try Again lands near the same spot, so a quick
// double tap on Close must never start a new attempt and spend a Ticket: the
// retry ignores taps for the guard window. Results lane (wave 2): the card
// uses the shared results buttons, gold first and the safe action as a white
// button under it, like every other results card.
const BUTTONS = { ResultPrimaryButton: 'ResultPrimaryButton', ResultSecondaryButton: 'ResultSecondaryButton' };
function card(props) {
  const calls = [];
  const app = runtime('src/components/rewards/ChallengeStatusCard.tsx', {
    '../../hooks/useReducedGameMotion': { default: () => true },
    '../../gamekit/results/ResultButtons': BUTTONS,
  }, { title: 'Good Try!', message: 'No Ticket spent.', art: 'soClose',
    primary: { label: 'Try Again', onPress: () => calls.push('retry') },
    quiet: { label: 'Return to map', onPress: () => calls.push('close') }, ...props });
  return { app, calls };
}

function order(tree) {
  const labels = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'ResultPrimaryButton' || node.type === 'ResultSecondaryButton') labels.push(node.props.label);
    walk(node.props?.children);
  })(tree);
  return labels;
}

test('a paid retry is the gold button first and ignores taps for the guard window', () => {
  const { app, calls } = card({ guardRetry: true });
  // Every try card button is caps (one button voice with the results cards).
  assert.deepEqual(order(app.tree), ['TRY AGAIN', 'RETURN TO MAP'], 'gold first, the safe action under it');
  const retry = () => app.find(node => node.type === 'ResultPrimaryButton');
  assert.equal(retry().props.disabled, true, 'Try Again is not live yet');
  assert.equal(app.timers.size, 1);
  const [[, arm]] = app.timers; arm(); app.render();
  assert.equal(retry().props.disabled, false, 'Try Again wakes up after the guard');
  retry().props.onPress();
  assert.deepEqual(calls, ['retry']);
});

test('cards without a paid retry keep their layout and a live primary', () => {
  const { app } = card({});
  assert.deepEqual(order(app.tree), ['TRY AGAIN', 'RETURN TO MAP']);
  assert.equal(app.find(node => node.type === 'ResultPrimaryButton').props.disabled, false);
  assert.equal(app.timers.size, 0);
});

test('the try card shows what the try cost as a ticket picture', () => {
  const { app } = card({ ticket: -1 });
  const texts = [];
  (function walk(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'Text' && typeof node.props.children === 'string') texts.push(node.props.children); walk(node.props?.children); })(app.tree);
  assert.ok(texts.includes('-1'));
  assert.ok(app.find(node => node.props?.name === 'ticket'), 'a ticket icon, not a sentence');
});

test('every lost or expired card with a retry turns the guard on', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/RedeemRedeemableModal.tsx'), 'utf8');
  assert.match(src, /guardRetry=\{firstCoinTicketReturned \|\| rescueRetryAvailable \|\| canOfferRetry\}/);
  assert.match(src, /guardRetry=\{rescueRetryAvailable\}/);
  const guard = require('node:fs').readFileSync(path.join(__dirname, '../../src/components/rewards/ChallengeStatusCard.tsx'), 'utf8');
  const ms = Number(guard.match(/RETRY_TAP_GUARD_MS = (\d+)/)[1]);
  assert.ok(ms >= 500 && ms <= 1200, 'long enough for a double tap, short enough not to feel stuck');
});

test('the safe action is a full white results button, not a small text link', () => {
  const { app } = card({ guardRetry: true, quiet: { label: 'DONE', onPress() {} } });
  const safe = app.find(node => node.type === 'ResultSecondaryButton');
  assert.ok(safe, 'DONE is a real button');
  const style = Object.assign({}, ...[].concat(safe.props.style).filter(Boolean));
  assert.ok(style.minHeight >= 44, 'a 44 pt tap target or bigger');
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/rewards/lostTryCard.ts'), 'utf8');
  assert.match(src, /'Your Ticket came back\. Same game, try again!'/, 'one short line, not two');
  assert.doesNotMatch(src, /got away/);
  // SO CLOSE! only when the game says the try reached 75% of its goal (rideTry.ts near).
  assert.match(src, /const title = input\.near \? NEAR_TRY_TITLE :/);
});
