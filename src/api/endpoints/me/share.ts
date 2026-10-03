import client from '../../client';

/** One share-funnel step. No player id, name or content: the server stores daily counts only. */
export interface ShareEventBody {
  readonly kind: string;
  readonly surface: string;
  readonly format: 'story' | 'square';
  readonly action: 'opened' | 'shared' | 'dismissed' | 'failed';
  /** iOS share-sheet destination (e.g. com.burbn.instagram.shareextension). */
  readonly activity?: string | null;
  readonly rarity?: number | null;
}

export async function postShareEvent(body: ShareEventBody): Promise<void> {
  await client.post('/me/share-events', body);
}

/** 0..1 share of active players who own this, or null (small population, unknown kind, old server). */
export async function getFlexRarity(kind: string, ref: string | number): Promise<number | null> {
  try {
    const { data } = await client.get<{ data: { owned_pct: number | null } }>('/me/flex/rarity', { params: { kind, ref } });
    const pct = data?.data?.owned_pct;
    return typeof pct === 'number' && Number.isFinite(pct) ? pct : null;
  } catch {
    return null;
  }
}
