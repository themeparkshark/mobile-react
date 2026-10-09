const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const TICKETS = 'com.themeparkshark.app.tickets.12';
const DEAL = 'com.themeparkshark.app.deal.daily';
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

/**
 * purchases.ts (Supplies) with a fake StoreKit and a fake server.
 * `native: false` is a 1.6.0 binary: react-native-iap must never be required.
 */
function shopHarness({ native = true, buy, redeem } = {}) {
  const calls = { redeem: [], finished: [], required: 0, bought: [] };
  let listener = null;
  const iap = {
    setup() {},
    initConnection: async () => true,
    purchaseUpdatedListener: (fn) => { listener = fn; return { remove() {} }; },
    getProducts: async ({ skus }) => skus.map(sku => ({ productId: sku, localizedPrice: '$1.99', price: '1.99' })),
    requestPurchase: buy ?? (async (request) => { calls.bought.push(request); return { productId: request.sku, transactionId: '7001', jwsRepresentationIos: 'h.7001.s' }; }),
    finishTransaction: async ({ purchase, isConsumable }) => { calls.finished.push([purchase.transactionId, isConsumable]); return true; },
    IapIosSk2: {},
  };
  const purchases = loadTs('src/services/purchases.ts', {
    'react-native': { Platform: { OS: 'ios' }, NativeModules: native ? { RNIapIos: {}, RNIapIosSk2: {} } : {} },
    'react-native-iap': new Proxy(iap, { get(target, key) { if (key === 'setup') calls.required++; return target[key]; } }),
    '../api/endpoints/me/vip-sync': { __esModule: true, default: async () => ({ subscribed: false, synced: false, expiresAt: null }), vipSyncErrorCode: () => null },
    '../api/endpoints/me/shop': {
      redeemShopPurchase: async (jws, shownDay) => {
        calls.redeem.push([jws, shownDay]);
        if (redeem) return redeem(jws, shownDay);
        return { results: [{ transaction_id: '7001', product_id: TICKETS, granted: { tickets: 12 }, replay: false, revoked: false }], wallet: { tickets: 12, coins: 0, energy: 0, rescue_passes: 0 } };
      },
      shopErrorCode: e => e?.response?.data?.code ?? null,
    },
  });
  return { purchases, calls, emit: p => listener && listener(p) };
}

test('on a 1.6.0 binary the shop never loads StoreKit and asks for an update', async () => {
  const { purchases, calls } = shopHarness({ native: false });
  assert.equal(purchases.storeAvailable(), false);
  assert.deepEqual(plain(await purchases.buyShopProduct(TICKETS)), { status: 'unavailable' });
  await assert.rejects(purchases.loadShopPrices([TICKETS]), /Update the app/);
  assert.equal(calls.required, 0);
  assert.deepEqual(calls.redeem, []);

  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /!canBuy \?/);
  assert.match(shop, /title="Update the game" body="Update Theme Park Shark to buy Supplies."/);
});

test('a purchase carries the buyer token, is granted by the server, then finished once', async () => {
  const { purchases, calls, emit } = shopHarness({
    buy: async (request) => {
      calls.bought.push(request);
      const purchase = { productId: request.sku, transactionId: '7001', jwsRepresentationIos: 'h.7001.s' };
      emit(purchase); // StoreKit's update listener reports the same transaction
      return purchase;
    },
  });
  const outcome = plain(await purchases.buyShopProduct(DEAL, { accountToken: 'tok-1', shownDay: '2026-10-01' }));
  assert.equal(outcome.status, 'success');
  assert.equal(calls.bought[0].appAccountToken, 'tok-1');
  assert.equal(calls.bought[0].andDangerouslyFinishTransactionAutomaticallyIOS, false);
  assert.deepEqual(calls.redeem, [['h.7001.s', '2026-10-01']]);
  assert.deepEqual(calls.finished, [['7001', true]]);
});

