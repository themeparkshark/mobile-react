import getFeatureFlags from '../../api/endpoints/platform/feature-flags';

/**
 * Retention switches from GET /feature-flags, read once per app run. Absent
 * flags (every server before the retention release) read as off, so this
 * build shows nothing new until the server turns each one on.
 */
export interface RetentionFlags {
  readonly dailyThree: boolean;
  readonly levelChests: boolean;
}

let cached: RetentionFlags | null = null;
let cachedFor = '';
let cachedAt = 0;
let pending: Promise<RetentionFlags | null> | null = null;
let pendingFor = '';

/** An all-off answer is re-read after this long (the server caches flags for 60 s). */
export const OFF_RECHECK_MS = 60_000;

/**
 * Null when the read failed (offline, slow server): the caller tries again on the next focus.
 * `who` is the signed-in player: preview flags are per player, so an answer read before
 * sign-in (always off) never sticks to the player, and an all-off answer is re-read after a minute.
 */
export function loadRetentionFlags(read: typeof getFeatureFlags = getFeatureFlags, who: string | number = '', now: number = Date.now()):
  Promise<RetentionFlags | null> {
  const key = String(who);
  if (cached && cachedFor === key && (cached.dailyThree || cached.levelChests || now - cachedAt < OFF_RECHECK_MS)) {
    return Promise.resolve(cached);
  }
  // A read still in flight for another player (the signed-out read at launch) never answers for this one.
  if (pending && pendingFor === key) return pending;
  pendingFor = key;
  const mine: Promise<RetentionFlags | null> = read(key || undefined).then((payload): RetentionFlags | null => {
    const next = { dailyThree: payload.flags.daily_three === true, levelChests: payload.flags.level_chests === true };
    if (pending === mine) { pending = null; }
    if (pendingFor === key) { cached = next; cachedFor = key; cachedAt = now; }
    return next;
  }).catch(() => { if (pending === mine) pending = null; return null; });
  pending = mine;
  return mine;
}

/** Tests only. */
export function resetRetentionFlagsForTests(): void {
  cached = null;
  cachedFor = '';
  cachedAt = 0;
  pending = null;
  pendingFor = '';
}
