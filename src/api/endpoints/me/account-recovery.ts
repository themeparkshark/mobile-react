import client from '../../client';

/**
 * Find my original account (docs/platform/ACCOUNT_RECOVERY.md in the backend).
 * The server is the authority: it decides whether a code is sent, checks it,
 * and moves this sign-in onto the original account. These calls only report
 * what it said, so the flow model (src/services/accountRecovery) can pick the
 * next step.
 */

export type RecoveryRequestStatus = 'sent' | 'support' | 'has_progress';

export type RecoveryRequestResult =
  | { readonly kind: 'status'; readonly status: RecoveryRequestStatus }
  | { readonly kind: 'rate_limited'; readonly retryAfter: number }
  | { readonly kind: 'failed' };

export type RecoveryVerifyResult =
  | { readonly kind: 'linked'; readonly token: string; readonly playerId: number; readonly screenName: string }
  | { readonly kind: 'invalid_code' | 'expired_code' | 'no_active_code' | 'has_progress' | 'needs_support' }
  | { readonly kind: 'rate_limited'; readonly retryAfter: number }
  | { readonly kind: 'failed' };

const REQUEST_STATUSES: readonly RecoveryRequestStatus[] = ['sent', 'support', 'has_progress'];

const VERIFY_CODES: Record<string, Exclude<RecoveryVerifyResult['kind'], 'linked' | 'rate_limited' | 'failed'>> = {
  INVALID_CODE: 'invalid_code',
  EXPIRED_CODE: 'expired_code',
  NO_ACTIVE_CODE: 'no_active_code',
  HAS_PROGRESS: 'has_progress',
  NEEDS_SUPPORT: 'needs_support',
};

function retryAfter(error: any): number {
  const value = Number(error?.response?.data?.retry_after ?? error?.response?.headers?.['retry-after']);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 900;
}

/** POST /me/account-recovery/request. Never throws. */
export async function requestRecoveryCode(identifier: string): Promise<RecoveryRequestResult> {
  try {
    const { data } = await client.post<{ data?: { status?: string } }>(
      '/me/account-recovery/request', { identifier }, { timeout: 15000 });
    const status = data?.data?.status as RecoveryRequestStatus | undefined;
    return status && REQUEST_STATUSES.includes(status) ? { kind: 'status', status } : { kind: 'failed' };
  } catch (error: any) {
    if (error?.response?.status === 429) return { kind: 'rate_limited', retryAfter: retryAfter(error) };
    return { kind: 'failed' };
  }
}

/** POST /me/account-recovery/verify. Never throws. */
export async function verifyRecoveryCode(code: string): Promise<RecoveryVerifyResult> {
  try {
    const { data } = await client.post<{
      data?: { status?: string; player?: { id?: number; screen_name?: string; token?: string } };
    }>('/me/account-recovery/verify', { code }, { timeout: 20000 });
    const player = data?.data?.player;
    if (data?.data?.status === 'linked' && typeof player?.token === 'string' && player.token.trim() && typeof player.id === 'number') {
      return { kind: 'linked', token: player.token, playerId: player.id, screenName: String(player.screen_name ?? '') };
    }
    return { kind: 'failed' };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 429) return { kind: 'rate_limited', retryAfter: retryAfter(error) };
    const kind = VERIFY_CODES[String(error?.response?.data?.code ?? '')];
    if ((status === 422 || status === 409) && kind) return { kind };
    return { kind: 'failed' };
  }
}
