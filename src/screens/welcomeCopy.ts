import { tryAgainWith } from '../services/connectionCopy';

/** The longest shark name (the server's rule too). */
export const NAME_MAX = 12;

type SaveError = { code?: string; response?: { status?: number; data?: { errors?: { username?: unknown }; message?: unknown } } } | null | undefined;

/**
 * T174: the one line Welcome shows when a name did not save. Always our own kid-readable words, never the
 * server's sentence. A busy or slow server says the game is slow (the name may still have saved: the
 * screen checks the player first, so a retry never says "taken" for the player's own name).
 */
/** The one line for a name someone else already has (the check before the tap and the save say the same). */
export const NAME_TAKEN_LINE = 'That name is taken. Try another, or tap the sparkle for a new one!';

/**
 * Fix w4 T174: the name check before LET'S GO. Taken only when the server says it is not free and not
 * this player's own; an unknown answer (null) never blocks the save.
 */
export function nameTaken(check: { available: boolean; yours: boolean } | null | undefined): boolean {
  return !!check && !check.available && !check.yours;
}

export function welcomeSaveLine(error: unknown): string {
  const e = error as SaveError;
  const status = e?.response?.status;
  if (status === 422 || status === 409) {
    const raw = e?.response?.data?.errors?.username;
    const said = (Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '').toLowerCase();
    if (/taken|exists|unique|already/.test(said) || status === 409) return NAME_TAKEN_LINE;
    if (/at least|too short|min/.test(said)) return '4 to 12 letters or numbers';
    if (/may not be greater|too long|max/.test(said)) return `${NAME_MAX} letters is the most`;
    return 'Pick a different name, or tap the sparkle for a new one!';
  }
  return tryAgainWith('tap Let’s Go again', error);
}

/** The first answer was late but the name is on the player now: it saved. */
export function nameSaved(saved: string | null | undefined, name: string): boolean {
  return !!saved && saved.trim().toLowerCase() === name.trim().toLowerCase();
}
