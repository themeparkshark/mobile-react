/**
 * VIP membership and the Supplies shop straight through Apple StoreKit 2
 * (react-native-iap in STOREKIT2_MODE). No third-party account: products load
 * from the App Store, and every purchase, restore and launch sends Apple's
 * signed transactions (JWS) to the server, which verifies Apple's signature:
 * POST /me/vip/sync decides VIP, POST /me/shop/redeem grants a consumable once
 * per transaction id. The client never decides VIP or a grant on its own.
 *
 * The native module ships in 1.7.0. On an older binary (1.6.0) running this JS
 * the module is missing: nothing here throws, storeAvailable() is false and the
 * paywall asks the player to update the app.
 */
import { NativeModules, Platform } from 'react-native';
import syncVip, { vipSyncErrorCode, type VipSyncResult } from '../api/endpoints/me/vip-sync';
import type { SharkPassState } from '../api/endpoints/me/shark-pass';
import { redeemShopPurchase, shopErrorCode, type ShopRedeemResult } from '../api/endpoints/me/shop';

/** App Store Connect: subscription group "VIP" (22421719). Yearly first. */
export const VIP_PRODUCT_IDS = ['com.themeparkshark.app.vip.yearly', 'com.themeparkshark.app.vip.monthly'] as const;
export const VIP_SUBSCRIPTION_GROUP_ID = '22421719';

type Iap = typeof import('react-native-iap');
type StoreSubscription = import('react-native-iap').SubscriptionIOS;
type StoreProduct = import('react-native-iap').Product;
type StorePurchase = import('react-native-iap').Purchase;

/** True when this binary has the StoreKit 2 module (1.7.0 and later, iOS only). */
export function storeAvailable(): boolean {
  return Platform.OS === 'ios' && !!NativeModules.RNIapIos && !!NativeModules.RNIapIosSk2;
}

export class StoreUnavailableError extends Error {
  constructor() {
    super('Update the app to join VIP.');
  }
}

// Loaded only once the native module is known to exist.
function iap(): Iap {
  if (!storeAvailable()) throw new StoreUnavailableError();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-iap') as Iap;
}

/** Dev builds only: simulator price fixtures for captures (tools/capture, never in a store bundle). */
function devCapture(): typeof import('../../tools/capture/moneyCapture') | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  try { return __DEV__ ? require('../../tools/capture/moneyCapture') : null; } catch { return null; }
}

let connection: Promise<Iap> | null = null;
let listening = false;
const delivered = new Map<string, Promise<VipSyncResult>>();

/** STOREKIT2_MODE, one connection per app run, and the renewal listener. */
function connect(): Promise<Iap> {
  if (!connection) {
    connection = (async () => {
      const store = iap();
      store.setup({ storekitMode: 'STOREKIT2_MODE' });
      if (!listening) {
        listening = true;
        // Renewals, Ask to Buy approvals, refunds, and purchases left
        // unfinished last run (StoreKit's Transaction.updates replays those
        // once at launch). Subscribed before initConnection so none is missed.
        store.purchaseUpdatedListener((purchase) => {
          void deliver(store, [purchase]).catch(() => undefined);
          void deliverShop(store, purchase).catch(() => undefined);
          void deliverPass(store, purchase).catch(() => undefined);
          void deliverVipGift(store, purchase).catch(() => undefined);
        });
      }
      await store.initConnection();
      return store;
    })().catch((error) => {
      connection = null;
      throw error;
    });
  }
  return connection;
}

function isVip(purchase: StorePurchase): boolean {
  return (VIP_PRODUCT_IDS as readonly string[]).includes(purchase.productId);
}

function jwsOf(purchase: StorePurchase): string | null {
  const jws = purchase.jwsRepresentationIos || purchase.verificationResultIOS;
  return typeof jws === 'string' && jws.split('.').length === 3 ? jws : null;
}

function keyOf(purchase: StorePurchase): string {
  return purchase.transactionId || (jwsOf(purchase) ?? '');
}

