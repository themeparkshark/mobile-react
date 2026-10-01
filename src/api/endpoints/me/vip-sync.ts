import client from '../../client';

export type VipSyncResult = {
  readonly subscribed: boolean;
  readonly synced: boolean;
  readonly expiresAt: string | null;
};

/**
 * POST /api/me/vip/sync with StoreKit 2 signed transactions (JWS). The server
 * verifies Apple's signature itself and answers with the player's VIP state;
 * nothing this client claims is trusted. Called after a purchase, a restore and
 * on every launch (current entitlements), so renewals and expiry land without
 * webhooks.
 *
 * Rejects with the axios error on 409 VIP_OWNED_BY_OTHER_PLAYER (the Apple
 * subscription belongs to another account) and 422 VIP_TRANSACTION_INVALID.
 */
export default async function syncVip(signedTransactions: readonly string[] = []): Promise<VipSyncResult> {
  const body = signedTransactions.length ? { signed_transactions: signedTransactions.slice(0, 5) } : undefined;
  const { data } = await client.post<{ data: { subscribed?: unknown; synced?: unknown; expires_at?: unknown } }>(
    '/me/vip/sync', body, { timeout: 15000 },
  );
  const result = data?.data;
  if (typeof result?.subscribed !== 'boolean') {
    throw new Error('VIP sync response was malformed.');
  }
  return {
    subscribed: result.subscribed,
    synced: result.synced === true,
    expiresAt: typeof result.expires_at === 'string' ? result.expires_at : null,
  };
}

/** The server's error code on a failed sync, if it sent one. */
export function vipSyncErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}
