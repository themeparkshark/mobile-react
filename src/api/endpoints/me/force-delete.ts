import client from '../../client';

export type AccountDeletionResult = {
  readonly deleted: boolean;
  readonly appleAccessRevoked: boolean;
  /** Set for VIP players: Apple keeps billing until they cancel. Show it before signing out. */
  readonly subscriptionNotice: string | null;
};

/**
 * DELETE /api/me/force-delete permanently deletes the signed-in account right
 * away (App Review 5.1.1(v)); the app shows its confirm sheet first. Pass a fresh
 * Sign in with Apple authorizationCode when available so the server can revoke
 * the app's Apple grant. Rejects on any HTTP failure so the UI can show an error.
 */
export default async function forceDeletePlayer(authorizationCode?: string | null): Promise<AccountDeletionResult> {
  const body = authorizationCode ? { authorization_code: authorizationCode } : undefined;
  const { data } = await client.delete<{
    data?: { deleted?: boolean; apple_access_revoked?: boolean; subscription_notice?: string | null };
  }>('/me/force-delete', { data: body, timeout: 20000 });
  const result = data?.data;
  if (result?.deleted !== true) {
    throw new Error('Account deletion was not confirmed.');
  }
  const notice = typeof result.subscription_notice === 'string' ? result.subscription_notice.trim() : '';
  return {
    deleted: true,
    appleAccessRevoked: result.apple_access_revoked === true,
    subscriptionNotice: notice || null,
  };
}
