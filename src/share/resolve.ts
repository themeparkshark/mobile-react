/**
 * Get a request ready to show in at most RESOLVE_BUDGET_MS: start the art
 * downloads and, when the payload names an ownedRef, ask the server for the
 * percent-of-players number. Whatever isn't back in time is skipped (the card
 * shows bundled art until the real art lands, and no percent line).
 */
import { Image } from 'expo-image';
import { getFlexRarity } from '../api/endpoints/me/share';
import { OWNED_KINDS } from './copy';
import type { FlexKind, FlexPayload } from './types';

export const RESOLVE_BUDGET_MS = 600;

/** Every remote URL in a payload (art, coins, badges), for prefetch. */
export function payloadUrls(payload: unknown): string[] {
  const out = new Set<string>();
  const walk = (value: unknown, key = ''): void => {
    if (typeof value === 'string') {
      if (/^https?:\/\//.test(value) && !/inventory/i.test(key)) out.add(value);
    } else if (Array.isArray(value)) value.forEach(item => walk(item, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { if (k !== 'inventory') walk(v, k); });
  };
  walk(payload);
  return [...out];
}

const timeout = <T,>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms));

export async function resolveFlexPayload<K extends FlexKind>(kind: K, payload: FlexPayload<K>, budget = RESOLVE_BUDGET_MS): Promise<FlexPayload<K>> {
  const urls = payloadUrls(payload);
  if (urls.length) void Image.prefetch(urls).catch(() => false);
  const ref = payload.ownedRef;
  if (payload.ownedPct != null || ref == null || ref === '' || !OWNED_KINDS.has(kind)) return payload;
  const pct = await Promise.race([getFlexRarity(kind, ref), timeout(budget, null)]);
  return pct == null ? payload : { ...payload, ownedPct: pct };
}