test('a purchase the server cannot confirm stays unfinished; another account is named', async () => {
  const offline = shopHarness({ redeem: async () => { throw new Error('offline'); } });
  assert.equal(plain(await offline.purchases.buyShopProduct(TICKETS)).status, 'unverified');
  assert.deepEqual(offline.calls.finished, []);

  const other = shopHarness({ redeem: async () => { throw { response: { status: 409, data: { code: 'SHOP_PURCHASE_OTHER_PLAYER' } } }; } });
  assert.equal(plain(await other.purchases.buyShopProduct(TICKETS)).status, 'other_account');
  assert.deepEqual(other.calls.finished, []);

  const cancelled = shopHarness({ buy: async () => { throw Object.assign(new Error('x'), { code: 'E_USER_CANCELLED' }); } });
  assert.equal(plain(await cancelled.purchases.buyShopProduct(TICKETS)).status, 'cancelled');
  const askToBuy = shopHarness({ buy: async () => { throw Object.assign(new Error('x'), { code: 'E_DEFERRED_PAYMENT' }); } });
  assert.equal(plain(await askToBuy.purchases.buyShopProduct(TICKETS)).status, 'pending');
  assert.deepEqual(cancelled.calls.redeem, []);
});

test('a purchase left unfinished last run is delivered at launch and announced', async () => {
  const { purchases, calls, emit } = shopHarness();
  const delivered = [];
  purchases.onShopDelivered(result => delivered.push(result));
  purchases.syncVipOnLaunch(42); // connects StoreKit, which replays unfinished transactions
  await tick();
  emit({ productId: TICKETS, transactionId: '7002', jwsRepresentationIos: 'h.7002.s' });
  emit({ productId: 'com.themeparkshark.app.vip.monthly', transactionId: '7003', jwsRepresentationIos: 'h.7003.s' });
  await tick();
  assert.deepEqual(calls.redeem, [['h.7002.s', null]], 'VIP goes to /me/vip/sync, never to the shop');
  assert.deepEqual(calls.finished.filter(([id]) => id === '7002'), [['7002', true]]);
  assert.equal(delivered.length, 1);
  assert.equal(purchases.isShopProduct('com.themeparkshark.app.vip.yearly'), false);
  assert.equal(purchases.isShopProduct('com.other.app.tickets.5'), false);
});

/** ads.ts with a fake Google Mobile Ads SDK and a fake server. */
function adsHarness({ native = true, offer, claim, closeEarly = false, env = '1', audience13 = true } = {}) {
  // audience13 stands in for a future known-13+ signal; the shipped constant is false (no age is collected).
  const realConfig = loadTs('src/services/adConfig.ts', {}, { process: { env: { EXPO_PUBLIC_TPS_TEST_ADS: env } } });
  const adConfig = { ...realConfig, AD_AUDIENCE_13_PLUS_KNOWN: audience13 };
  const calls = { offers: [], claims: [], requests: [], required: 0, config: [] };
  const listeners = {};
  const gma = {
    default: () => ({ setRequestConfiguration: async c => { calls.config.push(c); }, initialize: async () => [] }),
    MaxAdContentRating: { G: 'G', PG: 'PG' },
    TestIds: { REWARDED: 'ca-app-pub-3940256099942544/1712485313' },
    RewardedAdEventType: { LOADED: 'loaded', EARNED_REWARD: 'earned' },
    AdEventType: { CLOSED: 'closed', ERROR: 'error' },
    RewardedAd: {
      createForAdRequest(unit, options) {
        calls.requests.push({ unit, options });
        return {
          addAdEventListener(type, fn) { listeners[type] = fn; return () => { delete listeners[type]; }; },
          load() { setTimeout(() => listeners.loaded?.(), 1); },
          async show() { if (!closeEarly) listeners.earned?.(); setTimeout(() => listeners.closed?.(), 1); },
        };
      },
    },
  };
  const reward = (status, via = 'ssv') => ({ nonce: '2f5d1f2e-0000-4000-8000-000000000001', placement: 'daily_ticket', ref: null,
    status, via, reward: { tickets: 1 }, refused_reason: null, expires_at: '', wallet: {} });
  const ads = loadTs('src/services/ads.ts', {
    'react-native': {
      Platform: { OS: 'ios' }, NativeModules: {},
      TurboModuleRegistry: { get: name => (native && name === 'RNGoogleMobileAdsModule' ? {} : null) },
    },
    'react-native-google-mobile-ads': new Proxy(gma, { get(target, key) { if (key === 'RewardedAd') calls.required++; return target[key]; } }),
    '../api/endpoints/me/ad-rewards': {
      offerAdReward: async (placement, ref) => { calls.offers.push([placement, ref]); return offer ? offer(placement) : reward('offered', null); },
      claimAdReward: async nonce => { calls.claims.push(nonce); return claim ? claim(nonce) : reward('granted', 'client'); },
      getAdReward: async () => reward('granted'),
      adErrorCode: e => e?.response?.data?.code ?? null,
    },
    './adConfig': adConfig,
  }, { process: { env: { EXPO_PUBLIC_TPS_TEST_ADS: env } } });
  return { ads, calls, reward };
}