/**
 * Sends VIP transactions to the server, then finishes them with StoreKit. A
 * transaction is finished only after the server accepted it, so a failed sync
 * is redelivered on the next launch. StoreKit reports a purchase twice (the
 * purchase call and the update listener); both share one server call.
 */
function deliver(store: Iap, purchases: readonly StorePurchase[]): Promise<VipSyncResult | null> {
  const vip = purchases.filter(p => isVip(p) && jwsOf(p));
  if (!vip.length) return Promise.resolve(null);
  const fresh = vip.filter(p => !delivered.has(keyOf(p)));
  if (!fresh.length) return delivered.get(keyOf(vip[vip.length - 1])) ?? Promise.resolve(null);

  const promise = (async () => {
    const result = await syncVip(fresh.map(p => jwsOf(p) as string));
    await Promise.all(fresh.map(p => store.finishTransaction({ purchase: p }).catch(() => undefined)));
    return result;
  })();
  fresh.forEach(p => delivered.set(keyOf(p), promise));
  promise.catch(() => fresh.forEach((p) => {
    if (delivered.get(keyOf(p)) === promise) delivered.delete(keyOf(p));
  }));
  return promise;
}

export type VipPlan = {
  readonly productId: string;
  readonly title: string;
  /** "$29.99" in the player's storefront currency. */
  readonly price: string;
  /** The same price as a number, for comparing plans. */
  readonly amount: number;
  /** "year", "month", "6 months". */
  readonly period: string;
  /** "1 week free" when the player can still get the intro trial. */
  readonly trial: string | null;
};

function unitWord(unit: string | undefined): string {
  switch ((unit ?? '').toUpperCase()) {
    case 'DAY': return 'day';
    case 'WEEK': return 'week';
    case 'YEAR': return 'year';
    default: return 'month';
  }
}

function periodText(count: string | number | undefined, unit: string | undefined): string {
  const n = Number(count) || 1;
  const word = unitWord(unit);
  return n === 1 ? word : `${n} ${word}s`;
}

const SMALL_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** "One week", "Three days": in words, because the body font's 1 reads as a capital I. */
function trialLength(count: string | number | undefined, unit: string | undefined): string {
  const n = Number(count) || 1;
  const word = SMALL_NUMBERS[n] ?? String(n);
  return `${word[0].toUpperCase()}${word.slice(1)} ${unitWord(unit)}${n === 1 ? '' : 's'}`;
}

/** Builds a plan from the App Store product; exported for tests. */
export function toPlan(product: StoreSubscription, trialEligible: boolean): VipPlan {
  const freeTrial = trialEligible && product.introductoryPricePaymentModeIOS === 'FREETRIAL';
  return {
    productId: product.productId,
    title: product.title,
    price: product.localizedPrice,
    amount: Number(product.price) || 0,
    period: periodText(product.subscriptionPeriodNumberIOS, product.subscriptionPeriodUnitIOS),
    trial: freeTrial
      ? `${trialLength(product.introductoryPriceNumberOfPeriodsIOS, product.introductoryPriceSubscriptionPeriodIOS)} free`
      : null,
  };
}

/** The VIP plans from the App Store, yearly first. Empty when none load. */
export async function loadVipPlans(): Promise<VipPlan[]> {
  if (__DEV__) { const cap = devCapture(); if (cap?.capturePrices()) return (lastVipPlans = cap.captureVipPlans()); }
  const store = await connect();
  const products = await store.getSubscriptions({ skus: [...VIP_PRODUCT_IDS] });
  const eligible = await store.IapIosSk2.isEligibleForIntroOffer(VIP_SUBSCRIPTION_GROUP_ID).then(Boolean).catch(() => false);
  const plans = VIP_PRODUCT_IDS
    .map(id => products.find(p => p.productId === id))
    .filter((p): p is StoreSubscription => !!p)
    .map(p => toPlan(p, eligible));
  if (plans.length) lastVipPlans = plans;
  return plans;
}

let lastVipPlans: VipPlan[] | null = null;
let vipPlansInFlight: Promise<VipPlan[] | null> | null = null;

