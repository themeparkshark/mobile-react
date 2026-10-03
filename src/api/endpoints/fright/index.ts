import client from '../../client';
import type {
  FrightActionResult, FrightCard, FrightCardSummary, FrightLifetime, FrightReaction, FrightRecap, FrightSide, FrightTonight,
} from './types';

export * from './types';

/** Tonight's Fin-ister Nights state at a park. Never throws: null means "no event" (older server, offline). */
export async function getFrightTonight(parkId: number): Promise<{ tonight: FrightTonight; receivedAt: number; sentAt: number } | null> {
  const sentAt = Date.now();
  try {
    const { data } = await client.get<{ data: FrightTonight | null }>(`/parks/${parkId}/fright`);
    const tonight = data?.data;
    if (!tonight || typeof tonight.phase !== 'string' || !Array.isArray(tonight.spots)) return null;
    return { tonight, receivedAt: Date.now(), sentAt };
  } catch {
    return null;
  }
}

export interface FrightFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number | null;
  /** ISO time of the fix (phone clock corrected by the server offset). */
  readonly at: string;
}

async function act(path: string, body: Record<string, unknown>): Promise<FrightActionResult> {
  try {
    const { data } = await client.post<FrightActionResult>(path, body);
    return data ?? { ok: false };
  } catch (error: any) {
    const payload = error?.response?.data;
    if (payload && typeof payload === 'object' && 'ok' in payload) return payload as FrightActionResult;
    return { ok: false };
  }
}

export const enterFrightSpot = (key: string, fix: FrightFix) => act(`/fright/spots/${encodeURIComponent(key)}/enter`, { ...fix });
export const finishFrightSpot = (key: string, fix: Partial<FrightFix> & { at: string; method?: 'gps' | 'open' | 'button' }) =>
  act(`/fright/spots/${encodeURIComponent(key)}/done`, { ...fix });
export const findFrightSpot = (key: string, fixes: readonly FrightFix[], side?: FrightSide | null) =>
  act(`/fright/spots/${encodeURIComponent(key)}/found`, { fixes, side: side ?? undefined });
export const scoreFrightSpot = (key: string, score: number, reaction?: FrightReaction | null) =>
  act(`/fright/spots/${encodeURIComponent(key)}/score`, { score, reaction: reaction ?? undefined });
export const markFrightRecapSeen = (eventSlug: string, nightOn: string) =>
  act(`/fright/recap/${encodeURIComponent(eventSlug)}/${nightOn}/seen`, {});

/** Tutorial / coach-mark seen flag, per player per season (`key` in FRIGHT_SEEN_KEYS). */
export const markFrightSeen = (eventSlug: string, key: string) =>
  act(`/fright/events/${encodeURIComponent(eventSlug)}/seen`, { key });

export async function getFrightCards(playerId?: number | null): Promise<{ cards: FrightCardSummary[]; lifetime: FrightLifetime } | null> {
  try {
    const { data } = await client.get<{ data: FrightCardSummary[]; lifetime: FrightLifetime }>('/fright/cards',
      { params: playerId ? { player_id: playerId } : undefined });
    return Array.isArray(data?.data) ? { cards: data.data, lifetime: data.lifetime } : null;
  } catch {
    return null;
  }
}

export async function getFrightCard(eventSlug: string, playerId?: number | null): Promise<FrightCard | null> {
  try {
    const { data } = await client.get<{ data: FrightCard }>(`/fright/cards/${encodeURIComponent(eventSlug)}`,
      { params: playerId ? { player_id: playerId } : undefined });
    return data?.data ?? null;
  } catch {
    return null;
  }
}

export async function getFrightRecap(eventSlug: string, nightOn: string, playerId?: number | null): Promise<FrightRecap | null> {
  try {
    const { data } = await client.get<{ data: FrightRecap }>(`/fright/recap/${encodeURIComponent(eventSlug)}/${nightOn}`,
      { params: playerId ? { player_id: playerId } : undefined });
    return data?.data ?? null;
  } catch {
    return null;
  }
}
