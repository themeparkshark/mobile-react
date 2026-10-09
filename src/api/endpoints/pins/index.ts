/**
 * Pins v2 endpoints (dustin-feedback-oct8/pins/DECISION.md). A server without
 * them answers 404; the Pins page then shows the old Pin Packs screen.
 */
import type { LanyardPin, OpenResult, PinHome } from '../../../screens/pins/pinsModel';
import client from '../../client';

export async function getPinHome(): Promise<PinHome> {
  const { data } = await client.get<{ data: PinHome }>('/pins/home');
  return data.data;
}

export async function openMysteryBoxes(seriesId: number, body: { count: number; pay: 'coins' | 'free'; request_id: string; region: string | null }): Promise<OpenResult> {
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

export async function getPlayerLanyard(playerId: number): Promise<{ lanyard: LanyardPin[]; pins: number; sets_done: number }> {
  const { data } = await client.get(`/players/${playerId}/lanyard`);
  return data.data;
}

export async function getPinOfTheDay(parkId: number, at: { latitude: number; longitude: number } | null): Promise<import('../../../screens/pins/pinsModel').HuntStatus> {
  const { data } = await client.get(`/parks/${parkId}/pin-of-the-day`, { params: at ?? {} });
  return data.data;
}

export async function catchPinOfTheDay(parkId: number, at: { latitude: number; longitude: number }): Promise<{ caught: boolean; new: boolean; coins: number; coins_now: number; pin: { item_id: number; name: string; icon_url: string | null; set_id: number } }> {
  const { data } = await client.post(`/parks/${parkId}/pin-of-the-day/catch`, at, { skipBroadcasts: true } as object);
  return data.data;
}
