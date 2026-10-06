/**
 * Account deletion flow for Settings (WS8, P0-5, App Review 5.1.1(v)).
 *
 * Pure orchestration with injected steps, so every path is unit tested
 * (tools/tests/settings-account.test.cjs):
 *   confirm sheet -> Apple re-confirm (for the grant revoke) -> DELETE now ->
 *   deleted | emailSent | failed | cancelled.
 *
 * Ship order: 'deleted' needs WS1's backend (mode=immediate). A server that
 * predates it answers 204 with no body after emailing a confirm link, so the
 * client reports 'emailSent' (check your email) instead of a false failure.
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
  /** Older server: it accepted the request and emailed a link that finishes the deletion. */
  | { readonly outcome: 'emailSent' }
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
    if (isEmailConfirmFallback(error)) return { outcome: 'emailSent' };
    return { outcome: 'failed', error };
  } finally {
    steps.setBusy?.(false);
  }
}

/**
 * deleteAccountNow (delete-account.ts) throws this when the request succeeded
 * (2xx) but the server did not confirm an immediate delete: the pre-WS1 server,
 * which answers 204 after emailing the confirm link. HTTP failures carry a
 * response or come from axios and stay 'failed'.
 */
export const UNCONFIRMED_DELETION_MESSAGE = 'Account deletion was not confirmed.';

export function isEmailConfirmFallback(error: unknown): boolean {
  const e = error as { message?: unknown; response?: unknown; isAxiosError?: unknown } | null;
  return !!e && e.message === UNCONFIRMED_DELETION_MESSAGE && e.response === undefined && e.isAxiosError !== true;
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
    'This deletes your shark, coins, collection, friends and progress forever. You can’t get them back. Apple may ask to check it’s you.',
  confirmLabel: 'Delete forever',
  keepLabel: 'Keep my account',
  busy: 'Deleting your account',
  doneTitle: 'Account deleted',
  doneMessage: 'Your account and game progress are deleted. Thanks for playing.',
  failTitle: "Couldn't delete your account",
  failMessage: `Nothing was deleted. Check your internet and tap Try again. Still stuck? Email ${SUPPORT_EMAIL}.`,
  retryLabel: 'Try again',
  emailTitle: 'Check your email',
  emailMessage: 'We sent a link to the email on your Apple Account. Tap it to finish deleting your account.',
  deactivateTitle: 'Pause your account?',
  deactivateMessage: 'Your shark takes a break. Sign in again any time to pick up where you left off.',
  deactivateLabel: 'Pause account',
  deactivateFailTitle: "Couldn't pause your account",
  deactivateFailMessage: 'Your account is still on. Check your internet and try again.',
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
