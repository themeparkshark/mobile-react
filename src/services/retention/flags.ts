import getFeatureFlags from '../../api/endpoints/platform/feature-flags';

/**
 * Retention switches from GET /feature-flags, read once per app run. Absent
 * flags (every server before the retention release) read as off, so this
 * build shows nothing new until the server turns each one on.
 */
export interface RetentionFlags {
  readonly dailyThree: boolean;
  readonly levelChests: boolean;
  /** Every switch the server sent this player (the reward rungs read theirs from here). */
  readonly all?: Readonly<Record<string, boolean>>;
}

/** One switch by its server name; absent reads as off. */
export function flagOn(flags: RetentionFlags | null | undefined, name: string): boolean {
  return flags?.all?.[name] === true;
}

let cached: RetentionFlags | null = null;
let pending: Promise<RetentionFlags | null> | null = null;

/** Null when the read failed (offline, slow server): the caller tries again on the next focus. */
export function loadRetentionFlags(read: typeof getFeatureFlags = getFeatureFlags): Promise<RetentionFlags | null> {
  if (cached) return Promise.resolve(cached);
  pending ??= read().then((payload): RetentionFlags | null => {
    const all: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(payload.flags ?? {})) if (typeof v === 'boolean') all[k] = v;
    cached = { dailyThree: payload.flags.daily_three === true, levelChests: payload.flags.level_chests === true, all };
    return cached;
  }).catch(() => { pending = null; return null; });
  return pending;
}

/** The flags read this app run, or null before the first read finished. */
export function retentionFlagsNow(): RetentionFlags | null {
  return cached;
}

/**
 * One flame number in the whole game (core loop blueprint 4.5): the flame is
 * the Daily 3 streak and nothing else. The daily chest says "Day N of 7" on its
 * ladder and never shows a streak, so with Daily 3 off there is no flame at
 * all (never a second number that disagrees). Null while the flags are unknown
 * or Daily 3 is off.
 */
export function streakOwner(flags: RetentionFlags | null): 'daily3' | null {
  if (!flags) return null;
  return flags.dailyThree ? 'daily3' : null;
}

/** Tests only. */
export function resetRetentionFlagsForTests(): void {
  cached = null;
  pending = null;
}
