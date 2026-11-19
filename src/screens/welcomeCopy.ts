import { tryAgainWith } from '../services/connectionCopy';

/** The longest shark name (the server's rule too). */
export const NAME_MAX = 12;

type SaveError = { code?: string; response?: { status?: number; data?: { errors?: { username?: unknown }; message?: unknown } } } | null | undefined;

/**
 * T174: the one line Welcome shows when a name did not save. Always our own kid-readable words, never the
 * server's sentence. A busy or slow server says the game is slow (the name may still have saved: the
 * screen checks the player first, so a retry never says "taken" for the player's own name).
 */
export function welcomeSaveLine(error: unknown): string {
  const e = error as SaveError;
  const status = e?.response?.status;
  if (status === 422 || status === 409) {
    const raw = e?.response?.data?.errors?.username;
    const said = (Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '').toLowerCase();
    if (/taken|exists|unique|already/.test(said) || status === 409) return 'That name is taken. Try another, or tap the sparkle for a new one!';
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
