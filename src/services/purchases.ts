/**
 * VIP membership straight through Apple StoreKit 2 (react-native-iap in
 * STOREKIT2_MODE). No third-party account: the paywall loads the products from
 * the App Store, and every purchase, restore and launch sends Apple's signed
 * transactions (JWS) to POST /me/vip/sync, where the server verifies Apple's
 * signature and decides VIP. The client never decides VIP on its own.
 *
 * The native module ships in 1.7.0. On an older binary (1.6.0) running this JS
 * the module is missing: nothing here throws, storeAvailable() is false and the
 * paywall asks the player to update the app.
 */
import { NativeModules, Platform } from 'react-native';
import syncVip, { vipSyncErrorCode, type VipSyncResult } from '../api/endpoints/me/vip-sync';

/** App Store Connect: subscription group "VIP" (22421719). Yearly first. */
export const VIP_PRODUCT_IDS = ['com.themeparkshark.app.vip.yearly', 'com.themeparkshark.app.vip.monthly'] as const;
export const VIP_SUBSCRIPTION_GROUP_ID = '22421719';

type Iap = typeof import('react-native-iap');
type StoreSubscription = import('react-native-iap').SubscriptionIOS;
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

let connection: Promise<Iap> | null = null;
let listening = false;
const delivered = new Map<string, Promise<VipSyncResult>>();

/** STOREKIT2_MODE, one connection per app run, and the renewal listener. */
function connect(): Promise<Iap> {
  if (!connection) {
    connection = (async () => {
      const store = iap();
      store.setup({ storekitMode: 'STOREKIT2_MODE' });
      await store.initConnection();
      if (!listening) {
        listening = true;
        // Renewals, Ask to Buy approvals and refunds that arrive while the app
        // is open (StoreKit's Transaction.updates).
        store.purchaseUpdatedListener((purchase) => { void deliver(store, [purchase]).catch(() => undefined); });
      }
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

/** "1 week", "3 days". */
function trialLength(count: string | number | undefined, unit: string | undefined): string {
  const n = Number(count) || 1;
  return `${n} ${unitWord(unit)}${n === 1 ? '' : 's'}`;
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
  const store = await connect();
  const products = await store.getSubscriptions({ skus: [...VIP_PRODUCT_IDS] });
  const eligible = await store.IapIosSk2.isEligibleForIntroOffer(VIP_SUBSCRIPTION_GROUP_ID).then(Boolean).catch(() => false);
  return VIP_PRODUCT_IDS
    .map(id => products.find(p => p.productId === id))
    .filter((p): p is StoreSubscription => !!p)
    .map(p => toPlan(p, eligible));
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

let launchSyncedFor: string | null = null;

/**
 * Once per app run per signed-in player: send the current VIP entitlement so
 * a renewal (or a lapse the server already swept) is reflected without any
 * webhook. Silent; never throws.
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
  })().catch(() => {
    if (launchSyncedFor === id) launchSyncedFor = null;
  });
}

/**
 * Apple's auto-renewal disclosure for the chosen plan: its price, billing
 * period and any free trial. Says "Apple ID" (not iTunes).
 */
export function legalText(plan: Pick<VipPlan, 'price' | 'period' | 'trial'>): string {
  const billing = `${plan.price} per ${plan.period}`;
  const lead = plan.trial ? `${plan.trial}, then ${billing}.` : `${billing}.`;
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

export function priceText(plan: Pick<VipPlan, 'price' | 'period'>): string {
  return `${plan.price} / ${plan.period}`;
}