/** The last plans the App Store gave, for the VIP door gate's price line. Null until one load works. */
export function cachedVipPlans(): VipPlan[] | null {
  return lastVipPlans;
}

/** Loads the plans once in the background (Supplies and the paywall warm it). One load at a time; never throws. */
export function warmVipPlans(): Promise<VipPlan[] | null> {
  if (!storeAvailable()) return Promise.resolve(null);
  vipPlansInFlight ??= loadVipPlans().catch(() => null).finally(() => { vipPlansInFlight = null; });
  return vipPlansInFlight;
}

export type PurchaseOutcome =
  | 'success' // the server verified it and VIP is on
  | 'cancelled'
  | 'pending' // Ask to Buy or similar; it lands later through the listener
  | 'unverified' // Apple charged, the server has not confirmed yet; retried on next launch
  | 'owned_elsewhere' // this Apple ID's VIP belongs to another account
  | 'unavailable' // old binary without StoreKit
  | 'failed';

function errorCode(error: unknown): string {
  return String((error as { code?: unknown })?.code ?? '');
}

export async function buyVip(plan: VipPlan): Promise<PurchaseOutcome> {
  if (!storeAvailable()) return 'unavailable';
  let store: Iap;
  let purchase: StorePurchase | null = null;
  try {
    store = await connect();
    const bought = await store.requestSubscription({ sku: plan.productId, andDangerouslyFinishTransactionAutomaticallyIOS: false });
    purchase = (Array.isArray(bought) ? bought[0] : bought) ?? null;
  } catch (error) {
    const code = errorCode(error);
    if (code === 'E_USER_CANCELLED') return 'cancelled';
    if (code === 'E_DEFERRED_PAYMENT') return 'pending';
    return 'failed';
  }
  if (!purchase) return 'pending';
  try {
    const result = await deliver(store, [purchase]);
    return result?.subscribed ? 'success' : 'unverified';
  } catch (error) {
    return vipSyncErrorCode(error) === 'VIP_OWNED_BY_OTHER_PLAYER' ? 'owned_elsewhere' : 'unverified';
  }
}

export type RestoreOutcome = 'restored' | 'nothing' | 'owned_elsewhere' | 'unavailable' | 'failed';

/**
 * Restore button: asks the App Store to sync (Apple ID sign-in if needed),
 * then sends every current VIP entitlement to the server.
 */
export async function restoreVip(): Promise<RestoreOutcome> {
  if (!storeAvailable()) return 'unavailable';
  try {
    const store = await connect();
    await store.IapIosSk2.sync().catch((error: unknown) => {
      if (errorCode(error) === 'E_USER_CANCELLED') throw error;
    });
    const entitlements = await currentVipEntitlements(store);
    if (!entitlements.length) return 'nothing';
    delivered.clear(); // a restore always re-sends
    const result = await deliver(store, entitlements);
    return result?.subscribed ? 'restored' : 'nothing';
  } catch (error) {
    if (vipSyncErrorCode(error) === 'VIP_OWNED_BY_OTHER_PLAYER') return 'owned_elsewhere';
    return errorCode(error) === 'E_USER_CANCELLED' ? 'nothing' : 'failed';
  }
}

async function currentVipEntitlements(store: Iap): Promise<StorePurchase[]> {
  // currentEntitlements only reports products StoreKit has loaded this run.
  await store.getSubscriptions({ skus: [...VIP_PRODUCT_IDS] });
  const purchases = await store.getAvailablePurchases({ onlyIncludeActiveItems: true });
  return purchases.filter(isVip);
}

// ── Supplies shop (consumables) ─────────────────────────────

/** Every Supplies product is ours and not VIP, a VIP gift plan or a Shark Pass (server config/shop.php owns the list). */
export function isShopProduct(productId: string | undefined | null): boolean {
  return typeof productId === 'string' && productId.startsWith('com.themeparkshark.app.')
    && !(VIP_PRODUCT_IDS as readonly string[]).includes(productId) && !isSharkPassProduct(productId) && !isVipGiftProduct(productId);
}

