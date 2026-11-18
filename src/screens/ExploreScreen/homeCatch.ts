import type { RedeemCatchDetails } from '../../api/endpoints/me/prep-items/redeem';
import type { RedeemPrepItemResponseType } from '../../models/redeem-prep-item-response-type';
import { catchErrorLine } from './findPresentation';

/**
 * The catch's server round trip, kept free of React so it can be tested: pick
 * the freshest GPS fix, redeem, and turn every failure into one plain line.
 * The server still enforces the pickup distance.
 */

type Fix = { readonly latitude: number | null | undefined; readonly longitude: number | null | undefined };

/** A GPS sample this fresh beats the map's smoothed position (filtered for drift). */
export const FRESH_SAMPLE_MS = 15_000;

export function pickupFix(latest: (Fix & { readonly timestamp: number }) | null | undefined, mapFix: Fix | null | undefined,
  now: number): { latitude: number; longitude: number } | null {
  const fresh = latest && now - latest.timestamp <= FRESH_SAMPLE_MS ? latest : null;
  const fix = fresh ?? mapFix;
  if (fix?.latitude == null || fix.longitude == null || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) {
    return null;
  }
  return { latitude: fix.latitude, longitude: fix.longitude };
}

export type CatchResult =
  /** `pending`: the moment plays now while a slow server finishes the claim (it retries quietly in the claim queue). */
  | { readonly kind: 'caught'; readonly data: RedeemPrepItemResponseType['data']; readonly pending?: boolean }
  | { readonly kind: 'gone'; readonly line: string }
  | { readonly kind: 'failed'; readonly line: string; readonly ridesLeft?: number | null };

type Redeem = (id: number, pivotId: number, latitude?: number, longitude?: number, details?: RedeemCatchDetails) => Promise<RedeemPrepItemResponseType>;

function errorStatus(error: unknown): { status: number | null; serverError: string | null; ridesLeft: number | null } {
  const response = (error as { response?: { status?: number; data?: { error?: unknown; photo?: { rides_left?: unknown } } } } | null)?.response;
  const serverError = response?.data?.error;
  const ridesLeft = response?.data?.photo?.rides_left;
  return { status: typeof response?.status === 'number' ? response.status : null,
    serverError: typeof serverError === 'string' ? serverError : null,
    // Ride Photo (Legendary): rides left after a ride-by (CONTRACT.md 3.5), for the catch reveal's escape.
    ridesLeft: typeof ridesLeft === 'number' && Number.isFinite(ridesLeft) ? ridesLeft : null };
}

export async function catchFind(redeem: Redeem, itemId: number, pivotId: number,
  fix: { latitude: number; longitude: number } | null, details?: RedeemCatchDetails): Promise<CatchResult> {
  if (!fix) return { kind: 'failed', line: 'Finding you on the map. Tap to try again.' };
  try {
    const response = await redeem(itemId, pivotId, fix.latitude, fix.longitude, details);
    if (!response?.data) return { kind: 'failed', line: catchErrorLine(null, null) };
    return { kind: 'caught', data: response.data };
  } catch (error) {
    const { status, serverError, ridesLeft } = errorStatus(error);
    const line = catchErrorLine(status, serverError);
    return status === 410 ? { kind: 'gone', line } : ridesLeft != null ? { kind: 'failed', line, ridesLeft } : { kind: 'failed', line };
  }
}

/** A treat catch waits this long for the server before its moment plays anyway (T175). */
export const CATCH_ANSWER_BUDGET_MS = 2500;

export type CatchClaim = {
  readonly itemId: number; readonly pivotId: number; readonly latitude: number; readonly longitude: number;
  readonly details?: RedeemCatchDetails;
};

type PendingItem = {
  readonly id: number; readonly name: string; readonly rarity?: number | null; readonly rarity_label?: string | null;
  readonly icon_url?: string | null; readonly set_name?: string | null; readonly set_slug?: string | null; readonly set_color?: string | null;
  readonly is_new_variant?: boolean; readonly flavor?: string | null;
};

/** The catch as the phone knows it while the server is slow: the find itself, and no reward numbers it cannot promise. */
export function pendingCatchData(item: PendingItem): RedeemPrepItemResponseType['data'] {
  return {
    rewards: { energy: 0, tickets: 0, coins: 0, experience: 0 },
    streak: { current: 0, multiplier: 1 },
    replayed: false,
    is_new_variant: item.is_new_variant ?? false,
    item: {
      id: item.id, name: item.name, rarity: item.rarity ?? 1, rarity_label: item.rarity_label ?? '',
      icon_url: item.icon_url ?? null, set_name: item.set_name ?? null, set_slug: item.set_slug ?? null,
      set_color: item.set_color ?? null, flavor: item.flavor ?? null,
    },
  };
}

/** No answer, a timeout or a busy server: the claim may still land (asking again is safe; a second claim is refused). */
export function catchAnswerWasLate(error: unknown): boolean {
  const response = (error as { response?: { status?: number } } | null)?.response;
  const status = typeof response?.status === 'number' && response.status > 0 ? response.status : null;
  return status === null || status >= 500 || status === 429 || status === 408;
}

/**
 * T175: a treat catch never fails because the server is slow. The claim goes out at once; if it has not
 * answered within CATCH_ANSWER_BUDGET_MS, or answers late with no word, the catch moment plays anyway and
 * the claim finishes quietly in the claim queue (queue). A real refusal that comes in time (it wandered
 * off, too far) still says so. Only for treat catches: a Ride Photo's Legendary roll is the server's call.
 */
export function catchFindQuick(redeem: Redeem, item: PendingItem, pivotId: number,
  fix: { latitude: number; longitude: number } | null, details: RedeemCatchDetails | undefined,
  queue: (claim: CatchClaim) => void, budgetMs: number = CATCH_ANSWER_BUDGET_MS,
  wait: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<CatchResult> {
  if (!fix) return catchFind(redeem, item.id, pivotId, fix, details);
  const claim: CatchClaim = { itemId: item.id, pivotId, latitude: fix.latitude, longitude: fix.longitude, details };
  const answer: Promise<CatchResult> = redeem(item.id, pivotId, fix.latitude, fix.longitude, details).then(
    (response): CatchResult => (response?.data ? { kind: 'caught', data: response.data } : { kind: 'caught', data: pendingCatchData(item), pending: true }),
    (error): CatchResult => {
      if (catchAnswerWasLate(error)) {
        queue(claim);
        return { kind: 'caught', data: pendingCatchData(item), pending: true };
      }
      const { status, serverError, ridesLeft } = errorStatus(error);
      const line = catchErrorLine(status, serverError);
      return status === 410 ? { kind: 'gone', line } : ridesLeft != null ? { kind: 'failed', line, ridesLeft } : { kind: 'failed', line };
    });
  const budget = wait(budgetMs).then((): CatchResult => ({ kind: 'caught', data: pendingCatchData(item), pending: true }));
  return Promise.race([answer, budget]);
}
