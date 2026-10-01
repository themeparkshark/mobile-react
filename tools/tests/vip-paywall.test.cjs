const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const YEARLY = 'com.themeparkshark.app.vip.yearly';
const MONTHLY = 'com.themeparkshark.app.vip.monthly';

const products = [
  { productId: MONTHLY, title: 'VIP Monthly', localizedPrice: '$4.99', price: '4.99', subscriptionPeriodNumberIOS: '1', subscriptionPeriodUnitIOS: 'MONTH',
    introductoryPricePaymentModeIOS: 'FREETRIAL', introductoryPriceNumberOfPeriodsIOS: '1', introductoryPriceSubscriptionPeriodIOS: 'week' },
  { productId: YEARLY, title: 'VIP Yearly', localizedPrice: '$29.99', price: '29.99', subscriptionPeriodNumberIOS: '1', subscriptionPeriodUnitIOS: 'YEAR',
    introductoryPricePaymentModeIOS: 'FREETRIAL', introductoryPriceNumberOfPeriodsIOS: '1', introductoryPriceSubscriptionPeriodIOS: 'week' },
];
const purchaseOf = (sku, id = '2000000900000001') => ({ productId: sku, transactionId: id, jwsRepresentationIos: `h.${id}.s` });

/**
 * purchases.ts with a fake StoreKit (react-native-iap) and a fake server sync.
 * `native: false` is a 1.6.0 binary: requiring react-native-iap must never happen.
 */
