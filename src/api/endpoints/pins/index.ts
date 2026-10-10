/**
 * Pins v2 endpoints (dustin-feedback-oct8/pins/DECISION.md). A server without
 * them answers 404; the Pins page then shows the old Pin Packs screen.
 */
import type { LanyardPin, OpenResult, PinHome } from '../../../screens/pins/pinsModel';
import client from '../../client';

export async function getPinHome(region?: string | null): Promise<PinHome> {
  const { data } = await client.get<{ data: PinHome }>('/pins/home', { params: region ? { region } : {} });
  return data.data;
}

export async function openMysteryBoxes(seriesId: number, body: { count: number; pay: 'coins' | 'free'; request_id: string; region: string | null; box?: 'golden'; odds_key?: string }): Promise<OpenResult> {
  const { data } = await client.post<{ data: OpenResult }>(`/mystery-series/${seriesId}/open`, body,
    // The reveal says what you got; no duplicate banner.
    { skipBroadcasts: true } as object);
  return data.data;
}

export async function claimParkSet(setId: number): Promise<{ claimed: boolean; coins: number; boxes: number; completer_item_id: number | null; coins_now: number }> {
  const { data } = await client.post(`/pin-collections/${setId}/claim`, {}, { skipBroadcasts: true } as object);
  return data.data;
}

export async function saveLanyard(itemIds: number[]): Promise<LanyardPin[]> {
  const { data } = await client.put('/me/lanyard', { item_ids: itemIds });
  return data.data.lanyard;
}

export async function getPlayerLanyard(playerId: number): Promise<{ lanyard: LanyardPin[]; pins: number; sets_done: number; chasers?: number; best_serial?: number | null; completers?: { item_id: number; name: string; icon_url: string | null }[]; first_finds?: number; title?: string | null; showcase?: { item_id: number; name: string; icon_url: string | null; label: string; kind: 'gold' | 'park' } | null }> {
  const { data } = await client.get(`/players/${playerId}/lanyard`);
  return data.data;
}

export async function getPinOfTheDay(parkId: number, at: { latitude: number; longitude: number } | null): Promise<import('../../../screens/pins/pinsModel').HuntStatus> {
  const { data } = await client.get(`/parks/${parkId}/pin-of-the-day`, { params: at ?? {} });
  return data.data;
}

export async function catchPinOfTheDay(parkId: number, at: { latitude: number; longitude: number; accuracy?: number }): Promise<{ caught: boolean; new: boolean; coins: number; coins_now: number; pin: { item_id: number; name: string; icon_url: string | null; set_id: number; rarity?: string }; park_name?: string | null; day?: string; catch_number?: number }> {
  const { data } = await client.post(`/parks/${parkId}/pin-of-the-day/catch`, at, { skipBroadcasts: true } as object);
  return data.data;
}

export async function pickWithPoints(seriesId: number, itemId: number, requestId: string): Promise<{ picked: boolean; item_id: number; points: number; series: import('../../../screens/pins/pinsModel').MysterySeries }> {
  const { data } = await client.post(`/mystery-series/${seriesId}/pick`, { item_id: itemId, request_id: requestId }, { skipBroadcasts: true } as object);
  return data.data;
}

let storefront: Promise<string | null> | null = null;
/**
 * The App Store storefront country (StoreKit, ISO alpha-3, e.g. "BEL"): the
 * paid-box region rule uses the store, not the phone's language. Null where
 * StoreKit isn't available (the caller falls back to the device region).
 */
export function storefrontRegion(): Promise<string | null> {
  storefront ??= (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { storeAvailable } = require('../../../services/purchases') as typeof import('../../../services/purchases');
      if (!storeAvailable()) return null;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const iap = require('react-native-iap') as typeof import('react-native-iap');
      const code = await iap.getStorefront();
      return typeof code === 'string' && /^[A-Za-z]{2,3}$/.test(code) ? code.toUpperCase() : null;
    } catch { return null; }
  })();
  return storefront;
}
