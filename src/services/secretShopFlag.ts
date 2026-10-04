import getFeatureFlags from '../api/endpoints/platform/feature-flags';

/**
 * `secret_shop_v2` from GET /feature-flags (secret-shop/DESIGN.md 8.3). Off
 * unless the server sends true: an absent flag, an error or an old server all
 * keep today's Secret Store. Cached for 5 minutes so a server flip lands
 * without an app restart. The server enforces the same flag on every route,
 * so this only decides which screen to draw.
 */
const TTL_MS = 5 * 60_000;
let cached: { on: boolean; at: number } | null = null;
let pending: Promise<boolean> | null = null;

export function loadSecretShopFlag(read: typeof getFeatureFlags = getFeatureFlags, now: () => number = Date.now): Promise<boolean> {
  if (cached && now() - cached.at < TTL_MS) return Promise.resolve(cached.on);
  pending ??= read().then(payload => {
    cached = { on: payload?.flags?.secret_shop_v2 === true, at: now() };
    return cached.on;
  }).catch(() => false).finally(() => { pending = null; });
  return pending;
}

/** The last known value (false before the first answer). */
export function secretShopFlagNow(): boolean {
  return cached?.on ?? false;
}

/** Tests only. */
export function resetSecretShopFlagForTests(): void {
  cached = null;
  pending = null;
}