function harness({ native = true, eligible = true, buy, sync, entitlements = [] } = {}) {
  const calls = { sync: [], finished: [], setup: [], required: 0, appStoreSync: 0 };
  let listener = null;
  const iap = {
    setup: (opts) => calls.setup.push(opts.storekitMode),
    initConnection: async () => true,
    purchaseUpdatedListener: (fn) => { listener = fn; return { remove() {} }; },
    getSubscriptions: async ({ skus }) => products.filter(p => skus.includes(p.productId)),
    getAvailablePurchases: async () => entitlements,
    requestSubscription: buy ?? (async ({ sku }) => purchaseOf(sku)),
    finishTransaction: async ({ purchase }) => { calls.finished.push(purchase.transactionId); return true; },
    IapIosSk2: { isEligibleForIntroOffer: async () => eligible, sync: async () => { calls.appStoreSync++; return null; } },
  };
  const purchases = loadTs('src/services/purchases.ts', {
    'react-native': {
      Platform: { OS: 'ios' },
      NativeModules: native ? { RNIapIos: {}, RNIapIosSk2: {} } : {},
    },
    'react-native-iap': new Proxy(iap, { get(target, key) { if (key === 'setup') calls.required++; return target[key]; } }),
    '../api/endpoints/me/vip-sync': {
      __esModule: true,
      default: async (jws) => { calls.sync.push([...jws]); return sync ? sync(jws) : { subscribed: true, synced: true, expiresAt: null }; },
      vipSyncErrorCode: (e) => e?.response?.data?.code ?? null,
    },
  });
  return { purchases, calls, emit: (p) => listener && listener(p) };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('an old binary without the StoreKit module never loads it and says update', async () => {
  const { purchases, calls } = harness({ native: false });
  assert.equal(purchases.storeAvailable(), false);
  assert.equal(await purchases.buyVip({ productId: YEARLY }), 'unavailable');
  assert.equal(await purchases.restoreVip(), 'unavailable');
  purchases.syncVipOnLaunch(7);
  await assert.rejects(purchases.loadVipPlans(), /Update the app/);
  await tick();
  assert.equal(calls.required, 0);
  assert.deepEqual(calls.sync, []);

  const screen = fs.readFileSync(path.join(root, 'src/screens/MembershipScreen.tsx'), 'utf8');
  assert.match(screen, /!canBuy \?/);
  assert.match(screen, /Update the app/);
});

test('plans load from the App Store in StoreKit 2 mode, yearly first, trial only when eligible', async () => {
  const { purchases, calls } = harness();
  const plans = plain(await purchases.loadVipPlans());
  assert.deepEqual(calls.setup, ['STOREKIT2_MODE']);
  assert.deepEqual(plans.map(p => [p.productId, p.price, p.period, p.trial]), [
    [YEARLY, '$29.99', 'year', '1 week free'],
    [MONTHLY, '$4.99', 'month', '1 week free'],
  ]);
  assert.equal(purchases.savingsText(plans), 'SAVE 49%');
  assert.equal(purchases.savingsText(plans.slice(0, 1)), null);

  const used = harness({ eligible: false });
  assert.deepEqual(plain(await used.purchases.loadVipPlans()).map(p => p.trial), [null, null]);
});

test('a purchase is verified by the server before it is finished, once even when StoreKit reports it twice', async () => {
  const { purchases, calls, emit } = harness({
    buy: async ({ sku }) => {
      const purchase = purchaseOf(sku);
      emit(purchase); // StoreKit's update listener fires for the same transaction
      return purchase;
    },
  });
  const [yearly] = await purchases.loadVipPlans();
  assert.equal(await purchases.buyVip(yearly), 'success');
  assert.deepEqual(calls.sync, [['h.2000000900000001.s']]);
  assert.deepEqual(calls.finished, ['2000000900000001']);
});

test('a purchase the server cannot confirm stays unfinished so it is retried; another account is named', async () => {
  const offline = harness({ sync: async () => { throw new Error('offline'); } });
  const [plan] = await offline.purchases.loadVipPlans();
  assert.equal(await offline.purchases.buyVip(plan), 'unverified');
  assert.deepEqual(offline.calls.finished, []);

  const taken = harness({ sync: async () => { throw { response: { status: 409, data: { code: 'VIP_OWNED_BY_OTHER_PLAYER' } } }; } });
  assert.equal(await taken.purchases.buyVip(plan), 'owned_elsewhere');

  const cancelled = harness({ buy: async () => { throw Object.assign(new Error('x'), { code: 'E_USER_CANCELLED' }); } });
  assert.equal(await cancelled.purchases.buyVip(plan), 'cancelled');
  const deferred = harness({ buy: async () => { throw Object.assign(new Error('x'), { code: 'E_DEFERRED_PAYMENT' }); } });
  assert.equal(await deferred.purchases.buyVip(plan), 'pending');
  assert.deepEqual(cancelled.calls.sync, []);
});

test('restore syncs the App Store and sends only VIP entitlements', async () => {
  const entitlements = [purchaseOf(MONTHLY, '11'), { productId: 'com.themeparkshark.app.other', transactionId: '12', jwsRepresentationIos: 'x.y.z' }];
  const { purchases, calls } = harness({ entitlements });
  assert.equal(await purchases.restoreVip(), 'restored');
  assert.equal(calls.appStoreSync, 1);
  assert.deepEqual(calls.sync, [['h.11.s']]);

  assert.equal(await harness({ entitlements: [] }).purchases.restoreVip(), 'nothing');
  const lapsed = harness({ entitlements, sync: async () => ({ subscribed: false, synced: true, expiresAt: null }) });
  assert.equal(await lapsed.purchases.restoreVip(), 'nothing');
});

test('launch sends the current entitlement once per player per run, silently', async () => {
  const { purchases, calls } = harness({ entitlements: [purchaseOf(YEARLY, '21')] });
  purchases.syncVipOnLaunch(null);
  purchases.syncVipOnLaunch(7);
  purchases.syncVipOnLaunch(7);
  await tick(); await tick(); await tick();
  assert.deepEqual(calls.sync, [['h.21.s']]);

  const failing = harness({ entitlements: [purchaseOf(YEARLY, '22')], sync: async () => { throw new Error('offline'); } });
  failing.purchases.syncVipOnLaunch(7);
  await tick(); await tick(); await tick();
  assert.deepEqual(failing.calls.finished, []);

  const provider = fs.readFileSync(path.join(root, 'src/context/DailyGiftProvider.tsx'), 'utf8');
  assert.match(provider, /syncVipOnLaunch\(player\.id\)/);
});

test('the legal line comes from the chosen plan and says Apple ID', () => {
  const { purchases } = harness();
  const trial = purchases.legalText({ price: '$4.99', period: 'month', trial: '1 week free' });
  assert.match(trial, /^1 week free, then \$4\.99 per month\./);
  assert.match(trial, /Apple ID when the free trial ends/);
  assert.match(trial, /24 hours/);
  assert.doesNotMatch(trial, /iTunes|—/);

  const plainText = purchases.legalText({ price: '$29.99', period: 'year', trial: null });
  assert.match(plainText, /^\$29\.99 per year\. Payment is charged to your Apple ID when you confirm the purchase/);
});

test('the paywall promises only live perks, uses kit art and dialogs, and handles guests', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/MembershipScreen.tsx'), 'utf8');
  assert.doesNotMatch(screen, /Members-only|trivia round|adapty/i);
  assert.doesNotMatch(screen, /Alert\.alert|ActivityIndicator|vsprintf|rgba\(40, 18, 80|rgba\(0,\s*0,\s*0/);
  assert.doesNotMatch(screen, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✕—]/u);
  assert.match(screen, /Sign in to join VIP/);
  assert.match(screen, /state="error"[\s\S]*onRetry/);
  assert.match(screen, /Restore purchases/);
});

test('paywall perks come from the server VIP flags, with a safe fallback', () => {
  const api = loadTs('src/api/endpoints/economy/vip-perks.ts', { '../../client': { default: {} } });
  const perks = api.parseVipPerks([
    { key: 'ride', icon: 'xp', title: '3x XP and Shark Coins', body: 'On every ride coin you win at the park.' },
    { key: 'bad', icon: 'not-an-icon', title: 'Secret Store', body: 'x' },
    { key: 'badge', icon: 'member', title: 'VIP badge on your profile', body: 'Show it.' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(perks)).map(p => p.title), ['3x XP and Shark Coins', 'VIP badge on your profile']);
  assert.equal(api.parseVipPerks([]), null);
  assert.equal(api.parseVipPerks(undefined), null);
  const screen = fs.readFileSync(path.join(root, 'src/screens/MembershipScreen.tsx'), 'utf8');
  assert.match(screen, /getVipPerks\(\)\.then/);
  assert.match(screen, /\{perks\.map\(/);
});
