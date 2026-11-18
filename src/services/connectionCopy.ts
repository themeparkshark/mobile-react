import { connectionState } from './connectivity';

/**
 * The words for a call that did not finish (T172). The game only says to check
 * the internet when the phone really is offline (two calls in a row got no
 * answer). A slow or busy server is the game's problem, never the player's:
 * it says the game is slow right now. Read at the moment of the failure, so
 * the words match what really happened.
 */
export const SLOW_LINE = 'The game is slow right now. Try again.';
export const OFFLINE_LINE = 'Check your internet and try again.';
/** While loading runs long. */
export const SLOW_LOADING_LINE = 'The game is slow right now. Hang tight.';

type Failure = { code?: string; message?: string; response?: { status?: number } } | null | undefined;

/** True only when the failure itself had no answer and the app is offline. */
function offlineNow(error?: unknown): boolean {
  if (connectionState() !== 'offline') return false;
  const e = error as Failure;
  const status = e?.response?.status;
  // The server answered (a 5xx, a 429): not the player's internet, whatever the banner says.
  return !(typeof status === 'number' && status > 0);
}

/** "Check your internet and try again." only when offline; otherwise "The game is slow right now. Try again." */
export function tryAgainLine(error?: unknown): string {
  return offlineNow(error) ? OFFLINE_LINE : SLOW_LINE;
}

/** Same choice with a custom offline ending, e.g. "tap Let's Go again". */
export function tryAgainWith(action: string, error?: unknown): string {
  return offlineNow(error) ? `Check your internet and ${action}.` : `The game is slow right now. ${action.charAt(0).toUpperCase()}${action.slice(1)}.`;
}