/** Non-renewing VIP a grown-up buys (1 or 12 months): com.themeparkshark.app.vip.gift.<n>m. */
export const VIP_GIFT_PRODUCT_IDS = ['com.themeparkshark.app.vip.gift.1m', 'com.themeparkshark.app.vip.gift.12m'] as const;
export function isVipGiftProduct(productId: string | undefined | null): boolean {
  return typeof productId === 'string' && productId.startsWith('com.themeparkshark.app.vip.gift.');
}

/** One App Store Non-Consumable per Shark Pass season: com.themeparkshark.app.sharkpass.<season>. */
export function isSharkPassProduct(productId: string | undefined | null): boolean {
  return typeof productId === 'string' && /^com\.themeparkshark\.app\.sharkpass(_plus)?\./.test(productId);
}
export const SHARK_PASS_PREFIX = 'com.themeparkshark.app.sharkpass.';

const shopDelivered = new Map<string, Promise<ShopRedeemResult>>();
/** The shop day the player was looking at when they tapped Buy (Daily Deal grace). */
const shownDayFor = new Map<string, string>();
type ShopListener = (result: ShopRedeemResult) => void;
const shopListeners = new Set<ShopListener>();

/** Purchases that land outside a Buy tap (Ask to Buy approved, last run's unfinished). */
export function onShopDelivered(listener: ShopListener): () => void {
  shopListeners.add(listener);
  return () => { shopListeners.delete(listener); };
}

/**
 * Sends one consumable to the server, then finishes it with StoreKit. Finished
 * only after the server granted it (or already had), so a failed delivery is
 * replayed by StoreKit on the next launch. One server call per transaction even
 * when StoreKit reports it twice.
 */
function deliverShop(store: Iap, purchase: StorePurchase): Promise<ShopRedeemResult | null> {
  const jws = jwsOf(purchase);
  if (!isShopProduct(purchase.productId) || !jws) return Promise.resolve(null);
  const key = keyOf(purchase);
  const pending = shopDelivered.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const result = await redeemShopPurchase(jws, shownDayFor.get(purchase.productId) ?? null);
    await store.finishTransaction({ purchase, isConsumable: true }).catch(() => undefined);
    shopListeners.forEach((listener) => { try { listener(result); } catch { /* a screen's problem */ } });
    return result;
  })();
  shopDelivered.set(key, promise);
  promise.catch(() => { if (shopDelivered.get(key) === promise) shopDelivered.delete(key); });
  return promise;
}

export type ShopPrice = {
  readonly productId: string;
  /** "$1.99" in the player's storefront currency: what Apple will charge. */
  readonly price: string;
  readonly amount: number;
};

/** Apple's localized prices for the shop products. Missing products are left out. */
export async function loadShopPrices(productIds: readonly string[]): Promise<Record<string, ShopPrice>> {
  const ids = productIds.filter(isShopProduct);
  if (!ids.length) return {};
  if (__DEV__) { const cap = devCapture(); if (cap?.capturePrices()) return cap.captureShopPrices(ids); }
  const store = await connect();
  const products: StoreProduct[] = await store.getProducts({ skus: [...ids] });
  const prices: Record<string, ShopPrice> = {};
  for (const product of products) {
    if (!product?.productId || !product.localizedPrice) continue;
    prices[product.productId] = { productId: product.productId, price: product.localizedPrice, amount: Number(product.price) || 0 };
  }
  return prices;
}

export type ShopPurchaseOutcome =
  | { status: 'success'; result: ShopRedeemResult } // granted by the server
  | { status: 'cancelled' | 'pending' | 'unverified' | 'other_account' | 'unavailable' | 'failed' };

/**
 * Buys one consumable. accountToken (from GET /me/shop) tags the purchase with
 * the buyer; shownDay is the shop day on screen, for the Daily Deal.
 */