test('no ad ever shows to a player under 13 or of unknown age (today: everyone); VIP still gets the reward', async () => {
  const shipped = loadTs('src/services/adConfig.ts', {}, { process: { env: { EXPO_PUBLIC_TPS_TEST_ADS: '1' } } });
  assert.equal(shipped.AD_AUDIENCE_13_PLUS_KNOWN, false, 'the app collects no age, so every player is unknown');
  assert.equal(shipped.AD_REQUEST.tagForChildDirectedTreatment, true);
  assert.equal(shipped.AD_REQUEST.tagForUnderAgeOfConsent, true);
  assert.equal(shipped.AD_REQUEST.maxAdContentRating, 'G');
  const { ads, calls, reward } = adsHarness({ audience13: false, offer: () => reward('granted', 'vip') });
  assert.equal(ads.adsAvailable(), false, 'offers hide (every offer checks vip || adsAvailable())');
  assert.equal(plain(await ads.watchForReward('daily_ticket', null, false)).status, 'unavailable');
  assert.deepEqual(calls.offers, []);
  assert.equal(plain(await ads.watchForReward('daily_ticket', null, true)).status, 'granted');
  assert.equal(calls.required, 0, 'the SDK is never required');
  for (const file of ['src/screens/StoreScreen/SuppliesShop.tsx', 'src/components/RedeemRedeemableModal.tsx', 'src/components/PostWinRewardsModal.tsx', 'src/screens/LinePlay/components/LineSnackOffer.tsx']) {
    assert.match(read(file), /(vip|isVip) \|\| adsAvailable\(\)|!vip && !adsAvailable\(\)/, `${file}: offers need VIP or adsAvailable()`);
  }
});

test('a store bundle with no real ad units never touches the SDK; VIP still gets the reward', async () => {
  const { ads, calls, reward } = adsHarness({ env: '', offer: () => reward('granted', 'vip') });
  assert.equal(ads.adsAvailable(), false);
  assert.equal(plain(await ads.watchForReward('daily_ticket', null, false)).status, 'unavailable');
  assert.deepEqual(calls.offers, []);
  assert.equal(plain(await ads.watchForReward('daily_ticket', null, true)).status, 'granted');
  assert.equal(calls.required, 0, 'the SDK is never required');
});

test('on a 1.6.0 binary ads never load; VIP still gets the reward with no ad', async () => {
  const { ads, calls, reward } = adsHarness({ native: false, offer: () => reward('granted', 'vip') });
  assert.equal(ads.adsAvailable(), false);
  assert.equal(plain(await ads.watchForReward('daily_ticket', null, false)).status, 'unavailable');
  assert.deepEqual(calls.offers, [], 'no offer without a way to show the ad');
  assert.equal(plain(await ads.watchForReward('daily_ticket', null, true)).status, 'granted');
  assert.equal(calls.required, 0);
});

