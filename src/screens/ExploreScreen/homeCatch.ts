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
  | { readonly kind: 'caught'; readonly data: RedeemPrepItemResponseType['data'] }
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
