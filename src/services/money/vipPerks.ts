import getVipPerks, { type VipPerk } from '../../api/endpoints/economy/vip-perks';
import { vipRideMultiplier } from './offers';

/**
 * The server's VIP perk lines, loaded once per app run for the small places
 * that quote them (the post-win VIP line). Never throws; null until loaded.
 */
let perks: (VipPerk & { key?: string })[] | null = null;
let pending: Promise<void> | null = null;

export function warmVipPerks(): Promise<void> {
  pending ??= getVipPerks().then((next) => { if (next) perks = next; }).catch(() => undefined).finally(() => { pending = null; });
  return pending;
}

/** The ride multiplier the server says VIP gets, or null when it hasn't said. */
export function vipRideMultiplierNow(): number | null {
  return vipRideMultiplier(perks);
}
