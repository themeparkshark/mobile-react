/**
 * What the sign-in card says when Sign in with Apple fails (WS8). Pure, so it
 * is unit tested (tools/tests/sign-in-errors.test.cjs).
 *
 * ERR_REQUEST_UNKNOWN is what iOS returns when no Apple Account is signed in
 * on the device (common on a fresh phone or simulator), so it gets a fix the
 * player can act on instead of "something went wrong".
 */
export type SignInErrorCopy = { readonly title: string; readonly message: string } | null;

export function signInErrorCopy(
  error: unknown,
  appleCompleted: boolean,
  fallback: { readonly title?: string; readonly message?: string } = {},
): SignInErrorCopy {
  const code = (error as { code?: unknown } | null)?.code;
  if (!appleCompleted && code === 'ERR_REQUEST_CANCELED') return null;
  if (appleCompleted) {
    return {
      title: "Couldn't sign in",
      message: 'Theme Park Shark sign-in is unavailable right now. Please check your connection and try again in a few minutes.',
    };
  }
  if (code === 'ERR_REQUEST_UNKNOWN' || code === 'ERR_REQUEST_NOT_HANDLED') {
    return {
      title: 'Sign in to an Apple Account',
      message: 'Open the Settings app, sign in to your Apple Account at the top, then come back and tap Sign in with Apple.',
    };
  }
  return {
    title: fallback.title || "Couldn't sign in",
    message: fallback.message || 'Please try again.',
  };
}
