/**
 * Account deletion flow for Settings (WS8, P0-5, App Review 5.1.1(v)).
 *
 * Pure orchestration with injected steps, so every path is unit tested
 * (tools/tests/settings-account.test.cjs):
 *   confirm sheet -> Apple re-confirm (for the grant revoke) -> DELETE now ->
 *   deleted | failed | cancelled.
 * Nothing is deleted unless the player confirmed, and a failure never signs
 * the player out, so they can try again.
 */

export type DeletionResult = {
  readonly deleted: true;
  readonly appleRevokeQueued: boolean;
  readonly subscriptionNotice: string | null;
};

export type AppleReconfirm =
  | { readonly kind: 'code'; readonly code: string }
  /** Apple sign-in is unavailable here (no Apple Account, simulator). Delete anyway, without the revoke code. */
  | { readonly kind: 'unavailable' }
  /** The player closed the Apple sheet: they changed their mind. */
  | { readonly kind: 'cancelled' };

export type DeletionOutcome =
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'deleted'; readonly result: DeletionResult }
  | { readonly outcome: 'failed'; readonly error: unknown };

export type DeletionSteps = {
  readonly confirm: () => Promise<boolean>;
  readonly reconfirmWithApple: () => Promise<AppleReconfirm>;
  readonly deleteNow: (authorizationCode?: string | null) => Promise<DeletionResult>;
  readonly setBusy?: (busy: boolean) => void;
};

export async function runAccountDeletion(steps: DeletionSteps): Promise<DeletionOutcome> {
  if (!(await steps.confirm())) return { outcome: 'cancelled' };
  let apple: AppleReconfirm;
  try {
    apple = await steps.reconfirmWithApple();
  } catch {
    apple = { kind: 'unavailable' };
  }
  if (apple.kind === 'cancelled') return { outcome: 'cancelled' };
  steps.setBusy?.(true);
  try {
    const result = await steps.deleteNow(apple.kind === 'code' ? apple.code : null);
    return { outcome: 'deleted', result };
  } catch (error) {
    return { outcome: 'failed', error };
  } finally {
    steps.setBusy?.(false);
  }
}

/** Map an expo-apple-authentication error to a re-confirm answer. */
export function appleReconfirmFromError(error: unknown): AppleReconfirm {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ERR_REQUEST_CANCELED' ? { kind: 'cancelled' } : { kind: 'unavailable' };
}

export const SUPPORT_EMAIL = 'contact@themeparkshark.com';

export const DELETION_COPY = {
  confirmTitle: 'Delete your account?',
  confirmMessage:
    'This permanently deletes your shark, coins, collection, friends and progress. It cannot be undone. Apple may ask you to confirm it is you.',
  confirmLabel: 'Delete forever',
  keepLabel: 'Keep my account',
  busy: 'Deleting your account',
  doneTitle: 'Account deleted',
  doneMessage: 'Your account and all of your game progress have been permanently deleted. Thanks for playing.',
  failTitle: "Couldn't delete your account",
  failMessage: `Nothing was deleted. Check your connection and try again. If it keeps happening, email ${SUPPORT_EMAIL}.`,
  retryLabel: 'Try again',
  deactivateTitle: 'Deactivate your account?',
  deactivateMessage: 'Your shark takes a break. Sign in again any time to pick up where you left off.',
  deactivateLabel: 'Deactivate',
  deactivateFailTitle: "Couldn't deactivate",
  deactivateFailMessage: 'Your account is still active. Check your connection and try again.',
} as const;

/** The success message, with the server's VIP billing notice when there is one. */
export function deletionDoneMessage(result: Pick<DeletionResult, 'subscriptionNotice'>): string {
  const notice = result.subscriptionNotice?.trim();
  return notice ? `${DELETION_COPY.doneMessage}\n\n${notice}` : DELETION_COPY.doneMessage;
}

/** mailto: link for the Help and bug rows. */
export function supportMailto(kind: 'help' | 'bug', details: {
  readonly appVersion?: string | null;
  readonly osVersion?: string | number | null;
  readonly playerId?: number | null;
} = {}): string {
  const subject = kind === 'bug' ? 'Bug report' : 'Theme Park Shark help';
  const lines = kind === 'bug'
    ? ['What happened?', '', 'What did you expect?', '', '']
    : ['How can we help?', '', ''];
  const facts = [
    details.appVersion ? `App version: ${details.appVersion}` : null,
    details.osVersion != null && details.osVersion !== '' ? `iOS: ${details.osVersion}` : null,
    details.playerId ? `Player ID: ${details.playerId}` : null,
  ].filter(Boolean) as string[];
  const body = [...lines, ...facts].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
