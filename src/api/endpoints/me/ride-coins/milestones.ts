import api from '../../../api';

export type CollectionMilestoneType = 'first_park_coin' | 'park_percent' | 'park_complete';

export interface CollectionMilestone {
  readonly type: CollectionMilestoneType;
  readonly park_id: number;
  readonly percent?: number;
}

/** What a confirmed ride win did for its park shelf. Numbers only; the app writes the copy. */
export interface CollectionMilestones {
  readonly milestones: readonly CollectionMilestone[];
  readonly progress: {
    readonly park_id: number;
    readonly park_name: string;
    readonly before: number;
    readonly collected: number;
    readonly available: number;
  } | null;
  readonly next: { readonly percent: number; readonly coins_needed: number } | null;
}

/** GET /me/collection/milestones/{attemptId} (read only, idempotent). */
export default async function getCollectionMilestones(attemptId: number, timeoutMs = 6_000): Promise<CollectionMilestones> {
  const response = await api.get(`/me/collection/milestones/${attemptId}`, { timeout: timeoutMs });
  return response.data.collection_milestones;
}
