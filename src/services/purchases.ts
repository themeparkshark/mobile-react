/**
 * VIP membership through Adapty. Activation happens once per app run; the
 * server learns about purchases from Adapty's webhook, so after a purchase or
 * restore we refresh the player until `is_subscribed` flips.
 */
import { adapty, type AdaptyPaywallProduct } from 'react-native-adapty';

// Adapty's public SDK key (safe to ship; it only identifies the app).
const ADAPTY_PUBLIC_KEY = 'public_live_CNR38UxN.UitJJkmc6YkTWeLTRpgH';
const PLACEMENT = 'vip_membership';
const ACCESS_LEVEL = 'premium';

let activation: Promise<void> | null = null;
let activatedFor: string | null = null;

export async function ensureAdapty(playerId: number | string): Promise<void> {
  const id = String(playerId);
  if (!activation) {
    activatedFor = id;
    activation = adapty.activate(ADAPTY_PUBLIC_KEY, { customerUserId: id }).catch((e) => {
      activation = null;
      throw e;
    });
  }
  await activation;
  if (activatedFor !== id) {
    activatedFor = id;
    await adapty.identify(id);
  }
}

export type VipProduct = AdaptyPaywallProduct;

export async function loadVipProduct(playerId: number | string): Promise<VipProduct | null> {
  await ensureAdapty(playerId);
  const paywall = await adapty.getPaywall(PLACEMENT);
  const products = await adapty.getPaywallProducts(paywall);
  adapty.logShowPaywall(paywall).catch(() => undefined);
  return products[0] ?? null;
}

export type PurchaseOutcome = 'success' | 'cancelled' | 'pending' | 'failed';

export async function buyVip(product: VipProduct): Promise<PurchaseOutcome> {
  try {
    const result = await adapty.makePurchase(product);
    if (result.type === 'success') return 'success';
    return result.type === 'user_cancelled' ? 'cancelled' : 'pending';
  } catch {
    return 'failed';
  }
}

/** True when the restored Apple ID has an active VIP subscription. */
export async function restoreVip(): Promise<boolean> {
  const profile = await adapty.restorePurchases();
  const levels = profile.accessLevels ?? {};
  return Object.values(levels).some(level => level?.isActive) || !!levels[ACCESS_LEVEL]?.isActive;
}

/** "3-day free trial" style text for the product's intro offer, if it has one. */
export function trialText(product: VipProduct): string | null {
  const phase = product.subscription?.offer?.phases?.[0];
  if (!phase || phase.paymentMode !== 'free_trial') return null;
  const length = phase.localizedNumberOfPeriods ?? phase.localizedSubscriptionPeriod;
  return length ? `${length} free` : 'Free trial';
}

export function priceText(product: VipProduct): string {
  const price = product.price?.localizedString ?? '';
  const period = product.subscription?.localizedSubscriptionPeriod;
  return period ? `${price} / ${period}` : price;
}

/**
 * Apple's auto-renewal disclosure, built from the real product: its price,
 * billing period and any free trial. Says "Apple ID" (not iTunes).
 */
export function legalText(product: VipProduct): string {
  const price = product.price?.localizedString ?? '';
  const period = product.subscription?.localizedSubscriptionPeriod;
  const trial = trialText(product);
  const billing = period ? `${price} per ${period}` : price;
  const lead = trial ? `${trial}, then ${billing}.` : `${billing}.`;
  return `${lead} Payment is charged to your Apple ID ${trial ? 'when the free trial ends' : 'when you confirm the purchase'}. `
    + 'VIP renews automatically unless it is turned off at least 24 hours before the end of the current period, '
    + 'and your account is charged for renewal within 24 hours before that. '
    + 'Manage or cancel anytime in your Apple ID account settings.';
}

/**
 * Link the signed-in player to Adapty as soon as they log in, so renewals,
 * restores and webhooks always carry their id. Safe to call repeatedly.
 */
export function activateVipForPlayer(playerId: number | string | null | undefined): void {
  if (playerId === null || playerId === undefined) return;
  ensureAdapty(playerId).catch(() => undefined);
}