export async function buyShopProduct(
  productId: string, options: { accountToken?: string | null; shownDay?: string | null } = {},
): Promise<ShopPurchaseOutcome> {
  if (!storeAvailable()) return { status: 'unavailable' };
  if (!isShopProduct(productId)) return { status: 'failed' };
  let store: Iap;
  let purchase: StorePurchase | null = null;
  if (options.shownDay) shownDayFor.set(productId, options.shownDay);
  try {
    store = await connect();
    const bought = await store.requestPurchase({
      sku: productId,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
      ...(options.accountToken ? { appAccountToken: options.accountToken } : {}),
    });
    purchase = (Array.isArray(bought) ? bought[0] : bought) ?? null;
  } catch (error) {
    const code = errorCode(error);
    if (code === 'E_USER_CANCELLED') return { status: 'cancelled' };
    if (code === 'E_DEFERRED_PAYMENT') return { status: 'pending' };
    return { status: 'failed' };
  }
  if (!purchase) return { status: 'pending' };
  try {
    const result = await deliverShop(store, purchase);
    return result ? { status: 'success', result } : { status: 'unverified' };
  } catch (error) {
    return shopErrorCode(error) === 'SHOP_PURCHASE_OTHER_PLAYER' ? { status: 'other_account' } : { status: 'unverified' };
  }
}

let launchSyncedFor: string | null = null;

/**
 * Once per app run per signed-in player: send the current VIP entitlement so
 * a renewal (or a lapse the server already swept) is reflected without any
 * webhook. Connecting also starts the update listener, which replays shop
 * purchases left unfinished last run, so they are delivered now. Silent;
 * never throws.
 */
export function syncVipOnLaunch(playerId: number | string | null | undefined): void {
  if (playerId === null || playerId === undefined || !storeAvailable()) return;
  const id = String(playerId);
  if (launchSyncedFor === id) return;
  launchSyncedFor = id;
  void (async () => {
    const store = await connect();
    const entitlements = await currentVipEntitlements(store);
    if (entitlements.length) await deliver(store, entitlements);
    // Warm the VIP prices so the VIP door gate can say them at once (clarity pass).
    else void warmVipPlans();
  })().catch(() => {
    if (launchSyncedFor === id) launchSyncedFor = null;
  });
}

/**
 * Apple's auto-renewal disclosure for the chosen plan: its price, billing
 * period and any free trial. Says "Apple ID" (not iTunes).
 */
export function legalText(plan: Pick<VipPlan, 'price' | 'period' | 'trial'>): string {
  const billing = priceText(plan);
  const lead = plan.trial ? `${plan.trial}, then ${billing}.` : `${billing}.`;
  // clarity-allow: Apple's required subscription terms (grown-up copy)
  return `${lead} Payment is charged to your Apple ID ${plan.trial ? 'when the free trial ends' : 'when you confirm the purchase'}. `
    + 'VIP renews automatically unless it is turned off at least 24 hours before the end of the current period, '
    + 'and your account is charged for renewal within 24 hours before that. '
    + 'Manage or cancel anytime in your Apple ID account settings.';
}

/**
 * "SAVE 50%" for the yearly plan against twelve months of the monthly one,
 * from the real storefront prices. null unless both plans load and yearly is
 * actually cheaper.
 */
export function savingsText(plans: readonly Pick<VipPlan, 'period' | 'amount'>[]): string | null {
  const yearly = plans.find(p => p.period === 'year');
  const monthly = plans.find(p => p.period === 'month');
  if (!yearly || !monthly || yearly.amount <= 0 || monthly.amount <= 0) return null;
  const percent = Math.floor((1 - yearly.amount / (monthly.amount * 12)) * 100);
  return percent >= 5 ? `SAVE ${percent}%` : null;
}

/** "$4.99 a month" (or "every 3 months"): words, not a slash. */
export function priceText(plan: Pick<VipPlan, 'price' | 'period'>): string {
  return `${plan.price} ${/\s/.test(plan.period) ? 'every' : 'a'} ${plan.period}`;
}

// ── Shark Pass (one Non-Consumable per season) ─────────────

