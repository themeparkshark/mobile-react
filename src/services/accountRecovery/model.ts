/**
 * Find my original account: the pure flow model (no React, unit tested in
 * tools/tests/account-recovery.test.cjs). The component renders whatever step
 * this returns; every decision about accounts is made by the server.
 *
 * Steps:
 *   identify  type the original username or email
 *   code      type the 6-digit code from the email (shown after any "sent")
 *   support   the app cannot finish it: Hide My Email from the original app,
 *             or this sign-in already has progress. Shows the player id to
 *             give support.
 *   linked    done; the app switches to the original account
 */
import type { RecoveryRequestResult, RecoveryVerifyResult } from '../../api/endpoints/me/account-recovery';

export type RecoveryStep = 'identify' | 'code' | 'support' | 'linked';

export type SupportReason = 'relay' | 'progress' | 'no_code' | 'other';

export type RecoveryState = {
  readonly step: RecoveryStep;
  /** Inline error or hint under the field, null when there is nothing to say. */
  readonly error: string | null;
  readonly supportReason: SupportReason | null;
  /** Shown on the linked step. */
  readonly screenName: string | null;
};

export const INITIAL_RECOVERY: RecoveryState = { step: 'identify', error: null, supportReason: null, screenName: null };

export const CODE_LENGTH = 6;

export const RECOVERY_COPY = {
  welcomeLink: 'Played before? Find my account',
  entryDetail: 'Find my original account',
  identifyTitle: 'Welcome back',
  identifyMessage: 'Played the original Theme Park Shark? Enter the username or email from your old account and we will email it a code.',
  identifyPlaceholder: 'Username or email',
  identifyButton: 'Send my code',
  codeTitle: 'Check your email',
  codeMessage: 'If that account has an email we can reach, a 6-digit code is on its way. It works for 15 minutes.',
  codeButton: 'Bring it back',
  noCode: 'No code?',
  differentAccount: 'Try another name',
  supportTitle: 'We can help',
  linkedTitle: 'Welcome back!',
  close: 'Not now',
  done: "Let's go",
  emailSupport: 'Email support',
} as const;

const SUPPORT_MESSAGES: Record<SupportReason, string> = {
  relay: 'Your original account used Apple\'s Hide My Email, so we cannot email it a code. Our team can move it for you.',
  progress: 'This sign-in already has its own progress, so we will not replace it here. Our team can move your original account for you.',
  no_code: 'No email after a few minutes? Your original account may have used Apple\'s Hide My Email. Our team can move it for you.',
  other: 'We could not finish this here. Our team can move your original account for you.',
};

/** The support step message, with the id the player gives support. */
export function supportMessage(reason: SupportReason, playerId: number | null | undefined): string {
  const id = typeof playerId === 'number' ? ` Send us your new player ID: #${playerId}.` : '';
  return `${SUPPORT_MESSAGES[reason]}${id}`;
}

/** Trimmed identifier, or an error to show. Usernames may be typed with a leading @. */
export function checkIdentifier(raw: string): { readonly value: string; readonly error: string | null } {
  const value = raw.trim();
  if (value.length < 2) return { value, error: 'Enter the username or email from your old account.' };
  if (value.length > 255) return { value, error: 'That is too long. Check it and try again.' };
  if (value.includes('@') && !value.startsWith('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { value, error: 'That email does not look right.' };
  }
  return { value, error: null };
}

/** Digits only, at most 6, so pasted codes like "123 456" work. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return normalizeCode(code).length === CODE_LENGTH;
}

function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`;
}

const OFFLINE = 'Could not reach Theme Park Shark. Check your connection and try again.';

export function afterRequest(state: RecoveryState, result: RecoveryRequestResult): RecoveryState {
  if (result.kind === 'rate_limited') return { ...state, error: waitText(result.retryAfter) };
  if (result.kind === 'failed') return { ...state, error: OFFLINE };
  switch (result.status) {
    case 'sent': return { ...state, step: 'code', error: null, supportReason: null };
    case 'support': return { ...state, step: 'support', error: null, supportReason: 'relay' };
    case 'has_progress': return { ...state, step: 'support', error: null, supportReason: 'progress' };
  }
}

export function afterVerify(state: RecoveryState, result: RecoveryVerifyResult): RecoveryState {
  switch (result.kind) {
    case 'linked': return { ...state, step: 'linked', error: null, screenName: result.screenName || null };
    case 'invalid_code': return { ...state, error: 'That code is not right. Check the email and try again.' };
    case 'expired_code': return { ...state, step: 'identify', error: 'That code expired. Send a new one.' };
    case 'no_active_code': return { ...state, step: 'identify', error: 'That code no longer works. Send a new one.' };
    case 'has_progress': return { ...state, step: 'support', error: null, supportReason: 'progress' };
    case 'needs_support': return { ...state, step: 'support', error: null, supportReason: 'other' };
    case 'rate_limited': return { ...state, error: waitText(result.retryAfter) };
    case 'failed': return { ...state, error: OFFLINE };
  }
}

/** "No code?" on the code step. */
export function noCode(state: RecoveryState): RecoveryState {
  return { ...state, step: 'support', error: null, supportReason: 'no_code' };
}

export function linkedMessage(screenName: string | null): string {
  return screenName
    ? `You're ${screenName} again. Your coins, collection and progress are back.`
    : 'Your original account is back, with all of its progress.';
}

/** mailto: for the support step, prefilled with the ids support needs. */
export function recoverySupportMailto(email: string, details: {
  readonly playerId?: number | null;
  readonly typedIdentifier?: string | null;
  readonly reason: SupportReason;
}): string {
  const lines = [
    'Hi! I played the original Theme Park Shark and want my old account back.',
    '',
    `My new player ID: ${typeof details.playerId === 'number' ? `#${details.playerId}` : 'unknown'}`,
    `My old username or email: ${details.typedIdentifier?.trim() || ''}`,
    '',
    'Anything else that shows the old account is mine (friends, parks, purchases):',
    '',
    `(reason: ${details.reason})`,
  ];
  return `mailto:${email}?subject=${encodeURIComponent('Bring back my original account')}&body=${encodeURIComponent(lines.join('\n'))}`;
}
