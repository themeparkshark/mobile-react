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
let pending: Promise<RetentionFlags | null> | null = null;

/** Null when the read failed (offline, slow server): the caller tries again on the next focus. */
export function loadRetentionFlags(read: typeof getFeatureFlags = getFeatureFlags): Promise<RetentionFlags | null> {
  if (cached) return Promise.resolve(cached);
  pending ??= read().then((payload): RetentionFlags | null => {
    cached = { dailyThree: payload.flags.daily_three === true, levelChests: payload.flags.level_chests === true };
    return cached;
  }).catch(() => { pending = null; return null; });
  return pending;
}

/**
 * A read that may still say "off" from before sign-in: the public flag read answers off for a player
 * whose preview the server turns on only once it knows who is asking. Moments that show a retention hook
 * (the park arrival's Daily 3, the recap's Tomorrow step) ask again once when the cache says off.
 */
export function loadRetentionFlagsFresh(read: typeof getFeatureFlags = getFeatureFlags): Promise<RetentionFlags | null> {
  if (cached && !cached.dailyThree && !refreshed) {
    refreshed = true;
    cached = null;
    pending = null;
  }
  return loadRetentionFlags(read);
}
let refreshed = false;

/** The flags read this app run, or null before the first read finished. */
export function retentionFlagsNow(): RetentionFlags | null {
  return cached;
}

/**
 * One flame number in the whole game: while Daily 3 is on, the flame (and the
 * words "day streak") mean the Daily 3 streak; otherwise the Daily Chest
 * streak. Null while the flags are unknown, so nothing shows a number that
 * could turn out to be the other one.
 */
export function streakOwner(flags: RetentionFlags | null): 'daily3' | 'chest' | null {
  if (!flags) return null;
  return flags.dailyThree ? 'daily3' : 'chest';
}

/** Tests only. */
export function resetRetentionFlagsForTests(): void {
  cached = null;
  pending = null;
  refreshed = false;
}
