import client from '../../client';

export type VipSyncResult = { readonly subscribed: boolean; readonly synced: boolean };

/**
 * POST /api/me/vip/sync: asks the server to check VIP with Adapty directly, the
 * fallback for a late or missed webhook. Call after a purchase or restore. The
 * answer always comes from Adapty on the server, never from this client.
 * Rejects on 503 VIP_SYNC_UNAVAILABLE; keep the current VIP state then.
 */
export default async function syncVip(): Promise<VipSyncResult> {
  const { data } = await client.post<{ data: VipSyncResult }>('/me/vip/sync', undefined, { timeout: 15000 });
  const result = data?.data;
  if (typeof result?.subscribed !== 'boolean') {
    throw new Error('VIP sync response was malformed.');
  }
  return { subscribed: result.subscribed, synced: result.synced === true };
}
