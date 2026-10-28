/**
 * Finn's lessons are saved per account (core loop blueprint 5.11, must-fix 32): a second shark
 * on a family phone still meets Finn. Pure storage rules, so they are tested without the app.
 *
 * - Each player has their own record: `@tps_tutorial_completed@p<id>`.
 * - The old phone-wide record (`@tps_tutorial_completed`) belonged to whoever used this phone
 *   before this build. The first account to sign in adopts it once (and is written down as its
 *   owner); any other account starts fresh, so a sibling is never skipped past Finn.
 * - The veteran rule stays in the provider: an account with play history gets every lesson done.
 */
import type { TutorialSequence } from './types';

export const LEGACY_TUTORIAL_KEY = '@tps_tutorial_completed';
export const LEGACY_TUTORIAL_OWNER_KEY = '@tps_tutorial_completed_owner';

export interface TutorialStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

/** Where one player's finished lessons live. Signed out: nothing is read or written. */
export function tutorialKey(playerId: number | null | undefined): string | null {
  return typeof playerId === 'number' && Number.isFinite(playerId) && playerId > 0 ? `${LEGACY_TUTORIAL_KEY}@p${playerId}` : null;
}

/** A saved list, read safely. Players who already saw the park guide skip the later arrival lesson. */
export function parseCompleted(data: string | null | undefined): Set<TutorialSequence> | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return null;
    const completed = new Set(parsed.filter((item): item is TutorialSequence => typeof item === 'string'));
    if (completed.has('park')) completed.add('park_arrival');
    return completed;
  } catch {
    return null;
  }
}

/**
 * This player's finished lessons. `fresh` is true when the player has no record of their own yet
 * (the provider then applies the veteran rule).
 */
export async function loadCompleted(storage: TutorialStorage, playerId: number | null | undefined):
  Promise<{ completed: Set<TutorialSequence>; fresh: boolean }> {
  const key = tutorialKey(playerId);
  if (!key) return { completed: new Set(), fresh: false };
  const own = parseCompleted(await storage.getItem(key).catch(() => null));
  if (own) return { completed: own, fresh: false };
  // No record of their own: the phone's old record goes to the first account only.
  const [legacy, owner] = await Promise.all([
    storage.getItem(LEGACY_TUTORIAL_KEY).catch(() => null),
    storage.getItem(LEGACY_TUTORIAL_OWNER_KEY).catch(() => null),
  ]);
  const adopted = parseCompleted(legacy);
  if (adopted && (owner === null || owner === String(playerId))) {
    await storage.setItem(LEGACY_TUTORIAL_OWNER_KEY, String(playerId)).catch(() => undefined);
    await storage.setItem(key, JSON.stringify(Array.from(adopted))).catch(() => undefined);
    return { completed: adopted, fresh: false };
  }
  return { completed: new Set(), fresh: true };
}
