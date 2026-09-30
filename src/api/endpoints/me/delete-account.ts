import client from '../../client';
import { appVersionHeaders } from '../../platform';

export type AccountDeletionResult = {
  readonly deleted: true;
  /** The server queued a revoke of the app's Sign in with Apple grant. */
  readonly appleRevokeQueued: boolean;
  /** Set for VIP players: Apple keeps billing until they cancel. Show it before signing out. */
  readonly subscriptionNotice: string | null;
};

/**
 * DELETE /api/me/force-delete with mode "immediate": permanently deletes the
 * signed-in account right away (App Review 5.1.1(v)). Call it only from the
 * Settings confirm sheet that tells the player the account is gone, never from
 * UI that says "check your email": without mode the server keeps the old
 * email-confirm flow (force-delete.ts), which is what shipped builds show.
 *
 * Pass a fresh Sign in with Apple authorizationCode when available so the
 * server can revoke the app's Apple grant. Rejects on any HTTP failure, or when
 * the server did not confirm the deletion, so the UI can show an error and keep
 * the player signed in.
 */
export default async function deleteAccountNow(authorizationCode?: string | null): Promise<AccountDeletionResult> {
  const body: Record<string, string> = { mode: 'immediate' };
  if (authorizationCode) body.authorization_code = authorizationCode;

  const { data } = await client.delete<{
    data?: { deleted?: boolean; apple_revoke_queued?: boolean; subscription_notice?: string | null };
  }>('/me/force-delete', { data: body, headers: appVersionHeaders(), timeout: 15000 });

  const result = data?.data;
  if (result?.deleted !== true) {
    throw new Error('Account deletion was not confirmed.');
  }
  const notice = typeof result.subscription_notice === 'string' ? result.subscription_notice.trim() : '';
  return {
    deleted: true,
    appleRevokeQueued: result.apple_revoke_queued === true,
    subscriptionNotice: notice || null,
  };
}
