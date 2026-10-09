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

const OFF: RetentionFlags = { dailyThree: false, levelChests: false };
let cached: RetentionFlags | null = null;
let pending: Promise<RetentionFlags> | null = null;

export function loadRetentionFlags(read: typeof getFeatureFlags = getFeatureFlags): Promise<RetentionFlags> {
  if (cached) return Promise.resolve(cached);
  pending ??= read().then(payload => {
    cached = { dailyThree: payload.flags.daily_three === true, levelChests: payload.flags.level_chests === true };
    return cached;
  }).catch(() => { pending = null; return OFF; });
  return pending;
}

/** Tests only. */
export function resetRetentionFlagsForTests(): void {
  cached = null;
  pending = null;
}
