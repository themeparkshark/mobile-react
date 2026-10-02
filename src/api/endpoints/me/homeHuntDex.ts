/**
 * Home Hunt v3 collection book endpoints (next-wave/home-hunt-v3/CONTRACT.md
 * sections 3.1 and 3.2). Optional: a server without them answers 404, and the
 * book keeps reading the legacy /me/prep-item-sets endpoints. After one 404
 * the app stops asking for the rest of the session.
 */
import client from '../../client';
import deviceTimeZone from '../../../helpers/deviceTimeZone';
import type { LocationType } from '../../../models/location-type';

let unsupported = false;

function params(location?: LocationType | null) {
  return { ...(location ? { lat: location.latitude, lng: location.longitude } : {}), timezone: deviceTimeZone() };
}

async function optionalGet(path: string, location?: LocationType | null): Promise<unknown | null> {
  if (unsupported) return null;
  try {
    const { data } = await client.get<{ success?: boolean; data?: unknown }>(path, { params: params(location), timeout: 8000 });
    return data?.data ?? null;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 405) unsupported = true;
    return null;
  }
}

/** The v3 set list, or null when the server does not have it yet. */
export function getHomeHuntDex(location?: LocationType | null): Promise<unknown | null> {
  return optionalGet('/me/home-hunt/dex', location);
}

/** One v3 set with its items, or null. */
export function getHomeHuntDexSet(slug: string, location?: LocationType | null): Promise<unknown | null> {
  return optionalGet(`/me/home-hunt/dex/${encodeURIComponent(slug)}`, location);
}

/** Test hook. */
export function resetHomeHuntDexSupport(): void {
  unsupported = false;
}