test('a watched ad is non-personalized, carries only the nonce, and the server grants it', async () => {
  const { ads, calls } = adsHarness();
  const outcome = plain(await ads.watchForReward('retry', 55, false));
  assert.equal(outcome.status, 'granted');
  assert.deepEqual(calls.offers, [['retry', 55]]);
  const [{ options }] = calls.requests;
  assert.equal(options.requestNonPersonalizedAdsOnly, true);
  assert.deepEqual(plain(options.serverSideVerificationOptions), { customData: '2f5d1f2e-0000-4000-8000-000000000001' });
  assert.deepEqual(plain(calls.config), [{ maxAdContentRating: 'G', tagForChildDirectedTreatment: true, tagForUnderAgeOfConsent: true }]);
});

test('closing the ad early pays nothing and never claims', async () => {
  const { ads, calls } = adsHarness({ closeEarly: true });
  assert.equal(plain(await ads.watchForReward('double_coins', 9, false)).status, 'skipped');
  assert.deepEqual(calls.claims, []);
  const capped = adsHarness({ offer: () => { throw { response: { data: { code: 'ADS_DAILY_CAP' } } }; } });
  assert.equal(plain(await capped.ads.watchForReward('daily_ticket', null, false)).status, 'capped');
  assert.deepEqual(capped.calls.requests, []);
});

test('offers live on result and recap screens only, never inside a game or a moving line', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  // "One more try" only on the lost card, after the game resolved.
  const retryUse = modal.indexOf("watchForReward('retry'");
  assert.ok(retryUse > 0);
  assert.match(modal, /flowState === 'lost' && <ChallengeStatusCard[\s\S]*?canOfferRetry/);
  // The line snack is passed to the recap only, and only for an ended server session.
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'), /snackSlot=\{snapshot\.serverSessionId && snapshot\.rewards \? <LineSnackOffer/);
  assert.match(read('src/screens/LinePlay/components/SessionRecap.tsx'), /\{rewardsConfirmed && snackSlot\}/);
  for (const file of ['src/gamekit', 'src/screens/LinePlay/activities'].filter(f => fs.existsSync(path.join(root, f)))) {
    const { execFileSync } = require('node:child_process');
    let hits = ''; try { hits = execFileSync('git', ['grep', '--untracked', '-l', 'watchForReward', '--', file], { cwd: root, encoding: 'utf8' }); } catch (error) { if (error.status !== 1) throw error; }
    assert.equal(hits.trim(), '', `${file} must never show an ad`);
  }
});

test('the shop copy is honest: real prices, no random rewards, Parts never sold, no em dashes', () => {
  const shop = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(shop, /price=\{prices\[p\.product_id\]\?\.price\}/, 'Apple localized price on every button');
  assert.doesNotMatch(shop, /—/);
  for (const file of ['src/services/ads.ts', 'src/screens/LinePlay/components/LineSnackOffer.tsx', 'src/components/PostWinRewardsModal.tsx']) {
    assert.doesNotMatch(read(file), /—/, file);
  }
  // One copy of the words for every offer (services/money/supplies.ts); Supplies re-exports it.
  assert.match(shop, /export \{ grantsText, gateReasonFor \} from '\.\.\/\.\.\/services\/money\/supplies';/);
  const { grantsText } = loadTs('src/services/money/supplies.ts', {
    react: { useEffect() {}, useState: v => [v, () => {}] }, '../../components/GrownUpGate': { askGrownUp: async () => false },
    '../../api/endpoints/me/shop': {}, '../purchases': {},
  });
  assert.equal(grantsText({ tickets: 15, coins: 1500, energy: 150, rescue_passes: 2 }),
    '15 tickets, 1,500 coins, 150 energy and 2 Rescue Passes');
  assert.equal(grantsText({ rescue_passes: 1 }), '1 Rescue Pass');
});