/** Loaded on first use, so VIP and Supplies never pull the pass client in. */
function sharkPassApi(): typeof import('../api/endpoints/me/shark-pass') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../api/endpoints/me/shark-pass');
}

const passDelivered = new Map<string, Promise<SharkPassState>>();
type PassListener = (state: SharkPassState) => void;
const passListeners = new Set<PassListener>();

/** A Shark Pass that lands outside a Buy tap (Ask to Buy approved, last run's unfinished). */
export function onSharkPassDelivered(listener: PassListener): () => void {
  passListeners.add(listener);
  return () => { passListeners.delete(listener); };
}

/** Sends a Shark Pass transaction to the server, then finishes it. Once per transaction even when reported twice. */
function deliverPass(store: Iap, purchase: StorePurchase): Promise<SharkPassState | null> {
  const jws = jwsOf(purchase);
  if (!isSharkPassProduct(purchase.productId) || !jws) return Promise.resolve(null);
  const key = keyOf(purchase);
  const pending = passDelivered.get(key);
  if (pending) return pending;
  const promise = (async () => {
    const state = await sharkPassApi().redeemSharkPass(jws);
    await store.finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
    passListeners.forEach((listener) => { try { listener(state); } catch { /* a screen's problem */ } });
    return state;
  })();
  passDelivered.set(key, promise);
  promise.catch(() => { if (passDelivered.get(key) === promise) passDelivered.delete(key); });
  return promise;
}

/** Apple's localized price for this season's Shark Pass, or null. */
export async function loadSharkPassPrice(productId: string): Promise<ShopPrice | null> {
  if (!isSharkPassProduct(productId)) return null;
  if (__DEV__) { const cap = devCapture(); if (cap?.capturePrices()) return { productId, price: '$4.99', amount: 4.99 }; }
  const store = await connect();
  const [product] = await store.getProducts({ skus: [productId] });
  return product?.localizedPrice ? { productId, price: product.localizedPrice, amount: Number(product.price) || 0 } : null;
}

export type PassPurchaseOutcome =
  | { status: 'success'; state: SharkPassState }
  | { status: 'cancelled' | 'pending' | 'unverified' | 'other_account' | 'unavailable' | 'failed' };

/** Buys this season's Shark Pass. The caller has already asked a grown-up. */
export async function buySharkPass(productId: string, accountToken?: string | null): Promise<PassPurchaseOutcome> {
  if (!storeAvailable()) return { status: 'unavailable' };
  if (!isSharkPassProduct(productId)) return { status: 'failed' };
  let store: Iap;
  let purchase: StorePurchase | null = null;
  try {
    store = await connect();
    const bought = await store.requestPurchase({
      sku: productId, andDangerouslyFinishTransactionAutomaticallyIOS: false,
      ...(accountToken ? { appAccountToken: accountToken } : {}),
    });
    purchase = (Array.isArray(bought) ? bought[0] : bought) ?? null;
  } catch (error) {
    const code = errorCode(error);
    if (code === 'E_USER_CANCELLED') return { status: 'cancelled' };
    if (code === 'E_DEFERRED_PAYMENT') return { status: 'pending' };
    return { status: 'failed' };
  }
  if (!purchase) return { status: 'pending' };
  try {
    const state = await deliverPass(store, purchase);
    return state ? { status: 'success', state } : { status: 'unverified' };
  } catch (error) {
    return sharkPassApi().sharkPassErrorCode(error) === 'SHARK_PASS_OTHER_PLAYER' ? { status: 'other_account' } : { status: 'unverified' };
  }
}

/** Restore: every Shark Pass this Apple ID owns goes to the server again. */
export async function restoreSharkPass(productId: string): Promise<'restored' | 'nothing' | 'other_account' | 'unavailable' | 'failed'> {
  if (!storeAvailable()) return 'unavailable';
  try {
    const store = await connect();
    await store.IapIosSk2.sync().catch(() => undefined);
    await store.getProducts({ skus: [productId] });
    const owned = (await store.getAvailablePurchases({ onlyIncludeActiveItems: true })).filter(p => isSharkPassProduct(p.productId));
    if (!owned.length) return 'nothing';
    passDelivered.clear();
    let restored = false;
    for (const purchase of owned) {
      const state = await deliverPass(store, purchase);
      if (state && 'progress' in state && state.progress?.premium) restored = true;
    }
    return restored ? 'restored' : 'nothing';
  } catch (error) {
    return sharkPassApi().sharkPassErrorCode(error) === 'SHARK_PASS_OTHER_PLAYER' ? 'other_account' : 'failed';
  }
}

