const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const purchases = loadTs('src/services/purchases.ts', { 'react-native-adapty': { adapty: {} } });
const product = (offer) => ({
  price: { localizedString: '$4.99' },
  subscription: { localizedSubscriptionPeriod: 'month', offer },
});

test('the legal line comes from the real product and says Apple ID', () => {
  const trial = purchases.legalText(product({ phases: [{ paymentMode: 'free_trial', localizedNumberOfPeriods: '3 days' }] }));
  assert.match(trial, /^3 days free, then \$4\.99 per month\./);
  assert.match(trial, /Apple ID when the free trial ends/);
  assert.match(trial, /24 hours/);
  assert.doesNotMatch(trial, /iTunes/);

  const plain = purchases.legalText(product(undefined));
  assert.match(plain, /^\$4\.99 per month\. Payment is charged to your Apple ID when you confirm the purchase/);
});

test('the paywall promises only live perks, uses kit art and dialogs, and handles guests', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/MembershipScreen.tsx'), 'utf8');
  assert.doesNotMatch(screen, /Members-only|trivia round/i);
  assert.doesNotMatch(screen, /Alert\.alert|ActivityIndicator|vsprintf|rgba\(40, 18, 80|rgba\(0,\s*0,\s*0/);
  assert.doesNotMatch(screen, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✕]/u);
  assert.match(screen, /Sign in to join VIP/);
  assert.match(screen, /state="error"[\s\S]*onRetry/);
});

test('a signed-in player is linked to Adapty at sign-in, once per id', async () => {
  const calls = [];
  const adapty = {
    activate: async (key, opts) => { calls.push(['activate', opts.customerUserId]); },
    identify: async (id) => { calls.push(['identify', id]); },
  };
  const fresh = loadTs('src/services/purchases.ts', { 'react-native-adapty': { adapty } });
  fresh.activateVipForPlayer(null);
  fresh.activateVipForPlayer(undefined);
  fresh.activateVipForPlayer(7);
  await fresh.ensureAdapty(7);
  await fresh.ensureAdapty(9);
  assert.deepEqual(calls, [['activate', '7'], ['identify', '9']]);

  const provider = fs.readFileSync(path.join(root, 'src/context/DailyGiftProvider.tsx'), 'utf8');
  assert.match(provider, /activateVipForPlayer\(player\.id\)/);
});