// ── VIP gift plans (non-renewing) ─────────────

const giftDelivered = new Map<string, Promise<VipGiftPlanState>>();
export type VipGiftPlanState = { readonly vip: boolean; readonly gift_until: string | null; readonly gift_last_day: string | null };

function deliverVipGift(store: Iap, purchase: StorePurchase): Promise<VipGiftPlanState | null> {
  const jws = jwsOf(purchase);
  if (!isVipGiftProduct(purchase.productId) || !jws) return Promise.resolve(null);
  const key = keyOf(purchase);
  const pending = giftDelivered.get(key);
  if (pending) return pending;
  const promise = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('../api/endpoints/me/vip-gift') as typeof import('../api/endpoints/me/vip-gift');
    const state = await api.redeemVipGiftPlan(jws);
    await store.finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
    return state;
  })();
  giftDelivered.set(key, promise);
  promise.catch(() => { if (giftDelivered.get(key) === promise) giftDelivered.delete(key); });
  return promise;
}

/** Apple's prices for the VIP gift plans. Empty when the products don't exist yet. */
export async function loadVipGiftPrices(): Promise<Record<string, ShopPrice>> {
  if (__DEV__) { const cap = devCapture(); if (cap?.capturePrices()) return { 'com.themeparkshark.app.vip.gift.1m': { productId: 'com.themeparkshark.app.vip.gift.1m', price: '$4.99', amount: 4.99 }, 'com.themeparkshark.app.vip.gift.12m': { productId: 'com.themeparkshark.app.vip.gift.12m', price: '$39.99', amount: 39.99 } }; }
  if (!storeAvailable()) return {};
  const store = await connect();
  const products: StoreProduct[] = await store.getProducts({ skus: [...VIP_GIFT_PRODUCT_IDS] });
  const out: Record<string, ShopPrice> = {};
  for (const p of products) if (p?.productId && p.localizedPrice) out[p.productId] = { productId: p.productId, price: p.localizedPrice, amount: Number(p.price) || 0 };
  return out;
}

/** Buys a VIP gift plan. The caller has already asked a grown-up. */
export async function buyVipGift(productId: string, accountToken?: string | null): Promise<{ status: 'success'; state: VipGiftPlanState } | { status: 'cancelled' | 'pending' | 'unverified' | 'other_account' | 'unavailable' | 'failed' }> {
  if (!storeAvailable()) return { status: 'unavailable' };
  if (!isVipGiftProduct(productId)) return { status: 'failed' };
  let store: Iap;
  let purchase: StorePurchase | null = null;
  try {
    store = await connect();
    const bought = await store.requestPurchase({ sku: productId, andDangerouslyFinishTransactionAutomaticallyIOS: false,
      ...(accountToken ? { appAccountToken: accountToken } : {}) });
    purchase = (Array.isArray(bought) ? bought[0] : bought) ?? null;
  } catch (error) {
    const code = errorCode(error);
    if (code === 'E_USER_CANCELLED') return { status: 'cancelled' };
    if (code === 'E_DEFERRED_PAYMENT') return { status: 'pending' };
    return { status: 'failed' };
  }
  if (!purchase) return { status: 'pending' };
  try {
    const state = await deliverVipGift(store, purchase);
    return state ? { status: 'success', state } : { status: 'unverified' };
  } catch (error) {
    const code = String((error as { response?: { data?: { code?: unknown } } })?.response?.data?.code ?? '');
    return code === 'VIP_GIFT_OTHER_PLAYER' ? { status: 'other_account' } : { status: 'unverified' };
  }
}
